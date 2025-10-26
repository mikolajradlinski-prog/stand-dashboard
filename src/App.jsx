import { useEffect, useMemo, useState } from "react";

// ✅ Ten wariant NIE wymaga Tailwinda ani żadnych styli globalnych.
// Wszystko jest ostylowane inline, więc nie będzie już "brzydko" jak na screenie

// === KONFIGURACJA ===
// Podmień na URL Web Appa z Google Apps Script
const DATA_URL = "https://script.google.com/macros/s/AKfycbwvibZlccv52NmXEKbx5WqY_svc3LFU0KzDZIs1o4PnNKYQGC1WSAya21L2P0kAseKk/exec";

// --- TRYB DIAGNOSTYCZNY / TESTY ---
const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const USE_MOCK = params.has('mock');
const SHOW_DEBUG = params.has('debug');
const RUN_TESTS = params.has('test');

// Dane testowe (mock)
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
    { id: 1, date: "2025-10-20", start: "10:00", end: "13:00", building: "J", org: "Koło Naukowe A", title: "Rekrutacja", status: "Zgłoszone" },
    { id: 2, date: "2025-10-20", start: "11:00", end: "14:00", building: "J", org: "Samorząd", title: "Info punkt", status: "Zgłoszone" },
    { id: 3, date: "2025-10-20", start: "12:00", end: "15:00", building: "J", org: "Organizacja C", title: "Zbiórka", status: "Potwierdzone" },
    { id: 4, date: "2025-10-22", start: "09:30", end: "11:00", building: "Z", org: "Koło B", title: "Promo", status: "Zgłoszone" },
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
// ISO bez UTC — liczone lokalnie, żeby nie przesuwało dnia względem PL
function toISO(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// Parser YYYY-MM-DD też lokalnie (nie używa UTC)
function parseYMD(s){
  const [y,m,d] = String(s).split('-').map(Number);
  return new Date(y || 1970, (m||1)-1, d||1);
}
function fmtDayPL(d){return d.toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit"});}
function startOfISOWeek(d){const x=new Date(d); const off=(x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-off); return x;}

// Minimalna "biblioteka" styli (inline)
const ui = {
  page: { minHeight:'100vh', background:'#f1f5f9', padding:'24px', fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', color:'#0f172a' },
  wrap: { maxWidth:1120, margin:'0 auto' },
  headerRow: { display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:18 },
  h1: { fontSize:28, fontWeight:800, margin:0 },
  toolbar: { display:'flex', flexWrap:'wrap', alignItems:'center', gap:18 },
  btn: { padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:13, background:'#fff', cursor:'pointer', fontSize:14 },
  select: { padding:'10px 12px', border:'1px solid #e2e8f0', borderRadius:12, background:'#fff', fontSize:14 },
  legendWrap: { display:'flex', gap:20, marginTop:14, marginBottom:16 },
  chip: { padding:'5px 8px', border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', lineHeight:1.0, fontSize:12 },
  card: { background:'#fff', borderRadius:16, boxShadow:'0 1px 3px rgba(0,0,0,.08)', padding:16 },
  colHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', borderTopLeftRadius:12, borderTopRightRadius:12 },
  colBox: { border:'1px solid #e2e8f0', borderRadius:12 },
  blk: { padding:'8px 12px', fontSize:14, background:'#f1f5f9', color:'#334155', borderBottom:'1px solid #cbd5e1' },
  item: (c)=>({ padding:12, borderRadius:12, background:c.bg, color:c.fg, border:`1px solid ${c.bd}` }),
  subtle: { fontSize:12, color:'#475569' },
  small: { fontSize:10, letterSpacing:'0.06em', textTransform:'uppercase', color:'#64748b' },
  grid7: { display:'grid', gridTemplateColumns:'repeat(7, minmax(0,1fr))', gap:8 },
  gridAuto: (n)=>({ display:'grid', gridTemplateColumns:`repeat(${n}, minmax(0,1fr))`, gap:16 }),
  dayCell: (inMonth)=>({ border:'1px solid '+(inMonth?'#e2e8f0':'#f1f5f9'), background: inMonth?'#fff':'#f8fafc', borderRadius:12, padding:8, display:'flex', flexDirection:'column', gap:6 }),
};

export default function StandDashboard(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [view,setView]=useState("month"); // "week" | "month"
  const [anchor,setAnchor]=useState(()=>{const t=new Date(); t.setHours(0,0,0,0); return t;});
  const [buildingFilter,setBuildingFilter]=useState("ALL");
  const [modalDay,setModalDay]=useState(null);

  // FETCH lub MOCK
  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      try{
        if(USE_MOCK){ if(!cancelled) setData(MOCK_DATA); }
        else {
          const res=await fetch(`${DATA_URL}?ts=${Date.now()}`,{cache:"no-store"});
          if(!res.ok) throw new Error("Błąd pobierania: "+res.status);
          const json=await res.json();
          if(!cancelled) setData(json);
        }
      }catch(e){ if(!cancelled) setError(String(e)); }
      finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled = true; };
  },[]);

  const buildings = data?.buildings ?? [];
  const blackouts = data?.blackouts ?? [];
  const bookings  = data?.bookings  ?? [];

  const visibleBuildings = useMemo(()=> buildingFilter==="ALL"? buildings : buildings.filter(b=>b.id===buildingFilter), [buildings,buildingFilter]);

  function isBlackout(dateISO,start,end,buildingId){
    return blackouts.some(b=> (b.date===dateISO) && (b.building==="ALL" || b.building===buildingId) && overlaps(start,end,b.start,b.end));
  }
  function capacityExceeded(dateISO,start,end,buildingId){
    const cap = buildings.find(b=>b.id===buildingId)?.capacity ?? 1;
    const count = bookings.filter(x=> x.building===buildingId && x.date===dateISO && overlaps(start,end,x.start,x.end)).length;
    return count>cap;
  }

  const weekDays = useMemo(()=>{const s=startOfISOWeek(anchor); return Array.from({length:5},(_,i)=>{const d=new Date(s); d.setDate(s.getDate()+i); return d;});},[anchor]);

  const monthMeta = useMemo(()=>{
    const y=anchor.getFullYear(); const m=anchor.getMonth();
    const first=new Date(y,m,1);
    const gridStart=startOfISOWeek(first);
    const days=[]; for(let i=0;i<42;i++){const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); days.push(d);} 
    return {year:y, month:m, days};
  },[anchor]);

  function dayItems(iso){
    return bookings
      .filter(b=> b.date===iso)
      .map(b=> ({...b, blocked: isBlackout(b.date,b.start,b.end,b.building), overcap: capacityExceeded(b.date,b.start,b.end,b.building)}))
      .sort((a,c)=> timeToMinutes(a.start)-timeToMinutes(c.start));
  }
  function badgeColor(item){
    if(item.blocked) return {bg:"#e5e7eb", fg:"#334155", bd:"#cbd5e1"};
    if(item.overcap) return {bg:"#fee2e2", fg:"#7f1d1d", bd:"#fca5a5"};
    return {bg:"#ffffff", fg:"#0f172a", bd:"#e5e7eb"};
  }
  function navigate(delta){ const d=new Date(anchor); if(view==="week"){ d.setDate(d.getDate()+delta*7);} else { d.setMonth(d.getMonth()+delta);} setAnchor(d); }
  const title = useMemo(()=> view==="week" ? `${fmtDayPL(weekDays[0])} – ${fmtDayPL(weekDays[4])}` : `${PL.months[monthMeta.month]} ${monthMeta.year}`, [view,weekDays,monthMeta]);
  function dayHasBlackoutForFilter(iso){
    if(buildingFilter==="ALL") return blackouts.some(b=> b.date===iso && (b.building==="ALL"));
    return blackouts.some(b=> b.date===iso && (b.building==="ALL" || b.building===buildingFilter));
  }

  function openModalDay(iso){ setModalDay(iso); }
  function closeModal(){ setModalDay(null); }
  function itemsForModal(iso){
    const list = dayItems(iso).filter(i=> buildingFilter==="ALL" ? true : i.building===buildingFilter);
    const byBld = {}; for(const it of list){ if(!byBld[it.building]) byBld[it.building]=[]; byBld[it.building].push(it);} 
    for(const k in byBld){ byBld[k].sort((a,c)=> timeToMinutes(a.start)-timeToMinutes(c.start)); }
    return byBld;
  }

  function exportMonthCSV(){
    const rows = [["date","start","end","building","org","title","status"]];
    for(const d of monthMeta.days){ if(d.getMonth()!==monthMeta.month) continue; const iso=toISO(d); const items=dayItems(iso).filter(i=> buildingFilter==="ALL"?true:i.building===buildingFilter); for(const it of items){ rows.push([iso,it.start,it.end,it.building,it.org,it.title,it.status]); } }
    const csv = rows.map(r=> r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`rejestr_miesiac_${monthMeta.year}_${monthMeta.month+1}${buildingFilter==="ALL"?"":"_"+buildingFilter}.csv`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},0);
  }

  // TESTY
  function runTests(){
    const msgs=[]; const missing=bookings.filter(b=>!b.date||!b.start||!b.end||!b.building); msgs.push(`Test 1 — kompletność pól: ${missing.length===0?'OK':'BŁĘDY: '+missing.length}`);
    const bIds=new Set(buildings.map(b=>b.id)); const bad=bookings.filter(b=>!bIds.has(b.building)); msgs.push(`Test 2 — istnienie budynku: ${bad.length===0?'OK':'BŁĘDY: '+bad.length}`);
    const hhmm=/^\d{2}:\d{2}$/; const badTime=bookings.filter(b=>!hhmm.test(b.start)||!hhmm.test(b.end)); msgs.push(`Test 3 — format godzin: ${badTime.length===0?'OK':'BŁĘDY: '+badTime.length}`);
    const anyOver=bookings.some(b=>capacityExceeded(b.date,b.start,b.end,b.building)); msgs.push(`Test 4 — wykrycie nad-limit: ${anyOver?'OK (≥1)':'BRAK'}`);
    const anyBlk=bookings.some(b=>isBlackout(b.date,b.start,b.end,b.building)); msgs.push(`Test 5 — wykrycie blokady: ${anyBlk?'OK (≥1)':'BRAK'}`);
    return msgs; }
  const testMsgs = RUN_TESTS ? runTests() : [];

  return (
    <div style={ui.page}>
      <div style={ui.wrap}>
        <div style={{...ui.headerRow, marginBottom: 12}}>
          <h1 style={ui.h1}>Centralny Rejestr Stoisk Promocyjnych - {view==="week"?"widok tygodniowy":"widok miesięczny"}</h1>
          <div style={ui.toolbar}>
            <button style={ui.btn} onClick={()=>navigate(-1)}>◀</button>
            <div style={{ fontSize:14, color:'#475569', minWidth:180, textAlign:'center' }}>{title}</div>
            <button style={ui.btn} onClick={()=>navigate(1)}>▶</button>
            <select style={ui.select} value={buildingFilter} onChange={(e)=>setBuildingFilter(e.target.value)}>
              <option value="ALL">Wszystkie budynki</option>
              {buildings.map(b=> <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
            </select>
            <button style={ui.btn} onClick={()=>setView("week")} >Tydzień</button>
            <button style={ui.btn} onClick={()=>setView("month")} >Miesiąc</button>
            <button style={ui.btn} onClick={()=>setAnchor(new Date())}>Dzisiaj</button>
            {view==="month" && <button style={ui.btn} onClick={exportMonthCSV}>Eksport CSV (miesiąc)</button>}
          </div>
        </div>

        {loading && <div style={ui.card}>Ładowanie…</div>}
        {error && <div style={{...ui.card, background:'#fef2f2', border:'1px solid #fecaca', color:'#7f1d1d'}}> {String(error)} </div>}

        {!loading && !error && (
          <>
            {SHOW_DEBUG && (
              <div style={{...ui.card, padding:12}}>
                <div style={{fontWeight:600, marginBottom:6}}>Debug</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, fontSize:14, color:'#334155'}}>
                  <div>buildings: <b>{(data?.buildings||[]).length}</b></div>
                  <div>blackouts: <b>{(data?.blackouts||[]).length}</b></div>
                  <div>bookings: <b>{(data?.bookings||[]).length}</b></div>
                </div>
              </div>
            )}

            {RUN_TESTS && (
              <div style={{...ui.card, padding:12}}>
                <div style={{fontWeight:600, marginBottom:6}}>Testy logiki</div>
                <ul style={{margin:0, paddingLeft:18, fontSize:14, color:'#334155'}}>
                  {testMsgs.map((m,i)=>(<li key={i}>{m}</li>))}
                </ul>
              </div>
            )}

            {/* Legend */}
            <div style={ui.legendWrap}>
              <span style={ui.chip}>Rezerwacja</span>
              <span style={{...ui.chip, background:'#e5e7eb', border:'1px solid #cbd5e1', color:'#334155'}}>Blokada</span>
            </div>

            {view==="week" && (
              <div style={{ display:'grid', gap:24 }}>
                {weekDays.map((d)=>{
                  const iso=toISO(d);
                  return (
                    <div key={iso} style={ui.card}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                        <div style={{fontWeight:600}}>{d.toLocaleDateString("pl-PL",{weekday:"long", day:"2-digit", month:"2-digit"})}</div>
                      </div>
                      <div style={ui.gridAuto(visibleBuildings.length||1)}>
                        {visibleBuildings.map(b=>{
                          const items = dayItems(iso).filter(x=>x.building===b.id);
                          const blk = blackouts.filter(x=> x.date===iso && (x.building==="ALL"||x.building===b.id));
                          return (
                            <div key={b.id} style={ui.colBox}>
                              <div style={ui.colHeader}>
                                <div style={{fontWeight:600, fontSize:12}}>{b.name}</div>
                                <div style={{fontSize:12, color:'#475569', fontSize:10}}>limit stoisk: {b.capacity}</div>
                              </div>
                              {blk.length>0 && (
                                <div style={ui.blk}>
                                  {blk.map((x,i)=>(<div key={i}>⛔ {x.start}–{x.end} — {x.reason} {x.building!=="ALL"?`(dotyczy: ${b.name})`:`(ALL)`}</div>))}
                                </div>
                              )}
                              <div style={{padding:12, display:'flex', flexDirection:'column', gap:8}}>
                                {items.length===0 && (<div style={{fontSize:14, color:'#64748b'}}>Brak rezerwacji</div>)}
                                {items.map(item=>{ const c=badgeColor(item); return (
                                  <div key={item.id} style={ui.item(c)}>
                                    <div style={{fontSize:14, fontWeight:600}}>{item.start}–{item.end} · {item.org}</div>
                                    <div style={ui.subtle}>{item.title}</div>
                                    <div style={ui.small}>{item.status}</div>
                                  </div>
                                );})}
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
              <div style={{ ...ui.card, marginTop: 16 }}>
                <div style={{...ui.grid7, padding:'0 4px', fontSize:12, fontWeight:600, color:'#64748b'}}>
                  {PL.weekdaysShort.map(w=> (<div key={w} style={{textAlign:'center'}}>{w}</div>))}
                </div>
                <div style={{...ui.grid7, marginTop:8}}>
                  {monthMeta.days.map((d,i)=>{
                    const iso=toISO(d);
                    const inMonth = d.getMonth()===monthMeta.month;
                    const todayIso = toISO(new Date());
                    let itemsAll = dayItems(iso);
                    if(buildingFilter!=="ALL") itemsAll = itemsAll.filter(it=>it.building===buildingFilter);
                    const hasBlk = dayHasBlackoutForFilter(iso);
                    return (
                      <div key={iso+"-"+i} style={ui.dayCell(inMonth)}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <div style={{fontSize:12, color: inMonth?'#334155':'#94a3b8'}}>{d.getDate()}</div>
                          {iso===todayIso && <span style={{fontSize:10, padding:'2px 6px', borderRadius:8, background:'#0f172a', color:'#fff'}}>dziś</span>}
                        </div>
                        {hasBlk && (
                          <div style={{fontSize:11, padding:'4px 8px', borderRadius:8, background:'#e5e7eb', color:'#334155'}}>⛔ Blokada {buildingFilter==="ALL"?"ALL":buildingFilter}</div>
                        )}
                        <div style={{display:'flex', flexDirection:'column', gap:6}}>
                          {itemsAll.slice(0,4).map(item=>{ const c=badgeColor(item); const bName=buildings.find(b=>b.id===item.building)?.id||item.building; return (
                            <div key={item.id} onClick={()=>openModalDay(iso)} style={{...ui.item(c), padding:'6px 8px', borderRadius:8, cursor:'pointer'}}>
                              <div style={{fontSize:11, fontWeight:600}}>{bName} · {item.start}–{item.end}</div>
                              <div style={{fontSize:10, color:'#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{item.org}</div>
                            </div>
                          );})}
                          {itemsAll.length>4 && (
                            <button onClick={()=>openModalDay(iso)} style={{...ui.btn, padding:'4px 8px', fontSize:11}}>+{itemsAll.length-4} więcej…</button>
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

        {modalDay && (
          <div onClick={closeModal} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', display:'flex', alignItems:'center', justifyContent:'center', padding:16, zIndex:50}}>
            <div onClick={(e)=>e.stopPropagation()} style={{background:'#fff', borderRadius:16, boxShadow:'0 8px 24px rgba(0,0,0,.2)', maxWidth:720, width:'100%', padding:16}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                <div style={{fontSize:18, fontWeight:600}}>Szczegóły — {parseYMD(modalDay).toLocaleDateString("pl-PL",{weekday:"long", day:"2-digit", month:"2-digit", year:"numeric"})}</div>
                <button style={ui.btn} onClick={closeModal}>Zamknij</button>
              </div>
              {(()=>{ const groups = itemsForModal(modalDay); const keys = Object.keys(groups).sort();
                if(keys.length===0) return <div style={{fontSize:14, color:'#64748b'}}>Brak rezerwacji</div>;
                return (
                  <div style={{display:'flex', flexDirection:'column', gap:12, maxHeight:'60vh', overflow:'auto', paddingRight:6}}>
                    {keys.map(k=>{ const b = buildings.find(x=>x.id===k);
                      return (
                        <div key={k} style={{border:'1px solid #e2e8f0', borderRadius:12}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#f8fafc', borderTopLeftRadius:12, borderTopRightRadius:12}}>
                            <div style={{fontWeight:600}}>{b?`${b.id} — ${b.name}`:k}</div>
                            <div style={{fontSize:12, color:'#475569'}}>limit stoisk: {b?.capacity ?? '-'}</div>
                          </div>
                          <div style={{padding:12, display:'flex', flexDirection:'column', gap:8}}>
                            {groups[k].map(item=>{ const c=badgeColor(item); return (
                              <div key={item.id} style={ui.item(c)}>
                                <div style={{fontSize:14, fontWeight:600}}>{item.start}–{item.end} · {item.org}</div>
                                <div style={ui.subtle}>{item.title}</div>
                                <div style={ui.small}>{item.status}</div>
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

        <div style={{fontSize:13, color:'#475569', marginTop:8}}>
          <div style={{fontWeight:600, marginBottom:4}}>Własność Samorządu Studentów Uniwersytetu Ekonomicznego we Wrocławiu ®2025</div>
          <div>Osadź jako <code>&lt;iframe&gt;</code> lub link w Google Sites/SharePoint.</div>
        </div>
      </div>
    </div>
  );
}
