import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PHONE_KEYFRAMES, PhoneKeyboard, isTouch } from './PhoneKeyboard'

/**
 * Shared chrome for the two phone simulators (/caregiver, /vendor-phone).
 *
 * Both stand in for a real handset — there is no SMS gateway — so they get no nav, no app
 * header, and the full viewport. Everything visually identical between the two lives here,
 * so restyling one can't quietly diverge from the other the morning of a demo.
 *
 * Bubble metadata is the timestamp and nothing else, on both phones — a real handset
 * annotates no outcomes, and the parse result (applied vs review queue) is the hospice
 * board's story, not the sender's phone's.
 */

export function PhoneScreen({
  title,
  subtitle,
  picker,
  scrollKey,
  draft,
  onDraft,
  onSend,
  sending,
  children,
}: {
  title: string
  subtitle: string
  picker?: ReactNode
  /** Changes whenever the thread does — drives auto-scroll to the newest message. */
  scrollKey: unknown
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  sending: boolean
  children: ReactNode
}) {
  // Up by default. A phone sitting in a conversation has its keyboard up; making the demo
  // driver discover a focus interaction to reveal it is a way to lose ten seconds on stage.
  const [keyboard, setKeyboard] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [scrollKey])

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-white text-slate-900">
      <style>{PHONE_KEYFRAMES}</style>

      <header className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-4 pb-2 pt-3 text-center backdrop-blur">
        <div className="text-[15px] font-semibold leading-tight">{title}</div>
        <div className="text-[11px] text-slate-500">{subtitle}</div>
        {picker && <div className="mt-0.5">{picker}</div>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-md space-y-2">
          {children}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
        <form
          className="mx-auto flex max-w-md items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSend()
          }}
        >
          <input
            className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-[14px] outline-none focus:border-slate-400"
            placeholder="Text Message"
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onFocus={() => setKeyboard(true)}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>

      {keyboard && !isTouch && (
        <PhoneKeyboard
          onKey={(ch) => onDraft(draft + ch)}
          onBackspace={() => onDraft(draft.slice(0, -1))}
          onSend={onSend}
          onDismiss={() => setKeyboard(false)}
          canSend={!!draft.trim() && !sending}
        />
      )}
    </div>
  )
}

/** One message. `sent` is the phone's owner talking; `received` is the system texting them. */
export function Bubble({
  side,
  meta,
  children,
}: {
  side: 'sent' | 'received'
  meta?: ReactNode
  children: ReactNode
}) {
  const sent = side === 'sent'
  return (
    <div className={`flex ${sent ? 'justify-end' : 'justify-start'}`} style={{ animation: 'bubbleIn .22s ease-out both' }}>
      <div className="max-w-[82%]">
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
            sent ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'
          }`}
        >
          {children}
        </div>
        {meta && <div className={`mt-0.5 px-1 text-[10px] text-slate-400 ${sent ? 'text-right' : ''}`}>{meta}</div>}
      </div>
    </div>
  )
}

// Scheme optional: the texts send "localhost:5173/o/ab12cd" with no "http://", the way a
// short link is actually written, and a phone linkifies that too. The host must carry a
// dot or a port — without that rule "and/or" in a dispatcher's prose becomes a link.
const HOST = String.raw`(?:https?:\/\/)?(?:[\w-]+(?:\.[\w-]+)+|[\w-]+:\d+)`
const URL_PART = new RegExp(`(${HOST}\\/\\S+)`, 'g')
const LINK_LIKE = new RegExp(`^${HOST}\\/`)

/**
 * Message bodies carry genuine /portal/<token> magic links — nothing about them is faked,
 * so they render as real anchors.
 */
export function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PART).map((part, i) =>
        LINK_LIKE.test(part) ? (
          <a
            key={i}
            href={/^https?:\/\//.test(part) ? part : `http://${part}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** Centered placeholder for an empty thread. */
export function ThreadEmpty({ children }: { children: ReactNode }) {
  return <div className="pt-16 text-center text-xs text-slate-400">{children}</div>
}
