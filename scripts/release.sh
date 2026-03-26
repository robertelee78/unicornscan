#!/bin/bash
#
# release.sh — Unicornscan release automation
#
# Creates a tagged release, updates the Homebrew formula with the correct
# sha256, publishes a GitHub Release with notes from HISTORY.md, and syncs
# the formula to the homebrew-unicornscan tap repository.
#
# Usage:
#   ./scripts/release.sh v0.4.53              # full release
#   ./scripts/release.sh v0.4.53 --dry-run    # preview without mutating
#
# Prerequisites:
#   - Clean git working tree on the main branch
#   - gh CLI installed and authenticated (brew install gh && gh auth login)
#   - Push access to robertelee78/unicornscan and robertelee78/homebrew-unicornscan
#
# What it does (in order):
#   1. Pre-flight validation (clean tree, branch, tools, no existing tag)
#   2. Creates and pushes the git tag
#   3. Downloads the GitHub-generated source tarball
#   4. Computes sha256 and updates macos/unicornscan.rb
#   5. Commits and pushes the formula update
#   6. Creates a GitHub Release with notes extracted from HISTORY.md
#   7. Clones homebrew-unicornscan, copies the updated formula, pushes
#
# Recovery:
#   The script is safe to re-run. Each step checks whether its work has
#   already been done (tag exists, formula already updated, release exists,
#   tap already current) and skips accordingly.
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_OWNER="robertelee78"
REPO_NAME="unicornscan"
FORMULA_PATH="macos/unicornscan.rb"
HISTORY_PATH="HISTORY.md"
TAP_REPO="${REPO_OWNER}/homebrew-unicornscan"
TAP_FORMULA_PATH="Formula/unicornscan.rb"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[release]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[!]${NC} $1"; }
error()   { echo -e "${RED}[✗]${NC} $1" >&2; }
fatal()   { error "$1"; exit 1; }

# In dry-run mode, print what would happen instead of doing it
DRY_RUN=false

run() {
    if $DRY_RUN; then
        echo -e "${YELLOW}[dry-run]${NC} $*"
    else
        "$@"
    fi
}

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------

TMPDIR_RELEASE=""

cleanup() {
    if [ -n "$TMPDIR_RELEASE" ] && [ -d "$TMPDIR_RELEASE" ]; then
        rm -rf "$TMPDIR_RELEASE"
    fi
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

usage() {
    echo "Usage: $0 <version> [--dry-run]"
    echo ""
    echo "  version    Release version tag (e.g., v0.4.53)"
    echo "  --dry-run  Preview all steps without making changes"
    echo ""
    echo "Examples:"
    echo "  $0 v0.4.53"
    echo "  $0 v0.4.53 --dry-run"
    exit 1
}

VERSION=""

for arg in "$@"; do
    case "$arg" in
        --dry-run|-n)
            DRY_RUN=true
            ;;
        -h|--help)
            usage
            ;;
        v*)
            VERSION="$arg"
            ;;
        *)
            error "Unknown argument: $arg"
            usage
            ;;
    esac
done

[ -z "$VERSION" ] && usage

# ---------------------------------------------------------------------------
# Step 0: Pre-flight validation
# ---------------------------------------------------------------------------

info "Pre-flight checks..."

cd "$REPO_ROOT"

# Validate version format: v followed by semver-like (e.g., v0.4.53)
if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    fatal "Version '$VERSION' does not match expected format vX.Y.Z (e.g., v0.4.53)"
fi

# Strip the leading 'v' for places that need the bare version number
BARE_VERSION="${VERSION#v}"

# Must be in the repo root
if [ ! -f "$FORMULA_PATH" ]; then
    fatal "Cannot find $FORMULA_PATH — are you in the unicornscan repo root?"
fi

# Must be on main branch
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
    fatal "Must be on the 'main' branch (currently on '$CURRENT_BRANCH')"
fi

# Working tree must be clean
if [ -n "$(git status --porcelain)" ]; then
    fatal "Working tree is not clean. Commit or stash changes first."
fi

# gh CLI must be available
if ! command -v gh &>/dev/null; then
    fatal "gh CLI is not installed. Install with: brew install gh"
fi

# gh must be authenticated
if ! gh auth status &>/dev/null; then
    fatal "gh CLI is not authenticated. Run: gh auth login"
fi

# Check if tag already exists locally
TAG_EXISTS_LOCAL=false
if git tag -l "$VERSION" | grep -q "$VERSION"; then
    TAG_EXISTS_LOCAL=true
fi

# Check if tag already exists on remote
TAG_EXISTS_REMOTE=false
if git ls-remote --tags origin "refs/tags/$VERSION" 2>/dev/null | grep -q "$VERSION"; then
    TAG_EXISTS_REMOTE=true
fi

# If tag exists both locally and remotely, that's fine (resuming).
# If it exists in one but not the other, that's a problem.
if $TAG_EXISTS_LOCAL && ! $TAG_EXISTS_REMOTE; then
    fatal "Tag $VERSION exists locally but not on remote. Delete it first: git tag -d $VERSION"
fi
if ! $TAG_EXISTS_LOCAL && $TAG_EXISTS_REMOTE; then
    fatal "Tag $VERSION exists on remote but not locally. Fetch it first: git fetch --tags"
fi

if $TAG_EXISTS_LOCAL && $TAG_EXISTS_REMOTE; then
    warn "Tag $VERSION already exists (resuming from a previous run)"
fi

success "Pre-flight checks passed"

# ---------------------------------------------------------------------------
# Step 1: Create and push tag
# ---------------------------------------------------------------------------

if $TAG_EXISTS_LOCAL; then
    info "Tag $VERSION already exists — skipping tag creation"
else
    info "Creating tag $VERSION..."
    run git tag "$VERSION"
    info "Pushing tag $VERSION to origin..."
    run git push origin "$VERSION"
    success "Tag $VERSION created and pushed"
fi

# ---------------------------------------------------------------------------
# Step 2: Download tarball and compute sha256
# ---------------------------------------------------------------------------

TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/tags/${VERSION}.tar.gz"

info "Downloading release tarball..."

TMPDIR_RELEASE="$(mktemp -d)"
TARBALL_PATH="${TMPDIR_RELEASE}/${VERSION}.tar.gz"

if $DRY_RUN; then
    echo -e "${YELLOW}[dry-run]${NC} curl -fsSL $TARBALL_URL -o $TARBALL_PATH"
    SHA256="<dry-run-sha256-placeholder>"
else
    # GitHub may take a moment to generate the tarball after tag push.
    # Retry up to 3 times with a short wait.
    DOWNLOAD_OK=false
    for attempt in 1 2 3; do
        if curl -fsSL "$TARBALL_URL" -o "$TARBALL_PATH" 2>/dev/null; then
            # Verify it's actually a gzip file, not an HTML error page
            if file "$TARBALL_PATH" | grep -q "gzip"; then
                DOWNLOAD_OK=true
                break
            else
                warn "Downloaded file is not a valid gzip archive (attempt $attempt/3)"
                rm -f "$TARBALL_PATH"
            fi
        else
            warn "Download failed (attempt $attempt/3)"
        fi
        [ "$attempt" -lt 3 ] && sleep 5
    done

    if ! $DOWNLOAD_OK; then
        fatal "Failed to download tarball from $TARBALL_URL after 3 attempts"
    fi

    SHA256="$(shasum -a 256 "$TARBALL_PATH" | awk '{print $1}')"
fi

success "sha256: $SHA256"

# ---------------------------------------------------------------------------
# Step 3: Update Homebrew formula
# ---------------------------------------------------------------------------

info "Updating $FORMULA_PATH..."

CURRENT_SHA256="$(grep '^\s*sha256 ' "$FORMULA_PATH" | head -1 | sed 's/.*"\(.*\)".*/\1/')"
CURRENT_URL_VERSION="$(grep '^\s*url ' "$FORMULA_PATH" | head -1 | sed 's/.*\/v\([^"]*\)\.tar\.gz.*/\1/')"

if [ "$CURRENT_SHA256" = "$SHA256" ] && [ "$CURRENT_URL_VERSION" = "$BARE_VERSION" ]; then
    info "Formula already up to date — skipping"
else
    if $DRY_RUN; then
        echo -e "${YELLOW}[dry-run]${NC} Update url version: v$CURRENT_URL_VERSION → $VERSION"
        echo -e "${YELLOW}[dry-run]${NC} Update sha256: $CURRENT_SHA256 → $SHA256"
    else
        # Update the url line with new version
        sed -i '' "s|/archive/refs/tags/v[0-9][0-9.]*\.tar\.gz|/archive/refs/tags/${VERSION}.tar.gz|" "$FORMULA_PATH"

        # Update the sha256 line
        sed -i '' "s/sha256 \"[a-f0-9]*\"/sha256 \"${SHA256}\"/" "$FORMULA_PATH"

        # Verify both changes took effect
        if ! grep -q "/${VERSION}.tar.gz" "$FORMULA_PATH"; then
            fatal "Failed to update URL version in $FORMULA_PATH"
        fi
        if ! grep -q "sha256 \"${SHA256}\"" "$FORMULA_PATH"; then
            fatal "Failed to update sha256 in $FORMULA_PATH"
        fi
    fi

    success "Formula updated: $VERSION / ${SHA256:0:16}..."

    info "Committing formula update..."
    run git add "$FORMULA_PATH"
    run git commit -m "Update Homebrew formula sha256 for ${VERSION}"
    info "Pushing to origin..."
    run git push origin main
    success "Formula committed and pushed"
fi

# ---------------------------------------------------------------------------
# Step 4: Create GitHub Release
# ---------------------------------------------------------------------------

info "Checking for existing GitHub Release..."

RELEASE_EXISTS=false
if gh release view "$VERSION" &>/dev/null; then
    RELEASE_EXISTS=true
fi

if $RELEASE_EXISTS; then
    info "GitHub Release $VERSION already exists — skipping"
else
    info "Extracting release notes from $HISTORY_PATH..."

    # Extract the section for this version from HISTORY.md.
    # Strategy: find the version number in the file, then grab everything
    # from that section heading until the next '---' horizontal rule or
    # '## ' heading at the same level.
    #
    # If no matching section is found, fall back to a simple message.
    RELEASE_NOTES=""

    if grep -q "$BARE_VERSION" "$HISTORY_PATH"; then
        # Find the line number of the section containing this version
        SECTION_START="$(grep -n "$BARE_VERSION" "$HISTORY_PATH" | head -1 | cut -d: -f1)"

        if [ -n "$SECTION_START" ]; then
            # Walk backwards to find the section heading (## ...)
            HEADING_LINE="$SECTION_START"
            while [ "$HEADING_LINE" -gt 1 ]; do
                LINE_CONTENT="$(sed -n "${HEADING_LINE}p" "$HISTORY_PATH")"
                if echo "$LINE_CONTENT" | grep -qE '^## '; then
                    break
                fi
                HEADING_LINE=$((HEADING_LINE - 1))
            done

            # Walk forward from the heading to find the end of the section
            # (next '---' or next '## ' heading)
            TOTAL_LINES="$(wc -l < "$HISTORY_PATH" | tr -d ' ')"
            END_LINE=$((HEADING_LINE + 1))
            while [ "$END_LINE" -le "$TOTAL_LINES" ]; do
                LINE_CONTENT="$(sed -n "${END_LINE}p" "$HISTORY_PATH")"
                if echo "$LINE_CONTENT" | grep -qE '^---$'; then
                    END_LINE=$((END_LINE - 1))
                    break
                fi
                if echo "$LINE_CONTENT" | grep -qE '^## ' && [ "$END_LINE" -ne "$HEADING_LINE" ]; then
                    END_LINE=$((END_LINE - 1))
                    break
                fi
                END_LINE=$((END_LINE + 1))
            done

            RELEASE_NOTES="$(sed -n "${HEADING_LINE},${END_LINE}p" "$HISTORY_PATH")"
        fi
    fi

    if [ -z "$RELEASE_NOTES" ]; then
        RELEASE_NOTES="Release ${VERSION}"
        warn "Could not extract release notes from $HISTORY_PATH — using default"
    fi

    info "Creating GitHub Release $VERSION..."
    if $DRY_RUN; then
        echo -e "${YELLOW}[dry-run]${NC} gh release create $VERSION --title \"Unicornscan $VERSION\" --notes \"...\""
        echo ""
        echo "Release notes preview:"
        echo "$RELEASE_NOTES"
    else
        echo "$RELEASE_NOTES" | gh release create "$VERSION" \
            --title "Unicornscan ${VERSION}" \
            --notes-file -
    fi

    success "GitHub Release $VERSION created"
fi

# ---------------------------------------------------------------------------
# Step 5: Sync formula to Homebrew tap
# ---------------------------------------------------------------------------

info "Syncing formula to ${TAP_REPO}..."

TAP_DIR="${TMPDIR_RELEASE}/homebrew-unicornscan"

if $DRY_RUN; then
    echo -e "${YELLOW}[dry-run]${NC} git clone git@github.com:${TAP_REPO}.git $TAP_DIR"
    echo -e "${YELLOW}[dry-run]${NC} cp $FORMULA_PATH $TAP_DIR/$TAP_FORMULA_PATH"
    echo -e "${YELLOW}[dry-run]${NC} git commit + push in tap repo"
else
    git clone --quiet "git@github.com:${TAP_REPO}.git" "$TAP_DIR"

    cp "$FORMULA_PATH" "$TAP_DIR/$TAP_FORMULA_PATH"

    cd "$TAP_DIR"

    # Check if there are actually changes to commit
    if git diff --quiet "$TAP_FORMULA_PATH"; then
        info "Tap formula already up to date — skipping"
    else
        git add "$TAP_FORMULA_PATH"
        git commit -m "Update formula for unicornscan ${VERSION}"
        git push origin main
        success "Tap updated: ${TAP_REPO}"
    fi

    cd "$REPO_ROOT"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

echo ""
echo -e "${GREEN}${BOLD}Release $VERSION complete!${NC}"
echo ""
echo "  Tag:      https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${VERSION}"
echo "  Formula:  ${FORMULA_PATH} (sha256: ${SHA256:0:16}...)"
echo "  Tap:      https://github.com/${TAP_REPO}"
echo ""
echo "  Users can now install with:"
echo "    brew tap ${REPO_OWNER}/unicornscan"
echo "    brew install unicornscan"
echo ""
