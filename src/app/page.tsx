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

// ── Design tokens ─────────────────────────────────────────────────
const F = {
  bg:      "#F7F7FB",
  white:   "#FFFFFF",
  border:  "#F0F0F5",
  text:    "#1A1A2E",
  textSub: "#666680",
  textMut: "#AAAABC",
  accent:  "#7B61FF",
  shadow:  "0 2px 12px rgba(0,0,0,0.07)",
  shadowMd:"0 4px 20px rgba(0,0,0,0.10)",
};

// ── Categories ─────────────────────────────────────────────────────
const CATS = [
  { id:"book",       label:"책",          emoji:"📚", color:"#7B61FF" },
  { id:"movie",      label:"영화",        emoji:"🎬", color:"#FF6B6B" },
  { id:"exhibition", label:"전시",        emoji:"🖼️", color:"#FFB347" },
  { id:"musical",    label:"공연/뮤지컬", emoji:"🎭", color:"#FF69B4" },
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

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${y}.${m}.${day}`;
}

function todayStr() {
  const d = new Date();
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

  const parsed = value ? new Date(value + "T00:00:00") : new Date();
  const [calY, setCalY] = useState(parsed.getFullYear());
  const [calM, setCalM] = useState(parsed.getMonth());

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
        style={{ ...flatInput as any, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:disabled?"default":"pointer", opacity:disabled?0.35:1, border:`1.5px solid ${open ? F.accent : F.border}`, background:F.bg, textAlign:"left" }}>
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
              <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:i===0?"#FF6B6B":i===6?F.accent:F.textMut, padding:"2px 0" }}>{d}</div>
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
                  style={{ width:"100%", aspectRatio:"1", borderRadius:"50%", border:"none", cursor:dis?"default":"pointer", fontFamily:"inherit", fontSize:13, fontWeight:sel||isToday?700:400, background:sel?F.accent:isToday?`${F.accent}18`:"transparent", color:sel?"#fff":dis?F.textMut:isToday?F.accent:F.text, opacity:dis?0.35:1, transition:"all 0.1s" }}>
                  {d}
                </button>
              );
            })}
          </div>

          {/* 오늘 바로가기 */}
          <div style={{ textAlign:"center", marginTop:8, paddingTop:8, borderTop:`1px solid ${F.border}` }}>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}
              style={{ background:"none", border:"none", fontSize:12, color:F.accent, cursor:"pointer", fontWeight:600 }}>오늘</button>
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
  const router = useRouter();
  const [records, setRecords] = useState<CultureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home"|"add"|"detail"|"category"|"calendar"|"more">("home");
  const [prevView, setPrevView] = useState<"home"|"category"|"calendar">("home");
  const [selected, setSelected] = useState<CultureRecord|null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [form, setForm] = useState(makeEmpty);
  const [editId, setEditId] = useState<number|null>(null);
  const [saving, setSaving] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string>(todayStr());

  const { suggestions, loading:acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  useEffect(() => { if(status==="unauthenticated") router.push("/login"); }, [status]);
  useEffect(() => { if(status==="authenticated") fetchRecords(); }, [status]);

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

  async function save() {
    if (!form.title || !form.category || !form.rating) return;
    setSaving(true);
    try {
      if (editId) {
        await fetch(`/api/records/${editId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
        await fetchRecords();
        setSelected({ ...selected!, ...form, id:editId });
        reset(); navigateTo("detail");
      } else {
        await fetch("/api/records", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
        await fetchRecords(); reset(); navigateTo("home");
      }
    } finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm("삭제할까요?")) return;
    await fetch(`/api/records/${id}`, { method:"DELETE" });
    await fetchRecords(); navigateTo(prevView);
  }

  function reset() { setForm(makeEmpty()); setEditId(null); setTitleQuery(""); clear(); setShowSug(false); }

  function openDetail(rec: CultureRecord, from: "home"|"category"|"calendar" = "home") {
    setSelected(rec); setPrevView(from); navigateTo("detail");
  }

  function openEdit(r: CultureRecord) {
    setForm({ category:r.category, title:r.title, date:r.date.slice(0,10), rating:r.rating, review:r.review??"", thumbnail:r.thumbnail??"", author:r.author??"", venue:r.venue??"", date_start:r.date_start?.slice(0,10)??"", date_end:r.date_end?.slice(0,10)??"", finished:r.finished??false });
    setTitleQuery(r.title); setEditId(r.id); navigateTo("add");
  }

  function pickSug(s: Suggestion) {
    if (s.source==="history" && s.type==="author") setForm(f => ({ ...f, author:s.title }));
    else if (s.source==="history" && s.type==="venue") setForm(f => ({ ...f, venue:s.title }));
    else { setForm(f => ({ ...f, title:s.title, author:s.author??f.author, thumbnail:s.thumbnail??f.thumbnail, venue:s.venue??f.venue })); setTitleQuery(s.title); }
    clear(); setShowSug(false);
  }

  const filtered = filterCat==="all" ? records : records.filter(r => r.category===filterCat);
  const activeCat = catOf(form.category);
  const canSave = !!form.title && !!form.category && !!form.rating;
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const calDateStr = (d: number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d: number) => records.filter(r => r.date?.slice(0,10)===calDateStr(d));
  const selectedDayRecords = records.filter(r => r.date?.slice(0,10)===calSelected);

  if (status==="loading") return (
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
        style={{ display:"flex", alignItems:"center", gap:4, background:F.accent, border:"none", borderRadius:10, padding:"7px 14px 7px 10px", cursor:"pointer", fontFamily:"inherit", color:"#fff", fontWeight:700, fontSize:14, boxShadow:"0 2px 8px rgba(123,97,255,0.3)" }}>
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
          <div style={screenWrap}>
            <div style={{ padding:"28px 20px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <p style={{ fontSize:11, color:F.textMut, letterSpacing:2, margin:"0 0 4px" }}>MY CULTURE LOG</p>
                <h1 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0 }}>나의 문화 기록</h1>
              </div>
              {session?.user?.image && (
                <img src={session.user.image} style={{ width:34, height:34, borderRadius:"50%", border:`2px solid ${F.accent}30` }} />
              )}
            </div>

            {/* 카테고리 필터 */}
            <div style={{ padding:"0 16px 14px", display:"flex", gap:8, overflowX:"auto" }}>
              {[{id:"all",label:"전체"},...CATS].map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  style={{ padding:"6px 14px", borderRadius:20, border:"none", background:filterCat===c.id?F.accent:F.white, color:filterCat===c.id?"#fff":F.textSub, fontWeight:filterCat===c.id?700:500, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0, boxShadow:filterCat===c.id?"none":F.shadow, transition:"all 0.2s" }}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 20px 12px" }}>
              <span style={{ fontSize:13, fontWeight:700, color:F.text }}>최근 기록</span>
              <button onClick={() => navigateTo("category")} style={{ background:"none", border:"none", fontSize:12, color:F.accent, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>전체 보기</button>
            </div>

            <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:10 }}>
              {loading ? (
                <div style={{ textAlign:"center", padding:60, color:F.textMut, fontSize:14 }}>불러오는 중...</div>
              ) : records.length===0 ? (
                <div style={{ textAlign:"center", padding:"60px 0" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <p style={{ color:F.textMut, fontSize:14 }}>아직 기록이 없어요</p>
                  <p style={{ color:F.textMut, fontSize:12, marginTop:4, opacity:0.7 }}>+ 버튼으로 첫 기록을 남겨보세요</p>
                </div>
              ) : filtered.length===0 ? (
                <div style={{ textAlign:"center", padding:"60px 0" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🗂️</div>
                  <p style={{ color:F.textMut, fontSize:14 }}>해당 카테고리의 기록이 없어요</p>
                </div>
              ) : filtered.map(rec => {
                const cat = catOf(rec.category);
                return (
                  <Card key={rec.id} onClick={() => openDetail(rec, "home")}>
                    <div style={{ display:"flex", alignItems:"center", gap:12, overflow:"hidden" }}>
                      {rec.thumbnail
                        ? <img src={rec.thumbnail} style={{ width:54, height:72, objectFit:"cover", borderRadius:10, flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }} />
                        : <div style={{ width:54, height:72, borderRadius:10, background:`${cat.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{cat.emoji}</div>
                      }
                      <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
                        <div style={{ marginBottom:4 }}><CatDot id={rec.category} /></div>
                        <p style={{ fontSize:16, fontWeight:700, color:F.text, margin:"0 0 5px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.title}</p>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <Stars v={Number(rec.rating)} size={13} />
                            <span style={{ fontSize:11, color:F.textSub, fontWeight:600 }}>{Number(rec.rating).toFixed(1)}</span>
                          </div>
                          <span style={{ fontSize:11, color:F.textMut, flexShrink:0 }}>{formatDate(rec.date)}</span>
                        </div>
                        {rec.review && <p style={{ fontSize:12, color:F.textSub, margin:"4px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.review}</p>}
                      </div>
                    </div>
                  </Card>
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
                style={{ display:"flex", alignItems:"center", gap:4, background:F.accent, border:"none", borderRadius:10, padding:"7px 12px", cursor:"pointer", color:"#fff", fontWeight:700, fontSize:14, fontFamily:"inherit" }}>
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
                {CATS.map(c => (
                  <button key={c.id} onClick={() => { setForm(f => ({...f, category:c.id, thumbnail:"", author:""})); setTitleQuery(""); clear(); }}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, padding:"10px 4px", borderRadius:16, border:`2px solid ${form.category===c.id ? c.color : F.border}`, background:form.category===c.id ? `${c.color}12` : F.white, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s", boxShadow:form.category===c.id?"none":F.shadow }}>
                    <span style={{ fontSize:22 }}>{c.emoji}</span>
                    <span style={{ fontSize:10, fontWeight:600, color:form.category===c.id ? c.color : F.textMut, textAlign:"center", lineHeight:1.3 }}>{c.label}</span>
                  </button>
                ))}
              </div>

              {/* 제목 */}
              <p style={sectionLabel}>
                제목 {form.category && <span style={{ color:F.accent, textTransform:"none", fontWeight:400, fontSize:10 }}>— {activeCat.id==="book"||activeCat.id==="movie" ? "검색 or 내 기록 자동완성" : "내 기록 자동완성"}</span>}
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
                {acLoading && <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", width:14, height:14, border:`2px solid ${F.border}`, borderTopColor:F.accent, borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />}
              </div>

              {/* 자동완성 드롭다운 */}
              <div style={{ position:"relative", marginBottom: showSug && suggestions.length>0 ? 250 : 0, transition:"margin 0.2s" }}>
                {showSug && suggestions.length>0 && (
                  <div style={{ position:"absolute", top:0, left:0, right:0, background:F.white, borderRadius:16, boxShadow:F.shadowMd, border:`1px solid ${F.border}`, maxHeight:240, overflowY:"auto", zIndex:50 }}>
                    {suggestions.filter(s => s.source==="history").length>0 && <>
                      <div style={{ padding:"8px 14px 2px", fontSize:10, color:F.accent, fontWeight:700, letterSpacing:1 }}>내 기록</div>
                      {suggestions.filter(s => s.source==="history").map(s => (
                        <div key={s.id} onClick={() => pickSug(s)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:`1px solid ${F.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background=`${F.accent}08`)}
                          onMouseLeave={e => (e.currentTarget.style.background="")}>
                          <span style={{ fontSize:15 }}>{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                          <span style={{ fontSize:13, color:F.text, fontWeight:500 }}>{s.title}</span>
                          <span style={{ marginLeft:"auto", fontSize:10, color:F.accent, background:`${F.accent}12`, padding:"2px 6px", borderRadius:8, flexShrink:0 }}>내 기록</span>
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
                            ? <img src={s.thumbnail} style={{ width:30, height:42, objectFit:"cover", borderRadius:6, flexShrink:0 }} />
                            : <div style={{ width:30, height:42, borderRadius:6, background:F.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{activeCat.emoji}</div>
                          }
                          <div style={{ minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:600, color:F.text, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</p>
                            {s.author && <p style={{ fontSize:11, color:F.textMut, margin:0 }}>
                              {(s as any).description && <span style={{ color:F.accent, marginRight:4 }}>[{(s as any).description}]</span>}
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
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:`${F.accent}08`, borderRadius:14, marginBottom:14, border:`1.5px solid ${F.accent}25` }}>
                  <img src={form.thumbnail} style={{ width:34, height:48, objectFit:"cover", borderRadius:8 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:F.text }}>{form.title}</p>
                    {form.author && <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{form.author}</p>}
                  </div>
                  <button onClick={() => setForm(f => ({...f, thumbnail:"", author:""}))} style={{ background:"none", border:"none", color:F.textMut, cursor:"pointer", fontSize:16, padding:0 }}>✕</button>
                </div>
              )}

              {/* 책 — 읽기 시작/완독 */}
              {form.category==="book" ? (
                <>
                  {/* 완독 체크 — 먼저 표시 */}
                  <div
                    onClick={() => {
                      const nowFinished = !(form as any).finished;
                      setForm(f => ({
                        ...f,
                        finished: nowFinished,
                        date_end: nowFinished ? todayStr() : "", // 완독 체크 시 오늘 자동
                        date: nowFinished ? todayStr() : f.date,
                      }));
                    }}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 16px", background:F.white, borderRadius:14, border:`1.5px solid ${(form as any).finished ? F.accent : F.border}`, cursor:"pointer", marginBottom:16, transition:"all 0.15s", boxShadow:F.shadow }}>
                    <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${(form as any).finished ? F.accent : F.textMut}`, background:(form as any).finished ? F.accent : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s", flexShrink:0 }}>
                      {(form as any).finished && <span style={{ color:"#fff", fontSize:13, lineHeight:1, fontWeight:700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:14, fontWeight:600, color:(form as any).finished ? F.accent : F.text }}>완독했어요 📖</span>
                  </div>

                  {/* 읽기 기간 — 시작일만 입력 (완료일은 상세에서 표시) */}
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
                  <p style={{ ...sectionLabel, marginTop:4 }}>날짜</p>
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
                style={{ width:"100%", padding:"15px", borderRadius:16, border:"none", background:canSave?F.accent:"#E5E5F0", color:canSave?"#fff":F.textMut, fontSize:16, fontWeight:700, cursor:canSave?"pointer":"default", fontFamily:"inherit", boxShadow:canSave?"0 4px 16px rgba(123,97,255,0.35)":"none", transition:"all 0.2s" }}>
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════ */}
        {view==="detail" && selected && (() => {
          const cat = catOf(selected.category);
          return (
            <div style={screenWrap}>
              <div style={{ padding:"16px 20px 14px" }}>
                <BackBtn />
              </div>

              {/* Hero */}
              <Card style={{ margin:"0 16px 16px" }}>
                <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
                  {selected.thumbnail
                    ? <img src={selected.thumbnail} style={{ width:100, height:140, objectFit:"cover", borderRadius:14, boxShadow:"0 6px 20px rgba(0,0,0,0.15)", flexShrink:0 }} />
                    : <div style={{ width:100, height:140, borderRadius:14, background:`${cat.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:44, flexShrink:0 }}>{cat.emoji}</div>
                  }
                  <div style={{ flex:1, paddingTop:4 }}>
                    <div style={{ marginBottom:8 }}><CatDot id={selected.category} /></div>

                    {/* 제목 — 책/영화는 외부 링크 */}
                    {(selected.category==="book" || selected.category==="movie") ? (
                      <a href={
                          selected.category==="book"
                            ? `https://www.google.com/search?q=${encodeURIComponent(selected.title+" "+(selected.author??""))}&tbm=bks`
                            : `https://www.themoviedb.org/search?query=${encodeURIComponent(selected.title)}`
                        }
                        target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                        <h2 style={{ fontSize:20, fontWeight:800, color:F.accent, margin:"0 0 4px", lineHeight:1.3, wordBreak:"keep-all", borderBottom:`1.5px solid ${F.accent}30`, paddingBottom:2, display:"inline-block" }}>
                          {selected.title} <span style={{ fontSize:12, opacity:0.6 }}>↗</span>
                        </h2>
                        <p style={{ fontSize:10, color:F.textMut, margin:"0 0 8px" }}>
                          {selected.category==="book" ? "Google Books에서 보기" : "TMDB에서 보기"}
                        </p>
                      </a>
                    ) : (
                      <h2 style={{ fontSize:20, fontWeight:800, color:F.text, margin:"0 0 10px", lineHeight:1.3, wordBreak:"keep-all" }}>{selected.title}</h2>
                    )}

                    {selected.author && <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}><span style={{ fontSize:12, color:F.textMut }}>👤</span><span style={{ fontSize:13, color:F.textSub }}>{selected.author}</span></div>}
                    {selected.venue  && <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}><span style={{ fontSize:12, color:F.textMut }}>📍</span><span style={{ fontSize:13, color:F.textSub }}>{selected.venue}</span></div>}

                    {selected.category==="book" ? (
                      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                        {/* 읽기 기간 */}
                        {(selected.date_start || selected.date_end) && (
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:12, color:F.textMut }}>📖</span>
                            <span style={{ fontSize:12, color:F.textMut }}>
                              {selected.date_start ? formatDate(selected.date_start) : "?"}
                              {(selected.finished || selected.date_end) && (
                                <> → {selected.date_end ? formatDate(selected.date_end) : "읽는 중"}</>
                              )}
                            </span>
                          </div>
                        )}
                        {/* 완독 뱃지 */}
                        {selected.finished ? (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:4, background:`${F.accent}12`, padding:"3px 10px", borderRadius:20, width:"fit-content" }}>
                            <span style={{ fontSize:11 }}>✓</span>
                            <span style={{ fontSize:11, color:F.accent, fontWeight:700 }}>완독</span>
                          </div>
                        ) : selected.date_start ? (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#FFF3E0", padding:"3px 10px", borderRadius:20, width:"fit-content" }}>
                            <span style={{ fontSize:11 }}>📚</span>
                            <span style={{ fontSize:11, color:"#FF9800", fontWeight:700 }}>읽는 중</span>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      /* 책 외 — 날짜 표시 */
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:12, color:F.textMut }}>📅</span>
                        <span style={{ fontSize:12, color:F.textMut }}>{formatDate(selected.date)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* 별점 + 리뷰 */}
              <Card style={{ margin:"0 16px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:selected.review?14:0 }}>
                  <Stars v={Number(selected.rating)} size={24} />
                  <span style={{ fontSize:20, fontWeight:800, color:F.text }}>{Number(selected.rating).toFixed(1)}</span>
                </div>
                {selected.review && (
                  <div style={{ paddingTop:12, borderTop:`1px solid ${F.border}` }}>
                    <p style={{ fontSize:11, fontWeight:700, color:F.textMut, margin:"0 0 6px", letterSpacing:0.5 }}>한 줄 리뷰</p>
                    <p style={{ fontSize:14, color:F.textSub, lineHeight:1.8, margin:0 }}>"{selected.review}"</p>
                  </div>
                )}
              </Card>

              {/* 수정 / 삭제 */}
              <div style={{ display:"flex", gap:12, padding:"0 16px" }}>
                <button onClick={() => openEdit(selected)} style={{ flex:1, padding:14, borderRadius:14, border:`2px solid ${F.accent}`, background:F.white, color:F.accent, fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>수정</button>
                <button onClick={() => del(selected.id)} style={{ flex:1, padding:14, borderRadius:14, border:"none", background:"#FFF0F0", color:"#FF6B6B", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>삭제</button>
              </div>
            </div>
          );
        })()}

        {/* ══ CATEGORY ══════════════════════════════════════════════ */}
        {view==="category" && (
          <div style={screenWrap}>
            <div style={{ display:"flex", alignItems:"center", padding:"16px 20px 14px", gap:12, borderBottom:`1px solid ${F.border}` }}>
              <button onClick={() => navigateTo("home")}
                style={{ display:"flex", alignItems:"center", gap:4, background:F.accent, border:"none", borderRadius:10, padding:"7px 14px 7px 10px", cursor:"pointer", fontFamily:"inherit", color:"#fff", fontWeight:700, fontSize:14, boxShadow:"0 2px 8px rgba(123,97,255,0.3)" }}>
                <span style={{ fontSize:20, lineHeight:1 }}>‹</span>
                <span>뒤로</span>
              </button>
              <p style={{ flex:1, fontSize:17, fontWeight:700, textAlign:"center", margin:0, color:F.text }}>카테고리</p>
              <div style={{ width:60 }} />
            </div>
            <div style={{ display:"flex", gap:8, padding:"12px 16px", overflowX:"auto", borderBottom:`1px solid ${F.border}` }}>
              {[{id:"all",label:"전체"},...CATS].map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  style={{ padding:"6px 14px", borderRadius:20, border:"none", background:filterCat===c.id?F.accent:F.white, color:filterCat===c.id?"#fff":F.textSub, fontWeight:filterCat===c.id?700:500, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0, boxShadow:filterCat===c.id?"none":F.shadow, transition:"all 0.2s" }}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ padding:"10px 16px", display:"flex", flexDirection:"column", gap:10 }}>
              {filtered.length===0
                ? <div style={{ textAlign:"center", padding:60, color:F.textMut, fontSize:14 }}>기록이 없어요</div>
                : filtered.map(rec => {
                  const cat = catOf(rec.category);
                  return (
                    <Card key={rec.id} onClick={() => openDetail(rec, "category")}>
                      <div style={{ display:"flex", alignItems:"center", gap:12, overflow:"hidden" }}>
                        {rec.thumbnail
                          ? <img src={rec.thumbnail} style={{ width:48, height:64, objectFit:"cover", borderRadius:10, flexShrink:0 }} />
                          : <div style={{ width:48, height:64, borderRadius:10, background:`${cat.color}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{cat.emoji}</div>
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ marginBottom:3 }}><CatDot id={rec.category} /></div>
                          <p style={{ fontSize:15, fontWeight:700, color:F.text, margin:"0 0 4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.title}</p>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <Stars v={Number(rec.rating)} size={12} />
                            <span style={{ fontSize:11, color:F.textMut }}>{formatDate(rec.date)}</span>
                          </div>
                          {rec.review && <p style={{ fontSize:12, color:F.textSub, margin:"3px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.review}</p>}
                        </div>
                      </div>
                    </Card>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* ══ CALENDAR ══════════════════════════════════════════════ */}
        {view==="calendar" && (
          <div style={screenWrap}>
            <div style={{ padding:"52px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
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
                <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:i===0?"#FF6B6B":i===6?F.accent:F.textMut, padding:"4px 0" }}>{d}</div>
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
                    <div style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:isSel?F.accent:isToday?`${F.accent}15`:"transparent", color:isSel?"#fff":isFuture?F.textMut:isToday?F.accent:F.text, fontSize:13, fontWeight:isToday||isSel?700:400, border:isToday&&!isSel?`1.5px solid ${F.accent}40`:"none", opacity:isFuture?0.3:1 }}>{day}</div>
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
            <div style={{ padding:"52px 20px 20px" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0 }}>더보기</h2>
            </div>
            {session?.user && (
              <Card style={{ margin:"0 16px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {session.user.image
                    ? <img src={session.user.image} style={{ width:52, height:52, borderRadius:"50%", boxShadow:F.shadow }} />
                    : <div style={{ width:52,height:52,borderRadius:"50%",background:`${F.accent}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22 }}>👤</div>
                  }
                  <div>
                    <p style={{ fontSize:16, fontWeight:700, color:F.text, margin:"0 0 3px" }}>{session.user.name}</p>
                    <p style={{ fontSize:12, color:F.textMut, margin:0 }}>{session.user.email}</p>
                  </div>
                </div>
              </Card>
            )}
            <div style={{ margin:"0 16px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[
                { label:"총 기록", value:`${records.length}개` },
                { label:"평균 별점", value:records.length?`${(records.reduce((s,r)=>s+Number(r.rating),0)/records.length).toFixed(1)}점`:"-" },
                { label:"이번 달", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}개` },
              ].map(s => (
                <Card key={s.label}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:18, fontWeight:800, color:F.accent, margin:"0 0 4px" }}>{s.value}</p>
                    <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>
            <Card style={{ margin:"0 16px" }}>
              {[
                { icon:"📊", label:"카테고리별 보기", action:()=>navigateTo("category") },
                { icon:"📅", label:"캘린더 보기",     action:()=>navigateTo("calendar") },
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
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, display:"flex", alignItems:"center", background:F.white, borderTop:`1px solid ${F.border}`, padding:"6px 0 18px", zIndex:20 }}>
            {[{id:"home",label:"홈",emoji:"🏠"},{id:"calendar",label:"캘린더",emoji:"📅"}].map(n => (
              <button key={n.id} onClick={() => navigateTo(n.id as any)}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
                <span style={{ fontSize:22 }}>{n.emoji}</span>
                <span style={{ fontSize:10, color:view===n.id?F.accent:F.textMut, fontWeight:view===n.id?700:400 }}>{n.label}</span>
                {view===n.id && <div style={{ width:4, height:4, borderRadius:"50%", background:F.accent }} />}
              </button>
            ))}
            {/* FAB */}
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
              <button onClick={() => { reset(); navigateTo("add"); }}
                style={{ width:52, height:52, borderRadius:"50%", background:F.accent, border:"none", color:"#fff", fontSize:28, cursor:"pointer", boxShadow:"0 4px 18px rgba(123,97,255,0.4)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:6, transition:"transform 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.transform="scale(1.1)")}
                onMouseLeave={e => (e.currentTarget.style.transform="")}>
                +
              </button>
            </div>
            {[{id:"category",label:"카테고리",emoji:"🗂️"},{id:"more",label:"더보기",emoji:"···"}].map(n => (
              <button key={n.id} onClick={() => navigateTo(n.id as any)}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
                <span style={{ fontSize:22 }}>{n.emoji}</span>
                <span style={{ fontSize:10, color:view===n.id?F.accent:F.textMut, fontWeight:view===n.id?700:400 }}>{n.label}</span>
                {view===n.id && <div style={{ width:4, height:4, borderRadius:"50%", background:F.accent }} />}
              </button>
            ))}
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          * { -webkit-tap-highlight-color: transparent; }
          input, textarea, select { font-size: 16px !important; }
        `}</style>
      </div>
    </div>
  );
}