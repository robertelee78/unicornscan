#!/bin/bash
# Helper script to submit unicornscan PKGBUILD to BlackArch
# Usage: ./submit-to-blackarch.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKGBUILD="$SCRIPT_DIR/PKGBUILD"
INSTALL="$SCRIPT_DIR/unicornscan.install"

# Extract version from PKGBUILD
VERSION=$(grep '^pkgver=' "$PKGBUILD" | cut -d= -f2)
if [[ -z "$VERSION" ]]; then
    echo "ERROR: Could not extract version from PKGBUILD"
    exit 1
fi

echo "=== BlackArch Unicornscan PKGBUILD Submission Helper ==="
echo "Version: $VERSION"
echo ""

# Check prerequisites
check_prereqs() {
    local missing=0

    for cmd in git makepkg; do
        if ! command -v $cmd &>/dev/null; then
            echo "ERROR: $cmd not found"
            missing=1
        fi
    done

    if [[ $missing -eq 1 ]]; then
        echo "Install missing dependencies and retry"
        exit 1
    fi

    # Optional but recommended
    if command -v namcap &>/dev/null; then
        echo "[OK] namcap available for validation"
    else
        echo "[WARN] namcap not found - install with: pacman -S namcap"
    fi

    if command -v pkgcheck &>/dev/null; then
        echo "[OK] pkgcheck available"
    else
        echo "[INFO] pkgcheck not found - get from: https://github.com/FFY00/pkgcheck"
    fi
}

# Validate PKGBUILD
validate() {
    echo ""
    echo "=== Validating PKGBUILD ==="

    cd "$SCRIPT_DIR"

    # Basic syntax check
    if bash -n "$PKGBUILD"; then
        echo "[OK] PKGBUILD syntax valid"
    else
        echo "[FAIL] PKGBUILD has syntax errors"
        exit 1
    fi

    # namcap check
    if command -v namcap &>/dev/null; then
        echo ""
        echo "Running namcap..."
        namcap "$PKGBUILD" || true
    fi

    # pkgcheck
    if command -v pkgcheck &>/dev/null; then
        echo ""
        echo "Running pkgcheck..."
        pkgcheck "$PKGBUILD" || true
    fi
}

# Build package locally
build() {
    echo ""
    echo "=== Building Package ==="

    cd "$SCRIPT_DIR"

    # Clean previous builds
    rm -rf src pkg *.pkg.tar.* unicornscan/

    # Build
    makepkg -sf --noconfirm

    if ls *.pkg.tar.* &>/dev/null; then
        echo ""
        echo "[OK] Package built successfully:"
        ls -la *.pkg.tar.*

        # Validate built package
        if command -v namcap &>/dev/null; then
            echo ""
            echo "Validating built package..."
            namcap *.pkg.tar.* || true
        fi
    else
        echo "[FAIL] Package build failed"
        exit 1
    fi
}

# Setup BlackArch fork
setup_fork() {
    echo ""
    echo "=== Setting Up BlackArch Fork ==="

    FORK_DIR="/tmp/blackarch-fork"

    if [[ -d "$FORK_DIR" ]]; then
        echo "Existing fork found at $FORK_DIR"
        cd "$FORK_DIR"
        git fetch origin
    else
        echo "Cloning BlackArch repository..."
        echo "NOTE: You should fork github.com/BlackArch/blackarch first!"
        echo ""
        read -p "Enter your GitHub username: " GITHUB_USER

        git clone "https://github.com/$GITHUB_USER/blackarch.git" "$FORK_DIR"
        cd "$FORK_DIR"
        git remote add upstream https://github.com/BlackArch/blackarch.git
    fi

    # Create branch
    BRANCH="update-unicornscan-${VERSION}"
    git checkout -b "$BRANCH" origin/master 2>/dev/null || git checkout "$BRANCH"

    # Copy files
    mkdir -p packages/unicornscan
    cp "$PKGBUILD" packages/unicornscan/
    cp "$INSTALL" packages/unicornscan/

    echo ""
    echo "[OK] Files copied to $FORK_DIR/packages/unicornscan/"
    echo ""
    echo "Next steps:"
    echo "  1. cd $FORK_DIR"
    echo "  2. git add packages/unicornscan/"
    echo "  3. git commit -m 'unicornscan: update to ${VERSION}'"
    echo "  4. git push origin $BRANCH"
    echo "  5. Create PR at github.com/BlackArch/blackarch"
}

# Main menu
main() {
    check_prereqs

    echo ""
    echo "What would you like to do?"
    echo "  1) Validate PKGBUILD"
    echo "  2) Build package locally"
    echo "  3) Setup BlackArch fork for PR"
    echo "  4) All of the above"
    echo "  q) Quit"
    echo ""
    read -p "Choice [1-4,q]: " choice

    case $choice in
        1) validate ;;
        2) build ;;
        3) setup_fork ;;
        4) validate && build && setup_fork ;;
        q|Q) exit 0 ;;
        *) echo "Invalid choice"; exit 1 ;;
    esac
}

main "$@"
