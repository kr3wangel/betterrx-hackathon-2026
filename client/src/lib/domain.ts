import type { MessageIntent, OrderEvent, OrderState } from '../../../shared/types'

// Single source of truth, grounded in the CMS DMEPOS public use file.
export { CATALOG, byCode, BED_CODE } from '../../../shared/catalog'
export type { CatalogItem } from '../../../shared/catalog'

// Plain-English status vocabulary — never show raw state names on screen.
// See docs/DESIGN-SYSTEM.md "Plain-English status vocabulary".
export const STATE_LABEL: Record<OrderState, string> = {
  ordered: 'Ordered',
  dispatched: 'Accepted',
  in_transit: 'On the truck',
  delivered: 'Delivered',
  pickup_pending: 'Pickup pending',
  pickup_overdue: 'Pickup overdue',
  picked_up: 'Picked up',
  cancelled: 'Cancelled',
}

export const STATE_TONE: Record<OrderState, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  ordered: 'gray',
  dispatched: 'blue',
  in_transit: 'blue',
  delivered: 'green',
  pickup_pending: 'yellow',
  pickup_overdue: 'red',
  picked_up: 'green',
  cancelled: 'gray',
}

// The status "spine" color (6px left rail) + StatusPill tone, mapped to Badge variants.
// Semantic: neutral=ordered · navy=in motion (accepted / on the truck) · green=done with proof · red=overdue.
export type StatusTone = 'ordered' | 'motion' | 'done' | 'risk'

export const STATE_STATUS_TONE: Record<OrderState, StatusTone> = {
  ordered: 'ordered',
  dispatched: 'motion',
  in_transit: 'motion',
  delivered: 'done',
  pickup_pending: 'motion',
  pickup_overdue: 'risk',
  picked_up: 'done',
  cancelled: 'ordered',
}

// Plain-English labels for message review outcomes — never render raw review_status enums.
// See shared/types.ts ReviewStatus.
export const REVIEW_STATUS_LABEL: Record<'auto_applied' | 'needs_review' | 'confirmed' | 'rejected', string> = {
  auto_applied: 'Applied automatically',
  needs_review: 'Needs review',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
}

// Human labels for the event timeline — replaces raw event_type enums on screen.
export const EVENT_TYPE_LABEL: Record<string, string> = {
  order_placed: 'Order placed',
  vendor_accepted: 'Vendor accepted',
  eta_set: 'ETA set',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  pickup_triggered: 'Pickup triggered',
  pickup_overdue: 'Pickup overdue',
  picked_up: 'Picked up',
  vendor_swapped: 'Vendor swapped',
  cancelled: 'Cancelled',
  risk_updated: 'Risk updated',
  family_notified: 'Family notified',
}

export function eventLabel(type: string): string {
  return EVENT_TYPE_LABEL[type] ?? type.replaceAll('_', ' ')
}

// How the system learned a status, read from the event's own payload.source. On a
// 'vendor_message' the actor is the discriminator the payload doesn't spell out: 'ai' is
// the only actor applyParsed() runs under after a model parse — a tapped digit applies the
// same intent under 'vendor' with confidence 1, and a queue confirmation under 'hospice'.
// Seeded history writes no source at all, so those rows return null.
export function eventSourceNote(event: OrderEvent): string | null {
  const source = event.payload?.source
  if (typeof source !== 'string') return null
  if (source === 'vendor_message') {
    if (event.actor === 'ai') return 'vendor text · parsed by Claude'
    if (event.actor === 'hospice') return 'vendor text · confirmed by a human'
    return 'digit reply · no model'
  }
  if (source === 'portal') return 'magic link · no model'
  if (source === 'nurse') return 'nurse tap · no model'
  if (source === 'emr') return 'EMR webhook · no model'
  return null
}

// Plain-English labels for parsed message intents — never render the raw intent enum.
export const INTENT_LABEL: Record<MessageIntent, string> = {
  accept: 'Accepting the order',
  eta_update: 'Sharing an ETA',
  delay: 'Reporting a delay',
  out_for_delivery: 'Out for delivery',
  delivered: 'Marking delivered',
  pickup_scheduled: 'Scheduling a pickup',
  picked_up: 'Marking picked up',
  decline: 'Declining the order',
  unknown: 'Unclear — needs a look',
}

export function intentLabel(intent: MessageIntent): string {
  return INTENT_LABEL[intent] ?? intent
}

export const BOARD_COLUMNS: { title: string; states: OrderState[] }[] = [
  { title: 'Ordered', states: ['ordered'] },
  { title: 'Dispatched', states: ['dispatched'] },
  { title: 'In transit', states: ['in_transit'] },
  { title: 'Delivered', states: ['delivered'] },
  { title: 'Pickup', states: ['pickup_pending', 'pickup_overdue'] },
  { title: 'Done', states: ['picked_up'] },
]
