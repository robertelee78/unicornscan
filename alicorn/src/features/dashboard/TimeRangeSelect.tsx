/**
 * Time range selector for dashboard filtering
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TIME_RANGE_OPTIONS, type TimeRange } from './types'

interface TimeRangeSelectProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
}

export function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TimeRange)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder="Select time range" />
      </SelectTrigger>
      <SelectContent>
        {TIME_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
