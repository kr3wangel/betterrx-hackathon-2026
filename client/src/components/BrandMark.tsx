import { cn } from '@/lib/utils'

/**
 * The BetterRX brand mark: "better" with a raised "RX", on the diagonal
 * coral→gold gradient pill from betterrx.com. Recreated in markup (not a raster
 * asset) so it stays crisp, themeable, and CSP-safe. Anchored to the design
 * system's --primary coral so it tracks the app's CTA color.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-start rounded-full px-3 py-1 font-display text-sm font-extrabold leading-none tracking-tight text-white',
        'bg-[linear-gradient(115deg,var(--primary)_0%,#ef9e6e_55%,#f3c078_100%)]',
        className
      )}
    >
      better
      <span className="ml-0.5 text-[0.62em] font-bold uppercase tracking-tight">RX</span>
    </span>
  )
}
