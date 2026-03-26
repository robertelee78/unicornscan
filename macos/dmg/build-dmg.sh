#!/bin/sh
#
# build-dmg.sh — Build a macOS .dmg installer for unicornscan
#
# Creates a disk image containing:
#   - Install.pkg    : Installer package (binaries, modules, config, ChmodBPF)
#   - Alicorn.app    : Web UI application (if present)
#   - README.txt     : Quick-start instructions
#
# Usage:
#   ./macos/dmg/build-dmg.sh [OPTIONS]
#
# Options:
#   --version VERSION    Package version (default: read from configure.ac)
#   --destdir DIR        Path to make install DESTDIR output
#   --app-dir DIR        Path to Alicorn.app bundle (optional)
#   --output-dir DIR     Where to write the .dmg (default: ./packages)
#   --sign IDENTITY      Code-signing identity for productsign (optional)
#   --help               Show this help message
#
# The script should be run from the repository root after:
#   ./configure && make && make install DESTDIR=/tmp/unicornscan-stage
#
# Example:
#   make install DESTDIR=/tmp/unicornscan-stage
#   ./macos/dmg/build-dmg.sh --destdir /tmp/unicornscan-stage
#

set -e

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PKG_IDENTIFIER="org.unicornscan.pkg"
MIN_MACOS="13.0"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

VERSION=""
DESTDIR=""
APP_DIR=""
OUTPUT_DIR="${REPO_ROOT}/packages"
SIGN_IDENTITY=""
CODESIGN_IDENTITY=""
CLEANUP_DIRS=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() {
    echo "build-dmg: ERROR: $1" >&2
    cleanup
    exit 1
}

info() {
    echo "build-dmg: $1"
}

warn() {
    echo "build-dmg: WARNING: $1" >&2
}

usage() {
    sed -n '/^# Usage:/,/^#$/p' "$0" | sed 's/^# \?//'
    echo ""
    sed -n '/^# Options:/,/^#$/p' "$0" | sed 's/^# \?//'
    exit 0
}

cleanup() {
    if [ -n "${CLEANUP_DIRS}" ]; then
        for d in ${CLEANUP_DIRS}; do
            if [ -d "$d" ]; then
                rm -rf "$d"
            fi
        done
    fi
}

# Register a directory for cleanup on exit.
register_cleanup() {
    CLEANUP_DIRS="${CLEANUP_DIRS} $1"
}

# Verify a command exists.
require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        die "Required command '$1' not found.  $2"
    fi
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
    case "$1" in
        --version)
            shift
            VERSION="$1"
            ;;
        --destdir)
            shift
            DESTDIR="$1"
            ;;
        --app-dir)
            shift
            APP_DIR="$1"
            ;;
        --output-dir)
            shift
            OUTPUT_DIR="$1"
            ;;
        --sign)
            shift
            SIGN_IDENTITY="$1"
            ;;
        --codesign)
            shift
            CODESIGN_IDENTITY="$1"
            ;;
        --help|-h)
            usage
            ;;
        *)
            die "Unknown option: $1.  Use --help for usage."
            ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Validate environment
# ---------------------------------------------------------------------------

if [ "$(uname -s)" != "Darwin" ]; then
    die "This script must be run on macOS."
fi

require_cmd pkgbuild "Install Xcode command-line tools: xcode-select --install"
require_cmd productbuild "Install Xcode command-line tools: xcode-select --install"
require_cmd hdiutil "hdiutil should be available on any macOS system."

# ---------------------------------------------------------------------------
# Determine version
# ---------------------------------------------------------------------------

if [ -z "${VERSION}" ]; then
    # Try to read from configure.ac in the repo root.
    CONFIGURE_AC="${REPO_ROOT}/configure.ac"
    if [ -f "${CONFIGURE_AC}" ]; then
        # Extract version from AC_INIT([unicornscan], [X.Y.Z], ...)
        VERSION="$(sed -n 's/^AC_INIT(\[unicornscan\], *\[\([^]]*\)\].*/\1/p' "${CONFIGURE_AC}")"
    fi

    if [ -z "${VERSION}" ]; then
        die "Could not determine version.  Use --version or ensure configure.ac exists."
    fi
fi

info "Building DMG for unicornscan ${VERSION}"

# ---------------------------------------------------------------------------
# Validate DESTDIR
# ---------------------------------------------------------------------------

if [ -z "${DESTDIR}" ]; then
    die "No --destdir specified.  Run 'make install DESTDIR=/path' first, then pass --destdir /path."
fi

if [ ! -d "${DESTDIR}" ]; then
    die "DESTDIR does not exist: ${DESTDIR}"
fi

# Verify that essential files exist within the DESTDIR tree.
# The Makefile installs under DESTDIR/usr/local/ by default.
DESTDIR_BIN="${DESTDIR}/usr/local/bin"
DESTDIR_LIBEXEC="${DESTDIR}/usr/local/libexec/unicornscan"
DESTDIR_ETC="${DESTDIR}/usr/local/etc/unicornscan"
DESTDIR_LIB="${DESTDIR}/usr/local/lib/unicornscan"

if [ ! -f "${DESTDIR_BIN}/unicornscan" ]; then
    die "Cannot find unicornscan binary in ${DESTDIR_BIN}.  Did you run 'make install DESTDIR=${DESTDIR}'?"
fi

info "Using DESTDIR: ${DESTDIR}"

# ---------------------------------------------------------------------------
# Create working directories
# ---------------------------------------------------------------------------

WORK_DIR="$(mktemp -d -t unicornscan-dmg-build)"
register_cleanup "${WORK_DIR}"

PKG_ROOT="${WORK_DIR}/pkg-root"
PKG_SCRIPTS="${WORK_DIR}/pkg-scripts"
DMG_STAGING="${WORK_DIR}/staging"

mkdir -p "${PKG_ROOT}"
mkdir -p "${PKG_SCRIPTS}"
mkdir -p "${DMG_STAGING}"

info "Working directory: ${WORK_DIR}"

# ---------------------------------------------------------------------------
# Step 1: Assemble the package root (files to install)
# ---------------------------------------------------------------------------

info "Assembling package root..."

# --- Binaries: /usr/local/bin/ ---
mkdir -p "${PKG_ROOT}/usr/local/bin"
for bin in unicornscan fantaip unibrow unicfgtst; do
    SRC="${DESTDIR_BIN}/${bin}"
    if [ -f "${SRC}" ]; then
        cp -a "${SRC}" "${PKG_ROOT}/usr/local/bin/"
        info "  + /usr/local/bin/${bin}"
    else
        warn "Binary not found, skipping: ${SRC}"
    fi
done

# Copy the 'us' symlink if present.
if [ -L "${DESTDIR_BIN}/us" ] || [ -f "${DESTDIR_BIN}/us" ]; then
    cp -a "${DESTDIR_BIN}/us" "${PKG_ROOT}/usr/local/bin/"
    info "  + /usr/local/bin/us (symlink)"
fi

# --- Management scripts: /usr/local/bin/ ---
GEOIP_SCRIPT="${DESTDIR_BIN}/unicornscan-geoip-update"
if [ -f "${GEOIP_SCRIPT}" ]; then
    cp -a "${GEOIP_SCRIPT}" "${PKG_ROOT}/usr/local/bin/"
    info "  + /usr/local/bin/unicornscan-geoip-update"
else
    # Fall back to repo scripts/ directory.
    if [ -f "${REPO_ROOT}/scripts/unicornscan-geoip-update" ]; then
        cp "${REPO_ROOT}/scripts/unicornscan-geoip-update" "${PKG_ROOT}/usr/local/bin/"
        chmod 755 "${PKG_ROOT}/usr/local/bin/unicornscan-geoip-update"
        info "  + /usr/local/bin/unicornscan-geoip-update (from repo)"
    fi
fi

# --- Alicorn management script: /usr/local/bin/ ---
# The unicornscan-alicorn script manages the Docker-based Alicorn web UI
# stack (start/stop/status/logs).  It lives in debian/ for historical
# reasons but is cross-platform.  The Homebrew formula installs it from
# the same source (see macos/unicornscan.rb:91).
ALICORN_SCRIPT_SRC="${REPO_ROOT}/debian/unicornscan-alicorn"
if [ -f "${ALICORN_SCRIPT_SRC}" ]; then
    cp "${ALICORN_SCRIPT_SRC}" "${PKG_ROOT}/usr/local/bin/unicornscan-alicorn"
    chmod 755 "${PKG_ROOT}/usr/local/bin/unicornscan-alicorn"
    info "  + /usr/local/bin/unicornscan-alicorn"
else
    warn "unicornscan-alicorn script not found at ${ALICORN_SCRIPT_SRC}"
fi

# --- Install/uninstall helper scripts ---
for helper in install-chmodbpf.sh uninstall-chmodbpf.sh; do
    SRC="${REPO_ROOT}/macos/${helper}"
    if [ -f "${SRC}" ]; then
        cp "${SRC}" "${PKG_ROOT}/usr/local/bin/"
        chmod 755 "${PKG_ROOT}/usr/local/bin/${helper}"
        info "  + /usr/local/bin/${helper}"
    fi
done

# --- Modules: /usr/local/lib/unicornscan/modules/ ---
if [ -d "${DESTDIR_LIB}" ]; then
    mkdir -p "${PKG_ROOT}/usr/local/lib/unicornscan"
    cp -R "${DESTDIR_LIB}/"* "${PKG_ROOT}/usr/local/lib/unicornscan/"
    info "  + /usr/local/lib/unicornscan/ (modules)"
else
    warn "No modules directory found at ${DESTDIR_LIB}"
fi

# --- Config: /usr/local/etc/unicornscan/ ---
if [ -d "${DESTDIR_ETC}" ]; then
    mkdir -p "${PKG_ROOT}/usr/local/etc/unicornscan"
    cp -R "${DESTDIR_ETC}/"* "${PKG_ROOT}/usr/local/etc/unicornscan/"
    info "  + /usr/local/etc/unicornscan/ (config)"
else
    warn "No config directory found at ${DESTDIR_ETC}"
fi

# --- Libexec: /usr/local/libexec/unicornscan/ ---
if [ -d "${DESTDIR_LIBEXEC}" ]; then
    mkdir -p "${PKG_ROOT}/usr/local/libexec/unicornscan"
    cp -R "${DESTDIR_LIBEXEC}/"* "${PKG_ROOT}/usr/local/libexec/unicornscan/"
    info "  + /usr/local/libexec/unicornscan/ (unisend, unilisten)"
else
    warn "No libexec directory found at ${DESTDIR_LIBEXEC}"
fi

# --- ChmodBPF LaunchDaemon: /Library/LaunchDaemons/ ---
PLIST_SRC="${REPO_ROOT}/macos/org.unicornscan.ChmodBPF.plist"
if [ -f "${PLIST_SRC}" ]; then
    mkdir -p "${PKG_ROOT}/Library/LaunchDaemons"
    cp "${PLIST_SRC}" "${PKG_ROOT}/Library/LaunchDaemons/"
    info "  + /Library/LaunchDaemons/org.unicornscan.ChmodBPF.plist"
else
    warn "ChmodBPF plist not found at ${PLIST_SRC}"
fi

# --- ChmodBPF script: /usr/local/bin/ ---
CHMODBPF_SRC="${REPO_ROOT}/macos/ChmodBPF"
if [ -f "${CHMODBPF_SRC}" ]; then
    cp "${CHMODBPF_SRC}" "${PKG_ROOT}/usr/local/bin/ChmodBPF"
    chmod 755 "${PKG_ROOT}/usr/local/bin/ChmodBPF"
    info "  + /usr/local/bin/ChmodBPF"
else
    warn "ChmodBPF script not found at ${CHMODBPF_SRC}"
fi

# --- Sandbox profile: /usr/local/share/unicornscan/ ---
SANDBOX_SRC="${REPO_ROOT}/macos/unicornscan-listener.sb"
if [ -f "${SANDBOX_SRC}" ]; then
    mkdir -p "${PKG_ROOT}/usr/local/share/unicornscan"
    cp "${SANDBOX_SRC}" "${PKG_ROOT}/usr/local/share/unicornscan/"
    info "  + /usr/local/share/unicornscan/unicornscan-listener.sb"
else
    warn "Sandbox profile not found at ${SANDBOX_SRC}"
fi
SANDBOX_SENDER_SRC="${REPO_ROOT}/macos/unicornscan-sender.sb"
if [ -f "${SANDBOX_SENDER_SRC}" ]; then
    cp "${SANDBOX_SENDER_SRC}" "${PKG_ROOT}/usr/local/share/unicornscan/"
    info "  + /usr/local/share/unicornscan/unicornscan-sender.sb"
else
    warn "Sender sandbox profile not found at ${SANDBOX_SENDER_SRC}"
fi

# --- Alicorn files: /usr/local/share/unicornscan/alicorn/ ---
ALICORN_SRC="${REPO_ROOT}/alicorn"
if [ -d "${ALICORN_SRC}" ]; then
    mkdir -p "${PKG_ROOT}/usr/local/share/unicornscan/alicorn"

    # Docker Compose: install the standalone (full-stack) compose as the
    # primary docker-compose.yml.  The standalone variant bundles all four
    # services (postgres, postgrest, geoip-api, alicorn) so that
    # `unicornscan-alicorn start` works out of the box on a DMG install.
    # This mirrors what the Homebrew formula does (macos/unicornscan.rb:159).
    #
    # The dev-only docker-compose.yml (single web service, no database) and
    # docker-compose.full.yml are NOT installed — only the renamed standalone.
    if [ -f "${ALICORN_SRC}/docker-compose.standalone.yml" ]; then
        cp "${ALICORN_SRC}/docker-compose.standalone.yml" \
           "${PKG_ROOT}/usr/local/share/unicornscan/alicorn/docker-compose.yml"
        info "  + docker-compose.yml (standalone full-stack)"
    else
        warn "docker-compose.standalone.yml not found in ${ALICORN_SRC}"
    fi

    # Copy remaining Docker build contexts, source, and config files.
    for item in Dockerfile nginx.conf index.html \
                package.json package-lock.json \
                vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json \
                geoip-api postgrest sql cli src public; do
        if [ -e "${ALICORN_SRC}/${item}" ]; then
            cp -R "${ALICORN_SRC}/${item}" "${PKG_ROOT}/usr/local/share/unicornscan/alicorn/"
        fi
    done

    # Copy the postgres build context (needed by standalone compose).
    if [ -d "${ALICORN_SRC}/postgres" ]; then
        cp -R "${ALICORN_SRC}/postgres" "${PKG_ROOT}/usr/local/share/unicornscan/alicorn/"
    fi

    info "  + /usr/local/share/unicornscan/alicorn/ (web UI)"
else
    info "  Alicorn source not found — skipping."
fi

# --- State directory: /usr/local/var/unicornscan/ ---
mkdir -p "${PKG_ROOT}/usr/local/var/unicornscan"
info "  + /usr/local/var/unicornscan/ (state directory)"

# ---------------------------------------------------------------------------
# Step 1b: Bundle shared libraries and fix rpaths
# ---------------------------------------------------------------------------
# The binaries were linked against Homebrew dylibs at /opt/homebrew/.
# A DMG install must be self-contained — it cannot depend on Homebrew.
# We copy the required dylibs into /usr/local/lib/unicornscan/ and rewrite
# all load commands so binaries find them at their installed location.

info "Bundling shared libraries..."

BUNDLED_LIB_DIR="${PKG_ROOT}/usr/local/lib/unicornscan"
BUNDLED_LIB_INSTALL="/usr/local/lib/unicornscan"
mkdir -p "${BUNDLED_LIB_DIR}"

# Collect all non-system dylib dependencies from every Mach-O in the package.
# Then copy each unique dylib and rewrite load commands in all consumers.

collect_brew_dylibs() {
    # Scan a Mach-O binary for dylib references outside /usr/lib/.
    otool -L "$1" 2>/dev/null | awk '/^\t/ { print $1 }' | grep -v '^/usr/lib/' | grep -v '^/System/'
}

# Build a deduplicated list of all Homebrew dylibs needed.
DYLIB_LIST=""
for binary in \
    "${PKG_ROOT}/usr/local/bin/unicornscan" \
    "${PKG_ROOT}/usr/local/bin/fantaip" \
    "${PKG_ROOT}/usr/local/bin/unibrow" \
    "${PKG_ROOT}/usr/local/bin/unicfgtst" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unisend" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unilisten"; do
    if [ -f "$binary" ]; then
        for dylib in $(collect_brew_dylibs "$binary"); do
            case "${DYLIB_LIST}" in
                *"${dylib}"*) ;;  # already in list
                *) DYLIB_LIST="${DYLIB_LIST} ${dylib}" ;;
            esac
        done
    fi
done

# Also scan loadable modules (.so files).
if [ -d "${BUNDLED_LIB_DIR}/modules" ]; then
    for module in "${BUNDLED_LIB_DIR}/modules/"*.so; do
        if [ -f "$module" ]; then
            for dylib in $(collect_brew_dylibs "$module"); do
                case "${DYLIB_LIST}" in
                    *"${dylib}"*) ;;
                    *) DYLIB_LIST="${DYLIB_LIST} ${dylib}" ;;
                esac
            done
        fi
    done
fi

# Copy each dylib and recursively resolve transitive dependencies.
# Uses a work-queue approach: PENDING holds paths not yet processed,
# SEEN tracks all paths already queued to prevent infinite loops.
COPIED_DYLIBS=""
SEEN="${DYLIB_LIST}"
PENDING="${DYLIB_LIST}"

while [ -n "${PENDING}" ]; do
    # Pop the current batch and reset PENDING for newly discovered deps.
    CURRENT_BATCH="${PENDING}"
    PENDING=""

    for dylib in ${CURRENT_BATCH}; do
        BASENAME="$(basename "$dylib")"

        # Skip if already copied (basename collision from different paths).
        case "${COPIED_DYLIBS}" in
            *"${BASENAME}"*) continue ;;
        esac

        if [ -f "$dylib" ]; then
            cp "$dylib" "${BUNDLED_LIB_DIR}/${BASENAME}"
            chmod 644 "${BUNDLED_LIB_DIR}/${BASENAME}"
            COPIED_DYLIBS="${COPIED_DYLIBS} ${BASENAME}"
            info "  + lib/unicornscan/${BASENAME}"

            # Discover transitive deps from the original (not yet rewritten) dylib.
            for trans in $(collect_brew_dylibs "$dylib"); do
                case "${SEEN}" in
                    *"${trans}"*) ;;  # already seen
                    *)
                        SEEN="${SEEN} ${trans}"
                        PENDING="${PENDING} ${trans}"
                        # Also add to DYLIB_LIST so rewrite_dylib_refs covers it.
                        DYLIB_LIST="${DYLIB_LIST} ${trans}"
                        ;;
                esac
            done
        else
            warn "Dylib not found, skipping: ${dylib}"
        fi
    done
done

# Rewrite the install_name of each bundled dylib to its installed path.
for dname in ${COPIED_DYLIBS}; do
    BUNDLED="${BUNDLED_LIB_DIR}/${dname}"
    if [ -f "$BUNDLED" ]; then
        install_name_tool -id "${BUNDLED_LIB_INSTALL}/${dname}" "$BUNDLED" 2>/dev/null || true
    fi
done

# Rewrite load commands in all binaries and modules.
rewrite_dylib_refs() {
    local target="$1"
    for dylib in ${DYLIB_LIST}; do
        BASENAME="$(basename "$dylib")"
        NEW_PATH="${BUNDLED_LIB_INSTALL}/${BASENAME}"
        # Only rewrite if the old path differs from the new path.
        if [ "$dylib" != "$NEW_PATH" ]; then
            install_name_tool -change "$dylib" "$NEW_PATH" "$target" 2>/dev/null || true
        fi
    done
}

info "Rewriting dylib load paths..."

for binary in \
    "${PKG_ROOT}/usr/local/bin/unicornscan" \
    "${PKG_ROOT}/usr/local/bin/fantaip" \
    "${PKG_ROOT}/usr/local/bin/unibrow" \
    "${PKG_ROOT}/usr/local/bin/unicfgtst" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unisend" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unilisten"; do
    if [ -f "$binary" ]; then
        rewrite_dylib_refs "$binary"
    fi
done

# Rewrite module .so files too.
if [ -d "${BUNDLED_LIB_DIR}/modules" ]; then
    for module in "${BUNDLED_LIB_DIR}/modules/"*.so; do
        if [ -f "$module" ]; then
            rewrite_dylib_refs "$module"
        fi
    done
fi

# Also rewrite cross-references between bundled dylibs themselves.
for dname in ${COPIED_DYLIBS}; do
    BUNDLED="${BUNDLED_LIB_DIR}/${dname}"
    if [ -f "$BUNDLED" ]; then
        rewrite_dylib_refs "$BUNDLED"
    fi
done

# Re-sign all modified Mach-O files.
# install_name_tool invalidates the linker-generated ad-hoc signature.
# On macOS 11+, unsigned or invalidly-signed arm64 binaries are killed
# with SIGKILL (exit 137) by the kernel before they can execute.
#
# If --codesign IDENTITY is provided, sign with Developer ID Application
# (required for notarization: hardened runtime + secure timestamp).
# Otherwise, fall back to ad-hoc signing (sufficient for local use).
if [ -n "${CODESIGN_IDENTITY}" ]; then
    CODESIGN_FLAGS="-f -s ${CODESIGN_IDENTITY} --timestamp --options runtime"
    info "Signing with Developer ID: ${CODESIGN_IDENTITY}"
else
    CODESIGN_FLAGS="-f -s -"
    info "Ad-hoc signing (no --codesign identity provided)"
fi

info "Re-signing binaries and libraries..."

for binary in \
    "${PKG_ROOT}/usr/local/bin/unicornscan" \
    "${PKG_ROOT}/usr/local/bin/fantaip" \
    "${PKG_ROOT}/usr/local/bin/unibrow" \
    "${PKG_ROOT}/usr/local/bin/unicfgtst" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unisend" \
    "${PKG_ROOT}/usr/local/libexec/unicornscan/unilisten"; do
    if [ -f "$binary" ]; then
        codesign ${CODESIGN_FLAGS} "$binary" 2>/dev/null || warn "Failed to sign $(basename "$binary")"
    fi
done

for dname in ${COPIED_DYLIBS}; do
    BUNDLED="${BUNDLED_LIB_DIR}/${dname}"
    if [ -f "$BUNDLED" ]; then
        codesign ${CODESIGN_FLAGS} "$BUNDLED" 2>/dev/null || warn "Failed to sign ${dname}"
    fi
done

# Re-sign module .so files.
if [ -d "${BUNDLED_LIB_DIR}/modules" ]; then
    for module in "${BUNDLED_LIB_DIR}/modules/"*.so; do
        if [ -f "$module" ]; then
            codesign ${CODESIGN_FLAGS} "$module" 2>/dev/null || warn "Failed to sign $(basename "$module")"
        fi
    done
fi

info "Dylib bundling complete."

# ---------------------------------------------------------------------------
# Step 2: Copy installer scripts
# ---------------------------------------------------------------------------

info "Preparing installer scripts..."

PREINSTALL_SRC="${SCRIPT_DIR}/preinstall"
POSTINSTALL_SRC="${SCRIPT_DIR}/postinstall"

if [ -f "${PREINSTALL_SRC}" ]; then
    cp "${PREINSTALL_SRC}" "${PKG_SCRIPTS}/preinstall"
    chmod 755 "${PKG_SCRIPTS}/preinstall"
    info "  + preinstall script"
else
    die "preinstall script not found at ${PREINSTALL_SRC}"
fi

if [ -f "${POSTINSTALL_SRC}" ]; then
    cp "${POSTINSTALL_SRC}" "${PKG_SCRIPTS}/postinstall"
    chmod 755 "${PKG_SCRIPTS}/postinstall"
    info "  + postinstall script"
else
    die "postinstall script not found at ${POSTINSTALL_SRC}"
fi

# ---------------------------------------------------------------------------
# Step 3: Build the component package with pkgbuild
# ---------------------------------------------------------------------------

COMPONENT_PKG="${WORK_DIR}/unicornscan-component.pkg"

info "Building component package with pkgbuild..."

pkgbuild \
    --root "${PKG_ROOT}" \
    --identifier "${PKG_IDENTIFIER}" \
    --version "${VERSION}" \
    --scripts "${PKG_SCRIPTS}" \
    --install-location "/" \
    "${COMPONENT_PKG}"

if [ ! -f "${COMPONENT_PKG}" ]; then
    die "pkgbuild failed to create component package."
fi

info "Component package created: $(du -h "${COMPONENT_PKG}" | cut -f1) bytes"

# ---------------------------------------------------------------------------
# Step 4: Build the product archive with productbuild
# ---------------------------------------------------------------------------
# productbuild wraps the component package into a distribution package
# that supports the macOS Installer UI, license agreements, and
# minimum system version requirements.

DISTRIBUTION_XML="${WORK_DIR}/distribution.xml"

cat > "${DISTRIBUTION_XML}" << DISTXML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>Unicornscan ${VERSION}</title>
    <background file="background.png" alignment="bottomleft" scaling="none" />
    <welcome file="welcome.html" />
    <options
        customize="never"
        require-scripts="true"
        rootVolumeOnly="true"
        hostArchitectures="arm64" />
    <volume-check>
        <allowed-os-versions>
            <os-version min="${MIN_MACOS}" />
        </allowed-os-versions>
    </volume-check>
    <choices-outline>
        <line choice="default">
            <line choice="unicornscan" />
        </line>
    </choices-outline>
    <choice id="default" />
    <choice id="unicornscan"
            visible="false"
            title="Unicornscan"
            description="Network scanner with asynchronous stateless TCP/UDP probing">
        <pkg-ref id="${PKG_IDENTIFIER}" />
    </choice>
    <pkg-ref id="${PKG_IDENTIFIER}"
             version="${VERSION}"
             onConclusion="none">unicornscan-component.pkg</pkg-ref>
</installer-gui-script>
DISTXML

# Create a minimal welcome page for the installer.
RESOURCES_DIR="${WORK_DIR}/resources"
mkdir -p "${RESOURCES_DIR}"

cat > "${RESOURCES_DIR}/welcome.html" << 'WELCOME'
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: -apple-system, Helvetica Neue, sans-serif; margin: 20px; color-scheme: light dark; }
h1 { font-size: 24px; }
p { font-size: 14px; line-height: 1.6; }
li { font-size: 14px; line-height: 1.6; }
code { padding: 2px 6px; border-radius: 3px; font-size: 13px; }
</style>
</head>
<body>
<h1>Unicornscan</h1>
<p>This installer will set up Unicornscan on your Mac.</p>
<p>The following components will be installed:</p>
<ul>
<li>Scanner binaries (<code>unicornscan</code>, <code>fantaip</code>, <code>unibrow</code>)</li>
<li>Listener and sender daemons (<code>unilisten</code>, <code>unisend</code>)</li>
<li>Scanner modules (payload, output, report)</li>
<li>Configuration files</li>
<li>ChmodBPF LaunchDaemon (non-root packet capture)</li>
<li>Sandbox security profile</li>
</ul>
<p>After installation, <strong>log out and log back in</strong> so that the
BPF group membership takes effect.  Then run:</p>
<p><code>unicornscan -mT 192.168.1.1:1-1024</code></p>
</body>
</html>
WELCOME

# Create a placeholder background (1x1 transparent PNG).
# The installer works fine without it — the reference is optional.
# We use printf to write a minimal valid PNG.
printf '\x89PNG\r\n\x1a\n' > "${RESOURCES_DIR}/background.png"

PRODUCT_PKG="${WORK_DIR}/Install.pkg"

info "Building product archive with productbuild..."

productbuild \
    --distribution "${DISTRIBUTION_XML}" \
    --resources "${RESOURCES_DIR}" \
    --package-path "${WORK_DIR}" \
    "${PRODUCT_PKG}"

if [ ! -f "${PRODUCT_PKG}" ]; then
    die "productbuild failed to create product archive."
fi

info "Product package created: $(du -h "${PRODUCT_PKG}" | cut -f1)"

# ---------------------------------------------------------------------------
# Step 4b: Optionally sign the package
# ---------------------------------------------------------------------------

if [ -n "${SIGN_IDENTITY}" ]; then
    SIGNED_PKG="${WORK_DIR}/Install-signed.pkg"
    info "Signing package with identity: ${SIGN_IDENTITY}"
    if productsign --sign "${SIGN_IDENTITY}" "${PRODUCT_PKG}" "${SIGNED_PKG}"; then
        mv "${SIGNED_PKG}" "${PRODUCT_PKG}"
        info "Package signed successfully."
    else
        warn "Package signing failed.  Continuing with unsigned package."
    fi
fi

# ---------------------------------------------------------------------------
# Step 5: Assemble the DMG staging directory
# ---------------------------------------------------------------------------

info "Assembling DMG contents..."

# Install.pkg
cp "${PRODUCT_PKG}" "${DMG_STAGING}/Install.pkg"
info "  + Install.pkg"

# README.txt
README_SRC="${SCRIPT_DIR}/README.txt"
if [ -f "${README_SRC}" ]; then
    cp "${README_SRC}" "${DMG_STAGING}/README.txt"
    info "  + README.txt"
else
    warn "README.txt not found at ${README_SRC}"
fi

# Alicorn.app (optional)
HAS_ALICORN="no"
if [ -n "${APP_DIR}" ] && [ -d "${APP_DIR}" ]; then
    # User specified an Alicorn.app path.
    APP_NAME="$(basename "${APP_DIR}")"
    cp -R "${APP_DIR}" "${DMG_STAGING}/${APP_NAME}"
    info "  + ${APP_NAME}"
    HAS_ALICORN="yes"
elif [ -d "${REPO_ROOT}/macos/Alicorn.app" ]; then
    # Default location in the repo.
    cp -R "${REPO_ROOT}/macos/Alicorn.app" "${DMG_STAGING}/Alicorn.app"
    info "  + Alicorn.app (from macos/)"
    HAS_ALICORN="yes"
else
    info "  Alicorn.app not found — DMG will contain only Install.pkg and README."
fi

# ---------------------------------------------------------------------------
# Step 6: Create the DMG
# ---------------------------------------------------------------------------

ARCH="$(uname -m)"
DMG_NAME="unicornscan-${VERSION}-macos-${ARCH}.dmg"
mkdir -p "${OUTPUT_DIR}"
DMG_PATH="${OUTPUT_DIR}/${DMG_NAME}"

# Remove any existing DMG at the output path.
if [ -f "${DMG_PATH}" ]; then
    rm -f "${DMG_PATH}"
fi

info "Creating DMG: ${DMG_NAME}"

hdiutil create \
    -volname "Unicornscan ${VERSION}" \
    -srcfolder "${DMG_STAGING}" \
    -ov \
    -format UDZO \
    "${DMG_PATH}"

if [ ! -f "${DMG_PATH}" ]; then
    die "hdiutil failed to create DMG."
fi

DMG_SIZE="$(du -h "${DMG_PATH}" | cut -f1)"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo "=========================================================="
echo "  DMG build complete."
echo ""
echo "  File:    ${DMG_PATH}"
echo "  Size:    ${DMG_SIZE}"
echo "  Version: ${VERSION}"
echo "  Arch:    ${ARCH}"
echo ""
echo "  Contents:"
echo "    - Install.pkg   (installer package)"
if [ "${HAS_ALICORN}" = "yes" ]; then
echo "    - Alicorn.app   (web UI)"
fi
echo "    - README.txt    (quick-start guide)"
echo ""
echo "  To verify:"
echo "    hdiutil verify ${DMG_PATH}"
echo "    pkgutil --check-signature ${DMG_PATH}"
echo "=========================================================="
echo ""

# Print the DMG path as the last line of output for scripting.
echo "${DMG_PATH}"
