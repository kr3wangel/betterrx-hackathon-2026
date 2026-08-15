import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A proof-of-delivery photo or signature. A missing file is a gap in the evidence trail,
 * so it says so in words rather than showing the browser's broken-image glyph.
 */
export function PodImage({
  src,
  alt,
  missing,
  className,
}: {
  src: string
  alt: string
  missing: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <div
        className={cn(
          'grid size-20 place-items-center rounded-lg border border-dashed border-border bg-muted px-1.5 text-center text-[10px] leading-tight text-muted-foreground',
          className
        )}
      >
        {missing}
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} onError={() => setBroken(true)} />
}
