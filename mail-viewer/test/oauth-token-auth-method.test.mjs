/**
 * Regression test for the Mattermost OAuth token-endpoint auth method.
 *
 * Mattermost's /oauth/access_token expects client credentials in the POST
 * body (`client_secret_post`), not the HTTP Basic auth header
 * (`client_secret_basic`). NextAuth's openid-client defaults to
 * `client_secret_basic`, which makes MM return:
 *
 *   invalid_request: Bad client_id.
 *
 * The fix is to set `client.token_endpoint_auth_method: 'client_secret_post'`
 * on the Mattermost provider config so credentials are sent in the form body
 * where MM parses them.
 *
 * See: https://developers.mattermost.com/integrate/apps/authentication/oauth2/
 *
 * Run with: node test/oauth-token-auth-method.test.mjs
 */
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const authSrc = readFileSync(resolve(__dirname, '../src/lib/auth.ts'), 'utf8');

// Strip comments so the assertion isn't fooled by a commented-out reference.
const stripped = authSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

assert.ok(
  /token_endpoint_auth_method\s*:\s*['"]client_secret_post['"]/.test(stripped),
  "Mattermost provider must set client.token_endpoint_auth_method to 'client_secret_post'. MM's /oauth/access_token rejects credentials sent via HTTP Basic auth (NextAuth's default) with 'invalid_request: Bad client_id.' Credentials must be in the POST body.",
);

console.log('ok - Mattermost provider uses client_secret_post for token endpoint');
