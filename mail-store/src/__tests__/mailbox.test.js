import { resolveMailbox, PERSONAL } from '../mailbox.js';

describe('resolveMailbox', () => {
  test('null/undefined envelope_to → shared', () => {
    expect(resolveMailbox(null)).toBe('shared');
    expect(resolveMailbox(undefined)).toBe('shared');
    expect(resolveMailbox('')).toBe('shared');
  });

  test('personal addresses → owner mailbox', () => {
    expect(resolveMailbox('david@tinytrashlabs.com')).toBe('david');
    expect(resolveMailbox('shane@tinytrashlabs.com')).toBe('shane');
    expect(resolveMailbox('derek@tinytrashlabs.com')).toBe('derek');
    expect(resolveMailbox('ryan@tinytrashlabs.com')).toBe('ryan');
    expect(resolveMailbox('patchtest@tinytrashlabs.com')).toBe('patchtest');
  });

  test('role/service addresses → shared', () => {
    expect(resolveMailbox('hello@tinytrashlabs.com')).toBe('shared');
    expect(resolveMailbox('contact@tinytrashlabs.com')).toBe('shared');
    expect(resolveMailbox('noreply@tinytrashlabs.com')).toBe('shared');
    expect(resolveMailbox('support@tinytrashlabs.com')).toBe('shared');
  });

  test('case-insensitive matching', () => {
    expect(resolveMailbox('David@tinytrashlabs.com')).toBe('david');
    expect(resolveMailbox('SHANE@tinytrashlabs.com')).toBe('shane');
  });

  test('PERSONAL set has exactly the five team members', () => {
    expect([...PERSONAL].sort()).toEqual(['david', 'derek', 'patchtest', 'ryan', 'shane']);
  });
});
