# Contributing to Vigil

Thanks for your interest. Vigil is source-available under the
[Business Source License 1.1](LICENSE). Here's how to get involved.

## License Terms

Any code you contribute is made under the same BSL 1.1 license
that covers the rest of the project. By submitting a pull request,
you agree that your contribution may be used under those terms.

If you need a commercial license, contact Psionics directly.

## Getting Started

```bash
# Clone the repo
git clone https://github.com/psionics/vigil.git
cd vigil

# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env

# Start development
pnpm run dev
```

## Project Structure

```
vigil/
├── apps/
│   ├── api/          # Hono backend (ingest, auth, background workers)
│   ├── web/          # Next.js frontend
│   └── playground/   # Local dev playground
├── packages/
│   └── sdk/          # @vigil/sdk — browser instrumentation
├── docs/             # Architecture, schema, and product specs
└── .github/
    └── workflows/    # CI pipeline
```

## Development Workflow

1. **Branch** from `main` using a descriptive name:
   `git checkout -b feat/my-change`

2. **Run checks locally** before pushing:
   ```bash
   pnpm run lint
   pnpm run typecheck
   pnpm --filter @vigil/sdk test
   pnpm --filter @vigil/api test
   pnpm run build
   ```

3. **Open a pull request** against `main`. The CI pipeline
   (lint → typecheck → test → build → size audit) must pass.

## Code Style

- TypeScript strict mode — no `any` unless unavoidable
- ESLint config is in `eslint.config.js` at the root
- Use `pnpm` (not npm or yarn) for all dependency management
- Formatting is enforced by the linter; no Prettier config needed

## Reporting Issues

- **Bug reports** — Open a GitHub issue with reproduction steps,
  expected vs actual behavior, and environment details.
- **Feature requests** — Open a discussion first so we can scope
  the change before you start coding.
- **Security vulnerabilities** — See [SECURITY.md](SECURITY.md)
  for private reporting.
