import { escalate } from './statemachine'
import type { PodCondition, PodKind } from '../shared/types'

const CONDITION_LABELS: Record<keyof PodCondition, string> = {
  clean: 'not clean',
  functional: 'not functional',
  patient_ready: 'not patient-ready',
}

function parseCondition(input: unknown): PodCondition | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  return {
    clean: raw.clean !== false,
    functional: raw.functional !== false,
    patient_ready: raw.patient_ready !== false,
  }
}

export function recordPodCondition(orderId: number, kind: PodKind, input: unknown): string | null {
  const condition = parseCondition(input)
  if (!condition) return null
  if (kind === 'delivery') {
    const failed = (Object.keys(CONDITION_LABELS) as (keyof PodCondition)[])
      .filter((key) => !condition[key])
      .map((key) => CONDITION_LABELS[key])
    if (failed.length) {
      escalate(orderId, `Equipment condition flagged at delivery for order #${orderId} — ${failed.join(', ')}`)
    }
  }
  return JSON.stringify(condition)
}
