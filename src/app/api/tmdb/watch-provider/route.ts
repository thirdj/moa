// src/app/api/tmdb/watch-provider/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { bestProvider } from "@/lib/ott-priority";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // "movie" | "tv"
  const id = searchParams.get("id");
  if ((type !== "movie" && type !== "tv") || !id)
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });

  const res = await fetch(
    `https://api.themoviedb.org/3/${type}/${id}/watch/providers`,
    { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
  );
  if (!res.ok) return NextResponse.json({ provider: null });

  const data = await res.json();
  const kr = data.results?.KR;
  if (!kr) return NextResponse.json({ provider: null });

  // 구독형(flatrate) 우선, 없으면 광고형/무료 순으로 폴백
  const candidates = kr.flatrate ?? kr.ads ?? kr.free ?? [];
  const top = bestProvider(candidates);

  return NextResponse.json({
    provider: top ? { name: top.provider_name, logo_path: top.logo_path } : null,
  });
}
