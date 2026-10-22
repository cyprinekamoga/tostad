// En annons på /jobb/annons?a=... med ansökningsformulär. Sätter titel, beskrivning och
// strukturerad data (JobPosting) så att annonsen kan visas i Googles jobbsök.
import { useEffect, useState } from 'preact/hooks';
import { EMPLOYMENT, textToHtml, jobPosting } from '../../lib/careers.js';
import { loadVacancy, loadVacancies } from './api.js';
import ApplyForm from './ApplyForm.jsx';

const site = { legalName: 'TO Städ och Flytt AB', url: 'https://tostadflytt.se' };
const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function setHead(v, url) {
  document.title = `${v.title} | Jobb hos TO Städ & Flytt`;
  const desc = v.intro || `${v.title} hos TO Städ & Flytt i ${v.location}. ${EMPLOYMENT[v.employment]}. Sök direkt på sidan.`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc.slice(0, 160));
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(jobPosting(v, { url, logo: `${site.url}/icon-512.png`, site }));
  document.head.appendChild(script);
}

export default function JobAd() {
  const slug = new URLSearchParams(window.location.search).get('a') ?? '';
  const [v, setV] = useState(undefined);
  const [all, setAll] = useState([]);

  useEffect(() => {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return setV(null);
    Promise.all([loadVacancy(slug), loadVacancies()]).then(
      ([one, list]) => {
        setV(one);
        setAll(list);
        if (one) setHead(one, `${site.url}/jobb/annons?a=${one.slug}`);
      },
      () => setV(null),
    );
  }, []);

  if (v === undefined) return <div class="container"><p class="muted">Laddar …</p></div>;
  if (v === null)
    return (
      <div class="container container--narrow">
        <h1>Annonsen finns inte längre</h1>
        <p>Tjänsten kan redan vara tillsatt. Se <a href="/jobb">alla lediga jobb</a> eller skicka en spontanansökan.</p>
      </div>
    );

  return (
    <div class="container container--narrow job-ad">
      <p class="job-meta">{[EMPLOYMENT[v.employment], v.location].filter(Boolean).join(' · ')}</p>
      <h1>{v.title}</h1>
      {v.intro && <p class="lead">{v.intro}</p>}
      <div class="job-text" dangerouslySetInnerHTML={{ __html: textToHtml(v.description) }} />
      {v.requirements && (
        <>
          <h2>Vi söker dig som</h2>
          <div class="job-text" dangerouslySetInnerHTML={{ __html: textToHtml(v.requirements) }} />
        </>
      )}
      <dl class="job-facts">
        <dt>Anställning</dt><dd>{EMPLOYMENT[v.employment]}</dd>
        <dt>Ort</dt><dd>{v.location}</dd>
        {v.salary && <><dt>Lön</dt><dd>{v.salary}</dd></>}
        {v.start_text && <><dt>Start</dt><dd>{v.start_text}</dd></>}
        {v.valid_through && <><dt>Sista ansökningsdag</dt><dd>{dateFmt.format(new Date(`${v.valid_through}T12:00:00Z`))}</dd></>}
      </dl>
      <section id="ansok">
        <h2>Sök jobbet</h2>
        <ApplyForm vacancies={all.length ? all : [v]} selected={v.slug} />
      </section>
      <p><a href="/jobb">Alla lediga jobb</a></p>
    </div>
  );
}
