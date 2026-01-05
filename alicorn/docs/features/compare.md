# Scan Comparison

Compare multiple network scans to identify changes in your network over time.

## Getting Started

### Selecting Scans to Compare

1. Navigate to the **Scan History** page
2. Select 2-5 scans by clicking their checkboxes
3. Click the **Compare Selected** button
4. The comparison dashboard opens with your selected scans

**Tip:** For best results, compare scans of the same target range using the same scan mode.

### Quick Compare from Scan Details

From any scan details page, click **Compare with...** to select additional scans for comparison.

## Comparison Views

The comparison dashboard offers four visualization modes, accessible via the view selector in the header.

### Side-by-Side View

A table showing each scan as a column:
- Each row represents a host
- Colored badges show port status:
  - **Green**: Port responding
  - **Red** (strikethrough): Port removed (was present, now absent)
  - **Green** (new): Port added (was absent, now present)
- Hover over badges for TTL values

**Best for:** Quick visual comparison of port presence across scans.

### Timeline View

A chronological timeline of changes:
- Hosts are shown as collapsible sections
- Each change event shows:
  - **+** Port appeared (green)
  - **-** Port disappeared (red)
  - **~** Port modified (TTL or banner changed, amber)
- Click a host to expand/collapse its changes

**Best for:** Understanding when specific changes occurred.

### Unified Diff View

A git-style diff format familiar to developers:
```
=== 192.168.1.100 ===
+ 443/tcp [NEW TTL:64]
- 22/tcp [REMOVED]
~ 80/tcp TTL: 64→128 [MODIFIED]
```

Features:
- **Context toggle**: Show/hide unchanged ports
- **Copy button**: Copy diff to clipboard

**Best for:** Text-based analysis, copying to reports.

### Matrix Heatmap View

A grid visualization with hosts as rows and scans as columns:
- **Green**: Host responding with ports
- **Bright green**: New host appeared
- **Orange**: Host lost (was present, now absent)
- **Gray**: No response

Click any cell to see port details in a dialog.

**Best for:** Large comparisons, identifying patterns.

## Saving Comparisons

### Auto-Save with Notes

1. Click the **Save** button in the header
2. Enter a descriptive note (e.g., "Before firewall change")
3. Click **Save Comparison**

Your comparison is saved and accessible from the **Saved Comparisons** panel.

### Managing Saved Comparisons

Open the saved comparisons panel from the sidebar:
- Click a saved comparison to load it
- Edit the note by clicking the pencil icon
- Delete by clicking the trash icon

**Note:** Saved comparisons are stored in your browser's local storage. Clearing browser data will remove them.

## Exporting Results

Click the **Export** button and choose a format:

### CSV Export
- Spreadsheet-compatible format
- One row per port, columns for each scan
- Includes TTL values and status

### JSON Export
- Complete comparison data
- Machine-readable format
- Suitable for scripting/automation

### Markdown Export
- Human-readable report
- Summary statistics
- Changes organized by host
- Great for documentation

## Filtering

Use the filter dropdown to focus on specific hosts:
- **All Hosts**: Show everything
- **Added**: Hosts that appeared in later scans
- **Removed**: Hosts that disappeared in later scans
- **Changed**: Hosts with port or TTL changes
- **Unchanged**: Stable hosts (same across all scans)

## Understanding Changes

### Port Changes

| Indicator | Meaning |
|-----------|---------|
| + (green) | Port appeared in a later scan |
| - (red) | Port disappeared in a later scan |
| ~ (amber) | Port present but attributes changed |

### TTL Changes

TTL (Time To Live) changes may indicate:
- Routing changes
- Load balancer modifications
- Different response hosts
- Network path changes

### Banner Changes

Service banner changes may indicate:
- Software updates
- Configuration changes
- Different service versions

## Tips for Effective Comparison

1. **Compare similar scans**: Same target range and scan mode work best
2. **Use meaningful notes**: Describe the context (e.g., "Post-maintenance window")
3. **Check TTL changes**: May reveal infrastructure changes not visible in ports
4. **Export for records**: Save markdown reports for audit trails
5. **Use timeline view**: Best for understanding change sequence

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| 1-4 | Switch views (Side-by-Side, Timeline, Diff, Matrix) |
| S | Save comparison |
| E | Export menu |
| Esc | Close dialogs |

## Troubleshooting

### "No changes detected"

- All hosts and ports are identical across scans
- This is expected if nothing changed

### Slow loading

- Large scans (1000+ hosts) may take a few seconds
- Consider filtering to specific hosts of interest

### Comparison not saving

- Check browser's localStorage isn't full
- Try clearing old saved comparisons
