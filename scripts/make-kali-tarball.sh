#!/bin/bash
#
# make-kali-tarball.sh - Generate minimal unicornscan tarball for Kali packaging
#
# Creates a tarball excluding Alicorn web UI and development artifacts.
# Per Kali maintainer feedback: "please move the web interface into its own
# separate repo - it would make doing the code review faster"
#
# Usage: ./scripts/make-kali-tarball.sh [version]
#   version: Optional version number (default: extracted from configure.ac)
#
# Output: unicornscan-X.Y.Z.tar.gz in current directory
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get version from argument or configure.ac
if [ -n "$1" ]; then
    VERSION="$1"
else
    VERSION=$(grep -E '^AC_INIT\(' "$REPO_ROOT/configure.ac" | sed -E 's/.*\[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/')
    if [ -z "$VERSION" ]; then
        echo "Error: Could not extract version from configure.ac" >&2
        exit 1
    fi
fi

TARBALL_NAME="unicornscan-${VERSION}"
TARBALL_FILE="${TARBALL_NAME}.tar.gz"
STAGING_DIR=$(mktemp -d)

echo "Creating Kali tarball for unicornscan ${VERSION}..."
echo "Staging directory: ${STAGING_DIR}"

# Create the tarball directory structure
mkdir -p "${STAGING_DIR}/${TARBALL_NAME}"

# Function to copy directory if it exists
copy_if_exists() {
    local src="$1"
    local dst="$2"
    if [ -e "$src" ]; then
        cp -r "$src" "$dst"
    fi
}

# Copy core source directories
echo "Copying core source files..."
copy_if_exists "$REPO_ROOT/src" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/libs" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/ext_src" "${STAGING_DIR}/${TARBALL_NAME}/"

# Copy configuration and data
echo "Copying configuration and data..."
copy_if_exists "$REPO_ROOT/etc" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/data" "${STAGING_DIR}/${TARBALL_NAME}/"

# Copy build system files
echo "Copying build system..."
copy_if_exists "$REPO_ROOT/autostuff" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/m4" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/configure.ac" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/configure" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/Makefile.in" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/Makefile.inc.in" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/aclocal.m4" "${STAGING_DIR}/${TARBALL_NAME}/"

# Copy auxiliary directories
# NOTE: debian/, rpm/, arch/, kali/ are NOT included - they are distro-specific
# packaging that should be maintained separately (gbp adds debian/ during import)
echo "Copying auxiliary files..."
copy_if_exists "$REPO_ROOT/selinux" "${STAGING_DIR}/${TARBALL_NAME}/"
copy_if_exists "$REPO_ROOT/contrib" "${STAGING_DIR}/${TARBALL_NAME}/"

# Copy scripts (excluding this script itself to avoid confusion)
echo "Copying utility scripts..."
copy_if_exists "$REPO_ROOT/scripts" "${STAGING_DIR}/${TARBALL_NAME}/"

# Copy essential documentation only (not videos, PDFs, research, etc.)
echo "Copying essential documentation..."
mkdir -p "${STAGING_DIR}/${TARBALL_NAME}/docs"
for doc in GETTING_STARTED.md INSTALL-package.md INSTALL-source.md; do
    if [ -f "$REPO_ROOT/docs/$doc" ]; then
        cp "$REPO_ROOT/docs/$doc" "${STAGING_DIR}/${TARBALL_NAME}/docs/"
    fi
done
# Copy man pages
if [ -d "$REPO_ROOT/docs/man" ]; then
    cp -r "$REPO_ROOT/docs/man" "${STAGING_DIR}/${TARBALL_NAME}/docs/"
fi
# Copy docs Makefile for build system
copy_if_exists "$REPO_ROOT/docs/Makefile.in" "${STAGING_DIR}/${TARBALL_NAME}/docs/"

# Copy root-level essential files
echo "Copying root files..."
for file in AUTHORS LICENSE README README.md README.security README.update TODO CHANGELOG HISTORY.md; do
    if [ -f "$REPO_ROOT/$file" ]; then
        cp "$REPO_ROOT/$file" "${STAGING_DIR}/${TARBALL_NAME}/"
    fi
done

# Clean up build artifacts from copied directories
echo "Cleaning build artifacts..."
find "${STAGING_DIR}/${TARBALL_NAME}" -type f \( \
    -name "*.o" -o \
    -name "*.lo" -o \
    -name "*.la" -o \
    -name "*.a" -o \
    -name "*.so" -o \
    -name "*.dylib" -o \
    -name "*.loT" -o \
    -name "config.status" -o \
    -name "config.log" -o \
    -name "config.h" -o \
    -name "stamp-h1" -o \
    -name "Makefile" -o \
    -name "compile.h" \
\) -delete 2>/dev/null || true

# Remove compiled binaries (ELF executables)
echo "Removing compiled binaries..."
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/unicornscan"
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/tools/fantaip"
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/tools/unibrow"
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/tools/unicfgtst"
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/scan_progs/unilisten"
rm -f "${STAGING_DIR}/${TARBALL_NAME}/src/scan_progs/unisend"

# Remove build directories
find "${STAGING_DIR}/${TARBALL_NAME}" -type d \( \
    -name ".deps" -o \
    -name ".libs" -o \
    -name "autom4te.cache" -o \
    -name ".claude-flow" -o \
    -name ".hive-mind" \
\) -exec rm -rf {} + 2>/dev/null || true

# Remove any stray dotfiles/directories that shouldn't be there
find "${STAGING_DIR}/${TARBALL_NAME}" -maxdepth 1 -name ".*" -exec rm -rf {} + 2>/dev/null || true

# Create the tarball
echo "Creating tarball..."
cd "${STAGING_DIR}"
tar -czf "${REPO_ROOT}/${TARBALL_FILE}" "${TARBALL_NAME}"

# Cleanup
rm -rf "${STAGING_DIR}"

# Report results
TARBALL_SIZE=$(ls -lh "${REPO_ROOT}/${TARBALL_FILE}" | awk '{print $5}')
echo ""
echo "Created: ${TARBALL_FILE}"
echo "Size: ${TARBALL_SIZE}"
echo ""

# Verify no Alicorn content
echo "Verifying no Alicorn content..."
if tar -tzf "${REPO_ROOT}/${TARBALL_FILE}" | grep -qi alicorn; then
    echo "WARNING: Alicorn content found in tarball!" >&2
    exit 1
else
    echo "OK: No Alicorn content found"
fi

# Show contents summary
echo ""
echo "Tarball contents summary:"
tar -tzf "${REPO_ROOT}/${TARBALL_FILE}" | grep -E "^${TARBALL_NAME}/[^/]+/?$" | sort

echo ""
echo "Done. Tarball ready for gbp import-orig."
