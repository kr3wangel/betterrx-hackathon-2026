import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEventStream } from './hooks/useEventStream'
import Hospice from './pages/Hospice'
import VendorPage from './pages/Vendor'
import Driver from './pages/Driver'

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

export default function App() {
  const { connected } = useEventStream()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold">DME Bridge</span>
        <nav className="flex gap-1">
          <NavLink to="/hospice" className={navLink}>
            Hospice
          </NavLink>
          <NavLink to="/vendor" className={navLink}>
            Vendor
          </NavLink>
          <NavLink to="/driver" className={navLink}>
            Driver
          </NavLink>
        </nav>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
          {connected ? 'live' : 'disconnected'}
        </span>
      </header>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/hospice" replace />} />
          <Route path="/hospice" element={<Hospice />} />
          <Route path="/vendor" element={<VendorPage />} />
          <Route path="/driver" element={<Driver />} />
        </Routes>
      </main>
    </div>
  )
}
