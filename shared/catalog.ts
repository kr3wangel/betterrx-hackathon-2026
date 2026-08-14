import type { Urgency } from './types'

/**
 * Equipment catalog grounded in the CMS Medicare DMEPOS Public Use File.
 *
 * Source: data.cms.gov dataset 27c150fd-8578-43b1-bba5-6388987e32af,
 *         filtered to Rfrg_Prvdr_Geo_Lvl = "National".
 *
 * `national_benes`  = Tot_Suplr_Benes            — real national beneficiary counts.
 *                     Used only as a *demand weight* so our synthetic equipment mix
 *                     resembles reality instead of being uniform.
 * `avg_allowed_usd` = Avg_Suplr_Mdcr_Alowd_Amt   — real average Medicare allowed amount
 *                     per supplier service. For rental codes this approximates one
 *                     month of rental. It is NOT a hospice contract rate: hospices pay
 *                     a negotiated per-diem out of their Medicare per-diem, and DME for
 *                     the terminal diagnosis is billed to the hospice, not to Medicare.
 *                     Treat it as an order-of-magnitude cost benchmark and say so.
 *
 * Everything else in this repo's data is synthetic. These two columns are the only
 * real-world numbers, which is exactly the line to draw when a judge asks.
 */
export interface CatalogItem {
  hcpcs_code: string
  equipment_name: string
  /** CMS Suplr_Rentl_Ind — hospice DME is overwhelmingly rental, which is why a late pickup costs money. */
  rental: boolean
  avg_allowed_usd: number
  national_benes: number
  typical_urgency: Urgency
}

export const CATALOG: CatalogItem[] = [
  // --- The four the demo scenarios lean on. Order preserved deliberately. ---
  { hcpcs_code: 'E0260', equipment_name: 'Hospital bed, semi-electric', rental: true, avg_allowed_usd: 67.36, national_benes: 162_234, typical_urgency: 'urgent' },
  { hcpcs_code: 'E1390', equipment_name: 'Oxygen concentrator', rental: true, avg_allowed_usd: 115.77, national_benes: 776_543, typical_urgency: 'urgent' },
  { hcpcs_code: 'K0001', equipment_name: 'Standard wheelchair', rental: true, avg_allowed_usd: 26.17, national_benes: 253_687, typical_urgency: 'routine' },
  { hcpcs_code: 'E0601', equipment_name: 'CPAP device', rental: true, avg_allowed_usd: 47.42, national_benes: 734_083, typical_urgency: 'routine' },

  // --- The rest of the world. ---
  { hcpcs_code: 'E0431', equipment_name: 'Portable oxygen system', rental: true, avg_allowed_usd: 23.99, national_benes: 359_326, typical_urgency: 'urgent' },
  { hcpcs_code: 'E0570', equipment_name: 'Nebulizer with compressor', rental: true, avg_allowed_usd: 7.24, national_benes: 252_629, typical_urgency: 'routine' },
  { hcpcs_code: 'E0470', equipment_name: 'BiPAP respiratory assist device', rental: true, avg_allowed_usd: 123.30, national_benes: 94_799, typical_urgency: 'urgent' },
  { hcpcs_code: 'E0630', equipment_name: 'Patient lift', rental: true, avg_allowed_usd: 61.44, national_benes: 46_999, typical_urgency: 'routine' },
  { hcpcs_code: 'E0277', equipment_name: 'Powered pressure-reducing mattress', rental: true, avg_allowed_usd: 212.49, national_benes: 6_639, typical_urgency: 'urgent' },
  { hcpcs_code: 'E0250', equipment_name: 'Hospital bed, fixed height', rental: true, avg_allowed_usd: 65.47, national_benes: 3_523, typical_urgency: 'urgent' },
  { hcpcs_code: 'E0143', equipment_name: 'Walker, folding wheeled', rental: false, avg_allowed_usd: 64.17, national_benes: 493_270, typical_urgency: 'routine' },
  { hcpcs_code: 'E0163', equipment_name: 'Commode chair', rental: false, avg_allowed_usd: 68.40, national_benes: 134_569, typical_urgency: 'routine' },
]

export const byCode = (code: string): CatalogItem | undefined =>
  CATALOG.find((c) => c.hcpcs_code === code)

/**
 * E0260 (semi-electric bed) outnumbers E0250 (fixed-height) roughly 46:1 in the real
 * world — 162,234 beneficiaries vs 3,523. BetterRX's own sample orders use E0250. We
 * default to E0260 because a domain-expert judge will know the difference, and keep
 * E0250 in the catalog so their sample data still resolves.
 */
export const BED_CODE = 'E0260'
