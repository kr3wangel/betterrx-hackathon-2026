import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// Mock auth for the demo: no backend, no passwords — you pick a role and the shell
// remembers it. The current role is the hook the per-role UI branches on next.
export type RoleId =
  | 'case_manager'
  | 'admissions_nurse'
  | 'field_nurse'
  | 'dispatcher'
  | 'driver'
  | 'director_of_nursing'

export type Role = { id: RoleId; label: string; initials: string }

// One entry per internal persona in the app. The external vendor portal is magic-link
// authed, so it deliberately isn't a login option here.
export const ROLES: Role[] = [
  { id: 'case_manager', label: 'Case Manager', initials: 'CM' },
  { id: 'admissions_nurse', label: 'Admissions Nurse', initials: 'AN' },
  { id: 'field_nurse', label: 'Field Nurse', initials: 'FN' },
  { id: 'dispatcher', label: 'Dispatcher', initials: 'DS' },
  { id: 'driver', label: 'Driver', initials: 'DR' },
  { id: 'director_of_nursing', label: 'Director of Nursing', initials: 'DON' },
]

const STORAGE_KEY = 'betterrx.role'
const DEFAULT_ROLE: RoleId = 'case_manager'
const SIGNED_OUT = 'signed_out'

type AuthValue = {
  role: Role | null
  signIn: (id: RoleId) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [roleId, setRoleId] = useState<RoleId | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === SIGNED_OUT) return null
    if (stored && ROLES.some((r) => r.id === stored)) return stored as RoleId
    return DEFAULT_ROLE
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, roleId ?? SIGNED_OUT)
  }, [roleId])

  const role = ROLES.find((r) => r.id === roleId) ?? null

  return (
    <AuthContext.Provider value={{ role, signIn: (id) => setRoleId(id), signOut: () => setRoleId(null) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
