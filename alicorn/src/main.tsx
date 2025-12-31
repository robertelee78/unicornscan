/**
 * Alicorn - Main entry point
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AppLayout } from '@/components/layout'
import {
  Dashboard,
  Scans,
  ScanDetail,
  Hosts,
  HostDetail,
  Topology,
  Compare,
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
      // Retry failed requests twice
      retry: 2,
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="scans" element={<Scans />} />
            <Route path="scans/:id" element={<ScanDetail />} />
            <Route path="hosts" element={<Hosts />} />
            <Route path="hosts/:id" element={<HostDetail />} />
            <Route path="topology" element={<Topology />} />
            <Route path="compare" element={<Compare />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
