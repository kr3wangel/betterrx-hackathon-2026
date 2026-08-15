import { useNavigate } from 'react-router-dom'
import { ExternalLink, Smartphone } from 'lucide-react'
import { APP_NAME, APP_PROMISE } from '../lib/brand'
import { homeFor } from '../lib/surfaces'
import { ROLES, useAuth, type RoleId } from '../lib/auth'
import { BrandMark } from '../components/BrandMark'

// One plain-English line per persona. Not a job title restated — what they came here to do.
const PERSONA_LINE: Record<RoleId, string> = {
  case_manager: 'See every order that needs a decision today',
  admissions_nurse: 'Place an order for a patient coming home',
  field_nurse: 'Tell the system a patient has died or gone home',
  dispatcher: 'Work the vendor side — accept, set an ETA, reroute',
  driver: 'Your delivery and pickup jobs, with proof',
  director_of_nursing: 'Where the time and the money went',
}

// The two people this system texts who never log in — same framing as the account menu.
const PHONES = [
  { to: '/vendor-phone', label: "DME vendor's phone", note: 'Order requests, ETA checks' },
  { to: '/caregiver', label: "Caregiver's phone", note: 'Condition check, reply 1–5' },
]

export default function Landing() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  function enterAs(id: RoleId) {
    signIn(id)
    navigate(homeFor(id))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <BrandMark className="text-base" />
        <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          {APP_NAME}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{APP_PROMISE}</p>

        <h2 className="mt-14 text-[13px] font-extrabold uppercase tracking-[0.12em] text-faint">
          Who are you today?
        </h2>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => enterAs(role.id)}
              className="flex items-start gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                {role.initials}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[15px] font-bold tracking-tight">{role.label}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-muted-foreground">
                  {PERSONA_LINE[role.id]}
                </span>
                <span className="mt-1 block text-xs text-faint">{homeFor(role.id)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            The two people this system texts who never log in.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {PHONES.map((phone) => (
              <a
                key={phone.to}
                href={phone.to}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3 transition-colors hover:border-primary"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Smartphone className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{phone.label}</span>
                  <span className="block text-xs text-muted-foreground">{phone.note}</span>
                </span>
                <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
