FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@9.5.0
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.5.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --home /home/nextjs --shell /bin/sh nextjs
# Pre-create the mount point so the claude-creds volume bind has somewhere to land
# regardless of mount order. The mail viewer uses ~/.claude/.credentials.json for
# AI-feature OAuth (see lib/ai.ts) — the personas stack owns this volume.
RUN mkdir -p /home/nextjs/.claude && chown -R nextjs:nodejs /home/nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
