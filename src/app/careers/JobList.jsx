// Lediga jobb på /jobb och formuläret för att söka.
import { useEffect, useState } from 'preact/hooks';
import { EMPLOYMENT } from '../../lib/careers.js';
import { loadVacancies } from './api.js';
import ApplyForm from './ApplyForm.jsx';

export default function JobList() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const wanted = new URLSearchParams(window.location.search).get('sok') ?? '';

  useEffect(() => {
    loadVacancies().then(setList, (e) => {
      setError(e.message);
      setList([]);
    });
  }, []);

  return (
    <>
      <section class="section section--tight" id="lediga-jobb">
        <div class="container">
          <h2>Lediga jobb</h2>
          {list === null && <p class="muted">Laddar …</p>}
          {error && <p class="apply-error">{error}</p>}
          {list?.length === 0 && !error && (
            <p class="jobs-empty">Just nu har vi inga utannonserade tjänster, men vi tar gärna emot spontanansökningar. Skicka in din ansökan nedan så hör vi av oss när vi behöver fler.</p>
          )}
          <ul class="jobs-list">
            {(list ?? []).map((v) => (
              <li>
                <a class="job-card" href={`/jobb/annons?a=${v.slug}`}>
                  <strong>{v.title}</strong>
                  <span>{[EMPLOYMENT[v.employment], v.location].filter(Boolean).join(' · ')}</span>
                  {v.intro && <p>{v.intro}</p>}
                  <span class="job-more">Läs mer och sök</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section class="section section--tight" id="ansok">
        <div class="container container--narrow">
          <h2>Sök jobb hos oss</h2>
          {list !== null && <ApplyForm vacancies={list} selected={list.some((v) => v.slug === wanted) ? wanted : list[0]?.slug ?? ''} />}
        </div>
      </section>
    </>
  );
}
