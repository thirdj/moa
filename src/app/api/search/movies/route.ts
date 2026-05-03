// src/app/api/search/movies/route.ts
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

  // 영화 + TV 시리즈 동시 검색
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

  const movies = (movieData.results ?? []).slice(0, 6).map((m: any) => ({
    id: `movie-${m.id}`,
    title: m.title,
    author: m.release_date?.slice(0, 4) ?? "",
    thumbnail: m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : null,
    publishedDate: m.release_date ?? "",
    description: "영화",
  }));

  const tvShows = (tvData.results ?? []).slice(0, 6).map((t: any) => ({
    id: `tv-${t.id}`,
    title: t.name,
    author: t.first_air_date?.slice(0, 4) ?? "",
    thumbnail: t.poster_path ? `https://image.tmdb.org/t/p/w200${t.poster_path}` : null,
    publishedDate: t.first_air_date ?? "",
    description: "TV 시리즈",
  }));

  // 영화+TV 합치고 인기순 정렬
  const all = [
    ...(movieData.results ?? []).slice(0, 6).map((m: any) => ({ ...m, _type: "영화", _title: m.title, _date: m.release_date })),
    ...(tvData.results ?? []).slice(0, 6).map((t: any) => ({ ...t, _type: "TV 시리즈", _title: t.name, _date: t.first_air_date })),
  ]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, 10)
    .map((item: any) => ({
      id: `${item._type === "영화" ? "movie" : "tv"}-${item.id}`,
      title: item._title,
      author: item._date?.slice(0, 4) ?? "",
      thumbnail: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : null,
      publishedDate: item._date ?? "",
      description: item._type, // "영화" or "TV 시리즈" 표시용
    }));

  return NextResponse.json(all);
}