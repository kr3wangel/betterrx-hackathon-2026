const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

/** Where a spend figure came from — a real figure and an invented one must not look alike. */
export type SpendBarSource = 'CMS' | 'synthetic'

/**
 * SpendBar — one provenance-aware spend bar (label, amount, proportional fill, source
 * badge). Shared by the Reports `Cost of care` card and the in-depth cost-of-care page
 * so the two never drift apart.
 */
export function SpendBar({
  label,
  amount,
  width,
  color,
  source,
}: {
  label: string
  amount: number
  width: number
  color: string
  source?: SpendBarSource
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {label}
          {source && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                source === 'CMS'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
              title={
                source === 'CMS'
                  ? 'Real: CMS Medicare DMEPOS Public Use File, average allowed amount per HCPCS code'
                  : 'Synthetic: hospice drug spend sits inside the Medicare per-diem, so there is no public per-patient figure'
              }
            >
              {source === 'CMS' ? 'CMS data' : 'synthetic'}
            </span>
          )}
        </span>
        <span className="font-semibold tabular-nums">{usd(amount)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(width * 100)}%` }} />
      </div>
    </div>
  )
}
