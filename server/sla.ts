import type { Urgency } from '../shared/types'

const SLA_STAT_HOURS = Number(process.env.SLA_STAT_HOURS ?? 8)
const SLA_ROUTINE_HOURS = Number(process.env.SLA_ROUTINE_HOURS ?? 24)

export function defaultTargetAt(urgency: Urgency, now = new Date()): string {
  const hours = urgency === 'routine' ? SLA_ROUTINE_HOURS : SLA_STAT_HOURS
  return new Date(now.getTime() + hours * 3_600_000).toISOString()
}

export function resolveTargetAt(
  targetAt: string | null | undefined,
  urgency: Urgency,
  now = new Date(),
): string {
  return targetAt || defaultTargetAt(urgency, now)
}
