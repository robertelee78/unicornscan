# PostgreSQL with unicornscan schema pre-loaded
# Uses COPY instead of volume mount to avoid Colima/virtiofs issues
# on macOS where file mounts become directories
FROM postgres:16-alpine
COPY pgsql_schema.sql /docker-entrypoint-initdb.d/01_schema.sql
