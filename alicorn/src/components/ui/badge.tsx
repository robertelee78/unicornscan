import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground border-border',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-black',
        info: 'border-transparent bg-info text-info-foreground',
        open: 'border-transparent bg-port-open text-port-open-foreground',
        closed: 'border-transparent bg-port-closed text-port-closed-foreground',
        filtered: 'border-transparent bg-port-filtered text-black',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

// Intentional: CVA variants exported with component (shadcn/ui pattern)
// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
