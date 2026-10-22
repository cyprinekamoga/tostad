import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToHtml, slugify, jobPosting } from '../src/lib/careers.js';

test('annonstext till HTML, med skydd mot HTML i texten', () => {
  assert.equal(textToHtml('Hej!\nVälkommen.\n\n- Städa\n- Flytta'), '<p>Hej!<br>Välkommen.</p><ul><li>Städa</li><li>Flytta</li></ul>');
  assert.equal(textToHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.equal(textToHtml(''), '');
});

test('slug', () => {
  assert.equal(slugify('Städare till Solna & Sundbyberg!'), 'stadare-till-solna-sundbyberg');
  assert.equal(slugify('Flyttgubbe – helg'), 'flyttgubbe-helg');
});

test('JobPosting', () => {
  const site = { legalName: 'TO Städ och Flytt AB', url: 'https://tostadflytt.se' };
  const j = jobPosting({ title: 'Städare', description: 'Text', employment: 'timanstallning', location: 'Solna', published_at: '2026-10-24T08:00:00Z', valid_through: '2026-11-30' }, { url: 'https://tostadflytt.se/jobb/annons?a=stadare', logo: 'https://tostadflytt.se/icon-512.png', site });
  assert.equal(j['@type'], 'JobPosting');
  assert.equal(j.datePosted, '2026-10-24');
  assert.deepEqual(j.employmentType, ['PART_TIME', 'PER_DIEM']);
  assert.equal(j.jobLocation.address.addressLocality, 'Solna');
  assert.equal(j.validThrough, '2026-11-30T23:59:59+01:00');
  assert.ok(j.description.includes('<p>Text</p>'));
});
