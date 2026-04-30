# 🎬 문화생활 기록 앱 — 최종 구축 가이드

## 확정 스택
| 역할 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 인증 | NextAuth.js v5 (Google OAuth) |
| DB | Neon PostgreSQL |
| 배포 | Vercel |
| 책 검색 | Google Books API |
| 영화 검색 | TMDB API |
| 전시/공연/콘서트 | 수동 입력 + 내 기록 자동완성 |

---

## 1. 프로젝트 생성

```bash
npx create-next-app@latest culture-log --typescript --tailwind --app --src-dir
cd culture-log
npm install @neondatabase/serverless next-auth@beta
```

---

## 2. 파일 배치

| 다운로드 파일 | 저장 위치 |
|---|---|
| `auth.ts` | `src/auth.ts` |
| `db.ts` (lib/) | `src/lib/db.ts` |
| `api-routes.ts` | 주석 보고 각각 분리 저장 |
| `page.tsx` | `src/app/page.tsx` |
| `login-page.tsx` | `src/app/login/page.tsx` |
| `layout.tsx` | `src/app/layout.tsx` |

---

## 3. .env.local

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
AUTH_SECRET=                  # openssl rand -base64 32
AUTH_GOOGLE_ID=xxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxx
GOOGLE_BOOKS_API_KEY=AIza...
TMDB_API_KEY=eyJhbGci...
NEXTAUTH_URL=http://localhost:3000
```

---

## 4. Neon DB 초기화 SQL

```sql
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name           TEXT,
  email          TEXT UNIQUE,
  email_verified TIMESTAMPTZ,
  image          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_token TEXT UNIQUE NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   VARCHAR(20)  NOT NULL,
  title      TEXT         NOT NULL,
  date       DATE         NOT NULL,
  rating     NUMERIC(2,1) NOT NULL,
  review     TEXT,
  thumbnail  TEXT,
  author     TEXT,
  venue      TEXT,                    -- ⭐ 공연장/전시장
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
```

---

## 5. 자동완성 동작 방식

```
사용자 입력 → /api/autocomplete?q=레미&cat=musical
                      ↓
         내 records DB에서 ILIKE 검색
         ┌─────────────────────────────┐
         │ type=title  "레미제라블"     │ ← 이전에 기록한 제목
         │ type=venue  "블루스퀘어"     │ ← 이전에 입력한 장소
         │ type=author "옥주현"         │ ← 이전에 입력한 출연진
         └─────────────────────────────┘
                      +
         책/영화는 외부 API 결과도 함께 표시
```

---

## 6. Google OAuth 설정

1. console.cloud.google.com → OAuth 2.0 클라이언트 ID 발급
2. 리디렉션 URI:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/callback/google`

---

## 7. Vercel 배포

```bash
git add . && git commit -m "init" && git push
```
Vercel → Import → Environment Variables 입력 → Deploy
