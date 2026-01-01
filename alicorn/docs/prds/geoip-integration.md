# PRD: GeoIP Integration

**Document Version:** 1.0
**Created:** 2025-12-31
**Status:** Draft
**Author:** Claude Code

---

## 1. Executive Summary

Implement comprehensive GeoIP integration for Unicornscan/Alicorn that stores geographic and network metadata at scan time while also supporting live lookups from user-provided GeoIP databases. The system should be provider-agnostic, supporting MaxMind (MVP), IP2Location, and IPinfo.

## 2. Problem Statement

Currently, Unicornscan has basic GeoIP support via libmaxminddb, but it's only used for console output formatting (`%C` format specifier in report.c). Geographic data is not persisted to the database, limiting:

- Historical analysis of IP geographic distribution
- Visualization of scan results on maps
- Correlation of geographic patterns across scans
- Network type analysis (datacenter vs residential vs VPN)

## 3. Goals & Non-Goals

### Goals
- Store GeoIP data at scan time for historical accuracy
- Support live lookups in frontend for real-time analysis
- Provider-agnostic design (MaxMind MVP, IP2Location, IPinfo)
- Optional IP type detection (residential, datacenter, VPN, proxy, Tor)
- Geographic visualization in Alicorn UI
- Graceful degradation when GeoIP database unavailable

### Non-Goals
- Building our own GeoIP database
- Automatic GeoIP database updates (user responsibility)
- Real-time IP reputation/threat scoring (future feature)
- Reverse DNS integration (separate feature)

## 4. User Stories

1. **As a security analyst**, I want to see which countries my scan targets are located in, so I can identify geographic patterns in my network.

2. **As a penetration tester**, I want to filter scan results by region/country, so I can focus on specific geographic areas.

3. **As a network administrator**, I want to identify which IPs are datacenter vs residential, so I can understand my network composition.

4. **As a compliance officer**, I want historical records of IP locations at scan time, so I have accurate audit trails.

5. **As a user with limited budget**, I want GeoIP features to work with free databases (GeoLite2), with optional enhanced data from paid databases.

## 5. Technical Design

### 5.1 Database Schema (v6 Migration)

```sql
-- New table for GeoIP data
CREATE TABLE uni_geoip (
    geoip_id SERIAL PRIMARY KEY,
    host_ip VARCHAR(45) NOT NULL,           -- IPv4 or IPv6
    scans_id INTEGER REFERENCES uni_scans(scans_id),

    -- Geographic data
    country_code CHAR(2),                    -- ISO 3166-1 alpha-2
    country_name VARCHAR(100),
    region_code VARCHAR(10),                 -- State/province code
    region_name VARCHAR(100),
    city VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    timezone VARCHAR(64),

    -- Network data (optional - requires paid databases)
    ip_type VARCHAR(20),                     -- residential, datacenter, vpn, proxy, tor, mobile
    isp VARCHAR(200),
    organization VARCHAR(200),
    asn INTEGER,
    as_org VARCHAR(200),

    -- Metadata
    provider VARCHAR(50) NOT NULL,           -- maxmind, ip2location, ipinfo
    database_version VARCHAR(50),            -- e.g., "GeoLite2-City-20251230"
    lookup_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence INTEGER,                      -- 0-100 if provider supplies it

    -- Indexes
    CONSTRAINT uni_geoip_unique UNIQUE (host_ip, scans_id)
);

CREATE INDEX idx_geoip_host ON uni_geoip(host_ip);
CREATE INDEX idx_geoip_scan ON uni_geoip(scans_id);
CREATE INDEX idx_geoip_country ON uni_geoip(country_code);
CREATE INDEX idx_geoip_type ON uni_geoip(ip_type);
```

### 5.2 GeoIP Provider Abstraction

```c
// src/output_modules/database/geoip_provider.h

typedef struct geoip_result {
    char country_code[3];
    char country_name[101];
    char region_code[11];
    char region_name[101];
    char city[101];
    char postal_code[21];
    double latitude;
    double longitude;
    char timezone[65];

    // Optional fields (may be NULL)
    char *ip_type;        // residential, datacenter, vpn, proxy, tor
    char *isp;
    char *organization;
    uint32_t asn;
    char *as_org;

    int confidence;       // 0-100, -1 if not available
    char provider[51];
    char db_version[51];
} geoip_result_t;

typedef struct geoip_provider {
    const char *name;
    int (*init)(const char *db_path);
    int (*lookup)(const char *ip, geoip_result_t *result);
    void (*cleanup)(void);
} geoip_provider_t;

// Provider implementations
extern geoip_provider_t maxmind_provider;
extern geoip_provider_t ip2location_provider;
extern geoip_provider_t ipinfo_provider;
```

### 5.3 Provider Support Matrix

| Feature | MaxMind GeoLite2 (Free) | MaxMind GeoIP2 (Paid) | IP2Location | IPinfo |
|---------|------------------------|----------------------|-------------|--------|
| Country | ✓ | ✓ | ✓ | ✓ |
| Region/City | ✓ | ✓ | ✓ | ✓ |
| Lat/Long | ✓ | ✓ | ✓ | ✓ |
| Postal Code | ✓ | ✓ | ✓ | ✓ |
| ISP/Org | ✗ | ✓ (ASN db) | ✓ | ✓ |
| ASN | ✗ | ✓ | ✓ | ✓ |
| IP Type | ✗ | ✓ (Anonymous IP) | ✓ (PX db) | ✓ |
| Confidence | ✗ | ✓ | ✗ | ✗ |

### 5.4 Configuration

```ini
# unicornscan.conf additions

[geoip]
# Enable GeoIP lookups during scan output
enabled = true

# Primary provider: maxmind, ip2location, ipinfo
provider = maxmind

# Database paths (provider-specific)
maxmind_city_db = /var/lib/GeoIP/GeoLite2-City.mmdb
maxmind_asn_db = /var/lib/GeoIP/GeoLite2-ASN.mmdb
maxmind_anonymous_db = /var/lib/GeoIP/GeoIP2-Anonymous-IP.mmdb

ip2location_db = /var/lib/GeoIP/IP2LOCATION-LITE-DB11.BIN
ip2location_px_db = /var/lib/GeoIP/IP2PROXY-LITE-PX11.BIN

# IPinfo (requires API key for some features)
ipinfo_db = /var/lib/GeoIP/ipinfo_country.mmdb
ipinfo_api_key =

# Store GeoIP data in database (requires schema v6+)
store_in_db = true

# Lookup timeout in milliseconds
timeout_ms = 100

# Cache size (number of IPs to cache in memory)
cache_size = 10000
```

### 5.5 Frontend Architecture

```
alicorn/src/
├── lib/
│   └── geoip/
│       ├── index.ts              # GeoIP service exports
│       ├── types.ts              # GeoIP types
│       ├── providers/
│       │   ├── base.ts           # Abstract provider interface
│       │   ├── maxmind.ts        # MaxMind MMDB reader
│       │   ├── ip2location.ts    # IP2Location reader
│       │   └── stored.ts         # Database stored lookups
│       └── hooks.ts              # React Query hooks
├── features/
│   └── geoip/
│       ├── index.ts
│       ├── types.ts
│       ├── hooks.ts              # useGeoIPData, useGeoIPStats
│       ├── GeoMap.tsx            # Leaflet map component
│       ├── CountryBreakdown.tsx  # Country distribution chart
│       ├── IPTypeChart.tsx       # IP type pie chart
│       └── GeoTable.tsx          # Tabular GeoIP data
```

### 5.6 API Endpoints (Future REST API)

```
GET /api/geoip/:ip              # Single IP lookup
GET /api/geoip/scan/:scanId     # All GeoIP for scan
GET /api/geoip/stats/:scanId    # Aggregated stats
POST /api/geoip/bulk            # Bulk lookup
GET /api/geoip/providers        # Available providers
```

## 6. Implementation Phases

### Phase A: Database Schema & Backend Storage (Backend)
- Schema v6 migration with uni_geoip table
- GeoIP provider abstraction layer in C
- MaxMind provider implementation (MVP)
- Integration with pgsqldb.c output module
- Configuration file support

### Phase B: Additional Providers (Backend)
- IP2Location provider implementation
- IPinfo provider implementation
- Provider auto-detection based on database file
- Caching layer for performance

### Phase C: Frontend Data Layer (Frontend)
- TypeScript types for GeoIP data
- Database client extensions for GeoIP queries
- React Query hooks for GeoIP data
- Stored data display in host/scan details

### Phase D: Frontend Visualization (Frontend)
- Geographic map component (Leaflet)
- Country/region breakdown charts
- IP type distribution (when available)
- Integration into Statistics page
- GeoIP settings configuration UI

### Phase E: Live Lookup Service (Frontend - Optional)
- Frontend GeoIP database support
- MMDB reader in TypeScript/WASM
- Live lookup for IPs without stored data
- Comparison: stored vs live lookup

## 7. Dependencies

### Backend
- libmaxminddb (already in codebase)
- IP2Location C library (optional)
- libcurl for IPinfo API (optional)

### Frontend
- Leaflet + react-leaflet (maps)
- mmdb-lib or maxmind npm package (live lookups)
- ip2location-nodejs (optional)

## 8. Security Considerations

- GeoIP databases may contain PII (precise lat/long)
- API keys for IPinfo should be stored securely
- Rate limiting for live lookups
- User consent for location data storage

## 9. Testing Strategy

- Unit tests for each provider
- Integration tests with sample databases
- Mock databases for CI/CD
- Performance benchmarks (lookups/sec)

## 10. Success Metrics

- GeoIP data stored for >95% of scanned IPs (when enabled)
- Lookup performance <1ms per IP (cached)
- Map visualization renders <2 seconds for 10K IPs
- Zero crashes from GeoIP failures (graceful degradation)

## 11. Open Questions

1. Should we support GeoIP data export (CSV, JSON)?
2. Should we add GeoIP filtering to scan queries?
3. Priority for REST API vs direct database access?

## 12. References

- [MaxMind GeoIP2 Documentation](https://dev.maxmind.com/geoip/)
- [IP2Location Documentation](https://www.ip2location.com/development-libraries)
- [IPinfo Documentation](https://ipinfo.io/developers)
- [Leaflet Documentation](https://leafletjs.com/)
