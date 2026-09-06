import { readFileSync, writeFileSync } from 'node:fs';

// Extrait les entrées d'une liste "awesome" en markdown : titre, description,
// URL (via les références [n]: url en bas de fichier) et section d'origine.
function parse(file, sourceLabel) {
  const raw = readFileSync(file, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n');

  // 1) table des références [12]: https://…
  const refs = new Map();
  for (const l of lines) {
    const m = l.match(/^\[([^\]]+)\]:\s*(\S+)/);
    if (m) refs.set(m[1], m[2]);
  }

  // 2) parcours : on suit les titres ## / ### et on recolle les puces
  //    multi-lignes (la liste indente les continuations).
  const out = [];
  let h2 = '', h3 = '', buf = null, bufIndent = 0;
  // Une puce sans lien sert de titre aux puces plus indentées qui la suivent
  // (ex. `- "Diving deep into the heap"` puis `  - [Part 1][38]`).
  let parent = null, parentIndent = -1;

  const flush = () => {
    if (!buf) return;
    const text = buf.replace(/\s+/g, ' ').trim();
    // titre = premier [..][ref] ou [..](url) de la puce
    const mRef = text.match(/^"?\[([^\]]+)\]\[([^\]]+)\]"?:?\s*(.*)$/);
    const mUrl = text.match(/^"?\[([^\]]+)\]\((\S+?)\)"?:?\s*(.*)$/);
    if (mRef || mUrl) {
      const [, rawTitle, key, desc] = mRef ?? mUrl;
      const url = mRef ? refs.get(key) : key;
      let title = rawTitle.replace(/^"|"$/g, '').trim();
      // Puce enfant d'un chapeau : on préfixe par le titre du chapeau.
      if (parent && bufIndent > parentIndent) title = `${parent} — ${title}`;
      if (url) out.push({
        title,
        desc: (desc || '').replace(/^[:\-–]\s*/, '').trim(),
        url, source: sourceLabel, h2, h3,
      });
    } else {
      // Puce "chapeau" sans lien : devient le parent des puces indentées.
      parent = text.replace(/^"|["“:]+$/g, '').replace(/["“]/g, '').trim() || null;
      parentIndent = bufIndent;
    }
    buf = null;
  };

  for (const l of lines) {
    if (/^\[[^\]]+\]:\s/.test(l)) continue;            // ligne de référence
    const mH = l.match(/^(#{2,3})\s+(.+)/);
    if (mH) {
      flush(); parent = null; parentIndent = -1;
      if (mH[1] === '##') { h2 = mH[2].trim(); h3 = ''; } else h3 = mH[2].trim();
      continue;
    }
    const mBullet = l.match(/^(\s*)[-*]\s+(.*)$/);
    if (mBullet) {
      flush();
      const indent = mBullet[1].length;
      // On retombe au niveau du chapeau (ou au-dessus) → il ne s'applique plus.
      if (indent <= parentIndent) { parent = null; parentIndent = -1; }
      bufIndent = indent; buf = mBullet[2];
      continue;
    }
    // Continuation d'une puce : la liste source ne réindente pas toujours.
    if (buf !== null && l.trim() && !/^#/.test(l)) { buf += ' ' + l.trim(); continue; }
    flush();
  }
  flush();
  return out;
}

// --- Sources -------------------------------------------------------------
let entries = [
  ...parse('t_exploitation.md', 'exploitation'),
  ...parse('t_linux_kernel.md', 'linux_kernel'),
  ...parse('t_wireless.md', 'wireless'),
  ...parse('t_ot_security.md', 'ot_security'),
  ...parse('t_red-team-adversary-emulation.md', 'red_team'),
];

// Du README principal, on ne garde QUE la section Misc (evergreen : cours,
// livres, tutos). Les sections chronologiques sont des writeups de CVE.
const readme = readFileSync('awesome.md', 'utf8').replace(/\r/g, '');
const miscBlock = readme.slice(readme.indexOf('\n## Misc'), readme.indexOf('\n## Other Lists'));
writeFileSync('_misc.md', miscBlock + '\n' + readme.slice(readme.indexOf('\n[0]: ')));
entries.push(...parse('_misc.md', 'misc'));

// --- Nettoyage -----------------------------------------------------------
// Doublons d'URL : on garde la 1re occurrence, on note les sources multiples.
const byUrl = new Map();
for (const e of entries) {
  const k = e.url.replace(/\/+$/, '');
  if (byUrl.has(k)) { byUrl.get(k).alsoIn.add(e.source); continue; }
  byUrl.set(k, { ...e, alsoIn: new Set([e.source]) });
}
entries = [...byUrl.values()];

// Bruit : annuaires de vendeurs, blogs d'entreprise, conférences.
const NOISE_H2 = /^(Companies|Conferences|Content|Podcasts|Twitter|Youtube channels?|News)$/i;
const dropped = entries.filter((e) => NOISE_H2.test(e.h2));
entries = entries.filter((e) => !NOISE_H2.test(e.h2));

writeFileSync('entries.json', JSON.stringify(entries.map((e) => ({ ...e, alsoIn: [...e.alsoIn] })), null, 1));

console.log('entrées retenues :', entries.length, '| écartées (vendeurs/confs) :', dropped.length);
const bySrc = {};
for (const e of entries) bySrc[e.source] = (bySrc[e.source] ?? 0) + 1;
console.log(bySrc);
console.log('\nSections :');
const bySec = {};
for (const e of entries) { const k = `${e.source} / ${e.h2}${e.h3 ? ' / ' + e.h3 : ''}`; bySec[k] = (bySec[k] ?? 0) + 1; }
for (const [k, v] of Object.entries(bySec).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
