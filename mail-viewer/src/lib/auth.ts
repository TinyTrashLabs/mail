import type { NextAuthOptions } from 'next-auth';

const MM_BASE = process.env.MM_OAUTH_BASE_URL!;

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'mattermost',
      name: 'Mattermost',
      type: 'oauth',
      authorization: `${MM_BASE}/oauth/authorize`,
      token: `${MM_BASE}/oauth/access_token`,
      userinfo: `${MM_BASE}/api/v4/users/me`,
      clientId: process.env.MM_OAUTH_CLIENT_ID!,
      clientSecret: process.env.MM_OAUTH_CLIENT_SECRET!,
      // Mattermost's /oauth/access_token expects credentials in the POST
      // body, not the HTTP Basic auth header. NextAuth's openid-client
      // defaults to `client_secret_basic`, which makes MM return
      // "invalid_request: Bad client_id." Force `client_secret_post` so
      // client_id + client_secret land in the form body where MM looks for
      // them. See https://developers.mattermost.com/integrate/apps/authentication/oauth2/
      client: {
        token_endpoint_auth_method: 'client_secret_post',
      },
      profile(profile) {
        // Prefer real name when MM has one; otherwise fall back to username.
        const first = (profile.first_name ?? "").trim();
        const last = (profile.last_name ?? "").trim();
        const display = (first || last) ? `${first} ${last}`.trim() : (profile.nickname || profile.username);
        return {
          id: profile.id,
          name: display,
          email: profile.email,
          username: profile.username,
          image: null,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.username = (profile as { username?: string }).username ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      (session as { username?: unknown }).username = token.username;
      return session;
    },
  },
};
