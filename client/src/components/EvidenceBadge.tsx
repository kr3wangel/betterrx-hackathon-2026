import { BadgeCheck, MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * EvidenceBadge — the trust distinction that runs through the whole product.
 * "Verified" (green) = driver photo + signature (proof of delivery / pickup).
 * "Reported" (navy-grey) = the vendor said so by text/portal tap — a claim, not proof.
 * A vendor's text must never render like proof.
 */
export function EvidenceBadge({ verified, className }: { verified: boolean; className?: string }) {
  return verified ? (
    <Badge variant="success" className={cn(className)}>
      <BadgeCheck className="size-3.5" />
      Verified
    </Badge>
  ) : (
    <Badge variant="muted" className={cn(className)}>
      <MessageSquareText className="size-3.5" />
      Reported
    </Badge>
  )
}
