import { useEffect, useMemo, useState } from "react";

// === KONFIGURACJA ===
// Podmień na URL Web Appa z Google Apps Script (krok 2 z instrukcji)
const DATA_URL = "https://script.google.com/macros/s/AKfycbwvibZlccv52NmXEKbx5WqY_svc3LFU0KzDZIs1o4PnNKYQGC1WSAya21L2P0kAseKk/exec";

export default function App() {
  const [data, setData] = useState(null); // { buildings: [], blackouts: [], bookings: [] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- FETCH ---
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${DATA_URL}?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Błąd pobierania: " + res.status);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // --- HELPERS ---
  function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  }
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart);
  }

  const today = useMemo(() => new Date(), []);
  const startOfWeek = useMemo(() => {
    const d = new Date(today);
    const offset = (d.getDay() + 6) % 7; // poniedziałek
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - offset);
    return d;
  }, [today]);
  const days = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  }), [startOfWeek]);

  const buildings = data?.buildings ?? [];
  const blackouts = data?.blackouts ?? [];
  const bookings = data?.bookings ?? [];

  function isBlackout(dateISO, start, end, buildingId) {
    return blackouts.some(b => (b.date === dateISO) && (b.building === "ALL" || b.building === buildingId) && overlaps(start, end, b.start, b.end));
  }
  function capacityExceeded(dateISO, start, end, buildingId) {
    const cap = buildings.find(b => b.id === buildingId)?.capacity ?? 1;
    const count = bookings.filter(x => x.building === buildingId && x.date === dateISO && overlaps(start, end, x.start, x.end)).length;
    return count > cap;
  }
  function toISO(d) { return d.toISOString().slice(0,10); }
  function dateLabelPL(d) { return d.toLocaleDateString("pl-PL", { weekday: "long", day: "2-digit", month: "2-digit"}); }

  function classCard(blocked, overcap) {
    if (blocked) return "background:#e5e7eb;color:#334155;border:1px solid #d1d5db;border-radius:12px;";
    if (overcap) return "background:#fee2e2;color:#7f1d1d;border:1px solid #fca5a5;border-radius:12px;";
    return "background:#fff;border:1px solid #e5e7eb;border-radius:12px;";
  }

  function itemsFor(dayISO, buildingId) {
    const items = bookings
      .filter(b => b.date === dayISO && b.building === buildingId)
      .map(b => ({
        ...b,
        blocked: isBlackout(b.date, b.start, b.end, b.building),
        overcap: capacityExceeded(b.date, b.start, b.end, b.building)
      }));
    const blk = blackouts.filter(b => b.date === dayISO && (b.building === "ALL" || b.building === buildingId));
    items.sort((a, c) => timeToMinutes(a.start) - timeToMinutes(c.start));
    return { items, blk };
  }

  return (
    <div style={{minHeight:'100vh',width:'100%',background:'#f1f5f9',padding:'24px'}}>
      <div style={{maxWidth: '1120px', margin: '0 auto'}}>
        <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
          <div>
            <h1 style={{fontSize:'24px',fontWeight:700,margin:0}}>Rejestr stoisk — widok tygodniowy</h1>
            <p style={{fontSize:'14px',color:'#475569',margin:'4px 0 0'}}>Dane wczytywane z Google Sheet/Airtable → JSON.</p>
          </div>
          <div style={{fontSize:'14px',color:'#475569'}}>
            {dateLabelPL(days[0])} – {dateLabelPL(days[days.length-1])}
          </div>
        </header>

        {loading && <div style={{padding:'16px',background:'#fff',borderRadius:'12px',boxShadow:'0 1px 3px rgba(0,0,0,.08)'}}>Ładowanie…</div>}
        {error && <div style={{padding:'16px',background:'#fef2f2',border:'1px solid #fecaca',color:'#7f1d1d',borderRadius:'12px',boxShadow:'0 1px 3px rgba(0,0,0,.08)'}}>{String(error)}</div>}

        {!loading && !error && (
          <>
            {/* Legend */}
            <div style={{display:'flex',gap:'12px',fontSize:'14px',marginBottom:'16px'}}>
              <span style={{padding:'4px 8px',border:'1px solid #e5e7eb',borderRadius:'8px',background:'#fff'}}>Zwykła rezerwacja</span>
              <span style={{padding:'4px 8px',border:'1px solid #fca5a5',borderRadius:'8px',background:'#fee2e2',color:'#7f1d1d'}}>Przekroczona pojemność</span>
              <span style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:'8px',background:'#e5e7eb',color:'#334155'}}>Blokada</span>
            </div>

            {/* Grid by days */}
            <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'24px'}}>
              {days.map((d) => {
                const iso = toISO(d);
                return (
                  <div key={iso} style={{background:'#fff',borderRadius:'16px',boxShadow:'0 1px 3px rgba(0,0,0,.08)',padding:'16px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                      <h2 style={{fontSize:'18px',fontWeight:600,margin:0,textTransform:'capitalize'}}>{dateLabelPL(d)}</h2>
                    </div>
                    <div style={{display:'grid',gap:'16px',gridTemplateColumns:'repeat(3, minmax(0, 1fr))'}}>
                      {(data?.buildings ?? []).map(b => {
                        const { items, blk } = itemsFor(iso, b.id);
                        return (
                          <div key={b.id} style={{border:'1px solid #e2e8f0',borderRadius:'12px'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc',borderTopLeftRadius:'12px',borderTopRightRadius:'12px'}}>
                              <div style={{fontWeight:600}}>{b.name}</div>
                              <div style={{fontSize:'12px',color:'#475569'}}>pojemność: {b.capacity}</div>
                            </div>

                            {blk.length > 0 && (
                              <div style={{padding:'8px 12px',fontSize:'14px',background:'#f1f5f9',color:'#334155',borderBottom:'1px solid #cbd5e1'}}>
                                {blk.map((x, i) => (
                                  <div key={i}>⛔ {x.start}–{x.end} — {x.reason} {x.building !== "ALL" ? `(dotyczy: ${b.name})` : `(ALL)`}</div>
                                ))}
                              </div>
                            )}

                            <div style={{padding:'12px',display:'flex',flexDirection:'column',gap:'8px'}}>
                              {items.length === 0 && (
                                <div style={{fontSize:'14px',color:'#64748b'}}>Brak rezerwacji</div>
                              )}
                              {items.map(item => (
                                <div key={item.id} style={{padding:'12px', ...( (() => { const s = classCard(item.blocked, item.overcap); return Object.fromEntries(s.split(';').filter(Boolean).map(x => x.split(':').map(y=>y.trim())).map(([k,v])=>[k,v])); })() )}}>
                                  <div style={{fontSize:'14px',fontWeight:600}}>{item.start}–{item.end} · {item.org}</div>
                                  <div style={{fontSize:'12px',color:'#475569'}}>{item.title}</div>
                                  <div style={{marginTop:'4px',fontSize:'10px',letterSpacing:'0.06em',textTransform:'uppercase',color:'#64748b'}}>{item.status}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{marginTop:'16px',fontSize:'14px',color:'#475569'}}>
          <p style={{margin:'8px 0',fontWeight:600}}>Wdrożenie:</p>
          <ol style={{margin:'0 0 8px 18px'}}>
            <li>Podmień <code>DATA_URL</code> na adres Web Appa (Google Apps Script).</li>
            <li>Zbuduj: <code>npm run build</code> i wrzuć /dist na Netlify lub podepnij repo do Vercela.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
