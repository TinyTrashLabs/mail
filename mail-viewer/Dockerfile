FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@9.5.0
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g pnpm@9.5.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Native Claude binary is glibc-linked. We deliberately use debian-slim
# (not alpine) so it can actually launch — gcompat shims on Alpine don't
# cover the full set of relocations the binary needs (relocation type 37).
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --home-dir /home/nextjs --shell /bin/sh --create-home nextjs
# Pre-create the mount point so the claude-creds volume bind has somewhere to land
# regardless of mount order. The mail viewer uses ~/.claude/.credentials.json for
# AI-feature OAuth (see lib/ai.ts) — the personas stack owns this volume.
RUN mkdir -p /home/nextjs/.claude && chown -R nextjs:nodejs /home/nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy the claude-agent-sdk native binary so AI features work in standalone mode.
# pnpm install puts it in the optional platform package; next build --standalone
# doesn't carry native binaries forward automatically.
COPY --from=deps --chown=root:root \
  /app/node_modules/.pnpm/@anthropic-ai+claude-agent-sdk-linux-x64@0.3.147/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude \
  /usr/local/bin/claude
RUN chmod +x /usr/local/bin/claude
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
