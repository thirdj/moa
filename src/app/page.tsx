"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { OTT_PRESET_NAMES } from "@/lib/ott-priority";

// ── Types ──────────────────────────────────────────────────────────
interface CultureRecord {
  id: number; category: string; title: string; date: string;
  rating: number; review?: string; thumbnail?: string; author?: string; venue?: string;
  date_start?: string; date_end?: string; finished?: boolean;
  media_type?: string; ott_name?: string; ott_logo_path?: string;
}
interface Suggestion {
  id: string | number; source: "history" | "api"; type?: "title" | "author" | "venue";
  title: string; author?: string; venue?: string; thumbnail?: string;
  publishedDate?: string; category?: string;
  tmdbId?: number; mediaType?: "movie" | "tv";
}

// ── Design tokens — Editorial Monochrome ───────────────────────────
const F = {
  outerBg: "#F6F6F7",
  bg:      "#FFFFFF",
  white:   "#FFFFFF",
  border:  "#E5E5E5",
  text:    "#171717",
  textSub: "#737373",
  textMut: "#A3A3A3",
  accent:  "#171717",
  accentColor: "#171717",
  shadow:  "0 1px 20px rgba(0,0,0,0.03)",
  shadowMd:"0 10px 24px rgba(0,0,0,0.06)",
};

// ── Categories ─────────────────────────────────────────────────────
const CATS = [
  { id:"book",       label:"책",     en:"BOOKS",       code:"B", emoji:"📚", color:"#171717" },
  { id:"movie",      label:"영화",   en:"MOVIES",      code:"M", emoji:"🎬", color:"#171717" },
  { id:"exhibition", label:"전시",   en:"EXHIBITIONS", code:"E", emoji:"🖼️", color:"#171717" },
  { id:"musical",    label:"공연",   en:"MUSICALS",    code:"P", emoji:"🎭", color:"#171717" },
  { id:"concert",    label:"콘서트", en:"CONCERTS",    code:"C", emoji:"🎵", color:"#171717" },
];
const catOf = (id: string) => CATS.find(c => c.id === id) ?? CATS[0];

// ── OTT 프리셋 ─────────────────────────────────────────────────────
const OTT_PRESETS = OTT_PRESET_NAMES;
const isSameOtt = (formName: string, presetName: string) => {
  if (!formName) return false;
  if (formName === presetName) return true;
  const preset = OTT_PRESETS.find(p => p.name === presetName);
  const n = formName.toLowerCase();
  return preset?.match.some(m => n.includes(m)) ?? false;
};

let cachedOttLogos: Record<string, string | null> | null = null;
let ottPromise: Promise<Record<string, string | null>> | null = null;

function useOttLogos(enabled: boolean) {
  const [logos, setLogos] = useState<Record<string, string | null>>(cachedOttLogos || {});
  const [loaded, setLoaded] = useState(!!cachedOttLogos);

  useEffect(() => {
    if (!enabled || cachedOttLogos) return;
    if (!ottPromise) {
      ottPromise = fetch("/api/tmdb/ott-list")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const map: Record<string, string | null> = {};
          if (d?.providers) {
            d.providers.forEach((p: any) => { map[p.name] = p.logo_path; });
          }
          cachedOttLogos = map;
          return map;
        })
        .catch(() => ({}));
    }
    ottPromise.then(map => {
      setLogos(map);
      setLoaded(true);
    });
  }, [enabled]);

  return { logos, loaded };
}

// ── Helpers ────────────────────────────────────────────────────────
function Stars({ v, onChange, size = 16 }: { v: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display:"flex", gap:1 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize:size, color: s<=(hover||v) ? F.text : F.border, cursor:onChange?"pointer":"default", userSelect:"none", lineHeight:1, transition:"color 0.1s" }}>
          ★
        </span>
      ))}
    </div>
  );
}

function safeDate(d: string) {
  if (!d) return "";
  return d.slice(0, 10);
}

function formatDate(d: string) {
  if (!d) return "";
  const s = safeDate(d);
  const [y, m, day] = s.split("-");
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
  width:"100%", padding:"11px 13px", borderRadius:0,
  border:`1px solid ${F.border}`, outline:"none", fontFamily:"inherit",
  background:F.white, boxSizing:"border-box",
  fontSize:14, color:F.text,
};

// ── 커스텀 DatePicker ─────────────────────────────────────────────
function DatePicker({ value, onChange, min, placeholder = "날짜 선택", disabled = false }: {
  value: string; onChange: (v: string) => void;
  min?: string; placeholder?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const today = todayStr();

  const parseLocal = (v: string) => {
    if (!v) return new Date();
    const s = safeDate(v);
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const parsed = parseLocal(value);
  const [calY, setCalY] = useState(parsed.getFullYear());
  const [calM, setCalM] = useState(parsed.getMonth());

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
    if (ds > today) return true;
    if (min && ds < min) return true;
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
    if (nextDs > today) return;
    if (calM === 11) { setCalY(y => y+1); setCalM(0); }
    else setCalM(m => m+1);
  }

  return (
    <div style={{ position:"relative" }}>
      <button
        type="button"
        onClick={() => { if(!disabled) setOpen(o => !o); }}
        style={{ ...flatInput as any, display:"flex", alignItems:"center", justifyContent:"space-between", cursor:disabled?"default":"pointer", opacity:disabled?0.35:1, border:`1px solid ${open ? F.text : F.border}`, background:F.white, textAlign:"left" }}>
        <span style={{ color: value ? F.text : F.textMut, fontSize:14 }}>
          {value ? formatDate(value) : placeholder}
        </span>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.12em", color:F.textMut }}>DATE</span>
      </button>

      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:F.white, borderRadius:0, boxShadow:F.shadowMd, border:`1px solid ${F.text}`, zIndex:100, padding:"12px 10px", overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, padding:"0 4px" }}>
            <button type="button" onClick={prevMonth}
              style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:F.textSub, padding:"4px 8px" }}>‹</button>
            <span style={{ fontSize:13, fontWeight:700, letterSpacing:"0.06em", color:F.text }}>{calY}. {String(calM+1).padStart(2,"0")}</span>
            <button type="button" onClick={nextMonth}
              style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:F.textSub, padding:"4px 8px",
                opacity: `${calY}-${String(calM+2).padStart(2,"0")}-01` > today ? 0.3 : 1 }}>›</button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
            {["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i) => (
              <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, letterSpacing:"0.08em", color:i===0?"#DC2626":F.textMut, padding:"2px 0" }}>{d}</div>
            ))}
          </div>

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
                  style={{ width:"100%", aspectRatio:"1", borderRadius:0, border:isToday&&!sel?`1px solid ${F.text}`:"none", cursor:dis?"default":"pointer", fontFamily:"inherit", fontSize:12, fontWeight:sel||isToday?700:400, background:sel?F.text:"transparent", color:sel?"#fff":dis?F.textMut:F.text, opacity:dis?0.3:1, transition:"all 0.1s" }}>
                  {d}
                </button>
              );
            })}
          </div>

          <div style={{ textAlign:"center", marginTop:8, paddingTop:8, borderTop:`1px solid ${F.border}` }}>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }}
              style={{ background:"none", border:"none", fontSize:11, letterSpacing:"0.12em", color:F.text, cursor:"pointer", fontWeight:700 }}>TODAY</button>
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
          style={{ ...flatInput, paddingRight:44 }} />
        <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", fontSize:10, fontWeight:700, letterSpacing:"0.08em", color:F.textMut }}>
          {status==="loading"?"...":status==="ok"?"OK":status==="warn"?"!":"URL"}
        </span>
      </div>
      {status==="ok" && value && (
        <div style={{ marginTop:10, position:"relative", display:"inline-block", border:`1px solid ${F.border}` }}>
          <img src={value} style={{ height:80, borderRadius:0, objectFit:"cover", display:"block" }} onError={e=>{(e.target as HTMLImageElement).style.display="none";}} />
          <button onClick={()=>{onChange("");setInput("");setStatus("idle");}}
            style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:0, background:F.text, border:"none", color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
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
const makeEmpty = () => ({ category:"", title:"", date:todayStr(), rating:0, review:"", thumbnail:"", author:"", venue:"", date_start:"", date_end:"", finished:false, media_type:"", ott_name:"", ott_logo_path:"" });

function movieTypeLabel(rec: { category: string; media_type?: string }) {
  if (rec.category !== "movie") return catOf(rec.category).label;
  return rec.media_type === "tv" ? "시리즈" : "영화";
}

function OttIcon({ name, logoPath, size = 11 }: { name?: string; logoPath?: string; size?: number }) {
  if (!name) return null;
  if (logoPath) {
    return <img src={`https://image.tmdb.org/t/p/original${logoPath}`} alt={name}
      style={{ width:size, height:size, borderRadius:0, objectFit:"cover", flexShrink:0 }} referrerPolicy="no-referrer" />;
  }
  const preset = OTT_PRESETS.find(p => isSameOtt(name, p.name));
  return (
    <span title={name} style={{ width:size, height:size, borderRadius:0, background:F.text, color:"#fff", fontSize:size*0.65, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
      {(preset?.name ?? name)[0]}
    </span>
  );
}

export default function Home() {
  const { data:session, status } = useSession();
  const router = useRouter();
  const [records, setRecords] = useState<CultureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home"|"add"|"detail"|"category"|"calendar"|"more">("home");
  const [prevView, setPrevView] = useState<"home"|"category"|"calendar">("home");
  const [selected, setSelected] = useState<CultureRecord|null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [sortBy, setSortBy] = useState<"latest"|"date"|"rating">("latest");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [finishReview, setFinishReview] = useState("");

  const { logos: ottLogos } = useOttLogos(view === "add");
  const homeScrollRef     = useRef<HTMLDivElement>(null);
  const scrollPos         = useRef<Record<string, number>>({});
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const moreScrollRef     = useRef<HTMLDivElement>(null);
  const fetchedRef        = useRef(false);

  const scrollRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    home:     homeScrollRef,
    calendar: calendarScrollRef,
    category: categoryScrollRef,
    more:     moreScrollRef,
  };

  const { suggestions, loading:acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  useEffect(() => { if(status === "unauthenticated") router.push("/login"); }, [status]);
  useEffect(() => {
    if (status === "authenticated" && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchRecords();
    }
  }, [status]);

  useEffect(() => {
    const tabViews = ["home","calendar","category","more"];
    if (!tabViews.includes(view)) return;
    requestAnimationFrame(() => {
      const ref = scrollRefs[view]?.current;
      if (ref) ref.scrollTop = scrollPos.current[view] ?? 0;
    });
  }, [view]);

  const isPopState = useRef(false);

  function navigateTo(next: typeof view) {
    if (next === view) return;
    const tabViews = ["home", "calendar", "category", "more"];
    if (tabViews.includes(view)) {
      const ref = scrollRefs[view]?.current;
      if (ref) scrollPos.current[view] = ref.scrollTop;
    }
    // Next.js 라우터가 새로고침하지 않도록 해시(#)만 변경
    window.location.hash = next === "home" ? "" : next;
    setView(next);
  }

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash.replace("#", "") as typeof view;
      if (!hash) {
        setView("home");
      } else if (["home", "add", "detail", "category", "calendar", "more"].includes(hash)) {
        setView(hash);
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);


  async function fetchRecords() {
    setLoading(true);
    try { const r = await fetch("/api/records"); if(r.ok) setRecords(await r.json()); } catch(e) { console.error(e); }
    setLoading(false);
  }

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
        const res = await fetch(`/api/records/${editId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        if (res.ok) {
          const updated = await res.json();
          setRecords(prev => prev.map(r => r.id === editId ? updated : r));
          setSelected(updated);
        }
        reset(); navigateTo("detail");
      } else {
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
      window.history.back();
    } finally { setDeleting(false); }
  }

  function reset() { setForm(makeEmpty()); setEditId(null); setTitleQuery(""); clear(); setShowSug(false); }

  function openDetail(rec: CultureRecord, from: "home"|"category"|"calendar" = "home") {
    setSelected(rec); setPrevView(from); navigateTo("detail");
  }

  function openEdit(r: CultureRecord) {
    setForm({ category:r.category, title:r.title, date:safeDate(r.date), rating:r.rating, review:r.review??"", thumbnail:r.thumbnail??"", author:r.author??"", venue:r.venue??"", date_start:safeDate(r.date_start??"")||"", date_end:safeDate(r.date_end??"")||"", finished:r.finished??false, media_type:r.media_type??"", ott_name:r.ott_name??"", ott_logo_path:r.ott_logo_path??"" });
    setTitleQuery(r.title); setEditId(r.id); navigateTo("add");
  }

  function pickSug(s: Suggestion) {
    if (s.source==="history" && s.type==="author") setForm(f => ({ ...f, author:s.title }));
    else if (s.source==="history" && s.type==="venue") setForm(f => ({ ...f, venue:s.title }));
    else {
      setForm(f => ({ ...f, title:s.title, author:s.author??f.author, thumbnail:s.thumbnail??f.thumbnail, venue:s.venue??f.venue, media_type:s.mediaType??f.media_type, ott_name:"", ott_logo_path:"" }));
      setTitleQuery(s.title);
      if (s.source==="api" && s.mediaType && s.tmdbId) {
        fetch(`/api/tmdb/watch-provider?type=${s.mediaType}&id=${s.tmdbId}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d?.provider) setForm(f => ({ ...f, ott_name:d.provider.name, ott_logo_path:d.provider.logo_path }));
          })
          .catch(() => {});
      }
    }
    clear(); setShowSug(false);
  }

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = records.filter(r => {
      const matchCat = filterCat === "all" || r.category === filterCat;
      const matchQuery = !q ||
        r.title.toLowerCase().includes(q) ||
        (r.review && r.review.toLowerCase().includes(q)) ||
        (r.author && r.author.toLowerCase().includes(q)) ||
        (r.venue && r.venue.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
    return [...base].sort((a, b) => {
      if (sortBy==="rating") return Number(b.rating) - Number(a.rating);
      if (sortBy==="date") {
        const da = a.date_start || a.date || "";
        const db = b.date_start || b.date || "";
        return db.localeCompare(da);
      }
      return 0;
    });
  }, [records, filterCat, searchQuery, sortBy]);

  const activeCat = catOf(form.category);
  const canSave = !!form.title && !!form.category && (form.category === "book" || !!form.rating);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const calDateStr = (d: number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d: number) => records.filter(r => r.date?.slice(0,10)===calDateStr(d));
  const selectedDayRecords = records.filter(r => r.date?.slice(0,10)===calSelected);

  if (status === "loading") return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:F.outerBg, color:F.textMut, fontSize:11, fontWeight:700, letterSpacing:"0.14em" }}>LOADING ARCHIVE...</div>
  );

  // ── 공통 스타일 ──────────────────────────────────────────────────
  const screenWrap: React.CSSProperties = { flex:1, overflowY:"auto", paddingBottom:90 };
  const sectionLabel: React.CSSProperties = { fontSize:10, fontWeight:700, color:F.textSub, letterSpacing:"0.12em", margin:"0 0 8px", textTransform:"uppercase" };

  function Card({ children, onClick, style }: { children: React.ReactNode; onClick?: ()=>void; style?: React.CSSProperties }) {
    return (
      <div onClick={onClick} style={{ background:F.white, borderRadius:0, border:`1px solid ${F.border}`, padding:"16px", cursor:onClick?"pointer":"default", transition:"border-color 0.15s, box-shadow 0.15s", ...style }}
        onMouseEnter={e => { if(onClick) { e.currentTarget.style.borderColor=F.text; e.currentTarget.style.boxShadow=F.shadowMd; }}}
        onMouseLeave={e => { if(onClick) { e.currentTarget.style.borderColor=F.border; e.currentTarget.style.boxShadow="none"; }}}>
        {children}
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif", background:F.outerBg, height:"100vh", overflow:"hidden", display:"flex", justifyContent:"center" }}>
      <div style={{ width:"100%", maxWidth:390, background:F.white, height:"100vh", display:"flex", flexDirection:"column", position:"relative", overflow:"hidden", boxShadow:F.shadow, borderLeft:`1px solid ${F.border}`, borderRight:`1px solid ${F.border}` }}>

        {/* ══ HOME ══════════════════════════════════════════════════ */}
        <div ref={homeScrollRef} style={{ ...screenWrap, display: view==="home" ? "block" : "none" }}>
          {/* 상단 브랜드 바 */}
          <div style={{ padding:"20px 20px 6px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:11, fontWeight:800, letterSpacing:"0.14em", color:F.text }}>ARCHIVE.LOG</span>
          </div>

          {/* 메인 타이틀 & 인라인 검색 */}
          <div style={{ padding:"4px 20px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:12 }}>
            <h1 style={{ fontSize:28, fontWeight:800, color:F.text, margin:0, letterSpacing:-0.6 }}>Bookmarks</h1>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..."
              style={{ width:125, border:"none", borderBottom:`1px solid ${searchQuery ? F.text : "#D4D4D4"}`, padding:"4px 0", fontSize:12, color:F.text, background:"transparent", outline:"none" }}
            />
          </div>

          {/* 언더라인 카테고리 필터 바 */}
          <div style={{ borderTop:`1px solid ${F.border}`, borderBottom:`1px solid ${F.border}`, padding:"0 20px", display:"flex", gap:16, overflowX:"auto" }}>
            {[{id:"all",label:"전체"},...CATS].map(c => {
              const active = filterCat === c.id;
              return (
                <button key={c.id} onClick={() => setFilterCat(c.id)}
                  style={{ padding:"11px 0", border:"none", borderBottom: active ? `2px solid ${F.text}` : "2px solid transparent", background:"transparent", color: active ? F.text : F.textMut, fontWeight: active ? 700 : 500, fontSize:12, letterSpacing:"0.04em", cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit", flexShrink:0, transition:"all 0.15s" }}>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* 서브 헤더 (저장 개수 & 정렬 셀렉트) */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px 8px" }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:F.textMut }}>
              {filtered.length} BOOKMARKS SAVED
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{ border:"none", borderBottom:`1px solid ${F.border}`, background:"transparent", fontSize:11, fontWeight:600, color:F.textSub, padding:"2px 0", outline:"none", cursor:"pointer", fontFamily:"inherit" }}>
              <option value="latest">Sort by latest</option>
              <option value="date">Sort by date</option>
              <option value="rating">Sort by rating</option>
            </select>
          </div>

          {/* 리스트 아이템 */}
          <div style={{ padding:"0 20px", display:"flex", flexDirection:"column" }}>
            {loading ? (
              <div style={{ textAlign:"center", padding:60, color:F.textMut, fontSize:11, fontWeight:700, letterSpacing:"0.12em" }}>LOADING ARCHIVE...</div>
            ) : records.length===0 ? (
              <div style={{ textAlign:"center", padding:"72px 20px", border:`1px solid ${F.border}`, marginTop:10 }}>
                <p style={{ color:F.textSub, fontSize:13, margin:"0 0 4px", fontWeight:600 }}>아직 기록이 없어요</p>
                <p style={{ color:F.textMut, fontSize:11, margin:0 }}>하단 + 버튼으로 첫 북마크를 추가해보세요</p>
              </div>
            ) : filtered.length===0 ? (
              <div style={{ textAlign:"center", padding:"72px 20px", border:`1px solid ${F.border}`, marginTop:10 }}>
                <p style={{ color:F.textMut, fontSize:12, margin:0 }}>표시할 기록이 없습니다</p>
              </div>
            ) : filtered.map(rec => {
              const cat = catOf(rec.category);
              return (
                <div key={rec.id} onClick={() => openDetail(rec, "home")}
                  style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"16px 0", borderBottom:`1px solid ${F.border}`, cursor:"pointer" }}>
                  {/* 썸네일 */}
                  {rec.thumbnail
                    ? <img src={rec.thumbnail} style={{ width:54, height:72, objectFit:"cover", borderRadius:0, border:`1px solid ${F.border}`, flexShrink:0 }} referrerPolicy="no-referrer" />
                    : <div style={{ width:54, height:72, borderRadius:0, background:"#F6F6F7", border:`1px solid ${F.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, flexShrink:0 }}>
                        <span style={{ fontSize:16 }}>{cat.emoji}</span>
                        <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.1em", color:F.textMut }}>NO IMG</span>
                      </div>
                  }
                  <div style={{ flex:1, minWidth:0, height:72, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                    <div>
                      {/* 카테고리 + 날짜 */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                        <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:F.textSub, fontWeight:700, letterSpacing:"0.08em", lineHeight:1 }}>
                          {movieTypeLabel(rec).toUpperCase()}
                          {rec.category==="movie" && <OttIcon name={rec.ott_name} logoPath={rec.ott_logo_path} size={11} />}
                        </span>
                        <span style={{ fontSize:10, color:F.textMut, fontFamily:"monospace" }}>{formatDate(rec.date)}</span>
                      </div>

                      {/* 제목 */}
                      <p style={{ fontSize:14, fontWeight:700, color:F.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>{rec.title}</p>
                    </div>
                    <div>
                      {/* 상태 및 별점 */}
                      {rec.category === "book" && !rec.finished && rec.date_start
                        ? <span style={{ fontSize:10, fontWeight:700, color:"#fff", background:F.text, padding:"2px 7px", letterSpacing:"0.06em" }}>읽는 중</span>
                        : <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:F.text, whiteSpace:"nowrap", flexShrink:0 }}>★ {Number(rec.rating).toFixed(1)}</span>
                            {rec.review && <span style={{ fontSize:11, color:F.textMut, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>· {rec.review}</span>}
                          </div>
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ ADD / EDIT ════════════════════════════════════════════ */}
        {view==="add" && (
          <div style={{ flex:1, overflowY:"auto", paddingBottom:120 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 20px 14px", borderBottom:`1px solid ${F.border}` }}>
              <button onClick={() => { const wasEdit = !!editId; reset(); navigateTo(wasEdit ? "detail" : "home"); }}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", color:F.textSub, fontWeight:700, fontSize:11, letterSpacing:"0.1em", fontFamily:"inherit" }}>
                ‹ BACK
              </button>
              <p style={{ fontSize:13, fontWeight:800, letterSpacing:"0.08em", textTransform:"uppercase", margin:0, color:F.text }}>{editId ? "Edit Bookmark" : "New Bookmark"}</p>
              <div style={{ width:44 }} />
            </div>

            <div style={{ padding:"20px" }}>
              {/* 카테고리 */}
              <p style={sectionLabel}>Category *</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginBottom:20 }}>
                {CATS.map(c => {
                  const isSelected = form.category === c.id;
                  const isDisabled = !!editId && !isSelected;
                  return (
                    <button key={c.id}
                      onClick={() => { if(isDisabled) return; setForm(f => ({...f, category:c.id, thumbnail:"", author:""})); setTitleQuery(""); clear(); }}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 4px", borderRadius:0, border:`1px solid ${isSelected ? F.text : F.border}`, background:isSelected ? F.text : F.white, cursor:isDisabled?"default":"pointer", fontFamily:"inherit", transition:"all 0.15s", opacity:isDisabled?0.3:1 }}>
                      <span style={{ fontSize:16 }}>{c.emoji}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:isSelected ? "#fff" : F.textSub, textAlign:"center" }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
              {editId && (
                <p style={{ fontSize:11, color:F.textMut, margin:"-14px 0 18px" }}>
                  * 수정 시 카테고리는 변경할 수 없어요
                </p>
              )}

              {/* 제목 */}
              <p style={sectionLabel}>
                Title * {form.category && <span style={{ color:F.textMut, textTransform:"none", fontWeight:400, fontSize:10 }}>— {activeCat.id==="book"||activeCat.id==="movie" ? "검색 or 내 기록 자동완성" : "내 기록 자동완성"}</span>}
              </p>
              <div style={{ position:"relative", marginBottom:6 }}>
                <input value={titleQuery}
                  onChange={e => { setTitleQuery(e.target.value); setForm(f => ({...f, title:e.target.value, thumbnail:""})); setShowSug(true); }}
                  onFocus={() => setShowSug(true)}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder={form.category ? `${activeCat.label} 제목을 입력하세요` : "카테고리를 먼저 선택하세요"}
                  disabled={!form.category}
                  style={{ ...flatInput, paddingRight:36 }}
                />
                {acLoading && <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", width:13, height:13, border:`2px solid ${F.border}`, borderTopColor:F.text, borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />}
              </div>

              {/* 자동완성 드롭다운 */}
              <div style={{ position:"relative", marginBottom: showSug && suggestions.length>0 ? 245 : 0, transition:"margin 0.2s" }}>
                {showSug && suggestions.length>0 && (
                  <div style={{ position:"absolute", top:0, left:0, right:0, background:F.white, borderRadius:0, boxShadow:F.shadowMd, border:`1px solid ${F.text}`, maxHeight:235, overflowY:"auto", zIndex:50 }}>
                    {suggestions.filter(s => s.source==="history").length>0 && <>
                      <div style={{ padding:"6px 12px", fontSize:9, color:F.textMut, background:"#F6F6F7", fontWeight:700, letterSpacing:"0.12em" }}>MY HISTORY</div>
                      {suggestions.filter(s => s.source==="history").map(s => (
                        <div key={s.id} onClick={() => pickSug(s)}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", cursor:"pointer", borderBottom:`1px solid ${F.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background="#F6F6F7")}
                          onMouseLeave={e => (e.currentTarget.style.background="")}>
                          <span style={{ fontSize:12 }}>{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                          <span style={{ fontSize:13, color:F.text, fontWeight:600 }}>{s.title}</span>
                          <span style={{ marginLeft:"auto", fontSize:9, color:F.textSub, border:`1px solid ${F.border}`, padding:"1px 5px", flexShrink:0 }}>내 기록</span>
                        </div>
                      ))}
                    </>}
                    {suggestions.filter(s => s.source==="api").length>0 && <>
                      <div style={{ padding:"6px 12px", fontSize:9, color:F.textMut, background:"#F6F6F7", fontWeight:700, letterSpacing:"0.12em" }}>SEARCH RESULTS</div>
                      {suggestions.filter(s => s.source==="api").map(s => (
                        <div key={s.id} onClick={() => pickSug(s)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", cursor:"pointer", borderBottom:`1px solid ${F.border}` }}
                          onMouseEnter={e => (e.currentTarget.style.background="#F6F6F7")}
                          onMouseLeave={e => (e.currentTarget.style.background="")}>
                          {s.thumbnail
                            ? <img src={s.thumbnail} style={{ width:28, height:38, objectFit:"cover", borderRadius:0, border:`1px solid ${F.border}`, flexShrink:0 }} referrerPolicy="no-referrer" />
                            : <div style={{ width:28, height:38, background:"#F6F6F7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0 }}>{activeCat.emoji}</div>
                          }
                          <div style={{ minWidth:0 }}>
                            <p style={{ fontSize:12, fontWeight:700, color:F.text, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</p>
                            {s.author && <p style={{ fontSize:10, color:F.textMut, margin:0 }}>
                              {(s as any).description && <span style={{ color:F.text, fontWeight:600, marginRight:4 }}>[{(s as any).description}]</span>}
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
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", background:"#F6F6F7", borderRadius:0, marginBottom:16, border:`1px solid ${F.border}` }}>
                  <img src={form.thumbnail} style={{ width:32, height:44, objectFit:"cover", borderRadius:0, border:`1px solid ${F.border}` }} referrerPolicy="no-referrer" />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:700, margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:F.text }}>{form.title}</p>
                    {form.author && <p style={{ fontSize:11, color:F.textSub, margin:0 }}>{form.author}</p>}
                  </div>
                  <button onClick={() => setForm(f => ({...f, thumbnail:"", author:""}))} style={{ background:"none", border:"none", color:F.textSub, cursor:"pointer", fontSize:14, padding:0 }}>✕</button>
                </div>
              )}

              {/* 책 — 읽기 시작일만 입력 */}
              {form.category==="book" ? (
                <>
                  <p style={sectionLabel}>Start Date <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(읽기 시작일 · 선택)</span></p>
                  <div style={{ marginBottom:18 }}>
                    <DatePicker
                      value={form.date_start}
                      onChange={v => setForm(f => ({ ...f, date_start:v, date:v||f.date }))}
                      placeholder="읽기 시작한 날"
                    />
                  </div>
                </>
              ) : (
                <>
                  <p style={{ ...sectionLabel, margin:"6px 0 8px" }}>Date</p>
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
                  <p style={sectionLabel}>Venue <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(장소 · 선택)</span></p>
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

              {/* OTT — 영화 카테고리만 */}
              {form.category==="movie" && (
                <>
                  <p style={sectionLabel}>
                    Platform <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(OTT 선택)</span>
                  </p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:18 }}>
                    {OTT_PRESETS.map(p => {
                      const isSelected = isSameOtt(form.ott_name, p.name);
                      const logoPath = ottLogos[p.name];
                      return (
                        <button key={p.name} type="button"
                          onClick={() => setForm(f => ({ ...f, ott_name:isSelected ? "" : p.name, ott_logo_path:isSelected ? "" : (logoPath ?? "") }))}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:0, border:`1px solid ${isSelected ? F.text : F.border}`, background:isSelected ? F.text : F.white, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:isSelected ? "#fff" : F.textSub, transition:"all 0.15s" }}>
                          {logoPath
                            ? <img src={`https://image.tmdb.org/t/p/original${logoPath}`} alt={p.name}
                                style={{ width:14, height:14, borderRadius:0, objectFit:"cover", flexShrink:0 }} referrerPolicy="no-referrer" />
                            : <span style={{ width:14, height:14, borderRadius:0, background:isSelected?"#fff":F.text, color:isSelected?F.text:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{p.name[0]}</span>
                          }
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                  {form.ott_name && !OTT_PRESETS.some(p => isSameOtt(form.ott_name, p.name)) && (
                    <p style={{ fontSize:11, color:F.textSub, margin:"-12px 0 12px" }}>현재: {form.ott_name} (자동 조회됨)</p>
                  )}
                </>
              )}

              {/* 별점 */}
              <p style={sectionLabel}>Rating {form.category !== "book" && "*"}</p>
              <div style={{ marginBottom:18 }}>
                <Stars v={form.rating} onChange={v => setForm(f => ({...f, rating:v}))} size={28} />
              </div>

              {/* 한줄 리뷰 */}
              <p style={sectionLabel}>Notes <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(한 줄 리뷰 · 선택)</span></p>
              <textarea value={form.review} onChange={e => setForm(f => ({...f, review:e.target.value.slice(0,100)}))}
                placeholder="한 줄로 느낀 점을 남겨보세요." maxLength={100} rows={3}
                style={{ ...flatInput, resize:"none", lineHeight:1.6, marginBottom:4 }} />
              <p style={{ textAlign:"right", fontSize:10, color:F.textMut, margin:"0 0 18px", fontFamily:"monospace" }}>{form.review.length}/100</p>

              {/* 이미지 URL — 전시/공연/콘서트만 */}
              {form.category && !["book","movie"].includes(form.category) && (
                <>
                  <p style={sectionLabel}>Poster URL <span style={{ color:F.textMut, textTransform:"none", fontWeight:400 }}>(선택)</span></p>
                  <ImageUrlInput value={form.thumbnail} onChange={url => setForm(f => ({...f, thumbnail:url}))} />
                </>
              )}
            </div>

            {/* 저장 버튼 */}
            <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, padding:"12px 20px 20px", background:F.white, borderTop:`1px solid ${F.border}`, zIndex:20 }}>
              <button onClick={save} disabled={!canSave||saving}
                style={{ width:"100%", padding:"14px", borderRadius:0, border:"none", background:canSave?F.text:"#E5E5E5", color:canSave?"#fff":F.textMut, fontSize:12, fontWeight:700, letterSpacing:"0.14em", cursor:canSave?"pointer":"default", fontFamily:"inherit", transition:"all 0.2s" }}>
                {saving ? "SAVING..." : "SAVE BOOKMARK"}
              </button>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════ */}
        {view==="detail" && selected && (() => {
          const cat = catOf(selected.category);
          return (
            <div style={{ flex:1, overflowY:"auto", paddingBottom:85, background:F.white }}>
              {/* 상단 바 */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:`1px solid ${F.border}` }}>
                <button onClick={() => window.history.back()}
                  style={{ background:"none", border:"none", padding:0, cursor:"pointer", fontSize:11, fontWeight:700, letterSpacing:"0.1em", color:F.textSub, fontFamily:"inherit" }}>
                  ‹ BACK
                </button>
                <span style={{ fontSize:11, color:F.textMut, fontFamily:"monospace" }}>
                  {selected.category==="book" ? (selected.date_start ? formatDate(selected.date_start) : formatDate(selected.date)) : formatDate(selected.date)}
                </span>
              </div>

              {/* [개선] 시안 2번: 16:10 와이드 갤러리 배너 + 블러 배경 (비율 축소 및 블러 효과) */}
              <div style={{ 
                position: "relative", 
                width: "100%", 
                aspectRatio: "16/10", 
                background: "#000", 
                overflow: "hidden", 
                borderBottom: `1px solid ${F.border}` 
              }}>
                {selected.thumbnail ? (
                  <>
                    {/* 아웃포커싱 배경 이미지 */}
                    <img 
                      src={selected.thumbnail} 
                      alt="" 
                      style={{ 
                        position: "absolute", 
                        inset: 0, 
                        width: "100%", 
                        height: "100%", 
                        objectFit: "cover", 
                        filter: "blur(20px) brightness(0.4)", 
                        transform: "scale(1.2)" 
                      }} 
                      referrerPolicy="no-referrer"
                    />
                    {/* 선명한 중앙 정원비 포스터 */}
                    <div style={{ 
                      position: "absolute", 
                      inset: 0, 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      padding: "16px 0" 
                    }}>
                      <img 
                        src={selected.thumbnail} 
                        alt={selected.title} 
                        style={{ 
                          height: "100%", 
                          width: "auto", 
                          aspectRatio: "2/3", 
                          objectFit: "contain", 
                          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", 
                          border: `1px solid rgba(255,255,255,0.15)` 
                        }} 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ 
                    width: "100%", 
                    height: "100%", 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    gap: 8, 
                    background: "#F6F6F7", 
                    color: F.textMut 
                  }}>
                    <span style={{ fontSize: 36 }}>{cat.emoji}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em" }}>
                      {selected.category === "book" ? "NO COVER" : "NO POSTER"}
                    </span>
                  </div>
                )}
              </div>

              {/* 카테고리 배지 */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"18px 20px 8px" }}>
                <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:10, color:"#fff", fontWeight:700, letterSpacing:"0.1em", background:F.text, padding:"4px 9px", lineHeight:1 }}>
                  {movieTypeLabel(selected).toUpperCase()}
                  {selected.category==="movie" && <OttIcon name={selected.ott_name} logoPath={selected.ott_logo_path} size={11} />}
                </span>
              </div>


              {/* 제목 */}
              <div style={{ padding:"0 20px 10px" }}>
                {(selected.category==="book" || selected.category==="movie") ? (
                  <a href={selected.category==="book" ? `https://www.google.com/search?q=${encodeURIComponent(selected.title+" "+(selected.author??""))}&tbm=bks` : `https://www.themoviedb.org/search?query=${encodeURIComponent(selected.title)}`}
                    target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                    <h1 style={{ fontSize:22, fontWeight:800, color:F.text, margin:"0 0 3px", lineHeight:1.25, wordBreak:"keep-all" }}>{selected.title} <span style={{ fontSize:13, color:F.textMut }}>↗</span></h1>
                    <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{selected.category==="book" ? "Google Books에서 보기" : "TMDB에서 보기"}</p>
                  </a>
                ) : (
                  <h1 style={{ fontSize:22, fontWeight:800, color:F.text, margin:0, lineHeight:1.25, wordBreak:"keep-all" }}>{selected.title}</h1>
                )}
              </div>

              {/* 별점 */}
              <div style={{ padding:"0 20px 16px", display:"flex", alignItems:"center", gap:8 }}>
                <Stars v={Number(selected.rating)} size={18} />
                <span style={{ fontSize:15, fontWeight:800, color:F.text }}>{Number(selected.rating).toFixed(1)}</span>
              </div>

              <div style={{ height:1, background:F.border }} />

              {/* 메타 정보 */}
              <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
                {selected.author && (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:F.textMut, width:52 }}>AUTHOR</span>
                    <span style={{ fontSize:13, color:F.text }}>{selected.author}</span>
                  </div>
                )}
                {selected.venue && (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:F.textMut, width:52 }}>VENUE</span>
                    <span style={{ fontSize:13, color:F.text }}>{selected.venue}</span>
                  </div>
                )}
                {selected.ott_name && (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:F.textMut, width:52 }}>OTT</span>
                    <span style={{ fontSize:13, color:F.text, display:"inline-flex", alignItems:"center", gap:6 }}>
                      <OttIcon name={selected.ott_name} logoPath={selected.ott_logo_path} size={13} />
                      {selected.ott_name}
                    </span>
                  </div>
                )}
                {selected.category==="book" && selected.date_start && (
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", color:F.textMut, width:52 }}>PERIOD</span>
                    <span style={{ fontSize:12, color:F.text, fontFamily:"monospace" }}>
                      {formatDate(selected.date_start)}{(selected.finished||selected.date_end) && <> → {selected.date_end ? formatDate(selected.date_end) : "읽는 중"}</>}
                    </span>
                  </div>
                )}
              </div>

              {/* 리뷰 */}
              {selected.review && <>
                <div style={{ height:1, background:F.border }} />
                <div style={{ padding:"16px 20px" }}>
                  <p style={{ fontSize:10, fontWeight:700, color:F.textMut, margin:"0 0 8px", letterSpacing:"0.12em" }}>NOTES</p>
                  <p style={{ fontSize:14, color:F.text, lineHeight:1.7, margin:0, padding:"12px", background:"#F6F6F7", border:`1px solid ${F.border}` }}>"{selected.review}"</p>
                </div>
              </>}

              {/* 완독 버튼 */}
              {selected.category==="book" && !selected.finished && <>
                <div style={{ height:1, background:F.border }} />
                <div style={{ padding:"16px 20px" }}>
                  <button onClick={() => { setFinishRating(Number(selected.rating) || 0); setFinishReview(selected.review ?? ""); setShowRatingModal(true); }}
                    style={{ width:"100%", padding:"13px", borderRadius:0, border:`1px solid ${F.text}`, background:F.white, color:F.text, fontWeight:700, fontSize:11, letterSpacing:"0.12em", cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}
                    onMouseEnter={e=>{e.currentTarget.style.background=F.text;e.currentTarget.style.color="#fff";}}
                    onMouseLeave={e=>{e.currentTarget.style.background=F.white;e.currentTarget.style.color=F.text;}}>
                    완독했어요! (COMPLETE READING)
                  </button>
                </div>
              </>}

              {/* 수정 / 삭제 */}
              <div style={{ height:1, background:F.border }} />
              <div style={{ display:"flex", gap:10, padding:"16px 20px" }}>
                <button onClick={() => openEdit(selected)} style={{ flex:1, padding:"12px", borderRadius:0, border:`1px solid ${F.text}`, background:F.white, color:F.text, fontWeight:700, fontSize:11, letterSpacing:"0.12em", cursor:"pointer", fontFamily:"inherit" }}>수정</button>
                <button onClick={() => del(selected.id)} disabled={deleting} style={{ flex:1, padding:"12px", borderRadius:0, border:"1px solid #FECACA", background:"#FEF2F2", color:"#DC2626", fontWeight:700, fontSize:11, letterSpacing:"0.12em", cursor:deleting?"default":"pointer", fontFamily:"inherit", opacity:deleting?0.6:1 }}>{deleting ? "삭제 중..." : "삭제"}</button>
              </div>
            </div>
          );
        })()}

        {/* ── 삭제 중 오버레이 ─────────────────────────────────── */}
        {deleting && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ background:F.white, borderRadius:0, border:`1px solid ${F.text}`, padding:"24px 32px", display:"flex", flexDirection:"column", alignItems:"center", gap:12, boxShadow:F.shadowMd }}>
              <div style={{ width:24, height:24, border:`2px solid ${F.text}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.14em", color:F.text }}>DELETING...</span>
            </div>
          </div>
        )}

        {/* ── 완독 별점 모달 ───────────────────────────────────────── */}
        {showRatingModal && selected && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 20px" }}
            onClick={e => { if (e.target === e.currentTarget) setShowRatingModal(false); }}>
            <div style={{ background:F.white, borderRadius:0, border:`1px solid ${F.border}`, padding:"24px 20px", width:"100%", maxWidth:340, boxShadow:"0 12px 48px rgba(0,0,0,0.18)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:12, borderBottom:`1px solid ${F.border}`, marginBottom:16 }}>
                <span style={{ fontSize:12, fontWeight:800, letterSpacing:"0.1em", color:F.text }}>COMPLETE READING</span>
                <button onClick={() => setShowRatingModal(false)} style={{ background:"none", border:"none", fontSize:14, color:F.textMut, cursor:"pointer" }}>✕</button>
              </div>
              <p style={{ fontSize:12, color:F.textSub, margin:"0 0 18px" }}>완독 축하해요! 이 책은 어떠셨나요?</p>

              <p style={sectionLabel}>Rating</p>
              <div style={{ marginBottom:18 }}>
                <Stars v={finishRating} onChange={setFinishRating} size={32} />
              </div>

              <p style={sectionLabel}>Notes <span style={{ fontWeight:400, textTransform:"none" }}>(선택)</span></p>
              <textarea
                value={finishReview}
                onChange={e => setFinishReview(e.target.value)}
                placeholder="이 책에 대한 짧은 감상을 남겨보세요"
                rows={3}
                style={{ ...flatInput, resize:"none", marginBottom:18, lineHeight:1.6 }}
              />
              <button
                onClick={async () => {
                  const today = todayStr();
                  const updated = { ...selected, finished: true, date_end: today, rating: finishRating, review: finishReview };
                  const res = await fetch(`/api/records/${selected.id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ finished:true, date_end:fixDateForApi(today), rating:finishRating, review:finishReview || selected.review }) });
                  if (res.ok) {
                    const updatedRec = await res.json();
                    setSelected(updatedRec);
                    setRecords(prev => prev.map(r => r.id === selected.id ? updatedRec : r));
                  } else {
                    setSelected(updated);
                  }
                  setShowRatingModal(false);
                }}
                style={{ width:"100%", padding:"13px", borderRadius:0, border:"none", background:F.text, color:"#fff", fontWeight:700, fontSize:11, letterSpacing:"0.14em", cursor:"pointer", fontFamily:"inherit" }}>
                COMPLETE
              </button>
            </div>
          </div>
        )}

        {/* ══ CATEGORY = 통계 ═══════════════════════════════════════ */}
        {view==="category" && (
          <div ref={categoryScrollRef} style={screenWrap}>
            <div style={{ padding:"20px 20px 6px" }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:"0.14em", color:F.text }}>ARCHIVE.LOG</span>
            </div>
            <div style={{ padding:"4px 20px 18px", borderBottom:`1px solid ${F.border}` }}>
              <h2 style={{ fontSize:26, fontWeight:800, color:F.text, margin:0, letterSpacing:-0.5 }}>Statistics</h2>
            </div>

            {/* 요약 카드 */}
            <div style={{ margin:"18px 20px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[
                { label:"TOTAL", value:`${records.length}` },
                { label:"AVG RATING", value:records.filter(r=>Number(r.rating)>0).length?`${(records.filter(r=>Number(r.rating)>0).reduce((s,r)=>s+Number(r.rating),0)/records.filter(r=>Number(r.rating)>0).length).toFixed(1)}`:"-" },
                { label:"THIS MONTH", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}` },
              ].map(s => (
                <Card key={s.label} style={{ padding:"14px 8px" }}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:20, fontWeight:800, color:F.text, margin:"0 0 4px" }}>{s.value}</p>
                    <p style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", color:F.textMut, margin:0 }}>{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* 카테고리별 분포 */}
            <Card style={{ margin:"0 20px 16px" }}>
              <p style={{ fontSize:11, fontWeight:800, letterSpacing:"0.12em", color:F.text, margin:"0 0 16px" }}>CATEGORY BREAKDOWN</p>
              {records.length===0
                ? <p style={{ fontSize:12, color:F.textMut, textAlign:"center", padding:"10px 0" }}>아직 기록이 없어요</p>
                : CATS.map(c => {
                  const cnt = records.filter(r => r.category===c.id).length;
                  if (!cnt) return null;
                  const pct = Math.round((cnt/records.length)*100);
                  const avg = (records.filter(r=>r.category===c.id).reduce((s,r)=>s+Number(r.rating),0)/cnt).toFixed(1);
                  return (
                    <div key={c.id} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:F.text }}>{c.label}</span>
                          <span style={{ fontSize:11, color:F.textMut }}>({cnt})</span>
                        </div>
                        <span style={{ fontSize:11, color:F.text, fontWeight:700 }}>★ {avg}</span>
                      </div>
                      <div style={{ height:5, background:"#F6F6F7", borderRadius:0, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:F.text, transition:"width 0.5s" }} />
                      </div>
                    </div>
                  );
                })
              }
            </Card>

            {/* 완독 현황 (책만) */}
            {records.filter(r=>r.category==="book").length > 0 && (
              <Card style={{ margin:"0 20px 16px" }}>
                <p style={{ fontSize:11, fontWeight:800, letterSpacing:"0.12em", color:F.text, margin:"0 0 14px" }}>READING STATUS</p>
                {(() => {
                  const books = records.filter(r => r.category==="book");
                  const finished = books.filter(r => r.finished).length;
                  const reading = books.filter(r => r.date_start && !r.finished).length;
                  const notStarted = books.length - finished - reading;
                  return (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      {[
                        { label:"완독", value:finished },
                        { label:"읽는 중", value:reading },
                        { label:"미시작", value:notStarted },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign:"center", padding:"12px 6px", background:"#F6F6F7", border:`1px solid ${F.border}` }}>
                          <p style={{ fontSize:18, fontWeight:800, color:F.text, margin:"0 0 3px" }}>{s.value}</p>
                          <p style={{ fontSize:10, fontWeight:600, color:F.textSub, margin:0 }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* 최고 평점 */}
            {records.length > 0 && (
              <Card style={{ margin:"0 20px 16px" }}>
                <p style={{ fontSize:11, fontWeight:800, letterSpacing:"0.12em", color:F.text, margin:"0 0 12px" }}>TOP RATED</p>
                {[...records].sort((a,b)=>Number(b.rating)-Number(a.rating)).slice(0,3).map(rec => {
                  const cat = catOf(rec.category);
                  return (
                    <div key={rec.id} onClick={() => openDetail(rec,"category")}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${F.border}`, cursor:"pointer" }}>
                      {rec.thumbnail
                        ? <img src={rec.thumbnail} style={{ width:34,height:46,objectFit:"cover",borderRadius:0,border:`1px solid ${F.border}`,flexShrink:0 }} />
                        : <div style={{ width:34,height:46,borderRadius:0,background:"#F6F6F7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>{cat.emoji}</div>
                      }
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:13,fontWeight:700,color:F.text,margin:"0 0 3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rec.title}</p>
                        <Stars v={Number(rec.rating)} size={11} />
                      </div>
                      <span style={{ fontSize:12,fontWeight:800,color:F.text }}>★ {Number(rec.rating).toFixed(1)}</span>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>
        )}

        {/* ══ CALENDAR ══════════════════════════════════════════════ */}
        {view==="calendar" && (
          <div ref={calendarScrollRef} style={screenWrap}>
            <div style={{ padding:"20px 20px 6px" }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:"0.14em", color:F.text }}>ARCHIVE.LOG</span>
            </div>
            <div style={{ padding:"4px 20px 16px", borderBottom:`1px solid ${F.border}`, marginBottom:16 }}>
              <h2 style={{ fontSize:26, fontWeight:800, color:F.text, margin:0, letterSpacing:-0.5 }}>Calendar</h2>
            </div>

            <div style={{ display:"flex", alignItems:"center", justifycontent:"space-between", padding:"0 20px 16px" }}>
              <button onClick={() => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }} style={{ width:32, height:32, borderRadius:0, border:`1px solid ${F.border}`, background:F.white, cursor:"pointer", fontSize:16, color:F.text }}>‹</button>
              <span style={{ fontSize:14, fontWeight:800, letterSpacing:"0.08em", color:F.text }}>{calYear}. {String(calMonth+1).padStart(2,"0")}</span>
              <button
                onClick={() => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }}
                disabled={calYear===new Date().getFullYear() && calMonth===new Date().getMonth()}
                style={{ width:32, height:32, borderRadius:0, border:`1px solid ${F.border}`, background:F.white, cursor:"pointer", fontSize:16, color:F.text, opacity: calYear===new Date().getFullYear() && calMonth===new Date().getMonth() ? 0.25 : 1 }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 20px", marginBottom:4 }}>
              {["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i) => (
                <div key={d} style={{ textAlign:"center", fontSize:9, fontWeight:700, letterSpacing:"0.08em", color:i===0?"#DC2626":F.textMut, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", margin:"0 20px", borderTop:`1px solid ${F.border}`, borderLeft:`1px solid ${F.border}` }}>
              {Array.from({length:firstDay}).map((_,i) => <div key={`e-${i}`} style={{ aspectRatio:"1", borderRight:`1px solid ${F.border}`, borderBottom:`1px solid ${F.border}`, background:"#FAFAFA" }} />)}
              {Array.from({length:daysInMonth}).map((_,i) => {
                const day=i+1; const ds=calDateStr(day); const recs=recordsOnDay(day);
                const isSel=calSelected===ds; const isToday=ds===todayStr();
                const isFuture=ds>todayStr();
                return (
                  <div key={day} onClick={() => { if(!isFuture) setCalSelected(ds); }} style={{ aspectRatio:"1", borderRight:`1px solid ${F.border}`, borderBottom:`1px solid ${F.border}`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between", padding:"4px 0", background:isSel?F.text:isToday?"#F6F6F7":F.white, cursor:isFuture?"default":"pointer" }}>
                    <span style={{ color:isSel?"#fff":isFuture?F.textMut:F.text, fontSize:12, fontWeight:isToday||isSel?700:400, opacity:isFuture?0.3:1 }}>{day}</span>
                    <div style={{ display:"flex", gap:2, marginBottom:2 }}>
                      {recs.slice(0,3).map((_,idx) => <div key={idx} style={{ width:4, height:4, borderRadius:"50%", background:isSel?"#fff":F.text }} />)}
                    </div>
                  </div>
                );
              })}
            </div>
            {calSelected && (
              <div style={{ margin:"20px 20px 0" }}>
                <p style={{ fontSize:10, fontWeight:800, letterSpacing:"0.12em", color:F.textMut, margin:"0 0 10px" }}>RECORDS ON {calSelected.replace(/-/g,".")}</p>
                {selectedDayRecords.length===0
                  ? <div style={{ border:`1px solid ${F.border}`, padding:"24px", textAlign:"center", fontSize:12, color:F.textMut }}>이 날의 기록이 없어요</div>
                  : selectedDayRecords.map(rec => {
                    const cat = catOf(rec.category);
                    return (
                      <Card key={rec.id} onClick={() => openDetail(rec,"calendar")} style={{ marginBottom:8, padding:"12px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                          {rec.thumbnail?<img src={rec.thumbnail} style={{ width:34,height:46,objectFit:"cover",borderRadius:0,border:`1px solid ${F.border}`,flexShrink:0 }} />:<div style={{ width:34,height:46,borderRadius:0,background:"#F6F6F7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>{cat.emoji}</div>}
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:700, color:F.text, margin:"0 0 4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.title}</p>
                            <Stars v={Number(rec.rating)} size={11} />
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
          <div ref={moreScrollRef} style={screenWrap}>
            <div style={{ padding:"20px 20px 6px" }}>
              <span style={{ fontSize:11, fontWeight:800, letterSpacing:"0.14em", color:F.text }}>ARCHIVE.LOG</span>
            </div>
            <div style={{ padding:"4px 20px 18px", borderBottom:`1px solid ${F.border}`, marginBottom:18 }}>
              <h2 style={{ fontSize:26, fontWeight:800, color:F.text, margin:0, letterSpacing:-0.5 }}>Account</h2>
            </div>

            {session?.user && (
              <Card style={{ margin:"0 20px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  {session?.user?.image
                    ? <img src={session?.user?.image} style={{ width:48, height:48, borderRadius:"50%", border:`1px solid ${F.border}` }} />
                    : <div style={{ width:48,height:48,borderRadius:0,background:F.text,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700 }}>U</div>
                  }
                  <div>
                    <p style={{ fontSize:15, fontWeight:700, color:F.text, margin:"0 0 3px" }}>{session?.user?.name}</p>
                    <p style={{ fontSize:11, color:F.textMut, margin:0 }}>{session?.user?.email}</p>
                  </div>
                </div>
              </Card>
            )}
            <div style={{ margin:"0 20px 16px", display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[
                { label:"TOTAL", value:`${records.length}개` },
                { label:"AVG RATING", value:records.filter(r=>Number(r.rating)>0).length?`${(records.filter(r=>Number(r.rating)>0).reduce((s,r)=>s+Number(r.rating),0)/records.filter(r=>Number(r.rating)>0).length).toFixed(1)}점`:"-" },
                { label:"THIS MONTH", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}개` },
              ].map(s => (
                <Card key={s.label} style={{ padding:"12px 6px" }}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:16, fontWeight:800, color:F.text, margin:"0 0 4px" }}>{s.value}</p>
                    <p style={{ fontSize:9, fontWeight:700, letterSpacing:"0.08em", color:F.textMut, margin:0 }}>{s.label}</p>
                  </div>
                </Card>
              ))}
            </div>
            <Card style={{ margin:"0 20px", padding:"0 16px" }}>
              {[
                { label:"STATISTICS (통계 보기)",   action:()=>navigateTo("category") },
                { label:"CALENDAR (캘린더 보기)",   action:()=>navigateTo("calendar") },
              ].map((item,i,arr) => (
                <button key={item.label} onClick={item.action}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifycontent:"space-between", padding:"15px 0", background:"none", border:"none", borderBottom:i<arr.length-1?`1px solid ${F.border}`:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                  <span style={{ fontSize:12, fontWeight:700, letterSpacing:"0.06em", color:F.text }}>{item.label}</span>
                  <span style={{ color:F.textMut, fontSize:16 }}>›</span>
                </button>
              ))}
            </Card>
            <div style={{ margin:"16px 20px 0" }}>
              <button onClick={() => { setRecords([]); signOut({ callbackUrl:"/login" }); }}
                style={{ width:"100%", padding:"14px", background:"#FEF2F2", border:"1px solid #FECACA", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:"0.12em", color:"#DC2626" }}>
                SIGN OUT (로그아웃)
              </button>
            </div>
          </div>
        )}

        {/* ══ BOTTOM NAV ════════════════════════════════════════════ */}
        {view!=="add" && (
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:390, display:"flex", alignItems:"center", background:F.white, borderTop:`1px solid ${F.border}`, padding:"8px 0 12px", zIndex:20 }}>
            {[{id:"home",label:"HOME"},{id:"calendar",label:"CALENDAR"}].map(n => (
              <button key={n.id}
                onClick={() => {
                  const activeTab = ["home","calendar","category","more"].includes(view) ? view : prevView;
                  if (activeTab === n.id && view === n.id) {
                    scrollRefs[n.id]?.current?.scrollTo({ top:0, behavior:"smooth" });
                  } else {
                    navigateTo(n.id as any);
                  }
                }}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <span style={{ fontSize:10, letterSpacing:"0.12em", color:view===n.id?F.text:F.textMut, fontWeight:view===n.id?800:500, borderBottom:view===n.id?`1.5px solid ${F.text}`:"1.5px solid transparent", paddingBottom:2, transition:"all 0.2s" }}>{n.label}</span>
              </button>
            ))}
            <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center" }}>
              <button onClick={() => { reset(); navigateTo("add"); }}
                style={{ padding:"7px 14px", borderRadius:0, background:F.text, border:"none", color:"#fff", fontSize:11, fontWeight:700, letterSpacing:"0.12em", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"opacity 0.15s", WebkitTapHighlightColor:"transparent", outline:"none" }}
                onMouseEnter={e => (e.currentTarget.style.opacity="0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity="1")}>
                + ADD
              </button>
            </div>
            {[{id:"category",label:"STATS"},{id:"more",label:"MORE"}].map(n => (
              <button key={n.id} onClick={() => {
                  const activeTab = ["home","calendar","category","more"].includes(view) ? view : prevView;
                  if (activeTab === n.id && view === n.id) {
                    scrollRefs[n.id]?.current?.scrollTo({ top:0, behavior:"smooth" });
                  } else {
                    navigateTo(n.id as any);
                  }
                }}
                style={{ flex:1, border:"none", background:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, fontFamily:"inherit", padding:"4px 0", WebkitTapHighlightColor:"transparent", outline:"none" }}>
                <span style={{ fontSize:10, letterSpacing:"0.12em", color:view===n.id?F.text:F.textMut, fontWeight:view===n.id?800:500, borderBottom:view===n.id?`1.5px solid ${F.text}`:"1.5px solid transparent", paddingBottom:2, transition:"all 0.2s" }}>{n.label}</span>
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
