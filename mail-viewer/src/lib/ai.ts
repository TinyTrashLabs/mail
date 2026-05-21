/**
 * Shared Anthropic client for AI features.
 * Requires ANTHROPIC_API_KEY in env.
 * All three AI routes call getAIClient() and return 503 when it returns null,
 * so features degrade cleanly without the key.
 */
import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

export function getAIClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const AI_MODEL = 'claude-haiku-4-5';
