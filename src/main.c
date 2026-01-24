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
 * Extract the port specification from a target string.
 * Handles formats: IP:port, IP/CIDR:port, IP:mMode,port
 * Returns pointer into original string (not a copy), or NULL if no port spec.
 */
static const char *extract_target_port_spec(const char *target) {
	const char *colon=NULL;

	if (target == NULL) {
		return NULL;
	}

	colon=strchr(target, ':');
	if (colon == NULL) {
		return NULL;
	}

	colon++; /* skip past the colon */

	/* if it starts with 'm', it's a mode spec - look for comma separator */
	if (*colon == 'm' || *colon == 'M') {
		const char *comma=strchr(colon, ',');
		if (comma != NULL) {
			return comma + 1;
		}
		/* mode-only, no port spec */
		return NULL;
	}

	return colon;
}

/*
 * Static to hold extracted port spec during fifo_walk.
 * Set by get_first_target_port_spec(), used by do_targets_from_arp_cache().
 */
static const char *first_target_port=NULL;

static void get_first_target_port_spec(void *target) {
	if (first_target_port == NULL) {
		first_target_port=extract_target_port_spec((const char *)target);
	}
}

/*
 * CIDR Aggregation for Phase 2+ Workunits
 *
 * Instead of creating one /32 workunit per ARP responder, we aggregate
 * responding hosts into optimal CIDR blocks. This reduces workunit count
 * while still only scanning hosts that responded to ARP.
 *
 * Example: if .40, .41, .42, .43 all responded, we create one /30 instead
 * of four /32s. The algorithm finds the largest valid CIDR at each position.
 */

/* Collector structure for gathering IPs during phase_filter_walk */
typedef struct {
	uint32_t *ips;		/* array of IPs in host byte order */
	uint32_t count;		/* number of IPs collected */
	uint32_t capacity;	/* allocated capacity */
} ip_collector_t;

/* Callback to collect IPs into sorted array */
static void collect_arp_ip(uint32_t ipaddr, void *ctx) {
	ip_collector_t *c=(ip_collector_t *)ctx;

	/* grow array if needed */
	if (c->count >= c->capacity) {
		c->capacity=c->capacity ? c->capacity * 2 : 64;
		c->ips=(uint32_t *)xrealloc(c->ips, c->capacity * sizeof(uint32_t));
	}

	/* convert network to host byte order for sorting */
	c->ips[c->count++]=ntohl(ipaddr);
}

/* qsort comparison for uint32_t */
static int compare_u32(const void *a, const void *b) {
	uint32_t va=*(const uint32_t *)a;
	uint32_t vb=*(const uint32_t *)b;

	if (va < vb) return -1;
	if (va > vb) return 1;
	return 0;
}

/*
 * Binary search to check if an IP is in the sorted array.
 * Returns 1 if found, 0 if not.
 */
static int ip_in_set(const uint32_t *ips, uint32_t count, uint32_t ip) {
	uint32_t lo=0, hi=count;

	while (lo < hi) {
		uint32_t mid=(lo + hi) / 2;

		if (ips[mid] == ip) {
			return 1;
		}
		if (ips[mid] < ip) {
			lo=mid + 1;
		}
		else {
			hi=mid;
		}
	}

	return 0;
}

/*
 * Find the largest CIDR block starting at base_ip where all hosts
 * in the block are present in our set. Returns the CIDR prefix length.
 *
 * A CIDR /N block contains 2^(32-N) hosts and must be aligned to
 * that boundary (base_ip % block_size == 0).
 */
static int find_largest_cidr(const uint32_t *ips, uint32_t count,
			     uint32_t base_ip, uint32_t max_ip) {
	int cidr=0;

	/*
	 * Try progressively larger blocks from /31 down to /24.
	 * Stop at /24 since larger blocks are impractical for local scans.
	 */
	for (cidr=31; cidr >= 24; cidr--) {
		uint32_t block_size=1U << (32 - cidr);
		uint32_t block_mask=~(block_size - 1);
		uint32_t block_base=base_ip & block_mask;
		uint32_t block_end=block_base + block_size - 1;
		uint32_t i=0;
		int all_present=1;

		/* block must start at base_ip (aligned) */
		if (block_base != base_ip) {
			continue;
		}

		/* block must not exceed our IP range */
		if (block_end > max_ip) {
			continue;
		}

		/* check if all hosts in block are in our set */
		for (i=0; i < block_size; i++) {
			if (!ip_in_set(ips, count, block_base + i)) {
				all_present=0;
				break;
			}
		}

		if (all_present) {
			return cidr;
		}
	}

	/* fallback to /32 */
	return 32;
}

/*
 * Create a workunit for a CIDR block with optional port specification.
 */
static void create_cidr_workunit(uint32_t host_ip, int cidr,
				 const char *port_spec) {
	char ip_str[80];
	char *estr=NULL;
	uint32_t net_ip=htonl(host_ip);

	if (cidr == 32) {
		/* /32 - single host, no CIDR suffix needed */
		if (port_spec != NULL && strlen(port_spec) > 0) {
			snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u:%s",
				(net_ip >> 0) & 0xff, (net_ip >> 8) & 0xff,
				(net_ip >> 16) & 0xff, (net_ip >> 24) & 0xff,
				port_spec);
		}
		else {
			snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u",
				(net_ip >> 0) & 0xff, (net_ip >> 8) & 0xff,
				(net_ip >> 16) & 0xff, (net_ip >> 24) & 0xff);
		}
	}
	else {
		/* CIDR block */
		if (port_spec != NULL && strlen(port_spec) > 0) {
			snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u/%d:%s",
				(net_ip >> 0) & 0xff, (net_ip >> 8) & 0xff,
				(net_ip >> 16) & 0xff, (net_ip >> 24) & 0xff,
				cidr, port_spec);
		}
		else {
			snprintf(ip_str, sizeof(ip_str), "%u.%u.%u.%u/%d",
				(net_ip >> 0) & 0xff, (net_ip >> 8) & 0xff,
				(net_ip >> 16) & 0xff, (net_ip >> 24) & 0xff,
				cidr);
		}
	}

	if (workunit_add(ip_str, &estr) < 0) {
		ERR("failed to add workunit %s: %s", ip_str, estr);
	}
}

/*
 * Aggregate IPs into optimal CIDRs and create workunits.
 *
 * Algorithm: iterate through sorted IPs, at each position find the
 * largest valid CIDR block where all hosts responded to ARP. This
 * greedily produces the minimal number of workunits.
 */
static void aggregate_cidrs_and_create_workunits(const uint32_t *ips,
						 uint32_t count,
						 const char *port_spec) {
	uint32_t i=0;
	uint32_t workunits=0;
	uint32_t max_ip=0;
	uint8_t *covered=NULL;

	if (count == 0) {
		return;
	}

	max_ip=ips[count - 1];
	covered=(uint8_t *)xmalloc(count);
	memset(covered, 0, count);

	for (i=0; i < count; i++) {
		uint32_t block_size=0;
		int cidr=0;
		uint32_t j=0;

		if (covered[i]) {
			continue;
		}

		/* find largest CIDR block starting at this IP */
		cidr=find_largest_cidr(ips, count, ips[i], max_ip);
		block_size=1U << (32 - cidr);

		/* create workunit for this block */
		create_cidr_workunit(ips[i], cidr, port_spec);
		workunits++;

		/* mark all IPs in this block as covered */
		for (j=i; j < count && ips[j] < ips[i] + block_size; j++) {
			covered[j]=1;
		}
	}

	VRB(1, "phase 2+: aggregated %u hosts into %u CIDR workunits",
		count, workunits);

	xfree(covered);
}

/*
 * Create workunits from ARP cache for compound mode phase 2+.
 *
 * Collects all ARP responders, aggregates them into optimal CIDR blocks,
 * and creates workunits. This ensures phase 2+ only scans hosts discovered
 * in phase 1, with minimal workunit overhead.
 *
 * The port specification is extracted from the original target string(s)
 * so that target:port syntax is honored in phase 2+.
 */
static void do_targets_from_arp_cache(void) {
	uint32_t count=0;
	const char *port_spec=NULL;
	ip_collector_t collector;

	count=phase_filter_count();
	if (count == 0) {
		VRB(0, "phase 2+: no ARP responses cached, nothing to scan");
		return;
	}

	/*
	 * Extract port spec from original target(s). Uses first target's
	 * port spec for all phase 2+ workunits. If no port spec was given
	 * on the target, workunit_add() falls back to s->gport_str.
	 */
	first_target_port=NULL;
	fifo_walk(s->target_strs, get_first_target_port_spec);
	port_spec=first_target_port;

	if (port_spec != NULL) {
		DBG(M_WRK, "phase 2+: using port spec '%s' from original target", port_spec);
	}

	/* collect all ARP responder IPs */
	memset(&collector, 0, sizeof(collector));
	phase_filter_walk(collect_arp_ip, &collector);

	if (collector.count == 0) {
		VRB(0, "phase 2+: no IPs collected from ARP cache");
		return;
	}

	/* sort IPs for CIDR aggregation */
	qsort(collector.ips, collector.count, sizeof(uint32_t), compare_u32);

	/* aggregate into optimal CIDRs and create workunits */
	aggregate_cidrs_and_create_workunits(collector.ips, collector.count,
					     port_spec);

	xfree(collector.ips);
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
		/*
		 * Load phase 0 settings BEFORE creating workunits.
		 * This ensures per-phase PPS/repeats/timeout override global -r/-R/-L
		 * options that were parsed after -m on the command line.
		 */
		if (load_phase_settings(0) != 1) {
			terminate("failed to load phase 0 settings for compound mode");
		}
	}

	/*
	 * Load modules BEFORE do_targets() so dynamic payloads (e.g., tls.so)
	 * are registered before count_payloads() is called in workunit_add().
	 */
	if (init_modules() < 0) {
		terminate("cant initialize module structures, quiting");
	}

	if (init_payload_modules(&add_payload) < 0) {
		terminate("cant initialize payload module structures, quiting");
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

	if (init_output_modules() < 0) {
		terminate("cant initialize output module structures, quiting");
	}

	if (init_report_modules() < 0) {
		terminate("cant initialize report module structures, quiting");
	}

	time_est[0]='\0';
	time_off=0;

	/*
	 * For compound mode, calculate and display phase 1 estimate only.
	 * Phase 2+ estimates shown after ARP completes with actual live count.
	 * For single mode, use the accumulated total estimate.
	 */
	if (s->num_phases > 1) {
		num_secs=calculate_phase_estimate(0, s->num_hosts, NULL);
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
		VRB(1, "connect mode: %s (options=0x%x)", GET_DOCONNECT() ? "enabled" : "disabled", s->options);
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
					 * Phase 0 already loaded before do_targets() to ensure
					 * workunits are created with correct per-phase PPS.
					 * Phase 1+ need settings loaded and workunits regenerated.
					 */
					if (s->cur_phase > 0) {
						if (load_phase_settings(s->cur_phase) != 1) {
							terminate("failed to load phase %d settings", s->cur_phase + 1);
						}
						VRB(1, "phase %d: regenerating workunits for %s",
							s->cur_phase + 1, strscanmode(scan_getmode()));
						workunit_reinit();
						master_reset_phase_state();
						/*
						 * For phase 2+, if phase 0 was ARP, create workunits
						 * only for hosts that responded. Otherwise (e.g., -mT+U),
						 * use original target list for all phases.
						 */
						if (s->phases[0].mode == MODE_ARPSCAN) {
							do_targets_from_arp_cache();
						}
						else {
							prepare_targets_for_phase();
							do_targets();
						}
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
				 * display phase 2 time estimate using actual live host count.
				 * ARP results will be output in final report_do(), grouped
				 * with TCP results per-IP for cleaner output.
				 */
				if (s->num_phases > 1 && scan_getmode() == MODE_ARPSCAN) {
					if (s->cur_phase + 1 < s->num_phases) {
						uint32_t live_count=0;

						live_count=phase_filter_count();
						if (live_count > 0) {
							uint32_t p2_secs=0;
							unsigned int p2_off=0;
							char p2_est[128];
							const char *port_spec=NULL;

							/*
							 * Extract port spec from first target for accurate
							 * phase 2 time estimate. The target:port syntax
							 * overrides s->gport_str.
							 */
							first_target_port=NULL;
							fifo_walk(s->target_strs, get_first_target_port_spec);
							port_spec=first_target_port;

							p2_secs=calculate_phase_estimate(s->cur_phase + 1, (double)live_count, port_spec);
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
