# syntax=docker/dockerfile:1
#
# Build context is the repository root, not this directory:
#   docker compose -f docker/docker-compose.yml build
# (the compose file sets `context: ..` for exactly this reason).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Dev dependencies are needed here: `npm run build` runs `prisma generate`, and
# the migrate stage below runs the prisma CLI.
RUN npm ci


FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they have to be build args — passing them as runtime env does nothing, and the
# page ends up calling whatever URL was baked in instead. This is why changing
# the deployment URL means rebuilding the image, not restarting the container.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# Fails fast with a readable message rather than building an image whose
# frontend silently points at "undefined".
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
      || (echo "ERROR: NEXT_PUBLIC_SUPABASE_URL build arg is required" >&2; exit 1) \
 && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
      || (echo "ERROR: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY build arg is required" >&2; exit 1)

ENV NEXT_TELEMETRY_DISABLED=1
# Needs network: `prisma generate` and next/font/google (Geist) both fetch
# during the build.
RUN npm run build


# One-shot maintenance image: applies migrations, and creates the covers
# bucket via the same scripts/create-covers-bucket.ts the hosted path uses, so
# bucket settings live in exactly one place. Kept separate from the runner so
# the app image carries neither the prisma CLI nor a direct-connection URL.
FROM node:22-alpine AS tools
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
CMD ["npx", "prisma", "migrate", "deploy"]


FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone bundles the traced server + its node_modules; static/ and public/
# are not traced and have to come across separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
