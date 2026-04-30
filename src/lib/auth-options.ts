// src/lib/auth-options.ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { Pool } from "pg";
import PostgresAdapter from "@auth/pg-adapter";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

export const authOptions: NextAuthOptions = {
  // @ts-ignore — @auth/pg-adapter와 next-auth v4 타입 불일치 무시
  adapter: PostgresAdapter(pool),
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user && user?.id) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
};