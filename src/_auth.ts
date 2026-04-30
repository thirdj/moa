// src/auth.ts
// 설치: npm install @auth/pg-adapter pg @types/pg
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { Pool } from "pg";

// Neon은 pg Pool로 연결 (SSL 필수)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1, // Serverless 환경에서는 1로 제한
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(pool),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      if (session.user && user?.id) session.user.id = user.id;
      return session;
    },
  },
});