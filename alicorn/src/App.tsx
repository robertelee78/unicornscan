import { Scan, Shield, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-surface-light/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Scan className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold font-mono tracking-tight">
              <span className="text-primary">Ali</span>
              <span className="text-foreground">corn</span>
            </h1>
            <span className="text-xs text-muted px-2 py-0.5 bg-surface rounded">v0.4.18</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          {/* Hero */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold">
              <span className="text-primary">Ali</span>corn
            </h2>
            <p className="text-lg text-muted">
              Asynchronous stimulus response network scanner with PostgreSQL integration
            </p>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            <StatusCard
              icon={<Shield className="h-6 w-6" />}
              title="Scans"
              value="—"
              color="primary"
            />
            <StatusCard
              icon={<Activity className="h-6 w-6" />}
              title="Hosts"
              value="—"
              color="secondary"
            />
            <StatusCard
              icon={<Scan className="h-6 w-6" />}
              title="Ports"
              value="—"
              color="accent"
            />
          </div>

          {/* Setup Instructions */}
          <div className="mt-12 p-6 bg-surface rounded-lg border border-surface-light/30 text-left">
            <h3 className="text-lg font-semibold mb-4 text-primary">Quick Setup</h3>
            <ol className="space-y-3 text-sm text-muted font-mono">
              <li className="flex gap-3">
                <span className="text-primary">1.</span>
                <span>Copy <code className="text-foreground">.env.example</code> to <code className="text-foreground">.env</code></span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">2.</span>
                <span>Configure your Supabase or PostgreSQL connection</span>
              </li>
              <li className="flex gap-3">
                <span className="text-primary">3.</span>
                <span>Run <code className="text-foreground">npm run dev</code> and start scanning</span>
              </li>
            </ol>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 inset-x-0 border-t border-surface-light/30 bg-background/80 backdrop-blur">
        <div className="container mx-auto px-6 py-3">
          <p className="text-xs text-muted text-center font-mono">
            Copyright © 2005-2025 Robert E. Lee &lt;robert@unicornscan.org&gt; • PostgreSQL Schema v5
          </p>
        </div>
      </footer>
    </div>
  )
}

interface StatusCardProps {
  icon: React.ReactNode
  title: string
  value: string
  color: 'primary' | 'secondary' | 'accent'
}

function StatusCard({ icon, title, value, color }: StatusCardProps) {
  const colorClasses = {
    primary: 'text-primary border-primary/30',
    secondary: 'text-secondary border-secondary/30',
    accent: 'text-accent border-accent/30',
  }

  return (
    <div
      className={cn(
        'p-6 rounded-lg bg-surface border',
        colorClasses[color]
      )}
    >
      <div className={cn('mb-2', colorClasses[color].split(' ')[0])}>
        {icon}
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
      <p className="text-sm text-muted">{title}</p>
    </div>
  )
}

export default App
