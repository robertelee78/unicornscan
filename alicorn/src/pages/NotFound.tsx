/**
 * 404 Not Found page
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <AlertTriangle className="h-16 w-16 text-warning mb-4" />
      <h1 className="text-4xl font-bold font-mono">404</h1>
      <p className="text-muted mt-2 mb-6">Page not found</p>
      <Button asChild>
        <Link to="/">Return to Dashboard</Link>
      </Button>
    </div>
  )
}
