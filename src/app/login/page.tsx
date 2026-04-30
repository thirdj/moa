// src/app/login/page.tsx
"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    await signIn("google", { callbackUrl: "/" });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #f0eeff 0%, #fef3fb 100%)", fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif", padding: "0 16px" }}>
      <div style={{ background: "#fff", borderRadius: 28, padding: "52px 40px 44px", boxShadow: "0 24px 64px rgba(0,0,0,0.10)", textAlign: "center", width: "100%", maxWidth: 340 }}>
        <div style={{ fontSize: 58, marginBottom: 16 }}>🎬</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1a1a2e", margin: "0 0 8px" }}>문화생활 기록</h1>
        <p style={{ fontSize: 14, color: "#aaa", margin: "0 0 40px", lineHeight: 1.7 }}>
          책, 영화, 전시, 공연을<br />간단하게 기록하고 다시 꺼내보세요
        </p>
        <button onClick={handleSignIn} disabled={loading}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "14px 20px", borderRadius: 14, border: "1.5px solid #e8e8e8", background: loading ? "#f5f5f5" : "#fff", fontSize: 15, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit", color: "#333", transition: "all 0.2s" }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#f9f9f9"; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "#fff"; }}>
          {loading ? (
            <span style={{ color: "#aaa" }}>로그인 중...</span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google로 시작하기
            </>
          )}
        </button>
        <p style={{ fontSize: 11, color: "#ccc", marginTop: 28, lineHeight: 1.7 }}>로그인하면 나의 기록이 안전하게 저장됩니다</p>
      </div>
    </div>
  );
}