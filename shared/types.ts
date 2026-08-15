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
  | 'family_confirmed'

export type Actor = 'hospice' | 'vendor' | 'driver' | 'system' | 'ai' | 'family'

/**
 * The six internal personas from the client's mock login. `Actor` names the channel a
 * ledger event came through; `actor_role` names which hat was worn — so the append-only
 * history can say "cancelled by the Case Manager", not just "cancelled by the hospice".
 * Sent per request as an X-Role header; the server treats anything unrecognised as null.
 */
export const ROLE_IDS = [
  'case_manager',
  'admissions_nurse',
  'field_nurse',
  'dispatcher',
  'driver',
  'director_of_nursing',
] as const
export type RoleId = (typeof ROLE_IDS)[number]
export type Urgency = 'routine' | 'urgent' | 'stat'
export type PatientStatus = 'active' | 'discharged' | 'deceased'

export interface Patient {
  id: number
  name: string
  status: PatientStatus
  address: string
  market: string
  /** Family contact for the equipment-condition channel — not the patient. See server/condition.ts. */
  caregiver_name: string
  caregiver_phone: string
  /** 0 when the household has opted out of texts. */
  contact_ok: number
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
  /**
   * The vendor answered the pickup ask. Separate from `eta_at`, which a pickup affirmative
   * deliberately never writes so a daily "yes" can't hold the order out of overdue.
   */
  pickup_committed: boolean
  /** A household said the equipment arrived. Weaker than a POD, stronger than a vendor claim. */
  family_confirmed: boolean
  created_at: string
}

export type PodKind = 'delivery' | 'pickup'

export interface PodCondition {
  clean: boolean
  functional: boolean
  patient_ready: boolean
}

export interface Pod {
  id: number
  order_id: number
  kind: PodKind
  photo_path: string | null
  signature_path: string | null
  condition: PodCondition | null
  captured_at: string
}

export interface OrderEvent {
  id: number
  order_id: number
  type: OrderEventType
  payload: Record<string, unknown> | null
  actor: Actor
  /** Which internal persona acted, when the channel was ours. Null on system/vendor/family events. */
  actor_role: RoleId | null
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

/** Thread discriminator. On an inbound row it names the sender, not the recipient. */
export type RecipientType = 'vendor' | 'family'

export type VendorTemplate =
  | 'v_order_request'
  | 'v_ack_nag'
  | 'v_eta_check'
  | 'v_pickup_request'
  /** One question for a whole stop: N items, one household, one pair. Manifest in message_orders. */
  | 'v_pickup_group'
  /** Overflow: sent instead of a question once all five reply pairs are in use. Carries no digits. */
  | 'v_backlog_digest'

export type FamilyTemplate =
  | 'f_delivery_confirm'
  | 'f_condition_check'
  | 'f_eta_notice'
  | 'f_pickup_notice'
  | 'f_delivered_thanks'
  | 'f_picked_up_thanks'

export type MessageTemplate = VendorTemplate | FamilyTemplate

export interface Message {
  id: number
  order_id: number | null
  vendor_id: number
  direction: 'in' | 'out'
  body: string
  parsed: ParsedMessage | null
  confidence: number | null
  review_status: ReviewStatus | null
  recipient_type: RecipientType
  patient_id: number | null
  /** The question an outbound row asked. Always null inbound and on conversational sends. */
  template: MessageTemplate | null
  /** Set on an outbound question row once a reply resolves it. */
  answered_at: string | null
  /**
   * Base digit of the reply pair this question owns — 1, 3, 5, 7 or 9, paired with the
   * next digit up (9 pairs with 0). Null on inbound rows, conversational sends and the
   * digest. See server/slots.ts.
   */
  reply_slot: number | null
  created_at: string
}

export interface SmsReplyResult {
  message_id: number
  in_reply_to: number | null
  template: MessageTemplate | null
  digit: string | null
  /** The reply pair the answered question owned, so the client can label the digit. */
  slot: number | null
  /** `clarify` = the digit belonged to no open question, so we asked which order instead. */
  outcome: 'applied' | 'prompt' | 'review' | 'unmapped' | 'clarify'
  prompt: string | null
  order: Order | null
  /** Set when the answered question covered a trip: every order the reply applied to. */
  group_order_ids?: number[]
}

export interface Escalation {
  id: number
  order_id: number
  reason: string
  status: 'open' | 'acked' | 'resolved'
  created_at: string
}

/** Who reported the condition. Caregiver is the default and the point of the channel. */
export type ConditionSource = 'caregiver' | 'nurse' | 'driver'

/** A 1-5 equipment condition rating for one delivery. See server/condition.ts. */
export interface ConditionReport {
  id: number
  order_id: number
  vendor_id: number
  patient_id: number
  /** 1 = unusable, 5 = like new. */
  score: number
  source: ConditionSource
  comment: string | null
  created_at: string
}

/** Per-vendor condition rollup — the vendor scorecard input. */
export interface VendorCondition {
  vendor_id: number
  reports: number
  avg_score: number
  /** Share of reports at or below CONDITION_ALERT_AT. */
  bad_rate: number
}

/** Result of an inbound caregiver SMS. needs_review means we would not guess at it. */
export interface CaregiverReplyResult {
  score: number | null
  escalated: boolean
  needs_review: boolean
}

export interface RiskResult {
  score: number
  reasons: string[]
}

export interface VendorScorecard {
  vendor: Vendor
  overall_on_time_rate: number | null
  total_samples: number
  stats: VendorStat[]
}

/**
 * Contract-negotiation rollup, computed live from the event ledger — never from
 * vendor_stats, which is seeded history. See vendorLeverage() in server/reports.ts.
 */
export interface VendorLeverage {
  vendor: Vendor
  /** Every order ever placed with this vendor, any state. */
  orders_total: number
  /** Delivered orders that had a target to grade against. */
  deliveries_measured: number
  /** Subset backed by a driver POD — the ground truth cohort. */
  verified_deliveries: number
  verified_on_time_rate: number | null
  /** Subset with no POD — we have only the vendor's word for when it landed. */
  claimed_deliveries: number
  claimed_on_time_rate: number | null
  /** claimed − verified. Positive = the vendor's story outruns the evidence. Null until both cohorts have samples. */
  trust_gap: number | null
  /** Automated ack chases sent because this vendor sat on an order. */
  nags_sent: number
  /** Escalations raised on this vendor's orders — each one pulled a human in. */
  escalations: number
  /** (nags + escalations) / orders_total. The staff-time tax of working with this vendor. */
  interventions_per_order: number | null
  /** Every templated question we texted them — requests, nags, ETA checks, pickup asks. */
  questions_asked: number
  questions_answered: number
  /** Median hours from question sent to reply received, over answered questions. */
  median_answer_hours: number | null
  /** Questions sent more than NEVER_ANSWERED_AFTER_HOURS ago and still unanswered. */
  never_answered: number
  /** never_answered over questions old enough to judge. Null until one is that old. */
  never_answered_rate: number | null
}

export interface ReportSummary {
  calls_avoided: number
  calls_avoided_definition: string
  calls_avoided_breakdown: {
    auto_applied_messages: number
    vendor_self_service_updates: number
    auto_triggered_pickups: number
    household_confirmations: number
  }
  open_escalations: number
  orders_by_state: Record<OrderState, number>
  pickup_latency: {
    average_hours: number | null
    sample_size: number
  }
}

export type ServerEvent =
  | { type: 'heartbeat'; at: string }
  | { type: 'order_event'; at: string; order_id: number; event_type: OrderEventType; state: OrderState }
  | { type: 'escalation'; at: string; order_id: number; escalation_id: number }
  | { type: 'message'; at: string; message_id: number; vendor_id: number; direction: 'in' | 'out' }
