// ================================================================
// 파일 분리 가이드
//
// src/app/api/
// ├── auth/[...nextauth]/route.ts      ← [1]
// ├── records/
// │   ├── route.ts                     ← [2] GET 전체 / POST 추가
// │   └── [id]/route.ts                ← [3] PUT / DELETE
// ├── autocomplete/route.ts            ← [4] ⭐ 내 기록 기반 자동완성
// └── search/
//     ├── books/route.ts               ← [5] Google Books
//     └── movies/route.ts              ← [6] TMDB
// ================================================================


// ================================================================
// [1] src/app/api/auth/[...nextauth]/route.ts
// ================================================================
export { handlers as GET, handlers as POST } from "@/auth";


// ================================================================
// [2] src/app/api/records/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRecords, createRecord } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const records = await getRecords(session.user.id);
  return NextResponse.json(records);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const record = await createRecord(session.user.id, body);
  return NextResponse.json(record, { status: 201 });
}


// ================================================================
// [3] src/app/api/records/[id]/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateRecord, deleteRecord } from "@/lib/db";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const record = await updateRecord(Number(params.id), session.user.id, body);
  return NextResponse.json(record);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await deleteRecord(Number(params.id), session.user.id);
  return NextResponse.json({ ok: true });
}


// ================================================================
// [4] src/app/api/autocomplete/route.ts  ⭐ 핵심 신규
//
// 내 기록에서 title / author / venue 를 추출해서
// 검색어(q)와 카테고리(cat)로 필터링 후 반환
//
// 반환 예시:
// [
//   { type: "title",  value: "레미제라블",   thumbnail: "...", category: "musical" },
//   { type: "author", value: "손원평",        thumbnail: null,  category: "book"    },
//   { type: "venue",  value: "예술의전당",    thumbnail: null,  category: "musical" },
// ]
// ================================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q   = (searchParams.get("q") ?? "").trim();
  const cat = searchParams.get("cat") ?? ""; // 카테고리 필터 (없으면 전체)

  if (!q) return NextResponse.json([]);

  const userId = session.user.id;
  const pattern = `%${q}%`;

  // 내 기록에서 title / author / venue 를 각각 검색
  // UNION으로 묶어서 type 태그 붙여서 반환
  const rows = await sql`
    SELECT
      'title'     AS type,
      title       AS value,
      thumbnail,
      author,
      venue,
      category,
      MAX(created_at) AS last_used
    FROM records
    WHERE user_id = ${userId}
      AND title ILIKE ${pattern}
      ${cat ? sql`AND category = ${cat}` : sql``}
    GROUP BY title, thumbnail, author, venue, category

    UNION

    SELECT
      'author'    AS type,
      author      AS value,
      NULL        AS thumbnail,
      NULL        AS author,
      NULL        AS venue,
      category,
      MAX(created_at) AS last_used
    FROM records
    WHERE user_id = ${userId}
      AND author IS NOT NULL
      AND author != ''
      AND author ILIKE ${pattern}
      ${cat ? sql`AND category = ${cat}` : sql``}
    GROUP BY author, category

    UNION

    SELECT
      'venue'     AS type,
      venue       AS value,
      NULL        AS thumbnail,
      NULL        AS author,
      NULL        AS venue,
      category,
      MAX(created_at) AS last_used
    FROM records
    WHERE user_id = ${userId}
      AND venue IS NOT NULL
      AND venue != ''
      AND venue ILIKE ${pattern}
      ${cat ? sql`AND category = ${cat}` : sql``}
    GROUP BY venue, category

    ORDER BY last_used DESC
    LIMIT 10
  `;

  return NextResponse.json(rows);
}


// ================================================================
// [5] src/app/api/search/books/route.ts  — Google Books API
// ================================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes` +
      `?q=${encodeURIComponent(q)}&maxResults=10&langRestrict=ko` +
      `&key=${process.env.GOOGLE_BOOKS_API_KEY}`
  );
  const data = await res.json();

  return NextResponse.json(
    (data.items ?? []).map((item: any) => ({
      id: item.id,
      title: item.volumeInfo.title,
      author: item.volumeInfo.authors?.join(", ") ?? "",
      thumbnail: item.volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") ?? null,
      publishedDate: item.volumeInfo.publishedDate ?? "",
      publisher: item.volumeInfo.publisher ?? "",
    }))
  );
}


// ================================================================
// [6] src/app/api/search/movies/route.ts  — TMDB API
// ================================================================
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);

  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&language=ko-KR&page=1`,
    { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
  );
  const data = await res.json();

  return NextResponse.json(
    (data.results ?? []).slice(0, 10).map((m: any) => ({
      id: m.id,
      title: m.title,
      author: m.release_date?.slice(0, 4) ?? "",
      thumbnail: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
      publishedDate: m.release_date ?? "",
    }))
  );
}
