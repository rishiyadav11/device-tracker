import type { NextAuthConfig } from "next-auth";

// Edge-safe base config. This module MUST NOT import the database, bcrypt, or
// any Node-only code, because it is loaded by the middleware (Edge runtime).
// The Credentials provider (which needs the DB + bcrypt) is added only in
// lib/auth.ts, which runs in the Node runtime.
export const authConfig = {
  // Trust the deploy host's headers. Without this, Auth.js rejects requests on
  // a real domain with an UntrustedHost error even though localhost works.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
