// src/app/api/tmdb/ott-list/route.ts
//
// 수동 지정 칩에 쓸 국내 주요 OTT 8곳의 실제 로고를 TMDB에서 가져온다.
// TMDB의 movie/tv watch-providers 목록 API는 프론트에서 직접 부르기엔 무거우니
// 서버에서 한 번 걸러서 우리가 쓸 8개만 돌려준다.
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { OTT_PRESET_NAMES } from "@/lib/ott-priority";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `https://api.themoviedb.org/3/watch/providers/movie?watch_region=KR`,
    {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: 86400 }, // TMDB API 응답 자체를 서버 데이터 캐시에 24시간 저장
    }
  );
  if (!res.ok) return NextResponse.json({ providers: [] });

  const data = await res.json();
  const all: { provider_name: string; logo_path: string }[] = data.results ?? [];

  const providers = OTT_PRESET_NAMES.map(preset => {
    const n = preset.match;
    const found = all.find(p => n.some(m => p.provider_name.toLowerCase().includes(m)));
    return { name: preset.name, logo_path: found?.logo_path ?? null };
  });

  return NextResponse.json(
    { providers },
    {
      headers: {
        // 인증된 사용자 본인의 브라우저에서만 24시간 동안 재요청 없이 캐시 재사용
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=43200",
      },
    }
  );
}
