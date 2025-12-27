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
 * This schema is auto-created when using Supabase integration with
 * a fresh database. Uses IF NOT EXISTS to be safe with existing databases.
 *
 * Schema version: 3
 * - v3: Added RLS (Row Level Security) for Supabase compliance
 *       Changed views to SECURITY INVOKER to fix SECURITY DEFINER warnings
 * - v2: Added JSONB columns for extensible metadata (scan_metadata, extra_data)
 */
#define PGSQL_SCHEMA_VERSION 3

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
	"CREATE SEQUENCE IF NOT EXISTS uni_arpreport_id_seq;\n";

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
	"END $$;\n";

/*
 * Row Level Security (RLS) for Supabase compatibility
 * Enable RLS on all tables and create permissive policies for direct DB access
 */
static const char *pgsql_schema_rls_ddl =
	/* Enable RLS on all tables */
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
	"CREATE POLICY \"Allow full access to workunitstats\" ON uni_workunitstats FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to output\" ON uni_output FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreport\" ON uni_ipreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arpreport\" ON uni_arpreport FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ipreportdata\" ON uni_ipreportdata FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to ippackets\" ON uni_ippackets FOR ALL USING (true) WITH CHECK (true);\n"
	"CREATE POLICY \"Allow full access to arppackets\" ON uni_arppackets FOR ALL USING (true) WITH CHECK (true);\n";

/*
 * Convenience views for common query patterns
 * Using CREATE OR REPLACE with security_invoker=true for Supabase compliance
 * Note: security_invoker requires PostgreSQL 15+ (Supabase uses PG 15+)
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
	"ORDER BY s.s_time DESC, a.host_addr;\n";

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
 * Schema v3 migration - add RLS and fix views for Supabase security compliance
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
	/* Update views to use security_invoker (requires PG 15+, Supabase uses PG 15+) */
	"ALTER VIEW v_open_ports SET (security_invoker = true);\n"
	"ALTER VIEW v_scan_summary SET (security_invoker = true);\n"
	"ALTER VIEW v_recent_scans SET (security_invoker = true);\n"
	"ALTER VIEW v_host_history SET (security_invoker = true);\n"
	"ALTER VIEW v_arp_results SET (security_invoker = true);\n";

/*
 * Record schema version
 */
static const char *pgsql_schema_record_version_fmt =
	"INSERT INTO uni_schema_version (version) VALUES (%d)\n"
	"ON CONFLICT (version) DO NOTHING;\n";

#endif /* _PGSQL_SCHEMA_EMBEDDED_H */
