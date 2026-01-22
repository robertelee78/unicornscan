/**
 * Toast context and provider
 * Copyright (c) 2026 Robert E. Lee <robert@unicornscan.org>
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ToastContainer, type ToastData, type ToastType } from './Toast'

// =============================================================================
// Types
// =============================================================================

interface ToastOptions {
  title: string
  message?: string
  type?: ToastType
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  dismiss: (id: string) => void
  dismissAll: () => void
}

// =============================================================================
// Context
// =============================================================================

const ToastContext = createContext<ToastContextValue | null>(null)

// =============================================================================
// Provider
// =============================================================================

let toastIdCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const addToast = useCallback((options: ToastOptions) => {
    const id = `toast-${++toastIdCounter}`
    const newToast: ToastData = {
      id,
      type: options.type ?? 'info',
      title: options.title,
      message: options.message,
    }

    setToasts((prev) => [...prev, newToast])
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
  }, [])

  const success = useCallback(
    (title: string, message?: string) => addToast({ title, message, type: 'success' }),
    [addToast]
  )

  const error = useCallback(
    (title: string, message?: string) => addToast({ title, message, type: 'error' }),
    [addToast]
  )

  const warning = useCallback(
    (title: string, message?: string) => addToast({ title, message, type: 'warning' }),
    [addToast]
  )

  const info = useCallback(
    (title: string, message?: string) => addToast({ title, message, type: 'info' }),
    [addToast]
  )

  const contextValue: ToastContextValue = {
    toast: addToast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <ToastContainer toasts={toasts} onDismiss={dismiss} />,
          document.body
        )}
    </ToastContext.Provider>
  )
}

// =============================================================================
// Hook
// =============================================================================

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
