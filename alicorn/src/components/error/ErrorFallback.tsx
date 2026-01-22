/**
 * Error fallback component - displays friendly error messages
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { parseError, type FriendlyError } from '@/lib/errors'

interface ErrorFallbackProps {
  error: unknown
  resetError?: () => void
  showHomeButton?: boolean
  compact?: boolean
}

export function ErrorFallback({
  error,
  resetError,
  showHomeButton = false,
  compact = false,
}: ErrorFallbackProps) {
  const friendlyError: FriendlyError = parseError(error)

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{friendlyError.title}</p>
          <p className="text-sm text-muted truncate">{friendlyError.message}</p>
        </div>
        {friendlyError.canRetry && resetError && (
          <Button variant="outline" size="sm" onClick={resetError}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {friendlyError.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted">{friendlyError.message}</p>

        {friendlyError.code && (
          <p className="text-xs font-mono text-muted">
            Error code: {friendlyError.code}
          </p>
        )}

        <div className="flex items-center gap-3">
          {friendlyError.canRetry && resetError && (
            <Button onClick={resetError}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
          {showHomeButton && (
            <Button variant="outline" asChild>
              <a href="/">
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Full-page error display for critical errors
 */
export function ErrorPage({
  error,
  resetError,
}: {
  error: unknown
  resetError?: () => void
}) {
  const friendlyError = parseError(error)

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold">{friendlyError.title}</h1>
      <p className="text-muted mt-2 mb-6 max-w-md">{friendlyError.message}</p>

      {friendlyError.code && (
        <p className="text-xs font-mono text-muted mb-4">
          Error code: {friendlyError.code}
        </p>
      )}

      <div className="flex items-center gap-3">
        {friendlyError.canRetry && resetError && (
          <Button onClick={resetError}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href="/">
            <Home className="h-4 w-4 mr-2" />
            Return to Dashboard
          </a>
        </Button>
      </div>
    </div>
  )
}
