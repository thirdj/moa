// src/lib/ott-priority.ts
//
// 국내 인지도 기준 OTT 우선순위. 숫자가 낮을수록 우선(=더 유명함).
// TMDB의 provider_id는 서비스마다 검증이 어려워, provider_name을 정규화해서
// 매칭하는 방식을 사용합니다. 순위를 바꾸고 싶으면 이 배열 순서만 조정하면 됩니다.
const PRIORITY_NAMES = [
  "netflix",
  "disney plus",
  "wavve",
  "tving",
  "coupang play",
  "apple tv",
  "watcha",
  "amazon prime video",
];

function normalize(name: string) {
  return name.toLowerCase().replace(/[+＋]/g, " plus").replace(/\s+/g, " ").trim();
}

function priorityOf(name: string) {
  const n = normalize(name);
  const idx = PRIORITY_NAMES.findIndex(p => n.includes(p));
  return idx === -1 ? 999 : idx;
}

export type TmdbProvider = { provider_id: number; provider_name: string; logo_path: string };

// 여러 OTT 중 인지도가 가장 높은 1개를 고른다.
export function bestProvider(providers: TmdbProvider[]): TmdbProvider | null {
  if (!providers?.length) return null;
  return [...providers].sort((a, b) => priorityOf(a.provider_name) - priorityOf(b.provider_name))[0];
}
