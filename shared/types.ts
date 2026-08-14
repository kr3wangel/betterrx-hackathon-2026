export type OrderState =
  | 'ordered'
  | 'dispatched'
  | 'in_transit'
  | 'delivered'
  | 'pickup_pending'
  | 'pickup_overdue'
  | 'picked_up'
  | 'cancelled'

export type OrderEventType =
  | 'order_placed'
  | 'vendor_accepted'
  | 'eta_set'
  | 'out_for_delivery'
  | 'delivered'
  | 'pickup_triggered'
  | 'pickup_overdue'
  | 'picked_up'
  | 'vendor_swapped'
  | 'cancelled'
  | 'risk_updated'
  | 'family_notified'

export type Actor = 'hospice' | 'vendor' | 'driver' | 'system' | 'ai'
export type Urgency = 'routine' | 'urgent' | 'stat'
export type PatientStatus = 'active' | 'discharged' | 'deceased'

export interface Patient {
  id: number
  name: string
  status: PatientStatus
  address: string
  market: string
}

export interface Vendor {
  id: number
  name: string
  phone: string
  channel: 'sms' | 'email' | 'portal'
  service_area: string
  contact_name: string
}

export interface VendorStat {
  vendor_id: number
  hcpcs_code: string
  day_of_week: number
  on_time_rate: number
  avg_delivery_hours: number
  sample_size: number
}

export interface Order {
  id: number
  patient_id: number
  vendor_id: number
  hcpcs_code: string
  equipment_name: string
  quantity: number
  urgency: Urgency
  target_at: string | null
  state: OrderState
  eta_at: string | null
  risk_score: number | null
  risk_reasons: string[] | null
  delivery_verified: boolean
  pickup_verified: boolean
  created_at: string
}

export interface OrderEvent {
  id: number
  order_id: number
  type: OrderEventType
  payload: Record<string, unknown> | null
  actor: Actor
  created_at: string
}

export type MessageIntent =
  | 'accept'
  | 'eta_update'
  | 'delay'
  | 'out_for_delivery'
  | 'delivered'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'decline'
  | 'unknown'

export interface ParsedMessage {
  order_ref: string | null
  intent: MessageIntent
  eta_iso: string | null
  notes: string | null
  confidence: number
}

export type ReviewStatus = 'auto_applied' | 'needs_review' | 'confirmed' | 'rejected'

export interface Message {
  id: number
  order_id: number | null
  vendor_id: number
  direction: 'in' | 'out'
  body: string
  parsed: ParsedMessage | null
  confidence: number | null
  review_status: ReviewStatus | null
  created_at: string
}

export interface Escalation {
  id: number
  order_id: number
  reason: string
  status: 'open' | 'acked' | 'resolved'
  created_at: string
}

export interface RiskResult {
  score: number
  reasons: string[]
}

export type ServerEvent =
  | { type: 'heartbeat'; at: string }
  | { type: 'order_event'; at: string; order_id: number; event_type: OrderEventType; state: OrderState }
  | { type: 'escalation'; at: string; order_id: number; escalation_id: number }
  | { type: 'message'; at: string; message_id: number; vendor_id: number; direction: 'in' | 'out' }
