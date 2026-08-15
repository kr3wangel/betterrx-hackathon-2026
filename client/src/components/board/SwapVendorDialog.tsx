import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { useLive } from '../../lib/useLive'
import { expectOwn } from '../../lib/expectedEvents'
import { useHighlight } from '../../lib/highlight'
import { decisionLine } from '../../lib/board'
import { firstName, shortEquipment } from '../../lib/narration'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Order, VendorScorecard } from '../../../../shared/types'

export function SwapVendorDialog({
  order,
  who,
  open,
  onOpenChange,
}: {
  order: Order
  who: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: cards } = useLive(() => api.get<VendorScorecard[]>('/api/reports/vendor-scorecards'))
  const [busy, setBusy] = useState<number | null>(null)
  const { pulse } = useHighlight()
  const now = useMemo(() => new Date(), [])
  const alternatives = (cards ?? []).filter((c) => c.vendor.id !== order.vendor_id)

  const swap = async (vendorId: number, vendorName: string) => {
    setBusy(vendorId)
    expectOwn([`order:${order.id}`])
    try {
      await api.post(`/api/orders/${order.id}/swap-vendor`, { vendor_id: vendorId })
      toast.success(`${firstName(who)}'s ${shortEquipment(order.equipment_name)} moved to ${vendorName}`, {
        description: "They've been texted.",
      })
      pulse(order.id)
      onOpenChange(false)
    } catch {
      toast.error("That didn't go through — give it another tap.")
    } finally {
      setBusy(null)
    }
  }

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
              disabled={busy !== null}
              className="rounded-[14px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-60"
              onClick={() => swap(card.vendor.id, card.vendor.name)}
            >
              <div className="font-display text-[15px] font-bold tracking-tight">{card.vendor.name}</div>
              <div className="mt-0.5 tabular-nums text-sm text-muted-foreground">
                {busy === card.vendor.id ? 'Sending…' : decisionLine(card, order, now)}
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
