import { useEffect, useMemo, useState } from "react";

// === KONFIGURACJA ===
// Podmień na URL Web Appa z Google Apps Script
const DATA_URL = "https://script.google.com/macros/s/AKfycbwvibZlccv52NmXEKbx5WqY_svc3LFU0KzDZIs1o4PnNKYQGC1WSAya21L2P0kAseKk/exec";

// --- TRYB DIAGNOSTYCZNY / TESTY ---
// Dodaj do adresu URL parametry: ?mock=1 (użyj danych testowych), ?debug=1 (panel diagnostyczny), ?test=1 (testy logiki)
const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const USE_MOCK = params.has('mock');
const SHOW_DEBUG = params.has('debug');
const RUN_TESTS = params.has('test');

// Dane testowe (mock) — nie zmieniaj istniejących danych użytkownika
const MOCK_DATA = {
  buildings: [
    { id: "J", name: "Budynek J", capacity: 2 },
    { id: "Z", name: "Budynek Z", capacity: 1 },
    { id: "E", name: "Budynek E", capacity: 2 },
  ],
  blackouts: [
    { date: "2025-10-01", start: "08:00", end: "20:00", building: "ALL", reason: "Inauguracja roku akademickiego" },
    { date: "2025-10-22", start: "09:00", end: "12:00", building: "Z", reason: "Wydarzenie w Z" },
  ],
  bookings: [
    // Dzień z przekroczeniem pojemności w J (2+ wpisy naraz)
    { id: 1, date: "2025-10-20", start: "10:00", end: "13:00", building: "J", org: "Koło Naukowe A", title: "Rekrutacja", status: "Zgłoszone" },
    { id: 2, date: "2025-10-20", start: "11:00", end: "14:00", building: "J", org: "Samorząd", title: "Info punkt", status: "Zgłoszone" },
    { id: 3, date: "2025-10-20", start: "12:00", end: "15:00", building: "J", org: "Organizacja C", title: "Zbiórka", status: "Potwierdzone" },
    // Dzień z blokadą w Z — wpis powinien być oznaczony jako zablokowany (szary)
    { id: 4, date: "2025-10-22", start: "09:30", end: "11:00", building: "Z", org: "Koło B", title: "Promo", status: "Zgłoszone" },
    // Zwykłe wpisy w innych dniach
    { id: 5, date: "2025-10-23", start: "10:00", end: "12:00", building: "E", org: "Koło D", title: "Wystawka", status: "Zgłoszone" },
    { id: 6, date: "2025-10-24", start: "08:00", end: "10:00", building: "J", org: "Koło E", title: "Ankiety", status: "Zgłoszone" },
  ]
};

// Pomocnicze
const PL = {
  months: ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"],
  weekdaysShort: ["Pn","Wt","Śr","Cz","Pt","So","Nd"],
};

function timeToMinutes(t){ if(!t) return 0; const [h,m]=String(t).split(":").map(Number); return h*60+(m||0);} 
function overlaps(aStart,aEnd,bStart,bEnd){return timeToMinutes(aStart)<timeToMinutes(bEnd)&&timeToMinutes(aEnd)>timeToMinutes(bStart);} 
function toISO(d){return d.toISOString().slice(0,10);} 
function fmtDayPL(d){return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});}
function startOfISOWeek(d){const x=new Date(d); const off=(x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-off); return x;}

export default function StandDashboard(){
  const [data,setData]=useState(null); // {buildings, blackouts, bookings}
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [view,setView]=useState("month"); // "week" | "month"
  const [anchor,setAnchor]=useState(()=>{const t=new Date(); t.setHours(0,0,0,0); return t;});
  const [buildingFilter,setBuildingFilter]=useState("ALL");
  const [modalDay,setModalDay]=useState(null); // ISO dnia do podglądu listy

  // --- FETCH / MOCK ---
  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      try{
        if(USE_MOCK){
          if(!cancelled){ setData(MOCK_DATA); }
        } else {
          const res=await fetch(`${DATA_URL}?ts=${Date.now()}`,{cache:"no-store"});
          if(!res.ok) throw new Error("Błąd pobierania: "+res.status);
          const json=await res.json();
          if(!cancelled){ setData(json); }
        }
      }catch(e){ if(!cancelled) setError(String(e)); }
      finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const buildings = data?.buildings ?? [];
  const blackouts = data?.blackouts ?? [];
  const bookings  = data?.bookings  ?? [];

  // Widoczne budynki po filtrze
  const visibleBuildings = useMemo(()=>{
    return buildingFilter==="ALL" ? buildings : buildings.filter(b=>b.id===buildingFilter);
  },[buildings,buildingFilter]);

  function isBlackout(dateISO,start,end,buildingId){
    return blackouts.some(b=> (b.date===dateISO) && (b.building==="ALL" || b.building===buildingId) && overlaps(start,end,b.start,b.end));
  }
  function capacityExceeded(dateISO,start,end,buildingId){
    const cap = buildings.find(b=>b.id===buildingId)?.capacity ?? 1;
    const count = bookings.filter(x=> x.building===buildingId && x.date===dateISO && overlaps(start,end,x.start,x.end)).length;
    return count>cap;
  }

  // --- WEEK DATA ---
  const weekDays = useMemo(()=>{const s=startOfISOWeek(anchor); return Array.from({length:5},(_,i)=>{const d=new Date(s); d.setDate(s.getDate()+i); return d;});},[anchor]);

  // --- MONTH DATA ---
  const monthMeta = useMemo(()=>{
    const y=anchor.getFullYear(); const m=anchor.getMonth();
    const first=new Date(y,m,1); const last=new Date(y,m+1,0);
    const gridStart=startOfISOWeek(first); // poniedziałek
    const days=[]; for(let i=0;i<42;i++){const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); days.push(d);} 
    return {year:y, month:m, first, last, days};
  },[anchor]);

  // --- RENDER UTILS ---
  function dayItems(iso){
    return bookings
      .filter(b=> b.date===iso)
      .map(b=> ({
        ...b,
        blocked: isBlackout(b.date,b.start,b.end,b.building),
        overcap: capacityExceeded(b.date,b.start,b.end,b.building),
      }))
      .sort((a,c)=> timeToMinutes(a.start)-timeToMinutes(c.start));
  }

  function badgeColor(item){
    if(item.blocked) return {bg:"#e5e7eb", fg:"#334155", bd:"#cbd5e1"};
    if(item.overcap) return {bg:"#fee2e2", fg:"#7f1d1d", bd:"#fca5a5"};
    return {bg:"#ffffff", fg:"#0f172a", bd:"#e5e7eb"};
  }

  function navigate(delta){
    const d=new Date(anchor);
    if(view==="week"){ d.setDate(d.getDate()+delta*7); }
    else { d.setMonth(d.getMonth()+delta); }
    setAnchor(d);
  }

  const title = useMemo(()=>{
    if(view==="week"){
      const s=weekDays[0], e=weekDays[weekDays.length-1];
      return `${fmtDayPL(s)} – ${fmtDayPL(e)}`;
    }
    return `${PL.months[monthMeta.month]} ${monthMeta.year}`;
  },[view,weekDays,monthMeta]);

  function dayHasBlackoutForFilter(iso){
    if(buildingFilter==="ALL"){
      return blackouts.some(b=> b.date===iso && (b.building==="ALL"));
    } else {
      return blackouts.some(b=> b.date===iso && (b.building==="ALL" || b.building===buildingFilter));
    }
  }

  function openModalDay(iso){ setModalDay(iso); }
  function closeModal(){ setModalDay(null); }

  function itemsForModal(iso){
    const list = dayItems(iso).filter(i=> buildingFilter==="ALL" ? true : i.building===buildingFilter);
    // grupuj po budynku
    const byBld = {};
    for(const it of list){ if(!byBld[it.building]) byBld[it.building]=[]; byBld[it.building].push(it); }
    for(const k in byBld){ byBld[k].sort((a,c)=> timeToMinutes(a.start)-timeToMinutes(c.start)); }
    return byBld;
  }

  function exportMonthCSV(){
    const rows = [["date","start","end","building","org","title","status"]];
    for(const d of monthMeta.days){
      if(d.getMonth()!==monthMeta.month) continue; // tylko bieżący miesiąc
      const iso = toISO(d);
      const items = dayItems(iso).filter(i=> buildingFilter==="ALL" ? true : i.building===buildingFilter);
      for(const it of items){
        rows.push([iso,it.start,it.end,it.building,it.org,it.title,it.status]);
      }
    }
    const csv = rows.map(r=> r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rejestr_miesiac_${monthMeta.year}_${monthMeta.month+1}${buildingFilter==="ALL"?"":"_"+buildingFilter}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(url); a.remove();}, 0);
  }

  // --- TESTY LOGIKI (uruchamiane parametrem ?test=1) ---
  function runTests(){
    const msgs = [];
    // Test 1: Każda rezerwacja ma date/start/end/building
    const missing = bookings.filter(b=> !b.date || !b.start || !b.end || !b.building);
    msgs.push(`Test 1 — kompletność pól: ${missing.length===0 ? 'OK' : 'BŁĘDY: '+missing.length}`);
    // Test 2: Budynek istnieje
    const bIds = new Set(buildings.map(b=>b.id));
    const badBuilding = bookings.filter(b=> !bIds.has(b.building));
    msgs.push(`Test 2 — istnienie budynku: ${badBuilding.length===0 ? 'OK' : 'BŁĘDY: '+badBuilding.length}`);
    // Test 3: Format godzin HH:MM (prosty regex)
    const hhmm = /^\d{2}:\d{2}$/;
    const badTime = bookings.filter(b=> !hhmm.test(b.start)||!hhmm.test(b.end));
    msgs.push(`Test 3 — format godzin: ${badTime.length===0 ? 'OK' : 'BŁĘDY: '+badTime.length}`);
    // Test 4: Przekroczenia pojemności wykrywalne
    const sample = bookings.some(b=> capacityExceeded(b.date,b.start,b.end,b.building));
    msgs.push(`Test 4 — wykrycie nad-limit: ${sample ? 'OK (przynajmniej 1)' : 'BRAK'}`);
    // Test 5: Blokady wykrywalne
    const blocked = bookings.some(b=> isBlackout(b.date,b.start,b.end,b.building));
    msgs.push(`Test 5 — wykrycie blokady: ${blocked ? 'OK (przynajmniej 1)' : 'BRAK'}`);
    return msgs;
  }

  const testMsgs = RUN_TESTS ? runTests() : [];

  return (
    <div className="min-h-screen w-full bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Rejestr stoisk — {view==="week"?"widok tygodniowy":"widok miesięczny"}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={()=>navigate(-1)} className="px-3 py-1.5 rounded-lg border bg-white">◀</button>
            <div className="text-sm text-slate-700 min-w-[180px] text-center">{title}</div>
            <button onClick={()=>navigate(1)} className="px-3 py-1.5 rounded-lg border bg-white">▶</button>
            <div className="w-px h-6 bg-slate-200 mx-2"/>
            <select value={buildingFilter} onChange={(e)=>setBuildingFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border bg-white text-sm">
              <option value="ALL">Wszystkie budynki</option>
              {buildings.map(b=> <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
            <div className="w-px h-6 bg-slate-200 mx-2"/>
            <button onClick={()=>setView("week")} className={`px-3 py-1.5 rounded-lg border ${view==="week"?"bg-slate-900 text-white":"bg-white"}`}>Tydzień</button>
            <button onClick={()=>setView("month")} className={`px-3 py-1.5 rounded-lg border ${view==="month"?"bg-slate-900 text-white":"bg-white"}`}>Miesiąc</button>
            <button onClick={()=>setAnchor(new Date())} className="px-3 py-1.5 rounded-lg border bg-white">Dzisiaj</button>
            {view==="month" && (
              <button onClick={exportMonthCSV} className="px-3 py-1.5 rounded-lg border bg-white">Eksport CSV (miesiąc)</button>
            )}
          </div>
        </header>

        {loading && <div className="p-4 bg-white rounded-xl shadow">Ładowanie…</div>}
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl shadow">{String(error)}</div>}

        {!loading && !error && (
          <>
            {/* DEBUG PANEL (opcjonalny) */}
            {SHOW_DEBUG && (
              <div className="p-3 bg-white border rounded-xl">
                <div className="font-medium mb-1">Debug</div>
                <div className="text-sm text-slate-700 grid grid-cols-3 gap-2">
                  <div>buildings: <b>{(data?.buildings||[]).length}</b></div>
                  <div>blackouts: <b>{(data?.blackouts||[]).length}</b></div>
                  <div>bookings: <b>{(data?.bookings||[]).length}</b></div>
                </div>
              </div>
            )}

            {/* TESTY (opcjonalne) */}
            {RUN_TESTS && (
              <div className="p-3 bg-white border rounded-xl">
                <div className="font-medium mb-1">Testy logiki</div>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {testMsgs.map((m,i)=>(<li key={i}>{m}</li>))}
                </ul>
              </div>
            )}

            {/* Legend */}
            <div className="flex gap-4 text-sm">
              <span className="px-2 py-1 rounded border bg-white">Zwykła rezerwacja</span>
              <span className="px-2 py-1 rounded border bg-red-100 border-red-300 text-red-900">Przekroczona pojemność</span>
              <span className="px-2 py-1 rounded border bg-gray-200 border-gray-300 text-gray-600">Blokada</span>
            </div>

            {view==="week" && (
              <div className="grid grid-cols-1 gap-6">
                {weekDays.map((d)=>{
                  const iso=toISO(d);
                  return (
                    <div key={iso} className="bg-white rounded-2xl shadow p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold capitalize">{d.toLocaleDateString("pl-PL",{weekday:"long", day:"2-digit", month:"2-digit"})}</h2>
                      </div>
                      <div className={`grid gap-4`} style={{gridTemplateColumns:`repeat(${visibleBuildings.length||1}, minmax(0,1fr))`}}>
                        {visibleBuildings.map(b=>{
                          const items = dayItems(iso).filter(x=>x.building===b.id);
                          const blk = blackouts.filter(x=> x.date===iso && (x.building==="ALL"||x.building===b.id));
                          return (
                            <div key={b.id} className="border border-slate-200 rounded-xl">
                              <div className="px-3 py-2 border-b bg-slate-50 rounded-t-xl flex items-center justify-between">
                                <div className="font-medium">{b.name}</div>
                                <div className="text-xs text-slate-600">pojemność: {b.capacity}</div>
                              </div>
                              {blk.length>0 && (
                                <div className="px-3 py-2 text-sm bg-gray-100 text-gray-700 border-b border-gray-300">
                                  {blk.map((x,i)=>(<div key={i}>⛔ {x.start}–{x.end} — {x.reason} {x.building!=="ALL"?`(dotyczy: ${b.name})`:`(ALL)`}</div>))}
                                </div>
                              )}
                              <div className="p-3 space-y-2">
                                {items.length===0 && (<div className="text-sm text-slate-500">Brak rezerwacji</div>)}
                                {items.map(item=>{
                                  const c=badgeColor(item);
                                  return (
                                    <div key={item.id} className="rounded-lg p-3" style={{background:c.bg,color:c.fg,border:`1px solid ${c.bd}`}}>
                                      <div className="text-sm font-semibold">{item.start}–{item.end} · {item.org}</div>
                                      <div className="text-xs text-slate-600">{item.title}</div>
                                      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{item.status}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view==="month" && (
              <div className="bg-white rounded-2xl shadow p-4">
                {/* header days */}
                <div className="grid grid-cols-7 gap-2 text-xs font-medium text-slate-500 px-1">
                  {PL.weekdaysShort.map(w=> (<div key={w} className="text-center">{w}</div>))}
                </div>
                {/* grid */}
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {monthMeta.days.map((d,i)=>{
                    const iso=toISO(d);
                    const inMonth = d.getMonth()===monthMeta.month;
                    const todayIso = toISO(new Date());
                    let itemsAll = dayItems(iso);
                    if(buildingFilter!=="ALL") itemsAll = itemsAll.filter(it=>it.building===buildingFilter);
                    const hasBlk = dayHasBlackoutForFilter(iso);
                    return (
                      <div key={iso+"-"+i} className={`rounded-xl border p-2 flex flex-col gap-1 ${inMonth?"bg-white border-slate-200":"bg-slate-50 border-slate-100"}`}>
                        <div className="flex items-center justify-between">
                          <div className={`text-xs ${inMonth?"text-slate-700":"text-slate-400"}`}>{d.getDate()}</div>
                          {iso===todayIso && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white">dziś</span>}
                        </div>
                        {hasBlk && (
                          <div className="text-[11px] px-2 py-1 rounded bg-gray-200 text-gray-700">⛔ Blokada {buildingFilter==="ALL"?"ALL":buildingFilter}</div>
                        )}
                        <div className="flex flex-col gap-1">
                          {itemsAll.slice(0,4).map(item=>{
                            const c=badgeColor(item);
                            const bName = buildings.find(b=>b.id===item.building)?.id || item.building;
                            return (
                              <div key={item.id} className="rounded-md px-2 py-1 cursor-pointer" style={{background:c.bg,color:c.fg,border:`1px solid ${c.bd}`}} onClick={()=>openModalDay(iso)}>
                                <div className="text-[11px] font-medium">{bName} · {item.start}–{item.end}</div>
                                <div className="text-[10px] truncate">{item.org}</div>
                              </div>
                            );
                          })}
                          {itemsAll.length>4 && (
                            <button onClick={()=>openModalDay(iso)} className="text-left text-[11px] text-slate-600 hover:text-slate-800">+{itemsAll.length-4} więcej…</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal dzienny */}
        {modalDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-4" onClick={(e)=>e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-lg font-semibold">Szczegóły — {new Date(modalDay).toLocaleDateString("pl-PL",{weekday:"long", day:"2-digit", month:"2-digit", year:"numeric"})}</div>
                <button onClick={closeModal} className="px-3 py-1.5 rounded-lg border bg-white">Zamknij</button>
              </div>
              {(()=>{ const groups = itemsForModal(modalDay); const keys = Object.keys(groups).sort();
                if(keys.length===0) return <div className="text-sm text-slate-500">Brak rezerwacji</div>;
                return (
                  <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
                    {keys.map(k=>{
                      const b = buildings.find(x=>x.id===k);
                      return (
                        <div key={k} className="border rounded-xl">
                          <div className="px-3 py-2 bg-slate-50 rounded-t-xl flex items-center justify-between">
                            <div className="font-medium">{b?`${b.id} — ${b.name}`:k}</div>
                            <div className="text-xs text-slate-600">pojemność: {b?.capacity ?? '-'}</div>
                          </div>
                          <div className="p-3 space-y-2">
                            {groups[k].map(item=>{ const c=badgeColor(item); return (
                              <div key={item.id} className="rounded-lg p-3" style={{background:c.bg,color:c.fg,border:`1px solid ${c.bd}`}}>
                                <div className="text-sm font-semibold">{item.start}–{item.end} · {item.org}</div>
                                <div className="text-xs text-slate-600">{item.title}</div>
                                <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">{item.status}</div>
                              </div>
                            ); })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Instrukcja osadzenia — UWAGA: escape tagu iframe */}
        <div className="text-sm text-slate-600">
          <p className="mb-1 font-medium">Własność Samorządu Studentów Uniwersytetu Ekonomicznego we Wrocławiu ®2025</p>
          <p className="text-xs text-slate-500">Przykład: <code>&lt;iframe src="https://twoj-dash.netlify.app" width="100%" height="900" style="border:0"&gt;&lt;/iframe&gt;</code></p>
        </div>
      </div>
    </div>
  );
}
