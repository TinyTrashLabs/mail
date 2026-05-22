// Mint a NextAuth v4 session JWT (encrypted JWE) for the mail viewer.
// Usage: NEXTAUTH_SECRET=... node mint-session.mjs <username>
// Prints the cookie value to stdout. Caller plants it as the
// `__Secure-next-auth.session-token` cookie on mail.tinytrashlabs.com.

import { encode } from 'next-auth/jwt';

const user = process.argv[2];
if (!user) {
  console.error('usage: mint-session.mjs <username>');
  process.exit(2);
}

const secret = process.env.NEXTAUTH_SECRET;
if (!secret) {
  console.error('NEXTAUTH_SECRET required');
  process.exit(2);
}

const token = await encode({
  token: {
    name: user,
    username: user,
    email: `${user}@tinytrashlabs.com`,
    picture: null,
    sub: user,
  },
  secret,
  maxAge: 30 * 60, // 30 min — plenty for one test run
});

process.stdout.write(token);
