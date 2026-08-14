import type { OrderState } from '../../../shared/types'

export const CATALOG = [
  { hcpcs_code: 'E0260', equipment_name: 'Hospital bed, semi-electric' },
  { hcpcs_code: 'E1390', equipment_name: 'Oxygen concentrator' },
  { hcpcs_code: 'K0001', equipment_name: 'Standard wheelchair' },
  { hcpcs_code: 'E0601', equipment_name: 'CPAP device' },
]

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
