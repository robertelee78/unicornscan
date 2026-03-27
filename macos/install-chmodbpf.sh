#!/bin/sh
#
# install-chmodbpf.sh — Install the unicornscan ChmodBPF LaunchDaemon
#
# This script copies the ChmodBPF helper and its LaunchDaemon plist into
# the correct system locations, loads the daemon, and adds the current
# (invoking) user to the 'unicornscan' group.
#
# Must be run as root (or via sudo).
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$(basename "$0")"

BPF_GROUP="unicornscan"
CHMODBPF_SRC="${SCRIPT_DIR}/ChmodBPF"
PLIST_SRC="${SCRIPT_DIR}/org.unicornscan.ChmodBPF.plist"
CHMODBPF_DST="/usr/local/bin/ChmodBPF"
PLIST_DST="/Library/LaunchDaemons/org.unicornscan.ChmodBPF.plist"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() {
    echo "${SCRIPT_NAME}: ERROR: $1" >&2
    exit 1
}

info() {
    echo "${SCRIPT_NAME}: $1"
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
    die "This installer must be run as root.  Use: sudo $0"
fi

if [ "$(uname -s)" != "Darwin" ]; then
    die "This installer is intended for macOS (Darwin) only."
fi

if [ ! -f "${CHMODBPF_SRC}" ]; then
    die "Cannot find ChmodBPF script at ${CHMODBPF_SRC}"
fi

if [ ! -f "${PLIST_SRC}" ]; then
    die "Cannot find plist at ${PLIST_SRC}"
fi

# Determine the real (non-root) user who invoked sudo, if applicable.
REAL_USER="${SUDO_USER:-}"
if [ -z "${REAL_USER}" ]; then
    # Not running under sudo — try to detect via console login.
    REAL_USER="$(stat -f '%Su' /dev/console 2>/dev/null || true)"
fi
if [ -z "${REAL_USER}" ] || [ "${REAL_USER}" = "root" ]; then
    info "WARNING: Could not determine a non-root user to add to the '${BPF_GROUP}' group."
    info "         You can add users manually later with:"
    info "           sudo dseditgroup -o edit -a USERNAME -t user ${BPF_GROUP}"
    REAL_USER=""
fi

# ---------------------------------------------------------------------------
# If the daemon is already loaded, unload it first so we get a clean install.
# ---------------------------------------------------------------------------

if launchctl list org.unicornscan.ChmodBPF >/dev/null 2>&1; then
    info "Unloading existing LaunchDaemon..."
    launchctl unload "${PLIST_DST}" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Install the ChmodBPF script
# ---------------------------------------------------------------------------

info "Installing ${CHMODBPF_DST} ..."
mkdir -p "$(dirname "${CHMODBPF_DST}")"
cp -f "${CHMODBPF_SRC}" "${CHMODBPF_DST}"
chown root:wheel "${CHMODBPF_DST}"
chmod 755 "${CHMODBPF_DST}"

# ---------------------------------------------------------------------------
# Install the LaunchDaemon plist
# ---------------------------------------------------------------------------

info "Installing ${PLIST_DST} ..."
cp -f "${PLIST_SRC}" "${PLIST_DST}"
chown root:wheel "${PLIST_DST}"
chmod 644 "${PLIST_DST}"

# ---------------------------------------------------------------------------
# Load the daemon
# ---------------------------------------------------------------------------

info "Loading LaunchDaemon..."
if ! launchctl load "${PLIST_DST}"; then
    die "Failed to load LaunchDaemon.  Check ${PLIST_DST} for errors."
fi

info "LaunchDaemon loaded.  The ChmodBPF script will now run at every boot."

# ---------------------------------------------------------------------------
# Add the invoking user to the unicornscan group
# ---------------------------------------------------------------------------

if [ -n "${REAL_USER}" ]; then
    # The ChmodBPF script creates the group if needed, and it just ran via
    # launchctl load (RunAtLoad=true).  But in case the daemon hasn't
    # finished yet, create the group here too to be safe.
    if ! dseditgroup -o read "${BPF_GROUP}" >/dev/null 2>&1; then
        info "Creating group '${BPF_GROUP}'..."
        dseditgroup -o create -r "unicornscan BPF access" "${BPF_GROUP}"
    fi

    # Check if user is already a member before adding.
    if dseditgroup -o checkmember -m "${REAL_USER}" "${BPF_GROUP}" >/dev/null 2>&1; then
        info "User '${REAL_USER}' is already a member of '${BPF_GROUP}'."
    else
        info "Adding user '${REAL_USER}' to group '${BPF_GROUP}'..."
        if ! dseditgroup -o edit -a "${REAL_USER}" -t user "${BPF_GROUP}"; then
            die "Failed to add '${REAL_USER}' to group '${BPF_GROUP}'."
        fi
        info "User '${REAL_USER}' added to '${BPF_GROUP}'."
    fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "=========================================================="
echo "  Installation complete."
echo ""
echo "  The 'unicornscan' group now has read/write access to"
echo "  /dev/bpf* devices.  BPF permissions will be re-applied"
echo "  automatically at every system startup."
echo ""
if [ -n "${REAL_USER}" ]; then
echo "  User '${REAL_USER}' has been added to the '${BPF_GROUP}'"
echo "  group.  You MUST log out and log back in (or reboot)"
echo "  for the group membership to take effect."
fi
echo ""
echo "  To add other users:"
echo "    sudo dseditgroup -o edit -a USERNAME -t user ${BPF_GROUP}"
echo ""
echo "  To uninstall:"
echo "    sudo \$(brew --prefix 2>/dev/null || echo /usr/local)/share/unicornscan/macos/uninstall-chmodbpf.sh"
echo "=========================================================="
echo ""

exit 0
