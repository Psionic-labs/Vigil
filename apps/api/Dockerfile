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

# Use pnpm deploy to isolate the production bundle and dependencies to a single directory
RUN pnpm --filter=@vigil/api --prod deploy /app/deployed

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy the self-contained deployed application
COPY --from=builder /app/deployed ./

# Non-root user for security
RUN addgroup -S vigil && adduser -S vigil -G vigil
USER vigil

EXPOSE 3001

# Default: start the API server
CMD ["node", "dist/index.js"]
