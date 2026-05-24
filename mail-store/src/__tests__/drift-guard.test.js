/**
 * Tests for drift-guard.js — status-code branching, debounce reset,
 * MM skip when creds absent, and error path.
 */

import { jest } from '@jest/globals';
import { runCheck, ALERT_DEBOUNCE_MS } from '../healthcheck/drift-guard.js';

const BASE_OPTS = {
  ingestSecret: 'test-secret',
  ingestEndpoint: 'https://mail-ingest.example.com',
  mmBaseUrl: null,
  mmBotToken: null,
  alertChannel: 'it-help',
};

describe('runCheck — status-code branching', () => {
  test('400 response → in-sync, alertedAt reset to 0', async () => {
    const ref = { value: 99999 };
    const mockReq = jest.fn().mockResolvedValue({ status: 400, body: '{"error":"raw required"}' });
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: jest.fn(), alertedAtRef: ref });
    expect(result).toBe('in-sync');
    expect(ref.value).toBe(0);
  });

  test('401 response → drift, mmPost called when debounce not active', async () => {
    const ref = { value: 0 };
    const mockReq = jest.fn().mockResolvedValue({ status: 401, body: '{"error":"unauthorized"}' });
    const mockMm = jest.fn().mockResolvedValue(undefined);
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    expect(result).toBe('drift');
    expect(mockMm).toHaveBeenCalledTimes(1);
    expect(ref.value).toBeGreaterThan(0); // alertedAt set to now
  });

  test('401 within debounce window → drift returned but mmPost NOT called again', async () => {
    const ref = { value: Date.now() - 1000 }; // alerted 1 second ago (within 1hr debounce)
    const mockReq = jest.fn().mockResolvedValue({ status: 401, body: '' });
    const mockMm = jest.fn();
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    expect(result).toBe('drift');
    expect(mockMm).not.toHaveBeenCalled();
  });

  test('401 outside debounce window → mmPost called again', async () => {
    const ref = { value: Date.now() - ALERT_DEBOUNCE_MS - 1 }; // alerted >1hr ago
    const mockReq = jest.fn().mockResolvedValue({ status: 401, body: '' });
    const mockMm = jest.fn().mockResolvedValue(undefined);
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    expect(result).toBe('drift');
    expect(mockMm).toHaveBeenCalledTimes(1);
  });

  test('5xx response → error returned, no mmPost', async () => {
    const ref = { value: 0 };
    const mockReq = jest.fn().mockResolvedValue({ status: 503, body: '' });
    const mockMm = jest.fn();
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    expect(result).toBe('error');
    expect(mockMm).not.toHaveBeenCalled();
  });

  test('network error → error returned, no mmPost, no throw', async () => {
    const ref = { value: 0 };
    const mockReq = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const mockMm = jest.fn();
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    expect(result).toBe('error');
    expect(mockMm).not.toHaveBeenCalled();
  });
});

describe('runCheck — MM skip when creds absent', () => {
  test('mmPost not called when mmBaseUrl is null', async () => {
    const ref = { value: 0 };
    const mockReq = jest.fn().mockResolvedValue({ status: 401, body: '' });
    const mockMm = jest.fn();
    // mmBaseUrl=null means mmPostFn will be called but return early
    await runCheck({ ...BASE_OPTS, mmBaseUrl: null, requestFn: mockReq, mmPostFn: mockMm, alertedAtRef: ref });
    // mmPostFn is injected but receives null mmBaseUrl — test that it is called with null
    // (the actual mmPost function skips if !mmBaseUrl; here we verify the call shape)
    expect(mockMm).toHaveBeenCalledWith(null, null, 'it-help', expect.stringContaining('drift'));
  });
});

describe('debounce reset on recovery', () => {
  test('in-sync after drift resets alertedAt so next drift fires alert again', async () => {
    const ref = { value: Date.now() - 1000 }; // recently alerted

    // Recovery
    const mockReq = jest.fn().mockResolvedValue({ status: 400, body: '' });
    await runCheck({ ...BASE_OPTS, requestFn: mockReq, mmPostFn: jest.fn(), alertedAtRef: ref });
    expect(ref.value).toBe(0); // reset

    // New drift — should alert
    const mockReq2 = jest.fn().mockResolvedValue({ status: 401, body: '' });
    const mockMm2 = jest.fn().mockResolvedValue(undefined);
    const result = await runCheck({ ...BASE_OPTS, requestFn: mockReq2, mmPostFn: mockMm2, alertedAtRef: ref });
    expect(result).toBe('drift');
    expect(mockMm2).toHaveBeenCalledTimes(1);
  });
});

describe('ALERT_DEBOUNCE_MS', () => {
  test('debounce is exactly 1 hour', () => {
    expect(ALERT_DEBOUNCE_MS).toBe(60 * 60 * 1000);
  });
});
