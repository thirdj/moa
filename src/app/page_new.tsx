"use client";

// import { useState, useEffect, useRef } from "react";
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

// ── Design tokens — Editorial Monochrome (page.tsx 스타일) ──────────
const F = {
  bg:      "#f6f6f7",
  white:   "#FFFFFF",
  border:  "#E5E5E5",
  text:    "#171717",
  textSub: "#525252",
  textMut: "#A3A3A3",
  accent:  "#171717",
  accentColor: "#171717",
  shadow:  "0 1px 20px rgba(0,0,0,0.03)",
  shadowMd:"0 10px 24px rgba(0,0,0,0.08)",
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

// ── OTT 프리셋 (수동 지정용) ───────────────────────────────────────
const OTT_PRESETS = OTT_PRESET_NAMES;
const isSameOtt = (formName: string, presetName: string) => {
  if (!formName) return false;
  if (formName === presetName) return true;
  const preset = OTT_PRESETS.find(p => p.name === presetName);
  const n = formName.toLowerCase();
  return preset?.match.some(m => n.includes(m)) ?? false;
};

// 국내 OTT 8곳의 실제 TMDB 로고를 앱 전역에서 한 번만 가져와 캐싱
let cachedOttLogos: Record<string, string | null> | null = null;
let ottPromise: Promise<Record<string, string | null>> | null = null;

// src/app/page.tsx 내 useOttLogos 부분만 이렇게 유지
function useOttLogos(enabled: boolean) {
  const [logos, setLogos] = useState<Record<string, string | null>>(cachedOttLogos || {});
  const [loaded, setLoaded] = useState(!!cachedOttLogos);

  useEffect(() => {
    if (!enabled || cachedOttLogos) return;

    if (!ottPromise) {
      ottPromise = fetch("/api/tmdb/ott-list")
        .then(r => (r.ok ? r.json() : null))
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
    <div style={{ display:"flex", gap:2 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s} onClick={() => onChange?.(s)}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          style={{ fontSize:size, color: s<=(hover||v) ? "#171717" : "#E5E5E5", cursor:onChange?"pointer":"default", userSelect:"none", lineHeight:1, transition:"color 0.1s" }}>
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

// ── Input style (Editorial Square Style) ───────────────────────────
const flatInput: React.CSSProperties = {
  width:"100%", padding:"10px 12px", borderRadius:0,
  border:"1px solid #D4D4D4", outline:"none", fontFamily:"inherit",
  background:"#FFFFFF", boxSizing:"border-box",
  fontSize:14, color:"#171717",
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
    <div className="relative">
      <button
        type="button"
        onClick={() => { if(!disabled) setOpen(o => !o); }}
        className={`w-full px-3 py-2.5 border text-left flex items-center justify-between text-sm transition ${
          open ? "border-neutral-900" : "border-neutral-300"
        } ${disabled ? "opacity-40 cursor-default" : "cursor-pointer bg-white"}`}
      >
        <span className={value ? "text-neutral-900 font-medium" : "text-neutral-400"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-400">DATE</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-neutral-900 shadow-2xl z-50 p-3">
          <div className="flex items-center justify-between mb-3 px-1">
            <button type="button" onClick={prevMonth} className="text-neutral-600 hover:text-neutral-900 px-2 py-0.5 text-base cursor-pointer">‹</button>
            <span className="text-xs font-bold tracking-wider uppercase text-neutral-900">{calY}. {String(calM+1).padStart(2, "0")}</span>
            <button
              type="button"
              onClick={nextMonth}
              className={`text-neutral-600 hover:text-neutral-900 px-2 py-0.5 text-base cursor-pointer ${
                `${calY}-${String(calM+2).padStart(2,"0")}-01` > today ? "opacity-25" : ""
              }`}
            >›</button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i) => (
              <div key={d} className={`text-center text-[9px] font-bold tracking-wider py-1 ${i===0?"text-red-500":"text-neutral-400"}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({length:first}).map((_,i) => <div key={`e-${i}`} />)}
            {Array.from({length:days}).map((_,i) => {
              const d = i+1;
              const ds = dateStr(d);
              const sel = ds === value;
              const dis = isDisabled(d);
              const isToday = ds === today;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => select(d)}
                  disabled={dis}
                  className={`w-full aspect-square flex items-center justify-center text-xs transition ${
                    sel
                      ? "bg-neutral-900 text-white font-bold"
                      : isToday
                      ? "border border-neutral-900 text-neutral-900 font-bold"
                      : "text-neutral-800 hover:bg-neutral-100"
                  } ${dis ? "opacity-25 cursor-default hover:bg-transparent" : "cursor-pointer"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="text-center mt-2 pt-2 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => { onChange(today); setOpen(false); }}
              className="text-[11px] font-bold tracking-widest uppercase text-neutral-900 hover:underline cursor-pointer"
            >
              TODAY
            </button>
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
      <div className="relative">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onBlur={handleBlur}
          placeholder="포스터 이미지 URL 붙여넣기"
          className="w-full px-3 py-2.5 pr-10 border border-neutral-300 text-sm outline-none focus:border-neutral-900 bg-white"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
          {status==="loading"?"...":status==="ok"?"OK":status==="warn"?"!":"URL"}
        </span>
      </div>
      {status==="ok" && value && (
        <div className="mt-2.5 relative inline-block border border-neutral-200">
          <img src={value} className="h-20 object-cover block" onError={e=>{(e.target as HTMLImageElement).style.display="none";}} />
          <button
            type="button"
            onClick={()=>{onChange("");setInput("");setStatus("idle");}}
            className="absolute -top-2 -right-2 w-5 h-5 bg-neutral-900 text-white text-[10px] flex items-center justify-center cursor-pointer"
          >✕</button>
        </div>
      )}
      <p className="text-[11px] text-neutral-400 mt-1.5">나무위키·공식사이트에서 우클릭 → 이미지 주소 복사</p>
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

function OttIcon({ name, logoPath, size = 12 }: { name?: string; logoPath?: string; size?: number }) {
  if (!name) return null;
  if (logoPath) {
    return <img src={`https://image.tmdb.org/t/p/original${logoPath}`} alt={name}
      style={{ width:size, height:size, borderRadius:2, objectFit:"cover", flexShrink:0 }} referrerPolicy="no-referrer" />;
  }
  const preset = OTT_PRESETS.find(p => isSameOtt(name, p.name));
  return (
    <span title={name} style={{ width:size, height:size, borderRadius:2, background:preset?.color ?? "#171717", color:"#fff", fontSize:size*0.6, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0, lineHeight:1 }}>
      {(preset?.name ?? name)[0]}
    </span>
  );
}

export default function Home() {
  const { data:session, status } = useSession();
  const { logos: ottLogos } = useOttLogos();
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
  const [finishReview, setFinishReview] = useState("");

  const homeScrollRef     = useRef<HTMLDivElement>(null);
  const scrollPos         = useRef<Record<string, number>>({});
  const calendarScrollRef = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const moreScrollRef     = useRef<HTMLDivElement>(null);

  const scrollRefs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    home:     homeScrollRef,
    calendar: calendarScrollRef,
    category: categoryScrollRef,
    more:     moreScrollRef,
  };

  const { suggestions, loading:acLoading, clear } = useAutocomplete(titleQuery, form.category, showSug && !!form.category);

  const fetchedRef = useRef(false);

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

  // ── 브라우저 히스토리 연동 ────────────────────────────────────────
  const isPopState = useRef(false);

  function navigateTo(next: typeof view) {
    if (next === view) return;
    const tabViews = ["home","calendar","category","more"];
    if (tabViews.includes(view)) {
      const ref = scrollRefs[view]?.current;
      if (ref) scrollPos.current[view] = ref.scrollTop;
    }
    window.history.pushState({ view: next }, "", "");
    setView(next);
  }

  useEffect(() => {
    window.history.replaceState({ view: "home" }, "", "");

    function handlePopState(e: PopStateEvent) {
      isPopState.current = true;
      const prevViewFromHistory = e.state?.view as typeof view | undefined;
      if (!prevViewFromHistory || prevViewFromHistory === "home") {
        setView("home");
      } else {
        setView(prevViewFromHistory);
      }
      isPopState.current = false;
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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
      navigateTo(prevView);
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
    const base = filterCat==="all" ? records : records.filter(r => r.category===filterCat);
    return [...base].sort((a, b) => {
      if (sortBy==="rating") return Number(b.rating) - Number(a.rating);
      if (sortBy==="date") {
        const da = a.date_start || a.date || "";
        const db = b.date_start || b.date || "";
        return db.localeCompare(da);
      }
      return 0;
    });
  }, [records, filterCat, sortBy]);


  const activeCat = catOf(form.category);
  const canSave = !!form.title && !!form.category && (form.category === "book" || !!form.rating);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const calDateStr = (d: number) => `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const recordsOnDay = (d: number) => records.filter(r => r.date?.slice(0,10)===calDateStr(d));
  const selectedDayRecords = records.filter(r => r.date?.slice(0,10)===calSelected);

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f6f7] text-xs tracking-widest uppercase text-neutral-400">
      LOADING ARCHIVE...
    </div>
  );

  const categoryTitleMap: Record<string, string> = {
    all: "All Bookmarks",
    book: "Books & Reading",
    movie: "Movies & Series",
    exhibition: "Exhibitions & Art",
    musical: "Musicals & Theater",
    concert: "Concerts & Live",
  };

  return (
    <div className="min-h-screen bg-[#f6f6f7] text-neutral-900 flex flex-col font-sans">
      <div className="max-w-[1140px] w-full mx-auto bg-white min-h-screen shadow-[0_1px_20px_rgba(0,0,0,0.03)] flex flex-col relative pb-20 md:pb-12">

        {/* ══ TOP GLOBAL HEADER (page.tsx 디자인) ═════════════════════ */}
        <header className="px-6 md:px-14 pt-7 pb-6 border-b border-neutral-200">
          <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.14em] uppercase text-neutral-500 mb-6">
            <button
              type="button"
              onClick={() => navigateTo("home")}
              className="text-neutral-900 font-bold tracking-[0.16em] cursor-pointer"
            >
              ARCHIVE.LOG
            </button>

            <nav className="hidden md:flex items-center gap-7">
              {[
                { id: "home", label: "ARCHIVE" },
                { id: "calendar", label: "CALENDAR" },
                { id: "category", label: "STATS" },
                { id: "more", label: "ACCOUNT" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id as any)}
                  className={`transition cursor-pointer ${
                    view === item.id ? "text-neutral-900 font-bold" : "hover:text-neutral-900"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { reset(); navigateTo("add"); }}
                className="text-neutral-900 underline underline-offset-4 hover:opacity-70 transition cursor-pointer font-bold"
              >
                + NEW RECORD
              </button>
            </nav>

            <div className="flex items-center gap-3 md:hidden">
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  onClick={() => navigateTo("more")}
                  className="w-6 h-6 rounded-full border border-neutral-200 cursor-pointer"
                />
              )}
              <button
                type="button"
                onClick={() => { reset(); navigateTo("add"); }}
                className="px-3 py-1.5 bg-neutral-900 text-white text-[10px] font-bold tracking-wider uppercase cursor-pointer"
              >
                + ADD
              </button>
            </div>
          </div>

          <div className="flex items-end justify-between gap-4">
            <h1 className="text-3xl md:text-[34px] font-bold tracking-tight text-neutral-900">
              {view === "home" && "Bookmarks"}
              {view === "add" && (editId ? "Edit Record" : "New Bookmark")}
              {view === "detail" && "Record Detail"}
              {view === "calendar" && "Calendar"}
              {view === "category" && "Statistics"}
              {view === "more" && "Account"}
            </h1>

            {session?.user?.image && (
              <img
                src={session.user.image}
                alt=""
                onClick={() => navigateTo("more")}
                className="hidden md:block w-8 h-8 rounded-full border border-neutral-200 cursor-pointer"
              />
            )}
          </div>
        </header>

        {/* ══ HOME ══════════════════════════════════════════════════ */}
        <div ref={homeScrollRef} className={view==="home" ? "flex-1 flex flex-col" : "hidden"}>
          {/* 카테고리 탭 바 */}
          <div className="border-b border-neutral-200 px-6 md:px-14 flex items-center justify-between overflow-x-auto">

              <div className="flex items-center gap-6 md:gap-8">
                {[{ id: "all", label: "ALL", en: "ALL" }, ...CATS].map((c) => {
                  const active = filterCat === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setFilterCat(c.id)}
                      className={`py-3.5 text-[11px] font-bold tracking-[0.12em] uppercase border-b-2 transition shrink-0 cursor-pointer ${
                        active
                          ? "border-neutral-900 text-neutral-900"
                          : "border-transparent text-neutral-400 hover:text-neutral-700"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 서브 헤더 & 정렬 */}
            <section className="px-6 md:px-14 pt-7 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  {categoryTitleMap[filterCat] || "All Bookmarks"}
                </h2>
                <p className="text-[11px] font-medium tracking-wider uppercase text-neutral-400 mt-0.5">
                  {filtered.length} RECORDS SAVED
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-neutral-600">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "latest"|"date"|"rating")}
                  className="bg-transparent border-b border-neutral-300 py-1 pr-2 text-xs font-semibold text-neutral-800 outline-none focus:border-neutral-900 cursor-pointer"
                >
                  <option value="latest">Sort by latest (최신순)</option>
                  <option value="date">Sort by date (관람순)</option>
                  <option value="rating">Sort by rating (별점순)</option>
                </select>
              </div>
            </section>

            {/* 카드 그리드 */}
            <main className="px-6 md:px-14 pb-10 flex-1">
              {loading ? (
                <div className="py-20 text-center text-xs tracking-widest uppercase text-neutral-400">
                  Loading archive...
                </div>
              ) : records.length===0 ? (
                <div className="border border-neutral-200 py-20 px-6 text-center">
                  <p className="text-sm text-neutral-500 mb-2">아직 기록이 없어요</p>
                  <p className="text-xs text-neutral-400 mb-5">+ 버튼으로 첫 기록을 남겨보세요</p>
                  <button
                    type="button"
                    onClick={() => { reset(); navigateTo("add"); }}
                    className="px-5 py-2.5 bg-neutral-900 text-white text-xs font-semibold tracking-wider uppercase hover:bg-neutral-800 transition cursor-pointer"
                  >
                    + Add First Bookmark
                  </button>
                </div>
              ) : filtered.length===0 ? (
                <div className="border border-neutral-200 py-20 px-6 text-center">
                  <p className="text-sm text-neutral-500">해당 카테고리의 기록이 없어요</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtered.map((rec) => {
                    const cat = catOf(rec.category);
                    const isReadingBook = rec.category === "book" && !rec.finished && rec.date_start;

                    return (
                      <article
                        key={rec.id}
                        onClick={() => openDetail(rec, "home")}
                        className="group bg-white border border-neutral-200/90 hover:border-neutral-900 hover:shadow-[0_10px_24px_rgba(0,0,0,0.06)] transition-all duration-200 cursor-pointer flex flex-col"
                      >
                        {/* 썸네일 영역 */}
                        <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
                          {rec.thumbnail ? (
                            <img
                              src={rec.thumbnail}
                              alt={rec.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-neutral-400">
                              <span className="text-xl">{cat.emoji}</span>
                              <span>NO POSTER</span>
                            </div>
                          )}

                          {/* 상단 오버레이 배지 */}
                          <div className="absolute inset-x-0 top-0 p-3 flex items-center justify-between">
                            <span className="px-2 py-0.5 bg-neutral-900/85 text-white text-[10px] font-semibold tracking-wider uppercase flex items-center gap-1.5">
                              {movieTypeLabel(rec)}
                              {rec.category==="movie" && <OttIcon name={rec.ott_name} logoPath={rec.ott_logo_path} size={11} />}
                            </span>

                            {isReadingBook && (
                              <span className="px-2 py-0.5 bg-amber-500 text-white text-[10px] font-bold tracking-wider">
                                읽는 중
                              </span>
                            )}
                            {rec.category === "book" && rec.finished && (
                              <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-bold tracking-wider">
                                완독
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 하단 정보 영역 */}
                        <div className="p-4 flex items-start justify-between gap-3 bg-white flex-1">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-6 h-6 bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {cat.code}
                            </div>

                            <div className="min-w-0">
                              <h3 className="text-[13px] font-semibold text-neutral-900 truncate">
                                {rec.title}
                              </h3>
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                                {rec.review || rec.author || rec.venue || `${cat.label} 기록`}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                {isReadingBook ? (
                                  <span className="text-[11px] font-semibold text-amber-600">
                                    READING
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-neutral-900">
                                    ★ {Number(rec.rating).toFixed(1)}
                                  </span>
                                )}
                                {rec.ott_name && (
                                  <span className="text-[10px] text-neutral-500 truncate">
                                    · {rec.ott_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] text-neutral-400 shrink-0 mt-0.5 font-mono">
                            {formatDate(rec.date)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </main>
          </div>


        {/* ══ ADD / EDIT ════════════════════════════════════════════ */}
        {view==="add" && (
          <div className="flex-1 px-6 md:px-14 py-8 max-w-2xl w-full mx-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-6">
              <button
                type="button"
                onClick={() => { const wasEdit = !!editId; reset(); navigateTo(wasEdit ? "detail" : "home"); }}
                className="text-xs font-bold tracking-wider uppercase text-neutral-500 hover:text-neutral-900 cursor-pointer flex items-center gap-1"
              >
                ‹ BACK
              </button>
              <span className="text-xs font-bold tracking-widest uppercase text-neutral-400">
                {editId ? "EDIT MODE" : "CREATE MODE"}
              </span>
            </div>

            {/* 카테고리 선택 */}
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
              Category *
            </label>
            <div className="grid grid-cols-5 gap-2 mb-5">
              {CATS.map(c => {
                const isSelected = form.category === c.id;
                const isDisabled = !!editId && !isSelected;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { if(isDisabled) return; setForm(f => ({...f, category:c.id, thumbnail:"", author:""})); setTitleQuery(""); clear(); }}
                    className={`py-3 px-2 border text-center transition flex flex-col items-center gap-1 ${
                      isSelected
                        ? "bg-neutral-900 text-white border-neutral-900"
                        : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                    } ${isDisabled ? "opacity-30 cursor-default" : "cursor-pointer"}`}
                  >
                    <span className="text-lg">{c.emoji}</span>
                    <span className="text-[11px] font-bold tracking-wider">{c.label}</span>
                  </button>
                );
              })}
            </div>
            {editId && (
              <p className="text-[11px] text-neutral-400 -mt-3 mb-5">
                * 수정 시 카테고리는 변경할 수 없습니다.
              </p>
            )}

            {/* 제목 & 자동완성 */}
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
              Title * {form.category && <span className="text-neutral-400 font-normal normal-case">— {activeCat.id==="book"||activeCat.id==="movie" ? "API 검색 및 내 기록 자동완성" : "내 기록 자동완성"}</span>}
            </label>
            <div className="relative mb-2">
              <input
                value={titleQuery}
                onChange={e => { setTitleQuery(e.target.value); setForm(f => ({...f, title:e.target.value, thumbnail:""})); setShowSug(true); }}
                onFocus={() => setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                placeholder={form.category ? `${activeCat.label} 제목을 입력하세요...` : "카테고리를 먼저 선택하세요"}
                disabled={!form.category}
                style={flatInput}
              />
              {acLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
              )}
            </div>

            {/* 자동완성 드롭다운 */}
            <div style={{ position:"relative", marginBottom: showSug && suggestions.length>0 ? 250 : 16, transition:"margin 0.2s" }}>
              {showSug && suggestions.length>0 && (
                <div className="absolute top-0 left-0 right-0 bg-white border border-neutral-900 shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-neutral-100">
                  {suggestions.filter(s => s.source==="history").length>0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-neutral-400 bg-neutral-50">
                        My History
                      </div>
                      {suggestions.filter(s => s.source==="history").map(s => (
                        <div
                          key={s.id}
                          onClick={() => pickSug(s)}
                          className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-neutral-50"
                        >
                          <span className="text-xs">{s.type==="venue"?"📍":s.type==="author"?"👤":"🕒"}</span>
                          <span className="text-xs font-semibold text-neutral-900">{s.title}</span>
                          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-neutral-100 text-neutral-600">
                            내 기록
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  {suggestions.filter(s => s.source==="api").length>0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-neutral-400 bg-neutral-50">
                        Search Results
                      </div>
                      {suggestions.filter(s => s.source==="api").map(s => (
                        <div
                          key={s.id}
                          onClick={() => pickSug(s)}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-neutral-50"
                        >
                          {s.thumbnail ? (
                            <img src={s.thumbnail} className="w-8 h-11 object-cover bg-neutral-100 shrink-0" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-8 h-11 bg-neutral-100 flex items-center justify-center text-xs shrink-0">{activeCat.emoji}</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-neutral-900 truncate">{s.title}</p>
                            {s.author && (
                              <p className="text-[11px] text-neutral-400 truncate">
                                {(s as any).description && <span className="text-neutral-900 font-semibold mr-1">[{(s as any).description}]</span>}
                                {s.author}{s.publishedDate ? ` · ${s.publishedDate.slice(0,4)}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 선택 프리뷰 */}
            {form.thumbnail && !showSug && (
              <div className="flex items-center gap-3 p-3 bg-neutral-50 border border-neutral-200 mb-5">
                <img src={form.thumbnail} className="w-9 h-12 object-cover border border-neutral-200" referrerPolicy="no-referrer" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-900 truncate">{form.title}</p>
                  {form.author && <p className="text-[11px] text-neutral-500">{form.author}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({...f, thumbnail:"", author:""}))}
                  className="text-xs text-neutral-400 hover:text-neutral-900 px-2 cursor-pointer"
                >✕</button>
              </div>
            )}

            {/* 날짜 입력 */}
            {form.category==="book" ? (
              <div className="mb-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Start Date <span className="text-neutral-400 font-normal normal-case">(읽기 시작일 · 선택)</span>
                </label>
                <DatePicker
                  value={form.date_start}
                  onChange={v => setForm(f => ({ ...f, date_start:v, date:v||f.date }))}
                  placeholder="읽기 시작한 날"
                />
              </div>
            ) : (
              <div className="mb-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Date
                </label>
                <DatePicker
                  value={form.date}
                  onChange={v => setForm(f => ({ ...f, date:v }))}
                  placeholder="날짜 선택"
                />
              </div>
            )}

            {/* 장소 — 책 제외 */}
            {form.category && form.category!=="book" && (
              <div className="mb-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Venue <span className="text-neutral-400 font-normal normal-case">(장소 · 선택)</span>
                </label>
                <input
                  value={form.venue}
                  onChange={e => setForm(f => ({...f, venue:e.target.value}))}
                  placeholder={
                    form.category==="movie"      ? "예) CGV 강남, 메가박스 코엑스" :
                    form.category==="exhibition" ? "예) 국립현대미술관, 예술의전당" :
                    form.category==="musical"    ? "예) 블루스퀘어 신한카드홀" :
                    form.category==="concert"    ? "예) 올림픽공원 KSPO돔" : "어디서 봤나요?"
                  }
                  style={flatInput}
                />
              </div>
            )}

            {/* OTT — 영화 카테고리만 */}
            {form.category==="movie" && (
              <div className="mb-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  OTT Platform <span className="text-neutral-400 font-normal normal-case">(선택)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {OTT_PRESETS.map(p => {
                    const isSelected = isSameOtt(form.ott_name, p.name);
                    const logoPath = ottLogos[p.name];
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, ott_name:isSelected ? "" : p.name, ott_logo_path:isSelected ? "" : (logoPath ?? "") }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                        }`}
                      >
                        {logoPath ? (
                          <img src={`https://image.tmdb.org/t/p/original${logoPath}`} alt={p.name} className="w-4 h-4 object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="w-3.5 h-3.5 bg-neutral-800 text-white text-[9px] font-bold flex items-center justify-center">{p.name[0]}</span>
                        )}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {form.ott_name && !OTT_PRESETS.some(p => isSameOtt(form.ott_name, p.name)) && (
                  <p className="text-[11px] text-neutral-500 mt-1.5">현재: {form.ott_name} (자동 조회됨)</p>
                )}
              </div>
            )}

            {/* 별점 */}
            <div className="mb-5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                Rating
              </label>
              <Stars v={form.rating} onChange={v => setForm(f => ({...f, rating:v}))} size={28} />
            </div>

            {/* 한줄 리뷰 */}
            <div className="mb-5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                Notes <span className="text-neutral-400 font-normal normal-case">(한 줄 리뷰 · 선택)</span>
              </label>
              <textarea
                value={form.review}
                onChange={e => setForm(f => ({...f, review:e.target.value.slice(0,100)}))}
                placeholder="한 줄로 느낀 점을 남겨보세요."
                maxLength={100}
                rows={3}
                style={{ ...flatInput, resize:"none", lineHeight:1.6 }}
              />
              <p className="text-right text-[11px] text-neutral-400 mt-1">{form.review.length}/100</p>
            </div>

            {/* 이미지 URL — 전시/공연/콘서트만 */}
            {form.category && !["book","movie"].includes(form.category) && (
              <div className="mb-6">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  Poster URL <span className="text-neutral-400 font-normal normal-case">(선택)</span>
                </label>
                <ImageUrlInput value={form.thumbnail} onChange={url => setForm(f => ({...f, thumbnail:url}))} />
              </div>
            )}

            {/* 저장 버튼 */}
            <button
              type="button"
              onClick={save}
              disabled={!canSave||saving}
              className={`w-full py-3.5 text-xs font-bold tracking-widest uppercase transition ${
                canSave
                  ? "bg-neutral-900 hover:bg-neutral-800 text-white cursor-pointer"
                  : "bg-neutral-200 text-neutral-400 cursor-default"
              }`}
            >
              {saving ? "SAVING..." : "SAVE BOOKMARK"}
            </button>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════ */}
        {view==="detail" && selected && (() => {
          const cat = catOf(selected.category);
          return (
            <div className="flex-1 px-6 md:px-14 py-8 max-w-3xl w-full mx-auto">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-200 mb-6">
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="text-xs font-bold tracking-wider uppercase text-neutral-500 hover:text-neutral-900 cursor-pointer"
                >
                  ‹ BACK TO ARCHIVE
                </button>
                <span className="text-xs font-mono text-neutral-400">
                  {selected.category==="book" ? (selected.date_start ? formatDate(selected.date_start) : formatDate(selected.date)) : formatDate(selected.date)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 items-start">
                {/* 포스터 */}
                <div className="w-full aspect-[2/3] bg-neutral-100 border border-neutral-200 overflow-hidden">
                  {selected.thumbnail ? (
                    <img src={selected.thumbnail} className="w-full h-full object-cover block" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-neutral-400">
                      <span className="text-5xl">{cat.emoji}</span>
                      <span className="text-[11px] font-bold tracking-widest uppercase">NO POSTER</span>
                    </div>
                  )}
                </div>

                {/* 상세 정보 */}
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-bold tracking-widest uppercase inline-flex items-center gap-1.5">
                      {cat.emoji} {movieTypeLabel(selected)}
                      {selected.category==="movie" && <OttIcon name={selected.ott_name} logoPath={selected.ott_logo_path} size={11} />}
                    </span>

                    {selected.category==="book" && (
                      selected.finished ? (
                        <span className="px-2.5 py-1 border border-neutral-900 text-neutral-900 text-[10px] font-bold tracking-widest uppercase">
                          ✓ 완독
                        </span>
                      ) : selected.date_start ? (
                        <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold tracking-widest uppercase">
                          📚 읽는 중
                        </span>
                      ) : null
                    )}
                  </div>

                  {/* 제목 */}
                  <div className="mb-4">
                    {(selected.category==="book" || selected.category==="movie") ? (
                      <a
                        href={selected.category==="book" ? `https://www.google.com/search?q=${encodeURIComponent(selected.title+" "+(selected.author??""))}&tbm=bks` : `https://www.themoviedb.org/search?query=${encodeURIComponent(selected.title)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-block"
                      >
                        <h2 className="text-2xl font-bold text-neutral-900 group-hover:underline">
                          {selected.title} <span className="text-sm text-neutral-400">↗</span>
                        </h2>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {selected.category==="book" ? "Google Books에서 보기" : "TMDB에서 보기"}
                        </p>
                      </a>
                    ) : (
                      <h2 className="text-2xl font-bold text-neutral-900">{selected.title}</h2>
                    )}
                  </div>

                  {/* 별점 */}
                  <div className="flex items-center gap-2.5 pb-5 border-b border-neutral-200 mb-5">
                    <Stars v={Number(selected.rating)} size={18} />
                    <span className="text-base font-bold text-neutral-900">{Number(selected.rating).toFixed(1)}</span>
                  </div>

                  {/* 메타 정보 */}
                  <div className="space-y-2.5 text-sm text-neutral-700 mb-6">
                    {selected.author && (
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 w-16">Author</span>
                        <span>{selected.author}</span>
                      </div>
                    )}
                    {selected.venue && (
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 w-16">Venue</span>
                        <span>{selected.venue}</span>
                      </div>
                    )}
                    {selected.category==="book" && selected.date_start && (
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 w-16">Period</span>
                        <span className="font-mono text-xs">
                          {formatDate(selected.date_start)}
                          {(selected.finished||selected.date_end) && <> → {selected.date_end ? formatDate(selected.date_end) : "읽는 중"}</>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 리뷰 */}
                  {selected.review && (
                    <div className="p-4 bg-neutral-50 border border-neutral-200 mb-6">
                      <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-400 mb-1.5">Review Note</p>
                      <p className="text-sm text-neutral-900 leading-relaxed">"{selected.review}"</p>
                    </div>
                  )}

                  {/* 완독 버튼 */}
                  {selected.category==="book" && !selected.finished && (
                    <button
                      type="button"
                      onClick={() => { setFinishRating(Number(selected.rating) || 0); setFinishReview(selected.review ?? ""); setShowRatingModal(true); }}
                      className="w-full py-3 mb-4 border border-neutral-900 bg-white hover:bg-neutral-900 hover:text-white text-neutral-900 text-xs font-bold tracking-widest uppercase transition cursor-pointer"
                    >
                      📖 완독했어요! (MARK AS FINISHED)
                    </button>
                  )}

                  {/* 수정 / 삭제 */}
                  <div className="flex gap-3 pt-4 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={() => openEdit(selected)}
                      className="flex-1 py-2.5 border border-neutral-300 hover:border-neutral-900 text-xs font-bold tracking-widest uppercase text-neutral-900 transition cursor-pointer"
                    >
                      수정 (EDIT)
                    </button>
                    <button
                      type="button"
                      onClick={() => del(selected.id)}
                      disabled={deleting}
                      className="flex-1 py-2.5 border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold tracking-widest uppercase text-red-600 transition cursor-pointer"
                    >
                      {deleting ? "DELETING..." : "삭제 (DELETE)"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 삭제 중 오버레이 ─────────────────────────────────── */}
        {deleting && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white border border-neutral-900 px-8 py-6 flex flex-col items-center gap-3 shadow-2xl">
              <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold tracking-widest uppercase text-neutral-900">DELETING...</span>
            </div>
          </div>
        )}

        {/* ── 완독 별점 모달 ───────────────────────────────────────── */}
        {showRatingModal && selected && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowRatingModal(false); }}
          >
            <div className="bg-white border border-neutral-200 p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-4">
                <h3 className="text-sm font-bold tracking-wider uppercase text-neutral-900">📖 완독 축하해요!</h3>
                <button type="button" onClick={() => setShowRatingModal(false)} className="text-xs text-neutral-400 hover:text-neutral-900 cursor-pointer">✕</button>
              </div>
              <p className="text-xs text-neutral-500 mb-4">이 책은 어떠셨나요?</p>

              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Rating</p>
              <div className="mb-5">
                <Stars v={finishRating} onChange={setFinishRating} size={32} />
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                Review Note <span className="font-normal normal-case">(선택)</span>
              </p>
              <textarea
                value={finishReview}
                onChange={e => setFinishReview(e.target.value)}
                placeholder="이 책에 대한 짧은 감상을 남겨보세요"
                rows={3}
                className="w-full px-3 py-2 border border-neutral-300 text-sm outline-none focus:border-neutral-900 mb-5"
              />

              <button
                type="button"
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
                className="w-full py-3 bg-neutral-900 text-white text-xs font-bold tracking-widest uppercase cursor-pointer"
              >
                완료 (COMPLETE)
              </button>
            </div>
          </div>
        )}

        {/* ══ CATEGORY = 통계 ═══════════════════════════════════════ */}
        {view==="category" && (
          <div ref={categoryScrollRef} className="flex-1 px-6 md:px-14 py-8 space-y-6">
            {/* 요약 카드 */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label:"TOTAL RECORDS", value:`${records.length}` },
                { label:"AVERAGE RATING", value:records.filter(r=>Number(r.rating)>0).length?`${(records.filter(r=>Number(r.rating)>0).reduce((s,r)=>s+Number(r.rating),0)/records.filter(r=>Number(r.rating)>0).length).toFixed(1)}`:"-" },
                { label:"THIS MONTH", value:`${records.filter(r=>r.date?.slice(0,7)===todayStr().slice(0,7)).length}` },
              ].map(s => (
                <div key={s.label} className="border border-neutral-200 p-5 text-center bg-white">
                  <p className="text-2xl font-bold text-neutral-900 mb-1">{s.value}</p>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-neutral-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 카테고리별 분포 */}
            <div className="border border-neutral-200 p-6 bg-white">
              <p className="text-xs font-bold tracking-widest uppercase text-neutral-900 mb-5">Category Breakdown</p>
              {records.length===0 ? (
                <p className="text-xs text-neutral-400 text-center py-6">아직 기록이 없어요</p>
              ) : (
                <div className="space-y-4">
                  {CATS.map(c => {
                    const cnt = records.filter(r => r.category===c.id).length;
                    if (!cnt) return null;
                    const pct = Math.round((cnt/records.length)*100);
                    const avg = (records.filter(r=>r.category===c.id).reduce((s,r)=>s+Number(r.rating),0)/cnt).toFixed(1);
                    return (
                      <div key={c.id}>
                        <div className="flex justify-between items-center mb-1.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span>{c.emoji}</span>
                            <span className="font-bold text-neutral-900">{c.label}</span>
                            <span className="text-neutral-400">({cnt})</span>
                          </div>
                          <span className="font-bold text-neutral-900">★ {avg}</span>
                        </div>
                        <div className="h-2 bg-neutral-100 overflow-hidden">
                          <div style={{ width:`${pct}%` }} className="h-full bg-neutral-900 transition-all duration-500" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 완독 현황 (책만) */}
            {records.filter(r=>r.category==="book").length > 0 && (
              <div className="border border-neutral-200 p-6 bg-white">
                <p className="text-xs font-bold tracking-widest uppercase text-neutral-900 mb-4">Reading Status</p>
                {(() => {
                  const books = records.filter(r => r.category==="book");
                  const finished = books.filter(r => r.finished).length;
                  const reading = books.filter(r => r.date_start && !r.finished).length;
                  const notStarted = books.length - finished - reading;
                  return (
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label:"완독 (DONE)", value:finished },
                        { label:"읽는 중 (READING)", value:reading },
                        { label:"미시작 (SAVED)", value:notStarted },
                      ].map(s => (
                        <div key={s.label} className="text-center p-4 bg-neutral-50 border border-neutral-200">
                          <p className="text-xl font-bold text-neutral-900 mb-1">{s.value}</p>
                          <p className="text-[10px] font-bold tracking-wider text-neutral-400">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 최고 평점 */}
            {records.length > 0 && (
              <div className="border border-neutral-200 p-6 bg-white">
                <p className="text-xs font-bold tracking-widest uppercase text-neutral-900 mb-4">Top Rated Records</p>
                <div className="divide-y divide-neutral-100">
                  {[...records].sort((a,b)=>Number(b.rating)-Number(a.rating)).slice(0,3).map(rec => {
                    const cat = catOf(rec.category);
                    return (
                      <div
                        key={rec.id}
                        onClick={() => openDetail(rec,"category")}
                        className="flex items-center gap-4 py-3 cursor-pointer hover:bg-neutral-50 px-2 transition"
                      >
                        {rec.thumbnail ? (
                          <img src={rec.thumbnail} className="w-10 h-14 object-cover border border-neutral-200 shrink-0" />
                        ) : (
                          <div className="w-10 h-14 bg-neutral-100 flex items-center justify-center text-lg shrink-0">{cat.emoji}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-neutral-900 truncate mb-1">{rec.title}</p>
                          <Stars v={Number(rec.rating)} size={12} />
                        </div>
                        <span className="text-sm font-bold text-neutral-900">★ {Number(rec.rating).toFixed(1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CALENDAR ══════════════════════════════════════════════ */}
        {view==="calendar" && (
          <div ref={calendarScrollRef} className="flex-1 px-6 md:px-14 py-8 max-w-3xl w-full mx-auto">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-200">
              <button
                type="button"
                onClick={() => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); }}
                className="w-8 h-8 border border-neutral-300 hover:border-neutral-900 flex items-center justify-center text-base cursor-pointer"
              >‹</button>
              <span className="text-base font-bold tracking-wider uppercase text-neutral-900">
                {calYear}. {String(calMonth+1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); }}
                disabled={calYear===new Date().getFullYear() && calMonth===new Date().getMonth()}
                className={`w-8 h-8 border border-neutral-300 flex items-center justify-center text-base ${
                  calYear===new Date().getFullYear() && calMonth===new Date().getMonth() ? "opacity-25 cursor-default" : "hover:border-neutral-900 cursor-pointer"
                }`}
              >›</button>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i) => (
                <div key={d} className={`text-center text-[10px] font-bold tracking-widest py-2 ${i===0?"text-red-500":"text-neutral-400"}`}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 border-t border-l border-neutral-200">
              {Array.from({length:firstDay}).map((_,i) => (
                <div key={`e-${i}`} className="aspect-square border-r border-b border-neutral-200 bg-neutral-50/50" />
              ))}
              {Array.from({length:daysInMonth}).map((_,i) => {
                const day=i+1; const ds=calDateStr(day); const recs=recordsOnDay(day);
                const isSel=calSelected===ds; const isToday=ds===todayStr();
                const isFuture=ds>todayStr();
                return (
                  <div
                    key={day}
                    onClick={() => { if(!isFuture) setCalSelected(ds); }}
                    className={`aspect-square border-r border-b border-neutral-200 p-1.5 flex flex-col items-center justify-between transition ${
                      isSel ? "bg-neutral-900 text-white" : isToday ? "bg-neutral-100" : "bg-white hover:bg-neutral-50"
                    } ${isFuture ? "opacity-30 cursor-default" : "cursor-pointer"}`}
                  >
                    <span className={`text-xs ${isSel || isToday ? "font-bold" : "font-medium"}`}>{day}</span>
                    <div className="flex gap-1 mb-1">
                      {recs.slice(0,3).map((_, idx) => (
                        <div key={idx} className={`w-1.5 h-1.5 rounded-full ${isSel ? "bg-white" : "bg-neutral-900"}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {calSelected && (
              <div className="mt-8">
                <p className="text-xs font-bold tracking-widest uppercase text-neutral-400 mb-3">
                  RECORDS ON {calSelected.replace(/-/g,".")}
                </p>
                {selectedDayRecords.length===0 ? (
                  <div className="border border-neutral-200 py-10 text-center text-xs text-neutral-400">
                    이 날의 기록이 없어요
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedDayRecords.map(rec => {
                      const cat = catOf(rec.category);
                      return (
                        <div
                          key={rec.id}
                          onClick={() => openDetail(rec,"calendar")}
                          className="border border-neutral-200 hover:border-neutral-900 p-3 flex items-center gap-3.5 cursor-pointer transition bg-white"
                        >
                          {rec.thumbnail ? (
                            <img src={rec.thumbnail} className="w-9 h-12 object-cover shrink-0" />
                          ) : (
                            <div className="w-9 h-12 bg-neutral-100 flex items-center justify-center text-base shrink-0">{cat.emoji}</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-neutral-900 truncate mb-1">{rec.title}</p>
                            <Stars v={Number(rec.rating)} size={12} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ MORE ══════════════════════════════════════════════════ */}
        {view==="more" && (
          <div ref={moreScrollRef} className="flex-1 px-6 md:px-14 py-8 max-w-2xl w-full mx-auto space-y-6">
            {session?.user && (
              <div className="border border-neutral-200 p-6 flex items-center gap-4 bg-white">
                {session?.user?.image ? (
                  <img src={session?.user?.image} className="w-12 h-12 rounded-full border border-neutral-200" />
                ) : (
                  <div className="w-12 h-12 bg-neutral-900 text-white flex items-center justify-center text-lg">👤</div>
                )}
                <div>
                  <p className="text-base font-bold text-neutral-900">{session?.user?.name}</p>
                  <p className="text-xs text-neutral-400">{session?.user?.email}</p>
                </div>
              </div>
            )}

            <div className="border border-neutral-200 divide-y divide-neutral-200 bg-white">
              {[
                { label:"통계 보기 (STATISTICS)", action:()=>navigateTo("category") },
                { label:"캘린더 보기 (CALENDAR)", action:()=>navigateTo("calendar") },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.action}
                  className="w-full flex items-center justify-between px-5 py-4 text-xs font-bold tracking-wider uppercase text-neutral-900 hover:bg-neutral-50 cursor-pointer"
                >
                  <span>{item.label}</span>
                  <span className="text-neutral-400">›</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => { setRecords([]); signOut({ callbackUrl:"/login" }); }}
              className="w-full border border-red-200 bg-red-50 hover:bg-red-100 px-5 py-4 text-xs font-bold tracking-widest uppercase text-red-600 cursor-pointer text-center"
            >
              로그아웃 (SIGN OUT)
            </button>
          </div>
        )}

        {/* ══ BOTTOM NAV (모바일 대응 + 데스크탑 하단 바) ═══════════ */}
        {view!=="add" && (
          <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1140px] bg-white border-t border-neutral-200 px-6 md:px-14 py-2.5 z-30 flex items-center justify-between">
            {[{id:"home",label:"ARCHIVE"},{id:"calendar",label:"CALENDAR"}].map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  const activeTab = ["home","calendar","category","more"].includes(view) ? view : prevView;
                  if (activeTab === n.id && view === n.id) {
                    scrollRefs[n.id]?.current?.scrollTo({ top:0, behavior:"smooth" });
                  } else {
                    navigateTo(n.id as any);
                  }
                }}
                className={`text-[11px] font-bold tracking-[0.14em] uppercase py-1 cursor-pointer transition ${
                  view===n.id ? "text-neutral-900 underline underline-offset-4" : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {n.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => { reset(); navigateTo("add"); }}
              className="px-4 py-1.5 bg-neutral-900 text-white text-xs font-bold tracking-widest uppercase hover:bg-neutral-800 transition cursor-pointer"
            >
              + NEW
            </button>

            {[{id:"category",label:"STATS"},{id:"more",label:"MORE"}].map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  const activeTab = ["home","calendar","category","more"].includes(view) ? view : prevView;
                  if (activeTab === n.id && view === n.id) {
                    scrollRefs[n.id]?.current?.scrollTo({ top:0, behavior:"smooth" });
                  } else {
                    navigateTo(n.id as any);
                  }
                }}
                className={`text-[11px] font-bold tracking-[0.14em] uppercase py-1 cursor-pointer transition ${
                  view===n.id ? "text-neutral-900 underline underline-offset-4" : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {n.label}
              </button>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}