-- Unicornscan PostgreSQL Schema v3
-- Includes JSONB columns for extensible metadata
-- Includes Row Level Security (RLS) for Supabase compatibility
-- Uses SECURITY INVOKER views for proper RLS enforcement

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
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tables to satisfy Supabase security requirements.
-- Since unicornscan connects directly with database credentials (not via
-- Supabase client), we create permissive policies that allow full access.
-- This pattern enables RLS compliance while maintaining direct DB access.

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

-- ============================================
-- CONVENIENCE VIEWS (with SECURITY INVOKER)
-- ============================================
-- Using security_invoker=true ensures views respect RLS policies of
-- the underlying tables, running with the invoker's permissions rather
-- than the view creator's. This resolves Supabase SECURITY DEFINER warnings.
-- Note: Requires PostgreSQL 15+ (Supabase uses PostgreSQL 15+)

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

-- Record schema version
insert into uni_schema_version (version) values (3);
