# Sahayak — clear next steps for public-service problems

Sahayak is a bilingual, AI-assisted navigator for Indian public services. It
turns a confusing portal status or life-event problem into one guided case:
what to do next, where to go, what to carry, what to say, and which evidence to
bring back.

[Try the live prototype](https://sahayak.anosher.com) · English and Hindi

> [!IMPORTANT]
> Sahayak is an independent hackathon prototype, not a government service. Use
> fictional information in the demo and confirm current requirements through
> the official sources linked in each journey.

## Why Sahayak exists

Public-service problems rarely live in one system. A scholarship may be marked
as released on a portal while the bank account remains empty; resolving it can
involve the portal, a bank, and an office. Each place holds only part of the
answer.

Sahayak keeps the next action, preparation, response, and follow-up together so
the citizen does not have to reconstruct the whole process alone.

**The principle: don't replace the desks—replace the walking.**

## What the prototype does

- Finds a supported journey from a plain-language problem description.
- Gives a concrete next action with a destination, checklist, suggested words,
  and evidence to collect.
- Records the response a citizen actually received, including setbacks, dates,
  and reference numbers.
- Opens a supported recovery step without treating a generated draft or saved
  response as a successful outcome.
- Keeps a browser-private Case Card with progress, references, and downloadable
  step briefs.
- Works in English and Hindi, with optional speech and AI-assisted explanations.
- Accepts structured workflow contributions for human review.
- Exposes workflow discovery and contribution tools through an MCP endpoint for
  compatible AI clients.

The deterministic workflow engine remains usable when speech or AI providers
are unavailable. AI interprets language and drafts reviewable text; it does not
approve guidance, decide workflow transitions, contact an office, or submit a
grievance.

## Demonstration journeys

- **NSP scholarship:** investigate a released-but-not-credited payment, prepare
  for a bank visit, record setbacks, and draft a grievance for the citizen to
  review and submit themselves.
- **Aadhaar update:** understand a rejection, prepare for UIDAI support, and
  record the eventual result.
- **EPFO withdrawal:** trace a pending or rejected claim, prepare an EPFiGMS
  request, and retain the registration and follow-up evidence.
- **Punjab income certificate:** navigate the regional application and response
  path.
- **Bereavement:** a secondary synthetic journey used to stress-test the engine.

Search does not start a case when the reported problem does not fit a published
journey. Existing cases stay pinned to the exact workflow version with which
they began.

## Trust model and limits

- Every published journey carries source and review disclosures.
- Citizen contributions are redacted and remain unpublished pending review.
- Protected expert access, revision comparison, and wording review are present
  in the prototype.
- Automated multi-reviewer publication and government verification are not
  claimed as completed systems.
- A private case URL does not grant another browser access. Clearing cookies or
  moving devices can make a case inaccessible, so citizens should keep a copy
  of important briefs.
- The synthetic seed journeys are demonstrations, not proof of independent
  expert approval or real-world outcomes.

## Architecture

Sahayak is built with Next.js, React, TypeScript, PostgreSQL, pgvector, Drizzle,
Zod, Better Auth, Tailwind CSS, and the Model Context Protocol.

Citizen UI, chat, MCP tools, and reviewer comparison all use the same workflow
search and deterministic transition engine. PostgreSQL lexical and trigram
search works without an embedding provider; semantic retrieval is an optional
enhancement.

## Run locally

### Prerequisites

- [Bun](https://bun.sh/)
- PostgreSQL with the extensions used by the Drizzle migrations, including
  pgvector

```sh
git clone https://github.com/Shreyaan/sahayak.git
cd sahayak
bun install
cp .env.example .env.local
bun run db:migrate
bun run db:seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The required configuration values are:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` — use a strong random value
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`

Optional integrations use `OPENROUTER_API_KEY`, `DEEPGRAM_API_KEY`,
`ELEVENLABS_API_KEY`, and the email-provider settings documented in
[`.env.example`](.env.example). Keep real credentials in the ignored
`.env.local` file and never commit them.

To populate optional semantic embeddings after configuring a provider:

```sh
bun run db:embed
```

## Verify a change

Tests use PostgreSQL and may create synthetic published fixtures. Never point
the test suite at a production database.

```sh
bun test
bun run typecheck
bun run build
git diff --check
```

Stop `next dev` before building: both commands write to `.next`.

## Project status

Sahayak is an actively developed prototype focused on navigation and recovery,
not end-to-end government-service execution. The next trust milestone is a
fully verified, multi-reviewer publication loop backed by real domain partners.

Deployment and demonstration details are recorded in the
[submission pack](docs/submission/2026-09-06-demo-and-submission.md).
