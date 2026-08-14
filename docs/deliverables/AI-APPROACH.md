# Deliverable B — AI Approach (and where we deliberately didn't use it)

*Draft — finalize token costs after live parse testing.*

## Where we used AI, and why it beats the rules-based baseline

**One place: parsing unstructured vendor replies into structured order events.**

The dominant DME ordering channel today is phone, fax, and free-text messaging. Our cold-start vendor channel depends on reading messages like "bed's on the truck, shud be there by 10" or "cant do it this week, truck's down" from dozens of different vendors, each with their own phrasing, and turning them into `{intent, order_ref, eta, confidence}`.

**The rules-based baseline** is keyword/regex matching: `/yes|confirm/ → accept`, `/late|delay/ → delay`, datetime regexes for ETAs. We judged it against the brief's criteria:

- **Pattern complexity** — this is genuinely open-vocabulary input. "We can grab the equipment Friday" contains no keyword for *pickup*; "who is this?" contains a question mark, not an intent. Every new vendor is a new dialect. Hand-tuned rules degrade with every vendor added; a language model handles the long tail natively.
- **Novel inference** — the parser doesn't just classify; it resolves *which order* an unreferenced message refers to (we pass the vendor's open orders as context) and resolves relative times ("Thursday morning") to timestamps. Rules can't do either without becoming a fragile mini-NLU engine.

**The comparison, concretely:** our test set of realistic vendor messages includes cases where the regex baseline is structurally unable to succeed (order inference, relative-time resolution, negation like "can't do it"). That's not "AI is smarter" — it's a category of input rules cannot represent.

## Where we deliberately did NOT use AI

- **Risk scoring is a transparent rules engine** (`server/risk.ts`): vendor on-time history × equipment type × weekday × time-to-deadline × ETA-vs-deadline. The signal here is clean thresholds over a handful of variables — exactly the case the brief flags as "an LLM standing in for a lookup table." Rules give us: explainability by construction (every score ships with human-readable reasons: *"vendor is 72% on-time for hospital beds on this weekday, n=25"*), zero latency, zero cost, zero hallucination risk. A learned model becomes worth it only with real historical volume — which BetterRX would have in production, and which we'd frame as the v2 roadmap, not the demo.
- **The state machine, escalation logic, and pickup watchdog are deterministic.** High-stakes lifecycle changes should never depend on a model's mood.

## Safety design

1. **Structured output, not free generation** — the parse is schema-constrained (JSON schema enforced at the API level), so the model cannot invent fields, statuses, or patient details. It classifies and extracts; it never composes patient-facing content.
2. **Confidence gate with a human in the loop** — the model reports calibrated confidence. ≥ 0.8 *with a resolved order* auto-applies; anything less lands in a visible review queue on the hospice dashboard where a person confirms or dismisses. The system is instructed to say `unknown` rather than guess.
3. **The state machine is the last line of defense** — even an auto-applied parse can only fire *valid* transitions. A hallucinated "delivered" on an order still in `ordered` state is rejected with a 409 and falls back to review.
4. **No high-stakes autonomous actions** — the AI never places orders, swaps vendors, or notifies families. Those are human actions; the AI only updates status.

## Cost per order (estimate — to be confirmed with measured usage)

Each parse call: ~400–600 input tokens (system prompt + the vendor's open orders + the message), ~100 output tokens. At Claude Opus 5 pricing ($5/M input, $25/M output): **≈ $0.005 per message**. A typical order lifecycle involves 3–6 vendor messages → **≈ $0.02–0.03 per order, end to end**. At 1,000 orders/month that's ~$25/month of inference — negligible against a single avoided service failure. Every call's token usage is logged (`[llm]` lines) for the measured version of this estimate.
