import type { OrderState } from '../../../shared/types'

// Single source of truth, grounded in the CMS DMEPOS public use file.
export { CATALOG, byCode, BED_CODE } from '../../../shared/catalog'
export type { CatalogItem } from '../../../shared/catalog'

export const STATE_LABEL: Record<OrderState, string> = {
  ordered: 'Ordered',
  dispatched: 'Dispatched',
  in_transit: 'In transit',
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

export const BOARD_COLUMNS: { title: string; states: OrderState[] }[] = [
  { title: 'Ordered', states: ['ordered'] },
  { title: 'Dispatched', states: ['dispatched'] },
  { title: 'In transit', states: ['in_transit'] },
  { title: 'Delivered', states: ['delivered'] },
  { title: 'Pickup', states: ['pickup_pending', 'pickup_overdue'] },
  { title: 'Done', states: ['picked_up'] },
]
