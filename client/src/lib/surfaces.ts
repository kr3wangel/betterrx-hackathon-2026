import type { RoleId } from './auth'

// The persona surfaces of the DME module — the working tool.
// Which roles see which surface in the nav. This filters the nav bar ONLY — routes stay
// unguarded on purpose, so any screen is still reachable by URL if a demo goes sideways.
export const surfaceLinks: { to: string; label: string; roles: RoleId[] }[] = [
  // Field Nurse gets the board because /nurse links to it — a nav that hides a page the
  // page itself sends you to is worse than no filtering at all.
  { to: '/hospice', label: 'Board', roles: ['case_manager', 'admissions_nurse', 'director_of_nursing', 'field_nurse'] },
  { to: '/order', label: 'New order', roles: ['case_manager', 'admissions_nurse'] },
  { to: '/nurse', label: 'Nurse', roles: ['case_manager', 'field_nurse'] },
  // Dispatcher's own two links are retired (/vendor, /vendor-portal — both still routed, URL
  // only), so it anchors on the other vendor-side surface. Not the board: that would put a
  // hospice's whole patient list in a vendor employee's nav.
  { to: '/driver', label: 'Driver', roles: ['dispatcher', 'driver'] },
  { to: '/reports', label: 'Reports', roles: ['case_manager', 'director_of_nursing'] },
]

/**
 * Where a role lands when it signs in or switches. Derived from the nav, never hand-written:
 * the landing page and the account menu must not be able to disagree about it.
 */
export function homeFor(roleId: RoleId): string {
  return surfaceLinks.find((l) => l.roles.includes(roleId))?.to ?? '/hospice'
}
