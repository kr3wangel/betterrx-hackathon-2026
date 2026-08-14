import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEventStream } from './hooks/useEventStream'
import PageOne from './pages/PageOne'
import PageTwo from './pages/PageTwo'
import PageThree from './pages/PageThree'

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
  }`

export default function App() {
  const { connected, lastEvent } = useEventStream()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold">betterrx-hackathon-2026</span>
        <nav className="flex gap-1">
          <NavLink to="/one" className={navLink}>
            One
          </NavLink>
          <NavLink to="/two" className={navLink}>
            Two
          </NavLink>
          <NavLink to="/three" className={navLink}>
            Three
          </NavLink>
        </nav>
        <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`}
          />
          {connected ? `live · ${lastEvent?.at ?? 'waiting for heartbeat'}` : 'disconnected'}
        </span>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/one" replace />} />
          <Route path="/one" element={<PageOne />} />
          <Route path="/two" element={<PageTwo />} />
          <Route path="/three" element={<PageThree />} />
        </Routes>
      </main>
    </div>
  )
}
