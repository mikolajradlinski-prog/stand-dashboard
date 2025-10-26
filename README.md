# Stand Dashboard

Prosty dashboard do podglądu rezerwacji stoisk. Dane pobiera z JSON (np. Google Apps Script Web App).

## Szyki start
1. Zmień `DATA_URL` w `src/App.jsx` na swój adres JSON.
2. `npm install`
3. `npm run dev`
4. `npm run build` → katalog `dist/` gotowy do publikacji (Netlify/Vercel).

Struktura danych JSON:
```json
{
  "buildings": [{"id":"J","name":"Budynek J","capacity":2}],
  "blackouts": [{"date":"2025-10-01","start":"08:00","end":"20:00","building":"ALL","reason":"Inauguracja"}],
  "bookings": [{"id":1,"date":"2025-10-01","start":"10:00","end":"13:00","building":"J","org":"KNA","title":"Promocja","status":"Zgłoszone"}]
}
```
