# Scan Comparison Feature - Technical Specification

**Version:** 1.0.0
**Status:** Implemented
**Last Updated:** 2026-01-04

## Overview

The scan comparison feature enables users to compare 2-5+ network scans to identify changes over time. This is critical for detecting new hosts, closed ports, TTL changes (potential routing modifications), and service banner updates.

## Architecture

### Directory Structure

```
src/features/compare/
├── index.ts                    # Public exports
├── types.ts                    # TypeScript type definitions
├── ComparisonDashboard.tsx     # Main dashboard component
├── ComparisonHeader.tsx        # Header with view selector and controls
├── SavedComparisons.tsx        # Saved comparison management UI
├── hooks/
│   ├── index.ts
│   ├── useMultiScanComparison.ts   # Core comparison logic
│   └── useSavedComparisons.ts      # localStorage persistence
├── views/
│   ├── index.ts
│   ├── SideBySideView.tsx      # Column-based comparison
│   ├── TimelineView.tsx        # Chronological change timeline
│   ├── UnifiedDiffView.tsx     # Git-style diff format
│   └── MatrixHeatmapView.tsx   # Grid-based heatmap
└── export/
    ├── index.ts
    ├── exportCsv.ts            # CSV export
    ├── exportJson.ts           # JSON export
    └── exportMarkdown.ts       # Markdown report export
```

## Data Model

### Core Types

```typescript
interface MultiScanComparisonResult {
  scans: Scan[]                  // Scans ordered by s_time
  hostDiffs: MultiScanHostDiff[] // Host comparisons
  summary: MultiScanSummary      // Statistics
}

interface MultiScanHostDiff {
  ipAddr: string
  presence: MultiScanHostPresence[]
  firstSeenScanId: number
  lastSeenScanId: number
  presentCount: number
  hasChanges: boolean
  portDiffs: MultiScanPortDiff[]
}

interface MultiScanPortDiff {
  port: number
  protocol: string
  presence: MultiScanPortPresence[]
  firstSeenScanId: number
  lastSeenScanId: number
  presentCount: number
  hasChanges: boolean
  hasTtlChanges: boolean
  ttlValues: number[]
  hasBannerChanges: boolean
  hasBanner: boolean
}
```

### Saved Comparisons

```typescript
interface SavedComparison {
  id: string           // UUID
  scanIds: number[]    // Scan IDs being compared
  note: string         // User description
  targetStr?: string   // Target for display
  modeStr?: string     // Scan mode for display
  createdAt: string    // ISO timestamp
  updatedAt: string    // ISO timestamp
}
```

## Hooks

### useMultiScanComparison

**Purpose:** Compare 2-5+ scans and compute differences.

**Usage:**
```typescript
const { data, isLoading, isError } = useMultiScanComparison([1, 2, 3])
```

**Implementation:**
1. Fetches scan metadata for all scan IDs in parallel
2. Fetches IP reports and banners for all scans in parallel
3. Groups reports by host address
4. Computes presence/absence for each host across all scans
5. Computes port differences including TTL and banner changes
6. Calculates summary statistics

**Query Key:** `['multi-compare', 'comparison', scanIds.sort().join(',')]`

**Caching:** 30-second stale time (React Query)

### useSavedComparisons

**Purpose:** CRUD operations for saved comparisons in localStorage.

**Usage:**
```typescript
const {
  comparisons,
  saveComparison,
  updateNote,
  deleteComparison,
  getComparison,
} = useSavedComparisons()
```

**Storage Key:** `alicorn-saved-comparisons`

**Validation:** Schema validation on read with graceful fallback for corrupted data.

## Views

### SideBySideView

Column-based comparison showing each scan as a column with port badges:
- Host rows with IP addresses
- Port badges colored by status (present/absent/new/removed)
- Tooltips with TTL values
- Empty state for hosts not in a scan

### TimelineView

Chronological timeline of changes:
- Grouped by host with collapsible sections
- Change events: port added, port removed, TTL changed, banner changed
- Event badges (+/-/~) with counts
- Scan ID references for each change

### UnifiedDiffView

Git-style unified diff format:
- Host headers: `=== 192.168.1.10 ===`
- Added: `+ 443/tcp [NEW]`
- Removed: `- 22/tcp [REMOVED]`
- Modified: `~ 80/tcp TTL: 64→58`
- Context toggle for unchanged ports
- Copy to clipboard functionality

### MatrixHeatmapView

Grid-based visualization:
- Hosts as rows, scans as columns
- Color-coded cells (green=responding, red=new, orange=lost, gray=absent)
- Click cell for port details dialog
- Legend for color meanings

## Export Formats

### CSV Export
- Columns: Host, Port, Protocol, Status per scan, TTL per scan, Banner per scan
- One row per unique port across all scans

### JSON Export
- Full comparison data structure
- Includes metadata, summary, and all diff information
- Suitable for programmatic analysis

### Markdown Export
- Human-readable report
- Summary statistics
- Changes organized by host
- Suitable for documentation

## Performance Considerations

### Current Optimizations
- Parallel data fetching with `Promise.all`
- React Query caching (30s stale time)
- Memoization of diff calculations with `useMemo`
- Lazy rendering of collapsed host sections

### Recommended for Large Datasets
- Virtual scrolling for 1000+ hosts (react-window)
- Web Worker for comparison computation
- Incremental rendering

## Testing

### Unit Tests (`tests/features/multi-scan-comparison.test.tsx`)
- 32 tests covering:
  - 2-scan basic comparison
  - N-scan (3-5) comparison
  - TTL change detection
  - Banner change detection
  - Edge cases (empty scans, invalid IDs)
  - Saved comparison CRUD
  - localStorage persistence

### Component Tests (`tests/features/compare-views.test.tsx`)
- 34 tests covering:
  - Rendering with sample data
  - Empty state handling
  - User interactions (click, copy)
  - Accessibility (keyboard nav, ARIA labels)
  - Edge cases (empty portDiffs)

## Integration Points

### Database Access
- `db.getScan(id)` - Fetch scan metadata
- `db.getIpReports(scanId)` - Fetch IP reports
- `db.getBannersForScan(scanId)` - Fetch service banners

### Router Integration
- Route: `/compare?scans=1,2,3`
- View state in URL query params

### UI Components
- Uses shared Badge, Button, Switch, Dialog components
- Follows design system color tokens
- Responsive layout with Tailwind CSS

## Security Considerations

- All data is local (no external API calls)
- localStorage has size limits (~5MB)
- No PII in comparison data
- Export files are client-generated

## Future Enhancements

- [ ] Comparison templates (save common filter/view settings)
- [ ] Batch comparison (compare multiple sets)
- [ ] Diff annotations (user notes on specific changes)
- [ ] PDF export with charts
- [ ] Real-time comparison (auto-update when new scan completes)
