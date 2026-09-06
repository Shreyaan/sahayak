# Sahayak — सरकारी काम, एक बात-चीत

Sahayak helps a citizen connect a portal status to their next real action: where
to ask, what to keep ready, what to say, and what evidence to bring back. The
flagship problem is an NSP scholarship shown as released but not credited.

**Independent hackathon prototype; not a government service. Use fictional
information in the demonstration workflows.** Sahayak does not contact a portal,
file a grievance, change identity records, or verify a bank credit. Updates are
explicitly reported by the citizen.

## Run locally

Use Bun and a reachable PostgreSQL database with the extensions required by the
Drizzle migrations (including pgvector). Keep local credentials in the ignored
`.env.local` file. Required configuration names:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` — a strong random secret, not the library default
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` — the application's actual origin

Optional providers: `OPENROUTER_API_KEY` / `AI_MODEL` for AI drafting and
clarification, `DEEPGRAM_API_KEY` and `ELEVENLABS_API_KEY` for speech. Email
invitations also require the configured mail provider. Never commit keys.

```sh
bun install
bun run db:migrate
bun run db:seed
bun run dev
```

The current local development database is `postgresql:///sahayak_test`; use a
separate database for a public deployment. Seeding adds immutable synthetic
versions and never rewrites existing versions or citizen cases. To populate
optional semantic embeddings, run `bun run db:embed` with its provider configured.
Without embeddings, PostgreSQL lexical/trigram retrieval remains available.

```sh
bun test
bun run typecheck
git diff --check
bun run build
bun run start
```

Tests use `test/setup.ts` and a PostgreSQL database. Some integration tests add
synthetic published fixtures. Do not run the test suite against a production
database. Keep the existing development server off the port used by `start`.

Stop `next dev` before running `bun run build`: both use the same `.next`
directory, and building underneath a live dev server wedges it so that every
request hangs until the process is killed and restarted.

## Four demonstrations, one engine

- **Scholarship:** understand PFMS, collect an actual response, prepare a bank
  visit, record a setback, prepare an AI grievance and separately record its
  submission and payment confirmation.
- **Aadhaar update:** check an update, understand a rejection through UIDAI
  support, return after another setback and confirm the actual corrected result.
- **Own EPFO withdrawal claim:** trace pending/rejected payment, prepare an
  EPFiGMS request, retain its registration, follow up and confirm actual credit.
- **Bereavement:** secondary synthetic stress test; not the demo centerpiece.

New citizen cases start the exact version returned by published discovery.
Search does not start a case for an unsupported problem. Citizens can save their
current preparation as a small text file for offline use, and return in the same
browser to record a response. The browser-private Case Card keeps references,
history and separately recorded outcome evidence. A private case URL alone does
not grant another browser access.

Both interface and workflow content are bilingual. Native radio choices wrap on
phones. Text and deterministic actions work without speech or an AI call. AI
artifact generation remains an optional provider dependency; fixed checklists
and next-step downloads do not use it.

## Architecture and limits

Next.js / React, PostgreSQL, Drizzle, Zod, Better Auth and one deterministic
workflow engine. Search, Chat, MCP and reviewer comparison share
`searchWorkflows`. AI interprets language and drafts reviewable text; it does not
approve guidance or decide transitions. Atomic progress writes reject stale
updates rather than acknowledge overwritten evidence. Artifact writes preserve
concurrent case progress.

Contributor confirmation creates an unpublished, redacted Review Case. Protected
expert access, comparison and wording review are implemented. **Do not describe
two-expert decisions, transactional publication or background publishing workers
as a completed live loop:** they remain outside the verified citizen demo.
The catalogue's synthetic seeds are not proof of independent expert approval or
real-world outcomes. Each seed exposes its source and verification limits.

Deployment and submission: see
[the submission pack](docs/submission/2026-09-06-demo-and-submission.md).
