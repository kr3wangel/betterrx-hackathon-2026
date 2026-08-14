import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Keep in sync with server/risk.ts RISK_THRESHOLD (70).
export const RISK_THRESHOLD = 70

/**
 * RiskBadge — the rules-based risk score as a green/amber/red pill.
 * ≥70 (at-risk) reads red; 40–69 amber; below is a calm green.
 */
export function RiskBadge({ score, className }: { score: number; className?: string }) {
  const variant = score >= RISK_THRESHOLD ? 'destructive' : score >= 40 ? 'default' : 'success'
  return (
    <Badge variant={variant} className={cn('tabular-nums', className)}>
      Risk {score}
    </Badge>
  )
}
