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
      profile(profile) {
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
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
  pages: {
    signIn: '/api/auth/signin',
  },
};
