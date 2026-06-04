// src/lib/db.ts
import { neon } from "@neondatabase/serverless";

// Next.js dev 환경에서 HMR 때마다 새 연결 생성 방지 → 전역 캐싱
// prod에서는 Vercel 함수 인스턴스가 warm하면 재사용됨
const globalForDb = globalThis as unknown as { _sql: ReturnType<typeof neon> };
const sql = globalForDb._sql ?? neon(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalForDb._sql = sql;

export async function getRecords(userId: string) {
  return sql`
    SELECT
      id, user_id, category, title, rating, review, thumbnail, author, venue, finished, created_at,
      date::text       AS date,
      date_start::text AS date_start,
      date_end::text   AS date_end
    FROM records
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function createRecord(
  userId: string,
  data: {
    category: string; title: string; date: string; rating: number;
    review?: string; thumbnail?: string; author?: string; venue?: string;
    date_start?: string; date_end?: string; finished?: boolean;
  }
) {
  const [row] = await sql`
    INSERT INTO records
      (user_id, category, title, date, rating, review, thumbnail, author, venue, date_start, date_end, finished)
    VALUES
      (${userId}, ${data.category}, ${data.title}, ${data.date}, ${data.rating},
       ${data.review ?? null}, ${data.thumbnail ?? null}, ${data.author ?? null},
       ${data.venue ?? null}, ${data.date_start || null}, ${data.date_end || null},
       ${data.finished ?? false})
    RETURNING
      id, user_id, category, title, rating, review, thumbnail, author, venue, finished, created_at,
      date::text       AS date,
      date_start::text AS date_start,
      date_end::text   AS date_end
  `;
  return row;
}

export async function updateRecord(
  id: number, userId: string,
  data: {
    title?: string; date?: string; rating?: number; review?: string;
    author?: string; venue?: string; thumbnail?: string;
    date_start?: string; date_end?: string; finished?: boolean;
  }
) {
  const [row] = await sql`
    UPDATE records SET
      title      = COALESCE(${data.title      ?? null}, title),
      date       = COALESCE(${data.date       ?? null}::date, date),
      rating     = COALESCE(${data.rating     ?? null}, rating),
      review     = COALESCE(${data.review     ?? null}, review),
      author     = COALESCE(${data.author     ?? null}, author),
      venue      = COALESCE(${data.venue      ?? null}, venue),
      thumbnail  = COALESCE(${data.thumbnail  ?? null}, thumbnail),
      date_start = COALESCE(${data.date_start || null}::date, date_start),
      date_end   = COALESCE(${data.date_end   || null}::date, date_end),
      finished   = ${data.finished ?? false}
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING
      id, user_id, category, title, rating, review, thumbnail, author, venue, finished, created_at,
      date::text       AS date,
      date_start::text AS date_start,
      date_end::text   AS date_end
  `;
  return row;
}

export async function deleteRecord(id: number, userId: string) {
  await sql`DELETE FROM records WHERE id = ${id} AND user_id = ${userId}`;
}