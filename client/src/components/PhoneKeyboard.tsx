import { useState } from 'react'

/**
 * Fake on-screen keyboard for the phone simulators (/caregiver, /vendor-phone).
 *
 * Suppressed on touch devices — a real handset pops its own, and two keyboards stacked on
 * screen is worse than none. On a laptop there is no native keyboard at all, which is why
 * this exists: the simulators have to read as phones from the back of a room.
 */

export const isTouch =
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

const LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
]
const SYMBOLS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'],
  ['.', ',', '?', '!', "'"],
]

export function PhoneKeyboard({
  onKey,
  onBackspace,
  onSend,
  onDismiss,
  canSend,
  sendLabel = 'send',
}: {
  onKey: (ch: string) => void
  onBackspace: () => void
  onSend: () => void
  onDismiss: () => void
  canSend: boolean
  sendLabel?: string
}) {
  const [numeric, setNumeric] = useState(false)
  const [shift, setShift] = useState(false)
  const rows = numeric ? SYMBOLS : LETTERS

  const key =
    'flex-1 rounded-md bg-white py-2.5 text-[15px] font-normal text-slate-900 shadow-sm active:bg-slate-200'
  const util =
    'rounded-md bg-slate-300/80 px-2.5 py-2.5 text-[11px] font-semibold text-slate-700 active:bg-slate-400/70'

  return (
    <div className="select-none bg-slate-200 px-1.5 pb-2 pt-1.5" style={{ animation: 'kbUp .18s ease-out both' }}>
      <div className="mx-auto max-w-md space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className={`flex gap-1.5 ${i === 1 && !numeric ? 'px-4' : ''}`}>
            {i === 2 && (
              <button
                type="button"
                className={util}
                onClick={() => (numeric ? setNumeric(false) : setShift((s) => !s))}
              >
                ⇧
              </button>
            )}
            {row.map((ch) => (
              <button
                key={ch}
                type="button"
                className={key}
                onClick={() => {
                  onKey(shift && !numeric ? ch.toUpperCase() : ch)
                  if (shift) setShift(false)
                }}
              >
                {shift && !numeric ? ch.toUpperCase() : ch}
              </button>
            ))}
            {i === 2 && (
              <button type="button" className={util} onClick={onBackspace}>
                ⌫
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-1.5">
          <button type="button" className={util} onClick={() => setNumeric((n) => !n)}>
            {numeric ? 'ABC' : '123'}
          </button>
          <button type="button" className={`${key} flex-[6]`} onClick={() => onKey(' ')}>
            space
          </button>
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            className="rounded-md bg-blue-600 px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {sendLabel}
          </button>
          <button type="button" className={util} onClick={onDismiss} title="hide keyboard">
            ⌄
          </button>
        </div>
      </div>
    </div>
  )
}

/** Shared keyframes for both phone screens. */
export const PHONE_KEYFRAMES = `
  @keyframes bubbleIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes kbUp{from{transform:translateY(100%)}to{transform:none}}
`
