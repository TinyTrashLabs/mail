/**
 * Regression test for the /api/auth/signin redirect loop.
 *
 * Setting `pages.signIn` to NextAuth's own built-in path
 * ('/api/auth/signin') tells NextAuth "when you'd normally send an
 * unauthenticated request to the signin page, redirect it here instead."
 * Since that IS the signin page, the route redirects to itself forever
 * and the browser gives up with ERR_TOO_MANY_REDIRECTS.
 *
 * The fix is to leave `pages.signIn` unset so NextAuth's default signin
 * handler renders the provider list instead of redirecting.
 *
 * Run with: node test/auth-config.test.mjs
 */
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const authSrc = readFileSync(resolve(__dirname, '../src/lib/auth.ts'), 'utf8');

// Strip line and block comments so the assertion isn't fooled by a commented-out reference.
const stripped = authSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

assert.ok(
  !/signIn\s*:\s*['"]\/api\/auth\/signin['"]/.test(stripped),
  "authOptions.pages.signIn must NOT be set to '/api/auth/signin' — that path is NextAuth's own built-in signin page and self-referencing it causes an infinite redirect loop (ERR_TOO_MANY_REDIRECTS). Leave pages.signIn unset to use the default signin handler, OR point it at a real custom page route.",
);

console.log('ok - authOptions.pages.signIn is not self-referential');
