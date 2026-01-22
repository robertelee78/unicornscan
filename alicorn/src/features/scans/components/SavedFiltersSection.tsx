/**
 * Saved filters management section
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { Save, Trash2, Check, X, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { ScanFilters, SavedFilter, SavedFilterType } from '../types'
import {
  useSavedFilters,
  useCreateSavedFilter,
  useUpdateSavedFilter,
  useDeleteSavedFilter,
} from '../hooks'

interface SavedFiltersSectionProps {
  currentFilters: ScanFilters
  onApplyFilter: (filters: ScanFilters) => void
  filterType?: SavedFilterType
}

export function SavedFiltersSection({
  currentFilters,
  onApplyFilter,
  filterType = 'scan',
}: SavedFiltersSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newFilterName, setNewFilterName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const { data: savedFilters, isLoading } = useSavedFilters(filterType)
  const createMutation = useCreateSavedFilter()
  const updateMutation = useUpdateSavedFilter()
  const deleteMutation = useDeleteSavedFilter()

  // Check if current filters match default (no active filters)
  const hasActiveFilters =
    currentFilters.search !== '' ||
    currentFilters.notesSearch !== '' ||
    currentFilters.profiles.length > 0 ||
    currentFilters.modes.length > 0 ||
    currentFilters.dateFrom !== null ||
    currentFilters.dateTo !== null ||
    currentFilters.minHosts !== null ||
    currentFilters.maxHosts !== null

  const handleSaveNew = useCallback(async () => {
    if (!newFilterName.trim()) return

    await createMutation.mutateAsync({
      filter_name: newFilterName.trim(),
      filter_type: filterType,
      filter_config: currentFilters,
      is_default: false,
    })

    setNewFilterName('')
    setIsCreating(false)
  }, [newFilterName, filterType, currentFilters, createMutation])

  const handleApply = useCallback(
    (filter: SavedFilter) => {
      onApplyFilter(filter.filter_config)
    },
    [onApplyFilter]
  )

  const handleSetDefault = useCallback(
    async (filter: SavedFilter) => {
      // First, unset any existing default
      const currentDefault = savedFilters.find((f) => f.is_default)
      if (currentDefault && currentDefault.filter_id !== filter.filter_id) {
        await updateMutation.mutateAsync({
          filterId: currentDefault.filter_id,
          updates: { is_default: false },
        })
      }

      // Then set the new default
      await updateMutation.mutateAsync({
        filterId: filter.filter_id,
        updates: { is_default: !filter.is_default },
      })
    },
    [savedFilters, updateMutation]
  )

  const handleStartEdit = useCallback((filter: SavedFilter) => {
    setEditingId(filter.filter_id)
    setEditingName(filter.filter_name)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (editingId === null || !editingName.trim()) return

    await updateMutation.mutateAsync({
      filterId: editingId,
      updates: { filter_name: editingName.trim() },
    })

    setEditingId(null)
    setEditingName('')
  }, [editingId, editingName, updateMutation])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingName('')
  }, [])

  const handleDelete = useCallback(
    async (filterId: number) => {
      await deleteMutation.mutateAsync(filterId)
    },
    [deleteMutation]
  )

  const handleUpdateFilterConfig = useCallback(
    async (filter: SavedFilter) => {
      await updateMutation.mutateAsync({
        filterId: filter.filter_id,
        updates: { filter_config: currentFilters },
      })
    },
    [currentFilters, updateMutation]
  )

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
        <span>Saved Filters</span>
        <span
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            isOpen ? 'rotate-180' : ''
          )}
        >
          ▾
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-2">
        <div className="space-y-3">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && savedFilters.length === 0 && !isCreating && (
            <div className="text-center py-3">
              <p className="text-sm text-muted-foreground">No saved filters yet</p>
              {hasActiveFilters && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setIsCreating(true)}
                  className="mt-1"
                >
                  Save current filters
                </Button>
              )}
            </div>
          )}

          {/* Saved filters list */}
          {!isLoading && savedFilters.length > 0 && (
            <div className="space-y-1">
              {savedFilters.map((filter) => (
                <div
                  key={filter.filter_id}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  {editingId === filter.filter_id ? (
                    // Edit mode
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 flex-1 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') handleCancelEdit()
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5 text-success" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={handleCancelEdit}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    // View mode
                    <>
                      <button
                        type="button"
                        onClick={() => handleApply(filter)}
                        className="flex-1 text-left text-sm truncate"
                      >
                        {filter.filter_name}
                      </button>
                      {filter.is_default && (
                        <Badge variant="outline" className="text-xs px-1.5">
                          Default
                        </Badge>
                      )}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleSetDefault(filter)}
                          title={filter.is_default ? 'Remove as default' : 'Set as default'}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              filter.is_default
                                ? 'fill-yellow-500 text-yellow-500'
                                : 'text-muted-foreground'
                            )}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleUpdateFilterConfig(filter)}
                          title="Update with current filters"
                          disabled={!hasActiveFilters}
                        >
                          <Save className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleStartEdit(filter)}
                        >
                          ✏️
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => handleDelete(filter.filter_id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new filter */}
          {isCreating ? (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Input
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                placeholder="Filter name..."
                className="h-8 flex-1 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveNew()
                  if (e.key === 'Escape') {
                    setIsCreating(false)
                    setNewFilterName('')
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveNew}
                disabled={!newFilterName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsCreating(false)
                  setNewFilterName('')
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreating(true)}
                className="w-full mt-2"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Current Filters
              </Button>
            )
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
