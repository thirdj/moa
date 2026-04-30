// src/app/layout.tsx
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  title: "문화생활 기록",
  description: "책, 영화, 전시, 공연을 기록하세요",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="ko">
      <body>
        <SessionProviderWrapper session={session}>
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}