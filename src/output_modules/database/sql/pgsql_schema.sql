-- Unicornscan PostgreSQL Schema v6
-- v6: Added GeoIP integration for geographic and network metadata
--     uni_geoip: Geographic and network data (country, region, city, lat/long, ISP, ASN, ip_type)
--     Supports multiple providers: MaxMind (GeoLite2/GeoIP2), IP2Location, IPinfo
--     IP type detection: residential, datacenter, vpn, proxy, tor, mobile
--     Historical accuracy: stores data at scan time for audit trails
-- v5: Added frontend support tables for web/mobile interfaces
--     uni_hosts: Aggregate host tracking with fn_upsert_host()
--     uni_host_scans: Junction table linking hosts to scans
--     uni_hops: Traceroute hop data from trace_addr
--     uni_services: Structured service identification (parsed banners)
--     uni_os_fingerprints: Parsed OS fingerprint data
--     uni_networks: Network/subnet grouping
--     uni_scan_tags: Flexible tagging system
--     uni_notes: User annotations on any entity
--     uni_saved_filters: Saved filter configurations
-- v4: Added compound mode support (mode_str, mode_flags, num_phases, etc.)
--     Added scan_notes for user annotations
--     Added uni_scan_phases table for per-phase configuration
--     Added v_scan_full and v_compound_phases views
-- v3: Added RLS (Row Level Security) for enhanced security
--     Changed views to SECURITY INVOKER to fix SECURITY DEFINER warnings
-- v2: Added JSONB columns for extensible metadata (scan_metadata, extra_data)

-- Drop v6 tables first
drop view if exists v_geoip_stats;
drop view if exists v_geoip;
drop table if exists "uni_geoip";
drop sequence if exists "uni_geoip_id_seq";

-- Drop new v5 tables (reverse dependency order)
drop function if exists fn_upsert_host(inet, macaddr);
drop table if exists "uni_saved_filters";
drop table if exists "uni_notes";
drop table if exists "uni_scan_tags";
drop table if exists "uni_host_networks";
drop table if exists "uni_networks";
drop table if exists "uni_os_fingerprints";
drop table if exists "uni_services";
drop table if exists "uni_hops";
drop table if exists "uni_host_scans";
drop table if exists "uni_hosts";
drop sequence if exists "uni_hosts_id_seq";
drop sequence if exists "uni_networks_id_seq";
drop sequence if exists "uni_services_id_seq";
drop sequence if exists "uni_osfingerprints_id_seq";
drop sequence if exists "uni_hops_id_seq";
drop sequence if exists "uni_notes_id_seq";
drop sequence if exists "uni_saved_filters_id_seq";

drop table if exists "uni_scan_phases";
drop table if exists "uni_sworkunits";
drop table if exists "uni_lworkunits";
drop table if exists "uni_workunitstats";
drop table if exists "uni_output";
drop table if exists "uni_ipreportdata";
drop table if exists "uni_ippackets";
drop table if exists "uni_arppackets";
drop table if exists "uni_ipreport";
drop sequence if exists "uni_ipreport_id_seq";
drop table if exists "uni_arpreport";
drop sequence if exists "uni_arpreport_id_seq";
drop table if exists "uni_scans";
drop sequence if exists "uni_scans_id_seq";
drop table if exists "uni_schema_version";

-- Schema version tracking
create table "uni_schema_version" (
	"version"	int4 not null,
	"applied_at"	timestamptz default now(),
	primary key ("version")
);

create sequence "uni_scans_id_seq";
-- MASTER INFORMATION
create table "uni_scans" (
	"scans_id"	int8 not null default nextval('uni_scans_id_seq'),
	"s_time"	int8 not null,
	"e_time"	int8 not null,
	"est_e_time"	int8 not null,
	"senders"	int2 not null,
	"listeners"	int2 not null,
	"scan_iter"	int2 not null,
	"profile"	varchar(200) not null,
	"options"	int4 not null,
	"payload_group"	int2 not null,
	"dronestr"	varchar(200) not null,
	"covertness"	int2 not null,
	"modules"	varchar(200) not null,
	"user"		varchar(200) not null,
	"pcap_dumpfile"	varchar(200),
	"pcap_readfile"	varchar(200),
	"tickrate"	int4 not null,
	"num_hosts"	double precision not null,
	"num_packets"	double precision not null,
	"scan_metadata"	jsonb default '{}'::jsonb,
	-- v4: compound mode and user notes
	"mode_str"	varchar(64),
	"mode_flags"	int2 default 0,
	"num_phases"	int2 default 1,
	"port_str"	text,
	"interface"	varchar(64),
	"tcpflags"	int4 default 0,
	"send_opts"	int4 default 0,
	"recv_opts"	int4 default 0,
	"pps"		int4 default 0,
	"recv_timeout"	int2 default 0,
	"repeats"	int4 default 0,
	"scan_notes"	text,
	-- v7: original command line target specification
	"target_str"	text,
	-- v7: source address specification (-s option / phantom IP)
	"src_addr"	inet,
	primary key("scans_id")
);

--- WORKUNITS
create table "uni_sworkunits" (
	"magic"		int8 not null,
	"scans_id"	int8 not null,
	"repeats"	int2 not null,
	"send_opts"	int4 not null,
	"pps"		int8 not null,
	"delay_type"	int2 not null,
	"myaddr"	inet not null,
	"mymask"	inet not null,
	"macaddr"	macaddr not null,
	"mtu"		int4 not null,
	"target"	inet not null,
	"targetmask"	inet not null,
	"tos"		int2 not null,
	"minttl"	int2 not null,
	"maxttl"	int2 not null,
	"fingerprint"	int2 not null,
	"src_port"	int4 not null,
	"ip_off"	int4 not null,
	"ipoptions"	bytea null,
	"tcpflags"	int4 not null,
	"tcpoptions"	bytea null,
	"window_size"	int4 not null,
	"syn_key"	int8 not null,
	"port_str"	text,
	-- tracking information
	"wid"		int8 not null,
	"status"	int2 not null
);

alter table "uni_sworkunits"
	add constraint uni_sworkunit_uniq_comp_LK
	unique ("scans_id", "wid");

alter table "uni_sworkunits"
	add constraint uni_sworkunit_uni_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id");

create table "uni_lworkunits" (
	"magic"		int8 not null,
	"scans_id"	int8 not null,
	"recv_timeout"	int2 not null,
	"ret_layers"	int2 not null,
	"recv_opts"	int4 not null,
	"window_size"	int8 not null,
	"syn_key"	int8 not null,
	"pcap_str"	text,
	-- tracking information
	"wid"		int8 not null,
	"status"	int2 not null
);

alter table "uni_lworkunits"
	add constraint uni_lworkunit_uniq_comp_LK
	unique ("scans_id", "wid");

alter table "uni_lworkunits"
	add constraint uni_lworkunit_uni_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id");

-- v4: Per-phase configuration for compound mode scans
create table "uni_scan_phases" (
	"scans_id"	int8 not null,
	"phase_idx"	int2 not null,
	"mode"		int2 not null,
	"mode_char"	char(1) not null,
	"tcphdrflgs"	int4 default 0,
	"send_opts"	int4 default 0,
	"recv_opts"	int4 default 0,
	"pps"		int4 default 0,
	"repeats"	int4 default 0,
	"recv_timeout"	int2 default 0,
	primary key ("scans_id", "phase_idx")
);

alter table "uni_scan_phases"
	add constraint uni_scan_phases_uni_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id");

create index uni_scan_phases_scansid_idx on uni_scan_phases("scans_id");

-- MISC INFO
create table "uni_workunitstats" (
	"wid"		int8 not null,
	"scans_id"	int8 not null,
	"msg"		text not null
);

alter table "uni_workunitstats"
	add constraint uni_workunitstats_uni_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id");

create table "uni_output" (
	"scans_id"	int8 not null,
	"msg"		text not null
);

alter table "uni_output"
	add constraint uni_output_uni_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id");

create sequence "uni_ipreport_id_seq";

create table "uni_ipreport" (
	"ipreport_id"	int8 not null default nextval('uni_ipreport_id_seq'),
	"scans_id"	int8 not null,
	"magic"		int8 not null,
	"sport"		int4 not null,
	"dport"		int4 not null,
	"proto"		int2 not null,
	"type"		int4 not null,
	"subtype"	int4 not null,
	"send_addr"	inet not null,
	"host_addr"	inet not null,
	"trace_addr"	inet not null,
	"ttl"		int2 not null,
	"tstamp"	int8 not null,
	"utstamp"	int8 not null,
	"flags"		int4 not null,
	"mseq"		int8 not null,
	"tseq"		int8 not null,
	"window_size"	int4 not null,
	"t_tstamp"	int8 not null,
	"m_tstamp"	int8 not null,
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("ipreport_id")
);

alter table "uni_ipreport"
	add constraint uni_ipreport_uni_scans_FK
	foreign key ("scans_id")
	references "uni_scans"("scans_id");

create index uni_ipreport_scansid_idx on uni_ipreport("scans_id");

create sequence "uni_arpreport_id_seq";

create table "uni_arpreport" (
	"arpreport_id"	int8 not null default nextval('uni_arpreport_id_seq'),
	"scans_id"	int8 not null,
	"magic"		int8 not null,
	"host_addr"	inet not null,
	"hwaddr"	macaddr not null,
	"tstamp"	int8 not null,
	"utstamp"	int8 not null,
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("arpreport_id")
);

alter table "uni_arpreport"
	add constraint uni_arpreport_uni_scans_FK
	foreign key ("scans_id")
	references "uni_scans"("scans_id");

create index uni_arpreport_scansid_idx on uni_arpreport("scans_id");

create table "uni_ipreportdata" (
	"ipreport_id"	int8 not null,
	"type"		int2 not null,
	"data"		text
);

alter table "uni_ipreportdata"
	add constraint uni_reportdata_uni_ipreport_FK
	foreign key("ipreport_id")
	references "uni_ipreport"("ipreport_id");

create table "uni_ippackets" (
	"ipreport_id"	int8 not null,
	"packet"	bytea not null
);

alter table "uni_ippackets"
	add constraint uni_ippackets_uni_ipreport_FK
	foreign key("ipreport_id")
	references "uni_ipreport"("ipreport_id");

create table "uni_arppackets" (
	"arpreport_id"	int8 not null,
	"packet"	bytea not null
);

alter table "uni_arppackets"
	add constraint uni_arppackets_uni_arpreport_FK
	foreign key("arpreport_id")
	references "uni_arpreport"("arpreport_id");

-- Additional indexes for common query patterns
-- Single-column indexes
create index uni_ipreport_host_addr_idx on uni_ipreport("host_addr");
create index uni_ipreport_dport_idx on uni_ipreport("dport");
create index uni_ipreport_sport_idx on uni_ipreport("sport");
create index uni_scans_s_time_idx on uni_scans("s_time");

-- Composite indexes for common query patterns
create index uni_ipreport_scan_host_idx on uni_ipreport("scans_id", "host_addr");
create index uni_ipreport_scan_dport_idx on uni_ipreport("scans_id", "dport");

-- GIN indexes for JSONB columns (efficient for containment queries)
create index uni_scans_metadata_gin on uni_scans using gin("scan_metadata");
create index uni_ipreport_extra_gin on uni_ipreport using gin("extra_data");
create index uni_arpreport_extra_gin on uni_arpreport using gin("extra_data");

-- ============================================
-- v5: FRONTEND SUPPORT TABLES
-- ============================================

-- ----------------------------------------
-- uni_hosts: Aggregate host tracking
-- Identity: IP-only for remote hosts, IP+MAC for local (ARP) scans
-- ----------------------------------------
create sequence "uni_hosts_id_seq";

create table "uni_hosts" (
	"host_id"	int8 not null default nextval('uni_hosts_id_seq'),
	"host_addr"	inet not null,
	"mac_addr"	macaddr,
	"hostname"	varchar(255),
	"first_seen"	timestamptz not null default now(),
	"last_seen"	timestamptz not null default now(),
	"scan_count"	int4 not null default 1,
	"port_count"	int4 not null default 0,
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("host_id")
);

-- Unique constraint: IP+MAC combination (MAC can be null for remote hosts)
create unique index uni_hosts_addr_mac_uniq on uni_hosts("host_addr", coalesce("mac_addr", '00:00:00:00:00:00'::macaddr));
create index uni_hosts_addr_idx on uni_hosts("host_addr");
create index uni_hosts_mac_idx on uni_hosts("mac_addr") where "mac_addr" is not null;
create index uni_hosts_last_seen_idx on uni_hosts("last_seen");

-- ----------------------------------------
-- uni_host_scans: Junction table (host ↔ scan)
-- ----------------------------------------
create table "uni_host_scans" (
	"host_id"	int8 not null,
	"scans_id"	int8 not null,
	"first_response"	timestamptz default now(),
	"response_count"	int4 default 1,
	primary key ("host_id", "scans_id")
);

alter table "uni_host_scans"
	add constraint uni_host_scans_hosts_FK
	foreign key("host_id")
	references "uni_hosts"("host_id") on delete cascade;

alter table "uni_host_scans"
	add constraint uni_host_scans_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id") on delete cascade;

create index uni_host_scans_scansid_idx on uni_host_scans("scans_id");

-- ----------------------------------------
-- uni_hops: Traceroute hop data
-- Populated when trace_addr != host_addr (indicates intermediate router)
-- ----------------------------------------
create sequence "uni_hops_id_seq";

create table "uni_hops" (
	"hop_id"	int8 not null default nextval('uni_hops_id_seq'),
	"ipreport_id"	int8 not null,
	"scans_id"	int8 not null,
	"target_addr"	inet not null,
	"hop_addr"	inet not null,
	"hop_number"	int2,
	"ttl_observed"	int2 not null,
	"rtt_us"	int4,
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("hop_id")
);

alter table "uni_hops"
	add constraint uni_hops_ipreport_FK
	foreign key("ipreport_id")
	references "uni_ipreport"("ipreport_id") on delete cascade;

alter table "uni_hops"
	add constraint uni_hops_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id") on delete cascade;

create index uni_hops_scansid_idx on uni_hops("scans_id");
create index uni_hops_target_idx on uni_hops("target_addr");
create index uni_hops_hop_idx on uni_hops("hop_addr");

-- ----------------------------------------
-- uni_services: Structured service identification
-- Parsed from banner/payload responses (Option B: structured parsing)
-- ----------------------------------------
create sequence "uni_services_id_seq";

create table "uni_services" (
	"service_id"	int8 not null default nextval('uni_services_id_seq'),
	"host_addr"	inet not null,
	"port"		int4 not null,
	"proto"		int2 not null,
	"scans_id"	int8 not null,
	"ipreport_id"	int8,
	"service_name"	varchar(64),
	"product"	varchar(128),
	"version"	varchar(64),
	"extra_info"	varchar(256),
	"banner_raw"	text,
	"confidence"	int2 default 0 check (confidence >= 0 and confidence <= 100),
	"payload_module"	varchar(64),
	"detected_at"	timestamptz default now(),
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("service_id")
);

alter table "uni_services"
	add constraint uni_services_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id") on delete cascade;

alter table "uni_services"
	add constraint uni_services_ipreport_FK
	foreign key("ipreport_id")
	references "uni_ipreport"("ipreport_id") on delete cascade;

-- Unique per host/port/proto/scan (allow multiple detections across scans)
create unique index uni_services_uniq on uni_services("host_addr", "port", "proto", "scans_id");
create index uni_services_host_idx on uni_services("host_addr");
create index uni_services_port_idx on uni_services("port");
create index uni_services_scansid_idx on uni_services("scans_id");
create index uni_services_name_idx on uni_services("service_name") where "service_name" is not null;

-- ----------------------------------------
-- uni_os_fingerprints: Parsed OS fingerprint data
-- Structured from OD_TYPE_OS responses
-- ----------------------------------------
create sequence "uni_osfingerprints_id_seq";

create table "uni_os_fingerprints" (
	"osfingerprint_id"	int8 not null default nextval('uni_osfingerprints_id_seq'),
	"host_addr"	inet not null,
	"scans_id"	int8 not null,
	"ipreport_id"	int8,
	"os_family"	varchar(64),
	"os_name"	varchar(128),
	"os_version"	varchar(64),
	"os_full"	text,
	"device_type"	varchar(64),
	"ttl_observed"	int2,
	"window_size"	int4,
	"confidence"	int2 default 0 check (confidence >= 0 and confidence <= 100),
	"fingerprint_source"	varchar(32) default 'unicornscan',
	"detected_at"	timestamptz default now(),
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("osfingerprint_id")
);

alter table "uni_os_fingerprints"
	add constraint uni_osfingerprints_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id") on delete cascade;

alter table "uni_os_fingerprints"
	add constraint uni_osfingerprints_ipreport_FK
	foreign key("ipreport_id")
	references "uni_ipreport"("ipreport_id") on delete cascade;

create index uni_osfingerprints_host_idx on uni_os_fingerprints("host_addr");
create index uni_osfingerprints_scansid_idx on uni_os_fingerprints("scans_id");
create index uni_osfingerprints_family_idx on uni_os_fingerprints("os_family") where "os_family" is not null;

-- ----------------------------------------
-- uni_networks: Network/subnet grouping
-- ----------------------------------------
create sequence "uni_networks_id_seq";

create table "uni_networks" (
	"network_id"	int8 not null default nextval('uni_networks_id_seq'),
	"network_cidr"	cidr not null unique,
	"network_name"	varchar(128),
	"description"	text,
	"network_type"	varchar(32),
	"created_at"	timestamptz default now(),
	"updated_at"	timestamptz default now(),
	"extra_data"	jsonb default '{}'::jsonb,
	primary key ("network_id")
);

create index uni_networks_cidr_idx on uni_networks using gist("network_cidr" inet_ops);

-- ----------------------------------------
-- uni_host_networks: Junction for host ↔ network membership
-- ----------------------------------------
create table "uni_host_networks" (
	"host_id"	int8 not null,
	"network_id"	int8 not null,
	"added_at"	timestamptz default now(),
	primary key ("host_id", "network_id")
);

alter table "uni_host_networks"
	add constraint uni_host_networks_hosts_FK
	foreign key("host_id")
	references "uni_hosts"("host_id") on delete cascade;

alter table "uni_host_networks"
	add constraint uni_host_networks_networks_FK
	foreign key("network_id")
	references "uni_networks"("network_id") on delete cascade;

-- ----------------------------------------
-- uni_scan_tags: Flexible tagging system
-- ----------------------------------------
create table "uni_scan_tags" (
	"scans_id"	int8 not null,
	"tag_name"	varchar(64) not null,
	"tag_value"	varchar(256),
	"created_at"	timestamptz default now(),
	primary key ("scans_id", "tag_name")
);

alter table "uni_scan_tags"
	add constraint uni_scan_tags_scans_FK
	foreign key("scans_id")
	references "uni_scans"("scans_id") on delete cascade;

create index uni_scan_tags_name_idx on uni_scan_tags("tag_name");
create index uni_scan_tags_value_idx on uni_scan_tags("tag_value") where "tag_value" is not null;

-- ----------------------------------------
-- uni_notes: User annotations on any entity
-- ----------------------------------------
create sequence "uni_notes_id_seq";

create table "uni_notes" (
	"note_id"	int8 not null default nextval('uni_notes_id_seq'),
	"entity_type"	varchar(32) not null,
	"entity_id"	int8 not null,
	"note_text"	text not null,
	"created_at"	timestamptz default now(),
	"updated_at"	timestamptz default now(),
	"created_by"	varchar(128),
	primary key ("note_id")
);

-- Check constraint for valid entity types
alter table "uni_notes"
	add constraint uni_notes_entity_type_chk
	check (entity_type in ('scan', 'host', 'ipreport', 'arpreport', 'service', 'network'));

create index uni_notes_entity_idx on uni_notes("entity_type", "entity_id");
create index uni_notes_created_idx on uni_notes("created_at");

-- ----------------------------------------
-- uni_saved_filters: Saved filter configurations
-- ----------------------------------------
create sequence "uni_saved_filters_id_seq";

create table "uni_saved_filters" (
	"filter_id"	int8 not null default nextval('uni_saved_filters_id_seq'),
	"filter_name"	varchar(128) not null,
	"filter_type"	varchar(32) not null,
	"filter_config"	jsonb not null,
	"is_default"	boolean default false,
	"created_at"	timestamptz default now(),
	"updated_at"	timestamptz default now(),
	"created_by"	varchar(128),
	primary key ("filter_id")
);

-- Check constraint for valid filter types
alter table "uni_saved_filters"
	add constraint uni_saved_filters_type_chk
	check (filter_type in ('scan', 'host', 'port', 'service', 'network', 'custom'));

create index uni_saved_filters_name_idx on uni_saved_filters("filter_name");
create index uni_saved_filters_type_idx on uni_saved_filters("filter_type");
create index uni_saved_filters_config_gin on uni_saved_filters using gin("filter_config");

-- ----------------------------------------
-- fn_upsert_host: Insert or update host record
-- Called from C code to auto-populate uni_hosts
-- Returns host_id
-- ----------------------------------------
create or replace function fn_upsert_host(
	p_host_addr inet,
	p_mac_addr macaddr default null
) returns int8
language plpgsql
as $$
declare
	v_host_id int8;
	v_mac_coalesce macaddr;
begin
	-- Coalesce NULL MAC to sentinel for uniqueness
	v_mac_coalesce := coalesce(p_mac_addr, '00:00:00:00:00:00'::macaddr);

	-- Try to find existing host
	select host_id into v_host_id
	from uni_hosts
	where host_addr = p_host_addr
	  and coalesce(mac_addr, '00:00:00:00:00:00'::macaddr) = v_mac_coalesce;

	if v_host_id is not null then
		-- Update existing host
		update uni_hosts
		set last_seen = now(),
		    scan_count = scan_count + 1
		where host_id = v_host_id;
	else
		-- Insert new host
		insert into uni_hosts (host_addr, mac_addr, first_seen, last_seen, scan_count)
		values (p_host_addr, p_mac_addr, now(), now(), 1)
		returning host_id into v_host_id;
	end if;

	return v_host_id;
end;
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tables for enhanced database security.
-- Since unicornscan connects directly with database credentials,
-- we create permissive policies that allow full access.
-- This pattern enables RLS while maintaining direct DB access.

-- Enable RLS on all tables
alter table uni_schema_version enable row level security;
alter table uni_scans enable row level security;
alter table uni_sworkunits enable row level security;
alter table uni_lworkunits enable row level security;
alter table uni_workunitstats enable row level security;
alter table uni_output enable row level security;
alter table uni_ipreport enable row level security;
alter table uni_arpreport enable row level security;
alter table uni_ipreportdata enable row level security;
alter table uni_ippackets enable row level security;
alter table uni_arppackets enable row level security;
alter table uni_scan_phases enable row level security;

-- Create permissive policies for direct database access
-- These policies allow full access for authenticated database connections
-- (postgres role or any role with direct DB credentials)

-- Policy for uni_schema_version
create policy "Allow full access to schema_version"
  on uni_schema_version for all
  using (true)
  with check (true);

-- Policy for uni_scans
create policy "Allow full access to scans"
  on uni_scans for all
  using (true)
  with check (true);

-- Policy for uni_sworkunits
create policy "Allow full access to sworkunits"
  on uni_sworkunits for all
  using (true)
  with check (true);

-- Policy for uni_lworkunits
create policy "Allow full access to lworkunits"
  on uni_lworkunits for all
  using (true)
  with check (true);

-- Policy for uni_workunitstats
create policy "Allow full access to workunitstats"
  on uni_workunitstats for all
  using (true)
  with check (true);

-- Policy for uni_output
create policy "Allow full access to output"
  on uni_output for all
  using (true)
  with check (true);

-- Policy for uni_ipreport
create policy "Allow full access to ipreport"
  on uni_ipreport for all
  using (true)
  with check (true);

-- Policy for uni_arpreport
create policy "Allow full access to arpreport"
  on uni_arpreport for all
  using (true)
  with check (true);

-- Policy for uni_ipreportdata
create policy "Allow full access to ipreportdata"
  on uni_ipreportdata for all
  using (true)
  with check (true);

-- Policy for uni_ippackets
create policy "Allow full access to ippackets"
  on uni_ippackets for all
  using (true)
  with check (true);

-- Policy for uni_arppackets
create policy "Allow full access to arppackets"
  on uni_arppackets for all
  using (true)
  with check (true);

-- Policy for uni_scan_phases
create policy "Allow full access to scan_phases"
  on uni_scan_phases for all
  using (true)
  with check (true);

-- v5: Enable RLS on new frontend support tables
alter table uni_hosts enable row level security;
alter table uni_host_scans enable row level security;
alter table uni_hops enable row level security;
alter table uni_services enable row level security;
alter table uni_os_fingerprints enable row level security;
alter table uni_networks enable row level security;
alter table uni_host_networks enable row level security;
alter table uni_scan_tags enable row level security;
alter table uni_notes enable row level security;
alter table uni_saved_filters enable row level security;

-- Policy for uni_hosts
create policy "Allow full access to hosts"
  on uni_hosts for all
  using (true)
  with check (true);

-- Policy for uni_host_scans
create policy "Allow full access to host_scans"
  on uni_host_scans for all
  using (true)
  with check (true);

-- Policy for uni_hops
create policy "Allow full access to hops"
  on uni_hops for all
  using (true)
  with check (true);

-- Policy for uni_services
create policy "Allow full access to services"
  on uni_services for all
  using (true)
  with check (true);

-- Policy for uni_os_fingerprints
create policy "Allow full access to os_fingerprints"
  on uni_os_fingerprints for all
  using (true)
  with check (true);

-- Policy for uni_networks
create policy "Allow full access to networks"
  on uni_networks for all
  using (true)
  with check (true);

-- Policy for uni_host_networks
create policy "Allow full access to host_networks"
  on uni_host_networks for all
  using (true)
  with check (true);

-- Policy for uni_scan_tags
create policy "Allow full access to scan_tags"
  on uni_scan_tags for all
  using (true)
  with check (true);

-- Policy for uni_notes
create policy "Allow full access to notes"
  on uni_notes for all
  using (true)
  with check (true);

-- Policy for uni_saved_filters
create policy "Allow full access to saved_filters"
  on uni_saved_filters for all
  using (true)
  with check (true);

-- ============================================
-- CONVENIENCE VIEWS (with SECURITY INVOKER)
-- ============================================
-- Using security_invoker=true ensures views respect RLS policies of
-- the underlying tables, running with the invoker's permissions rather
-- than the view creator's for enhanced security.
-- Note: Requires PostgreSQL 15+

-- v_open_ports: Human-readable port scan results
create or replace view v_open_ports
with (security_invoker = true) as
select
    s.scans_id,
    to_timestamp(s.s_time) as scan_time,
    s.profile,
    i.host_addr,
    i.dport as port,
    case i.proto
        when 6 then 'TCP'
        when 17 then 'UDP'
        when 1 then 'ICMP'
        else 'OTHER(' || i.proto || ')'
    end as protocol,
    i.ttl,
    to_timestamp(i.tstamp) as response_time,
    i.extra_data
from uni_scans s
join uni_ipreport i on s.scans_id = i.scans_id
order by s.s_time desc, i.host_addr, i.dport;

-- v_scan_summary: Aggregate statistics per scan
create or replace view v_scan_summary
with (security_invoker = true) as
select
    s.scans_id,
    to_timestamp(s.s_time) as started,
    to_timestamp(nullif(s.e_time, 0)) as completed,
    s.profile,
    s."user" as scan_user,
    s.num_hosts as target_hosts,
    s.num_packets as packets_sent,
    count(distinct i.host_addr) as hosts_responded,
    count(i.ipreport_id) as total_responses,
    count(distinct i.dport) as unique_ports,
    s.scan_metadata
from uni_scans s
left join uni_ipreport i on s.scans_id = i.scans_id
group by s.scans_id, s.s_time, s.e_time, s.profile, s."user",
         s.num_hosts, s.num_packets, s.scan_metadata;

-- v_recent_scans: Last 50 scans with key metrics
create or replace view v_recent_scans
with (security_invoker = true) as
select * from v_scan_summary
order by started desc
limit 50;

-- v_host_history: All results for a given host across all scans
create or replace view v_host_history
with (security_invoker = true) as
select
    i.host_addr,
    s.scans_id,
    to_timestamp(s.s_time) as scan_time,
    s.profile,
    i.dport as port,
    i.proto,
    i.ttl,
    i.sport as source_port,
    i.extra_data
from uni_ipreport i
join uni_scans s on i.scans_id = s.scans_id
order by i.host_addr, s.s_time desc, i.dport;

-- v_arp_results: Human-readable ARP scan results
create or replace view v_arp_results
with (security_invoker = true) as
select
    s.scans_id,
    to_timestamp(s.s_time) as scan_time,
    s.profile,
    a.host_addr as ip_address,
    a.hwaddr as mac_address,
    to_timestamp(a.tstamp) as response_time,
    a.extra_data
from uni_scans s
join uni_arpreport a on s.scans_id = a.scans_id
order by s.s_time desc, a.host_addr;

-- v_scan_full: Complete scan details including compound mode info
create or replace view v_scan_full
with (security_invoker = true) as
select
    s.scans_id,
    to_timestamp(s.s_time) as started,
    to_timestamp(nullif(s.e_time, 0)) as completed,
    s.profile,
    s."user" as scan_user,
    s.mode_str,
    s.mode_flags,
    s.num_phases,
    case when s.num_phases > 1 then true else false end as is_compound,
    s.port_str,
    s.interface,
    s.tcpflags,
    s.send_opts,
    s.recv_opts,
    s.pps,
    s.recv_timeout,
    s.repeats,
    s.scan_notes,
    s.num_hosts as target_hosts,
    s.num_packets as packets_sent,
    count(distinct i.host_addr) as hosts_responded,
    count(i.ipreport_id) as total_responses,
    s.scan_metadata
from uni_scans s
left join uni_ipreport i on s.scans_id = i.scans_id
group by s.scans_id, s.s_time, s.e_time, s.profile, s."user",
         s.mode_str, s.mode_flags, s.num_phases, s.port_str, s.interface,
         s.tcpflags, s.send_opts, s.recv_opts, s.pps, s.recv_timeout,
         s.repeats, s.scan_notes, s.num_hosts, s.num_packets, s.scan_metadata;

-- v_compound_phases: Phase details for compound mode scans
create or replace view v_compound_phases
with (security_invoker = true) as
select
    s.scans_id,
    s.mode_str,
    s.num_phases,
    p.phase_idx,
    p.mode_char,
    case p.mode
        when 1 then 'TCP'
        when 2 then 'UDP'
        when 4 then 'ARP'
        when 8 then 'ICMP'
        when 16 then 'IP'
        else 'UNKNOWN(' || p.mode || ')'
    end as mode_name,
    p.tcphdrflgs,
    p.pps as phase_pps,
    p.repeats as phase_repeats,
    p.recv_timeout as phase_timeout
from uni_scans s
join uni_scan_phases p on s.scans_id = p.scans_id
where s.num_phases > 1
order by s.scans_id, p.phase_idx;

-- ============================================
-- v5: VIEWS FOR FRONTEND SUPPORT TABLES
-- ============================================

-- v_hosts: Aggregate host information with scan counts and calculated port count
create or replace view v_hosts
with (security_invoker = true) as
select
    h.host_id,
    h.host_addr,
    h.mac_addr,
    h.hostname,
    h.first_seen,
    h.last_seen,
    h.scan_count,
    -- Calculate port_count from uni_ipreport since C code doesn't update uni_hosts.port_count
    coalesce(
        (select count(distinct i.dport) from uni_ipreport i where i.host_addr = h.host_addr),
        0
    )::int4 as port_count,
    (select count(distinct hs.scans_id) from uni_host_scans hs where hs.host_id = h.host_id) as actual_scan_count,
    h.extra_data
from uni_hosts h
order by h.last_seen desc;

-- v_host_details: Full host details with associated scans
create or replace view v_host_details
with (security_invoker = true) as
select
    h.host_id,
    h.host_addr,
    h.mac_addr,
    h.hostname,
    h.first_seen,
    h.last_seen,
    h.scan_count,
    h.port_count,
    array_agg(distinct s.scans_id order by s.scans_id desc) as scan_ids,
    array_agg(distinct s.profile order by s.profile) as scan_profiles,
    h.extra_data
from uni_hosts h
left join uni_host_scans hs on h.host_id = hs.host_id
left join uni_scans s on hs.scans_id = s.scans_id
group by h.host_id, h.host_addr, h.mac_addr, h.hostname,
         h.first_seen, h.last_seen, h.scan_count, h.port_count, h.extra_data;

-- v_services: Service identification with protocol names
create or replace view v_services
with (security_invoker = true) as
select
    svc.service_id,
    svc.host_addr,
    svc.port,
    case svc.proto
        when 6 then 'TCP'
        when 17 then 'UDP'
        else 'OTHER(' || svc.proto || ')'
    end as protocol,
    svc.service_name,
    svc.product,
    svc.version,
    svc.extra_info,
    svc.banner_raw,
    svc.confidence,
    svc.payload_module,
    svc.detected_at,
    s.scans_id,
    to_timestamp(s.s_time) as scan_time,
    svc.extra_data
from uni_services svc
join uni_scans s on svc.scans_id = s.scans_id
order by svc.detected_at desc;

-- v_services_by_host: Services grouped by host
create or replace view v_services_by_host
with (security_invoker = true) as
select
    svc.host_addr,
    count(distinct svc.port) as open_port_count,
    array_agg(distinct svc.port order by svc.port) as open_ports,
    array_agg(distinct svc.service_name order by svc.service_name)
        filter (where svc.service_name is not null) as services,
    max(svc.detected_at) as last_detected
from uni_services svc
group by svc.host_addr
order by svc.host_addr;

-- v_os_fingerprints: OS detection results with scan info
create or replace view v_os_fingerprints
with (security_invoker = true) as
select
    osf.osfingerprint_id,
    osf.host_addr,
    osf.os_family,
    osf.os_name,
    osf.os_version,
    osf.os_full,
    osf.device_type,
    osf.ttl_observed,
    osf.window_size,
    osf.confidence,
    osf.fingerprint_source,
    osf.detected_at,
    s.scans_id,
    to_timestamp(s.s_time) as scan_time,
    osf.extra_data
from uni_os_fingerprints osf
join uni_scans s on osf.scans_id = s.scans_id
order by osf.detected_at desc;

-- v_hops: Network hops with target information
create or replace view v_hops
with (security_invoker = true) as
select
    hp.hop_id,
    hp.target_addr,
    hp.hop_addr,
    hp.hop_number,
    hp.ttl_observed,
    hp.rtt_us,
    round(hp.rtt_us / 1000.0, 2) as rtt_ms,
    hp.scans_id,
    to_timestamp(s.s_time) as scan_time,
    hp.extra_data
from uni_hops hp
join uni_scans s on hp.scans_id = s.scans_id
order by hp.target_addr, hp.hop_number;

-- v_networks: Networks with host counts
create or replace view v_networks
with (security_invoker = true) as
select
    n.network_id,
    n.network_cidr,
    n.network_name,
    n.description,
    n.network_type,
    n.created_at,
    n.updated_at,
    count(distinct hn.host_id) as host_count,
    n.extra_data
from uni_networks n
left join uni_host_networks hn on n.network_id = hn.network_id
group by n.network_id, n.network_cidr, n.network_name, n.description,
         n.network_type, n.created_at, n.updated_at, n.extra_data
order by n.network_cidr;

-- v_scan_tags: Tags with scan info
create or replace view v_scan_tags
with (security_invoker = true) as
select
    t.scans_id,
    t.tag_name,
    t.tag_value,
    t.created_at,
    to_timestamp(s.s_time) as scan_time,
    s.profile
from uni_scan_tags t
join uni_scans s on t.scans_id = s.scans_id
order by t.created_at desc;

-- v_notes: Notes with entity context
create or replace view v_notes
with (security_invoker = true) as
select
    n.note_id,
    n.entity_type,
    n.entity_id,
    n.note_text,
    n.created_at,
    n.updated_at,
    n.created_by,
    case n.entity_type
        when 'scan' then (select profile from uni_scans where scans_id = n.entity_id)
        when 'host' then (select host(host_addr) from uni_hosts where host_id = n.entity_id)
        else null
    end as entity_name
from uni_notes n
order by n.updated_at desc;

-- v_saved_filters: Saved filters for quick access
create or replace view v_saved_filters
with (security_invoker = true) as
select
    f.filter_id,
    f.filter_name,
    f.filter_type,
    f.filter_config,
    f.is_default,
    f.created_at,
    f.updated_at,
    f.created_by
from uni_saved_filters f
order by f.is_default desc, f.filter_name;

-- v_host_services_os: Combined host view with services and OS info
create or replace view v_host_services_os
with (security_invoker = true) as
select
    h.host_id,
    h.host_addr,
    h.mac_addr,
    h.hostname,
    h.first_seen,
    h.last_seen,
    h.scan_count,
    (
        select json_agg(json_build_object(
            'port', svc.port,
            'proto', svc.proto,
            'service', svc.service_name,
            'product', svc.product,
            'version', svc.version
        ) order by svc.port)
        from uni_services svc
        where svc.host_addr = h.host_addr
    ) as services,
    (
        select json_build_object(
            'os_family', osf.os_family,
            'os_name', osf.os_name,
            'os_version', osf.os_version,
            'confidence', osf.confidence
        )
        from uni_os_fingerprints osf
        where osf.host_addr = h.host_addr
        order by osf.confidence desc, osf.detected_at desc
        limit 1
    ) as os_info,
    h.extra_data
from uni_hosts h
order by h.last_seen desc;

-- ============================================================================
-- Schema v6: GeoIP Integration
-- ============================================================================

-- uni_geoip: Geographic and network metadata
-- Stores geolocation data at scan time for historical accuracy
create sequence "uni_geoip_id_seq";

create table "uni_geoip" (
    "geoip_id"       int8 not null default nextval('uni_geoip_id_seq'),
    "host_ip"        inet not null,
    "scans_id"       int8 not null,

    -- Geographic data
    "country_code"   char(2),
    "country_name"   varchar(100),
    "region_code"    varchar(10),
    "region_name"    varchar(100),
    "city"           varchar(100),
    "postal_code"    varchar(20),
    "latitude"       decimal(9,6),
    "longitude"      decimal(9,6),
    "timezone"       varchar(64),

    -- Network data (optional - requires paid databases)
    "ip_type"        varchar(20),  -- residential, datacenter, vpn, proxy, tor, mobile
    "isp"            varchar(200),
    "organization"   varchar(200),
    "asn"            int4,
    "as_org"         varchar(200),

    -- Metadata
    "provider"       varchar(50) not null,  -- maxmind, ip2location, ipinfo
    "database_version" varchar(50),
    "lookup_time"    timestamptz default now(),
    "confidence"     int2 check (confidence is null or (confidence >= 0 and confidence <= 100)),
    "extra_data"     jsonb default '{}'::jsonb,

    primary key ("geoip_id"),
    constraint "uni_geoip_unique" unique ("host_ip", "scans_id")
);

-- Indexes for common query patterns
create index idx_geoip_host on uni_geoip("host_ip");
create index idx_geoip_scan on uni_geoip("scans_id");
create index idx_geoip_country on uni_geoip("country_code");
create index idx_geoip_type on uni_geoip("ip_type") where "ip_type" is not null;
create index idx_geoip_asn on uni_geoip("asn") where "asn" is not null;
create index idx_geoip_location on uni_geoip("latitude", "longitude") where "latitude" is not null;

-- Foreign key constraint
alter table "uni_geoip" add constraint "uni_geoip_scans_FK"
    foreign key("scans_id") references "uni_scans"("scans_id") on delete cascade;

-- RLS (Row Level Security)
alter table "uni_geoip" enable row level security;
drop policy if exists "Allow full access to geoip" on uni_geoip;
create policy "Allow full access to geoip" on uni_geoip for all using (true) with check (true);

-- v_geoip: Geographic data with scan context
create or replace view v_geoip
with (security_invoker = true) as
select
    g.geoip_id,
    g.host_ip,
    g.scans_id,
    g.country_code,
    g.country_name,
    g.region_code,
    g.region_name,
    g.city,
    g.postal_code,
    g.latitude,
    g.longitude,
    g.timezone,
    g.ip_type,
    g.isp,
    g.organization,
    g.asn,
    g.as_org,
    g.provider,
    g.database_version,
    g.lookup_time,
    g.confidence,
    g.extra_data
from uni_geoip g
order by g.lookup_time desc;

-- v_geoip_stats: Aggregated country/type statistics per scan
create or replace view v_geoip_stats
with (security_invoker = true) as
select
    g.scans_id,
    g.country_code,
    g.country_name,
    count(*) as host_count,
    count(distinct g.asn) as unique_asns,
    count(case when g.ip_type = 'datacenter' then 1 end) as datacenter_count,
    count(case when g.ip_type = 'residential' then 1 end) as residential_count,
    count(case when g.ip_type = 'vpn' then 1 end) as vpn_count,
    count(case when g.ip_type = 'proxy' then 1 end) as proxy_count,
    count(case when g.ip_type = 'tor' then 1 end) as tor_count,
    count(case when g.ip_type = 'mobile' then 1 end) as mobile_count
from uni_geoip g
group by g.scans_id, g.country_code, g.country_name
order by host_count desc;

-- Record schema version
insert into uni_schema_version (version) values (7);
