# Vigil Web Dashboard

Next.js dashboard for the Vigil issue triage workflow. The app currently runs against mock data in `lib/mock-data.ts` and exposes the main issue, session replay, and settings surfaces used by the MVP.

## Getting Started

Install dependencies from the repo root:

```bash
pnpm install
```

Run the web app:

```bash
cd apps/web
pnpm dev
```

Open http://localhost:3000. No environment variables are required for the mock dashboard today. When API/auth integration lands, add local values in `apps/web/.env.local`.

## Scripts

```bash
pnpm dev     # Next.js development server
pnpm build   # Production build
pnpm start   # Serve the production build
pnpm lint    # Next.js lint checks
```

From the repo root, `pnpm dev`, `pnpm build`, and `pnpm lint` run through Turborepo.

## Key Routes

- `/` shows the overview dashboard, severity breakdown, triage inbox, and high-friction sessions.
- `/issues` lists grouped AI findings with search, filter chips, and sorting.
- `/issues/[id]` shows the AI bug report, reproduction steps, evidence, affected sessions, and GitHub actions.
- `/sessions` lists analyzed sessions with friction, signals, and environment metadata.
- `/sessions/[id]` shows session replay context and timeline details.
- `/settings` contains SDK install snippets, project key controls, and GitHub automation settings.

## Where To Edit

- Main dashboard: `app/page.tsx`
- Issue pages: `app/issues/page.tsx` and `app/issues/[id]/page.tsx`
- Session pages: `app/sessions/page.tsx` and `app/sessions/[id]/page.tsx`
- Shared UI: `components/shared`
- Mock data and utilities: `lib/mock-data.ts`, `lib/types.ts`, and `lib/utils.ts`

## Deployment

Deploy the app as a standard Next.js project. Vercel is the easiest path: set the project root to `apps/web`, use `pnpm build`, and add any future API/auth environment variables in the Vercel dashboard.

## Troubleshooting

- If dependencies look stale, run `pnpm install` at the repo root.
- If port 3000 is busy, start Next with `pnpm dev -- -p 3001`.
- If dashboard data looks wrong, check `apps/web/lib/mock-data.ts` first; most screens currently read directly from that file.
