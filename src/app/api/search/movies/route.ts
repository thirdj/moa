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
 
  const [movieRes, tvRes] = await Promise.all([
    fetch(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(q)}&language=ko-KR&page=1`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    ),
    fetch(
      `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(q)}&language=ko-KR&page=1`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    ),
  ]);
 
  const [movieData, tvData] = await Promise.all([
    movieRes.json(),
    tvRes.json(),
  ]);
 
  const all = [
    ...(movieData.results ?? []).slice(0, 6).map((m: any) => ({
      ...m, _type:"영화", _title:m.title, _date:m.release_date,
    })),
    ...(tvData.results ?? []).slice(0, 6).map((t: any) => ({
      ...t, _type:"TV 시리즈", _title:t.name, _date:t.first_air_date,
    })),
  ]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 10)
    .map((item: any) => ({
      id: `${item._type === "영화" ? "movie" : "tv"}-${item.id}`,
      title: item._title,
      author: item._date?.slice(0, 4) ?? "",
      thumbnail: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : null,
      publishedDate: item._date ?? "",
      description: item._type,
    }));
 
  return NextResponse.json(all);
}