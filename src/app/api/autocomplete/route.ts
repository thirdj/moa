// src/app/api/autocomplete/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q   = (searchParams.get("q") ?? "").trim();
  const cat = searchParams.get("cat") ?? "";
  if (!q) return NextResponse.json([]);

  const userId = session.user.id;
  const pattern = `%${q}%`;

  // 카테고리 필터 유무에 따라 쿼리 분리
  const rows = cat
    ? await sql`
        SELECT 'title' AS type, title AS value, thumbnail, author, venue, category, MAX(created_at) AS last_used
        FROM records WHERE user_id = ${userId} AND title ILIKE ${pattern} AND category = ${cat}
        GROUP BY title, thumbnail, author, venue, category
        UNION
        SELECT 'author' AS type, author AS value, NULL, NULL, NULL, category, MAX(created_at)
        FROM records WHERE user_id = ${userId} AND author IS NOT NULL AND author != '' AND author ILIKE ${pattern} AND category = ${cat}
        GROUP BY author, category
        UNION
        SELECT 'venue' AS type, venue AS value, NULL, NULL, NULL, category, MAX(created_at)
        FROM records WHERE user_id = ${userId} AND venue IS NOT NULL AND venue != '' AND venue ILIKE ${pattern} AND category = ${cat}
        GROUP BY venue, category
        ORDER BY last_used DESC LIMIT 10
      `
    : await sql`
        SELECT 'title' AS type, title AS value, thumbnail, author, venue, category, MAX(created_at) AS last_used
        FROM records WHERE user_id = ${userId} AND title ILIKE ${pattern}
        GROUP BY title, thumbnail, author, venue, category
        UNION
        SELECT 'author' AS type, author AS value, NULL, NULL, NULL, category, MAX(created_at)
        FROM records WHERE user_id = ${userId} AND author IS NOT NULL AND author != '' AND author ILIKE ${pattern}
        GROUP BY author, category
        UNION
        SELECT 'venue' AS type, venue AS value, NULL, NULL, NULL, category, MAX(created_at)
        FROM records WHERE user_id = ${userId} AND venue IS NOT NULL AND venue != '' AND venue ILIKE ${pattern}
        GROUP BY venue, category
        ORDER BY last_used DESC LIMIT 10
      `;

  return NextResponse.json(rows);
}