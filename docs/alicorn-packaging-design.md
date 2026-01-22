# Alicorn Debian Packaging Design

**Document Version:** 1.0
**Date:** 2026-01-20
**Author:** Architecture Agent

## Executive Summary

Alicorn is a React/Vite web application that provides a visual interface for unicornscan results. This document outlines the packaging approach for including Alicorn in the unicornscan Debian package for Kali Linux.

## Current State Analysis

### Source Structure
```
/opt/unicornscan/alicorn/
├── dist/                    # Pre-built production assets (~4.3MB)
│   ├── index.html          # Entry point
│   ├── vite.svg            # Favicon
│   └── assets/             # Bundled JS/CSS (hashed filenames)
├── src/                    # TypeScript source (not needed at runtime)
├── Dockerfile              # Multi-stage build (Node -> nginx)
├── docker-compose.standalone.yml  # Full stack deployment
├── nginx.conf              # SPA-aware nginx configuration
├── geoip-api/              # Node.js GeoIP lookup microservice
├── postgrest/              # PostgREST Dockerfile
├── cli/                    # Setup wizard (requires Node.js)
└── sql/                    # Database schema (symlink to src/output_modules)
```

### Build Output
The `npm run build` command produces:
- `dist/index.html` - Entry point with bundled script references
- `dist/assets/*.js` - Bundled JavaScript chunks (code-split)
- `dist/assets/*.css` - Bundled CSS
- `dist/vite.svg` - Static assets

Total size: **~4.3MB** (acceptable for a .deb package)

### Current Packaging (in main unicornscan .deb)
The existing `debian/rules` includes Alicorn files:
- Docker configuration files installed to `/usr/share/unicornscan/alicorn/`
- Source files (package.json, src/, etc.) for Docker builds
- Management script at `/usr/bin/unicornscan-alicorn`
- Runtime data directory at `/var/lib/unicornscan/alicorn/`

## Design Decision: Keep Current Approach

### Recommendation: **Docker-based deployment (status quo)**

After analyzing the architecture, the current Docker-based approach is the correct design for Kali users:

#### Reasons to Keep Docker Deployment

1. **Full Stack Requirement**
   - Alicorn is not just static files - it requires:
     - PostgreSQL database (stores scan results)
     - PostgREST (RESTful API layer)
     - GeoIP API service (IP geolocation)
   - These services are impractical to package as .deb dependencies

2. **Data Persistence**
   - Scan data is stored in PostgreSQL
   - Docker volumes provide clean separation of data/config/application
   - Works well with apt purge/reinstall cycles

3. **Kali User Profile**
   - Security professionals are comfortable with Docker
   - Kali already includes docker.io in repositories
   - Containerization provides isolation from host system

4. **SPA Routing Complexity**
   - React Router requires server-side fallback configuration
   - Plain file serving breaks client-side routing
   - nginx/Docker handles this correctly

### Alternative Considered: Static File Package

If we were to package Alicorn as static files without Docker:

```
Package: unicornscan-alicorn-static
Files:
  /usr/share/unicornscan-alicorn/dist/* -> Static HTML/JS/CSS
  /usr/bin/unicornscan-alicorn-serve   -> Python HTTP server wrapper
Depends: python3
Recommends: nginx | apache2
```

**Why this is rejected:**
- Would only support "demo mode" (no database)
- Cannot store scan results
- Limited utility without the full stack
- Creates user confusion about capabilities

## Current Architecture (Recommended)

### File Layout

```
/usr/share/unicornscan/alicorn/
├── docker-compose.yml          # Main compose file
├── Dockerfile                  # Web UI build
├── nginx.conf                  # SPA-aware config
├── package.json                # For npm install (Docker build)
├── package-lock.json           # Locked dependencies
├── index.html                  # Entry point
├── vite.config.ts              # Build configuration
├── tsconfig*.json              # TypeScript config
├── src/                        # Source code (for Docker build)
├── public/                     # Static assets
├── cli/                        # Setup wizard
│   └── setup.ts
├── geoip-api/                  # GeoIP microservice
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── postgrest/                  # PostgREST container
│   └── Dockerfile
└── sql/
    └── pgsql_schema.sql        # Database schema

/var/lib/unicornscan/alicorn/
├── .env                        # Generated credentials
└── .db_password                # Database password

/usr/bin/unicornscan-alicorn    # Management script
```

### Dependency Chain

```
Package: unicornscan
├── Depends: ${shlibs:Depends}, ${misc:Depends}
├── Recommends: docker.io, docker-compose-v2, libmaxminddb0
└── Suggests: nodejs (for development/setup wizard)
```

### Runtime Flow

1. User runs `sudo unicornscan-alicorn start`
2. Script checks Docker availability
3. Generates secure database password (first run)
4. Builds and starts Docker containers:
   - alicorn-postgres (PostgreSQL 16)
   - alicorn-postgrest (REST API)
   - alicorn-geoip (GeoIP lookups)
   - alicorn-web (nginx serving React app)
5. User accesses http://localhost:31337

## Enhancement Opportunities

### 1. Pre-built Images Option

Add support for pulling pre-built images instead of local builds:

```yaml
# docker-compose.yml with image references
services:
  alicorn:
    image: ghcr.io/unicornscan/alicorn:${VERSION}
    # ... or build locally if image unavailable
```

**Benefit:** Faster startup (skip 1-2 minute build time)

### 2. Systemd Integration (Optional)

For users wanting persistent service:

```ini
# /lib/systemd/system/unicornscan-alicorn.service
[Unit]
Description=Alicorn Web UI for Unicornscan
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/usr/share/unicornscan/alicorn
ExecStart=/usr/bin/unicornscan-alicorn start
ExecStop=/usr/bin/unicornscan-alicorn stop

[Install]
WantedBy=multi-user.target
```

**Status:** Not recommended by default (on-demand usage is more appropriate)

### 3. Lightweight Demo Mode

For users without Docker who want to preview the UI:

```bash
# unicornscan-alicorn demo
# Serves pre-built static files in demo mode
python3 -m http.server 31337 --directory /usr/share/unicornscan/alicorn/dist
```

**Limitation:** No database, mock data only

## Implementation Checklist

### Already Implemented
- [x] Docker-based full-stack deployment
- [x] Secure password generation
- [x] FHS-compliant file locations
- [x] Management script with start/stop/status/logs
- [x] PostgreSQL shell access
- [x] Integration with unicornscan -epgsqldb

### Potential Future Enhancements
- [ ] Pre-built Docker images on GitHub Container Registry
- [ ] Optional systemd service unit
- [ ] Demo mode without Docker
- [ ] Health check endpoint in management script

## Port Allocations

| Port  | Service    | Description                    |
|-------|------------|--------------------------------|
| 31337 | alicorn-web| Web UI (nginx)                 |
| 31338 | postgrest  | REST API                       |
| 3001  | geoip-api  | GeoIP lookups                  |
| 5432  | postgres   | Database (localhost only)      |

**Note:** Port 31337 (0x7A69 = "elite") is intentionally chosen for the security tool aesthetic.

## Security Considerations

1. **Database Credentials**
   - Generated randomly on first run
   - Stored in `/var/lib/unicornscan/alicorn/.db_password` (mode 600)
   - Automatically synced to `/etc/unicornscan/modules.conf`

2. **Network Exposure**
   - All services bind to localhost by default
   - No external exposure without explicit configuration
   - Docker network isolation between containers

3. **File Permissions**
   - Application files: root:root (read-only)
   - Runtime data: root:root with 600 permissions
   - Management requires sudo

## Conclusion

The current Docker-based packaging approach is well-designed for the Kali Linux target audience. The unicornscan package correctly bundles Alicorn as source files for Docker-based deployment, which provides:

1. Complete functionality (database + API + UI)
2. Clean separation of concerns
3. Easy management via unicornscan-alicorn script
4. Proper credential management
5. Integration with unicornscan's database export feature

No fundamental changes are recommended. Minor enhancements (pre-built images, demo mode) could be added incrementally without changing the core architecture.

---

## Appendix A: Serving Options Comparison

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Docker (current) | Full stack, isolated, reproducible | Requires Docker | **Recommended** |
| nginx package | Native, fast | Complex deps, no DB | Not suitable |
| python3 http.server | Zero deps | No SPA routing, no DB | Demo only |
| Node.js serve | Good SPA support | Adds Node.js dep | Overkill |

## Appendix B: Disk Space Analysis

```
Component                    Size
-------------------------------
Docker images (built):      ~500MB (shared layers)
PostgreSQL data (empty):    ~50MB
Application source:         ~5MB (in .deb)
Total .deb impact:          ~5MB
```

The source code in the .deb is small; Docker images are downloaded/built on first use.
