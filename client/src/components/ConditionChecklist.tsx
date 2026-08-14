import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** The three delivery attestations a driver confirms at proof-of-delivery. */
export type ConditionKey = 'clean' | 'functional' | 'patient_ready'

export type ConditionState = Record<ConditionKey, boolean>

export const EMPTY_CONDITION: ConditionState = {
  clean: false,
  functional: false,
  patient_ready: false,
}

const ITEMS: { key: ConditionKey; label: string; hint: string }[] = [
  { key: 'clean', label: 'Clean', hint: 'Sanitized and free of prior-use residue' },
  { key: 'functional', label: 'Functional', hint: 'Powers on and operates correctly' },
  { key: 'patient_ready', label: 'Patient-ready', hint: 'Set up and safe to use on arrival' },
]

/**
 * ConditionChecklist — the equipment-condition attestations at proof-of-delivery,
 * as shadcn Checkbox rows. Feeds the vendor condition scorecard.
 */
export function ConditionChecklist({
  value,
  onChange,
  className,
}: {
  value: ConditionState
  onChange: (next: ConditionState) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {ITEMS.map((item) => (
        <label
          key={item.key}
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"
        >
          <Checkbox
            checked={value[item.key]}
            onCheckedChange={(checked) => onChange({ ...value, [item.key]: checked === true })}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">{item.label}</span>
            <span className="block text-xs text-muted-foreground">{item.hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
