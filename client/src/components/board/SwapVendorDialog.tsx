import { useMemo } from 'react'
import { api } from '../../lib/api'
import { useLive } from '../../lib/useLive'
import { decisionLine } from '../../lib/board'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Order, VendorScorecard } from '../../../../shared/types'

export function SwapVendorDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: cards } = useLive(() => api.get<VendorScorecard[]>('/api/reports/vendor-scorecards'))
  const now = useMemo(() => new Date(), [])
  const alternatives = (cards ?? []).filter((c) => c.vendor.id !== order.vendor_id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send this to another vendor</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2.5">
          {alternatives.map((card) => (
            <button
              key={card.vendor.id}
              className="rounded-[14px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary hover:bg-accent"
              onClick={() => {
                api.post(`/api/orders/${order.id}/swap-vendor`, { vendor_id: card.vendor.id }).catch(console.error)
                onOpenChange(false)
              }}
            >
              <div className="font-display text-[15px] font-bold tracking-tight">{card.vendor.name}</div>
              <div className="mt-0.5 tabular-nums text-sm text-muted-foreground">
                {decisionLine(card, order, now)}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
