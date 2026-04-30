// ================================================================
// [5] src/app/api/search/movies/route.ts
// ================================================================
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
 
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json([]);
 
  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie` +
      `?query=${encodeURIComponent(q)}&language=ko-KR&page=1`,
    { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
  );
  const data = await res.json();
 
  return NextResponse.json(
    (data.results ?? []).slice(0, 10).map((m: any) => ({
      id: m.id,
      title: m.title,
      author: m.release_date?.slice(0, 4) ?? "",
      thumbnail: m.poster_path
        ? `https://image.tmdb.org/t/p/w200${m.poster_path}`
        : null,
      publishedDate: m.release_date ?? "",
    }))
  );
}