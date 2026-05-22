/**
 * Shared AI client for mail viewer.
 *
 * Backed by @anthropic-ai/claude-agent-sdk's `query()`, which authenticates via
 * the OAuth credentials baked into ~/.claude/.credentials.json — same setup the
 * personas use. The viewer container mounts the shared `claude-personas-server_claude-creds`
 * docker volume at /home/node/.claude so this path Just Works in prod.
 *
 * We expose a thin facade that mimics the bits of the old @anthropic-ai/sdk
 * Messages API the three AI routes (summarize/search/draft) use, so the
 * routes themselves didn't need to change.
 *
 * Returns null when creds aren't available (e.g. local dev without the
 * volume mount), and all three routes return 503 in that case.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const AI_MODEL = 'claude-haiku-4-5';

// Well-known locations for the Claude CLI binary, in priority order.
// The Dockerfile copies the linux-x64 binary to /usr/local/bin/claude so
// it survives next build --standalone (which doesn't carry native binaries).
const CLAUDE_BINARY_CANDIDATES = [
  '/usr/local/bin/claude',
  join(homedir(), '.local', 'bin', 'claude'),
];

function findClaudeBinary(): string | undefined {
  return CLAUDE_BINARY_CANDIDATES.find((p) => {
    try { return existsSync(p); } catch { return false; }
  });
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

function credsAvailable(): boolean {
  if (_checked) return _available;
  _checked = true;
  const candidates = [
    join(homedir(), '.claude', '.credentials.json'),
    '/home/node/.claude/.credentials.json',
    '/root/.claude/.credentials.json',
    '/home/nextjs/.claude/.credentials.json',
  ];
  _available = candidates.some((p) => {
    try { return existsSync(p); } catch { return false; }
  });
  return _available;
}

// Flatten a [{role,content}] message list into a single prompt string,
// same shape lib/claude.js uses in the bots repo. The agent SDK accepts
// a plain string prompt for single-turn calls.
function transcriptFromMessages(messages: MessagesCreateInput['messages']): string {
  const parts = messages.map((m) => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    return `${role}: ${m.content}`;
  });
  parts.push('Assistant:');
  return parts.join('\n\n');
}

async function runQuery(model: string, prompt: string): Promise<string> {
  let text = '';
  const claudeBinary = findClaudeBinary();
  // bypassPermissions + allowDangerouslySkipPermissions is the pattern lib/claude.js
  // uses in the bots repo. The mail viewer has no tools to permit anyway — it's
  // a single-turn LLM call with no MCP servers wired in.
  const result = query({
    prompt,
    options: {
      model,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      // Explicitly empty allowlist + no MCP — the AI surfaces don't use tools.
      allowedTools: [],
      // Point explicitly at the binary so the SDK doesn't fall back to searching
      // node_modules (which don't survive next build --standalone).
      ...(claudeBinary ? { pathToClaudeCodeExecutable: claudeBinary } : {}),
    },
  });
  for await (const msg of result) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') text += block.text;
      }
    }
  }
  return text.trim();
}

export function getAIClient(): AIClient | null {
  if (!credsAvailable()) return null;
  if (_client) return _client;
  _client = {
    messages: {
      async create({ model, messages }: MessagesCreateInput): Promise<MessagesCreateOutput> {
        const prompt = transcriptFromMessages(messages);
        const text = await runQuery(model || AI_MODEL, prompt);
        return { content: [{ type: 'text', text }] };
      },
    },
  };
  return _client;
}
