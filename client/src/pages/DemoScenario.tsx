import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StageSilence, StopLink, useDemoLinks, type DemoLink, type Stop } from './Demo'

interface Beat {
  n: string
  stop: Stop
  says?: string
}

interface AltBlock {
  title: string
  blurb: string
  beats: Beat[]
}

interface ScenarioPage {
  title: string
  seed: string
  overview: string
  personas: string[]
  showcases: string[]
  beats: Beat[]
  alt?: AltBlock
  notes: string[]
}

const SCENARIO_PAGES: Record<string, ScenarioPage> = {
  '1': {
    title: 'Scenario 1 — the case worker’s save',
    seed: 'scenario1',
    overview:
      'Margaret Osei is coming home to die at home, and that promise only works if the hospital bed is in her living room tonight. The risk engine flags the order before it is late — with reasons a case manager can argue with — and one click re-issues it to a better vendor, who onboards by tapping a link in a text. The delivery ends as a signature and a timestamp, not a vendor’s claim.',
    personas: ['Case Manager', 'Driver', 'Margaret’s family'],
    showcases: [
      'Risk explainability — rules, not a model: every reason is a full sentence, read verbatim off the row.',
      'One action, no confirm step: the swap re-issues the order, texts the new vendor, and clears Needs you by itself.',
      'Zero-software vendor onboarding: the whole channel is a text with a magic link — no login, confidence 1.0.',
      'The evidence ladder: the detail badge flips Reported → Verified once a photo and a signature land.',
    ],
    beats: [
      {
        n: '1',
        stop: {
          label:
            'Board — click the Margaret Osei row in Needs you open (anywhere but the pill): vendor, deadline, “the vendor has not replied yet · nudged Xm ago”, the risk reasons as plain sentences, then the ledger',
          to: '/hospice',
        },
        says:
          '“Nobody called anyone to learn this. It’s rules, not a model — every reason is a sentence a case manager can argue with.” Read one reason aloud, verbatim, off the screen.',
      },
      {
        n: '2',
        stop: {
          label:
            'Swap vendor on that row → in the dialog, pick the vendor the seed print’s “swap options” line named. Each alternative carries its own on-time line for this equipment on this deadline’s weekday; the cold-start vendor reads “New — no history yet”',
          to: '/hospice',
        },
        says:
          '“One action. The order re-issues to the vendor who is NN% on-time for this equipment on this day, and the text goes out on its own.”',
      },
      {
        n: '2b',
        stop: {
          label:
            'Watch the board — don’t click. The row leaves Needs you on its own, the section falls to “Nothing needs a person right now”, and Margaret’s two orders collapse into one row under On the way',
        },
        says: '“And it clears itself. Nobody marks anything resolved.”',
      },
      {
        n: '3',
        stop: {
          label:
            'Vendor phone — header picker → the new vendor. The thread already holds the outbound order request, magic link live',
          to: '/vendor-phone',
          external: true,
        },
        says: '“That’s the entire vendor onboarding. A text with a link.”',
      },
      {
        n: '4',
        stop: {
          label:
            'Tap the link in the thread (new tab) → portal → Confirm, optionally Set ETA → Cmd+W back. The board’s grouped row ticks to 2 of 2 moving, live',
          to: '/vendor-phone',
          external: true,
        },
        says: '“No login. One tap. Confidence 1.0 — no model involved in a vendor telling us yes.”',
      },
      {
        n: '5',
        stop: {
          label:
            'Driver — switch the vendor picker to the new vendor first, then Start delivery → Complete delivery → sign → Confirm delivery. The row’s badge flips Reported → Verified and Done ticks up',
          to: '/driver',
        },
        says:
          '“Delivered isn’t a claim here. It’s a signature and a timestamp — verified, not vendor-reported. Margaret’s bed is in the house tonight.”',
      },
    ],
    notes: [
      'Step 5’s picker is the trap: /driver defaults to Wasatch, so after the swap it reads “Route’s clear” until you change the dropdown. Change it before you point at the screen.',
      'Don’t type the digit reply at step 3 — answering by digit is scenario 3’s beat, and it skips the portal.',
      'Never speak a percentage off a document. Read the reasons and the swap number off that morning’s seed print.',
      'Fallback if the portal misbehaves: type “yes, we’ll have it there by 7am” in the thread — Claude parses it, confidence ≥ 0.8 auto-applies. Needs ANTHROPIC_API_KEY.',
    ],
  },

  '2': {
    title: 'Scenario 2 — the nurse in the home',
    seed: 'scenario2',
    overview:
      'Ruth Nakamura has died, and the nurse is standing in the living room. She taps once — that is the whole trigger, the path the sponsor’s own discovery found failing when it was left to the EMR. Two pickups are scheduled, one text asks the vendor, one digit commits both, and one trip collects them. The family makes zero phone calls and never learns any of this exists.',
    personas: ['Field Nurse', 'Dispatcher', 'Driver', 'Ruth’s family'],
    showcases: [
      'The nurse’s tap is the primary trigger; the EMR webhook is the redundant belt-and-suspenders behind her.',
      'Trip batching — two pickups from one home go out as one question spending one reply pair, not two.',
      'A digit reply routes by template × position: no model call, and a texted receipt lands back in the thread.',
      'Silence where it counts — a death silences the condition-check channel; the only family text is the closing sentence.',
    ],
    beats: [
      {
        n: '1',
        stop: {
          label:
            'Nurse — Ruth Nakamura → Passed away → Confirm, with care. “We’ll schedule the equipment pickup with care and a note for the family. Take your time — this is the only step you need to do.”',
          to: '/nurse',
        },
        says:
          '“The nurse is standing in the living room. She taps this once. That’s the whole trigger — the sponsor told us their own discovery found the EMR-only path fail: someone dies and the vendor never finds out.”',
      },
      {
        n: '2',
        stop: {
          label:
            'Board — no click. Ruth’s two orders leave Done and arrive as ONE grouped row: Pickup · 2 items · 0 of 2 moving. One pickup text lands in Wasatch’s thread, naming its own reply pair',
          to: '/hospice',
        },
        says:
          '“Two pickups scheduled. Zero phone calls made by anyone in that house — one death, one text, one trip.”',
      },
      {
        n: '2b',
        stop: {
          label:
            'Vendor phone — picker → Wasatch → type the affirmative digit the text itself names (read it off the bubble) and send. A receipt texts back: “Got your ‘N’ — both pickups are on the books for today.”',
          to: '/vendor-phone',
          external: true,
        },
        says:
          '“One digit from the vendor, and both pickups are committed — the trip is the unit, and no model touched it.”',
      },
      {
        n: '3',
        stop: {
          label:
            'Driver — vendor Wasatch, already the default. Two PICK UP cards, each carrying “The family is grieving. Call ahead, be brief and kind.”',
          to: '/driver',
        },
        says: '“The dispatcher sees logistics. Never the death.”',
      },
      {
        n: '4',
        stop: {
          label:
            'Driver — Complete pickup → sign → Confirm pickup. The coral Family notified panel quotes the actual sentence sent to the household',
          to: '/driver',
        },
        says: '“Ruth’s family made zero phone calls. That’s the product.”',
      },
      {
        n: '5',
        stop: {
          label:
            'Caregiver phone (optional, if you have the slack) — Ken Nakamura’s thread, the same sentence in the household’s own words',
          to: '/caregiver',
          external: true,
        },
      },
    ],
    notes: [
      'This scenario seeds an all-delivered board, so nothing broadcasts and nothing refreshes itself — hard-refresh the board AND /nurse, which loads its patients once.',
      'Step 2 before the digit, always: the audience has to see ONE question before they see it answered twice.',
      'Read the digit off the bubble — pairs rotate, it is not always 1 — and type it once. A repeat drops into the review queue and your receipt line is gone.',
      'The driver still sees two cards. Grouping the asking is built; grouping the driver’s stop view is designed only — don’t imply otherwise.',
    ],
  },

  '3': {
    title: 'Scenario 3 — the cold-start vendor',
    seed: 'scenario3',
    overview:
      'A vendor who has never heard of us — no contract, no account, no software — is onboarded by one text with a link, and confirms with one tap. Then the other order sits untapped, and the software nags, escalates, and writes its own sentence onto the row. In the phone world silence is ambiguous; here silence is a reading, and it reaches a human before the deadline does.',
    personas: ['Case Manager', 'Dispatcher', 'Director of Nursing'],
    showcases: [
      'Rolodex onboarding: the hospice types a phone number in, and the vendor’s entire cost of entry is tapping one link.',
      'The silence ladder: nag on the first tick, escalation on the next, the row lifting itself into Needs you live.',
      'The watchdog’s own sentence renders in red on the row — the climax can be read off the screen, not described.',
      'A digit reply is a template × position lookup at confidence 1.0 — the ledger says “no model”, and the reporting beat runs off the same event log.',
    ],
    beats: [
      {
        n: '1',
        stop: {
          label:
            'Board — click Frank Delgado’s row open: Timpanogos Home Medical · #1060 · Hospital bed · Nothing promised yet · one risk bullet · a ledger with one entry',
          to: '/hospice',
        },
        says:
          '“This vendor has never heard of us. No contract, no account, no software. The hospice typed their phone number in from its own rolodex.”',
      },
      {
        n: '2',
        stop: {
          label:
            'Vendor phone — picker → Timpanogos Home Medical · Ray. One outbound text: order details and the magic link',
          to: '/vendor-phone',
          external: true,
        },
        says: '“This is everything we send them.”',
      },
      {
        n: '3',
        stop: {
          label:
            'Timpanogos portal (or tap the link in the thread) — vendor name, exactly one open order, Confirm · Set ETA · Can’t fill it',
          portalVendorId: 4,
        },
        says: '“No login screen. No signup. No password reset email at 6pm on a Thursday.”',
      },
      {
        n: '4',
        stop: {
          label:
            'Tap Confirm, Cmd+W, back to the board. Frank’s pill flips Waiting on vendor → Accepted ✓ live over SSE. The row does not move — it was never in trouble',
          to: '/hospice',
        },
        says:
          '“One tap. Deterministic — confidence 1.0, no model, nothing to review. The portal isn’t something vendors adopt. It’s what’s already waiting behind the link we sent them.”',
      },
      {
        n: '5',
        stop: {
          label:
            'Vendor phone — picker → Beehive DME Co · Marcus. The order request for #1061, and after the first watchdog tick an automatic second message nagging for a confirmation',
          to: '/vendor-phone',
          external: true,
        },
        says: '“Nobody tapped this one. So the software nagged them. The case manager didn’t.”',
      },
      {
        n: '6',
        stop: {
          label:
            'Board — Eleanor Vance’s row jumps out of On the way into Needs you on its own, live. The header turns red and the pill is now a coral Swap vendor',
          to: '/hospice',
        },
        says:
          '“In the phone world, silence is ambiguous — did the fax go through? Here silence is a reading. An untapped link is exactly as loud as an unanswered text, and it reaches a human before the deadline does, not after.”',
      },
      {
        n: '7',
        stop: {
          label:
            'Click that row open — in red, the watchdog’s own sentence about #1061 still being unconfirmed, above “the vendor has not replied yet · nudged Xm ago”',
          to: '/hospice',
        },
        says:
          'Read the red sentence off the screen, verbatim. Then: “the software wrote that, and the case manager’s next move is already sitting on the row.”',
      },
      {
        n: '8',
        stop: {
          label:
            'Reports — the directing nurse’s screen: vendor scorecards off the same table the risk engine reads, and the coral “phone calls that never happened” counter',
          to: '/reports',
        },
        says:
          '“The third hospice user is the directing nurse. She never opens the board. This is her screen — and it’s the exact data the risk engine already uses, so it cost us nothing.” Say the synthetic caveat out loud, every time.',
      },
    ],
    alt: {
      title: '5a-alt · The rolodex, performed live — either this or beats 1–4, never both',
      blurb:
        'Same beat, stronger claim: instead of pointing at seeded Timpanogos, type a vendor into existence on stage. This is the Admissions Nurse’s moment — a new admission needs a bed, and the vendor she wants isn’t in the network yet. Costs ~15s, and the typing time is exactly what covers the watchdog ticks the silence beat needs. Decide at rehearsal; don’t improvise the choice on stage.',
      beats: [
        {
          n: '1',
          stop: {
            label:
              'Order — patient Harold Whitfield (or Dorothy Chen — never Frank or Eleanor, their rows carry this scenario’s beats), keep Hospital bed / Urgent',
            to: '/order',
          },
          says: '“New admission, needs a bed — and the vendor I want isn’t in our network. Yet.”',
        },
        {
          n: '2',
          stop: {
            label:
              'Under the vendor picker → “Not listed? Add a vendor by phone…” → type Alpine Mobility and 385-555-0142 → Add vendor. The toast: “their first text — with their portal link — goes out when you place this order”',
            to: '/order',
          },
          says:
            '“This vendor does not exist in our system. No contract, no account, no software. The hospice types their phone number in from its own rolodex — that’s the entire recruitment step.”',
        },
        {
          n: '3',
          stop: {
            label: 'Place order — auto-navigates to the board, the new row highlighted under On the way',
            to: '/order',
          },
          says: '“Identified. Now watch the invite.”',
        },
        {
          n: '4',
          stop: {
            label:
              'Vendor phone — picker → Alpine Mobility. Exactly one text: order details, a reply pair, the magic link',
            to: '/vendor-phone',
            external: true,
          },
          says: '“This is everything we send them. This is the entire onboarding.”',
        },
        {
          n: '5',
          stop: {
            label:
              'Tap the magic link (new tab) → Confirm → Cmd+W → the board. The row flips Waiting on vendor → Accepted ✓ live',
            to: '/hospice',
          },
          says:
            '“Activated — one minute, start to finish. The portal isn’t something they adopted. It’s what was already waiting behind the link we sent them.”',
        },
      ],
    },
    notes: [
      'Tap “Stage the silence” as you start this scenario — the combined seed leaves Eleanor out on purpose, because her clock starts when the order is placed and would otherwise fire during scenario 1. The nag lands within 30s, the escalation on the tick after.',
      'The alt block’s phone number must not collide with a seeded vendor (801-555-01xx): POST /api/vendors is idempotent on phone, so a collision selects the existing vendor and the beat dies. 385-555-0142 is safe.',
      'Never cut the silence variant — it is the differentiator. If the escalation hasn’t landed when you arrive, narrate it and move on; never stand in silence waiting for a tick.',
      'The digit beat ends the silence beat: only type 1 into Beehive’s thread after beats 6 and 7 have landed.',
      'One open escalation per order can mask a newer one — swap or accept, don’t do both.',
    ],
  },
}

export default function DemoScenario() {
  const { n } = useParams<{ n: string }>()
  const links = useDemoLinks()
  const page = n ? SCENARIO_PAGES[n] : undefined

  if (!page) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <BackLink />
        <EmptyState
          title="No such scenario"
          description="The demo script has three: /demo/scenario/1, /2 and /3."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-3">
        <BackLink />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {page.title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{page.overview}</p>
        <div className="flex flex-wrap gap-1.5">
          {page.personas.map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What it showcases</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {page.showcases.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The beats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {n === '3' && <StageSilence />}
          <BeatList beats={page.beats} links={links} />
        </CardContent>
      </Card>

      {page.alt && (
        <Card>
          <CardHeader>
            <CardTitle>{page.alt.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">{page.alt.blurb}</p>
            <BeatList beats={page.alt.beats} links={links} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Read this before you rehearse</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {page.notes.map((note) => (
              <li key={note} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-border" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <BackLink />
    </div>
  )
}

function BeatList({ beats, links }: { beats: Beat[]; links: DemoLink[] }) {
  return (
    <ol className="space-y-3">
      {beats.map((beat) => (
        <li key={beat.n} className="flex gap-2.5 text-sm">
          <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
            {beat.n}.
          </span>
          <span className="min-w-0 space-y-1">
            <span className="block">
              <StopLink stop={beat.stop} links={links} />
            </span>
            {beat.says && (
              <span className="block border-l-2 border-primary/40 pl-2.5 text-muted-foreground">
                {beat.says}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function BackLink() {
  return (
    <Link
      to="/demo"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      <ArrowLeft className="size-3.5" /> Demo controls
    </Link>
  )
}
