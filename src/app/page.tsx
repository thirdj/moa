"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────
interface CultureRecord {
  id: number; category: string; title: string; date: string;
  rating: number; review?: string; thumbnail?: string; author?: string; venue?: string;
  date_start?: string; date_end?: string; finished?: boolean;
}
interface Suggestion {
  id: string | number; source: "history" | "api"; type?: "title" | "author" | "venue";
  title: string; author?: string; venue?: string; thumbnail?: string;
  publishedDate?: string; category?: string;
}

// ── Design tokens — Modern Minimal ────────────────────────────────
const F = {
  bg:      "#FFFFFF",
  white:   "#FFFFFF",
  border:  "#F2F2F2",
  text:    "#111111",
  textSub: "#555555",
  textMut: "#999999",
  accent:  "#111111",
  accentColor: "#7B61FF",
  shadow:  "0 1px 4px rgba(0,0,0,0.06)",
  shadowMd:"0 4px 16px rgba(0,0,0,0.08)",
};

// ── Categories ─────────────────────────────────────────────────────
const CATS = [
  { id:"book",       label:"책",          emoji:"📚", color:"#7B61FF" },
  { id:"movie",      label:"영화",        emoji:"🎬", color:"#FF6B6B" },
  { id:"exhibition", label:"전시",        emoji:"🖼️", color:"#FFB347" },
  { id:"musical",    label:"공연",        emoji:"🎭", color:"#FF69B4" },
  { id:"concert",    label:"콘서트",      emoji:"🎵", color:"#2DCBA0" },
];
const catOf = (id: string) => CATS.find(c => c.id === id) ?? CATS[0];

// ── Helpers ────────────────────────────────────────────────────────
function Stars({ v, onChange, size = 16 }: { v: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display:"flex", gap:1 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize:size, color: s<=(hover||v) ? "#FFB800" : "#E5E5F0", cursor:onChange?"pointer":"default", userSelect:"none", lineHeight:1, transition:"color 0.1s" }}>
          ★
        </span>
      ))}
    </div>
  );
}

// DB에서 오는 날짜가 "2025-05-19T00:00:00.000Z" 같은 UTC ISO일 때
// new Date()로 파싱하면 KST(+9h)에서 하루 밀림 → 항상 문자열 앞 10자리만 사용
function safeDate(d: string) {
  if (!d) return "";
  return d.slice(0, 10); // "YYYY-MM-DD" 만 추출, 절대 Date 객체로 파싱하지 않음
}

function formatDate(d: string) {
  if (!d) return "";
  const s = safeDate(d);
  const [y, m, day] = s.split("-");
  return `${y}.${m}.${day}`;
}

function todayStr() {
  const d = new Date();
  // 로컬 시간 기준으로 생성 (UTC 변환 없음)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getDaysInMonth(y: number, m: number) { return new Date(y,m+1,0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y,m,1).getDay(); }

// ── Input style ────────────────────────────────────────────────────
const flatInput: React.CSSProperties = {
  width:"100%", padding:"13px 16px", borderRadius:14,
  border:`1.5px solid ${F.border}`, outline:"none", fontFamily:"inherit",
  background:F.bg, boxSizing:"border-box",
  fontSize:16, color:F.text,
};

// ── 커스텀 DatePicker ─────────────────────────────────────────────
// 네이티브 picker 대신 인라인 달력 드롭다운
// max는 오늘로 고정, 미래 날짜 선택 불가
function DatePicker({ value, onChange, min, placeholder = "날짜 선택", disabled = false }: {
  value: string; onChange: (v: string) => void;
  min?: string; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = todayStr();

  const parseLocal = (v: string) => {
    if (!v) return new Date();
    const s = safeDate(v); // "YYYY-MM-DD" 만 사용
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d); // 로컬 시간 기준 생성
  };
  const parsed = parseLocal(value);
  const [calY, setCalY] = useState(parsed.getFullYear());
  const [calM, setCalM] = useState(parsed.getMonth());

  // value가 외부에서 바뀌면 달력 월도 동기화
  useEffect(() => {
    if (value) {
      const p = parseLocal(value);
      setCalY(p.getFullYear());
      setCalM(p.getMonth());
    }
  }, [value]);

  const days = getDaysInMonth(calY, calM);
  const first = getFirstDay(calY, calM);
  const dateStr = (d: number) =>
    `${calY}-${String(calM+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  function isDisabled(d: number) {
    const ds = dateStr(d);
    if (ds > today) return true;          // 미래 막기
    if (min && ds < min) return true;     // min 이전 막기
    return false;
  }

  function select(d: number) {
    if (isDisabled(d)) return;
    onChange(dateStr(d));
    setOpen(false);
  }

  function prevMonth() {
    if (calM === 0) { setCalY(y => y-1); setCalM(11); }
    else setCalM(m => m-1);
  }
  function nextMonth() {
    const nextDs = `${calM===11?calY+1:calY}-${String((calM===11?0:calM+1)+1).padStart(2,"0")}-01`;
    if (nextDs > today) return; // 미래 월로 넘어가지 않게
    if (calM === 11) { setCalY(y => y+1); setCalM(0); }
    else setCalM(m => m+1);
  }

  return (
    <div style={{ position:"relative" }}>
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => { if(!disabled) setOpen(o => !o); }}
        style={{ ...flatInput as any, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:disabled?"default":"pointer", opacity:disabled?0.35:1, border:`1.5px solid ${open ? F.accentColor : F.border}`, background:F.bg, textAlign:"left" }}>
        <span style={{ color: value ? F.text : F.textMut, fontSize:15 }}>
          {value ? formatDate(value) : placeholder}
        </span>
        <span style={{ fontSize:16, color:F.textMut }}>📅</span>
      </button>

      {/* 인라인 달력 */}
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, right:0, background:F.white, borderRadius:16, boxShadow:F.shadowMd, border:`1px solid ${F.border}`, zIndex:100, padding:"12px 10px", overflow:"hidden" }}>
          {/* 월 네비 */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, padding:"0 4px" }}>
            <button type="button" onClick={prevMonth}
              style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:F.textSub, padding:"4px 8px" }}>‹</button>
            <span style={{ fontSize:14, fontWeight:700, color:F.text }}>{calY}년 {calM+1}월</span>
            <button type="button" onClick={nextMonth}
              style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:F.textSub, padding:"4px 8px",
                opacity: `${calY}-${String(calM+2).padStart(2,"0")}-01` > today ? 0.3 : 1 }}>›</button>
          </div>

          {/* 요일 헤더 */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
            {["일","월","화","수","목","금","토"].map((d,i) => (
              <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:i===0?"#FF6B6B":i===6?F.accentColor:F.textMut, padding:"2px 0" }}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"2px 0" }}>
            {Array.from({length:first}).map((_,i) => <div key={`e-${i}`} />)}
            {Array.from({length:days}).map((_,i) => {
              const d = i+1;
              const ds = dateStr(d);
              const sel = ds === value;
              const dis = isDisabled(d);
              const isToday = ds === today;
              return (
                <button key={d} type="button" onClick={() => select(d)} disabled={dis}
                  style={{ width:"100%", aspectRatio:"1", borderRadius:"50%", border:"none", cursor:dis?"default":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:sel||isToday?700:400, background:sel?F.accentColor:isToday?`${F.accentColor}18`:"transparent", color:sel?"#fff":dis?F.textMut:isToday?F.accentColor:F.text, opacity:dis?0.35:1, transition:"all 0.1s" }}>
                  {d}
                </button>
              );
            })}
          </div>

          {/* 오늘 바로가기 */}
          <div style={{ textAlign:"center", marginTop:8, paddingTop:8, borderTop:`1px solid ${F.border}` }}>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}
              style={{ background:"none", border:"none", fontSize:12, color:F.accentColor, cursor:"pointer", fontWeight:600 }}>오늘</button>
          </div>
        </div>
      )}
    </div>
  );
}
function ImageUrlInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [input, setInput] = useState(value);
  const [status, setStatus] = useState<"idle"|"loading"|"ok"|"warn">("idle");

  useEffect(() => { setInput(value); if(value) setStatus("ok"); else setStatus("idle"); }, [value]);

  function handleBlur() {
    const url = input.trim();
    if (!url) { onChange(""); setStatus("idle"); return; }
    try { new URL(url); } catch { setStatus("warn"); onChange(url); return; }
    setStatus("loading");
    const img = new Image();
    const t = setTimeout(() => { onChange(url); setStatus("warn"); }, 3000);
    img.onload = () => { clearTimeout(t); onChange(url); setStatus("ok"); };
    img.onerror = () => { clearTimeout(t); onChange(url); setStatus("warn"); };
    img.src = url;
  }

  return (
    <div>
      <div style={{ position:"relative" }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onBlur={handleBlur}
          placeholder="포스터 이미지 URL 붙여넣기"
          style={{ ...flatInput, paddingRight:40 }} />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>
          {status==="loading"?"⏳":status==="ok"?"✅":status==="warn"?"⚠️":"🔗"}
        </span>
      </div>
      {status==="ok" && value && (
        <div style={{ marginTop:10, position:"relative", display:"inline-block" }}>
          <img src={value} style={{ height:80, borderRadius:10, objectFit:"cover", boxShadow:F.shadow }} onError={e=>{(e.target as HTMLImageElement).style.display="none";}} />
          <button onClick={()=>{onChange("");setInput("");setStatus("idle");}}
            style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:"#FF6B6B", border:`2px solid ${F.white}`, color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
      )}
      <p style={{ fontSize:11, color:F.textMut, margin:"6px 0 0", lineHeight:1.5 }}>나무위키·공식사이트에서 우클릭 → 이미지 주소 복사</p>
    </div>
  );
}

// ── Autocomplete ───────────────────────────────────────────────────
function useAutocomplete(query: string, category: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const cat = catOf(category);
    if (!query.trim() || !enabled) { setSuggestions([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results: Suggestion[] = [];
        const hr = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}&cat=${category}`);
        if (hr.ok) {
          const d: any[] = await hr.json();
          d.forEach(r => results.push({ id:`h-${r.type}-${r.value}`, source:"history", type:r.type, title:r.value, author:r.author, venue:r.venue, thumbnail:r.thumbnail, category:r.category }));
        }
        if (cat.id==="book" || cat.id==="movie") {
          const ep = cat.id==="book" ? "/api/search/books" : "/api/search/movies";
          const ar = await fetch(`${ep}?q=${encodeURIComponent(query)}`);
          if (ar.ok) {
            const d: any[] = await ar.json();
            d.slice(0,6).forEach(i => results.push({ ...i, source:"api" as const }));
          }
        }
        setSuggestions(results);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    }, 350);
  }, [query, category, enabled]);

  return { suggestions, loading, clear: () => setSuggestions([]) };
}

// ── Main ───────────────────────────────────────────────────────────
const makeEmpty = () => ({ category:"", title:"", date:todayStr(), rating:0, review:"", thumbnail:"", author:"", venue:"", date_start:"", date_end:"", finished:false });

export default function Home() {
  const { data:session, status } = useSession();
  const isLoading = status === "loading";
  const router = useRouter();
  const [records, setRecords] = useState<CultureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home"|"add"|"detail"|"category"|"calendar"|"more">("home");
  const [prevView, setPrevView] = useState<"home"|"category"|"calendar">("home");
  const [selected, setSelected] = useState<CultureRecord|null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [sortBy, setSortBy] = useState<"latest"|"date"|"rating">("latest");
  const [form, setForm] = useState(makeEmpty);
  const [editId, setEditId] = useState<number|null>(null);
  const [saving, setSaving] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string>(todayStr());
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [finishRating, setFinishRating] = useState(0);
  const homeScrollRef = useRef<HTMLDivElement>(null);

  const { suggestions, loading:acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  useEffect(() => { if(status === "unauthenticated") router.push("/login"); }, [status]);
  useEffect(() => { if(status === "authenticated") fetchRecords(); }, [status]);

  // ── 브라우저 히스토리 연동 — 스와이프 뒤로가기 지원 ──────────────
  // view가 바뀔 때마다 히스토리에 쌓아서 스와이프/뒤로가기가 앱 내 이전 화면으로 이동
  const isPopState = useRef(false);

  function navigateTo(next: typeof view) {
    if (next === view) return;
    // 히스토리에 현재 view 상태 push
    window.history.pushState({ view: next }, "", "");
    setView(next);
  }

  useEffect(() => {
    // 초기 히스토리 엔트리 설정
    window.history.replaceState({ view: "home" }, "", "");

    function handlePopState(e: PopStateEvent) {
      isPopState.current = true;
      const prevViewFromHistory = e.state?.view as typeof view | undefined;

      if (!prevViewFromHistory || prevViewFromHistory === "home") {
        // 히스토리 최하단 — home으로
        setView("home");
      } else {
        setView(prevViewFromHistory);
      }
      isPopState.current = false;
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // navigateTo를 쓰지 않는 setView 직접 호출들을 위한 래퍼
  // view 변경 시 히스토리 동기화 (popstate로 인한 변경은 제외)
  useEffect(() => {
    if (!isPopState.current && view !== "home") {
      // 이미 navigateTo에서 push했거나, 직접 setView 호출한 경우 대비
    }
  }, [view]);

  async function fetchRecords() {
    setLoading(true);
    try { const r = await fetch("/api/records"); if(r.ok) setRecords(await r.json()); } catch(e) { console.error(e); }
    setLoading(false);
  }

  // 날짜 문자열을 API로 보낼 때 UTC 변환으로 하루 밀리는 것을 방지
  function fixDateForApi(d: string) {
    if (!d) return d;
    if (d.length === 10) return d + "T12:00:00";
    return d;
  }

  async function save() {
    if (!form.title || !form.category) return;
    if (form.category !== "book" && !form.rating) return;
    setSaving(true);
    const payload = {
      ...form,
      date:       fixDateForApi(form.date),
      date_start: fixDateForApi(form.date_start),
      date_end:   fixDateForApi(form.date_end),
    };
    try {
      if (editId) {
        // 수정: API 응답으로 로컬 state 직접 업데이트 (재조회 없음)
        const res = await fetch(`/api/records/${editId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        if (res.ok) {
          const updated = await res.json();
          setRecords(prev => prev.map(r => r.id === editId ? updated : r));
          setSelected(updated);
        }
        reset(); navigateTo("detail");
      } else {
        // 신규: API 응답 레코드를 목록 맨 앞에 추가 (재조회 없음)
        const res = await fetch("/api/records", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        if (res.ok) {
          const created = await res.json();
          setRecords(prev => [created, ...prev]);
        }
        reset(); navigateTo("home");
      }
    } finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm("삭제할까요?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/records/${id}`, { method:"DELETE" });
      setRecords(prev => prev.filter(r => r.id !== id));
      navigateTo(prevView);
    } finally { setDeleting(false); }
  }

  function reset() { setForm(makeEmpty()); setEditId(null); setTitleQuery(""); clear(); setShowSug(false); }

  function openDetail(rec: CultureRecord, from: "home"|"category"|"calendar" = "home") {
    setSelected(rec); setPrevView(from); navigateTo("detail");
  }

  function openEdit(r: CultureRecord) {
    setForm({ category:r.category, title:r.title, date:safeDate(r.date), rating:r.rating, review:r.review??"", thumbnail:r.thumbnail??"", author:r.author??"", venue:r.venue??"", date_start:safeDate(r.date_start??"")||"", date_end:safeDate(r.date_end??"")||"", finished:r.finished??false });
    setTitleQuery(r.title); setEditId(r.id); navigateTo("add");
  }

  function pickSug(s: Suggestion) {
    if (s.source==="history" && s.type==="author") setForm(f => ({ ...f, author:s.title }));
    else if (s.source==="history" && s.type==="venue") setForm(f => ({ ...f, venue:s.title }));
    else { setForm(f => ({ ...f, title:s.title, author:s.author??f.author, thumbnail:s.thumbnail??f.thumbnail, venue:s.venue??f.venue })); setTitleQuery(s.title); }
    clear(); setShowSug(false);
  }

  const filtered = (() => {
    const base = filterCat==="all" ? records : records.filter(r => r.category===filterCat);
    return [...base].sort((a, b) => {
      if (sortBy==="rating") return Number(b.rating) - Number(a.rating);
      if (sortBy==="date") {
        const da = a.date_start || a.date || "";
        const db = b.date_start || b.date || "";
        return db.localeCompare(da);
      }
      // latest = created_at 순 (DB에서 이미 정렬되어 옴)
      return 0;
    });
  })();
  const activeCat = catOf(form.category);
  const canSave = !!form.title && !!form.category && (form.category === "book" || !!form.rating);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const calDateStr = (d: number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d: number) => records.filter(r => r.date?.slice(0,10)===calDateStr(d));
  const selectedDayRecords = records.filter(r => r.date?.slice(0,10)===calSelected);

  if (status === "loading") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:F.bg, color:F.textMut }}>로딩 중...</div>
  );

  // ── 공통 ──────────────────────────────────────────────────────────
  const screenWrap: React.CSSProperties = { flex:1, overflowY:"auto", paddingBottom:110 };
  const sectionLabel: React.CSSProperties = { fontSize:11, fontWeight:700, color:F.textMut, letterSpacing:"0.8px", margin:"0 0 10px", textTransform:"uppercase" };

  function Card({ children, onClick, style }: { children: React.ReactNode; onClick?: ()=>void; style?: React.CSSProperties }) {
    return (
      <div onClick={onClick} style={{ background:F.white, borderRadius:18, boxShadow:F.shadow, border:`1px solid ${F.border}`, padding:"14px", cursor:onClick?"pointer":"default", transition:"transform 0.15s, box-shadow 0.15s", ...style }}
        onMouseEnter={e => { if(onClick) { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow=F.shadowMd; }}}
        onMouseLeave={e => { if(onClick) { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=F.shadow; }}}>
        {children}
      </div>
    );
  }

  function BackBtn() {
    return (
      <button onClick={() => navigateTo(prevView)}
        style={{ display:"flex", alignItems:"center", gap:4, background:F.accentColor, border:"none", borderRadius:10, padding:"7px 14px 7px 10px", cursor:"pointer", fontFamily:"inherit", color:"#fff", fontWeight:700, fontSize:14, boxShadow:"0 2px 8px rgba(123,97,255,0.3)" }}>
        <span style={{ fontSize:20, lineHeight:1 }}>‹</span>
        <span>뒤로</span>
      </button>
    );
  }

  function CatDot({ id }: { id: string }) {
    const c = catOf(id);
    return (
      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:c.color, display:"inline-block", flexShrink:0 }} />
        <span style={{ fontSize:11, color:c.color, fontWeight:700 }}>{c.label}</span>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:F.bg, minHeight:"100vh", display:"flex", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:390, background:F.bg, minHeight:"100vh", display:"flex", flexDirection:"column", position:"relative" }}>

        {/* ══ HOME ══════════════════════════════════════════════════ */}
        {view==="home" && (
          <div ref={homeScrollRef} style={screenWrap}>
            <div style={{ padding:"20px 20px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h1 style={{ fontSize:24, fontWeight:800, color:F.text, margin:0, letterSpacing:-0.5 }}>기록</h1>
              {session?.user?.image && (
                <img src={session.user.image} style={{ width:32, height:32, borderRadius:"50%", border:`1.5px solid ${F.border}` }} />
              )}
            </div>

            {/* 카테고리 필터 */}
            <div style={{ padding:"0 20px 12px", display:"flex", gap:8, overflowX:"auto" }}>
              {[{id:"all",label:"전체"},...CATS].map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  style={{ padding:"5px 14px", borderRadius:20, border:`1px solid ${filterCat===c.id ? F.text : F.border}`, background:filterCat===c.id ? F.text : F.white, color:filterCat===c.id ? "#fff" : F.textSub, fontWeight:filterCat===c.id ? 600 : 400, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0, transition:"all 0.15s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* 정렬 */}
            <div style={{ display:"flex", justifyContent:"flex-end", padding:"0 20px 12px", gap:6 }}>
              {([["latest","최신순"],["date","관람순"],["rating","별점순"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => setSortBy(val)}
                  style={{ padding:"3px 10px", borderRadius:10, border:`1px solid ${sortBy===val ? F.text : F.border}`, background:sortBy===val ? F.text : "transparent", color:sortBy===val ? "#fff" : F.textMut, fontSize:11, fontWeight:sortBy===val ? 600 : 400, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:1 }}>
              {loading ? (
                <div style={{ textAlign:"center", padding:60, color:F.textMut, fontSize:14 }}>불러오는 중...</div>
              ) : records.length===0 ? (
                <div style={{ textAlign:"center", padding:"80px 0" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <p style={{ color:F.textMut, fontSize:14 }}>아직 기록이 없어요</p>
                  <p style={{ color:F.textMut, fontSize:12, marginTop:4, opacity:0.7 }}>+ 버튼으로 첫 기록을 남겨보세요</p>
                </div>
              ) : filtered.length===0 ? (
                <div style={{ textAlign:"center", padding:"80px 0" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🗂️</div>
                  <p style={{ color:F.textMut, fontSize:14 }}>해당 카테고리의 기록이 없어요</p>
                </div>
              ) : filtered.map(rec => {
                const cat = catOf(rec.category);
                return (
                  <div key={rec.id} onClick={() => openDetail(rec, "home")}
                    style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"16px 0", borderBottom:`1px solid ${F.border}`, cursor:"pointer" }}>
                    {/* 썸네일 */}
                    {rec.thumbnail
                      ? <img src={rec.thumbnail} style={{ width:56, height:72, objectFit:"cover", borderRadius:8, flexShrink:0 }} referrerPolicy="no-referrer" />
                      : <div style={{ width:56, height:72, borderRadius:8, background:`${cat.color}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>{cat.emoji}</div>
                    }
                    <div style={{ flex:1, minWidth:0, height:72, display:"flex", flexDirection:"column", justifyContent:"space-between", paddingTop:2, paddingBottom:2 }}>
                      <div>
                        {/* 카테고리 + 날짜 */}
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:11, color:cat.color, fontWeight:600, letterSpacing:0.3 }}>{cat.label.toUpperCase()}</span>
                          <span style={{ fontSize:11, color:F.textMut }}>{formatDate(rec.date)}</span>
                        </div>
                        {/* 제목 */}
                        <p style={{ fontSize:15, fontWeight:700, color:F.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>{rec.title}</p>
                      </div>
                      <div>
                        {/* 별점 + 리뷰 */}
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <Stars v={Number(rec.rating)} size={12} />
                          {rec.review && <span style={{ fontSize:12, color:F.textMut, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.review}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ ADD / EDIT ════════════════════════════════════════════ */}
        {view==="add" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:140 }}>
            {/* 헤더 — 여백 줄임 */}
            <div style={{ display:"flex", alignItems:"center", padding:"16px 20px 14px", borderBottom:`1px solid ${F.border}`, gap:12 }}>
              <button onClick={() => { const wasEdit = !!editId; reset(); navigateTo(wasEdit ? "detail" : "home"); }}
                style={{ display:"flex", alignItems:"center", gap:4, background:F.accentColor, border:"none", borderRadius:10, padding:"7px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:14, fontFamily:"inherit" }}>
                <span style={{ fontSize:20, lineHeight:1 }}>‹</span>
                <span>뒤로</span>
              </button>
              <p style={{ flex:1, fontSize:17, fontWeight:700, textAlign:"center", margin:0, color:F.text }}>{editId ? "기록 수정" : "기록 추가"}</p>
              <div style={{ width:60 }} />
            </div>

            <div style={{ padding:"16px 20px" }}>
              {/* 카테고리 */}
              <p style={sectionLabel}>카테고리 선택</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:20 }}>
                {CATS.map(c => {
                  const isSelected = form.category === c.id;
                  const isDisabled = !!editId && !isSelected; // 수정 중엔 현재 카테고리만 활성
                  return (
                    <button key={c.id}
                      onClick={() => { if(isDisabled) return; setForm(f => ({...f, category:c.id, thumbnail:"", author:""})); setTitleQuery(""); clear(); }}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"10px 4px", borderRadius:16, border:`2px solid ${isSelected ? c.color : F.border}`, background:isSelected ? `${c.color}12` : F.white, cursor:isDisabled?"default":"pointer", fontFamily:"inherit", transition:"all 0.15s", boxShadow:isSelected?"none":F.shadow, opacity:isDisabled?0.35:1 }}>
                      <span style={{ fontSize:22 }}>{c.emoji}</span>
                      <span style={{ fontSize:10, fontWeight:600, color:isSelected ? c.color : F.textMut, textAlign:"center", lineHeight:1.3 }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
              {editId && (
                <p style={{ fontSize:11, color:F.textMut, margin:"-14px 0 16px", display:"flex", alignItems:"center", gap:4 }}>
                  <span>🔒</span> 수정 시 카테고리는 변경할 수 없어요
                </p>
              )}

              {/* 제목 */}
              <p style={sectionLabel}>
                제목 {form.category && <span style={{ color:F.accentColor, textTransform:"none", fontWeight:400, fontSize:10 }}>— {activeCat.id==="book"||activeCat.id==="movie" ? "검색 or 내 기록 자동완성" : "내 기록 자동완성"}</span>}
              </p>
              <div style={{ position:"relative", marginBottom:6 }}>
                <input value={titleQuery}
                  onChange={e => { setTitleQuery(e.target.value); setForm(f => ({...f, title:e.target.value, thumbnail:""})); setShowSug(true); }}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder={form.category ? `${activeCat.emoji} 제목을 입력하세요` : "카테고리를 먼저 선택하세요"}
                  disabled={!form.category}
                  style={{ ...flatInput, paddingRight:40 }}
                />
                {acLoading && <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", width:14, height:14, border:`2px solid ${F.border}`, borderTopColor:F.accentColor, borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />}
              </div>

              {/* 자동완성 드롭다운 */}
              <div style={{ position:"relative", marginBottom: showSug && suggestions.length>0 ? 250 : 0, transition:"margin 0.2s" }}>
                {showSug && suggestions.length>0 && (
                  <div style={{ position:"absolute", top:0, left:0, right:0, background:F.white, borderRadius:16, boxShadow:F.shadowMd, border:`1px solid ${F.border}`, maxHeight:240, overflowY:"auto", zIndex:50 }}>
                    {suggestions.filter(s => s.source==="history").length>0 && <>
                      <div style={{ padding:"8px 14px 2px", fontSize:10, color:F.accentColor, fontWeight:700, letterSpacing:1 }}>내 기록</div>
                      {suggestions.filter(s => s.source==="history").map(s => (
                        <div key={s.id} onClick={() => pickSug(s)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:`1px solid ${F.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background=`${F.accentColor}08`)}
                          onMouseLeave={e => (e.currentTarget.style.background="")}>
                          <span style={{ fontSize:15 }}>{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                          <span style={{ fontSize:13, color:F.text, fontWeight:500 }}>{s.title}</span>
                          <span style={{ marginLeft:"auto", fontSize:10, color:F.accentColor, background:`${F.accentColor}12`, padding:"2px 6px", borderRadius:8, flexShrink:0 }}>내 기록</span>
                        </div>
                      ))}
                    </>}
                    {suggestions.filter(s => s.source==="api").length>0 && <>
                      <div style={{ padding:"8px 14px 2px", fontSize:10, color:"#6BB5EF", fontWeight:700, letterSpacing:1 }}>검색 결과</div>
                      {suggestions.filter(s => s.source==="api").map(s => (
                        <div key={s.id} onClick={() => pickSug(s)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:`1px solid ${F.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background="#F0F7FF")}
                          onMouseLeave={e => (e.currentTarget.style.background="")}>
                          {s.thumbnail
                            ? <img src={s.thumbnail} style={{ width:30, height:42, objectFit:"cover", borderRadius:6, flexShrink:0 }} referrerPolicy="no-referrer" />
                            : <div style={{ width:30, height:42, borderRadius:6, background:F.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{activeCat.emoji}</div>
                          }
                          <div style={{ minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:600, color:F.text, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</p>
                            {s.author && <p style={{ fontSize:11, color:F.textMut, margin:0 }}>
                              {(s as any).description && <span style={{ color:F.accentColor, marginRight:4 }}>[{(s as any).description}]</span>}
                              {s.author}{s.publishedDate ? ` · ${s.publishedDate.slice(0,4)}` : ""}
                            </p>}
                          </div>
                        </div>
                      ))}
                    </>}
                  </div>
                )}
              </div>

              {/* 선택 프리뷰 */}
              {form.thumbnail && !showSug && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:`${F.accentColor}08`, borderRadius:14, marginBottom:14, border:`1.5px solid ${F.accentColor}25` }}>
                  <img src={form.thumbnail} style={{ width:34, height:48, objectFit:"cover", borderRadius:8 }} referrerPolicy="no-referrer" />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:F.text }}>{form.title}</p>
                    {form.author && <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{form.author}</p>}
                  </div>
                  <button onClick={() => setForm(f => ({...f, thumbnail:"", author:""}))} style={{ background:"none", border:"none", color:F.textMut, cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
                </div>
              )}

              {/* 책 — 읽기 시작일만 입력 */}
              {form.category==="book" ? (
                <>
                  <p style={sectionLabel}>읽기 시작일 <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(선택)</span></p>
                  <div style={{ marginBottom:18 }}>
                    <DatePicker
                      value={form.date_start}
                      onChange={v => setForm(f => ({ ...f, date_start:v, date:v||f.date }))}
                      placeholder="읽기 시작한 날"
                    />
                  </div>
                </>
              ) : (
                /* 책 외 — 커스텀 달력 */
                <>
                  <p style={{ ...sectionLabel, margin:"4px 0 10px" }}>날짜</p>
                  <div style={{ marginBottom:18 }}>
                    <DatePicker
                      value={form.date}
                      onChange={v => setForm(f => ({ ...f, date:v }))}
                      placeholder="날짜 선택"
                    />
                  </div>
                </>
              )}

              {/* 장소 — 책 제외 */}
              {form.category && form.category!=="book" && (
                <>
                  <p style={sectionLabel}>장소 <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(선택)</span></p>
                  <input value={form.venue} onChange={e => setForm(f => ({...f, venue:e.target.value}))}
                    placeholder={
                      form.category==="movie"      ? "예) CGV 강남, 메가박스 코엑스" :
                      form.category==="exhibition" ? "예) 국립현대미술관, 예술의전당" :
                      form.category==="musical"    ? "예) 블루스퀘어 신한카드홀" :
                      form.category==="concert"    ? "예) 올림픽공원 KSPO돔" : "어디서 봤나요?"
                    }
                    style={{ ...flatInput, marginBottom:18 }}
                  />
                </>
              )}

              {/* 별점 */}
              <p style={sectionLabel}>별점</p>
              <div style={{ marginBottom:18 }}>
                <Stars v={form.rating} onChange={v => setForm(f => ({...f, rating:v}))} size={34} />
              </div>

              {/* 한줄 리뷰 */}
              <p style={sectionLabel}>한 줄 리뷰 <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(선택)</span></p>
              <textarea value={form.review} onChange={e => setForm(f => ({...f, review:e.target.value.slice(0,100)}))}
                placeholder="한 줄로 느낀 점을 남겨보세요." maxLength={100} rows={3}
                style={{ ...flatInput, resize:"none", lineHeight:1.7, marginBottom:4 }} />
              <p style={{ textAlign:"right", fontSize:11, color:F.textMut, margin:"0 0 18px" }}>{form.review.length}/100</p>

              {/* 이미지 URL — 전시/공연/콘서트만 */}
              {form.category && !["book","movie"].includes(form.category) && (
                <>
                  <p style={sectionLabel}>이미지 <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(선택)</span></p>
                  <ImageUrlInput value={form.thumbnail} onChange={url => setForm(f => ({...f, thumbnail:url}))} />
                </>
              )}
            </div>

            {/* 저장 버튼 */}
            <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, padding:"10px 20px 24px", background:F.bg, borderTop:`1px solid ${F.border}`, zIndex:20 }}>
              <button onClick={save} disabled={!canSave||saving}
                style={{ width:"100%", padding:"15px", borderRadius:16, border:"none", background:canSave?F.accentColor:"#E5E5F0", color:canSave?"#fff":F.textMut, fontSize:16, fontWeight:700, cursor:canSave?"pointer":"default", fontFamily:"inherit", boxShadow:canSave?"0 4px 16px rgba(123,97,255,0.35)":"none", transition:"all 0.2s" }}>
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════ */}
        {view==="detail" && selected && (() => {
          const cat = catOf(selected.category);
          return (
            <div style={{ flex:1, overflowY:"auto", paddingBottom:90, background:F.white }}>

              {/* 포스터 */}
              <div style={{ position:"relative", width:"100%", aspectRatio:"2/3", background:cat.color+"18" }}>
                {selected.thumbnail
                  ? <img src={selected.thumbnail} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} referrerPolicy="no-referrer" />
                  : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:80 }}>{cat.emoji}</div>
                }
                {/* 뒤로가기 */}
                <button onClick={() => navigateTo(prevView)}
                  style={{ position:"absolute", top:16, left:16, zIndex:10, width:36, height:36, borderRadius:"50%",
                    background:"rgba(255,255,255,0.88)", backdropFilter:"blur(8px)", cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    border:"none", boxShadow:"0 2px 8px rgba(0,0,0,0.15)", WebkitTapHighlightColor:"transparent" }}>
                  <span style={{ fontSize:20, color:F.text, lineHeight:1 }}>‹</span>
                </button>
              </div>

              {/* 카테고리 + 날짜 */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px 6px" }}>
                <span style={{ fontSize:11, color:cat.color, fontWeight:700, letterSpacing:0.3, background:cat.color+"12", padding:"4px 10px", borderRadius:20 }}>{cat.emoji} {cat.label}</span>
                <span style={{ fontSize:12, color:F.textMut }}>{selected.category==="book" ? (selected.date_start ? formatDate(selected.date_start) : formatDate(selected.date)) : formatDate(selected.date)}</span>
              </div>

              {/* 제목 */}
              <div style={{ padding:"0 20px 10px" }}>
                {(selected.category==="book" || selected.category==="movie") ? (
                  <a href={selected.category==="book" ? `https://www.google.com/search?q=${encodeURIComponent(selected.title+" "+(selected.author??""))}&tbm=bks` : `https://www.themoviedb.org/search?query=${encodeURIComponent(selected.title)}`}
                    target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                    <h1 style={{ fontSize:22, fontWeight:800, color:F.text, margin:"0 0 2px", lineHeight:1.25, wordBreak:"keep-all" }}>{selected.title} <span style={{ fontSize:14, color:F.accentColor }}>↗</span></h1>
                    <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{selected.category==="book" ? "Google Books에서 보기" : "TMDB에서 보기"}</p>
                  </a>
                ) : (
                  <h1 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0, lineHeight:1.25, wordBreak:"keep-all" }}>{selected.title}</h1>
                )}
              </div>

              {/* 별점 */}
              <div style={{ padding:"0 20px 14px", display:"flex", alignItems:"center", gap:8 }}>
                <Stars v={Number(selected.rating)} size={20} />
                <span style={{ fontSize:16, fontWeight:700, color:F.text }}>{Number(selected.rating).toFixed(1)}</span>
              </div>

              <div style={{ height:1, background:F.border }} />

              {/* 메타 정보 */}
              <div style={{ padding:"14px 20px", display:"flex", flexDirection:"column", gap:10 }}>
                {selected.author && <div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:13, color:F.textMut }}>👤</span><span style={{ fontSize:14, color:F.textSub }}>{selected.author}</span></div>}
                {selected.venue  && <div style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:13, color:F.textMut }}>📍</span><span style={{ fontSize:14, color:F.textSub }}>{selected.venue}</span></div>}
                {selected.category==="book" && selected.date_start && (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:13, color:F.textMut }}>📖</span>
                    <span style={{ fontSize:14, color:F.textSub }}>{formatDate(selected.date_start)}{(selected.finished||selected.date_end) && <> → {selected.date_end ? formatDate(selected.date_end) : "읽는 중"}</>}</span>
                  </div>
                )}
                {selected.category==="book" && (
                  selected.finished
                    ? <span style={{ fontSize:12, color:F.accentColor, fontWeight:700, background:F.accentColor+"12", padding:"4px 12px", borderRadius:20, width:"fit-content" }}>✓ 완독</span>
                    : selected.date_start
                      ? <span style={{ fontSize:12, color:"#FF9800", fontWeight:700, background:"#FFF3E0", padding:"4px 12px", borderRadius:20, width:"fit-content" }}>📚 읽는 중</span>
                      : null
                )}
              </div>

              {/* 리뷰 */}
              {selected.review && <>
                <div style={{ height:1, background:F.border }} />
                <div style={{ padding:"14px 20px" }}>
                  <p style={{ fontSize:11, fontWeight:700, color:F.textMut, margin:"0 0 6px", letterSpacing:0.5, textTransform:"uppercase" }}>한 줄 리뷰</p>
                  <p style={{ fontSize:15, color:F.text, lineHeight:1.7, margin:0 }}>"{selected.review}"</p>
                </div>
              </>}

              {/* 완독 버튼 */}
              {selected.category==="book" && !selected.finished && <>
                <div style={{ height:1, background:F.border }} />
                <div style={{ padding:"14px 20px" }}>
                  <button onClick={() => { setFinishRating(Number(selected.rating) || 0); setShowRatingModal(true); }}
                    style={{ width:"100%", padding:"13px", borderRadius:12, border:`1.5px solid ${F.accentColor}`, background:"#fff", color:F.accentColor, fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}
                    onMouseEnter={e=>{e.currentTarget.style.background=F.accentColor;e.currentTarget.style.color="#fff";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="#fff";e.currentTarget.style.color=F.accentColor;}}>
                    📖 완독했어요!
                  </button>
                </div>
              </>}

              {/* 수정 / 삭제 */}
              <div style={{ height:1, background:F.border }} />
              <div style={{ display:"flex", gap:10, padding:"14px 20px" }}>
                <button onClick={() => openEdit(selected)} style={{ flex:1, padding:"13px", borderRadius:12, border:`1px solid ${F.border}`, background:F.white, color:F.text, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>수정</button>
                <button onClick={() => del(selected.id)} disabled={deleting} style={{ flex:1, padding:"13px", borderRadius:12, border:"none", background:"#FFF0F0", color:"#FF4444", fontWeight:600, fontSize:14, cursor:deleting?"default":"pointer", fontFamily:"inherit", opacity:deleting?0.6:1 }}>{deleting ? "삭제 중..." : "삭제"}</button>
              </div>
            </div>
          );
        })()}

        {/* ── 삭제 중 오버레이 ─────────────────────────────────── */}
        {deleting && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ background:"#fff", borderRadius:20, padding:"24px 32px", display:"flex", flexDirection:"column", alignItems:"center", gap:12, boxShadow:"0 8px 32px rgba(0,0,0,0.2)" }}>
              <div style={{ width:32, height:32, border:"3px solid #FF4444", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              <span style={{ fontSize:14, fontWeight:600, color:"#FF4444" }}>삭제 중...</span>
            </div>
          </div>
        )}

        {/* ── 완독 별점 모달 ───────────────────────────────────────── */}
        {showRatingModal && selected && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 24px" }}
            onClick={e => { if (e.target === e.currentTarget) setShowRatingModal(false); }}>
            <div style={{ background:F.white, borderRadius:24, padding:"28px 24px", width:"100%", maxWidth:340, boxShadow:"0 12px 48px rgba(0,0,0,0.2)" }}>
              <p style={{ fontSize:18, fontWeight:800, color:F.text, margin:"0 0 6px", textAlign:"center" }}>📖 완독 축하해요!</p>
              <p style={{ fontSize:13, color:F.textMut, textAlign:"center", margin:"0 0 22px" }}>이 책은 어떠셨나요? 별점을 남겨주세요</p>
              <div style={{ display:"flex", justifyContent:"center", marginBottom:24 }}>
                <Stars v={finishRating} onChange={setFinishRating} size={40} />
              </div>
              <button
                onClick={async () => {
                  const today = todayStr();
                  const updated = { ...selected, finished: true, date_end: today, rating: finishRating };
                  const res = await fetch(`/api/records/${selected.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ finished:true, date_end:fixDateForApi(today), rating:finishRating }) });
                  if (res.ok) {
                    const updatedRec = await res.json();
                    setSelected(updatedRec);
                    setRecords(prev => prev.map(r => r.id === selected.id ? updatedRec : r));
                  } else {
                    setSelected(updated);
                  }
                  setShowRatingModal(false);
                }}
                style={{ width:"100%", padding:"14px", borderRadius:14, border:"none", background:F.accentColor, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 16px rgba(123,97,255,0.35)" }}>
                완료
              </button>
              <button onClick={() => setShowRatingModal(false)}
                style={{ width:"100%", marginTop:10, padding:"10px", borderRadius:14, border:"none", background:"transparent", color:F.textMut, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                취소
              </button>
            </div>
          </div>
        )}

        {/* ══ CATEGORY = 통계 ═══════════════════════════════════════ */}
        {view==="category" && (
          <div style={screenWrap}>
            <div style={{ padding:"20px 20px 14px" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0 }}>통계</h2>
            </div>

            {/* 요약 카드 */}
            <div style={{ margin:"0 16px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[
                { label:"총 기록", value:`${records.length}개`, emoji:"📝" },
                { label:"평균 별점", value:records.filter(r=>Number(r.rating)>0).length?`${(records.filter(r=>Number(r.rating)>0).reduce((s,r)=>s+Number(r.rating),0)/records.filter(r=>Number(r.rating)>0).length).toFixed(1)}`:"-", emoji:"⭐" },
                { label:"이번 달", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}개`, emoji:"📅" },
              ].map(s => (
                <Card key={s.label}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:22, margin:"0 0 4px" }}>{s.emoji}</p>
                    <p style={{ fontSize:18, fontWeight:800, color:F.accentColor, margin:"0 0 2px" }}>{s.value}</p>
                    <p style={{ fontSize:10, color:F.textMut, margin:0 }}>{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* 카테고리별 분포 */}
            <Card style={{ margin:"0 16px 16px" }}>
              <p style={{ fontSize:13, fontWeight:700, color:F.text, margin:"0 0 14px" }}>카테고리별 기록</p>
              {records.length===0
                ? <p style={{ fontSize:13, color:F.textMut, textAlign:"center", padding:"10px 0" }}>아직 기록이 없어요</p>
                : CATS.map(c => {
                  const cnt = records.filter(r => r.category===c.id).length;
                  if (!cnt) return null;
                  const pct = Math.round((cnt/records.length)*100);
                  const avg = (records.filter(r=>r.category===c.id).reduce((s,r)=>s+Number(r.rating),0)/cnt).toFixed(1);
                  return (
                    <div key={c.id} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:16 }}>{c.emoji}</span>
                          <span style={{ fontSize:13, fontWeight:600, color:F.text }}>{c.label}</span>
                          <span style={{ fontSize:11, color:F.textMut }}>{cnt}개</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <span style={{ fontSize:11, color:"#FFB800" }}>★</span>
                          <span style={{ fontSize:11, color:F.textSub, fontWeight:600 }}>{avg}</span>
                        </div>
                      </div>
                      <div style={{ height:7, background:F.border, borderRadius:10, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:c.color, borderRadius:10, transition:"width 0.5s" }} />
                      </div>
                    </div>
                  );
                })
              }
            </Card>

            {/* 완독 현황 (책만) */}
            {records.filter(r=>r.category==="book").length > 0 && (
              <Card style={{ margin:"0 16px 16px" }}>
                <p style={{ fontSize:13, fontWeight:700, color:F.text, margin:"0 0 14px" }}>📚 독서 현황</p>
                {(() => {
                  const books = records.filter(r => r.category==="book");
                  const finished = books.filter(r => r.finished).length;
                  const reading = books.filter(r => r.date_start && !r.finished).length;
                  const notStarted = books.length - finished - reading;
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {[
                        { label:"완독", value:finished, color:F.accentColor },
                        { label:"읽는 중", value:reading, color:"#FF9800" },
                        { label:"미시작", value:notStarted, color:F.textMut },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign:"center", padding:"10px 6px", background:F.bg, borderRadius:12 }}>
                          <p style={{ fontSize:20, fontWeight:800, color:s.color, margin:"0 0 3px" }}>{s.value}</p>
                          <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* 최고 평점 */}
            {records.length > 0 && (
              <Card style={{ margin:"0 16px 16px" }}>
                <p style={{ fontSize:13, fontWeight:700, color:F.text, margin:"0 0 12px" }}>⭐ 높게 평가한 기록</p>
                {[...records].sort((a,b)=>Number(b.rating)-Number(a.rating)).slice(0,3).map(rec => {
                  const cat = catOf(rec.category);
                  return (
                    <div key={rec.id} onClick={() => openDetail(rec,"category")}
                      style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, cursor:"pointer" }}>
                      {rec.thumbnail
                        ? <img src={rec.thumbnail} style={{ width:36,height:50,objectFit:"cover",borderRadius:8,flexShrink:0 }} />
                        : <div style={{ width:36,height:50,borderRadius:8,background:`${cat.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{cat.emoji}</div>
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14,fontWeight:700,color:F.text,margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.title}</p>
                        <Stars v={Number(rec.rating)} size={12} />
                      </div>
                      <span style={{ fontSize:14,fontWeight:800,color:"#FFB800" }}>{Number(rec.rating).toFixed(1)}</span>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        )}

        {/* ══ CALENDAR ══════════════════════════════════════════════ */}
        {view==="calendar" && (
          <div style={screenWrap}>
            <div style={{ padding:"20px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ fontSize:20, fontWeight:800, color:F.text, margin:0 }}>캘린더</h2>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px 16px" }}>
              <button onClick={() => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }} style={{ width:34, height:34, borderRadius:10, border:`1px solid ${F.border}`, background:F.white, boxShadow:F.shadow, cursor:"pointer", fontSize:18, color:F.textSub }}>‹</button>
              <span style={{ fontSize:16, fontWeight:700, color:F.text }}>{calYear}년 {calMonth+1}월</span>
              {/* 미래 월로 못 넘어가게 */}
              <button
                onClick={() => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }}
                disabled={calYear===new Date().getFullYear() && calMonth===new Date().getMonth()}
                style={{ width:34, height:34, borderRadius:10, border:`1px solid ${F.border}`, background:F.white, boxShadow:F.shadow, cursor:"pointer", fontSize:18, color:F.textSub, opacity: calYear===new Date().getFullYear() && calMonth===new Date().getMonth() ? 0.25 : 1 }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 14px", marginBottom:4 }}>
              {["일","월","화","수","목","금","토"].map((d,i) => (
                <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:i===0?"#FF6B6B":i===6?F.accentColor:F.textMut, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 14px", gap:"4px 0" }}>
              {Array.from({length:firstDay}).map((_,i) => <div key={`e-${i}`} />)}
              {Array.from({length:daysInMonth}).map((_,i) => {
                const day=i+1; const ds=calDateStr(day); const recs=recordsOnDay(day);
                const isSel=calSelected===ds; const isToday=ds===todayStr();
                const isFuture=ds>todayStr();
                return (
                  <div key={day} onClick={() => { if(!isFuture) setCalSelected(ds); }} style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"3px 0", cursor:isFuture?"default":"pointer" }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:isSel?F.accentColor:isToday?`${F.accentColor}15`:"transparent", color:isSel?"#fff":isFuture?F.textMut:isToday?F.accentColor:F.text, fontSize:13, fontWeight:isToday||isSel?700:400, border:isToday&&!isSel?`1.5px solid ${F.accentColor}40`:"none", opacity:isFuture?0.3:1 }}>{day}</div>
                    <div style={{ display:"flex", gap:2, marginTop:2 }}>
                      {recs.slice(0,3).map((r,idx) => <div key={idx} style={{ width:4, height:4, borderRadius:"50%", background:catOf(r.category).color }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            {calSelected && (
              <div style={{ margin:"16px 16px 0" }}>
                <p style={{ fontSize:13, fontWeight:700, color:F.text, margin:"0 0 10px" }}>{calSelected.replace(/-/g,".")}</p>
                {selectedDayRecords.length===0
                  ? <p style={{ fontSize:13, color:F.textMut, textAlign:"center", padding:"16px 0" }}>이 날의 기록이 없어요</p>
                  : selectedDayRecords.map(rec => {
                    const cat = catOf(rec.category);
                    return (
                      <Card key={rec.id} onClick={() => openDetail(rec,"calendar")} style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          {rec.thumbnail?<img src={rec.thumbnail} style={{ width:36,height:50,objectFit:"cover",borderRadius:8,flexShrink:0 }} />:<div style={{ width:36,height:50,borderRadius:8,background:`${cat.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{cat.emoji}</div>}
                          <div style={{ flex:1 }}>
                            <p style={{ fontSize:14, fontWeight:700, color:F.text, margin:"0 0 4px" }}>{rec.title}</p>
                            <Stars v={Number(rec.rating)} size={12} />
                          </div>
                        </div>
                      </Card>
                    );
                  })
                }
              </div>
            )}
          </div>
        )}

        {/* ══ MORE ══════════════════════════════════════════════════ */}
        {view==="more" && (
          <div style={screenWrap}>
            <div style={{ padding:"20px 20px 16px" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0 }}>더보기</h2>
            </div>
            {session?.user && (
              <Card style={{ margin:"0 16px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {session?.user?.image
                    ? <img src={session?.user?.image} style={{ width:52, height:52, borderRadius:"50%", boxShadow:F.shadow }} />
                    : <div style={{ width:52,height:52,borderRadius:"50%",background:`${F.accentColor}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>👤</div>
                  }
                  <div>
                    <p style={{ fontSize:16, fontWeight:700, color:F.text, margin:"0 0 3px" }}>{session?.user?.name}</p>
                    <p style={{ fontSize:12, color:F.textMut, margin:0 }}>{session?.user?.email}</p>
                  </div>
                </div>
              </Card>
            )}
            <div style={{ margin:"0 16px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[
                { label:"총 기록", value:`${records.length}개` },
                { label:"평균 별점", value:records.filter(r=>Number(r.rating)>0).length?`${(records.filter(r=>Number(r.rating)>0).reduce((s,r)=>s+Number(r.rating),0)/records.filter(r=>Number(r.rating)>0).length).toFixed(1)}점`:"-" },
                { label:"이번 달", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}개` },
              ].map(s => (
                <Card key={s.label}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:18, fontWeight:800, color:F.accentColor, margin:"0 0 4px" }}>{s.value}</p>
                    <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>
            <Card style={{ margin:"0 16px" }}>
              {[
                { icon:"📊", label:"통계 보기",     action:()=>navigateTo("category") },
                { icon:"📅", label:"캘린더 보기",   action:()=>navigateTo("calendar") },
              ].map((item,i,arr) => (
                <button key={item.label} onClick={item.action}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"14px 4px", background:"none", border:"none", borderBottom:i<arr.length-1?`1px solid ${F.border}`:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:20 }}>{item.icon}</span>
                  <span style={{ fontSize:14, fontWeight:600, color:F.text, flex:1 }}>{item.label}</span>
                  <span style={{ color:F.textMut, fontSize:18 }}>›</span>
                </button>
              ))}
            </Card>
            <Card style={{ margin:"16px 16px 0" }}>
              <button onClick={() => { setRecords([]); signOut({ callbackUrl:"/login" }); }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"4px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                <span style={{ fontSize:20 }}>🚪</span>
                <span style={{ fontSize:14, fontWeight:600, color:"#FF6B6B", flex:1 }}>로그아웃</span>
                <span style={{ color:F.textMut, fontSize:18 }}>›</span>
              </button>
            </Card>
          </div>
        )}

        {/* ══ BOTTOM NAV ════════════════════════════════════════════ */}
        {view!=="add" && (
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, display:"flex", alignItems:"center", background:F.white, borderTop:`1px solid ${F.border}`, padding:"4px 0 8px", zIndex:20 }}>
            {[{id:"home",label:"홈",emoji:"🏠"},{id:"calendar",label:"캘린더",emoji:"📅"}].map(n => (
              <button key={n.id}
                onClick={() => {
                  if (n.id==="home" && view==="home") { homeScrollRef.current?.scrollTo({ top:0, behavior:"smooth" }); }
                  else { navigateTo(n.id as any); }
                }}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, fontFamily:"inherit", padding:"4px 0", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <span style={{ fontSize:20, opacity:view===n.id?1:0.35, transition:"opacity 0.2s" }}>{n.emoji}</span>
                <span style={{ fontSize:10, color:view===n.id?F.text:F.textMut, fontWeight:view===n.id?700:400, transition:"color 0.2s" }}>{n.label}</span>
              </button>
            ))}
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
              <button onClick={() => { reset(); navigateTo("add"); }}
                style={{ width:46, height:46, borderRadius:"50%", background:F.text, border:"none", color:"#fff", fontSize:24, cursor:"pointer", boxShadow:"0 2px 12px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:4, transition:"transform 0.15s", WebkitTapHighlightColor:"transparent", outline:"none" }}
                onMouseEnter={e => (e.currentTarget.style.transform="scale(1.08)")}
                onMouseLeave={e => (e.currentTarget.style.transform="")}>
                +
              </button>
            </div>
            {[{id:"category",label:"통계",emoji:"📊"},{id:"more",label:"더보기",emoji:"···"}].map(n => (
              <button key={n.id} onClick={() => navigateTo(n.id as any)}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2, fontFamily:"inherit", padding:"4px 0", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <span style={{ fontSize:20, opacity:view===n.id?1:0.35, transition:"opacity 0.2s" }}>{n.emoji}</span>
                <span style={{ fontSize:10, color:view===n.id?F.text:F.textMut, fontWeight:view===n.id?700:400, transition:"color 0.2s" }}>{n.label}</span>
              </button>
            ))}
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          * { -webkit-tap-highlight-color: transparent; }
          input, textarea, select { font-size: 16px !important; }
          button:focus { outline: none; }
          button:active { opacity: 0.8; }
        `}</style>
      </div>
    </div>
  );
}