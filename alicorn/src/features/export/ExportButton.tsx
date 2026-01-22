/**
 * Export button component
 * Reusable export button that opens the export dialog
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Download, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ExportFormat } from './types'

// =============================================================================
// Simple Export Button (opens dialog)
// =============================================================================

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  label?: string
}

export function ExportButton({
  onClick,
  disabled = false,
  size = 'sm',
  variant = 'outline',
  label = 'Export',
}: ExportButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      onClick={onClick}
      disabled={disabled}
    >
      <Download className="h-4 w-4 mr-2" />
      {label}
    </Button>
  )
}

// =============================================================================
// Export Dropdown (quick export with format selection)
// =============================================================================

interface ExportDropdownProps {
  onExport: (format: ExportFormat) => void
  onOpenDialog?: () => void
  disabled?: boolean
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  label?: string
  showAdvanced?: boolean
}

export function ExportDropdown({
  onExport,
  onOpenDialog,
  disabled = false,
  size = 'sm',
  variant = 'outline',
  label = 'Export',
  showAdvanced = true,
}: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          {label}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport('csv')}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('json')}>
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('pdf')}>
          Export as PDF
        </DropdownMenuItem>
        {showAdvanced && onOpenDialog && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenDialog}>
              Advanced Export Options...
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// =============================================================================
// Selection-Aware Export Button
// =============================================================================

interface SelectionExportButtonProps {
  selectedCount: number
  filteredCount: number
  onExportSelected: () => void
  onExportFiltered: () => void
  onExportAll: () => void
  disabled?: boolean
}

export function SelectionExportButton({
  selectedCount,
  filteredCount,
  onExportSelected,
  onExportFiltered,
  onExportAll,
  disabled = false,
}: SelectionExportButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="h-4 w-4 mr-2" />
          Export
          {selectedCount > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({selectedCount})
            </span>
          )}
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {selectedCount > 0 && (
          <DropdownMenuItem onClick={onExportSelected}>
            Export Selected ({selectedCount})
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onExportFiltered}>
          Export Filtered Results ({filteredCount})
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportAll}>
          Export All
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ExportButton
