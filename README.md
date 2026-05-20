# TTL Mail

Self-hosted email viewer for Tiny Trash Labs.

## Architecture

- **cf-worker** — Cloudflare Email Worker: receives inbound mail via Email Routing, POSTs raw RFC822 to mail-store
- **mail-store** — Node/Express API: parses mail, stores in dedicated Postgres, serves viewer API
- **mail-viewer** — Next.js app: MM OAuth auth, per-user scoped inboxes, shared inbox for role addresses, compose via Resend

## Quick start

\`\`\`sh
cp .env.example .env
# fill in secrets
docker compose up -d
\`\`\`

Viewer runs on :3026. Mail-store API on :3025.

## Security

- Personal mailboxes (david/shane/derek/ryan) are scoped by MM OAuth username — enforced at both viewer and store layers
- HTML email bodies are sanitized with DOMPurify before render
- Outbound sender is always derived from the session username — no from-address spoofing
- Duplicate ingest returns the existing message ID instead of null
