# Scan Comparison Redesign - Product Requirements Document

**Version:** 1.0
**Date:** 2026-01-05
**Status:** Draft - Pending Approval

---

## Executive Summary

Redesign the scan comparison workflow to support red team engagement use cases where testers need to identify discrepancies between repeated scans of the same target. The current `/compare` page will be removed and replaced with an integrated comparison workflow on the `/scans` page.

---

## Problem Statement

During a 2-3 week red team engagement, testers scan the same CIDR block multiple times. Between scans, discrepancies occur:
- Hosts that previously responded may stop responding
- New hosts may appear
- Services (responding ports) may change on existing hosts

The current compare implementation is flawed because:
1. It allows comparing scans of completely different targets (meaningless)
2. It doesn't validate that scans are compatible (same target, same protocol)
3. The UX requires navigating to a separate page and manually selecting scans
4. The Activity Matrix feature is confusing and not useful

**Goal:** Enable testers to quickly identify which scans are comparable, select 2-5 of them, and see a comprehensive diff of response changes.

---

## User Stories

1. **As a red teamer**, I want to select a scan and immediately see only other scans that targeted the same network with the same protocol, so I don't waste time comparing incompatible scans.

2. **As a red teamer**, I want to compare up to 5 scans at once to see how responses changed over the course of an engagement.

3. **As a red teamer**, I want multiple visualization options (columns, timeline, diff, heatmap) visible simultaneously so I can analyze changes from different perspectives.

4. **As a red teamer**, I want to bookmark interesting comparisons with notes so I can reference them in my report.

5. **As a red teamer**, I want to export comparison results to include in deliverables.

---

## Functional Requirements

### FR-1: Remove /compare Page
- Delete the standalone `/compare` route and page component
- Delete the Activity Matrix feature (`/features/activity-matrix/`)
- Remove "Compare" from the sidebar navigation
- Redirect any existing `/compare` URLs to `/scans`

### FR-2: Scan Selection on /scans Page

#### FR-2.1: Checkbox Column
- Add a checkbox column as the first column in the scan table
- Checkbox is always visible (not behind a "selection mode" toggle)
- Header checkbox selects/deselects all **visible compatible** scans

#### FR-2.2: Compatibility Filtering
When a scan is selected (checked):
- Determine compatibility criteria from selected scan:
  - `target_str` must match exactly
  - `mode_str` must match exactly (same protocol)
- Hide all scans that don't match these criteria
- Show a filter chip/banner indicating: "Showing scans matching: [target] ([mode])"
- When all scans are deselected, show all scans again (remove filter)

#### FR-2.3: Selection Limits
- No hard limit on number of selections
- Practical limit based on UI (recommend max 5 for usability)
- Show selection count: "X scans selected"

#### FR-2.4: Compare Action Bar
- Floating action bar appears at bottom of screen when 2+ scans selected
- Contains:
  - Selection count: "3 scans selected"
  - "Compare" button (primary action)
  - "Clear Selection" button (secondary)
- Bar is sticky/fixed at bottom of viewport

### FR-3: Comparison Dashboard View

#### FR-3.1: Navigation
- Clicking "Compare" navigates to `/scans/compare?ids=1,2,3` (or similar URL scheme)
- URL is shareable/bookmarkable
- Back button returns to scan list with selection preserved

#### FR-3.2: Dashboard Layout
- **Primary View**: Large panel (60-70% of viewport) showing one visualization
- **Thumbnail Views**: Three smaller panels showing the other visualizations
- Clicking a thumbnail swaps it with the primary view
- All four views update in sync when data loads

#### FR-3.3: Visualization Types

**A) Side-by-Side Columns**
- Each selected scan is a column
- Rows are hosts (IP addresses)
- Cells show responding ports for that host in that scan
- Color coding:
  - Green: Port responded in this scan but not previous
  - Red: Port responded in previous scan but not this one
  - Yellow: Port responded but TTL/banner changed
  - Gray: Port responded, no change

**B) Timeline/Changelog**
- Vertical timeline with scan timestamps as markers
- Each change event is a card showing:
  - Host IP
  - What changed (port appeared/disappeared/modified)
  - Before/after values
- Grouped by host, sorted by time

**C) Unified Diff View**
- Git-style diff format
- Shows only changes (not unchanged hosts/ports)
- Format:
  ```
  === 192.168.1.10 ===
  + 443/tcp (TTL: 64) [NEW]
  - 22/tcp [REMOVED]
  ~ 80/tcp TTL: 64 → 58
  ```
- Context lines showing unchanged neighbors optional

**D) Matrix Heatmap**
- Y-axis: Host IPs (sorted)
- X-axis: Scan IDs/timestamps
- Cell color indicates:
  - Blue: Host responded (has open ports)
  - Gray: Host did not respond
  - Green border: New responses vs previous
  - Red border: Lost responses vs previous
- Click cell to see port details

#### FR-3.4: Data Points Displayed
For each host/port combination, show:
- **Host IP address**
- **Port number + Protocol** (e.g., "443/tcp")
- **Response status**: Responded / No Response (NOT open/closed)
- **TTL value**: With change indicator if different between scans
- **First seen**: Timestamp of earliest scan containing this response
- **Last seen**: Timestamp of most recent scan containing this response
- **Banner/Service data**: If available, show banner text with diff highlighting

### FR-4: Saved Comparisons

#### FR-4.1: Saved Tab on /scans
- Add "Saved" tab alongside main scan list
- Shows list of bookmarked comparisons
- Columns: Name/Note, Scans (count), Target, Created, Actions

#### FR-4.2: Inline Note Field
- Comparison view header includes a text field for notes
- Placeholder: "Add a note about this comparison..."
- Auto-saves on blur or after typing pause
- If note is non-empty, comparison is automatically bookmarked

#### FR-4.3: Bookmark Without Note
- Explicit "Bookmark" button/icon in comparison header
- Can bookmark with empty note
- Bookmarked indicator shown when saved

#### FR-4.4: Saved Comparison Data
Store in database or localStorage:
- Scan IDs being compared
- Note text
- Created timestamp
- Last viewed timestamp
- User-defined name (optional, defaults to target + date)

### FR-5: Export

#### FR-5.1: Export Formats
- **CSV**: Flat table of all changes
- **JSON**: Structured diff data
- **Markdown**: Report-ready format with sections

#### FR-5.2: Export Scope
- Export button in comparison view header
- Exports currently visible comparison
- Includes note if present

---

## Non-Functional Requirements

### NFR-1: Performance
- Comparison of 5 scans with 1000 hosts each should render in < 2 seconds
- Thumbnail views can lazy-load after primary view renders

### NFR-2: Responsiveness
- Dashboard layout adapts to screen size
- On smaller screens, thumbnails stack below primary view
- Minimum supported width: 1024px

### NFR-3: Accessibility
- Color coding must have non-color indicators (icons, patterns)
- Keyboard navigation for scan selection
- Screen reader labels for all interactive elements

---

## Technical Approach

### Files to Delete
- `/alicorn/src/pages/Compare.tsx`
- `/alicorn/src/features/activity-matrix/*` (entire directory)
- `/alicorn/src/features/compare/ScanSelector.tsx` (replaced by table selection)

### Files to Modify
- `/alicorn/src/pages/Scans.tsx` - Add selection, compare button, saved tab
- `/alicorn/src/features/scans/ScanTable.tsx` - Add always-visible checkboxes
- `/alicorn/src/features/scans/hooks.ts` - Add compatibility filtering
- `/alicorn/src/components/layout/Sidebar.tsx` - Remove Compare link
- `/alicorn/src/main.tsx` - Update routes

### Files to Create
- `/alicorn/src/pages/ScansCompare.tsx` - New comparison dashboard page
- `/alicorn/src/features/compare/ComparisonDashboard.tsx` - Main dashboard component
- `/alicorn/src/features/compare/views/SideBySideView.tsx`
- `/alicorn/src/features/compare/views/TimelineView.tsx`
- `/alicorn/src/features/compare/views/UnifiedDiffView.tsx`
- `/alicorn/src/features/compare/views/MatrixHeatmapView.tsx`
- `/alicorn/src/features/compare/SavedComparisons.tsx`
- `/alicorn/src/features/compare/ComparisonHeader.tsx` (notes, export, bookmark)
- `/alicorn/src/features/scans/hooks/useCompatibleScans.ts`
- `/alicorn/src/features/scans/hooks/useScanSelection.ts`
- `/alicorn/src/features/scans/components/CompareActionBar.tsx`

### Database Changes
Consider adding table for saved comparisons:
```sql
CREATE TABLE saved_comparisons (
  id SERIAL PRIMARY KEY,
  scan_ids INTEGER[] NOT NULL,
  note TEXT,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Alternatively, use localStorage for MVP.

---

## Open Questions

1. **Hostname resolution**: Should we show hostnames alongside IPs if available?
2. **Port grouping**: Should common ports (22, 80, 443) be highlighted/grouped?
3. **Notification on new scan**: Alert when a new compatible scan is available?

---

## Success Metrics

- Time to compare scans reduced by 50%
- Zero user errors from comparing incompatible scans
- Positive feedback from red team users on workflow efficiency

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-05 | Claude (PM Mode) | Initial draft |
