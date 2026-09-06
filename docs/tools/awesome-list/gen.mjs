import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const APP = 'c:/Users/rapha/Workspace/devops-trainer';
const entries = JSON.parse(readFileSync('classified.json', 'utf8'));

// --- Inventaire réel du catalogue de l'app -------------------------------
// On BUNDLE réellement src/data/index.ts : compter les `topic:` à la regex
// sous-compte gravement, car les lots à helpers (exercises-memory.ts…) ne
// déclarent le topic qu'une fois pour tout le fichier.
const bundle = `${APP}/node_modules/.cache-curriculum-bundle.mjs`;
await build({
  absWorkingDir: APP, entryPoints: ['src/data/index.ts'], bundle: true,
  format: 'esm', outfile: bundle, loader: { '.md': 'text' }, logLevel: 'error',
});
const { exercises } = await import('file://' + bundle);
const counts = {};
for (const e of exercises) counts[e.topic] = (counts[e.topic] ?? 0) + 1;
const TOTAL_EXOS = exercises.length;

// --- Topics traités, dans l'ordre du plan --------------------------------
// [clé, libellé, note, verdict forcé ?] — le verdict auto ne regarde que le
// volume du topic ; il rate les trous internes (cf. memory-safety).
const TOPICS = [
  ['memory-safety', 'Sûreté mémoire / exploitation du tas',
   "Le lot existant est orienté **pile, entiers et CWE de base** : sur 36 exercices, **6 seulement touchent le tas**, et aucun ne descend dans l'allocateur (bins, tcache, consolidation). Or c'est là que la liste est la plus riche — et le domaine se transpose directement en `find-error` sur du C.",
   '🔴 **trou interne** : 36 exos, mais 6 sur le tas'],
  ['linux-kernel', 'Noyau Linux',
   "Topic inexistant dans l'app. Le gisement le plus gros de la liste. À ouvrir seulement si on assume un nouveau `Topic` dans types.ts."],
  ['exploit-dev', 'Exploit dev / mitigations',
   'Complète le lot `exploit-dev` existant côté mitigations (RELRO, canari, CET, FGKASLR) et plateformes d\'entraînement.'],
  ['reversing', 'Reverse engineering',
   'Recoupe fortement les transcrits YouTube analysés par ailleurs. Ici surtout de l\'outillage (Ghidra, IDA, WinDbg) et de l\'anti-analyse.'],
  ['hardware', 'Matériel, firmware, TEE',
   'Firmware, secure boot, TrustZone/TPM, injection de faute. Nourrit un topic déjà fourni (70 exercices) mais surtout côté théorie.'],
  ['networking', 'Réseau & sans-fil',
   'Le plus gros volume, mais aussi le plus spécialisé (802.11, BLE, SDR). Le topic `networking` de l\'app n\'a que 13 exercices : marge énorme, pertinence à arbitrer.'],
  ['iot-edge', 'IoT / OT / ICS',
   '`iot-edge` n\'a que 5 exercices. La sous-liste OT est courte mais ciblée (Modbus, PLC, protocoles industriels).'],
  ['cryptography', 'Cryptographie', 'Peu d\'entrées, mais deux références majeures (cryptopals, Practical Cryptography for Developers).'],
  ['languages', 'Langages & compilation', 'Rust (atomics, locks), compilateurs. Marginal : `languages` compte déjà 45 exercices.'],
  ['testing', 'Tests & qualité', 'Une seule entrée vraiment utile : le Testing Handbook de Trail of Bits.'],
  ['appsec', 'AppSec', 'Quasi absent de cette liste — orientée binaire, pas web. `appsec` est déjà le topic le mieux fourni de l\'app (183).'],
];

const esc = (s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
const KIND_LABEL = { cours: '📘 cours/tuto', ressource: '🔗 référence', outil: '🛠 outil', writeup: '🧪 writeup' };

let md = `# Curriculum — cartographie de \`0xor0ne/awesome-list\`

> Généré le ${new Date().toISOString().slice(0, 10)} depuis
> <https://github.com/0xor0ne/awesome-list> (README section « Misc » + les 5
> sous-listes \`topics/*.md\`). **Document de travail, hors bundle** : il ne part
> pas dans l'app, il sert à décider quoi écrire.

## Méthode

Le dépôt source est un **index de liens**, pas du contenu : 1 438 titres et
~1 300 URLs vers des blogs tiers. Il n'y a donc rien à ingérer — sa valeur est
comme plan de cours et bibliographie.

Ce qui a été retenu, et pourquoi :

| Source | Entrées | Retenu ? |
|---|---|---|
| README, sections 2011→2026 | ~1 250 | ❌ Writeups de CVE nominatives : périssable, hyper-spécialisé, ~5 000 mots à lire pour 1 question. |
| README, section « Misc » | ~80 | ✅ Seul bloc pérenne : cours, livres, tutos, cheatsheets. |
| \`topics/exploitation.md\` | 261 | ✅ Thématique et hiérarchisée (Heap, Kernel, Mitigations, Libcs, Practice). |
| \`topics/linux_kernel.md\` | 111 | ✅ Internals, fuzzing, rootkits, Rust. |
| \`topics/wireless.md\` | 251 | ⚠️ Retenu, pertinence à arbitrer (très spécialisé). |
| \`topics/ot_security.md\` | 70 | ⚠️ Majoritairement des annuaires de vendeurs — 6 entrées utiles seulement. |
| \`topics/red-team-adversary-emulation.md\` | 133 | ⚠️ Retenu mais hors-scope à mon avis (C2, évasion, persistence offensive). |

Après résolution des liens, déduplication par URL et retrait des annuaires de
vendeurs / conférences / podcasts (93 entrées écartées) : **${entries.length} entrées**
classées par nature et rattachées à un topic de l'app.

⚠️ **Licence** : le dépôt source n'a pas de fichier LICENSE, et les contenus
pointés appartiennent à des tiers. Ces liens servent de **sources** — on écrit
notre propre texte, et on attribue.

---

## Synthèse : où sont les trous

\`Exos\` = état actuel du catalogue de l'app. \`Ressources\` = entrées disponibles
ici. Un écart fort entre les deux = un lot à produire.

| Topic app | Exos | Ressources | dont cours/tutos | Verdict |
|---|---:|---:|---:|---|
`;

const rows = [];
for (const [key, label, , forced] of TOPICS) {
  const pool = entries.filter((e) => e.topic === key);
  const cours = pool.filter((e) => e.kind === 'cours').length;
  const exos = counts[key] ?? 0;
  let verdict = forced;
  if (verdict) { rows.push(`| \`${key}\` — ${label} | ${exos || '—'} | ${pool.length} | ${cours} | ${verdict} |`); continue; }
  if (exos === 0) verdict = '🔴 **topic absent de l\'app**';
  else if (pool.length >= 40 && exos < 20) verdict = '🔴 **trou majeur**';
  else if (pool.length >= 15 && exos < 30) verdict = '🟠 sous-couvert';
  else if (pool.length < 8) verdict = '⚪ apport marginal';
  else if (exos < 10) verdict = '🟠 sous-couvert';
  else verdict = '🟢 déjà couvert, apport d\'appoint';
  rows.push(`| \`${key}\` — ${label} | ${exos || '—'} | ${pool.length} | ${cours} | ${verdict} |`);
}
md += rows.join('\n') + '\n';

const covered = new Set(TOPICS.map(([k]) => k));
const untouched = Object.entries(counts)
  .filter(([k]) => !covered.has(k))
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `\`${k}\` (${v})`);

md += `
Le catalogue compte **${TOTAL_EXOS} exercices** au total. Les topics que cette
liste **ne nourrit pas** : ${untouched.join(', ')}.

---

## Ressources par topic

Légende : 📘 cours/tuto · 🔗 référence · 🛠 outil · 🧪 writeup technique.
Les writeups sont plafonnés aux 12 plus exploitables par topic.
`;

for (const [key, label, note] of TOPICS) {
  const pool = entries.filter((e) => e.topic === key);
  if (!pool.length) continue;
  md += `\n### \`${key}\` — ${label}\n\n${note}\n\n`;
  md += `*${counts[key] ?? 0} exercices dans l'app · ${pool.length} ressources ici*\n\n`;

  for (const kind of ['cours', 'ressource', 'outil', 'writeup']) {
    let list = pool.filter((e) => e.kind === kind);
    if (!list.length) continue;
    const capped = kind === 'writeup' && list.length > 12;
    if (capped) list = list.slice(0, 12);
    md += `**${KIND_LABEL[kind]}**\n\n`;
    for (const e of list) {
      md += `- [${esc(e.title)}](${e.url})${e.desc ? ` — ${esc(e.desc)}` : ''}\n`;
    }
    if (capped) md += `- *…et ${pool.filter((e) => e.kind === kind).length - 12} autres writeups (voir \`entries.json\`)*\n`;
    md += '\n';
  }
}

md += `
---

## Plan d'action proposé

Par ordre de rentabilité (effort de production / valeur pour le catalogue).

### 1. \`exercises-memory-heap.ts\` — ✅ **LIVRÉ** (53 exercices)

> Fait le ${new Date().toISOString().slice(0, 10)} : \`src/data/exercises-memory-heap.ts\`,
> branché dans \`index.ts\`. 53 exercices (43 QCM + 10 find-error), tous avec
> \`optionNotes\`. \`memory-safety\` passe de 36 à 89 exercices. Bundle +69 Ko.
> Le détail de plan ci-dessous documente ce qui a été produit.


\`memory-safety\` compte 36 exercices, mais **6 seulement touchent le tas**
(\`mem-uaf-free\`, \`mem-double-free\`, \`mem-int-mul\`, \`mem-null-deref\`,
\`mem-realloc-leak\`, \`mem-q-stack-vs-heap\`) et aucun ne descend dans
l'allocateur. Face à cela : 91 ressources ici, dont 33 cours structurés.
C'est le sous-domaine le plus mal couvert du catalogue.

Plan de lot :

| Bloc | Exos | Sources principales |
|---|---:|---|
| Anatomie du tas glibc (chunk, taille, flags PREV_INUSE) | 10 | Overview of Malloc (glibc wiki), Understanding glibc malloc |
| Les bins : fast, tcache, small, large, unsorted | 12 | Azeria Labs parties 1-2, Heap Exploitation (dhavalkapil) |
| UAF, double-free, off-by-one / poison null byte | 12 | how2heap, toddler's introduction parties 3-4 |
| Primitives : unsafe unlink, fastbin dup, House of * | 12 | how2heap, House of Husk / Mind / Lore |
| Durcissements : safe-linking, tcache key, Scudo, jemalloc | 8 | Malloc Protections on Singly Linked Lists, Behind the Shield |
| Allocateurs noyau : SLUB/SLAB, cross-cache | 6 | Linux SLUB Allocator Internals (Oracle, 4 parties) |

Format : majoritairement \`find-error\` sur du C — c'est exactement ce que le
catalogue a le moins (407 \`find-error\` sur ${TOTAL_EXOS}) et ce que le sujet
permet le mieux. \`company\` = la source, comme les lots générés existants.

### 2. Chapitre bibliothèque \`40_RESSOURCES.md\` — **priorité haute, coût faible**

~60 liens triés et commentés en français, par sujet, incluant la section
« où s'entraîner pour de vrai » (pwn.college, ropemporium, pwnable.kr/tw,
exploit.education, OverTheWire, how2heap). L'app n'a aucun volet hands-on ;
une bibliographie assume d'être une bibliographie. Poids : ~20 Ko.

### 3. Topic \`linux-kernel\` — **gros morceau, à arbitrer**

181 ressources, dont 39 cours, pour un topic **inexistant** dans l'app.
Demande : une entrée dans \`Topic\` (\`src/engine/types.ts\`), un cours
\`courses/linux-kernel.md\`, un lot d'exercices. Découpage naturel :
internals (Linux Insides, Bootlin, kernel map) · syscalls & modules ·
SLUB & mémoire noyau · privesc & mitigations (kconfig-hardened-check,
FGKASLR) · fuzzing (syzkaller) · rootkits & eBPF · Rust for Linux.

### 4. \`networking\` — **le plus gros volume, la pertinence la plus discutable**

199 ressources pour 8 exercices, mais l'essentiel est du 802.11/BLE/SDR très
spécialisé (DragonBlood, FragAttacks, KRACK). À trancher : soit on assume un
virage « sécurité radio », soit on ne prend que le noyau pédagogique — les
Illustrated Connections (TLS 1.2/1.3, QUIC, DTLS) et les attaques canoniques
WPA2/WPA3, soit ~15 exercices.

### Ce que je ne ferais pas

- **Les 1 250 writeups chronologiques** : voir la méthode plus haut.
- **La sous-liste red team** (133 entrées : C2, évasion, backdoors) : l'app
  entraîne à construire et défendre, pas à opérer une intrusion. \`agent-security\`
  et \`secure-review\` couvrent déjà l'angle défensif.
- **\`ot_security.md\`** : 70 entrées dont 64 sont des annuaires de vendeurs.
  Les 6 restantes ne justifient pas un lot à elles seules.
`;

writeFileSync(`${APP}/docs/curriculum.md`, md);
console.log('écrit : docs/curriculum.md —', md.split('\n').length, 'lignes,', md.length, 'octets');
console.log('\nExos par topic concerné :');
for (const [k] of TOPICS) console.log(' ', k.padEnd(15), counts[k] ?? 0);
