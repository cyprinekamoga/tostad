// Karta: dagens jobb på kartan och varje persons rutt i tidsordning, med länk till Google Maps.
import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../lib/supabase.js';
import { today, addDays, routeLink } from '../../lib/planner.js';
import { site } from '../../config/site.js';
import { loadJobs, jobLabel, jobAddress, locateJobs, SERVICE_LABELS } from './jobs.js';
import { ErrorMsg } from '../ui.jsx';

const OFFICE = `${site.address.street}, ${site.address.postalCode} ${site.address.city}`;
const UNASSIGNED = { id: '', full_name: 'Ej bemannade', color: '#6b7280' };
const longDate = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// Hela adressen till rutten: till-adressen räknas med för flyttar.
const stopsFor = (job) => [jobAddress(job), jobAddress(job, true)].filter(Boolean);

export default function MapPage() {
  const params = new URLSearchParams(window.location.search);
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get('datum') ?? '') ? params.get('datum') : today());
  const [jobs, setJobs] = useState(null);
  const [people, setPeople] = useState([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    supabase()
      .from('profiles')
      .select('id, full_name, color')
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => setPeople(data ?? []));
    map.current = L.map(mapEl.current, { scrollWheelZoom: false }).setView([59.33, 18.07], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  async function load() {
    setError('');
    try {
      const list = (await loadJobs(date, date)).filter((j) => j.status !== 'avbokad');
      setJobs(list);
      const url = new URL(window.location.href);
      url.searchParams.set('datum', date);
      window.history.replaceState(null, '', url);
      const missing = list.filter((j) => j.lat == null && j.street);
      if (missing.length) {
        setLocating(true);
        const found = await locateJobs(missing);
        setLocating(false);
        if (found.length) setJobs(list.map((j) => found.find((f) => f.id === j.id) ?? j));
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [date]);

  const teams = [...people, UNASSIGNED]
    .map((p) => ({ person: p, jobs: (jobs ?? []).filter((j) => (p.id ? j.staff.includes(p.id) : j.staff.length === 0)) }))
    .filter((t) => t.jobs.length);

  // Rita markörer och linjer när jobben ändras.
  useEffect(() => {
    if (!layer.current || !jobs) return;
    layer.current.clearLayers();
    const points = [];
    for (const { person, jobs: list } of teams) {
      const line = [];
      list.forEach((j, i) => {
        if (j.lat == null) return;
        const point = [j.lat, j.lng];
        line.push(point);
        points.push(point);
        const icon = L.divIcon({ className: 'map-pin', html: `<span style="background:${person.color}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
        const popup = document.createElement('div');
        popup.innerHTML = '<strong></strong><br><span></span><br><small></small>';
        popup.querySelector('strong').textContent = `${j.startTime} ${jobLabel(j)}`;
        popup.querySelector('span').textContent = jobAddress(j);
        popup.querySelector('small').textContent = `${person.full_name} · ${SERVICE_LABELS[j.service]}`;
        L.marker(point, { icon, title: jobLabel(j) }).bindPopup(popup).addTo(layer.current);
      });
      if (line.length > 1) L.polyline(line, { color: person.color, weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(layer.current);
    }
    if (points.length) map.current.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
  }, [jobs, people]);

  return (
    <>
      <div class="cp-head">
        <h2>Karta</h2>
        <div class="pl-nav">
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setDate(addDays(date, -1))} aria-label="Föregående dag">‹</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setDate(today())}>Idag</button>
          <button class="btn btn--ghost btn--sm" type="button" onClick={() => setDate(addDays(date, 1))} aria-label="Nästa dag">›</button>
          <input type="date" aria-label="Datum" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
        </div>
      </div>
      <p class="pl-title"><strong>{longDate.format(new Date(`${date}T12:00:00Z`))}</strong>{locating && <span class="muted"> · hittar adresser på kartan …</span>}</p>
      <ErrorMsg error={error} />
      <div class="map-layout">
        <div ref={mapEl} class="map-canvas" role="region" aria-label="Karta över dagens jobb" />
        <div class="map-teams">
          {jobs !== null && teams.length === 0 && <p class="cp-panel cp-empty">Inga jobb den här dagen.</p>}
          {teams.map(({ person, jobs: list }) => {
            const link = routeLink(OFFICE, list.flatMap(stopsFor));
            return (
              <section class="cp-panel map-team">
                <h3>
                  <span class="dot" style={`background:${person.color}`} /> {person.full_name}
                </h3>
                <ol>
                  {list.map((j) => (
                    <li>
                      <a href={`/admin/planering?jobb=${j.id}`}>
                        <strong>{j.startTime} till {j.endTime}</strong> {jobLabel(j)}
                      </a>
                      <br />
                      <small class="muted">
                        {jobAddress(j) || 'Adress saknas'}
                        {j.to_street && ` → ${jobAddress(j, true)}`}
                        {j.street && j.lat == null && !locating && ' · hittades inte på kartan'}
                      </small>
                    </li>
                  ))}
                </ol>
                {link && (
                  <a class="btn btn--ghost btn--sm" href={link} target="_blank" rel="noopener">
                    Öppna rutten i Google Maps
                  </a>
                )}
              </section>
            );
          })}
          <p class="muted pl-legend">Rutten börjar på kontoret ({OFFICE}) och följer jobben i tidsordning.</p>
        </div>
      </div>
    </>
  );
}
