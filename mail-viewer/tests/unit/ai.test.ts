/**
 * Unit tests for the AI client facade.
 * The real client wraps @anthropic-ai/claude-agent-sdk's query() and reads
 * OAuth credentials from ~/.claude/.credentials.json. These tests cover the
 * credentials-availability gate and the messages.create facade shape that
 * the three AI routes (summarize/search/draft) depend on.
 */
import { existsSync } from 'node:fs';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
}));

jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(),
}));

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

// We require the module inside each test so module-level memoization gets
// a fresh state per case.
function loadAi(): typeof import('../../src/lib/ai') {
  let mod!: typeof import('../../src/lib/ai');
  jest.isolateModules(() => {
    mod = require('../../src/lib/ai');
  });
  return mod;
}

describe('getAIClient — credentials gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when no credentials file exists', () => {
    mockedExistsSync.mockReturnValue(false);
    const { getAIClient } = loadAi();
    expect(getAIClient()).toBeNull();
  });

  it('returns a client when credentials are present', () => {
    mockedExistsSync.mockReturnValue(true);
    const { getAIClient } = loadAi();
    const client = getAIClient();
    expect(client).not.toBeNull();
    expect(typeof client?.messages.create).toBe('function');
  });

  it('memoizes the credentials check (does not stat on every call)', () => {
    mockedExistsSync.mockReturnValue(true);
    const { getAIClient } = loadAi();
    getAIClient();
    getAIClient();
    getAIClient();
    // existsSync may be called for multiple candidate paths on first call,
    // but should NOT be called again on subsequent calls.
    const firstCallCount = mockedExistsSync.mock.calls.length;
    getAIClient();
    expect(mockedExistsSync.mock.calls.length).toBe(firstCallCount);
  });
});

describe('messages.create — facade shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it('returns content with text blocks matching the SDK response shape', async () => {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    (query as jest.Mock).mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Hello world' }] },
        };
      },
    }));

    const { getAIClient } = loadAi();
    const client = getAIClient();
    const out = await client!.messages.create({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'Say hello' }],
    });

    expect(out.content).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('concatenates text from multiple assistant message chunks', async () => {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    (query as jest.Mock).mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'First. ' }] } };
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Second.' }] } };
      },
    }));

    const { getAIClient } = loadAi();
    const out = await getAIClient()!.messages.create({
      messages: [{ role: 'user', content: 'go' }],
    });
    expect(out.content[0].text).toBe('First. Second.');
  });

  it('passes bypassPermissions + empty allowedTools to query (no MCP)', async () => {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    (query as jest.Mock).mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } };
      },
    }));

    const { getAIClient } = loadAi();
    await getAIClient()!.messages.create({
      messages: [{ role: 'user', content: 'go' }],
    });

    const callArgs = (query as jest.Mock).mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe('bypassPermissions');
    expect(callArgs.options.allowedTools).toEqual([]);
  });

  it('flattens multi-turn messages into a transcript prompt', async () => {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    (query as jest.Mock).mockImplementation(() => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'reply' }] } };
      },
    }));

    const { getAIClient } = loadAi();
    await getAIClient()!.messages.create({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'mid' },
        { role: 'user', content: 'second' },
      ],
    });
    const prompt = (query as jest.Mock).mock.calls[0][0].prompt as string;
    expect(prompt).toContain('User: first');
    expect(prompt).toContain('Assistant: mid');
    expect(prompt).toContain('User: second');
    expect(prompt.trim().endsWith('Assistant:')).toBe(true);
  });
});
