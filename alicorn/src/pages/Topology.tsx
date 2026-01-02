/**
 * Topology page - Network graph visualization
 * OPTE/Kaminsky-inspired network topology view
 * Copyright (c) 2025 Robert E. Lee <robert@unicornscan.org>
 */

import { useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  NetworkGraph,
  TopologyLegend,
  TopologyControls,
  useTopologyForScan,
  useGlobalTopology,
  aggregateBySubnet,
  type TopologyFilters,
  type TopologyConfig,
  type TopologyNode,
} from '@/features/topology'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErrorFallback } from '@/components/error'

export function Topology() {
  const [searchParams] = useSearchParams()
  const scan_id_param = searchParams.get('scan_id')
  const scan_id = scan_id_param ? parseInt(scan_id_param, 10) : null

  const [filters, setFilters] = useState<TopologyFilters>({})
  const [config, setConfig] = useState<Partial<TopologyConfig>>({})
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)
  const [aggregated, setAggregated] = useState(false)

  // Fetch topology data - either for a specific scan or global
  const scanTopology = useTopologyForScan(scan_id ?? 0)
  const globalTopology = useGlobalTopology(filters)

  // Use appropriate data source
  const { data: topologyData, isLoading, error } = scan_id
    ? { data: scanTopology.data, isLoading: scanTopology.isLoading, error: scanTopology.error }
    : { data: globalTopology.data, isLoading: globalTopology.isLoading, error: globalTopology.error }

  // Apply aggregation if needed
  const displayData = topologyData
    ? (aggregated || topologyData.needsAggregation ? aggregateBySubnet(topologyData) : topologyData)
    : null

  const handleNodeClick = useCallback((node: TopologyNode) => {
    setSelectedNode(node)
  }, [])

  const handleNodeHover = useCallback((_node: TopologyNode | null) => {
    // Could be used for highlighting related nodes
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader scan_id={scan_id} scanInfo={scanTopology.scan} />
        <div className="h-[600px] bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader scan_id={scan_id} scanInfo={scanTopology.scan} />
        <ErrorFallback
          error={error}
          resetError={() => window.location.reload()}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader scan_id={scan_id} scanInfo={scanTopology.scan} />

      {/* Controls */}
      {displayData && (
        <TopologyControls
          filters={filters}
          onFiltersChange={setFilters}
          config={config}
          onConfigChange={setConfig}
          nodeCount={displayData.nodeCount}
          edgeCount={displayData.edgeCount}
        />
      )}

      {/* Main visualization area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Graph */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              {displayData ? (
                <div className="relative">
                  {/* Aggregation warning */}
                  {displayData.needsAggregation && (
                    <div className="absolute top-4 left-4 z-10 bg-amber-500/90 text-white px-3 py-1.5 rounded-md text-sm">
                      Large dataset: showing aggregated /24 subnets
                    </div>
                  )}

                  {/* Toggle aggregation */}
                  {topologyData && topologyData.nodeCount > 100 && (
                    <div className="absolute top-4 right-4 z-10">
                      <Button
                        size="sm"
                        variant={aggregated ? 'secondary' : 'outline'}
                        onClick={() => setAggregated(!aggregated)}
                      >
                        {aggregated ? 'Show All Nodes' : 'Aggregate by /24'}
                      </Button>
                    </div>
                  )}

                  <NetworkGraph
                    data={displayData}
                    config={config}
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                    className="h-[600px]"
                  />
                </div>
              ) : (
                <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                  No topology data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Legend and Selected Node */}
        <div className="space-y-4">
          <TopologyLegend />

          {/* Selected Node Details */}
          {selectedNode && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Selected Node</CardTitle>
              </CardHeader>
              <CardContent>
                <NodeDetails node={selectedNode} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PageHeaderProps {
  scan_id: number | null
  scanInfo?: { target_str: string | null; profile: string } | null
}

function PageHeader({ scan_id, scanInfo }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Network Topology</h1>
        {scan_id ? (
          <p className="text-muted mt-1">
            Topology for{' '}
            <Link to={`/scans/${scan_id}`} className="text-primary hover:underline">
              scan #{scan_id}
            </Link>
            {scanInfo && (
              <span className="ml-2">
                ({scanInfo.target_str ?? 'unknown target'} - {scanInfo.profile})
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted mt-1">
            Global network view across all scans
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {scan_id && (
          <Button variant="outline" asChild>
            <Link to="/topology">View Global</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

interface NodeDetailsProps {
  node: TopologyNode
}

function NodeDetails({ node }: NodeDetailsProps) {
  return (
    <div className="space-y-3 text-sm">
      {/* IP / Label */}
      <div>
        <div className="font-mono font-medium text-lg">{node.id}</div>
        {node.label !== node.id && (
          <div className="text-muted-foreground">{node.label}</div>
        )}
      </div>

      {/* Type Badge */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Type:</span>
        <span className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          node.type === 'scanner' && 'bg-red-500/20 text-red-500',
          node.type === 'router' && 'bg-amber-500/20 text-amber-500',
          node.type === 'host' && 'bg-emerald-500/20 text-emerald-500'
        )}>
          {node.type}
        </span>
      </div>

      {/* OS Info */}
      {node.osGuess && (
        <div>
          <div className="text-muted-foreground mb-0.5">OS Detection:</div>
          <div>{node.osGuess}</div>
        </div>
      )}
      {!node.osGuess && node.osFamily !== 'unknown' && (
        <div>
          <div className="text-muted-foreground mb-0.5">OS Family:</div>
          <div className="capitalize">{node.osFamily}</div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <div>
          <div className="text-muted-foreground text-xs">Responding Ports</div>
          <div className="font-medium">{node.portCount}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Connections</div>
          <div className="font-medium">{node.connectionCount}</div>
        </div>
        {node.observedTtl !== undefined && (
          <div>
            <div className="text-muted-foreground text-xs">TTL</div>
            <div className="font-medium">{node.observedTtl}</div>
          </div>
        )}
        {node.estimatedHops > 0 && (
          <div>
            <div className="text-muted-foreground text-xs">Est. Hops</div>
            <div className="font-medium">{node.estimatedHops}</div>
          </div>
        )}
      </div>

      {/* Timestamps */}
      {(node.firstSeen || node.lastSeen) && (
        <div className="pt-2 border-t text-xs text-muted-foreground">
          {node.firstSeen && (
            <div>First seen: {new Date(node.firstSeen * 1000).toLocaleString()}</div>
          )}
          {node.lastSeen && (
            <div>Last seen: {new Date(node.lastSeen * 1000).toLocaleString()}</div>
          )}
        </div>
      )}

      {/* Link to host detail */}
      {node.type === 'host' && (
        <div className="pt-2">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to={`/hosts/${encodeURIComponent(node.id)}`}>
              View Host Details
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

export default Topology
