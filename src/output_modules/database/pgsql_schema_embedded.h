/**********************************************************************
 * Copyright (C) 2004-2006 (Jack Louis) <jack@rapturesecurity.org>    *
 * Copyright (C) 2025 Robert E. Lee <robert@unicornscan.org>          *
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
#ifndef _PGSQL_SCHEMA_EMBEDDED_H
#define _PGSQL_SCHEMA_EMBEDDED_H

/*
 * Embedded PostgreSQL schema for unicornscan database
 *
 * This schema is auto-created when connecting to a fresh database.
 * Uses IF NOT EXISTS to be safe with existing databases.
 *
 * Schema version: 9
 * - v9: Added eth_hwaddr to uni_ipreport for local network MAC capture
 *       TCP/UDP/ICMP responses from L2-reachable hosts now include source MAC
 *       Extends v8 MAC<->IP history with IP scan data (not just ARP scans)
 * - v8: Added MAC<->IP history tracking for temporal address associations
 *       uni_mac_ip_history: Tracks every MAC<->IP pairing with first/last seen
 *       fn_record_mac_ip(): Records MAC<->IP association from ARP scans
 *       v_mac_ip_history, v_current_mac_by_ip, v_current_ip_by_mac views
 *       v_hosts updated to show most recent MAC from history and mac_count
 * - v7: Added target_str column for original command line target specification
 *       Added src_addr column for source address / phantom IP (-s option)
 *       Updated v_hosts view to calculate port_count and scan_count correctly
 * - v6: Added GeoIP integration for geographic and network metadata
 *       uni_geoip: Geographic and network data (country, region, city, lat/long, ISP, ASN, ip_type)
 *       Supports multiple providers: MaxMind (GeoLite2/GeoIP2), IP2Location, IPinfo
 *       IP type detection: residential, datacenter, vpn, proxy, tor, mobile
 *       Historical accuracy: stores data at scan time for audit trails
 * - v5: Added frontend support tables for web/mobile interfaces
 *       uni_hosts: Aggregate host tracking with fn_upsert_host()
 *       uni_host_scans: Junction table linking hosts to scans
 *       uni_hops: Traceroute hop data from trace_addr
 *       uni_services: Structured service identification (parsed banners)
 *       uni_os_fingerprints: Parsed OS fingerprint data
 *       uni_networks: Network/subnet grouping
 *       uni_scan_tags: Flexible tagging system
 *       uni_notes: User annotations on any entity
 *       uni_saved_filters: Saved filter configurations
 * - v4: Added compound mode support (mode_str, mode_flags, num_phases, port_str,
 *       interface, tcpflags, send_opts, recv_opts, pps, recv_timeout, repeats)
 *       Added scan_notes for user annotations
 *       Added uni_scan_phases table for per-phase configuration
 *       Added v_scan_full and v_compound_phases views
 * - v3: Added RLS (Row Level Security) for enhanced security
 *       Changed views to SECURITY INVOKER to fix SECURITY DEFINER warnings
 * - v2: Added JSONB columns for extensible metadata (scan_metadata, extra_data)
 */
#define PGSQL_SCHEMA_VERSION 9

/*
 * Schema version tracking table - created first
 */
static const char *pgsql_schema_version_ddl =
	"CREATE TABLE IF NOT EXISTS uni_schema_version (\n"
	"    version INT NOT NULL,\n"
	"    applied_at TIMESTAMPTZ DEFAULT NOW(),\n"
	"    PRIMARY KEY (version)\n"
	");\n";

/*
 * Core sequences - must be created before tables that reference them
 */
static const char *pgsql_schema_sequences_ddl =
	"CREATE SEQUENCE IF NOT EXISTS uni_scans_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_ipreport_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_arpreport_id_seq;\n"
	/* v5: Sequences for frontend support tables */
	"CREATE SEQUENCE IF NOT EXISTS uni_hosts_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_hops_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_services_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_osfingerprints_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_networks_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_notes_id_seq;\n"
	"CREATE SEQUENCE IF NOT EXISTS uni_saved_filters_id_seq;\n"
	/* v6: GeoIP sequence */
	"CREATE SEQUENCE IF NOT EXISTS uni_geoip_id_seq;\n"
	/* v8: MAC-IP history sequence */
	"CREATE SEQUENCE IF NOT EXISTS uni_mac_ip_history_id_seq;\n";

/*
 * Main scan tracking table
 */
static const char *pgsql_schema_scans_ddl =
	"CREATE TABLE IF NOT EXISTS uni_scans (\n"
	"    scans_id    BIGINT NOT NULL DEFAULT nextval('uni_scans_id_seq'),\n"
	"    s_time      BIGINT NOT NULL,\n"
	"    e_time      BIGINT NOT NULL,\n"
	"    est_e_time  BIGINT NOT NULL,\n"
	"    senders     SMALLINT NOT NULL,\n"
	"    listeners   SMALLINT NOT NULL,\n"
	"    scan_iter   SMALLINT NOT NULL,\n"
	"    profile     VARCHAR(200) NOT NULL,\n"
	"    options     INTEGER NOT NULL,\n"
	"    payload_group SMALLINT NOT NULL,\n"
	"    dronestr    VARCHAR(200) NOT NULL,\n"
	"    covertness  SMALLINT NOT NULL,\n"
	"    modules     VARCHAR(200) NOT NULL,\n"
	"    \"user\"      VARCHAR(200) NOT NULL,\n"
	"    pcap_dumpfile VARCHAR(200),\n"
	"    pcap_readfile VARCHAR(200),\n"
	"    tickrate    INTEGER NOT NULL,\n"
	"    num_hosts   DOUBLE PRECISION NOT NULL,\n"
	"    num_packets DOUBLE PRECISION NOT NULL,\n"
	"    scan_metadata JSONB DEFAULT '{}'::jsonb,\n"
	"    mode_str    VARCHAR(64),\n"        /* Human-readable mode (e.g., 'A+T', 'Tsf', 'U') */
	"    mode_flags  SMALLINT DEFAULT 0,\n" /* Bitmask: MODE_TCPSCAN=1, MODE_UDPSCAN=2, MODE_ARPSCAN=4, etc */
	"    num_phases  SMALLINT DEFAULT 1,\n" /* Number of phases (1 = normal, >1 = compound mode) */
	"    port_str    TEXT,\n"               /* Port specification from -p argument */
	"    interface   VARCHAR(64),\n"        /* Network interface used (-i) */
	"    tcpflags    INTEGER DEFAULT 0,\n"  /* TCP header flags (TH_SYN, etc) */
	"    send_opts   INTEGER DEFAULT 0,\n"  /* Send options (S_SHUFFLE_PORTS, etc) */
	"    recv_opts   INTEGER DEFAULT 0,\n"  /* Receive options (L_WATCH_ERRORS, etc) */
	"    pps         INTEGER DEFAULT 0,\n"  /* Global packets per second (-r) */
	"    recv_timeout SMALLINT DEFAULT 0,\n"/* Global receive timeout in seconds (-L) */
	"    repeats     INTEGER DEFAULT 1,\n"  /* Global repeat count (-R) */
	"    scan_notes  TEXT,\n"               /* User-supplied notes/annotations */
	"    target_str  TEXT,\n"               /* Original command line target specification (v7) */
	"    src_addr    INET,\n"               /* Source address / phantom IP (-s option) (v7) */
	"    PRIMARY KEY (scans_id)\n"
	");\n";

/*
 * Send workunit table
 */
static const char *pgsql_schema_sworkunits_ddl =
	"CREATE TABLE IF NOT EXISTS uni_sworkunits (\n"
	"    magic       BIGINT NOT NULL,\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    repeats     SMALLINT NOT NULL,\n"
	"    send_opts   INTEGER NOT NULL,\n"
	"    pps         BIGINT NOT NULL,\n"
	"    delay_type  SMALLINT NOT NULL,\n"
	"    myaddr      INET NOT NULL,\n"
	"    mymask      INET NOT NULL,\n"
	"    macaddr     MACADDR NOT NULL,\n"
	"    mtu         INTEGER NOT NULL,\n"
	"    target      INET NOT NULL,\n"
	"    targetmask  INET NOT NULL,\n"
	"    tos         SMALLINT NOT NULL,\n"
	"    minttl      SMALLINT NOT NULL,\n"
	"    maxttl      SMALLINT NOT NULL,\n"
	"    fingerprint SMALLINT NOT NULL,\n"
	"    src_port    INTEGER NOT NULL,\n"
	"    ip_off      INTEGER NOT NULL,\n"
	"    ipoptions   BYTEA,\n"
	"    tcpflags    INTEGER NOT NULL,\n"
	"    tcpoptions  BYTEA,\n"
	"    window_size INTEGER NOT NULL,\n"
	"    syn_key     BIGINT NOT NULL,\n"
	"    port_str    TEXT,\n"
	"    wid         BIGINT NOT NULL,\n"
	"    status      SMALLINT NOT NULL,\n"
	"    CONSTRAINT uni_sworkunit_uniq_comp_LK UNIQUE (scans_id, wid)\n"
	");\n";

/*
 * Listen workunit table
 */
static const char *pgsql_schema_lworkunits_ddl =
	"CREATE TABLE IF NOT EXISTS uni_lworkunits (\n"
	"    magic       BIGINT NOT NULL,\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    recv_timeout SMALLINT NOT NULL,\n"
	"    ret_layers  SMALLINT NOT NULL,\n"
	"    recv_opts   INTEGER NOT NULL,\n"
	"    window_size BIGINT NOT NULL,\n"
	"    syn_key     BIGINT NOT NULL,\n"
	"    pcap_str    TEXT,\n"
	"    wid         BIGINT NOT NULL,\n"
	"    status      SMALLINT NOT NULL,\n"
	"    CONSTRAINT uni_lworkunit_uniq_comp_LK UNIQUE (scans_id, wid)\n"
	");\n";

/*
 * Scan phases table for compound mode (e.g., -mA+T, -mA+T+U)
 * Stores per-phase configuration when num_phases > 1
 */
static const char *pgsql_schema_scan_phases_ddl =
	"CREATE TABLE IF NOT EXISTS uni_scan_phases (\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    phase_idx   SMALLINT NOT NULL,\n"  /* 0-indexed phase number */
	"    mode        SMALLINT NOT NULL,\n"  /* MODE_TCPSCAN=1, MODE_UDPSCAN=2, MODE_ARPSCAN=4, etc */
	"    mode_char   CHAR(1),\n"            /* 'T', 'U', 'A', 'I', 'P' */
	"    tcpflags    INTEGER DEFAULT 0,\n"  /* TH_SYN, TH_FIN, etc (TCP modes only) */
	"    send_opts   INTEGER DEFAULT 0,\n"  /* S_ flags for this phase */
	"    recv_opts   INTEGER DEFAULT 0,\n"  /* L_ flags for this phase */
	"    pps         INTEGER DEFAULT 0,\n"  /* Per-phase rate; 0 = use global */
	"    repeats     INTEGER DEFAULT 0,\n"  /* Per-phase repeats; 0 = use global */
	"    recv_timeout SMALLINT DEFAULT 0,\n"/* Per-phase timeout; 0 = use global */
	"    CONSTRAINT uni_scan_phases_pk PRIMARY KEY (scans_id, phase_idx)\n"
	");\n";

/*
 * Workunit stats and output tables
 */
static const char *pgsql_schema_stats_ddl =
	"CREATE TABLE IF NOT EXISTS uni_workunitstats (\n"
	"    wid         BIGINT NOT NULL,\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    msg         TEXT NOT NULL\n"
	");\n"
	"\n"
	"CREATE TABLE IF NOT EXISTS uni_output (\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    msg         TEXT NOT NULL\n"
	");\n";

/*
 * IP report table
 */
static const char *pgsql_schema_ipreport_ddl =
	"CREATE TABLE IF NOT EXISTS uni_ipreport (\n"
	"    ipreport_id BIGINT NOT NULL DEFAULT nextval('uni_ipreport_id_seq'),\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    magic       BIGINT NOT NULL,\n"
	"    sport       INTEGER NOT NULL,\n"
	"    dport       INTEGER NOT NULL,\n"
	"    proto       SMALLINT NOT NULL,\n"
	"    type        INTEGER NOT NULL,\n"
	"    subtype     INTEGER NOT NULL,\n"
	"    send_addr   INET NOT NULL,\n"
	"    host_addr   INET NOT NULL,\n"
	"    trace_addr  INET NOT NULL,\n"
	"    ttl         SMALLINT NOT NULL,\n"
	"    tstamp      BIGINT NOT NULL,\n"
	"    utstamp     BIGINT NOT NULL,\n"
	"    flags       INTEGER NOT NULL,\n"
	"    mseq        BIGINT NOT NULL,\n"
	"    tseq        BIGINT NOT NULL,\n"
	"    window_size INTEGER NOT NULL,\n"
	"    t_tstamp    BIGINT NOT NULL,\n"
	"    m_tstamp    BIGINT NOT NULL,\n"
	"    extra_data  JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (ipreport_id)\n"
	");\n";

/*
 * ARP report table
 */
static const char *pgsql_schema_arpreport_ddl =
	"CREATE TABLE IF NOT EXISTS uni_arpreport (\n"
	"    arpreport_id BIGINT NOT NULL DEFAULT nextval('uni_arpreport_id_seq'),\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    magic       BIGINT NOT NULL,\n"
	"    host_addr   INET NOT NULL,\n"
	"    hwaddr      MACADDR NOT NULL,\n"
	"    tstamp      BIGINT NOT NULL,\n"
	"    utstamp     BIGINT NOT NULL,\n"
	"    extra_data  JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (arpreport_id)\n"
	");\n";

/*
 * IP report data and packet tables
 */
static const char *pgsql_schema_ipreportdata_ddl =
	"CREATE TABLE IF NOT EXISTS uni_ipreportdata (\n"
	"    ipreport_id BIGINT NOT NULL,\n"
	"    type        SMALLINT NOT NULL,\n"
	"    data        TEXT\n"
	");\n"
	"\n"
	"CREATE TABLE IF NOT EXISTS uni_ippackets (\n"
	"    ipreport_id BIGINT NOT NULL,\n"
	"    packet      BYTEA NOT NULL\n"
	");\n";

/*
 * ARP packet table
 */
static const char *pgsql_schema_arppackets_ddl =
	"CREATE TABLE IF NOT EXISTS uni_arppackets (\n"
	"    arpreport_id BIGINT NOT NULL,\n"
	"    packet      BYTEA NOT NULL\n"
	");\n";

/*
 * Indexes for common query patterns
 */
static const char *pgsql_schema_indexes_ddl =
	/* Basic single-column indexes */
	"CREATE INDEX IF NOT EXISTS uni_ipreport_scansid_idx ON uni_ipreport(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_arpreport_scansid_idx ON uni_arpreport(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_host_addr_idx ON uni_ipreport(host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_dport_idx ON uni_ipreport(dport);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_sport_idx ON uni_ipreport(sport);\n"
	"CREATE INDEX IF NOT EXISTS uni_scans_s_time_idx ON uni_scans(s_time);\n"
	/* Composite indexes for common query patterns */
	"CREATE INDEX IF NOT EXISTS uni_ipreport_scan_host_idx ON uni_ipreport(scans_id, host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_scan_dport_idx ON uni_ipreport(scans_id, dport);\n"
	/* GIN indexes for JSONB columns (efficient for containment queries) */
	"CREATE INDEX IF NOT EXISTS uni_scans_metadata_gin ON uni_scans USING gin(scan_metadata);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_extra_gin ON uni_ipreport USING gin(extra_data);\n"
	"CREATE INDEX IF NOT EXISTS uni_arpreport_extra_gin ON uni_arpreport USING gin(extra_data);\n";

/*
 * Foreign key constraints (added separately for IF NOT EXISTS compatibility)
 * Note: PostgreSQL doesn't support IF NOT EXISTS for constraints,
 * so we use DO $$ blocks to check before adding
 */
static const char *pgsql_schema_constraints_ddl =
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_sworkunit_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_sworkunits ADD CONSTRAINT uni_sworkunit_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_lworkunit_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_lworkunits ADD CONSTRAINT uni_lworkunit_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_workunitstats_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_workunitstats ADD CONSTRAINT uni_workunitstats_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_output_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_output ADD CONSTRAINT uni_output_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_ipreport_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_ipreport ADD CONSTRAINT uni_ipreport_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_arpreport_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_arpreport ADD CONSTRAINT uni_arpreport_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_reportdata_uni_ipreport_fk') THEN\n"
	"        ALTER TABLE uni_ipreportdata ADD CONSTRAINT uni_reportdata_uni_ipreport_FK\n"
	"            FOREIGN KEY(ipreport_id) REFERENCES uni_ipreport(ipreport_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_ippackets_uni_ipreport_fk') THEN\n"
	"        ALTER TABLE uni_ippackets ADD CONSTRAINT uni_ippackets_uni_ipreport_FK\n"
	"            FOREIGN KEY(ipreport_id) REFERENCES uni_ipreport(ipreport_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_arppackets_uni_arpreport_fk') THEN\n"
	"        ALTER TABLE uni_arppackets ADD CONSTRAINT uni_arppackets_uni_arpreport_FK\n"
	"            FOREIGN KEY(arpreport_id) REFERENCES uni_arpreport(arpreport_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_scan_phases_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_scan_phases ADD CONSTRAINT uni_scan_phases_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n";

/*
 * Row Level Security (RLS) for enhanced database security
 * Enable RLS on all tables and create permissive policies for direct DB access
 */
static const char *pgsql_schema_rls_ddl =
	/* Enable RLS on all tables */
	"ALTER TABLE uni_schema_version ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_scans ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_sworkunits ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_lworkunits ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_scan_phases ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_workunitstats ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_output ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ipreport ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_arpreport ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ipreportdata ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ippackets ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_arppackets ENABLE ROW LEVEL SECURITY;\n";

/*
 * RLS Policies - permissive policies for direct database access
 * These allow full access for any authenticated database connection
 */
static const char *pgsql_schema_rls_policies_ddl =
	/* Drop existing policies first (if any) to avoid conflicts */
	"DROP POLICY IF EXISTS \"Allow full access to schema_version\" ON uni_schema_version;\n"
	"DROP POLICY IF EXISTS \"Allow full access to scans\" ON uni_scans;\n"
	"DROP POLICY IF EXISTS \"Allow full access to sworkunits\" ON uni_sworkunits;\n"
	"DROP POLICY IF EXISTS \"Allow full access to lworkunits\" ON uni_lworkunits;\n"
	"DROP POLICY IF EXISTS \"Allow full access to scan_phases\" ON uni_scan_phases;\n"
	"DROP POLICY IF EXISTS \"Allow full access to workunitstats\" ON uni_workunitstats;\n"
	"DROP POLICY IF EXISTS \"Allow full access to output\" ON uni_output;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ipreport\" ON uni_ipreport;\n"
	"DROP POLICY IF EXISTS \"Allow full access to arpreport\" ON uni_arpreport;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ipreportdata\" ON uni_ipreportdata;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ippackets\" ON uni_ippackets;\n"
	"DROP POLICY IF EXISTS \"Allow full access to arppackets\" ON uni_arppackets;\n"
	"\n"
	/* Create permissive policies */
	"CREATE POLICY \"Allow full access to schema_version\" ON uni_schema_version FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to scans\" ON uni_scans FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to sworkunits\" ON uni_sworkunits FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to lworkunits\" ON uni_lworkunits FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to scan_phases\" ON uni_scan_phases FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to workunitstats\" ON uni_workunitstats FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to output\" ON uni_output FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreport\" ON uni_ipreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arpreport\" ON uni_arpreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreportdata\" ON uni_ipreportdata FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ippackets\" ON uni_ippackets FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arppackets\" ON uni_arppackets FOR ALL USING (true) WITH CHECK (true);\n";

/*
 * Convenience views for common query patterns
 * Using CREATE OR REPLACE with security_invoker=true for enhanced security
 * Note: security_invoker requires PostgreSQL 15+
 */
static const char *pgsql_schema_views_ddl =
	/* v_open_ports: Human-readable port scan results */
	"CREATE OR REPLACE VIEW v_open_ports WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS scan_time,\n"
	"    s.profile,\n"
	"    i.host_addr,\n"
	"    i.dport AS port,\n"
	"    CASE i.proto\n"
	"        WHEN 6 THEN 'TCP'\n"
	"        WHEN 17 THEN 'UDP'\n"
	"        WHEN 1 THEN 'ICMP'\n"
	"        ELSE 'OTHER(' || i.proto || ')'\n"
	"    END AS protocol,\n"
	"    i.ttl,\n"
	"    to_timestamp(i.tstamp) AS response_time,\n"
	"    i.extra_data\n"
	"FROM uni_scans s\n"
	"JOIN uni_ipreport i ON s.scans_id = i.scans_id\n"
	"ORDER BY s.s_time DESC, i.host_addr, i.dport;\n"
	"\n"
	/* v_scan_summary: Aggregate statistics per scan */
	"CREATE OR REPLACE VIEW v_scan_summary WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS started,\n"
	"    to_timestamp(NULLIF(s.e_time, 0)) AS completed,\n"
	"    s.profile,\n"
	"    s.\"user\" AS scan_user,\n"
	"    s.num_hosts AS target_hosts,\n"
	"    s.num_packets AS packets_sent,\n"
	"    COUNT(DISTINCT i.host_addr) AS hosts_responded,\n"
	"    COUNT(i.ipreport_id) AS total_responses,\n"
	"    COUNT(DISTINCT i.dport) AS unique_ports,\n"
	"    s.scan_metadata\n"
	"FROM uni_scans s\n"
	"LEFT JOIN uni_ipreport i ON s.scans_id = i.scans_id\n"
	"GROUP BY s.scans_id, s.s_time, s.e_time, s.profile, s.\"user\",\n"
	"         s.num_hosts, s.num_packets, s.scan_metadata;\n"
	"\n"
	/* v_recent_scans: Last 50 scans with key metrics */
	"CREATE OR REPLACE VIEW v_recent_scans WITH (security_invoker = true) AS\n"
	"SELECT * FROM v_scan_summary\n"
	"ORDER BY started DESC\n"
	"LIMIT 50;\n"
	"\n"
	/* v_host_history: All results for a given host across all scans */
	"CREATE OR REPLACE VIEW v_host_history WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    i.host_addr,\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS scan_time,\n"
	"    s.profile,\n"
	"    i.dport AS port,\n"
	"    i.proto,\n"
	"    i.ttl,\n"
	"    i.sport AS source_port,\n"
	"    i.extra_data\n"
	"FROM uni_ipreport i\n"
	"JOIN uni_scans s ON i.scans_id = s.scans_id\n"
	"ORDER BY i.host_addr, s.s_time DESC, i.dport;\n"
	"\n"
	/* v_arp_results: Human-readable ARP scan results */
	"CREATE OR REPLACE VIEW v_arp_results WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS scan_time,\n"
	"    s.profile,\n"
	"    a.host_addr AS ip_address,\n"
	"    a.hwaddr AS mac_address,\n"
	"    to_timestamp(a.tstamp) AS response_time,\n"
	"    a.extra_data\n"
	"FROM uni_scans s\n"
	"JOIN uni_arpreport a ON s.scans_id = a.scans_id\n"
	"ORDER BY s.s_time DESC, a.host_addr;\n"
	"\n"
	/* v_scan_full: Complete scan details including compound mode info */
	"CREATE OR REPLACE VIEW v_scan_full WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS started,\n"
	"    to_timestamp(NULLIF(s.e_time, 0)) AS completed,\n"
	"    s.profile,\n"
	"    s.\"user\" AS scan_user,\n"
	"    s.mode_str,\n"
	"    s.mode_flags,\n"
	"    s.num_phases,\n"
	"    s.port_str,\n"
	"    s.interface,\n"
	"    s.tcpflags,\n"
	"    s.send_opts,\n"
	"    s.recv_opts,\n"
	"    s.pps,\n"
	"    s.recv_timeout,\n"
	"    s.repeats,\n"
	"    s.scan_notes,\n"
	"    s.num_hosts AS target_hosts,\n"
	"    s.num_packets AS packets_sent,\n"
	"    s.scan_metadata\n"
	"FROM uni_scans s\n"
	"ORDER BY s.s_time DESC;\n"
	"\n"
	/* v_compound_phases: Phase details for compound mode scans */
	"CREATE OR REPLACE VIEW v_compound_phases WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    s.mode_str AS scan_mode,\n"
	"    s.num_phases,\n"
	"    p.phase_idx,\n"
	"    p.mode_char,\n"
	"    p.mode,\n"
	"    p.tcpflags AS phase_tcpflags,\n"
	"    p.pps AS phase_pps,\n"
	"    p.repeats AS phase_repeats,\n"
	"    p.recv_timeout AS phase_timeout,\n"
	"    to_timestamp(s.s_time) AS scan_time\n"
	"FROM uni_scans s\n"
	"JOIN uni_scan_phases p ON s.scans_id = p.scans_id\n"
	"WHERE s.num_phases > 1\n"
	"ORDER BY s.s_time DESC, p.phase_idx;\n";

/*
 * Schema v2 migration - add JSONB columns and new indexes to existing databases
 * Uses DO blocks with exception handling for safe idempotent migrations
 */
static const char *pgsql_schema_migration_v2_ddl =
	/* Add JSONB columns */
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN scan_metadata JSONB DEFAULT '{}'::jsonb;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_ipreport ADD COLUMN extra_data JSONB DEFAULT '{}'::jsonb;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_arpreport ADD COLUMN extra_data JSONB DEFAULT '{}'::jsonb;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	/* Add new indexes (IF NOT EXISTS makes these idempotent) */
	"CREATE INDEX IF NOT EXISTS uni_ipreport_sport_idx ON uni_ipreport(sport);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_scan_host_idx ON uni_ipreport(scans_id, host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_scan_dport_idx ON uni_ipreport(scans_id, dport);\n"
	"CREATE INDEX IF NOT EXISTS uni_scans_metadata_gin ON uni_scans USING gin(scan_metadata);\n"
	"CREATE INDEX IF NOT EXISTS uni_ipreport_extra_gin ON uni_ipreport USING gin(extra_data);\n"
	"CREATE INDEX IF NOT EXISTS uni_arpreport_extra_gin ON uni_arpreport USING gin(extra_data);\n";

/*
 * Schema v3 migration - add RLS and fix views for enhanced security
 * This migration enables Row Level Security on all tables and updates views
 * to use SECURITY INVOKER instead of the default SECURITY DEFINER
 */
static const char *pgsql_schema_migration_v3_ddl =
	/* Enable RLS on all tables (idempotent - no error if already enabled) */
	"ALTER TABLE uni_schema_version ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_scans ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_sworkunits ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_lworkunits ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_workunitstats ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_output ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ipreport ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_arpreport ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ipreportdata ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_ippackets ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_arppackets ENABLE ROW LEVEL SECURITY;\n"
	"\n"
	/* Drop and recreate policies (idempotent) */
	"DROP POLICY IF EXISTS \"Allow full access to schema_version\" ON uni_schema_version;\n"
	"DROP POLICY IF EXISTS \"Allow full access to scans\" ON uni_scans;\n"
	"DROP POLICY IF EXISTS \"Allow full access to sworkunits\" ON uni_sworkunits;\n"
	"DROP POLICY IF EXISTS \"Allow full access to lworkunits\" ON uni_lworkunits;\n"
	"DROP POLICY IF EXISTS \"Allow full access to workunitstats\" ON uni_workunitstats;\n"
	"DROP POLICY IF EXISTS \"Allow full access to output\" ON uni_output;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ipreport\" ON uni_ipreport;\n"
	"DROP POLICY IF EXISTS \"Allow full access to arpreport\" ON uni_arpreport;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ipreportdata\" ON uni_ipreportdata;\n"
	"DROP POLICY IF EXISTS \"Allow full access to ippackets\" ON uni_ippackets;\n"
	"DROP POLICY IF EXISTS \"Allow full access to arppackets\" ON uni_arppackets;\n"
	"\n"
	"CREATE POLICY \"Allow full access to schema_version\" ON uni_schema_version FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to scans\" ON uni_scans FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to sworkunits\" ON uni_sworkunits FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to lworkunits\" ON uni_lworkunits FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to workunitstats\" ON uni_workunitstats FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to output\" ON uni_output FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreport\" ON uni_ipreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arpreport\" ON uni_arpreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreportdata\" ON uni_ipreportdata FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ippackets\" ON uni_ippackets FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arppackets\" ON uni_arppackets FOR ALL USING (true) WITH CHECK (true);\n"
	"\n"
	/* Update views to use security_invoker (requires PG 15+) */
	"ALTER VIEW v_open_ports SET (security_invoker = true);\n"
	"ALTER VIEW v_scan_summary SET (security_invoker = true);\n"
	"ALTER VIEW v_recent_scans SET (security_invoker = true);\n"
	"ALTER VIEW v_host_history SET (security_invoker = true);\n"
	"ALTER VIEW v_arp_results SET (security_invoker = true);\n";

/*
 * Schema v4 migration - add compound mode support and scan notes
 * Adds new columns to uni_scans for mode info, phases table, and user notes
 */
static const char *pgsql_schema_migration_v4_ddl =
	/* Add new columns to uni_scans for compound mode support */
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN mode_str VARCHAR(64);\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN mode_flags SMALLINT DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN num_phases SMALLINT DEFAULT 1;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN port_str TEXT;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN interface VARCHAR(64);\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN tcpflags INTEGER DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN send_opts INTEGER DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN recv_opts INTEGER DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN pps INTEGER DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN recv_timeout SMALLINT DEFAULT 0;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN repeats INTEGER DEFAULT 1;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    ALTER TABLE uni_scans ADD COLUMN scan_notes TEXT;\n"
	"EXCEPTION WHEN duplicate_column THEN NULL;\n"
	"END $$;\n"
	"\n"
	/* Create uni_scan_phases table for compound mode phase tracking */
	"CREATE TABLE IF NOT EXISTS uni_scan_phases (\n"
	"    scans_id    BIGINT NOT NULL,\n"
	"    phase_idx   SMALLINT NOT NULL,\n"
	"    mode        SMALLINT NOT NULL,\n"
	"    mode_char   CHAR(1),\n"
	"    tcpflags    INTEGER DEFAULT 0,\n"
	"    send_opts   INTEGER DEFAULT 0,\n"
	"    recv_opts   INTEGER DEFAULT 0,\n"
	"    pps         INTEGER DEFAULT 0,\n"
	"    repeats     INTEGER DEFAULT 0,\n"
	"    recv_timeout SMALLINT DEFAULT 0,\n"
	"    CONSTRAINT uni_scan_phases_pk PRIMARY KEY (scans_id, phase_idx)\n"
	");\n"
	"\n"
	/* Add foreign key constraint for uni_scan_phases */
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_scan_phases_uni_scans_fk') THEN\n"
	"        ALTER TABLE uni_scan_phases ADD CONSTRAINT uni_scan_phases_uni_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id);\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	/* Enable RLS on uni_scan_phases */
	"ALTER TABLE uni_scan_phases ENABLE ROW LEVEL SECURITY;\n"
	"DROP POLICY IF EXISTS \"Allow full access to scan_phases\" ON uni_scan_phases;\n"
	"CREATE POLICY \"Allow full access to scan_phases\" ON uni_scan_phases FOR ALL USING (true) WITH CHECK (true);\n"
	"\n"
	/* Create new views for compound mode */
	"CREATE OR REPLACE VIEW v_scan_full WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    to_timestamp(s.s_time) AS started,\n"
	"    to_timestamp(NULLIF(s.e_time, 0)) AS completed,\n"
	"    s.profile,\n"
	"    s.\"user\" AS scan_user,\n"
	"    s.mode_str,\n"
	"    s.mode_flags,\n"
	"    s.num_phases,\n"
	"    s.port_str,\n"
	"    s.interface,\n"
	"    s.tcpflags,\n"
	"    s.send_opts,\n"
	"    s.recv_opts,\n"
	"    s.pps,\n"
	"    s.recv_timeout,\n"
	"    s.repeats,\n"
	"    s.scan_notes,\n"
	"    s.num_hosts AS target_hosts,\n"
	"    s.num_packets AS packets_sent,\n"
	"    s.scan_metadata\n"
	"FROM uni_scans s\n"
	"ORDER BY s.s_time DESC;\n"
	"\n"
	"CREATE OR REPLACE VIEW v_compound_phases WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    s.scans_id,\n"
	"    s.mode_str AS scan_mode,\n"
	"    s.num_phases,\n"
	"    p.phase_idx,\n"
	"    p.mode_char,\n"
	"    p.mode,\n"
	"    p.tcpflags AS phase_tcpflags,\n"
	"    p.pps AS phase_pps,\n"
	"    p.repeats AS phase_repeats,\n"
	"    p.recv_timeout AS phase_timeout,\n"
	"    to_timestamp(s.s_time) AS scan_time\n"
	"FROM uni_scans s\n"
	"JOIN uni_scan_phases p ON s.scans_id = p.scans_id\n"
	"WHERE s.num_phases > 1\n"
	"ORDER BY s.s_time DESC, p.phase_idx;\n";

/*
 * Schema v5 migration - add frontend support tables
 * Adds hosts tracking, services, OS fingerprints, networks, tags, notes, filters
 */
static const char *pgsql_schema_migration_v5_ddl =
	/* uni_hosts: Aggregate host tracking */
	"CREATE TABLE IF NOT EXISTS uni_hosts (\n"
	"    host_id     BIGINT NOT NULL DEFAULT nextval('uni_hosts_id_seq'),\n"
	"    host_addr   INET NOT NULL,\n"
	"    mac_addr    MACADDR,\n"
	"    hostname    VARCHAR(255),\n"
	"    first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
	"    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
	"    scan_count  INTEGER NOT NULL DEFAULT 1,\n"
	"    port_count  INTEGER NOT NULL DEFAULT 0,\n"
	"    extra_data  JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (host_id)\n"
	");\n"
	"\n"
	/* uni_host_scans: Junction table host ↔ scan */
	"CREATE TABLE IF NOT EXISTS uni_host_scans (\n"
	"    host_id        BIGINT NOT NULL,\n"
	"    scans_id       BIGINT NOT NULL,\n"
	"    first_response TIMESTAMPTZ DEFAULT NOW(),\n"
	"    response_count INTEGER DEFAULT 1,\n"
	"    PRIMARY KEY (host_id, scans_id)\n"
	");\n"
	"\n"
	/* uni_hops: Traceroute hop data */
	"CREATE TABLE IF NOT EXISTS uni_hops (\n"
	"    hop_id       BIGINT NOT NULL DEFAULT nextval('uni_hops_id_seq'),\n"
	"    ipreport_id  BIGINT NOT NULL,\n"
	"    scans_id     BIGINT NOT NULL,\n"
	"    target_addr  INET NOT NULL,\n"
	"    hop_addr     INET NOT NULL,\n"
	"    hop_number   SMALLINT,\n"
	"    ttl_observed SMALLINT NOT NULL,\n"
	"    rtt_us       INTEGER,\n"
	"    extra_data   JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (hop_id)\n"
	");\n"
	"\n"
	/* uni_services: Structured service identification */
	"CREATE TABLE IF NOT EXISTS uni_services (\n"
	"    service_id     BIGINT NOT NULL DEFAULT nextval('uni_services_id_seq'),\n"
	"    host_addr      INET NOT NULL,\n"
	"    port           INTEGER NOT NULL,\n"
	"    proto          SMALLINT NOT NULL,\n"
	"    scans_id       BIGINT NOT NULL,\n"
	"    ipreport_id    BIGINT,\n"
	"    service_name   VARCHAR(64),\n"
	"    product        VARCHAR(128),\n"
	"    version        VARCHAR(64),\n"
	"    extra_info     VARCHAR(256),\n"
	"    banner_raw     TEXT,\n"
	"    confidence     SMALLINT DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),\n"
	"    payload_module VARCHAR(64),\n"
	"    detected_at    TIMESTAMPTZ DEFAULT NOW(),\n"
	"    extra_data     JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (service_id)\n"
	");\n"
	"\n"
	/* uni_os_fingerprints: Parsed OS fingerprint data */
	"CREATE TABLE IF NOT EXISTS uni_os_fingerprints (\n"
	"    osfingerprint_id   BIGINT NOT NULL DEFAULT nextval('uni_osfingerprints_id_seq'),\n"
	"    host_addr          INET NOT NULL,\n"
	"    scans_id           BIGINT NOT NULL,\n"
	"    ipreport_id        BIGINT,\n"
	"    os_family          VARCHAR(64),\n"
	"    os_name            VARCHAR(128),\n"
	"    os_version         VARCHAR(64),\n"
	"    os_full            TEXT,\n"
	"    device_type        VARCHAR(64),\n"
	"    ttl_observed       SMALLINT,\n"
	"    window_size        INTEGER,\n"
	"    confidence         SMALLINT DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),\n"
	"    fingerprint_source VARCHAR(32) DEFAULT 'unicornscan',\n"
	"    detected_at        TIMESTAMPTZ DEFAULT NOW(),\n"
	"    extra_data         JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (osfingerprint_id)\n"
	");\n"
	"\n"
	/* uni_networks: Network/subnet grouping */
	"CREATE TABLE IF NOT EXISTS uni_networks (\n"
	"    network_id   BIGINT NOT NULL DEFAULT nextval('uni_networks_id_seq'),\n"
	"    network_cidr CIDR NOT NULL UNIQUE,\n"
	"    network_name VARCHAR(128),\n"
	"    description  TEXT,\n"
	"    network_type VARCHAR(32),\n"
	"    created_at   TIMESTAMPTZ DEFAULT NOW(),\n"
	"    updated_at   TIMESTAMPTZ DEFAULT NOW(),\n"
	"    extra_data   JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (network_id)\n"
	");\n"
	"\n"
	/* uni_host_networks: Junction host ↔ network */
	"CREATE TABLE IF NOT EXISTS uni_host_networks (\n"
	"    host_id    BIGINT NOT NULL,\n"
	"    network_id BIGINT NOT NULL,\n"
	"    added_at   TIMESTAMPTZ DEFAULT NOW(),\n"
	"    PRIMARY KEY (host_id, network_id)\n"
	");\n"
	"\n"
	/* uni_scan_tags: Flexible tagging system */
	"CREATE TABLE IF NOT EXISTS uni_scan_tags (\n"
	"    scans_id   BIGINT NOT NULL,\n"
	"    tag_name   VARCHAR(64) NOT NULL,\n"
	"    tag_value  VARCHAR(256),\n"
	"    created_at TIMESTAMPTZ DEFAULT NOW(),\n"
	"    PRIMARY KEY (scans_id, tag_name)\n"
	");\n"
	"\n"
	/* uni_notes: User annotations */
	"CREATE TABLE IF NOT EXISTS uni_notes (\n"
	"    note_id     BIGINT NOT NULL DEFAULT nextval('uni_notes_id_seq'),\n"
	"    entity_type VARCHAR(32) NOT NULL,\n"
	"    entity_id   BIGINT NOT NULL,\n"
	"    note_text   TEXT NOT NULL,\n"
	"    created_at  TIMESTAMPTZ DEFAULT NOW(),\n"
	"    updated_at  TIMESTAMPTZ DEFAULT NOW(),\n"
	"    created_by  VARCHAR(128),\n"
	"    PRIMARY KEY (note_id)\n"
	");\n"
	"\n"
	/* uni_saved_filters: Saved filter configurations */
	"CREATE TABLE IF NOT EXISTS uni_saved_filters (\n"
	"    filter_id     BIGINT NOT NULL DEFAULT nextval('uni_saved_filters_id_seq'),\n"
	"    filter_name   VARCHAR(128) NOT NULL,\n"
	"    filter_type   VARCHAR(32) NOT NULL,\n"
	"    filter_config JSONB NOT NULL,\n"
	"    is_default    BOOLEAN DEFAULT FALSE,\n"
	"    created_at    TIMESTAMPTZ DEFAULT NOW(),\n"
	"    updated_at    TIMESTAMPTZ DEFAULT NOW(),\n"
	"    created_by    VARCHAR(128),\n"
	"    PRIMARY KEY (filter_id)\n"
	");\n"
	"\n"
	/* Indexes for v5 tables */
	"CREATE UNIQUE INDEX IF NOT EXISTS uni_hosts_addr_mac_uniq ON uni_hosts(host_addr, COALESCE(mac_addr, '00:00:00:00:00:00'::macaddr));\n"
	"CREATE INDEX IF NOT EXISTS uni_hosts_addr_idx ON uni_hosts(host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_hosts_last_seen_idx ON uni_hosts(last_seen);\n"
	"CREATE INDEX IF NOT EXISTS uni_host_scans_scansid_idx ON uni_host_scans(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_hops_scansid_idx ON uni_hops(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_hops_target_idx ON uni_hops(target_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_hops_hop_idx ON uni_hops(hop_addr);\n"
	"CREATE UNIQUE INDEX IF NOT EXISTS uni_services_uniq ON uni_services(host_addr, port, proto, scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_services_host_idx ON uni_services(host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_services_port_idx ON uni_services(port);\n"
	"CREATE INDEX IF NOT EXISTS uni_services_scansid_idx ON uni_services(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_osfingerprints_host_idx ON uni_os_fingerprints(host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_osfingerprints_scansid_idx ON uni_os_fingerprints(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_scan_tags_name_idx ON uni_scan_tags(tag_name);\n"
	"CREATE INDEX IF NOT EXISTS uni_notes_entity_idx ON uni_notes(entity_type, entity_id);\n"
	"CREATE INDEX IF NOT EXISTS uni_saved_filters_name_idx ON uni_saved_filters(filter_name);\n"
	"CREATE INDEX IF NOT EXISTS uni_saved_filters_config_gin ON uni_saved_filters USING gin(filter_config);\n";

/*
 * Schema v5 constraints - foreign keys for new tables
 */
static const char *pgsql_schema_v5_constraints_ddl =
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_host_scans_hosts_fk') THEN\n"
	"        ALTER TABLE uni_host_scans ADD CONSTRAINT uni_host_scans_hosts_FK\n"
	"            FOREIGN KEY(host_id) REFERENCES uni_hosts(host_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_host_scans_scans_fk') THEN\n"
	"        ALTER TABLE uni_host_scans ADD CONSTRAINT uni_host_scans_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_hops_ipreport_fk') THEN\n"
	"        ALTER TABLE uni_hops ADD CONSTRAINT uni_hops_ipreport_FK\n"
	"            FOREIGN KEY(ipreport_id) REFERENCES uni_ipreport(ipreport_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_hops_scans_fk') THEN\n"
	"        ALTER TABLE uni_hops ADD CONSTRAINT uni_hops_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_services_scans_fk') THEN\n"
	"        ALTER TABLE uni_services ADD CONSTRAINT uni_services_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_services_ipreport_fk') THEN\n"
	"        ALTER TABLE uni_services ADD CONSTRAINT uni_services_ipreport_FK\n"
	"            FOREIGN KEY(ipreport_id) REFERENCES uni_ipreport(ipreport_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_osfingerprints_scans_fk') THEN\n"
	"        ALTER TABLE uni_os_fingerprints ADD CONSTRAINT uni_osfingerprints_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_osfingerprints_ipreport_fk') THEN\n"
	"        ALTER TABLE uni_os_fingerprints ADD CONSTRAINT uni_osfingerprints_ipreport_FK\n"
	"            FOREIGN KEY(ipreport_id) REFERENCES uni_ipreport(ipreport_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_host_networks_hosts_fk') THEN\n"
	"        ALTER TABLE uni_host_networks ADD CONSTRAINT uni_host_networks_hosts_FK\n"
	"            FOREIGN KEY(host_id) REFERENCES uni_hosts(host_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_host_networks_networks_fk') THEN\n"
	"        ALTER TABLE uni_host_networks ADD CONSTRAINT uni_host_networks_networks_FK\n"
	"            FOREIGN KEY(network_id) REFERENCES uni_networks(network_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_scan_tags_scans_fk') THEN\n"
	"        ALTER TABLE uni_scan_tags ADD CONSTRAINT uni_scan_tags_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n";

/*
 * Schema v5 RLS - enable RLS and create policies for new tables
 */
static const char *pgsql_schema_v5_rls_ddl =
	/* Enable RLS on new tables */
	"ALTER TABLE uni_hosts ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_host_scans ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_hops ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_services ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_os_fingerprints ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_networks ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_host_networks ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_scan_tags ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_notes ENABLE ROW LEVEL SECURITY;\n"
	"ALTER TABLE uni_saved_filters ENABLE ROW LEVEL SECURITY;\n"
	"\n"
	/* Drop and recreate policies */
	"DROP POLICY IF EXISTS \"Allow full access to hosts\" ON uni_hosts;\n"
	"DROP POLICY IF EXISTS \"Allow full access to host_scans\" ON uni_host_scans;\n"
	"DROP POLICY IF EXISTS \"Allow full access to hops\" ON uni_hops;\n"
	"DROP POLICY IF EXISTS \"Allow full access to services\" ON uni_services;\n"
	"DROP POLICY IF EXISTS \"Allow full access to os_fingerprints\" ON uni_os_fingerprints;\n"
	"DROP POLICY IF EXISTS \"Allow full access to networks\" ON uni_networks;\n"
	"DROP POLICY IF EXISTS \"Allow full access to host_networks\" ON uni_host_networks;\n"
	"DROP POLICY IF EXISTS \"Allow full access to scan_tags\" ON uni_scan_tags;\n"
	"DROP POLICY IF EXISTS \"Allow full access to notes\" ON uni_notes;\n"
	"DROP POLICY IF EXISTS \"Allow full access to saved_filters\" ON uni_saved_filters;\n"
	"\n"
	"CREATE POLICY \"Allow full access to hosts\" ON uni_hosts FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to host_scans\" ON uni_host_scans FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to hops\" ON uni_hops FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to services\" ON uni_services FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to os_fingerprints\" ON uni_os_fingerprints FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to networks\" ON uni_networks FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to host_networks\" ON uni_host_networks FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to scan_tags\" ON uni_scan_tags FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to notes\" ON uni_notes FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to saved_filters\" ON uni_saved_filters FOR ALL USING (true) WITH CHECK (true);\n";

/*
 * Schema v5 function - fn_upsert_host for auto-populating uni_hosts
 */
static const char *pgsql_schema_v5_functions_ddl =
	"CREATE OR REPLACE FUNCTION fn_upsert_host(\n"
	"    p_host_addr INET,\n"
	"    p_mac_addr MACADDR DEFAULT NULL\n"
	") RETURNS BIGINT\n"
	"LANGUAGE plpgsql\n"
	"AS $$\n"
	"DECLARE\n"
	"    v_host_id BIGINT;\n"
	"    v_mac_coalesce MACADDR;\n"
	"BEGIN\n"
	"    v_mac_coalesce := COALESCE(p_mac_addr, '00:00:00:00:00:00'::macaddr);\n"
	"    SELECT host_id INTO v_host_id\n"
	"    FROM uni_hosts\n"
	"    WHERE host_addr = p_host_addr\n"
	"      AND COALESCE(mac_addr, '00:00:00:00:00:00'::macaddr) = v_mac_coalesce;\n"
	"    IF v_host_id IS NOT NULL THEN\n"
	"        UPDATE uni_hosts\n"
	"        SET last_seen = NOW(),\n"
	"            scan_count = scan_count + 1\n"
	"        WHERE host_id = v_host_id;\n"
	"    ELSE\n"
	"        INSERT INTO uni_hosts (host_addr, mac_addr, first_seen, last_seen, scan_count)\n"
	"        VALUES (p_host_addr, p_mac_addr, NOW(), NOW(), 1)\n"
	"        RETURNING host_id INTO v_host_id;\n"
	"    END IF;\n"
	"    RETURN v_host_id;\n"
	"END;\n"
	"$$;\n";

/*
 * Schema v5 views - views for frontend support tables
 */
static const char *pgsql_schema_v5_views_ddl =
	/* v_hosts: Aggregate host information with calculated port count */
	"CREATE OR REPLACE VIEW v_hosts WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    h.host_id,\n"
	"    h.host_addr,\n"
	"    h.mac_addr,\n"
	"    h.hostname,\n"
	"    h.first_seen,\n"
	"    h.last_seen,\n"
	"    COALESCE((SELECT COUNT(DISTINCT hs.scans_id) FROM uni_host_scans hs WHERE hs.host_id = h.host_id), 0)::int4 AS scan_count,\n"
	"    COALESCE((SELECT COUNT(DISTINCT i.dport) FROM uni_ipreport i WHERE i.host_addr = h.host_addr), 0)::int4 AS port_count,\n"
	"    h.extra_data\n"
	"FROM uni_hosts h\n"
	"ORDER BY h.last_seen DESC;\n"
	"\n"
	/* v_services: Service identification */
	"CREATE OR REPLACE VIEW v_services WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    svc.service_id,\n"
	"    svc.host_addr,\n"
	"    svc.port,\n"
	"    CASE svc.proto WHEN 6 THEN 'TCP' WHEN 17 THEN 'UDP' ELSE 'OTHER' END AS protocol,\n"
	"    svc.service_name,\n"
	"    svc.product,\n"
	"    svc.version,\n"
	"    svc.extra_info,\n"
	"    svc.banner_raw,\n"
	"    svc.confidence,\n"
	"    svc.payload_module,\n"
	"    svc.detected_at,\n"
	"    svc.scans_id,\n"
	"    svc.extra_data\n"
	"FROM uni_services svc\n"
	"ORDER BY svc.detected_at DESC;\n"
	"\n"
	/* v_os_fingerprints: OS detection results */
	"CREATE OR REPLACE VIEW v_os_fingerprints WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    osf.osfingerprint_id,\n"
	"    osf.host_addr,\n"
	"    osf.os_family,\n"
	"    osf.os_name,\n"
	"    osf.os_version,\n"
	"    osf.os_full,\n"
	"    osf.device_type,\n"
	"    osf.ttl_observed,\n"
	"    osf.window_size,\n"
	"    osf.confidence,\n"
	"    osf.fingerprint_source,\n"
	"    osf.detected_at,\n"
	"    osf.scans_id,\n"
	"    osf.extra_data\n"
	"FROM uni_os_fingerprints osf\n"
	"ORDER BY osf.detected_at DESC;\n"
	"\n"
	/* v_hops: Network hop data */
	"CREATE OR REPLACE VIEW v_hops WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    hp.hop_id,\n"
	"    hp.target_addr,\n"
	"    hp.hop_addr,\n"
	"    hp.hop_number,\n"
	"    hp.ttl_observed,\n"
	"    hp.rtt_us,\n"
	"    hp.scans_id,\n"
	"    hp.extra_data\n"
	"FROM uni_hops hp\n"
	"ORDER BY hp.target_addr, hp.hop_number;\n"
	"\n"
	/* v_networks: Networks with host counts */
	"CREATE OR REPLACE VIEW v_networks WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    n.network_id,\n"
	"    n.network_cidr,\n"
	"    n.network_name,\n"
	"    n.description,\n"
	"    n.network_type,\n"
	"    n.created_at,\n"
	"    n.updated_at,\n"
	"    COUNT(DISTINCT hn.host_id) AS host_count,\n"
	"    n.extra_data\n"
	"FROM uni_networks n\n"
	"LEFT JOIN uni_host_networks hn ON n.network_id = hn.network_id\n"
	"GROUP BY n.network_id, n.network_cidr, n.network_name, n.description,\n"
	"         n.network_type, n.created_at, n.updated_at, n.extra_data\n"
	"ORDER BY n.network_cidr;\n";

/*
 * Schema v6 migration - add GeoIP integration
 * Stores geographic and network metadata at scan time for historical accuracy
 * Supports multiple providers: MaxMind (MVP), IP2Location, IPinfo
 */

/* Sequence for v6 migration (needed before table creation) */
static const char *pgsql_schema_geoip_seq_ddl =
	"CREATE SEQUENCE IF NOT EXISTS uni_geoip_id_seq;\n";

static const char *pgsql_schema_migration_v6_ddl =
	/* uni_geoip: Geographic and network metadata */
	"CREATE TABLE IF NOT EXISTS uni_geoip (\n"
	"    geoip_id       BIGINT NOT NULL DEFAULT nextval('uni_geoip_id_seq'),\n"
	"    host_ip        INET NOT NULL,\n"
	"    scans_id       BIGINT NOT NULL,\n"
	"\n"
	"    /* Geographic data */\n"
	"    country_code   CHAR(2),\n"
	"    country_name   VARCHAR(100),\n"
	"    region_code    VARCHAR(10),\n"
	"    region_name    VARCHAR(100),\n"
	"    city           VARCHAR(100),\n"
	"    postal_code    VARCHAR(20),\n"
	"    latitude       DECIMAL(9,6),\n"
	"    longitude      DECIMAL(9,6),\n"
	"    timezone       VARCHAR(64),\n"
	"\n"
	"    /* Network data (optional - requires paid databases) */\n"
	"    ip_type        VARCHAR(20),\n"
	"    isp            VARCHAR(200),\n"
	"    organization   VARCHAR(200),\n"
	"    asn            INTEGER,\n"
	"    as_org         VARCHAR(200),\n"
	"\n"
	"    /* Metadata */\n"
	"    provider       VARCHAR(50) NOT NULL,\n"
	"    database_version VARCHAR(50),\n"
	"    lookup_time    TIMESTAMPTZ DEFAULT NOW(),\n"
	"    confidence     SMALLINT CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),\n"
	"    extra_data     JSONB DEFAULT '{}'::jsonb,\n"
	"\n"
	"    PRIMARY KEY (geoip_id),\n"
	"    CONSTRAINT uni_geoip_unique UNIQUE (host_ip, scans_id)\n"
	");\n"
	"\n"
	/* Indexes for common query patterns */
	"CREATE INDEX IF NOT EXISTS idx_geoip_host ON uni_geoip(host_ip);\n"
	"CREATE INDEX IF NOT EXISTS idx_geoip_scan ON uni_geoip(scans_id);\n"
	"CREATE INDEX IF NOT EXISTS idx_geoip_country ON uni_geoip(country_code);\n"
	"CREATE INDEX IF NOT EXISTS idx_geoip_type ON uni_geoip(ip_type) WHERE ip_type IS NOT NULL;\n"
	"CREATE INDEX IF NOT EXISTS idx_geoip_asn ON uni_geoip(asn) WHERE asn IS NOT NULL;\n"
	"CREATE INDEX IF NOT EXISTS idx_geoip_location ON uni_geoip(latitude, longitude) WHERE latitude IS NOT NULL;\n";

/*
 * Schema v6 foreign key constraints
 */
static const char *pgsql_schema_v6_constraints_ddl =
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_geoip_scans_fk') THEN\n"
	"        ALTER TABLE uni_geoip ADD CONSTRAINT uni_geoip_scans_FK\n"
	"            FOREIGN KEY(scans_id) REFERENCES uni_scans(scans_id) ON DELETE CASCADE;\n"
	"    END IF;\n"
	"END $$;\n";

/*
 * Schema v6 RLS - enable RLS and create policies for GeoIP table
 */
static const char *pgsql_schema_v6_rls_ddl =
	"ALTER TABLE uni_geoip ENABLE ROW LEVEL SECURITY;\n"
	"DROP POLICY IF EXISTS \"Allow full access to geoip\" ON uni_geoip;\n"
	"CREATE POLICY \"Allow full access to geoip\" ON uni_geoip FOR ALL USING (true) WITH CHECK (true);\n";

/*
 * Schema v6 views - GeoIP data views for frontend
 */
static const char *pgsql_schema_v6_views_ddl =
	/* v_geoip: Geographic data with scan context */
	"CREATE OR REPLACE VIEW v_geoip WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    g.geoip_id,\n"
	"    g.host_ip,\n"
	"    g.scans_id,\n"
	"    g.country_code,\n"
	"    g.country_name,\n"
	"    g.region_code,\n"
	"    g.region_name,\n"
	"    g.city,\n"
	"    g.postal_code,\n"
	"    g.latitude,\n"
	"    g.longitude,\n"
	"    g.timezone,\n"
	"    g.ip_type,\n"
	"    g.isp,\n"
	"    g.organization,\n"
	"    g.asn,\n"
	"    g.as_org,\n"
	"    g.provider,\n"
	"    g.database_version,\n"
	"    g.lookup_time,\n"
	"    g.confidence,\n"
	"    g.extra_data\n"
	"FROM uni_geoip g\n"
	"ORDER BY g.lookup_time DESC;\n"
	"\n"
	/* v_geoip_stats: Aggregated country/type statistics per scan */
	"CREATE OR REPLACE VIEW v_geoip_stats WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    g.scans_id,\n"
	"    g.country_code,\n"
	"    g.country_name,\n"
	"    COUNT(*) AS host_count,\n"
	"    COUNT(DISTINCT g.asn) AS unique_asns,\n"
	"    COUNT(CASE WHEN g.ip_type = 'datacenter' THEN 1 END) AS datacenter_count,\n"
	"    COUNT(CASE WHEN g.ip_type = 'residential' THEN 1 END) AS residential_count,\n"
	"    COUNT(CASE WHEN g.ip_type = 'vpn' THEN 1 END) AS vpn_count,\n"
	"    COUNT(CASE WHEN g.ip_type = 'proxy' THEN 1 END) AS proxy_count,\n"
	"    COUNT(CASE WHEN g.ip_type = 'tor' THEN 1 END) AS tor_count,\n"
	"    COUNT(CASE WHEN g.ip_type = 'mobile' THEN 1 END) AS mobile_count\n"
	"FROM uni_geoip g\n"
	"GROUP BY g.scans_id, g.country_code, g.country_name\n"
	"ORDER BY host_count DESC;\n";

/*
 * Schema v7 migration - add target_str and src_addr columns to uni_scans
 */
static const char *pgsql_schema_migration_v7_ddl =
	"ALTER TABLE uni_scans ADD COLUMN IF NOT EXISTS target_str TEXT;\n"
	"ALTER TABLE uni_scans ADD COLUMN IF NOT EXISTS src_addr INET;\n";

/*
 * Schema v8 migration - add MAC<->IP history tracking
 */
static const char *pgsql_schema_migration_v8_ddl =
	/* uni_mac_ip_history table */
	"CREATE TABLE IF NOT EXISTS uni_mac_ip_history (\n"
	"    history_id       BIGINT NOT NULL DEFAULT nextval('uni_mac_ip_history_id_seq'),\n"
	"    host_addr        INET NOT NULL,\n"
	"    mac_addr         MACADDR NOT NULL,\n"
	"    first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
	"    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
	"    first_scans_id   BIGINT NOT NULL,\n"
	"    last_scans_id    BIGINT,\n"
	"    observation_count INTEGER NOT NULL DEFAULT 1,\n"
	"    extra_data       JSONB DEFAULT '{}'::jsonb,\n"
	"    PRIMARY KEY (history_id)\n"
	");\n"
	"\n"
	/* Indexes for MAC-IP history */
	"CREATE UNIQUE INDEX IF NOT EXISTS uni_mac_ip_history_addr_mac_uniq ON uni_mac_ip_history(host_addr, mac_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_mac_ip_history_addr_idx ON uni_mac_ip_history(host_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_mac_ip_history_mac_idx ON uni_mac_ip_history(mac_addr);\n"
	"CREATE INDEX IF NOT EXISTS uni_mac_ip_history_first_seen_idx ON uni_mac_ip_history(first_seen);\n"
	"CREATE INDEX IF NOT EXISTS uni_mac_ip_history_last_seen_idx ON uni_mac_ip_history(last_seen);\n"
	"\n"
	/* Foreign keys */
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_mac_ip_history_first_scans_fk') THEN\n"
	"        ALTER TABLE uni_mac_ip_history ADD CONSTRAINT uni_mac_ip_history_first_scans_FK\n"
	"            FOREIGN KEY(first_scans_id) REFERENCES uni_scans(scans_id) ON DELETE SET NULL;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	"DO $$ BEGIN\n"
	"    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uni_mac_ip_history_last_scans_fk') THEN\n"
	"        ALTER TABLE uni_mac_ip_history ADD CONSTRAINT uni_mac_ip_history_last_scans_FK\n"
	"            FOREIGN KEY(last_scans_id) REFERENCES uni_scans(scans_id) ON DELETE SET NULL;\n"
	"    END IF;\n"
	"END $$;\n"
	"\n"
	/* RLS for MAC-IP history */
	"ALTER TABLE uni_mac_ip_history ENABLE ROW LEVEL SECURITY;\n"
	"DROP POLICY IF EXISTS \"Allow full access to mac_ip_history\" ON uni_mac_ip_history;\n"
	"CREATE POLICY \"Allow full access to mac_ip_history\" ON uni_mac_ip_history FOR ALL USING (true) WITH CHECK (true);\n";

/*
 * Schema v8 function - fn_record_mac_ip for tracking MAC<->IP associations
 */
static const char *pgsql_schema_v8_functions_ddl =
	"CREATE OR REPLACE FUNCTION fn_record_mac_ip(\n"
	"    p_host_addr INET,\n"
	"    p_mac_addr MACADDR,\n"
	"    p_scans_id BIGINT\n"
	") RETURNS BIGINT\n"
	"LANGUAGE plpgsql\n"
	"AS $$\n"
	"DECLARE\n"
	"    v_history_id BIGINT;\n"
	"BEGIN\n"
	"    SELECT history_id INTO v_history_id\n"
	"    FROM uni_mac_ip_history\n"
	"    WHERE host_addr = p_host_addr AND mac_addr = p_mac_addr;\n"
	"    \n"
	"    IF v_history_id IS NOT NULL THEN\n"
	"        UPDATE uni_mac_ip_history\n"
	"        SET last_seen = NOW(),\n"
	"            last_scans_id = p_scans_id,\n"
	"            observation_count = observation_count + 1\n"
	"        WHERE history_id = v_history_id;\n"
	"    ELSE\n"
	"        INSERT INTO uni_mac_ip_history (host_addr, mac_addr, first_scans_id, last_scans_id)\n"
	"        VALUES (p_host_addr, p_mac_addr, p_scans_id, p_scans_id)\n"
	"        RETURNING history_id INTO v_history_id;\n"
	"    END IF;\n"
	"    RETURN v_history_id;\n"
	"END;\n"
	"$$;\n";

/*
 * Schema v8 views - MAC<->IP history views
 */
static const char *pgsql_schema_v8_views_ddl =
	/* v_mac_ip_history: Full history */
	"CREATE OR REPLACE VIEW v_mac_ip_history WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    h.history_id,\n"
	"    h.host_addr,\n"
	"    h.mac_addr,\n"
	"    h.first_seen,\n"
	"    h.last_seen,\n"
	"    h.first_scans_id,\n"
	"    h.last_scans_id,\n"
	"    h.observation_count,\n"
	"    EXTRACT(epoch FROM (NOW() - h.last_seen))::int4 AS age_seconds,\n"
	"    (SELECT s.profile FROM uni_scans s WHERE s.scans_id = h.first_scans_id) AS first_scan_profile,\n"
	"    (SELECT s.profile FROM uni_scans s WHERE s.scans_id = h.last_scans_id) AS last_scan_profile,\n"
	"    h.extra_data\n"
	"FROM uni_mac_ip_history h\n"
	"ORDER BY h.last_seen DESC;\n"
	"\n"
	/* v_current_mac_by_ip: Most recent MAC for each IP */
	"CREATE OR REPLACE VIEW v_current_mac_by_ip WITH (security_invoker = true) AS\n"
	"SELECT DISTINCT ON (host_addr)\n"
	"    host_addr,\n"
	"    mac_addr,\n"
	"    first_seen,\n"
	"    last_seen,\n"
	"    observation_count,\n"
	"    first_scans_id,\n"
	"    last_scans_id\n"
	"FROM uni_mac_ip_history\n"
	"ORDER BY host_addr, last_seen DESC;\n"
	"\n"
	/* v_current_ip_by_mac: Most recent IP for each MAC */
	"CREATE OR REPLACE VIEW v_current_ip_by_mac WITH (security_invoker = true) AS\n"
	"SELECT DISTINCT ON (mac_addr)\n"
	"    mac_addr,\n"
	"    host_addr,\n"
	"    first_seen,\n"
	"    last_seen,\n"
	"    observation_count,\n"
	"    first_scans_id,\n"
	"    last_scans_id\n"
	"FROM uni_mac_ip_history\n"
	"ORDER BY mac_addr, last_seen DESC;\n"
	"\n"
	/* v_mac_ip_changes: IPs with multiple MACs */
	"CREATE OR REPLACE VIEW v_mac_ip_changes WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    host_addr,\n"
	"    COUNT(*) AS mac_count,\n"
	"    ARRAY_AGG(mac_addr ORDER BY last_seen DESC) AS mac_addresses,\n"
	"    MIN(first_seen) AS first_observed,\n"
	"    MAX(last_seen) AS last_observed,\n"
	"    SUM(observation_count) AS total_observations\n"
	"FROM uni_mac_ip_history\n"
	"GROUP BY host_addr\n"
	"HAVING COUNT(*) > 1\n"
	"ORDER BY COUNT(*) DESC, MAX(last_seen) DESC;\n";

/*
 * Schema v8 update v_hosts view - add current_mac and mac_count
 */
static const char *pgsql_schema_v8_update_v_hosts_ddl =
	"CREATE OR REPLACE VIEW v_hosts WITH (security_invoker = true) AS\n"
	"SELECT\n"
	"    h.host_id,\n"
	"    h.host_addr,\n"
	"    h.mac_addr,\n"
	"    COALESCE(h.mac_addr, (\n"
	"        SELECT mh.mac_addr FROM uni_mac_ip_history mh\n"
	"        WHERE mh.host_addr = h.host_addr\n"
	"        ORDER BY mh.last_seen DESC LIMIT 1\n"
	"    )) AS current_mac,\n"
	"    h.hostname,\n"
	"    h.first_seen,\n"
	"    h.last_seen,\n"
	"    COALESCE((SELECT COUNT(DISTINCT hs.scans_id) FROM uni_host_scans hs WHERE hs.host_id = h.host_id), 0)::int4 AS scan_count,\n"
	"    COALESCE((SELECT COUNT(DISTINCT i.dport) FROM uni_ipreport i WHERE i.host_addr = h.host_addr), 0)::int4 AS port_count,\n"
	"    COALESCE((SELECT COUNT(*) FROM uni_mac_ip_history mh WHERE mh.host_addr = h.host_addr), 0)::int4 AS mac_count,\n"
	"    h.extra_data\n"
	"FROM uni_hosts h\n"
	"ORDER BY h.last_seen DESC;\n";

/*
 * Schema v9 migration - add eth_hwaddr column to uni_ipreport
 * This column stores the Ethernet source MAC for local network responses
 */
static const char *pgsql_schema_v9_add_eth_hwaddr_ddl =
	"ALTER TABLE uni_ipreport ADD COLUMN IF NOT EXISTS eth_hwaddr MACADDR;\n";

/*
 * Record schema version
 */
static const char *pgsql_schema_record_version_fmt =
	"INSERT INTO uni_schema_version (version) VALUES (%d)\n"
	"ON CONFLICT (version) DO NOTHING;\n";

#endif /* _PGSQL_SCHEMA_EMBEDDED_H */
