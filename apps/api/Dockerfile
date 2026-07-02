# syntax=docker/dockerfile:1

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
# Install ALL workspace dependencies (including SDK) so the build has everything.
FROM node:22-alpine AS deps
WORKDIR /app

# Enable corepack so pnpm is available
RUN corepack enable

# Copy workspace manifests first — cache this layer unless deps change
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/sdk/package.json ./packages/sdk/

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules

# Copy source
COPY tsconfig.base.json ./
COPY packages/sdk ./packages/sdk
COPY apps/api ./apps/api

# Build SDK first (API may reference it), then API
RUN pnpm --filter @vigil/sdk build
RUN pnpm --filter @vigil/api build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only copy what's needed to run
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./package.json

# Non-root user for security
RUN addgroup -S vigil && adduser -S vigil -G vigil
USER vigil

EXPOSE 3001

# Default: start the API server
# The triage worker is started as a separate Fly.io process group (see fly.toml)
CMD ["node", "dist/index.js"]
