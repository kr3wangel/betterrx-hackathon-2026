import type { ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ExternalLink, LogOut, Smartphone } from 'lucide-react'
import { useEventStream } from './hooks/useEventStream'
import { ROLES, useAuth, type RoleId } from './lib/auth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLink,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import Hospice from './pages/Hospice'
import VendorPage from './pages/Vendor'
import Driver from './pages/Driver'
import Order from './pages/Order'
import Reports from './pages/Reports'
import VendorPortal from './pages/VendorPortal'
import VendorStatus from './pages/VendorStatus'
import Nurse from './pages/Nurse'
import Caregiver from './pages/Caregiver'
import VendorPhone from './pages/VendorPhone'
import Demo from './pages/Demo'

// The persona surfaces of the DME module — the working tool.
// Which roles see which surface in the nav. This filters the nav bar ONLY — routes stay
// unguarded on purpose, so any screen is still reachable by URL if a demo goes sideways.
const surfaceLinks: { to: string; label: string; roles: RoleId[] }[] = [
  // Field Nurse gets the board because /nurse links to it — a nav that hides a page the
  // page itself sends you to is worse than no filtering at all.
  { to: '/hospice', label: 'Board', roles: ['case_manager', 'admissions_nurse', 'director_of_nursing', 'field_nurse'] },
  { to: '/order', label: 'New order', roles: ['case_manager', 'admissions_nurse'] },
  { to: '/nurse', label: 'Nurse', roles: ['case_manager', 'field_nurse'] },
  // "Dispatcher board", not "Vendor phone": /vendor-phone is a different page, and the
  // account menu now names it, so two near-identical labels were on screen at once.
  { to: '/vendor', label: 'Dispatcher board', roles: ['dispatcher'] },
  { to: '/driver', label: 'Driver', roles: ['driver'] },
  { to: '/vendor-portal', label: 'Portal', roles: ['dispatcher'] },
  { to: '/reports', label: 'Reports', roles: ['case_manager', 'director_of_nursing'] },
]

// The two people this system texts who never log in. Their screens are full-screen phone
// simulators, so they open in a new tab rather than replacing the hospice window you're
// presenting from — the point of the demo is watching both screens react at once.
const phoneLinks = [
  { to: '/vendor-phone', label: "DME vendor's phone", note: 'Order requests, ETA checks' },
  { to: '/caregiver', label: "Caregiver's phone", note: 'Condition check, reply 1–5' },
]

// The product-level nav: this app is the DME module inside BetterRX.
const productTabs = [
  { label: 'PBM', active: false },
  { label: 'DME', active: true },
]

// Mock login: sign in as any role, switch role, or sign out. Backed by the auth
// context so the rest of the app can branch on the current role.
function AccountControl() {
  const { role, signIn, signOut } = useAuth()
  const navigate = useNavigate()

  // Switching role also lands you on that role's first nav surface — otherwise you'd sit
  // on a page the new role can't even see in its filtered nav.
  function chooseRole(id: RoleId) {
    if (role?.id === id) return
    signIn(id)
    const home = surfaceLinks.find((l) => l.roles.includes(id))
    if (home) navigate(home.to)
  }

  return (
    <DropdownMenu>
      {role ? (
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-muted">
          <span className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
            {role.initials}
          </span>
          <span className="hidden text-sm font-semibold text-foreground sm:inline">{role.label}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          Sign in <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{role ? 'Switch role' : 'Sign in as'}</DropdownMenuLabel>
        {ROLES.map((r) => (
          <DropdownMenuItem key={r.id} active={role?.id === r.id} onClick={() => chooseRole(r.id)}>
            <span className="grid size-6 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
              {r.initials}
            </span>
            <span className="font-medium">{r.label}</span>
            {role?.id === r.id && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* Not roles — these two have no account here, which is the whole design. Kept in
            this menu anyway because it's the one control that's on every screen. */}
        <DropdownMenuLabel>Simulated phones</DropdownMenuLabel>
        {phoneLinks.map((p) => (
          <DropdownMenuLink key={p.to} href={p.to} target="_blank" rel="noopener noreferrer">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Smartphone className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium leading-tight">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.note}</span>
            </span>
            <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuLink>
        ))}

        {role && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function surfaceLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
  )
}

export default function App() {
  return (
    <Routes>
      {/* Deliberately outside the app shell — each stands in for a real phone, so it gets no
          nav, no header, no site chrome. Off the surface nav; reached from the account menu
          (new tab) or by typing the URL. */}
      <Route path="/caregiver" element={<Caregiver />} />
      <Route path="/vendor-phone" element={<VendorPhone />} />
      {/* Token links arrive by text, from someone who works for the vendor and has no
          account here. They get brand and status, never the hospice's own navigation. */}
      <Route
        path="/portal/:token"
        element={
          <PortalShell>
            <VendorPortal />
          </PortalShell>
        }
      />
      <Route
        path="/status/:token"
        element={
          <PortalShell>
            <VendorStatus />
          </PortalShell>
        }
      />
      <Route path="*" element={<Shell />} />
    </Routes>
  )
}

/** Chrome for magic-link pages: the brand mark and the live indicator, and nothing else. */
function PortalShell({ children }: { children: ReactNode }) {
  const { connected } = useEventStream()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="flex items-center gap-4 px-5 py-3">
          <span className="rounded-full bg-primary px-3 py-1 font-display text-sm font-extrabold tracking-tight text-primary-foreground">
            betterRX
          </span>
          <span className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span
              className={cn('h-2.5 w-2.5 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
            />
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">{children}</main>
      <Toaster />
    </div>
  )
}

function Shell() {
  const { connected } = useEventStream()
  const { role } = useAuth()
  // Signed out shows everything, so nobody loses a screen before picking a role.
  const links = role ? surfaceLinks.filter((l) => l.roles.includes(role.id)) : surfaceLinks

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            {/* Coral pill logo */}
            <span className="rounded-full bg-primary px-3 py-1 font-display text-sm font-extrabold tracking-tight text-primary-foreground">
              betterRX
            </span>
            {/* Product-level nav — DME active, underlined in coral */}
            <nav className="flex items-center gap-4">
              {productTabs.map((t) => (
                <span
                  key={t.label}
                  className={cn(
                    'text-sm font-semibold',
                    t.active
                      ? 'border-b-2 border-primary pb-0.5 text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {t.label}
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span
                  className={cn('h-2.5 w-2.5 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
                />
                {connected ? 'Live' : 'Disconnected'}
              </span>
              <AccountControl />
            </div>
          </div>
          {/* Surface (persona) nav for the DME module */}
          <div className="flex flex-wrap gap-1 border-t border-border px-5 py-2">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={surfaceLinkClass}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/hospice" replace />} />
            <Route path="/hospice" element={<Hospice />} />
            <Route path="/order" element={<Order />} />
            <Route path="/nurse" element={<Nurse />} />
            <Route path="/vendor" element={<VendorPage />} />
            <Route path="/driver" element={<Driver />} />
            {/* /portal/:token and /status/:token live outside the Shell — see PortalShell. */}
            <Route path="/vendor-portal" element={<VendorPortal />} />
            <Route path="/reports" element={<Reports />} />
            {/* Unlisted in the nav — a presenter prop, not a product surface. */}
            <Route path="/demo" element={<Demo />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
