import type { Order, RiskResult, VendorStat } from '../shared/types'

export const RISK_THRESHOLD = 70
const ACK_SLA_HOURS = Number(process.env.ACK_SLA_HOURS ?? 4)

export function computeRisk(order: Order, stats: VendorStat[], now: Date): RiskResult {
  if (!order.target_at) return { score: 0, reasons: [] }

  const target = new Date(order.target_at)
  const hoursLeft = (target.getTime() - now.getTime()) / 3_600_000
  const dow = target.getDay()
  const stat =
    stats.find((s) => s.hcpcs_code === order.hcpcs_code && s.day_of_week === dow) ??
    stats.find((s) => s.hcpcs_code === order.hcpcs_code)

  let score = 0
  const reasons: string[] = []

  if (hoursLeft < 0) {
    score += 100
    reasons.push(`deadline passed ${Math.abs(hoursLeft).toFixed(1)}h ago without delivery`)
  } else {
    if (stat && stat.on_time_rate < 0.85) {
      const pts = Math.round((0.85 - stat.on_time_rate) * 200)
      score += pts
      reasons.push(
        `vendor is ${Math.round(stat.on_time_rate * 100)}% on-time for ${order.equipment_name} on this weekday (n=${stat.sample_size})`,
      )
    }
    if (stat && hoursLeft < stat.avg_delivery_hours) {
      score += 30
      reasons.push(
        `${hoursLeft.toFixed(1)}h until deadline but vendor averages ${stat.avg_delivery_hours.toFixed(1)}h for this equipment`,
      )
    }
    if (order.state === 'ordered' && hoursLeft < 24) {
      score += 25
      reasons.push(`vendor has not accepted and deadline is in ${hoursLeft.toFixed(1)}h`)
    }
    const hoursSincePlaced = (now.getTime() - new Date(order.created_at).getTime()) / 3_600_000
    if (order.state === 'ordered' && hoursSincePlaced > ACK_SLA_HOURS) {
      score += 20
      reasons.push(`vendor has not acknowledged the order ${hoursSincePlaced.toFixed(1)}h after placement`)
    }
    if (order.eta_at && new Date(order.eta_at) > target) {
      score += 40
      reasons.push('vendor ETA is after the deadline')
    }
    if (order.urgency === 'stat') score += 10
  }

  return { score: Math.min(100, score), reasons }
}
