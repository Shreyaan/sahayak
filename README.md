# Sahayak — सरकारी काम, एक बात-चीत।

A Hindi-first, mobile-first AI helper that turns a life event into one guided
government-work case: what happens next, whether an office visit is needed,
what to carry, what to say, and how to recover from delay or rejection.

**This is an independent hackathon prototype. It is not affiliated with any
government body. Every desk, bank, payment, rejection, and record in it is
simulated, and all data is synthetic.**

## The idea

The language model is the clerk: it listens, interprets, and explains. It never
decides policy. A deterministic workflow engine decides what is true and what
is allowed, and the citizen always sees exactly what happened and what comes
next.

```
citizen speaks  →  Deepgram STT  →  AI clerk (OpenRouter)
                                      ↓ calls a tool
                          deterministic workflow engine   ← the only authority
                                      ↓
                     case state + grounded Hindi reply  →  ElevenLabs TTS
```

## Running it

```bash
bun install
bun dev            # http://localhost:3000
```

Create `.env.local` (never committed):

```
OPENROUTER_API_KEY=...
AI_MODEL=openai/gpt-5.6-luna
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

Every key is optional. With none configured the app still runs the complete
deterministic demo: the workflow engine, both journeys, artifacts, and the Case
Card all work without a provider. Speech and AI phrasing simply switch off, and
the routes report that they are not configured.

## Verifying

```bash
bun test
bun run typecheck
bun run build
```

## What is here

| Route | What it is |
| --- | --- |
| `/` | Citizen journeys and contributor mode |
| `/case-card` | Printable one-page Case Card and artifact viewer |
| `/honesty` | What is real versus what is simulated |
| `/api/chat` | Deterministic transition + grounded AI reply |
| `/api/transcribe` | Deepgram Nova-3 multilingual speech-to-text |
| `/api/speak` | ElevenLabs Flash v2.5 speech |
| `/api/contribute` | Compiles a contribution into a reviewable draft |

## One engine, two journeys

`src/lib/workflow.ts` holds a reusable typed step library and two seeded
journeys. A workflow node names a step type and supplies its own content, so
both journeys run on the same engine and share step types
(`document-explain`, `desk-verification`, `case-complete`, and the escalation
family). `/honesty` shows the shared types as the composition proof.

**Bereavement claim** — Form 4 explained, a `Shyam Sunder` / `Shyam Sundar`
mismatch, a generated correction declaration, one simulated bank rejection and
recovery, one simulated SLA breach on the EPFO claim, and a queued RTI draft.

**Stuck NSP scholarship** — `Released to PFMS` with no credit, a simulated
hidden NPCI bounce, a bank-seeding fix, one simulated SLA breach, and a queued
grievance.

Demo mode is deterministic: the same journey always produces the same rejection
and the same breach. Simulated time is advanced by an explicit control.

## How the model is kept honest

- The engine resolves the transition **before** the model is called, and the
  HTTP response always carries the engine's reply and snapshot. Model prose is
  never authoritative and can never claim a transition that did not happen.
- A case snapshot carries only node ids and states. All step content is read
  from the bundled seed on the server, so a client cannot introduce a step,
  office, fee, or requirement that the workflow never had.
- Contributions are compiled deterministically. The model may improve the
  title and steps; matches, conflicts, corroboration, source type, and status
  stay server-derived, and server additions are merged rather than replaced.

## Contributor mode

A contributor describes a synthetic lived experience. It is compiled against
the bundled seeds into a draft showing matched steps, possible additions,
conflicts, source type, and corroboration count. Contributors reporting the
same steps corroborate each other; a draft becomes a *publishable draft* only
once corroborated and free of unresolved conflicts. Publication is simulated —
a contribution never becomes official guidance here.

## Boundaries

No live government integrations, scraping, real credentials, payments, OTPs,
Aadhaar or PAN details, or personal data. Artifacts are demonstration drafts
populated only with synthetic information. Escalations are drafted and queued,
and the citizen approves anything that would be sent outside the prototype. The
RTI 48-hour life-or-liberty period is not applied to ordinary delay.
