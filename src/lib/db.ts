// src/lib/db.ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function getRecords(userId: string) {
  return sql`SELECT * FROM records WHERE user_id = ${userId} ORDER BY created_at DESC`;
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
    RETURNING *`;
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
    RETURNING *`;
  return row;
}

export async function deleteRecord(id: number, userId: string) {
  await sql`DELETE FROM records WHERE id = ${id} AND user_id = ${userId}`;
}