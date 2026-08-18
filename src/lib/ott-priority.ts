// src/lib/ott-priority.ts
//
// 국내 인지도 기준 OTT 우선순위 + 프리셋 정의. 숫자가 낮을수록(=배열 앞쪽) 인지도 높음.
// name: 앱에서 보여줄 한글 이름
// color: 로고를 못 가져왔을 때 대체 뱃지 색상
// match: TMDB provider_name(영문)과 매칭하기 위한 소문자 키워드
export const OTT_PRESET_NAMES = [
  { name:"넷플릭스",     color:"#E50914", match:["netflix"] },
  { name:"디즈니+",       color:"#113CCF", match:["disney"] },
  { name:"웨이브",        color:"#1E1548", match:["wavve"] },
  { name:"티빙",          color:"#FF0558", match:["tving"] },
  { name:"쿠팡플레이",    color:"#1A6DFF", match:["coupang"] },
  { name:"애플TV+",       color:"#000000", match:["apple tv"] },
  { name:"왓챠",          color:"#FF0558", match:["watcha"] },
  { name:"프라임비디오",  color:"#00A8E1", match:["prime video", "amazon"] },
];

function normalize(name: string) {
  return name.toLowerCase().replace(/[+＋]/g, " plus").replace(/\s+/g, " ").trim();
}

function priorityOf(name: string) {
  const n = normalize(name);
  const idx = OTT_PRESET_NAMES.findIndex(p => p.match.some(m => n.includes(m)));
  return idx === -1 ? 999 : idx;
}

export type TmdbProvider = { provider_id: number; provider_name: string; logo_path: string };

// 여러 OTT 중 인지도가 가장 높은 1개를 고른다.
export function bestProvider(providers: TmdbProvider[]): TmdbProvider | null {
  if (!providers?.length) return null;
  return [...providers].sort((a, b) => priorityOf(a.provider_name) - priorityOf(b.provider_name))[0];
}
