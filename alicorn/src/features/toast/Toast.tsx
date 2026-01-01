/**
 * Toast notification component
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState } from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastData {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastProps {
  toast: ToastData
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const STYLES: Record<ToastType, string> = {
  success: 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400',
  error: 'border-destructive/50 bg-destructive/10 text-destructive',
  warning: 'border-warning/50 bg-warning/10 text-warning',
  info: 'border-primary/50 bg-primary/10 text-primary',
}

const ICON_STYLES: Record<ToastType, string> = {
  success: 'text-green-600 dark:text-green-400',
  error: 'text-destructive',
  warning: 'text-warning',
  info: 'text-primary',
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false)
  const Icon = ICONS[toast.type]

  const handleDismiss = () => {
    setIsExiting(true)
    // Wait for animation before removing
    setTimeout(() => onDismiss(toast.id), 200)
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm',
        'transition-all duration-200',
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0',
        STYLES[toast.type]
      )}
      role="alert"
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', ICON_STYLES[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-sm opacity-80 mt-0.5">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Toast container - renders all toasts in a portal
 */
export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
