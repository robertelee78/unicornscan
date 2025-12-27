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
#include <config.h>

#include <errno.h>
#include <signal.h>
#include <time.h>

/* Include scanopts.h before settings.h so SCANPHASE is properly defined */
#include <scan_progs/scanopts.h>
#include <settings.h>
#include <getconfig.h>

#include <unilib/terminate.h>
#include <unilib/xmalloc.h>
#include <unilib/prng.h>
#include <unilib/output.h>
#include <unilib/xipc.h>
#include <unilib/arch.h>
#include <unilib/standard_dns.h>

#include <unilib/drone.h>
#include <unilib/modules.h>
#include <unilib/qfifo.h>
#include <unilib/xmalloc.h>

#include <scan_progs/scan_export.h>
#include <scan_progs/master.h>
#include <scan_progs/workunits.h>
#include <scan_progs/report.h>
#include <scan_progs/connect.h>
#include <scan_progs/phase_filter.h>

#include <usignals.h>
#include <drone_setup.h>
#include <chld.h>

settings_t *s=NULL;
int ident=0;
const char *ident_name_ptr=NULL;

/*
 * Copy targets from target_strs back to argv_ext for phase 2+.
 * Phase 1 consumes argv_ext, so we need to repopulate it.
 */
static void repopulate_argv_targets(const char *target) {
	fifo_push(s->argv_ext, xstrdup(target));
}

static void prepare_targets_for_phase(void) {
	/* argv_ext should be empty after phase 1 consumed it */
	fifo_walk(s->target_strs, (void (*)(void *))repopulate_argv_targets);
}

/*
 * Callback for phase_filter_walk() to create a /32 workunit for each
 * IP that responded to ARP in phase 1.
 */
static void add_workunit_for_arp_host(uint32_t ipaddr, void *ctx) {
	char *estr=NULL;
	char ip_str[24];
	(void)ctx;

	/*
	 * Format IP as dotted quad. ipaddr is in network byte order,
	 * so first byte is lowest octet.
	 */
	snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u",
		(ipaddr >> 0) & 0xff, (ipaddr >> 8) & 0xff,
		(ipaddr >> 16) & 0xff, (ipaddr >> 24) & 0xff);

	DBG(M_WRK, "phase 2+: adding /32 workunit for ARP responder %s", ip_str);

	if (workunit_add(ip_str, &estr) < 0) {
		ERR("failed to add workunit for ARP responder %s: %s", ip_str, estr);
	}
}

/*
 * Create workunits from ARP cache for compound mode phase 2+.
 *
 * Instead of creating CIDR-based workunits that the sender would iterate,
 * we create individual /32 workunits for each host that responded to ARP.
 * This ensures phase 2+ only scans hosts discovered in phase 1.
 */
static void do_targets_from_arp_cache(void) {
	uint32_t count=0;

	count=phase_filter_count();
	if (count == 0) {
		VRB(0, "phase 2+: no ARP responses cached, nothing to scan");
		return;
	}

	VRB(1, "phase 2+: creating workunits for %u ARP responders", count);
	phase_filter_walk(add_workunit_for_arp_host, NULL);
}

int main(int argc, char **argv) {
	unsigned int num_secs=0, time_off=0;
	char time_est[128];

	ident=IDENT_MASTER;
	ident_name_ptr=IDENT_MASTER_NAME;

	s=(settings_t *)xmalloc(sizeof(settings_t));
	memset(s, 0, sizeof(settings_t));

	signals_setup();

	s->_stdout=stdout;
	s->_stderr=stderr;

	prng_init();

	time(&s->s_time);

	scan_setprivdefaults();

	s->vi=(interface_info_t **)xmalloc(sizeof(interface_info_t *));
	s->vi[0]=(interface_info_t *)xmalloc(sizeof(interface_info_t));
	memset(s->vi[0], 0, sizeof(interface_info_t));
	s->dns=stddns_init(NULL, STDDNS_FLG_ALL);

	if (workunit_init() < 0) {
		terminate("cant initialize workunits");
	}

	/* s->display=&display_builtin; */
	if (init_payloads() < 0) {
		terminate("cant initialize payloads");
	}

	getconfig_profile(argv[0]);

	if (getconfig_argv(argc, argv) < 0) {
		terminate("unable to get configuration");
	}

	/*
	 * Initialize phase filter for compound mode ARP caching.
	 * Must be done after getconfig_argv() sets s->num_phases,
	 * and before do_targets() so the cache is ready for validation.
	 */
	if (s->num_phases > 1) {
		if (phase_filter_init() != 1) {
			terminate("failed to initialize phase filter for compound mode");
		}
	}

	/* now parse argv data for a target -> workunit list */
	do_targets();

	if (s->interface_str == NULL) {
		if (workunit_get_interfaces() < 0) {
			terminate("cant get interface(s) for target(s) from route table");
		}
	}
	assert(s->interface_str != NULL);

	VRB(0, "using interface(s) %s", s->interface_str);

	if (init_modules() < 0) {
		terminate("cant initialize module structures, quiting");
	}

	if (init_output_modules() < 0) {
		terminate("cant initialize output module structures, quiting");
	}

	if (init_report_modules() < 0) {
		terminate("cant initialize report module structures, quiting");
	}

	if (init_payload_modules(&add_payload) < 0) {
		terminate("cant initialize payload module structures, quiting");
	}

	time_est[0]='\0';
	time_off=0;

	/*
	 * For compound mode, calculate and display phase 1 estimate only.
	 * Phase 2+ estimates will be shown after phase 1 completes (see FR-2).
	 * For single mode, use the accumulated total estimate.
	 */
	if (s->num_phases > 1) {
		num_secs=calculate_phase_estimate(0, s->num_hosts);
	}
	else {
		num_secs=s->num_secs;
	}

	if (num_secs > (60 * 60)) {
		unsigned long long int hours=0;
		int sret=0;

		hours=num_secs / (60 * 60);

		sret=snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%llu Hours, ", hours);
		assert(sret > 0);
		time_off += sret;

		num_secs -= hours * (60 * 60);
	}
	if (num_secs > 60) {
		unsigned long long int minutes=0;
		int sret=0;

		minutes=num_secs / 60;

		sret=snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%llu Minutes, ", minutes);
		assert(sret > 0);
		time_off += sret;

		num_secs -= minutes * 60;
	}

	snprintf(&time_est[time_off], sizeof(time_est) - (time_off + 1), "%u Seconds", num_secs);

	/*
	 * Display time estimate: phase-specific for compound mode,
	 * total estimate for single mode.
	 */
	if (s->num_phases > 1) {
		VRB(0, "phase 1 (%s): ~%s for %.2e hosts",
			strscanmode(s->phases[0].mode),
			time_est,
			s->num_hosts
		);
	}
	else {
		VRB(0, "scaning %.2e total hosts with %.2e total packets, should take a little longer than %s",
			s->num_hosts,
			s->num_packets,
			time_est
		);
	}

	if (GET_OVERRIDE()) {
		/* the ip info is already filled in, so just complete the rest */
		if (strlen(s->vi[0]->hwaddr_s) == 0) {
			strcpy(s->vi[0]->hwaddr_s, "00:00:00:00:00:00");
		}

		/* complete the information we need like hwaddr, cause its impossible to specify that currently */
		VRB(1, "spoofing from `%s [%s]'", s->vi[0]->myaddr_s, s->vi[0]->hwaddr_s);
        }
	else {
		/* let the listener tell us then, the user didnt request a specific address */
		strcpy(s->vi[0]->myaddr_s, "0.0.0.0");
		/* preserve hwaddr if already set by -H option */
		if (strlen(s->vi[0]->hwaddr_s) == 0) {
			strcpy(s->vi[0]->hwaddr_s, "00:00:00:00:00:00");
		}
	}

	s->vi[0]->mtu=0; /* the listener will to tell us this */

	if (ipc_init() < 0) {
		terminate("cant initialize IPC, quiting");
	}

	if (drone_init() < 0) {
		terminate("cant initialize drone structure");
	}

	DBG(M_CLD, "main process id is %d", getpid());

	if (s->forklocal) {
		chld_init();

		/* setup signals for children to sync with */
		if (signals_children() < 0) {
			terminate("cant setup child signals");
		}

		/* initialize senders */
		if (chld_fork() < 0) {
			terminate("something went wrong while forking children");
		}

		while (chld_waitsync() > 0) {
			usleep(10000);
		}

		DBG(M_CLD, "children synced");
	}

	if (drone_setup() < 0) {
		terminate("cant setup drones, exiting");
	}

	/* XXX remove this and fix */
	if (s->senders == 0 && GET_SENDDRONE()) {
		/* XXX */
		terminate("no senders for scan, giving up and rudley disconnecting from other drones without warning");
	}

	if (s->listeners == 0 && GET_LISTENDRONE()) {
		/* XXX */
		terminate("no listeners for scan, giving up and rudley disconnecting from other drones without warning");
	}

	if (GET_SENDDRONE() || GET_LISTENDRONE()) {
		run_drone();
	}
	else {

		report_init();
		if (GET_DOCONNECT()) {
			connect_init();
		}

		for (s->cur_iter=1 ; s->cur_iter < (s->scan_iter + 1); s->cur_iter++) {
			/*
			 * Phase loop for compound mode (e.g., -mA+T).
			 * Single mode (num_phases <= 1) runs once with existing settings.
			 */
			int num_phases_to_run=(s->num_phases > 1) ? s->num_phases : 1;

			for (s->cur_phase=0; s->cur_phase < num_phases_to_run; s->cur_phase++) {
				if (s->num_phases > 1) {
					/*
					 * Compound mode: load phase-specific settings.
					 * Phase 1 workunits already created by do_targets().
					 * Phase 2+ need workunits regenerated with new mode.
					 */
					if (load_phase_settings(s->cur_phase) != 1) {
						terminate("failed to load phase %d settings", s->cur_phase + 1);
					}

					if (s->cur_phase > 0) {
						VRB(1, "phase %d: regenerating workunits for %s",
							s->cur_phase + 1, strscanmode(scan_getmode()));
						workunit_reinit();
						master_reset_phase_state();
						/*
						 * For phase 2+, create workunits only for hosts
						 * that responded to ARP in phase 1.
						 */
						do_targets_from_arp_cache();
					}

					VRB(1, "scan iteration %u phase %u/%u: %s",
						s->cur_iter, s->cur_phase + 1, s->num_phases,
						strscanmode(scan_getmode()));
				}
				else {
					VRB(1, "scan iteration %u out of %u", s->cur_iter, s->scan_iter);
				}

				workunit_reset();
				run_scan();

				/*
				 * In compound mode, after completing an ARP phase,
				 * output ARP results sorted by IP address.
				 */
				if (s->num_phases > 1 && scan_getmode() == MODE_ARPSCAN) {
					report_do_arp();

					/*
					 * Display phase 2 time estimate using actual live host count.
					 * Only show if there's a next phase and hosts responded to ARP.
					 */
					if (s->cur_phase + 1 < s->num_phases) {
						uint32_t live_count=0;

						live_count=phase_filter_count();
						if (live_count > 0) {
							uint32_t p2_secs=0;
							unsigned int p2_off=0;
							char p2_est[128];

							p2_secs=calculate_phase_estimate(s->cur_phase + 1, (double)live_count);
							p2_est[0]='\0';
							p2_off=0;

							if (p2_secs > (60 * 60)) {
								unsigned long long int hours=0;
								int sret=0;

								hours=p2_secs / (60 * 60);
								sret=snprintf(&p2_est[p2_off], sizeof(p2_est) - (p2_off + 1), "%llu Hours, ", hours);
								assert(sret > 0);
								p2_off += sret;
								p2_secs -= hours * (60 * 60);
							}
							if (p2_secs > 60) {
								unsigned long long int minutes=0;
								int sret=0;

								minutes=p2_secs / 60;
								sret=snprintf(&p2_est[p2_off], sizeof(p2_est) - (p2_off + 1), "%llu Minutes, ", minutes);
								assert(sret > 0);
								p2_off += sret;
								p2_secs -= minutes * 60;
							}
							snprintf(&p2_est[p2_off], sizeof(p2_est) - (p2_off + 1), "%u Seconds", p2_secs);

							VRB(0, "phase %d (%s): ~%s for %u live hosts",
								s->cur_phase + 2,
								strscanmode(s->phases[s->cur_phase + 1].mode),
								p2_est,
								live_count);
						}
						else {
							VRB(0, "phase %d: no hosts responded to ARP, skipping",
								s->cur_phase + 2);
						}
					}
				}
			}
		}

		report_do();
		report_destroy();

		if (GET_DOCONNECT()) {
			connect_destroy();
		}
	}

	terminate_alldrones();

	time(&s->e_time);

	DBG(M_MOD, "main shuting down output modules");

	fini_output_modules();
	fini_report_modules();

	/* Clean up phase filter if it was initialized for compound mode */
	if (s->num_phases > 1) {
		phase_filter_destroy();
	}

	workunit_destroy();

	chld_reapall();

	VRB(2, "main exiting");

	uexit(0);
}
