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

// ── Neumorphism 색상 & 스타일 팔레트 ──────────────────────────────
const N = {
  bg:      "#EAEAF0",
  surface: "#EAEAF0",
  shadow1: "rgba(163,163,185,0.6)",
  shadow2: "rgba(255,255,255,0.92)",
  text:    "#4A4A6A",
  textSub: "#8A8AA8",
  textMut: "#AAAAC0",
  raised:  "7px 7px 16px rgba(163,163,185,0.55), -7px -7px 16px rgba(255,255,255,0.9)",
  raisedSm:"4px 4px 10px rgba(163,163,185,0.5), -4px -4px 10px rgba(255,255,255,0.85)",
  inset:   "inset 4px 4px 10px rgba(163,163,185,0.45), inset -4px -4px 10px rgba(255,255,255,0.8)",
  insetSm: "inset 3px 3px 7px rgba(163,163,185,0.4), inset -3px -3px 7px rgba(255,255,255,0.75)",
  accent:  "#7B6BEF",
  accentShadow: "4px 4px 12px rgba(123,107,239,0.45), -2px -2px 6px rgba(255,255,255,0.3)",
};

// ── Categories ─────────────────────────────────────────────────────
const CATS = [
  { id:"book",       label:"책",          emoji:"📚", color:"#7B6BEF" },
  { id:"movie",      label:"영화",        emoji:"🎬", color:"#EF6B7B" },
  { id:"exhibition", label:"전시",        emoji:"🖼️", color:"#EFB36B" },
  { id:"musical",    label:"공연/뮤지컬", emoji:"🎭", color:"#EF6BAF" },
  { id:"concert",    label:"콘서트",      emoji:"🎵", color:"#2DCBA0" }, // 민트→더 진하게
];
const catOf = (id: string) => CATS.find(c => c.id === id) ?? CATS[0];

// ── Helpers ────────────────────────────────────────────────────────
function Stars({ v, onChange, size = 18 }: { v: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display:"flex", gap:3 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize:size, color: s<=(hover||v) ? "#F0A500" : N.textMut, cursor:onChange?"pointer":"default", userSelect:"none", lineHeight:1, filter: s<=(hover||v) ? "drop-shadow(0 0 3px rgba(240,165,0,0.4))" : "none", transition:"all 0.15s" }}>
          ★
        </span>
      ))}
    </div>
  );
}

// Fix 9: UTC 오프셋 보정으로 날짜 하루 밀림 방지
function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${y}.${m}.${day}`;
}

function todayStr() { return new Date().toISOString().slice(0,10); }
function getDaysInMonth(y: number, m: number) { return new Date(y,m+1,0).getDate(); }
function getFirstDay(y: number, m: number) { return new Date(y,m,1).getDay(); }

// ── Neumorphism input style ────────────────────────────────────────
const neuInput: React.CSSProperties = {
  width:"100%", padding:"13px 16px", borderRadius:14,
  border:"none", outline:"none", fontFamily:"inherit",
  background:N.bg, boxSizing:"border-box",
  fontSize:16, // 16px 이상이어야 iOS 줌 방지
  color:N.text, boxShadow:N.inset,
};

// ── ImageUrlInput ──────────────────────────────────────────────────
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
          style={{ ...neuInput, paddingRight:40 }} />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>
          {status==="loading"?"⏳":status==="ok"?"✅":status==="warn"?"⚠️":"🔗"}
        </span>
      </div>
      {status==="ok" && value && (
        <div style={{ marginTop:10, position:"relative", display:"inline-block" }}>
          <img src={value} style={{ height:80, borderRadius:10, objectFit:"cover", boxShadow:N.raisedSm }} onError={e=>{(e.target as HTMLImageElement).style.display="none";}} />
          <button onClick={()=>{onChange("");setInput("");setStatus("idle");}}
            style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:"#EF6B7B", border:"2px solid "+N.bg, color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
      )}
      <p style={{ fontSize:11, color:N.textMut, margin:"6px 0 0", lineHeight:1.5 }}>나무위키·공식사이트에서 우클릭 → 이미지 주소 복사</p>
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
        if (hr.ok) { const d:any[]=await hr.json(); d.forEach(r=>results.push({id:`h-${r.type}-${r.value}`,source:"history",type:r.type,title:r.value,author:r.author,venue:r.venue,thumbnail:r.thumbnail,category:r.category})); }
        if (cat.id==="book"||cat.id==="movie") {
          const ep=cat.id==="book"?"/api/search/books":"/api/search/movies";
          const ar=await fetch(`${ep}?q=${encodeURIComponent(query)}`);
          if (ar.ok) { const d:any[]=await ar.json(); d.slice(0,6).forEach(i=>results.push({...i,source:"api" as const})); }
        }
        setSuggestions(results);
      } catch(e){console.error(e);}
      finally{setLoading(false);}
    }, 350);
  }, [query, category, enabled]);

  return { suggestions, loading, clear: ()=>setSuggestions([]) };
}

// ── Main ───────────────────────────────────────────────────────────
// Fix 3: EMPTY는 reset 시점에 todayStr() 호출하도록 함수로
const makeEmpty = () => ({ category:"", title:"", date:todayStr(), rating:0, review:"", thumbnail:"", author:"", venue:"" });

export default function Home() {
  const { data:session, status } = useSession();
  const router = useRouter();
  const [records, setRecords] = useState<CultureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home"|"add"|"detail"|"category"|"calendar"|"more">("home");
  const [selected, setSelected] = useState<CultureRecord|null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [form, setForm] = useState(makeEmpty);
  const [editId, setEditId] = useState<number|null>(null);
  const [saving, setSaving] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelected, setCalSelected] = useState<string|null>(null);

  const { suggestions, loading:acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  useEffect(()=>{ if(status==="unauthenticated") router.push("/login"); },[status]);
  useEffect(()=>{ if(status==="authenticated") fetchRecords(); },[status]);

  async function fetchRecords() {
    setLoading(true);
    try { const r=await fetch("/api/records"); if(r.ok) setRecords(await r.json()); } catch(e){console.error(e);}
    setLoading(false);
  }
  async function save() {
    if (!form.title||!form.category||!form.rating) return;
    setSaving(true);
    try {
      if (editId) {
        await fetch(`/api/records/${editId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
        await fetchRecords();
        // 수정 후 상세 화면으로 돌아가기 — 업데이트된 record 반영
        const updated = { ...selected!, ...form, id: editId };
        setSelected(updated);
        reset();
        setView("detail");
      } else {
        await fetch("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
        await fetchRecords();
        reset();
        setView("home");
      }
    } finally { setSaving(false); }
  }
  async function del(id: number) {
    if (!confirm("삭제할까요?")) return;
    await fetch(`/api/records/${id}`,{method:"DELETE"});
    await fetchRecords(); setView("home");
  }
  function reset() { setForm(makeEmpty()); setEditId(null); setTitleQuery(""); clear(); setShowSug(false); }
  function openEdit(r: CultureRecord) {
    setForm({category:r.category,title:r.title,date:r.date.slice(0,10),rating:r.rating,review:r.review??"",thumbnail:r.thumbnail??"",author:r.author??"",venue:r.venue??""});
    setTitleQuery(r.title); setEditId(r.id); setView("add");
  }
  function pickSug(s: Suggestion) {
    if (s.source==="history"&&s.type==="author") setForm(f=>({...f,author:s.title}));
    else if (s.source==="history"&&s.type==="venue") setForm(f=>({...f,venue:s.title}));
    else { setForm(f=>({...f,title:s.title,author:s.author??f.author,thumbnail:s.thumbnail??f.thumbnail,venue:s.venue??f.venue})); setTitleQuery(s.title); }
    clear(); setShowSug(false);
  }

  const filtered = filterCat==="all" ? records : records.filter(r=>r.category===filterCat);
  const activeCat = catOf(form.category);
  const canSave = !!form.title&&!!form.category&&!!form.rating;
  const daysInMonth = getDaysInMonth(calYear,calMonth);
  const firstDay = getFirstDay(calYear,calMonth);
  const calDateStr = (d:number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d:number) => records.filter(r=>r.date?.slice(0,10)===calDateStr(d));
  const selectedDayRecords = calSelected ? records.filter(r=>r.date?.slice(0,10)===calSelected) : [];

  if (status==="loading") return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:N.bg,color:N.textSub}}>로딩 중...</div>;

  // ── 공통 스타일 ─────────────────────────────────────────────────
  const screenWrap: React.CSSProperties = { flex:1, overflowY:"auto", paddingBottom:110 };
  const sectionLabel: React.CSSProperties = { fontSize:11, fontWeight:700, color:N.textMut, letterSpacing:"0.8px", margin:"0 0 10px", textTransform:"uppercase" };

  // ── 뉴모피즘 카드 ───────────────────────────────────────────────
  function NeuCard({ children, onClick, style }: { children: React.ReactNode; onClick?: ()=>void; style?: React.CSSProperties }) {
    return (
      <div onClick={onClick} style={{ background:N.bg, borderRadius:20, boxShadow:N.raised, padding:"14px", cursor:onClick?"pointer":"default", transition:"box-shadow 0.2s", ...style }}
        onMouseEnter={e=>{ if(onClick) e.currentTarget.style.boxShadow=N.inset; }}
        onMouseLeave={e=>{ if(onClick) e.currentTarget.style.boxShadow=N.raised; }}>
        {children}
      </div>
    );
  }

  // ── 뒤로가기 버튼 ───────────────────────────────────────────────
  function BackBtn({ to }: { to: "home"|"category"|"add" }) {
    return (
      <button onClick={()=>setView(to)}
        style={{ display:"flex", alignItems:"center", gap:6, background:N.bg, border:"none", borderRadius:14, padding:"10px 16px 10px 10px", boxShadow:N.raisedSm, cursor:"pointer", fontFamily:"inherit", color:N.text, fontWeight:700, fontSize:15 }}>
        <span style={{ fontSize:22, lineHeight:1, color:N.accent }}>‹</span>
        <span>뒤로</span>
      </button>
    );
  }

  return (
    <div style={{ fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:N.bg, minHeight:"100vh", display:"flex", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:390, background:N.bg, minHeight:"100vh", display:"flex", flexDirection:"column", position:"relative" }}>

        {/* ══ HOME ══════════════════════════════════════════════════ */}
        {view==="home" && (
          <div style={screenWrap}>
            <div style={{ padding:"44px 20px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h1 style={{ fontSize:22, fontWeight:800, color:N.text, margin:0 }}>나의 문화 기록</h1>
              <div style={{ display:"flex", gap:10 }}>
                {[{e:"🔍"},{e:"🔔"}].map(b=>(
                  <div key={b.e} style={{ width:38, height:38, borderRadius:12, background:N.bg, boxShadow:N.raisedSm, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, cursor:"pointer" }}>{b.e}</div>
                ))}
              </div>
            </div>

            {/* 카테고리 필터 */}
            <div style={{ padding:"0 16px 14px", display:"flex", gap:8, overflowX:"auto" }}>
              {[{id:"all",label:"전체"},...CATS].map(c=>(
                <button key={c.id} onClick={()=>setFilterCat(c.id)}
                  style={{ padding:"7px 14px", borderRadius:20, border:"none", background:N.bg, color:filterCat===c.id?N.accent:N.textSub, fontWeight:filterCat===c.id?700:500, fontSize:12, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0, boxShadow:filterCat===c.id?N.inset:N.raisedSm, transition:"all 0.2s" }}>
                  {c.label}
                </button>
              ))}
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 20px 12px" }}>
              <span style={{ fontSize:13, fontWeight:700, color:N.text }}>최근 기록</span>
              <button onClick={()=>setView("category")} style={{ background:"none", border:"none", fontSize:12, color:N.accent, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>전체 보기</button>
            </div>

            <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:12 }}>
              {loading ? (
                <div style={{ textAlign:"center", padding:60, color:N.textMut }}>불러오는 중...</div>
              ) : records.length===0 ? (
                <div style={{ textAlign:"center", padding:"60px 0" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
                  <p style={{ color:N.textMut, fontSize:14 }}>아직 기록이 없어요</p>
                </div>
              ) : filtered.map(rec=>{
                const cat=catOf(rec.category);
                return (
                  <NeuCard key={rec.id} onClick={()=>{setSelected(rec);setView("detail");}}>
                    <div style={{ display:"flex", alignItems:"center", gap:12, overflow:"hidden" }}>
                      {rec.thumbnail
                        ? <img src={rec.thumbnail} style={{ width:54,height:72,objectFit:"cover",borderRadius:12,flexShrink:0,boxShadow:N.raisedSm }} />
                        : <div style={{ width:54,height:72,borderRadius:12,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,boxShadow:N.insetSm }}>{cat.emoji}</div>
                      }
                      <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:5 }}>
                          <span style={{ width:7,height:7,borderRadius:"50%",background:cat.color,display:"inline-block",flexShrink:0,boxShadow:`0 0 6px ${cat.color}` }} />
                          <span style={{ fontSize:11,color:cat.color,fontWeight:700 }}>{cat.label}</span>
                        </div>
                        <p style={{ fontSize:16,fontWeight:700,color:N.text,margin:"0 0 5px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.title}</p>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <Stars v={Number(rec.rating)} size={13} />
                            <span style={{ fontSize:11,color:N.textSub,fontWeight:600 }}>{Number(rec.rating).toFixed(1)}</span>
                          </div>
                          <span style={{ fontSize:11,color:N.textMut,flexShrink:0 }}>{formatDate(rec.date)}</span>
                        </div>
                        {rec.review && <p style={{ fontSize:12,color:N.textSub,margin:"4px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.review}</p>}
                      </div>
                    </div>
                  </NeuCard>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ ADD / EDIT ════════════════════════════════════════════ */}
        {view==="add" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:140 }}>
            {/* 헤더 */}
            <div style={{ display:"flex", alignItems:"center", padding:"44px 20px 16px", gap:12 }}>
              <button onClick={()=>{reset(); setView(editId ? "detail" : "home");}}
                style={{ width:38,height:38,borderRadius:12,background:N.bg,border:"none",boxShadow:N.raisedSm,cursor:"pointer",fontSize:18,color:N.textSub,display:"flex",alignItems:"center",justifyContent:"center" }}>✕</button>
              <p style={{ flex:1,fontSize:17,fontWeight:700,textAlign:"center",margin:0,color:N.text }}>{editId?"기록 수정":"기록 추가"}</p>
              <div style={{ width:38 }} />
            </div>

            <div style={{ padding:"0 20px" }}>
              {/* 카테고리 */}
              <p style={sectionLabel}>카테고리 선택</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:24 }}>
                {CATS.map(c=>(
                  <button key={c.id} onClick={()=>{setForm(f=>({...f,category:c.id}));setTitleQuery("");clear();}}
                    style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"12px 4px",borderRadius:16,border:"none",background:N.bg,cursor:"pointer",fontFamily:"inherit",boxShadow:form.category===c.id?N.inset:N.raisedSm,transition:"all 0.2s" }}>
                    <span style={{ fontSize:22 }}>{c.emoji}</span>
                    <span style={{ fontSize:10,fontWeight:600,color:form.category===c.id?c.color:N.textMut,textAlign:"center",lineHeight:1.3 }}>{c.label}</span>
                  </button>
                ))}
              </div>

              {/* 제목 */}
              <p style={sectionLabel}>
                제목 {form.category && <span style={{ color:N.accent,textTransform:"none",fontWeight:400,fontSize:10 }}>— {activeCat.id==="book"||activeCat.id==="movie"?"검색 or 내 기록 자동완성":"내 기록 자동완성"}</span>}
              </p>
              <div style={{ position:"relative", marginBottom:6 }}>
                <input value={titleQuery}
                  onChange={e=>{setTitleQuery(e.target.value);setForm(f=>({...f,title:e.target.value,thumbnail:""}));setShowSug(true);}}
                  onFocus={()=>setShowSug(true)}
                  onBlur={()=>setTimeout(()=>setShowSug(false),150)}
                  placeholder={form.category?`${activeCat.emoji} 제목을 입력하세요`:"카테고리를 먼저 선택하세요"}
                  disabled={!form.category}
                  style={{ ...neuInput, paddingRight:40 }}
                />
                {acLoading && <div style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",width:14,height:14,border:"2px solid "+N.textMut,borderTopColor:N.accent,borderRadius:"50%",animation:"spin 0.6s linear infinite" }} />}
              </div>

              {/* 자동완성 드롭다운 */}
              <div style={{ position:"relative", marginBottom: showSug && suggestions.length>0 ? 250 : 0, transition:"margin 0.2s" }}>
                {showSug && suggestions.length>0 && (
                  <div style={{ position:"absolute",top:0,left:0,right:0,background:N.bg,borderRadius:16,boxShadow:"0 12px 32px rgba(100,100,140,0.2)",maxHeight:240,overflowY:"auto",zIndex:50 }}>
                    {suggestions.filter(s=>s.source==="history").length>0 && <>
                      <div style={{ padding:"8px 14px 2px",fontSize:10,color:N.accent,fontWeight:700,letterSpacing:1 }}>내 기록</div>
                      {suggestions.filter(s=>s.source==="history").map(s=>(
                        <div key={s.id} onClick={()=>pickSug(s)}
                          style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${N.shadow1}20` }}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(123,107,239,0.06)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="")}>
                          <span style={{ fontSize:15 }}>{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                          <span style={{ fontSize:13,color:N.text,fontWeight:500 }}>{s.title}</span>
                          <span style={{ marginLeft:"auto",fontSize:10,color:N.accent,background:"rgba(123,107,239,0.1)",padding:"2px 6px",borderRadius:8,flexShrink:0 }}>내 기록</span>
                        </div>
                      ))}
                    </>}
                    {suggestions.filter(s=>s.source==="api").length>0 && <>
                      <div style={{ padding:"8px 14px 2px",fontSize:10,color:"#6BB5EF",fontWeight:700,letterSpacing:1 }}>검색 결과</div>
                      {suggestions.filter(s=>s.source==="api").map(s=>(
                        <div key={s.id} onClick={()=>pickSug(s)}
                          style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${N.shadow1}20` }}
                          onMouseEnter={e=>(e.currentTarget.style.background="rgba(107,181,239,0.06)")}
                          onMouseLeave={e=>(e.currentTarget.style.background="")}>
                          {s.thumbnail
                            ? <img src={s.thumbnail} style={{ width:30,height:42,objectFit:"cover",borderRadius:6,flexShrink:0 }} />
                            : <div style={{ width:30,height:42,borderRadius:6,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0,boxShadow:N.insetSm }}>{activeCat.emoji}</div>
                          }
                          <div style={{ minWidth:0 }}>
                            <p style={{ fontSize:13,fontWeight:600,color:N.text,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.title}</p>
                            {s.author && <p style={{ fontSize:11,color:N.textMut,margin:0 }}>{s.author}{s.publishedDate?` · ${s.publishedDate.slice(0,4)}`:""}</p>}
                          </div>
                        </div>
                      ))}
                    </>}
                  </div>
                )}
              </div>

              {/* 선택 프리뷰 */}
              {form.thumbnail && !showSug && (
                <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:N.bg,borderRadius:14,marginBottom:16,boxShadow:N.inset }}>
                  <img src={form.thumbnail} style={{ width:34,height:48,objectFit:"cover",borderRadius:8 }} />
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ fontSize:13,fontWeight:700,margin:"0 0 2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:N.text }}>{form.title}</p>
                    {form.author && <p style={{ fontSize:11,color:N.textMut,margin:0 }}>{form.author}</p>}
                  </div>
                  <button onClick={()=>setForm(f=>({...f,thumbnail:"",author:""}))} style={{ background:"none",border:"none",color:N.textMut,cursor:"pointer",fontSize:16,padding:0 }}>✕</button>
                </div>
              )}

              {/* 날짜 — 오늘 이후 선택 불가 */}
              <p style={{ ...sectionLabel, marginTop:4 }}>날짜</p>
              <input type="date" value={form.date} max={todayStr()}
                onChange={e=>setForm(f=>({...f,date:e.target.value}))}
                style={{ ...neuInput, marginBottom:18 }}
              />

              {/* 장소 — 책 제외 */}
              {form.category && form.category!=="book" && (
                <>
                  <p style={sectionLabel}>장소 <span style={{ color:N.textMut,textTransform:"none",fontWeight:400 }}>(선택)</span></p>
                  <input value={form.venue} onChange={e=>setForm(f=>({...f,venue:e.target.value}))}
                    placeholder={
                      form.category==="movie"?"예) CGV 강남, 메가박스 코엑스":
                      form.category==="exhibition"?"예) 국립현대미술관, 예술의전당":
                      form.category==="musical"?"예) 블루스퀘어 신한카드홀":
                      form.category==="concert"?"예) 올림픽공원 KSPO돔":"어디서 봤나요?"
                    }
                    style={{ ...neuInput, marginBottom:18 }}
                  />
                </>
              )}

              {/* 별점 */}
              <p style={sectionLabel}>별점</p>
              <div style={{ marginBottom:20 }}>
                <Stars v={form.rating} onChange={v=>setForm(f=>({...f,rating:v}))} size={34} />
              </div>

              {/* 한줄 리뷰 */}
              <p style={sectionLabel}>한 줄 리뷰 <span style={{ color:N.textMut,textTransform:"none",fontWeight:400 }}>(선택)</span></p>
              <textarea value={form.review} onChange={e=>setForm(f=>({...f,review:e.target.value.slice(0,100)}))}
                placeholder="한 줄로 느낀 점을 남겨보세요." maxLength={100} rows={3}
                style={{ ...neuInput, resize:"none", lineHeight:1.7, marginBottom:4 }} />
              <p style={{ textAlign:"right",fontSize:11,color:N.textMut,margin:"0 0 20px" }}>{form.review.length}/100</p>

              {/* 이미지 URL — 전시/공연/콘서트만 */}
              {form.category && !["book","movie"].includes(form.category) && (
                <>
                  <p style={sectionLabel}>이미지 <span style={{ color:N.textMut,textTransform:"none",fontWeight:400 }}>(선택)</span></p>
                  <ImageUrlInput value={form.thumbnail} onChange={url=>setForm(f=>({...f,thumbnail:url}))} />
                </>
              )}
            </div>

            {/* 저장 버튼 */}
            <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:390,padding:"12px 20px 24px",background:N.bg,zIndex:20 }}>
              <button onClick={save} disabled={!canSave||saving}
                style={{ width:"100%",padding:"16px",borderRadius:18,border:"none",background:N.bg,color:canSave?N.accent:N.textMut,fontSize:16,fontWeight:700,cursor:canSave?"pointer":"default",fontFamily:"inherit",boxShadow:canSave?N.raised:"none",transition:"all 0.2s" }}>
                {saving?"저장 중...":"저장하기"}
              </button>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════ */}
        {view==="detail" && selected && (()=>{
          const cat=catOf(selected.category);
          return (
            <div style={screenWrap}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"44px 20px 16px" }}>
                <BackBtn to="home" />
                <button style={{ width:38,height:38,borderRadius:12,background:N.bg,border:"none",boxShadow:N.raisedSm,cursor:"pointer",fontSize:18,color:N.textMut,display:"flex",alignItems:"center",justifyContent:"center" }}>⋮</button>
              </div>

              {/* Hero */}
              <div style={{ margin:"0 16px 16px" }}>
                <NeuCard>
                  <div style={{ display:"flex",gap:16,alignItems:"flex-start" }}>
                    {selected.thumbnail
                      ? <img src={selected.thumbnail} style={{ width:100,height:140,objectFit:"cover",borderRadius:14,boxShadow:N.raised,flexShrink:0 }} />
                      : <div style={{ width:100,height:140,borderRadius:14,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:44,flexShrink:0,boxShadow:N.inset }}>{cat.emoji}</div>
                    }
                    <div style={{ flex:1,paddingTop:4 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:8 }}>
                        <span style={{ width:8,height:8,borderRadius:"50%",background:cat.color,display:"inline-block",boxShadow:`0 0 6px ${cat.color}` }} />
                        <span style={{ fontSize:12,color:cat.color,fontWeight:700 }}>{cat.label}</span>
                      </div>
                      <h2 style={{ fontSize:20,fontWeight:800,color:N.text,margin:"0 0 10px",lineHeight:1.3,wordBreak:"keep-all" }}>{selected.title}</h2>
                      {selected.author && <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:5 }}><span style={{ fontSize:12,color:N.textMut }}>👤</span><span style={{ fontSize:13,color:N.textSub }}>{selected.author}</span></div>}
                      {selected.venue && <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:5 }}><span style={{ fontSize:12,color:N.textMut }}>📍</span><span style={{ fontSize:13,color:N.textSub }}>{selected.venue}</span></div>}
                      <div style={{ display:"flex",alignItems:"center",gap:5 }}><span style={{ fontSize:12,color:N.textMut }}>📅</span><span style={{ fontSize:12,color:N.textMut }}>{formatDate(selected.date)}</span></div>
                    </div>
                  </div>
                </NeuCard>
              </div>

              {/* 별점 + 리뷰 */}
              <div style={{ margin:"0 16px 16px" }}>
                <NeuCard>
                  <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:selected.review?14:0 }}>
                    <Stars v={Number(selected.rating)} size={24} />
                    <span style={{ fontSize:20,fontWeight:800,color:N.text }}>{Number(selected.rating).toFixed(1)}</span>
                  </div>
                  {selected.review && (
                    <div style={{ paddingTop:12,borderTop:`1px solid ${N.shadow1}30` }}>
                      <p style={{ fontSize:11,fontWeight:700,color:N.textMut,margin:"0 0 6px",letterSpacing:0.5 }}>한 줄 리뷰</p>
                      <p style={{ fontSize:14,color:N.textSub,lineHeight:1.8,margin:0 }}>"{selected.review}"</p>
                    </div>
                  )}
                </NeuCard>
              </div>

              {/* 수정/삭제 */}
              <div style={{ display:"flex",gap:12,padding:"0 16px" }}>
                <button onClick={()=>openEdit(selected)} style={{ flex:1,padding:14,borderRadius:16,border:"none",background:N.bg,color:N.accent,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:N.raised }}>수정</button>
                <button onClick={()=>del(selected.id)} style={{ flex:1,padding:14,borderRadius:16,border:"none",background:N.bg,color:"#EF6B7B",fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",boxShadow:N.raised }}>삭제</button>
              </div>
            </div>
          );
        })()}

        {/* ══ CATEGORY ══════════════════════════════════════════════ */}
        {view==="category" && (
          <div style={screenWrap}>
            <div style={{ display:"flex",alignItems:"center",padding:"44px 20px 14px",gap:12 }}>
              <BackBtn to="home" />
              <p style={{ flex:1,fontSize:17,fontWeight:700,textAlign:"center",margin:0,color:N.text }}>카테고리</p>
              <div style={{ width:80 }} />
            </div>
            <div style={{ display:"flex",gap:8,padding:"0 16px 12px",overflowX:"auto" }}>
              {[{id:"all",label:"전체"},...CATS].map(c=>(
                <button key={c.id} onClick={()=>setFilterCat(c.id)}
                  style={{ padding:"7px 14px",borderRadius:20,border:"none",background:N.bg,color:filterCat===c.id?N.accent:N.textSub,fontWeight:filterCat===c.id?700:500,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0,boxShadow:filterCat===c.id?N.inset:N.raisedSm,transition:"all 0.2s" }}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display:"flex",justifyContent:"flex-end",padding:"0 20px 8px" }}>
              <span style={{ fontSize:12,color:N.textMut }}>최신순 ∨</span>
            </div>
            <div style={{ padding:"0 16px",display:"flex",flexDirection:"column",gap:12 }}>
              {filtered.length===0
                ? <div style={{ textAlign:"center",padding:60,color:N.textMut }}>기록이 없어요</div>
                : filtered.map(rec=>{
                  const cat=catOf(rec.category);
                  return (
                    <NeuCard key={rec.id} onClick={()=>{setSelected(rec);setView("detail");}}>
                      <div style={{ display:"flex",alignItems:"center",gap:12,overflow:"hidden" }}>
                        {rec.thumbnail
                          ? <img src={rec.thumbnail} style={{ width:48,height:64,objectFit:"cover",borderRadius:10,flexShrink:0 }} />
                          : <div style={{ width:48,height:64,borderRadius:10,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,boxShadow:N.insetSm }}>{cat.emoji}</div>
                        }
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:3 }}>
                            <span style={{ width:7,height:7,borderRadius:"50%",background:cat.color,display:"inline-block",boxShadow:`0 0 5px ${cat.color}` }} />
                            <span style={{ fontSize:11,color:cat.color,fontWeight:700 }}>{cat.label}</span>
                          </div>
                          <p style={{ fontSize:15,fontWeight:700,color:N.text,margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.title}</p>
                          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                            <Stars v={Number(rec.rating)} size={12} />
                            <span style={{ fontSize:11,color:N.textMut }}>{formatDate(rec.date)}</span>
                          </div>
                          {rec.review && <p style={{ fontSize:12,color:N.textSub,margin:"3px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.review}</p>}
                        </div>
                      </div>
                    </NeuCard>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* ══ CALENDAR ══════════════════════════════════════════════ */}
        {view==="calendar" && (
          <div style={screenWrap}>
            <div style={{ padding:"44px 20px 10px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <h2 style={{ fontSize:20,fontWeight:800,color:N.text,margin:0 }}>캘린더</h2>
            </div>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px 16px" }}>
              <button onClick={()=>{if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1);}} style={{ width:36,height:36,borderRadius:12,border:"none",background:N.bg,boxShadow:N.raisedSm,cursor:"pointer",fontSize:18,color:N.textSub }}>‹</button>
              <span style={{ fontSize:16,fontWeight:700,color:N.text }}>{calYear}년 {calMonth+1}월</span>
              <button onClick={()=>{if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1);}} style={{ width:36,height:36,borderRadius:12,border:"none",background:N.bg,boxShadow:N.raisedSm,cursor:"pointer",fontSize:18,color:N.textSub }}>›</button>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 14px",marginBottom:4 }}>
              {["일","월","화","수","목","금","토"].map((d,i)=>(
                <div key={d} style={{ textAlign:"center",fontSize:11,fontWeight:600,color:i===0?"#EF6B7B":i===6?N.accent:N.textMut,padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 14px",gap:"4px 0" }}>
              {Array.from({length:firstDay}).map((_,i)=><div key={`e-${i}`} />)}
              {Array.from({length:daysInMonth}).map((_,i)=>{
                const day=i+1; const ds=calDateStr(day); const recs=recordsOnDay(day);
                const isSel=calSelected===ds; const isToday=ds===todayStr();
                return (
                  <div key={day} onClick={()=>setCalSelected(isSel?null:ds)} style={{ display:"flex",flexDirection:"column",alignItems:"center",padding:"3px 0",cursor:"pointer" }}>
                    <div style={{ width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:N.bg,color:isSel?N.accent:isToday?"#EF6B7B":N.text,fontSize:13,fontWeight:isToday||isSel?700:400,boxShadow:isSel?N.inset:isToday?N.raisedSm:"none" }}>{day}</div>
                    <div style={{ display:"flex",gap:2,marginTop:2 }}>
                      {recs.slice(0,3).map((r,idx)=><div key={idx} style={{ width:4,height:4,borderRadius:"50%",background:catOf(r.category).color,boxShadow:`0 0 4px ${catOf(r.category).color}` }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            {calSelected && (
              <div style={{ margin:"16px 16px 0" }}>
                <p style={{ fontSize:13,fontWeight:700,color:N.text,margin:"0 0 10px" }}>{calSelected.replace(/-/g,".")}</p>
                {selectedDayRecords.length===0
                  ? <p style={{ fontSize:13,color:N.textMut,textAlign:"center",padding:"20px 0" }}>이 날의 기록이 없어요</p>
                  : selectedDayRecords.map(rec=>{
                    const cat=catOf(rec.category);
                    return (
                      <NeuCard key={rec.id} onClick={()=>{setSelected(rec);setView("detail");}} style={{ marginBottom:8 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                          {rec.thumbnail?<img src={rec.thumbnail} style={{ width:36,height:50,objectFit:"cover",borderRadius:8,flexShrink:0 }} />:<div style={{ width:36,height:50,borderRadius:8,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:N.insetSm }}>{cat.emoji}</div>}
                          <div style={{ flex:1 }}>
                            <p style={{ fontSize:14,fontWeight:700,color:N.text,margin:"0 0 4px" }}>{rec.title}</p>
                            <Stars v={Number(rec.rating)} size={12} />
                          </div>
                        </div>
                      </NeuCard>
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
            <div style={{ padding:"44px 20px 20px" }}>
              <h2 style={{ fontSize:22,fontWeight:800,color:N.text,margin:0 }}>더보기</h2>
            </div>
            {session?.user && (
              <div style={{ margin:"0 16px 20px" }}>
                <NeuCard>
                  <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                    {session.user.image
                      ? <img src={session.user.image} style={{ width:52,height:52,borderRadius:"50%",boxShadow:N.raised }} />
                      : <div style={{ width:52,height:52,borderRadius:"50%",background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,boxShadow:N.inset }}>👤</div>
                    }
                    <div>
                      <p style={{ fontSize:16,fontWeight:700,color:N.text,margin:"0 0 3px" }}>{session.user.name}</p>
                      <p style={{ fontSize:12,color:N.textMut,margin:0 }}>{session.user.email}</p>
                    </div>
                  </div>
                </NeuCard>
              </div>
            )}
            <div style={{ margin:"0 16px 20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
              {[
                { label:"총 기록", value:`${records.length}개` },
                { label:"평균 별점", value:records.length?`${(records.reduce((s,r)=>s+Number(r.rating),0)/records.length).toFixed(1)}점`:"-" },
                { label:"이번 달", value:`${records.filter(r=>r.date?.slice(0,7)===new Date().toISOString().slice(0,7)).length}개` },
              ].map(s=>(
                <NeuCard key={s.label}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:18,fontWeight:800,color:N.accent,margin:"0 0 4px" }}>{s.value}</p>
                    <p style={{ fontSize:11,color:N.textMut,margin:0 }}>{s.label}</p>
                  </div>
                </NeuCard>
              ))}
            </div>
            <div style={{ margin:"0 16px" }}>
              <NeuCard>
                {[
                  {icon:"📊",label:"카테고리별 보기",action:()=>setView("category")},
                  {icon:"📅",label:"캘린더 보기",action:()=>setView("calendar")},
                ].map((item,i,arr)=>(
                  <button key={item.label} onClick={item.action}
                    style={{ width:"100%",display:"flex",alignItems:"center",gap:14,padding:"14px 4px",background:"none",border:"none",borderBottom:i<arr.length-1?`1px solid ${N.shadow1}25`:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                    <span style={{ fontSize:20 }}>{item.icon}</span>
                    <span style={{ fontSize:14,fontWeight:600,color:N.text,flex:1 }}>{item.label}</span>
                    <span style={{ color:N.textMut,fontSize:16 }}>›</span>
                  </button>
                ))}
              </NeuCard>
            </div>
            <div style={{ margin:"16px 16px 0" }}>
              <NeuCard>
                <button onClick={()=>{ setRecords([]); signOut({callbackUrl:"/login"}); }}
                  style={{ width:"100%",display:"flex",alignItems:"center",gap:14,padding:"4px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left" }}>
                  <span style={{ fontSize:20 }}>🚪</span>
                  <span style={{ fontSize:14,fontWeight:600,color:"#EF6B7B",flex:1 }}>로그아웃</span>
                  <span style={{ color:N.textMut,fontSize:16 }}>›</span>
                </button>
              </NeuCard>
            </div>
          </div>
        )}

        {/* ══ BOTTOM NAV ════════════════════════════════════════════ */}
        {view!=="add" && (
          <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:390,display:"flex",alignItems:"center",background:N.bg,borderTop:`1px solid ${N.shadow1}30`,padding:"6px 0 18px",zIndex:20 }}>
            {[{id:"home",label:"홈",emoji:"🏠"},{id:"calendar",label:"캘린더",emoji:"📅"}].map(n=>(
              <button key={n.id} onClick={()=>setView(n.id as any)}
                style={{ flex:1,border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"inherit",padding:"4px 0" }}>
                <div style={{ width:36,height:36,borderRadius:12,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:view===n.id?N.inset:N.raisedSm,transition:"all 0.2s" }}>{n.emoji}</div>
                <span style={{ fontSize:10,color:view===n.id?N.accent:N.textMut,fontWeight:view===n.id?700:400 }}>{n.label}</span>
              </button>
            ))}
            {/* FAB */}
            <div style={{ flex:1,display:"flex",justifyContent:"center",alignItems:"center" }}>
              <button onClick={()=>{reset();setView("add");}}
                style={{ width:52,height:52,borderRadius:18,background:N.bg,border:"none",color:N.accent,fontSize:28,cursor:"pointer",boxShadow:N.accentShadow,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6,transition:"all 0.2s" }}
                onMouseEnter={e=>(e.currentTarget.style.boxShadow=N.inset)}
                onMouseLeave={e=>(e.currentTarget.style.boxShadow=N.accentShadow)}>
                +
              </button>
            </div>
            {[{id:"category",label:"카테고리",emoji:"🗂️"},{id:"more",label:"더보기",emoji:"⋯"}].map(n=>(
              <button key={n.id} onClick={()=>setView(n.id as any)}
                style={{ flex:1,border:"none",background:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"inherit",padding:"4px 0" }}>
                <div style={{ width:36,height:36,borderRadius:12,background:N.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:view===n.id?N.inset:N.raisedSm,transition:"all 0.2s" }}>{n.emoji}</div>
                <span style={{ fontSize:10,color:view===n.id?N.accent:N.textMut,fontWeight:view===n.id?700:400 }}>{n.label}</span>
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