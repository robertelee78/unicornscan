/**
 * Pagination controls for host list
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PaginationState } from './types'
import { PAGE_SIZE_OPTIONS } from './types'

interface PaginationProps {
  pagination: PaginationState
  total: number
  onChange: (pagination: PaginationState) => void
}

export function Pagination({ pagination, total, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pagination.pageSize)
  const startItem = (pagination.page - 1) * pagination.pageSize + 1
  const endItem = Math.min(pagination.page * pagination.pageSize, total)

  const canGoPrev = pagination.page > 1
  const canGoNext = pagination.page < totalPages

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      onChange({ ...pagination, page })
    }
  }

  const handlePageSizeChange = (size: string) => {
    const newSize = parseInt(size, 10)
    onChange({ page: 1, pageSize: newSize })
  }

  if (total === 0) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="text-muted">
        Showing <span className="font-mono">{startItem}</span> to{' '}
        <span className="font-mono">{endItem}</span> of{' '}
        <span className="font-mono">{total}</span> hosts
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted">Rows:</span>
          <Select
            value={pagination.pageSize.toString()}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-muted">
          Page <span className="font-mono">{pagination.page}</span> of{' '}
          <span className="font-mono">{totalPages}</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(1)}
            disabled={!canGoPrev}
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(pagination.page - 1)}
            disabled={!canGoPrev}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(pagination.page + 1)}
            disabled={!canGoNext}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(totalPages)}
            disabled={!canGoNext}
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
