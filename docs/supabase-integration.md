# Supabase Integration Guide

Store your unicornscan results in a cloud PostgreSQL database using [Supabase](https://supabase.com).

## Quick Start (5 Minutes)

### Option A: Interactive Setup Wizard (Recommended)

```bash
# Run the setup wizard
unicornscan --supabase-setup

# Follow the prompts to enter your Supabase URL and password
# Configuration is saved to ~/.unicornscan/supabase.conf

# Now run scans - credentials are loaded automatically
unicornscan -e pgsql -I 192.168.1.0/24
```

### Option B: Manual Configuration

#### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier available)
2. Click **New Project**
3. Set a database password (save this!) and create the project
4. Wait ~2 minutes for provisioning

#### 2. Get Your Connection Details

From your Supabase dashboard:

1. Go to **Project Settings** → **Database**
2. Copy:
   - **Project URL**: `https://xxxxx.supabase.co` (from Settings → API)
   - **Database Password**: The password you set when creating the project

#### 3. Run unicornscan with Supabase

```bash
# Using CLI flags
unicornscan --supabase-url https://xxxxx.supabase.co \
            --supabase-db-password YOUR_DB_PASSWORD \
            -e pgsql -I 192.168.1.0/24

# Or using environment variables
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_DB_PASSWORD="your_database_password"
unicornscan -e pgsql -I 192.168.1.0/24
```

**That's it!** The database schema is created automatically on first connection.

---

## CLI Reference

| Flag | Description | Required |
|------|-------------|----------|
| `--supabase-setup` | Run interactive setup wizard (saves to `~/.unicornscan/`) | No |
| `--supabase-url URL` | Supabase project URL (e.g., `https://xxxxx.supabase.co`) | Yes* |
| `--supabase-db-password PWD` | Database password (set during project creation) | Yes* |
| `--supabase-key KEY` | API key (optional, for future REST API features) | No |
| `-e pgsql` | Enable PostgreSQL output module | Yes |

*Not required if using saved configuration from `--supabase-setup`

### Examples

```bash
# Basic scan with immediate output
unicornscan --supabase-url https://myproject.supabase.co \
            --supabase-db-password "mypassword" \
            -e pgsql -I 10.0.0.0/24

# Full TCP port scan with OS detection
unicornscan --supabase-url https://myproject.supabase.co \
            --supabase-db-password "mypassword" \
            -e pgsql,osdetect -I target.com:1-65535

# UDP scan with DNS payloads
unicornscan --supabase-url https://myproject.supabase.co \
            --supabase-db-password "mypassword" \
            -e pgsql -mU target.com:53,123,161
```

---

## Environment Variables

Credentials can come from multiple sources. They're checked in this priority order:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | CLI flags | `--supabase-url`, `--supabase-db-password` |
| 2 | Environment: `UNICORNSCAN_SUPABASE_*` | unicornscan-specific env vars |
| 3 | Environment: `SUPABASE_*` | Standard Supabase env vars |
| 4 (lowest) | Config file | `~/.unicornscan/supabase.conf` |

### Saved Configuration File

The `--supabase-setup` wizard saves credentials to `~/.unicornscan/supabase.conf`:

```ini
# ~/.unicornscan/supabase.conf
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_DB_PASSWORD=your_database_password
```

The file is created with mode `0600` (owner read/write only). To remove saved credentials:

```bash
rm ~/.unicornscan/supabase.conf
```

### Shell Configuration Examples

**Bash (~/.bashrc):**
```bash
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_DB_PASSWORD="your_database_password"
```

**Fish (~/.config/fish/config.fish):**
```fish
set -gx SUPABASE_URL "https://xxxxx.supabase.co"
set -gx SUPABASE_DB_PASSWORD "your_database_password"
```

**Systemd service:**
```ini
[Service]
Environment="SUPABASE_URL=https://xxxxx.supabase.co"
Environment="SUPABASE_DB_PASSWORD=your_database_password"
ExecStart=/usr/local/bin/unicornscan -e pgsql 10.0.0.0/8
```

---

## Database Schema

The schema is automatically created when connecting to an empty database. All tables use `IF NOT EXISTS` for safe idempotent creation.

### Tables Overview

| Table | Description |
|-------|-------------|
| `uni_scans` | Main scan session metadata (timing, options, profile) |
| `uni_sworkunits` | Send workunit configuration |
| `uni_lworkunits` | Listen workunit configuration |
| `uni_workunitstats` | Workunit execution statistics |
| `uni_output` | General scan output messages |
| `uni_ipreport` | IP scan results (ports, protocols, timing) |
| `uni_arpreport` | ARP scan results (MAC addresses) |
| `uni_ipreportdata` | Additional IP report data |
| `uni_ippackets` | Raw IP packets (optional capture) |
| `uni_arppackets` | Raw ARP packets (optional capture) |
| `uni_schema_version` | Schema version tracking |

### Entity Relationship

```
uni_scans (1) ──────┬──> (N) uni_sworkunits
                    ├──> (N) uni_lworkunits
                    ├──> (N) uni_workunitstats
                    ├──> (N) uni_output
                    ├──> (N) uni_ipreport ────┬──> (N) uni_ipreportdata
                    │                         └──> (N) uni_ippackets
                    └──> (N) uni_arpreport ───> (N) uni_arppackets
```

### Key Columns

**uni_scans** (scan session):
- `scans_id` - Primary key
- `s_time`, `e_time` - Start/end timestamps (Unix epoch)
- `profile` - Scan profile name
- `num_hosts`, `num_packets` - Scan scope metrics
- `user` - User who ran the scan

**uni_ipreport** (IP results):
- `ipreport_id` - Primary key
- `scans_id` - Foreign key to scan session
- `host_addr` - Target IP address (PostgreSQL `INET` type)
- `dport` - Destination port
- `proto` - Protocol (6=TCP, 17=UDP, 1=ICMP)
- `type`, `subtype` - Response classification
- `ttl` - Observed TTL value
- `tstamp` - Response timestamp

**uni_arpreport** (ARP results):
- `arpreport_id` - Primary key
- `scans_id` - Foreign key to scan session
- `host_addr` - IP address
- `hwaddr` - MAC address (PostgreSQL `MACADDR` type)

### Indexes

The following indexes are created for optimal query performance:

```sql
CREATE INDEX uni_ipreport_scansid_idx ON uni_ipreport(scans_id);
CREATE INDEX uni_arpreport_scansid_idx ON uni_arpreport(scans_id);
CREATE INDEX uni_ipreport_host_addr_idx ON uni_ipreport(host_addr);
CREATE INDEX uni_ipreport_dport_idx ON uni_ipreport(dport);
CREATE INDEX uni_scans_s_time_idx ON uni_scans(s_time);
```

---

## Querying Results

### Via Supabase Dashboard

1. Go to your project's **SQL Editor**
2. Run queries directly:

```sql
-- Recent scans
SELECT scans_id, to_timestamp(s_time) AS started,
       profile, num_hosts, "user"
FROM uni_scans
ORDER BY s_time DESC
LIMIT 10;

-- Open ports from latest scan
SELECT host_addr, dport, proto, ttl
FROM uni_ipreport
WHERE scans_id = (SELECT MAX(scans_id) FROM uni_scans)
ORDER BY host_addr, dport;

-- Port summary across all scans
SELECT dport, COUNT(*) AS occurrences
FROM uni_ipreport
WHERE proto = 6  -- TCP
GROUP BY dport
ORDER BY occurrences DESC
LIMIT 20;
```

### Via psql CLI

```bash
# Using connection string
psql "postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# Using environment variable
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"
psql $DATABASE_URL
```

### Via Supabase Client Libraries

**JavaScript/TypeScript:**
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://xxxxx.supabase.co',
  'your-anon-key'
)

const { data, error } = await supabase
  .from('uni_ipreport')
  .select('host_addr, dport, ttl')
  .order('dport', { ascending: true })
```

**Python:**
```python
from supabase import create_client

supabase = create_client(
    "https://xxxxx.supabase.co",
    "your-anon-key"
)

response = supabase.table('uni_ipreport').select('*').execute()
```

---

## Troubleshooting

### Connection Errors

**"Cannot parse project reference from Supabase URL"**

The URL format must be `https://xxxxx.supabase.co` where `xxxxx` is your project reference.

```bash
# Correct
--supabase-url https://abcd1234.supabase.co

# Wrong - missing https://
--supabase-url abcd1234.supabase.co

# Wrong - has path
--supabase-url https://abcd1234.supabase.co/auth/v1
```

**"Supabase database password is not set"**

The database password must be provided via `--supabase-db-password` flag or environment variable.

```bash
# Fix: add password
--supabase-db-password "your_password"

# Or set environment variable
export SUPABASE_DB_PASSWORD="your_password"
```

**"connection refused" or timeout**

1. Check your Supabase project is active (not paused)
2. Verify your network allows outbound connections on port 5432
3. Check Project Settings → Database for connection details

**"authentication failed"**

1. Verify you're using the **database password** (set during project creation)
2. NOT the API key or service_role key
3. Reset password in Project Settings → Database → Reset Database Password

### Schema Issues

**"relation does not exist"**

The schema should auto-create on first connection. If tables are missing:

1. Check Supabase SQL Editor for errors
2. Manually create using `src/output_modules/database/sql/pgsql_schema.sql`
3. Or delete all `uni_*` tables and let unicornscan recreate them

**"permission denied"**

Supabase's default `postgres` user should have full permissions. If using Row Level Security (RLS):

```sql
-- Disable RLS for unicornscan tables
ALTER TABLE uni_scans DISABLE ROW LEVEL SECURITY;
ALTER TABLE uni_ipreport DISABLE ROW LEVEL SECURITY;
-- ... repeat for other tables
```

### Performance

**Slow inserts during high-PPS scans**

1. Consider batching results with `-R` (repeats) for multiple passes
2. Use local PostgreSQL for very high volume, then export to Supabase
3. Supabase connection has ~50-100ms latency; local is <1ms

---

## Security Best Practices

### 1. Never Commit Credentials

```bash
# Good - use environment variables
export SUPABASE_DB_PASSWORD="$(cat ~/.secrets/supabase_pw)"
unicornscan -e pgsql target.com

# Bad - credentials in command history
unicornscan --supabase-db-password "mysecretpw" -e pgsql target.com
```

### 2. Use Dedicated Database User (Advanced)

Instead of the default `postgres` user:

```sql
-- In Supabase SQL Editor
CREATE ROLE unicornscan WITH LOGIN PASSWORD 'unique_password';
GRANT ALL ON ALL TABLES IN SCHEMA public TO unicornscan;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO unicornscan;
```

Then modify the connection (requires code change or custom dbconf).

### 3. Enable SSL (Default)

Supabase connections are SSL-encrypted by default. The connection string includes `sslmode=require`.

### 4. IP Allowlisting

In Supabase Dashboard → Project Settings → Database:
- Enable "Enforce SSL"
- Add IP restrictions if on a fixed IP

### 5. Separate Development/Production

Create separate Supabase projects for:
- Development/testing (free tier)
- Production scans (paid tier for reliability)

---

## Building with PostgreSQL Support

If you built unicornscan without PostgreSQL support:

```bash
# Install libpq development files
sudo apt install libpq-dev      # Debian/Ubuntu
sudo dnf install libpq-devel    # Fedora/RHEL
brew install libpq              # macOS

# Reconfigure and rebuild
./configure --with-pgsql
make clean && make
make install
```

Verify the module is built:
```bash
ls -la $PREFIX/lib/unicornscan/modules/pgsqldb.*
```

---

## Architecture Notes

### Connection Flow

```
unicornscan
    │
    ├── parse --supabase-url → extract project reference
    │
    ├── build connection string: host=db.xxxxx.supabase.co port=5432 ...
    │
    ├── connect via libpq (PostgreSQL C client)
    │
    ├── check for uni_scans table existence
    │   └── if missing → execute embedded DDL (CREATE IF NOT EXISTS)
    │
    ├── insert scan session → uni_scans
    │
    ├── during scan → insert results → uni_ipreport / uni_arpreport
    │
    └── on completion → update scan end time
```

### Why Database Password vs API Key?

- **API Key** (`--supabase-key`): For Supabase REST/GraphQL API (PostgREST)
- **Database Password** (`--supabase-db-password`): For direct PostgreSQL connection (libpq)

Unicornscan uses libpq for direct SQL access, which requires the database password, not the API key. The API key option exists for potential future REST API features.

---

## See Also

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL libpq Documentation](https://www.postgresql.org/docs/current/libpq.html)
- [Unicornscan PostgreSQL Schema](../src/output_modules/database/sql/pgsql_schema.sql)
- [Main README](../README.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12 | Initial Supabase integration (FR-1, FR-2, FR-4, FR-6) |

Schema version: 1 (tracked in `uni_schema_version` table)
