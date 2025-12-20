/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 *                                                                    *
 * This program is free software; you can redistribute it and/or      *
 * modify it under the terms of the GNU General Public License        *
 * as published by the Free Software Foundation; either               *
 * version 2 of the License, or (at your option) any later            *
 * version.                                                           *
 *                                                                    *
 * This program is distributed in the hope that it will be useful,    *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of     *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the      *
 * GNU General Public License for more details.                       *
 *                                                                    *
 * You should have received a copy of the GNU General Public License  *
 * along with this program; if not, write to the Free Software        *
 * Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.          *
 **********************************************************************/
#define _GNU_SOURCE
#include <config.h>

#include <sys/socket.h>
#include <netdb.h>
#include <errno.h>
#include <netinet/tcp.h> /* TCP_NODELAY */
#include <sys/un.h>
#include <arpa/inet.h> /* inet_ntop, INET_ADDRSTRLEN */

#ifdef WITH_SELINUX
#include <selinux/selinux.h>
#endif

#include <settings.h>

#include <unilib/output.h>
#include <unilib/xmalloc.h>

static uint16_t lbind=BINDPORT_START;

static void accept_timeout(int ); /* signal handler */
static int accept_timedout=0;

static int socktrans_strtosin (const char * /* uri */, struct sockaddr_in *);
static int socktrans_strtopath(const char * /* uri */, struct sockaddr_un *);

static int socktrans_makeinetsock(int /* family */, int /* bind port */);
static int socktrans_makeunixsock(void);

int socktrans_connect(const char *uri) {
	int rsock=0;
	struct sockaddr_in c_sin;
	struct sockaddr_un c_sun;

	DBG(M_SCK, "creating client socket to `%s'", uri);

	if (socktrans_strtosin(uri, &c_sin) == 1) {

		if ((rsock=socktrans_makeinetsock(AF_INET, lbind)) < 0) {
			return -1;
		}
		lbind++;

		if (connect(rsock, (struct sockaddr *)&c_sin, (socklen_t)sizeof(c_sin)) < 0) {
			if (errno == ECONNREFUSED) {
				usleep(s->conn_delay);
				s->conn_delay *= 2;

				return -1;
			}
			ERR("inet connect fails: %s", strerror(errno));
			return -1;
		}
	}
	else if (socktrans_strtopath(uri, &c_sun) == 1) {

		if ((rsock=socktrans_makeunixsock()) < 0) {
			return -1;
		}

		if (connect(rsock, (struct sockaddr *)&c_sun, (socklen_t)sizeof(c_sun)) < 0) {
			if (errno == ECONNREFUSED) {
				usleep(s->conn_delay);
				s->conn_delay *= 2;

				return -1;
			}
			PANIC("unix connect fails: %s", strerror(errno));
		}
	}

	return rsock;
}

int socktrans_bind(const char *uri) {
	int s_sock=-1;
	struct sockaddr_in bsin;
	struct sockaddr_un bsun;
	char addr_str[INET_ADDRSTRLEN];

	assert(uri != NULL);

	if (socktrans_strtosin(uri, &bsin) == 1) {

		if ((s_sock=socktrans_makeinetsock(AF_INET, 0)) < 0) {
			return -1;
		}

		if (bind(s_sock, (const struct sockaddr *)&bsin, (socklen_t)sizeof(bsin)) == -1) {
			inet_ntop(AF_INET, &bsin.sin_addr, addr_str, sizeof(addr_str));
			ERR("bind() port %u addr %s fails: %s", ntohs(bsin.sin_port), addr_str, strerror(errno));
			return -1;
		}
	}
	else if (socktrans_strtopath(uri, &bsun) == 1) {
		struct stat sb;

		if ((s_sock=socktrans_makeunixsock()) < 0) {
			return -1;
		}

		if (stat(bsun.sun_path, &sb) == 0) {
			DBG(M_SCK, "sun path %s", bsun.sun_path);

			unlink(bsun.sun_path);
		}

		if (bind(s_sock, (const struct sockaddr *)&bsun, (socklen_t)sizeof(bsun)) == -1) {
			ERR("bind() path `%s' fails: %s", bsun.sun_path, strerror(errno));
			return -1;
		}
	}

	return s_sock;
}

int socktrans_accept(int bsock, int timeout) {
	int cli_fd=-1;
	union {
		struct sockaddr_in i;
		struct sockaddr_un u;
		struct sockaddr sa;
	} s_u;
	socklen_t sin_len=0;
	struct sigaction timeoutsa, sasave;

	sin_len=sizeof(s_u);

	if (listen(bsock, 1) < 0) {
		ERR("listen fails: %s", strerror(errno));
		return -1;
	}

	timeoutsa.sa_handler=&accept_timeout;
	sigemptyset(&timeoutsa.sa_mask);
	timeoutsa.sa_flags=0;

	if (sigaction(SIGALRM, &timeoutsa, &sasave) < 0) {
		ERR("cant register SIGALRM timeout handler: %s", strerror(errno));
		return -1;
	}

	accept_timedout=0;

	/* XXX setitimer */
	alarm(timeout);

doover:
	cli_fd=accept(bsock, &s_u.sa, &sin_len);
	if (! accept_timedout && errno == EINTR && cli_fd < 0) {
		DBG(M_SCK, "accept got EINTR, restarting fd is %d\n", cli_fd);
		goto doover;
	}
	else if (accept_timedout) {
		return -1;
	}

	alarm(0);

	if (sigaction(SIGALRM, &sasave, NULL) < 0) {
		ERR("cant restore SIGALRM handler: %s", strerror(errno));
		return -1;
	}

	if (s_u.sa.sa_family == AF_UNIX) {
#if defined(WITH_SELINUX)
		security_context_t peercon=NULL;

		if (getpeercon(cli_fd, &peercon) < 0) {
			ERR("cant get peer security context, closing socket: %s", strerror(errno));
			return -1;
		}

		/* XXX */
		DBG(M_SCK, "peer context is `%s'", peercon);

#elif defined(SO_PEERCRED)
		struct ucred ccred;
		socklen_t ccred_len=sizeof(ccred);

		if (getsockopt(cli_fd, SOL_SOCKET, SO_PEERCRED, &ccred, &ccred_len) < 0) {
			ERR("cant get socket cred's closing socket: %s", strerror(errno));
			return -1;
		}

		/* XXX */
		DBG(M_SCK, "peer is uid %d gid %d and pid %d", ccred.uid, ccred.gid, ccred.pid);
#else
# warning WITH_SELINUX and SO_PEERCRED not defined
#endif
	}
	else if (s_u.sa.sa_family == AF_INET) {
		;
	}
	else {
		ERR("unknown address family %d\n", s_u.sa.sa_family);
		return -1;
	}

	close(bsock);

	return cli_fd;
}

void socktrans_close(int sock) {
	if (sock > -1) close(sock);
}

int socktrans_immediate(int isock, int flag) {
	int param=0;

	if (flag) {
		param=1;
	}

	if (setsockopt(isock, SOL_SOCKET, TCP_NODELAY, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: TCP_NODELAY: %s", strerror(errno));
		return -1;
	}

	return 1;
}

/* static below */

static void accept_timeout(int signo) {
	if (signo == SIGALRM) {
		accept_timedout=1;
	}
}

static int socktrans_strtosin(const char *instr, struct sockaddr_in *isin) {
	char host[512];
	char port_str[16];
	unsigned int port=0;
	struct addrinfo hints, *res=NULL;
	int gai_ret;

	assert(instr != NULL && strlen(instr) > 0 && isin != NULL);

	CLEAR(host);
	CLEAR(port_str);

	if (sscanf(instr, "%511[a-zA-Z0-9\\-_.]:%u", host, &port) != 2) {
		return -1;
	}

	if (port > 0xFFFF) {
		ERR("port out of range");
		return -1;
	}

	snprintf(port_str, sizeof(port_str), "%u", port);

	memset(&hints, 0, sizeof(hints));
	hints.ai_family = AF_INET;       /* IPv4 only, matching original behavior */
	hints.ai_socktype = SOCK_STREAM;

	gai_ret = getaddrinfo(host, port_str, &hints, &res);
	if (gai_ret != 0) {
		ERR("unknown host `%s': %s", host, gai_strerror(gai_ret));
		return -1;
	}

	/* Copy the first IPv4 result */
	memcpy(isin, res->ai_addr, sizeof(struct sockaddr_in));

	freeaddrinfo(res);

	return 1;
}

static int socktrans_strtopath(const char *uri, struct sockaddr_un *isun) {
	char upath[96];

	assert(uri != NULL && isun != NULL);

	CLEAR(upath);

	memset(isun, 0, sizeof(*isun));

	if (sscanf(uri, "unix:%95s", upath) == 1) {
		memcpy(isun->sun_path, upath, MIN((sizeof(isun->sun_path) - 1), strlen(upath)));
		isun->sun_family=AF_UNIX;

		return 1;
	}

	return -1;
}

static int socktrans_makeinetsock(int family, int bport) {
	int sock=-1, param=0;
	struct sockaddr_in bind_sin;

	if ((sock=socket(AF_INET, SOCK_STREAM, 0)) < 0) {
		ERR("cant create inet socket: %s", strerror(errno));
		return -1;
	}

	param=1;
	if (setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: setsockopt SO_REUSEADDR: %s", strerror(errno));
		return -1;
	}

	param=IPC_DSIZE;
	if (setsockopt(sock, SOL_SOCKET, SO_RCVBUF, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: setsockopt SO_RCVBUF: %s", strerror(errno));
		return -1;
	}

	param=IPC_DSIZE;
	if (setsockopt(sock, SOL_SOCKET, SO_SNDBUF, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: setsockopt SO_RCVBUF: %s", strerror(errno));
		return -1;
	}

	if (bport > 0) {
		bind_sin.sin_port=htons((uint16_t )bport);
		bind_sin.sin_family=AF_INET;
		bind_sin.sin_addr.s_addr=INADDR_ANY;

		if (bind(sock, (struct sockaddr *)&bind_sin, (socklen_t)sizeof(struct sockaddr_in)) < 0) {
			ERR("cant bind client connection: %s", strerror(errno));
			/* return -1; */
		}
	}

	return sock;
}

static int socktrans_makeunixsock(void) {
	int sock=-1, param=0;

	if ((sock=socket(AF_UNIX, SOCK_STREAM, 0)) < 0) {
		ERR("cant create unix socket: %s", strerror(errno));
		return -1;
	}

	param=IPC_DSIZE;
	if (setsockopt(sock, SOL_SOCKET, SO_RCVBUF, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: setsockopt SO_RCVBUF: %s", strerror(errno));
		return -1;
	}

	param=IPC_DSIZE;
	if (setsockopt(sock, SOL_SOCKET, SO_SNDBUF, (void *)&param, sizeof(param)) < 0) {
		ERR("cant setsockopt: setsockopt SO_RCVBUF: %s", strerror(errno));
		return -1;
	}

	return sock;
}
