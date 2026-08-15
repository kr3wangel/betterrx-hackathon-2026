/**
 * mocks.ts — the typed adapter/mock layer for data the backend does not serve yet.
 *
 * The frontend is NOT gated by the backend. Where an endpoint is missing, feature lanes
 * import a function from here. Each function returns mock data today and is shaped so it
 * can swap to a real `fetch` in one line later (return type stays the same). When the
 * real endpoint lands, replace the body — callers don't change.
 *
 * Covered gaps (see docs/FRONTEND-TASKS.md Lane 0 · FE-0.6):
 *   - serialized vendor inventory + per-unit location   → mockVendorInventory / mockUnitLocations
 *   - CMS HCPCS pricing (DME spend vs med spend)         → mockHcpcsPricing / mockPatientCostOfCare
 *   - cost-threshold approvals (DON approve/deny)        → mockApprovals / COST_APPROVAL_THRESHOLD_USD
 *   - evidence_source where no payload.source exists      → mockEvidenceSource (fallback only)
 */
import { CATALOG, byCode } from './domain'
import type { Order } from '../../../shared/types'

// --- Serialized vendor inventory + per-unit location (Lane E) -----------------

/** Where a single serialized unit physically is right now. */
export type UnitLocation = 'in_stock' | 'out_for_delivery' | 'at_patient' | 'overdue_pickup'

export interface InventoryUnit {
  /** Serial / asset tag the vendor tracks on the physical unit. */
  serial: string
  vendor_id: number
  hcpcs_code: string
  equipment_name: string
  location: UnitLocation
  /** Set when the unit is tied to an order (out, at a patient, or awaiting pickup). */
  order_id: number | null
  /** Human location line — a warehouse shelf or a patient address. */
  where: string
}

const LOCATION_LABEL: Record<UnitLocation, string> = {
  in_stock: 'In stock',
  out_for_delivery: 'Out for delivery',
  at_patient: 'At patient',
  overdue_pickup: 'Overdue for pickup',
}

export function unitLocationLabel(location: UnitLocation): string {
  return LOCATION_LABEL[location]
}

/**
 * Serialized inventory for a vendor, enriched from that vendor's real open orders.
 * Each active order becomes an "out"/"at patient"/"overdue" unit; a few spare units
 * sit in stock so the "where is all my equipment" view isn't empty.
 */
export function mockVendorInventory(vendorId: number, orders: Order[]): InventoryUnit[] {
  const mine = orders.filter((o) => o.vendor_id === vendorId)
  const fromOrders: InventoryUnit[] = mine.map((o) => {
    const location: UnitLocation =
      o.state === 'pickup_overdue'
        ? 'overdue_pickup'
        : o.state === 'delivered' || o.state === 'pickup_pending'
          ? 'at_patient'
          : o.state === 'dispatched' || o.state === 'in_transit'
            ? 'out_for_delivery'
            : 'in_stock'
    return {
      serial: `${o.hcpcs_code}-${String(o.id).padStart(4, '0')}`,
      vendor_id: vendorId,
      hcpcs_code: o.hcpcs_code,
      equipment_name: o.equipment_name,
      location,
      order_id: o.id,
      where: location === 'in_stock' ? 'Warehouse · Bay A' : `Patient #${o.patient_id}`,
    }
  })
  // A couple of spare in-stock units so the inventory reads like a real shelf.
  const spare = CATALOG.slice(0, 2).map((c, i) => ({
    serial: `${c.hcpcs_code}-90${i}${vendorId}`,
    vendor_id: vendorId,
    hcpcs_code: c.hcpcs_code,
    equipment_name: c.equipment_name,
    location: 'in_stock' as UnitLocation,
    order_id: null,
    where: `Warehouse · Bay ${String.fromCharCode(66 + i)}`,
  }))
  return [...fromOrders, ...spare]
}

/** Per-unit location lookup keyed by order id (for enriching an order card). */
export function mockUnitLocations(vendorId: number, orders: Order[]): Map<number, InventoryUnit> {
  const map = new Map<number, InventoryUnit>()
  for (const unit of mockVendorInventory(vendorId, orders)) {
    if (unit.order_id != null) map.set(unit.order_id, unit)
  }
  return map
}

// --- CMS HCPCS pricing + cost-of-care (Lane D) --------------------------------

export interface HcpcsPricing {
  hcpcs_code: string
  equipment_name: string
  rental: boolean
  /** Approx monthly rental (or one-time purchase) allowed amount, from the CMS PUF. */
  monthly_usd: number
  /** Synthetic one-time delivery/setup fee — not in the CMS file. */
  setup_usd: number
}

/**
 * CMS HCPCS pricing keyed by code. `monthly_usd` is the real CMS avg allowed amount
 * (see shared/catalog.ts); `setup_usd` is a synthetic setup fee for the cost widget.
 */
export function mockHcpcsPricing(hcpcsCode: string): HcpcsPricing | null {
  const item = byCode(hcpcsCode)
  if (!item) return null
  return {
    hcpcs_code: item.hcpcs_code,
    equipment_name: item.equipment_name,
    rental: item.rental,
    monthly_usd: item.avg_allowed_usd,
    setup_usd: item.rental ? 35 : 0,
  }
}

export interface PatientCostOfCare {
  patient_id: number
  dme_spend_usd: number
  /** Synthetic medication spend, so DME can sit *beside* med spend per the report. */
  med_spend_usd: number
  total_usd: number
}

/**
 * DME spend beside med spend for one patient. DME spend is summed from the patient's
 * real orders via CMS pricing; med spend is a synthetic per-patient figure.
 */
export function mockPatientCostOfCare(patientId: number, orders: Order[]): PatientCostOfCare {
  const dme = orders
    .filter((o) => o.patient_id === patientId)
    .reduce((sum, o) => {
      const p = mockHcpcsPricing(o.hcpcs_code)
      return sum + (p ? (p.monthly_usd + p.setup_usd) * o.quantity : 0)
    }, 0)
  // Deterministic synthetic med spend so the demo is stable across reloads.
  const med = 1800 + (patientId % 7) * 240
  const dmeRounded = Math.round(dme * 100) / 100
  return { patient_id: patientId, dme_spend_usd: dmeRounded, med_spend_usd: med, total_usd: Math.round((dmeRounded + med) * 100) / 100 }
}

// --- Cost-threshold approvals (Lane D) ----------------------------------------

/** Orders above this monthly DME cost need DON sign-off before dispatch. */
export const COST_APPROVAL_THRESHOLD_USD = 150

export type ApprovalStatus = 'pending' | 'approved' | 'denied'

export interface CostApproval {
  order_id: number
  hcpcs_code: string
  equipment_name: string
  monthly_usd: number
  status: ApprovalStatus
  /** Who acted, once decided. */
  decided_by: string | null
}

/**
 * Cost-threshold approvals: orders whose monthly cost clears the DON threshold.
 * Above-threshold orders start `pending`; the DON approve/deny surface flips them.
 */
export function mockApprovals(orders: Order[]): CostApproval[] {
  return orders
    .map((o): CostApproval | null => {
      const p = mockHcpcsPricing(o.hcpcs_code)
      if (!p || p.monthly_usd < COST_APPROVAL_THRESHOLD_USD) return null
      return {
        order_id: o.id,
        hcpcs_code: o.hcpcs_code,
        equipment_name: o.equipment_name,
        monthly_usd: p.monthly_usd,
        status: 'pending',
        decided_by: null,
      }
    })
    .filter((a): a is CostApproval => a !== null)
}

// --- Message evidence source (Lane A) -----------------------------------------

/** Where a status claim came from — the trust distinction behind EvidenceBadge. */
export type EvidenceSource = 'pod' | 'vendor_text' | 'portal_tap' | 'case_manager'

/**
 * Evidence source for a message/event. `pod` is proof (verified); everything else is
 * a claim (reported).
 *
 * Now the fallback, not the default: every live write site stamps `payload.source` on the
 * event, and the timelines read it through `eventSourceNote()` in `lib/domain.ts`. This
 * inference is still used for rows that genuinely carry no source — seeded history, and
 * message rows, which the backend does not tag.
 */
export function mockEvidenceSource(input: {
  verified?: boolean
  actor?: string
  direction?: 'in' | 'out'
}): EvidenceSource {
  if (input.verified) return 'pod'
  if (input.actor === 'hospice') return 'case_manager'
  if (input.direction === 'in') return 'vendor_text'
  return 'portal_tap'
}

/** True only for hard proof (POD photo + signature) — never for a vendor's text. */
export function isVerifiedEvidence(source: EvidenceSource): boolean {
  return source === 'pod'
}
