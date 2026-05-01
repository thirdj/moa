"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────
interface CultureRecord {
  id: number; category: string; title: string; date: string;
  rating: number; review?: string; thumbnail?: string; author?: string; venue?: string;
}
interface Suggestion {
  id: string | number; source: "history" | "api"; type?: "title" | "author" | "venue";
  title: string; author?: string; venue?: string; thumbnail?: string;
  publishedDate?: string; category?: string;
}

// ── Categories — "기타" 제거 ───────────────────────────────────────
const CATS = [
  { id: "book",       label: "책",          emoji: "📚", color: "#7B61FF" },
  { id: "movie",      label: "영화",        emoji: "🎬", color: "#FF6B6B" },
  { id: "exhibition", label: "전시",        emoji: "🖼️", color: "#FFB347" },
  { id: "musical",    label: "공연/뮤지컬", emoji: "🎭", color: "#FF69B4" },
  { id: "concert",    label: "콘서트",      emoji: "🎵", color: "#4ECDC4" },
];
const catOf = (id: string) => CATS.find(c => c.id === id) ?? CATS[0];

// ── Helpers ────────────────────────────────────────────────────────
function Stars({ v, onChange, size = 16 }: { v: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize: size, color: s <= (hover || v) ? "#FFB800" : "#E0E0E0", cursor: onChange ? "pointer" : "default", userSelect: "none", lineHeight: 1 }}>
          ★
        </span>
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
}

// ── 이미지 URL 입력 컴포넌트 ──────────────────────────────────────
function ImageUrlInput({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [input, setInput] = useState(value);
  const [status, setStatus] = useState<"idle"|"loading"|"ok"|"warn"|"error">("idle");

  useEffect(() => {
    setInput(value);
    if (value) setStatus("ok");
    else setStatus("idle");
  }, [value]);

  function handleBlur() {
    const url = input.trim();
    if (!url) { onChange(""); setStatus("idle"); return; }

    // URL 형식 체크
    try { new URL(url); } catch { onChange(""); setStatus("error"); return; }

    setStatus("loading");
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      // 3초 내 응답 없으면 — CORS 가능성, 일단 저장하고 warn
      onChange(url);
      setStatus("warn");
    }, 3000);

    img.onload = () => {
      clearTimeout(timeout);
      onChange(url);
      setStatus("ok");
    };
    img.onerror = () => {
      clearTimeout(timeout);
      // onerror도 CORS로 발생할 수 있어서 일단 저장
      onChange(url);
      setStatus("warn");
    };
    img.src = url;
  }

  return (
    <div>
      <div style={{ position:"relative" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onBlur={handleBlur}
          placeholder="포스터 이미지 주소(URL)를 붙여넣으세요"
          style={{
            width:"100%", padding:"12px 40px 12px 16px", borderRadius:12,
            border:`1.5px solid ${status==="error"?"#FF6B6B":status==="ok"?"#4ECDC4":"#EFEFEF"}`,
            fontSize:13, outline:"none", fontFamily:"inherit",
            background:"#FAFAFA", boxSizing:"border-box", color:"#111"
          }}
        />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>
          {status==="loading"?"⏳":status==="ok"?"✅":status==="warn"?"⚠️":status==="error"?"❌":"🔗"}
        </span>
      </div>

      {status === "error" && (
        <p style={{ fontSize:11, color:"#FF6B6B", margin:"4px 0 0" }}>올바른 이미지 URL이 아니에요.</p>
      )}
      {status === "warn" && (
        <p style={{ fontSize:11, color:"#FFB347", margin:"4px 0 0" }}>저장됐어요. 일부 사이트는 미리보기가 안 될 수 있어요.</p>
      )}

      {/* 미리보기 — ok일 때만 */}
      {status === "ok" && value && (
        <div style={{ marginTop:10, position:"relative", display:"inline-block" }}>
          <img
            src={value}
            style={{ height:90, maxWidth:200, borderRadius:10, objectFit:"cover", boxShadow:"0 2px 8px rgba(0,0,0,0.12)", display:"block" }}
            onError={e => { (e.target as HTMLImageElement).style.display="none"; setStatus("warn"); }}
          />
          <button onClick={() => { onChange(""); setInput(""); setStatus("idle"); }}
            style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:"#FF6B6B", border:"2px solid #fff", color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function getDaysInMonth(y: number, m: number) { return new Date(y, m+1, 0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y, m, 1).getDay(); }

// ── Autocomplete ───────────────────────────────────────────────────
function useAutocomplete(query: string, category: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const cat = catOf(category);
    if (!query.trim() || !enabled) { setSuggestions([]); return; }
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results: Suggestion[] = [];
        const histRes = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}&cat=${category}`);
        if (histRes.ok) {
          const histData: any[] = await histRes.json();
          histData.forEach(row => results.push({ id: `h-${row.type}-${row.value}`, source: "history", type: row.type, title: row.value, author: row.author, venue: row.venue, thumbnail: row.thumbnail, category: row.category }));
        }
        if (cat.id === "book" || cat.id === "movie") {
          const ep = cat.id === "book" ? "/api/search/books" : "/api/search/movies";
          const apiRes = await fetch(`${ep}?q=${encodeURIComponent(query)}`);
          if (apiRes.ok) {
            const apiData: any[] = await apiRes.json();
            apiData.slice(0,6).forEach(item => results.push({ ...item, source: "api" as const }));
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
const EMPTY = { category: "", title: "", date: new Date().toISOString().slice(0,10), rating: 0, review: "", thumbnail: "", author: "", venue: "" };

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [records, setRecords] = useState<CultureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home"|"add"|"detail"|"category"|"calendar">("home");
  const [selected, setSelected] = useState<CultureRecord|null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<number|null>(null);
  const [saving, setSaving] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string|null>(null);

  const { suggestions, loading: acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  useEffect(() => { if (status === "unauthenticated") router.push("/login"); }, [status]);
  useEffect(() => { if (status === "authenticated") fetchRecords(); }, [status]);

  async function fetchRecords() {
    setLoading(true);
    try {
      const r = await fetch("/api/records");
      if (r.ok) setRecords(await r.json());
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function save() {
    if (!form.title || !form.category || !form.rating) return;
    setSaving(true);
    try {
      if (editId) await fetch(`/api/records/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      else await fetch("/api/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      await fetchRecords(); reset(); setView("home");
    } finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm("삭제할까요?")) return;
    await fetch(`/api/records/${id}`, { method: "DELETE" });
    await fetchRecords(); setView("home");
  }

  function reset() { setForm(EMPTY); setEditId(null); setTitleQuery(""); clear(); setShowSug(false); }

  function openEdit(r: CultureRecord) {
    setForm({ category: r.category, title: r.title, date: r.date.slice(0,10), rating: r.rating, review: r.review??"", thumbnail: r.thumbnail??"", author: r.author??"", venue: r.venue??"" });
    setTitleQuery(r.title); setEditId(r.id); setView("add");
  }

  function pickSug(s: Suggestion) {
    if (s.source === "history" && s.type === "author") setForm(f => ({ ...f, author: s.title }));
    else if (s.source === "history" && s.type === "venue") setForm(f => ({ ...f, venue: s.title }));
    else { setForm(f => ({ ...f, title: s.title, author: s.author??f.author, thumbnail: s.thumbnail??f.thumbnail, venue: s.venue??f.venue })); setTitleQuery(s.title); }
    clear(); setShowSug(false);
  }

  const filtered = filterCat === "all" ? records : records.filter(r => r.category === filterCat);
  const activeCat = catOf(form.category);
  const canSave = !!form.title && !!form.category && !!form.rating;

  // Calendar
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const calDateStr = (d: number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d: number) => records.filter(r => r.date?.slice(0,10) === calDateStr(d));
  const selectedDayRecords = calSelected ? records.filter(r => r.date?.slice(0,10) === calSelected) : [];

  if (status === "loading") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#aaa" }}>로딩 중...</div>
  );

  return (
    <div style={{ fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:"#F5F5F7", minHeight:"100vh", display:"flex", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:390, background:"#fff", minHeight:"100vh", display:"flex", flexDirection:"column", position:"relative", boxShadow:"0 0 40px rgba(0,0,0,0.08)" }}>

        {/* ══════════════════════════════════
            HOME
        ══════════════════════════════════ */}
        {view === "home" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:110 }}>
            {/* 헤더 */}
            <div style={{ padding:"56px 20px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h1 style={{ fontSize:22, fontWeight:800, color:"#111", margin:0 }}>나의 문화 기록</h1>
              <div style={{ display:"flex", gap:14, alignItems:"center" }}>
                <button style={{ background:"none", border:"none", cursor:"pointer", padding:0, fontSize:20, color:"#555" }}>🔍</button>
                <button style={{ background:"none", border:"none", cursor:"pointer", padding:0, fontSize:20, color:"#555" }}>🔔</button>
              </div>
            </div>

            {/* 최근 기록 + 전체보기 */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 20px 10px" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#111" }}>최근 기록</span>
              <button onClick={() => setView("category")} style={{ background:"none", border:"none", fontSize:12, color:"#7B61FF", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>전체 보기</button>
            </div>

            {/* 기록 리스트 — 시안 스타일 */}
            <div style={{ padding:"0 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {loading ? (
                <div style={{ textAlign:"center", padding:60, color:"#ccc", fontSize:14 }}>불러오는 중...</div>
              ) : records.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 0" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <p style={{ color:"#ccc", fontSize:14 }}>아직 기록이 없어요</p>
                  <p style={{ color:"#ddd", fontSize:12, marginTop:4 }}>+ 버튼으로 첫 기록을 남겨보세요</p>
                </div>
              ) : records.map(rec => {
                const cat = catOf(rec.category);
                return (
                  <div key={rec.id} onClick={() => { setSelected(rec); setView("detail"); }}
                    style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", borderRadius:16, padding:"12px 14px", cursor:"pointer", boxShadow:"0 1px 8px rgba(0,0,0,0.07)", border:"1px solid #F5F5F7", transition:"transform 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.transform="translateY(-1px)")}
                    onMouseLeave={e => (e.currentTarget.style.transform="")}>
                    {/* 썸네일 */}
                    {rec.thumbnail
                      ? <img src={rec.thumbnail} style={{ width:56, height:72, objectFit:"cover", borderRadius:10, flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }} />
                      : <div style={{ width:56, height:72, borderRadius:10, background:`${cat.color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{cat.emoji}</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      {/* 카테고리 뱃지 */}
                      <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:cat.color, display:"inline-block", flexShrink:0 }} />
                        <span style={{ fontSize:11, color:cat.color, fontWeight:700 }}>{cat.label}</span>
                      </div>
                      {/* 제목 */}
                      <p style={{ fontSize:16, fontWeight:700, color:"#111", margin:"0 0 4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.title}</p>
                      {/* 별점 + 날짜 */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <Stars v={rec.rating} size={13} />
                          <span style={{ fontSize:11, color:"#999", fontWeight:600 }}>{rec.rating}.0</span>
                        </div>
                        <span style={{ fontSize:11, color:"#CCC" }}>{formatDate(rec.date)}</span>
                      </div>
                      {/* 리뷰 한줄 */}
                      {rec.review && (
                        <p style={{ fontSize:12, color:"#999", margin:"4px 0 0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.review}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            ADD / EDIT
        ══════════════════════════════════ */}
        {view === "add" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:100 }}>
            {/* 헤더 — 저장 버튼 제거, 닫기만 */}
            <div style={{ display:"flex", alignItems:"center", padding:"52px 20px 12px", borderBottom:"1px solid #F5F5F7", gap:12 }}>
              <button onClick={() => { reset(); setView("home"); }} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#777", padding:0 }}>✕</button>
              <p style={{ flex:1, fontSize:17, fontWeight:700, textAlign:"center", margin:0, color:"#111" }}>{editId ? "기록 수정" : "기록 추가"}</p>
              <div style={{ width:22 }} />
            </div>

            <div style={{ padding:"20px" }}>
              {/* 카테고리 */}
              <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 10px", textTransform:"uppercase" }}>카테고리 선택</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:24 }}>
                {CATS.map(c => (
                  <button key={c.id} onClick={() => { setForm(f=>({...f,category:c.id})); setTitleQuery(""); clear(); }}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, padding:"10px 4px", borderRadius:14, border:`2px solid ${form.category===c.id ? c.color : "#F0F0F0"}`, background:form.category===c.id ? `${c.color}12` : "#FAFAFA", cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                    <span style={{ fontSize:22 }}>{c.emoji}</span>
                    <span style={{ fontSize:10, fontWeight:600, color:form.category===c.id ? c.color : "#AAA", textAlign:"center", lineHeight:1.3 }}>{c.label}</span>
                  </button>
                ))}
              </div>

              {/* 제목 */}
              <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>
                제목 {form.category && <span style={{ color:"#C4B5FD", textTransform:"none", fontWeight:400, fontSize:10 }}>— {activeCat.id === "book" || activeCat.id === "movie" ? "검색 or 내 기록 자동완성" : "내 기록 자동완성"}</span>}
              </p>
              <div style={{ position:"relative", marginBottom:6 }}>
                <input value={titleQuery}
                  onChange={e => { setTitleQuery(e.target.value); setForm(f=>({...f,title:e.target.value,thumbnail:""})); setShowSug(true); }}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder={form.category ? `${activeCat.emoji} 제목을 입력하세요` : "카테고리를 먼저 선택하세요"}
                  disabled={!form.category}
                  style={{ width:"100%", padding:"12px 40px 12px 16px", borderRadius:12, border:"1.5px solid #EFEFEF", fontSize:14, outline:"none", fontFamily:"inherit", background:form.category?"#FAFAFA":"#F9F9F9", boxSizing:"border-box", color:form.category?"#111":"#CCC" }}
                />
                {acLoading && <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", width:14, height:14, border:"2px solid #E0D4FF", borderTopColor:"#7B61FF", borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />}
              </div>

              {/* Suggestions dropdown */}
              {showSug && suggestions.length > 0 && (
                <div style={{ background:"#fff", borderRadius:14, boxShadow:"0 8px 28px rgba(0,0,0,0.12)", border:"1px solid #F0F0F0", marginBottom:14, maxHeight:240, overflowY:"auto" }}>
                  {suggestions.filter(s=>s.source==="history").length > 0 && <>
                    <div style={{ padding:"8px 14px 2px", fontSize:10, color:"#7B61FF", fontWeight:700, letterSpacing:1 }}>내 기록</div>
                    {suggestions.filter(s=>s.source==="history").map(s => (
                      <div key={s.id} onClick={() => pickSug(s)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:"1px solid #FAFAFA" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="#F8F5FF")}
                        onMouseLeave={e=>(e.currentTarget.style.background="")}>
                        <span style={{ fontSize:15 }}>{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                        <span style={{ fontSize:13, color:"#333", fontWeight:500 }}>{s.title}</span>
                        <span style={{ marginLeft:"auto", fontSize:10, color:"#C4B5FD", background:"#F3F0FF", padding:"2px 6px", borderRadius:8, flexShrink:0 }}>내 기록</span>
                      </div>
                    ))}
                  </>}
                  {suggestions.filter(s=>s.source==="api").length > 0 && <>
                    <div style={{ padding:"8px 14px 2px", fontSize:10, color:"#93C5FD", fontWeight:700, letterSpacing:1 }}>검색 결과</div>
                    {suggestions.filter(s=>s.source==="api").map(s => (
                      <div key={s.id} onClick={() => pickSug(s)}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", borderBottom:"1px solid #FAFAFA" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="#F0F7FF")}
                        onMouseLeave={e=>(e.currentTarget.style.background="")}>
                        {s.thumbnail
                          ? <img src={s.thumbnail} style={{ width:30,height:42,objectFit:"cover",borderRadius:6,flexShrink:0 }} />
                          : <div style={{ width:30,height:42,borderRadius:6,background:"#F0F0F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>{activeCat.emoji}</div>
                        }
                        <div style={{ minWidth:0 }}>
                          <p style={{ fontSize:13,fontWeight:600,color:"#111",margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.title}</p>
                          {s.author && <p style={{ fontSize:11,color:"#AAA",margin:0 }}>{s.author}{s.publishedDate?` · ${s.publishedDate.slice(0,4)}`:""}</p>}
                        </div>
                      </div>
                    ))}
                  </>}
                </div>
              )}

              {/* 선택 프리뷰 */}
              {form.thumbnail && !showSug && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#F8F5FF", borderRadius:12, marginBottom:16, border:"1.5px solid #E0D4FF" }}>
                  <img src={form.thumbnail} style={{ width:34,height:48,objectFit:"cover",borderRadius:6 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13,fontWeight:700,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{form.title}</p>
                    {form.author && <p style={{ fontSize:11,color:"#AAA",margin:0 }}>{form.author}</p>}
                  </div>
                  <button onClick={() => setForm(f=>({...f,thumbnail:"",author:""}))} style={{ background:"none",border:"none",color:"#CCC",cursor:"pointer",fontSize:16,padding:0 }}>✕</button>
                </div>
              )}

              {/* 날짜 */}
              <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>날짜</p>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}
                style={{ width:"100%", padding:"12px 16px", borderRadius:12, border:"1.5px solid #EFEFEF", fontSize:14, outline:"none", fontFamily:"inherit", marginBottom:18, background:"#FAFAFA", boxSizing:"border-box" }}
              />

              {/* 장소 — 책 제외 전 카테고리 */}
              {form.category && form.category !== "book" && (
                <>
                  <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>
                    장소 <span style={{ color:"#CCC", textTransform:"none", fontWeight:400 }}>(선택)</span>
                  </p>
                  <input
                    value={form.venue}
                    onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                    placeholder={
                      form.category === "movie"      ? "예) CGV 강남, 메가박스 코엑스" :
                      form.category === "exhibition" ? "예) 국립현대미술관, 예술의전당" :
                      form.category === "musical"    ? "예) 블루스퀘어 신한카드홀" :
                      form.category === "concert"    ? "예) 올림픽공원 KSPO돔" :
                      "어디서 봤나요?"
                    }
                    style={{ width:"100%", padding:"12px 16px", borderRadius:12, border:"1.5px solid #EFEFEF", fontSize:14, outline:"none", fontFamily:"inherit", marginBottom:18, background:"#FAFAFA", boxSizing:"border-box" }}
                  />
                </>
              )}

              {/* 별점 */}
              <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>별점</p>
              <div style={{ marginBottom:20 }}>
                <Stars v={form.rating} onChange={v=>setForm(f=>({...f,rating:v}))} size={32} />
              </div>

              {/* 한줄 리뷰 */}
              <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>
                한 줄 리뷰 <span style={{ color:"#CCC", textTransform:"none", fontWeight:400 }}>(선택)</span>
              </p>
              <textarea value={form.review} onChange={e=>setForm(f=>({...f,review:e.target.value.slice(0,100)}))}
                placeholder="한 줄로 느낀 점을 남겨보세요." maxLength={100} rows={3}
                style={{ width:"100%", padding:"12px 16px", borderRadius:12, border:"1.5px solid #EFEFEF", fontSize:14, outline:"none", fontFamily:"inherit", resize:"none", background:"#FAFAFA", lineHeight:1.6, boxSizing:"border-box" }}
              />
              <p style={{ textAlign:"right", fontSize:11, color:"#CCC", margin:"4px 0 20px" }}>{form.review.length}/100</p>

              {/* 이미지 URL — 책/영화는 API 썸네일 자동, 나머지만 표시 */}
              {form.category && !["book","movie"].includes(form.category) && (
                <>
                  <p style={{ fontSize:11, fontWeight:700, color:"#AAA", letterSpacing:"0.8px", margin:"0 0 8px", textTransform:"uppercase" }}>
                    이미지 <span style={{ color:"#CCC", textTransform:"none", fontWeight:400 }}>(선택)</span>
                  </p>
                  <ImageUrlInput
                    value={form.thumbnail}
                    onChange={url => setForm(f => ({ ...f, thumbnail: url }))}
                  />
                  <p style={{ fontSize:11, color:"#CCC", margin:"6px 0 0", lineHeight:1.6 }}>
                    💡 나무위키·공식사이트 포스터 이미지에서<br/>
                    우클릭 → "이미지 주소 복사" 후 붙여넣으세요
                  </p>
                </>
              )}
            </div>

            {/* 저장 버튼 — 맨 아래 고정 */}
            <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, padding:"12px 20px 28px", background:"#fff", borderTop:"1px solid #F5F5F7", zIndex:20 }}>
              <button onClick={save} disabled={!canSave||saving}
                style={{ width:"100%", padding:"16px", borderRadius:16, border:"none", background:canSave?"#7B61FF":"#E5E5E5", color:canSave?"#fff":"#aaa", fontSize:16, fontWeight:700, cursor:canSave?"pointer":"default", fontFamily:"inherit", transition:"background 0.2s" }}>
                {saving ? "저장 중..." : "저장하기"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            DETAIL
        ══════════════════════════════════ */}
        {view === "detail" && selected && (() => {
          const cat = catOf(selected.category);
          return (
            <div style={{ flex:1, overflowY:"auto", paddingBottom:110 }}>
              <div style={{ display:"flex", justifyContent:"space-between", padding:"52px 16px 10px" }}>
                <button onClick={() => setView("home")} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#555", padding:0 }}>‹</button>
                <button style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#CCC" }}>⋮</button>
              </div>
              {/* Hero */}
              <div style={{ display:"flex", gap:16, padding:"0 20px 20px", alignItems:"flex-start" }}>
                {selected.thumbnail
                  ? <img src={selected.thumbnail} style={{ width:100, height:140, objectFit:"cover", borderRadius:14, boxShadow:"0 8px 24px rgba(0,0,0,0.15)", flexShrink:0 }} />
                  : <div style={{ width:100, height:140, borderRadius:14, background:`${cat.color}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:44, flexShrink:0 }}>{cat.emoji}</div>
                }
                <div style={{ flex:1, paddingTop:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:8 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:cat.color, display:"inline-block" }} />
                    <span style={{ fontSize:12, color:cat.color, fontWeight:700 }}>{cat.label}</span>
                  </div>
                  <h2 style={{ fontSize:20, fontWeight:800, color:"#111", margin:"0 0 8px", lineHeight:1.3, wordBreak:"keep-all" }}>{selected.title}</h2>
                  {selected.author && (
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                      <span style={{ fontSize:12, color:"#BBB" }}>👤</span>
                      <span style={{ fontSize:13, color:"#666" }}>{selected.author}</span>
                    </div>
                  )}
                  {selected.venue && (
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                      <span style={{ fontSize:12, color:"#BBB" }}>📍</span>
                      <span style={{ fontSize:13, color:"#666" }}>{selected.venue}</span>
                    </div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ fontSize:12, color:"#BBB" }}>📅</span>
                    <span style={{ fontSize:12, color:"#AAA" }}>{formatDate(selected.date)}</span>
                  </div>
                </div>
              </div>

              {/* 별점 + 리뷰 */}
              <div style={{ margin:"0 16px 16px", background:"#FAFAFA", borderRadius:16, padding:"16px 18px" }}>
                {/* 별점 */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:selected.review ? 14 : 0 }}>
                  <Stars v={Number(selected.rating)} size={24} />
                  <span style={{ fontSize:20, fontWeight:800, color:"#111" }}>{Number(selected.rating).toFixed(1)}</span>
                </div>
                {/* 리뷰 */}
                {selected.review && (
                  <div style={{ paddingTop:12, borderTop:"1px solid #EEE" }}>
                    <p style={{ fontSize:11, fontWeight:700, color:"#CCC", margin:"0 0 6px", letterSpacing:0.5 }}>한 줄 리뷰</p>
                    <p style={{ fontSize:14, color:"#444", lineHeight:1.8, margin:0 }}>"{selected.review}"</p>
                  </div>
                )}
              </div>

              {/* 수정 / 삭제 */}
              <div style={{ display:"flex", gap:10, padding:"0 16px" }}>
                <button onClick={() => openEdit(selected)} style={{ flex:1, padding:14, borderRadius:14, border:"2px solid #7B61FF", background:"#fff", color:"#7B61FF", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>수정</button>
                <button onClick={() => del(selected.id)} style={{ flex:1, padding:14, borderRadius:14, border:"none", background:"#FFF0F0", color:"#FF6B6B", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>삭제</button>
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════
            CATEGORY
        ══════════════════════════════════ */}
        {view === "category" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:110 }}>
            <div style={{ display:"flex", alignItems:"center", padding:"52px 16px 12px", borderBottom:"1px solid #F5F5F7", gap:12 }}>
              <button onClick={() => setView("home")} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#555", padding:0 }}>‹</button>
              <p style={{ flex:1, fontSize:17, fontWeight:700, textAlign:"center", margin:0 }}>카테고리</p>
              <div style={{ width:22 }} />
            </div>
            {/* 탭 */}
            <div style={{ display:"flex", gap:6, padding:"12px 14px", overflowX:"auto", borderBottom:"1px solid #F5F5F7" }}>
              {[{id:"all",label:"전체"},...CATS].map(c => (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  style={{ padding:"6px 14px", borderRadius:20, border:"none", background:filterCat===c.id?"#7B61FF":"#F5F5F7", color:filterCat===c.id?"#fff":"#555", fontWeight:filterCat===c.id?700:500, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0 }}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", padding:"8px 18px 2px" }}>
              <span style={{ fontSize:12, color:"#AAA" }}>최신순 ∨</span>
            </div>
            <div style={{ padding:"4px 14px", display:"flex", flexDirection:"column", gap:10 }}>
              {filtered.length === 0
                ? <div style={{ textAlign:"center", padding:60, color:"#CCC", fontSize:14 }}>기록이 없어요</div>
                : filtered.map(rec => {
                  const cat = catOf(rec.category);
                  return (
                    <div key={rec.id} onClick={() => { setSelected(rec); setView("detail"); }}
                      style={{ display:"flex", alignItems:"center", gap:12, background:"#fff", borderRadius:16, padding:"12px 14px", cursor:"pointer", boxShadow:"0 1px 6px rgba(0,0,0,0.06)", border:"1px solid #F5F5F7" }}>
                      {rec.thumbnail
                        ? <img src={rec.thumbnail} style={{ width:48,height:64,objectFit:"cover",borderRadius:8,flexShrink:0 }} />
                        : <div style={{ width:48,height:64,borderRadius:8,background:`${cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>{cat.emoji}</div>
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:3 }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:cat.color, display:"inline-block" }} />
                          <span style={{ fontSize:11, color:cat.color, fontWeight:700 }}>{cat.label}</span>
                        </div>
                        <p style={{ fontSize:15,fontWeight:700,color:"#111",margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.title}</p>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <Stars v={rec.rating} size={12} />
                          <span style={{ fontSize:11, color:"#CCC" }}>{formatDate(rec.date)}</span>
                        </div>
                        {rec.review && <p style={{ fontSize:12,color:"#AAA",margin:"3px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.review}</p>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            MORE (더보기)
        ══════════════════════════════════ */}
        {(view as string) === "more" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:110 }}>
            <div style={{ padding:"52px 20px 20px" }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#111", margin:0 }}>더보기</h2>
            </div>

            {/* 프로필 */}
            {session?.user && (
              <div style={{ margin:"0 16px 20px", background:"#F8F5FF", borderRadius:18, padding:"18px 20px", display:"flex", alignItems:"center", gap:14 }}>
                {session.user.image
                  ? <img src={session.user.image} style={{ width:52, height:52, borderRadius:"50%", border:"3px solid #fff", boxShadow:"0 2px 8px rgba(123,97,255,0.2)" }} />
                  : <div style={{ width:52, height:52, borderRadius:"50%", background:"#7B61FF", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>👤</div>
                }
                <div>
                  <p style={{ fontSize:16, fontWeight:700, color:"#111", margin:"0 0 3px" }}>{session.user.name}</p>
                  <p style={{ fontSize:12, color:"#AAA", margin:0 }}>{session.user.email}</p>
                </div>
              </div>
            )}

            {/* 통계 */}
            <div style={{ margin:"0 16px 20px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
              {[
                { label:"총 기록", value:`${records.length}개` },
                { label:"평균 별점", value: records.length ? `${(records.reduce((s,r)=>s+Number(r.rating),0)/records.length).toFixed(1)}점` : "-" },
                { label:"이번 달", value:`${records.filter(r=>r.date?.slice(0,7)===new Date().toISOString().slice(0,7)).length}개` },
              ].map(s => (
                <div key={s.label} style={{ background:"#fff", borderRadius:14, padding:"14px 10px", textAlign:"center", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
                  <p style={{ fontSize:18, fontWeight:800, color:"#7B61FF", margin:"0 0 4px" }}>{s.value}</p>
                  <p style={{ fontSize:11, color:"#AAA", margin:0 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* 메뉴 */}
            <div style={{ margin:"0 16px", background:"#fff", borderRadius:18, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              {[
                { icon:"📊", label:"카테고리별 통계", action:() => setView("category") },
                { icon:"📅", label:"캘린더 보기",    action:() => setView("calendar") },
              ].map((item, i, arr) => (
                <button key={item.label} onClick={item.action}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"16px 18px", background:"none", border:"none", borderBottom:i<arr.length-1?"1px solid #F5F5F7":"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:20 }}>{item.icon}</span>
                  <span style={{ fontSize:14, fontWeight:600, color:"#333", flex:1 }}>{item.label}</span>
                  <span style={{ color:"#CCC", fontSize:16 }}>›</span>
                </button>
              ))}
            </div>

            {/* 로그아웃 */}
            <div style={{ margin:"16px 16px 0", background:"#fff", borderRadius:18, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
              <button onClick={() => signOut({ callbackUrl:"/login" })}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:14, padding:"16px 18px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                <span style={{ fontSize:20 }}>🚪</span>
                <span style={{ fontSize:14, fontWeight:600, color:"#FF6B6B", flex:1 }}>로그아웃</span>
                <span style={{ color:"#CCC", fontSize:16 }}>›</span>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════
            CALENDAR
        ══════════════════════════════════ */}
        {view === "calendar" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:110 }}>
            <div style={{ padding:"52px 20px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>캘린더</h2>
              <button style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#CCC" }}>📅</button>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px 16px" }}>
              <button onClick={() => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#555" }}>‹</button>
              <span style={{ fontSize:16, fontWeight:700, color:"#111" }}>{calYear}년 {calMonth+1}월</span>
              <button onClick={() => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#555" }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 14px", marginBottom:4 }}>
              {["일","월","화","수","목","금","토"].map((d,i) => (
                <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:600, color:i===0?"#FF6B6B":i===6?"#7B61FF":"#AAA", padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 14px", gap:"2px 0" }}>
              {Array.from({length:firstDay}).map((_,i) => <div key={`e-${i}`} />)}
              {Array.from({length:daysInMonth}).map((_,i) => {
                const day = i+1;
                const ds = calDateStr(day);
                const recs = recordsOnDay(day);
                const isSel = calSelected===ds;
                const isToday = ds===new Date().toISOString().slice(0,10);
                return (
                  <div key={day} onClick={() => setCalSelected(isSel?null:ds)} style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"3px 0",cursor:"pointer" }}>
                    <div style={{ width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isSel?"#7B61FF":isToday?"#F0EDFF":"transparent",color:isSel?"#fff":isToday?"#7B61FF":"#333",fontSize:13,fontWeight:isToday||isSel?700:400 }}>{day}</div>
                    <div style={{ display:"flex",gap:2,marginTop:2 }}>
                      {recs.slice(0,3).map((r,idx) => <div key={idx} style={{ width:4,height:4,borderRadius:"50%",background:catOf(r.category).color }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            {calSelected && (
              <div style={{ margin:"16px 14px 0" }}>
                <p style={{ fontSize:13,fontWeight:700,color:"#111",margin:"0 0 10px" }}>{calSelected.replace(/-/g,".")}</p>
                {selectedDayRecords.length===0
                  ? <p style={{ fontSize:13,color:"#CCC",textAlign:"center",padding:"20px 0" }}>이 날의 기록이 없어요</p>
                  : selectedDayRecords.map(rec => {
                    const cat = catOf(rec.category);
                    return (
                      <div key={rec.id} onClick={() => { setSelected(rec); setView("detail"); }}
                        style={{ display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:14,padding:"10px 12px",marginBottom:8,cursor:"pointer",boxShadow:"0 1px 6px rgba(0,0,0,0.06)" }}>
                        {rec.thumbnail?<img src={rec.thumbnail} style={{ width:36,height:50,objectFit:"cover",borderRadius:6,flexShrink:0 }} />:<div style={{ width:36,height:50,borderRadius:6,background:`${cat.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{cat.emoji}</div>}
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:14,fontWeight:700,color:"#111",margin:"0 0 4px" }}>{rec.title}</p>
                          <Stars v={rec.rating} size={12} />
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════
            BOTTOM NAV + FAB (통합)
            홈 | 캘린더 | [+] | 카테고리 | 더보기
        ══════════════════════════════════ */}
        {view !== "add" && (
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, display:"flex", alignItems:"center", background:"#fff", borderTop:"1px solid #F0F0F0", padding:"8px 0 20px", zIndex:20 }}>

            {/* 홈 */}
            <button onClick={() => setView("home")}
              style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
              <span style={{ fontSize:20 }}>🏠</span>
              <span style={{ fontSize:10, color:view==="home"?"#7B61FF":"#AAA", fontWeight:view==="home"?700:400 }}>홈</span>
              {view==="home" && <div style={{ width:4,height:4,borderRadius:"50%",background:"#7B61FF" }} />}
            </button>

            {/* 캘린더 */}
            <button onClick={() => setView("calendar")}
              style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
              <span style={{ fontSize:20 }}>📅</span>
              <span style={{ fontSize:10, color:view==="calendar"?"#7B61FF":"#AAA", fontWeight:view==="calendar"?700:400 }}>캘린더</span>
              {view==="calendar" && <div style={{ width:4,height:4,borderRadius:"50%",background:"#7B61FF" }} />}
            </button>

            {/* + FAB — 가운데 */}
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
              <button onClick={() => { reset(); setView("add"); }}
                style={{ width:52, height:52, borderRadius:"50%", background:"#7B61FF", border:"none", color:"#fff", fontSize:28, cursor:"pointer", boxShadow:"0 4px 20px rgba(123,97,255,0.45)", display:"flex", alignItems:"center", justifyContent:"center", transition:"transform 0.15s", marginBottom:8 }}
                onMouseEnter={e=>(e.currentTarget.style.transform="scale(1.1)")}
                onMouseLeave={e=>(e.currentTarget.style.transform="")}>
                +
              </button>
            </div>

            {/* 카테고리 */}
            <button onClick={() => setView("category")}
              style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
              <span style={{ fontSize:20 }}>🗂️</span>
              <span style={{ fontSize:10, color:view==="category"?"#7B61FF":"#AAA", fontWeight:view==="category"?700:400 }}>카테고리</span>
              {view==="category" && <div style={{ width:4,height:4,borderRadius:"50%",background:"#7B61FF" }} />}
            </button>

            {/* 더보기 → 더보기 화면으로 */}
            <button onClick={() => setView("more" as any)}
              style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0" }}>
              <span style={{ fontSize:20 }}>⋯</span>
              <span style={{ fontSize:10, color:(view as string)==="more"?"#7B61FF":"#AAA", fontWeight:(view as string)==="more"?700:400 }}>더보기</span>
              {(view as string)==="more" && <div style={{ width:4,height:4,borderRadius:"50%",background:"#7B61FF" }} />}
            </button>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}