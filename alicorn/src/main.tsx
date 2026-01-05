/**
 * Alicorn - Main entry point
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ThemeProvider } from '@/features/theme'
import { ToastProvider } from '@/features/toast'
import { ErrorBoundary } from '@/components/error'
import { AppLayout } from '@/components/layout'
import {
  Dashboard,
  Scans,
  ScansCompare,
  ScanDetail,
  Hosts,
  HostDetail,
  Topology,
  Statistics,
  Settings,
  NotFound,
} from '@/pages'

import './index.css'

// Configure QueryClient with sensible defaults for network scanner data
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time of 30 seconds - scan data changes infrequently
      staleTime: 30 * 1000,
      // Cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests twice with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="scans" element={<Scans />} />
                  <Route path="scans/compare" element={<ScansCompare />} />
                  <Route path="scans/:id" element={<ScanDetail />} />
                  <Route path="hosts" element={<Hosts />} />
                  <Route path="hosts/:id" element={<HostDetail />} />
                  <Route path="topology" element={<Topology />} />
                  <Route path="compare" element={<Navigate to="/scans" replace />} />
                  <Route path="statistics" element={<Statistics />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
