/**
 * Checkbox-based multi-select filter group
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { useCallback } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CheckboxFilterGroupProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
  maxHeight?: string
}

export function CheckboxFilterGroup({
  label,
  options,
  selected,
  onChange,
  className,
  maxHeight = '200px',
}: CheckboxFilterGroupProps) {
  const handleToggle = useCallback(
    (option: string) => {
      if (selected.includes(option)) {
        onChange(selected.filter((s) => s !== option))
      } else {
        onChange([...selected, option])
      }
    },
    [selected, onChange]
  )

  const handleSelectAll = useCallback(() => {
    if (selected.length === options.length) {
      onChange([])
    } else {
      onChange([...options])
    }
  }, [selected, options, onChange])

  const allSelected = options.length > 0 && selected.length === options.length
  const someSelected = selected.length > 0 && selected.length < options.length

  if (options.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div className="text-xs text-muted italic">No options available</div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={handleSelectAll}
          className="text-xs text-primary hover:underline focus:outline-none"
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <div
        className="space-y-1 overflow-y-auto pr-2"
        style={{ maxHeight }}
      >
        {options.map((option) => {
          const isChecked = selected.includes(option)
          const id = `filter-${label.toLowerCase().replace(/\s+/g, '-')}-${option}`

          return (
            <div key={option} className="flex items-center gap-2 py-0.5">
              <Checkbox
                id={id}
                checked={isChecked}
                onCheckedChange={() => handleToggle(option)}
                className="h-3.5 w-3.5"
              />
              <Label
                htmlFor={id}
                className={cn(
                  'text-sm cursor-pointer select-none',
                  isChecked ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}
              >
                {option}
              </Label>
            </div>
          )
        })}
      </div>
      {someSelected && (
        <div className="text-xs text-muted-foreground">
          {selected.length} of {options.length} selected
        </div>
      )}
    </div>
  )
}
