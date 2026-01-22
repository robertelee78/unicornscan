#!/bin/sh
#
# Generate secure PostgreSQL password for unicornscan database
# Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
#
# This script generates a random 32-character password using /dev/urandom
# and writes it to /etc/unicornscan/db_password or specified output file.
#

set -e

# Configuration
PASSWORD_LENGTH=32
CONFIG_DIR="${UNICORNSCAN_CONF:-/etc/unicornscan}"
PASSWORD_FILE="${CONFIG_DIR}/db_password"
MODULES_CONF="${CONFIG_DIR}/modules.conf"

# Generate a random password using /dev/urandom
generate_password() {
    # Use base64-safe characters only (alphanumeric, no special chars that break shell/SQL)
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c ${PASSWORD_LENGTH}
}

# Check if we're root or have permission to write config
check_permissions() {
    if [ ! -d "${CONFIG_DIR}" ]; then
        echo "Error: Config directory ${CONFIG_DIR} does not exist" >&2
        echo "Run 'make install' first to create the configuration directory" >&2
        exit 1
    fi

    if [ ! -w "${CONFIG_DIR}" ]; then
        echo "Error: Cannot write to ${CONFIG_DIR}" >&2
        echo "Run this script as root or with appropriate permissions" >&2
        exit 1
    fi
}

# Generate and save password
main() {
    # Parse arguments
    QUIET=0
    FORCE=0
    while [ $# -gt 0 ]; do
        case "$1" in
            -q|--quiet)
                QUIET=1
                shift
                ;;
            -f|--force)
                FORCE=1
                shift
                ;;
            -h|--help)
                echo "Usage: $(basename "$0") [-q|--quiet] [-f|--force]"
                echo ""
                echo "Generate a secure PostgreSQL password for unicornscan"
                echo ""
                echo "Options:"
                echo "  -q, --quiet   Suppress output (for use in scripts)"
                echo "  -f, --force   Regenerate password even if one exists"
                echo "  -h, --help    Show this help message"
                echo ""
                echo "The password is saved to ${PASSWORD_FILE}"
                echo "and can be used in modules.conf and PostgREST configuration"
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done

    check_permissions

    # Check if password already exists
    if [ -f "${PASSWORD_FILE}" ] && [ ${FORCE} -eq 0 ]; then
        if [ ${QUIET} -eq 0 ]; then
            echo "Password file already exists: ${PASSWORD_FILE}"
            echo "Use --force to regenerate"
        fi
        cat "${PASSWORD_FILE}"
        exit 0
    fi

    # Generate new password
    PASSWORD=$(generate_password)

    # Save password to file (mode 600 for security)
    printf '%s' "${PASSWORD}" > "${PASSWORD_FILE}"
    chmod 600 "${PASSWORD_FILE}"

    # Update modules.conf if it exists and has a pgsqldb section
    if [ -f "${MODULES_CONF}" ]; then
        if grep -q 'module "pgsqldb"' "${MODULES_CONF}"; then
            # Replace password in dbconf line
            sed -i "s/password=[^[:space:];]*/password=${PASSWORD}/" "${MODULES_CONF}"
            if [ ${QUIET} -eq 0 ]; then
                echo "Updated password in ${MODULES_CONF}"
            fi
        fi
    fi

    if [ ${QUIET} -eq 0 ]; then
        echo ""
        echo "Generated new PostgreSQL password"
        echo "================================="
        echo ""
        echo "Password saved to: ${PASSWORD_FILE}"
        echo ""
        echo "Password: ${PASSWORD}"
        echo ""
        echo "Use this password when configuring:"
        echo "  - PostgreSQL database user"
        echo "  - PostgREST PGRST_DB_URI"
        echo "  - Alicorn docker-compose.full.yml (.env file)"
        echo ""
        echo "To create the PostgreSQL user with this password:"
        echo "  sudo -u postgres psql -c \"ALTER USER alicorn WITH PASSWORD '${PASSWORD}';\""
        echo ""
    else
        # Quiet mode - just output the password
        echo "${PASSWORD}"
    fi
}

main "$@"
