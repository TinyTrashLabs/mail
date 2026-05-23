/**
 * Shared AI client for mail viewer.
 *
 * Uses the OAuth credentials from ~/.claude/.credentials.json — same volume
 * the personas stack writes. Reads the accessToken directly and calls the
 * Anthropic Messages API via fetch, so there's no SDK dependency that can
 * break in Next.js standalone bundling.
 *
 * Returns null when creds aren't available (e.g. local dev without the
 * volume mount), and all three routes return 503 in that case.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const AI_MODEL = 'claude-haiku-4-5';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Well-known credential file locations, in priority order.
// The compose file sets HOME=/home/node and mounts claude-creds there,
// so /home/node/.claude/.credentials.json is the primary path in prod.
const CREDS_CANDIDATES = [
  join(homedir(), '.claude', '.credentials.json'),
  '/home/node/.claude/.credentials.json',
];

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

function loadAccessToken(): string | null {
  for (const p of CREDS_CANDIDATES) {
    try {
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, 'utf8');
      const creds: ClaudeCredentials = JSON.parse(raw);
      const token = creds?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {
      // unreadable or malformed — try next candidate
    }
  }
  return null;
}

type Role = 'user' | 'assistant';
interface MessagesCreateInput {
  model?: string;
  max_tokens?: number;
  messages: Array<{ role: Role; content: string }>;
}

interface TextBlock { type: 'text'; text: string }
interface MessagesCreateOutput { content: TextBlock[] }

interface AIClient {
  messages: { create(input: MessagesCreateInput): Promise<MessagesCreateOutput> };
}

let _client: AIClient | null = null;
let _checked = false;
let _available = false;

export function credsAvailable(): boolean {
  if (_checked) return _available;
  _checked = true;
  _available = loadAccessToken() !== null;
  return _available;
}

async function runQuery(model: string, messages: MessagesCreateInput['messages'], maxTokens: number): Promise<string> {
  const token = loadAccessToken();
  if (!token) throw new Error('No Claude OAuth credentials available');

  const resp = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const snippet = body.substring(0, 200);
    throw new Error(`Anthropic API error ${resp.status}: ${snippet}`);
  }

  const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
  const text = data.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('') ?? '';
  return text.trim();
}

export function getAIClient(): AIClient | null {
  if (!credsAvailable()) return null;
  if (_client) return _client;
  _client = {
    messages: {
      async create({ model, max_tokens, messages }: MessagesCreateInput): Promise<MessagesCreateOutput> {
        const text = await runQuery(model || AI_MODEL, messages, max_tokens ?? 1024);
        return { content: [{ type: 'text', text }] };
      },
    },
  };
  return _client;
}
