/**
 * Unit tests for the AI client facade.
 * The client reads OAuth credentials from ~/.claude/.credentials.json and
 * calls the Anthropic Messages API directly via fetch (no SDK dependency).
 * These tests cover the credentials-availability gate and the messages.create
 * facade shape that the three AI routes (summarize/search/draft) depend on.
 */
import { existsSync, readFileSync } from 'node:fs';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock global fetch for Anthropic API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockedReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;

// We require the module inside each test so module-level memoization gets
// a fresh state per case.
function loadAi(): typeof import('../../src/lib/ai') {
  let mod!: typeof import('../../src/lib/ai');
  jest.isolateModules(() => {
    mod = require('../../src/lib/ai');
  });
  return mod;
}

function mockCredsFile(accessToken = 'test-token') {
  mockedExistsSync.mockReturnValue(true);
  mockedReadFileSync.mockReturnValue(
    JSON.stringify({ claudeAiOauth: { accessToken } })
  );
}

function mockAnthropicResponse(text: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
  });
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
    mockCredsFile();
    const { getAIClient } = loadAi();
    const client = getAIClient();
    expect(client).not.toBeNull();
    expect(typeof client?.messages.create).toBe('function');
  });

  it('memoizes the credentials check (does not stat on every call)', () => {
    mockCredsFile();
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
    mockCredsFile();
  });

  it('returns content with text blocks matching the API response shape', async () => {
    mockAnthropicResponse('Hello world');

    const { getAIClient } = loadAi();
    const client = getAIClient();
    const out = await client!.messages.create({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'Say hello' }],
    });

    expect(out.content).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('calls the Anthropic Messages API with correct headers and body', async () => {
    mockAnthropicResponse('ok');

    const { getAIClient } = loadAi();
    await getAIClient()!.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{ role: 'user', content: 'go' }],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer test-token');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const reqBody = JSON.parse(init.body);
    expect(reqBody.model).toBe('claude-haiku-4-5');
    expect(reqBody.max_tokens).toBe(512);
    expect(reqBody.messages).toEqual([{ role: 'user', content: 'go' }]);
  });

  it('uses default model and max_tokens when not specified', async () => {
    mockAnthropicResponse('ok');

    const { getAIClient, AI_MODEL } = loadAi();
    await getAIClient()!.messages.create({
      messages: [{ role: 'user', content: 'go' }],
    });

    const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(reqBody.model).toBe(AI_MODEL);
    expect(reqBody.max_tokens).toBe(1024);
  });

  it('passes multi-turn messages directly to the API', async () => {
    mockAnthropicResponse('reply');

    const { getAIClient } = loadAi();
    await getAIClient()!.messages.create({
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'mid' },
        { role: 'user', content: 'second' },
      ],
    });

    const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(reqBody.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'mid' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('throws on non-ok API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });

    const { getAIClient } = loadAi();
    await expect(
      getAIClient()!.messages.create({ messages: [{ role: 'user', content: 'go' }] })
    ).rejects.toThrow('Anthropic API error 429');
  });
});
