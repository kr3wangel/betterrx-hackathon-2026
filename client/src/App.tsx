import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEventStream } from './hooks/useEventStream'
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

// The persona surfaces of the DME module — the working tool.
const surfaceLinks = [
  { to: '/hospice', label: 'Board' },
  { to: '/order', label: 'New order' },
  { to: '/nurse', label: 'Nurse' },
  { to: '/vendor', label: 'Vendor phone' },
  { to: '/driver', label: 'Driver' },
  { to: '/vendor-portal', label: 'Portal' },
  { to: '/reports', label: 'Reports' },
]

// The product-level nav: this app is the DME module inside BetterRX.
const productTabs = [
  { label: 'Pharmacy', active: false },
  { label: 'DME', active: true },
  { label: 'Reports', active: false },
]

function surfaceLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted'
  )
}

export default function App() {
  return (
    <Routes>
      {/* Unlisted, and deliberately outside the app shell — it stands in for a real phone,
          so it gets no nav, no header, no site chrome. Reachable only by typing the URL. */}
      <Route path="/caregiver" element={<Caregiver />} />
      <Route path="/vendor-phone" element={<VendorPhone />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  )
}

function Shell() {
  const { connected } = useEventStream()

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
            <span className="ml-auto flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span
                className={cn('h-2.5 w-2.5 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
              />
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          {/* Surface (persona) nav for the DME module */}
          <div className="flex flex-wrap gap-1 border-t border-border px-5 py-2">
            {surfaceLinks.map((l) => (
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
            <Route path="/vendor-portal" element={<VendorPortal />} />
            <Route path="/portal/:token" element={<VendorPortal />} />
            <Route path="/status/:token" element={<VendorStatus />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
