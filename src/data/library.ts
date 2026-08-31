// Bibliothèque : chapitres longs à LIRE (indépendants des exercices/quiz).
// Les .md de src/data/library/ sont importés en masse ; on en dérive le titre
// (première ligne « # »), un chapô (premier paragraphe) et un temps de lecture.

export interface Chapter {
  id: string;         // ex. "01_GFS" (nom de fichier sans extension)
  title: string;      // première ligne « # … »
  intro: string;      // premier vrai paragraphe (chapô / sous-titre)
  body: string;       // markdown complet, SANS la ligne de titre
  icon: string;
  group: string;
  readingMin: number;
}

// Import brut de tous les chapitres d'un coup (Vite).
const files = import.meta.glob('./library/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Ordre + regroupement thématique (calqué sur le sommaire de la biblio PDF).
const GROUPS: { label: string; ids: string[] }[] = [
  { label: '🧩 Systèmes distribués', ids: [
    '09_THE_LOG', '01_GFS', '02_DYNAMO', '03_SPANNER', '04_KAFKA',
    '05_BIGTABLE', '06_MAPREDUCE', '07_BORG', '08_CHUBBY', '25_PAPERS'] },
  { label: '🗄️ Données & backend', ids: [
    '10_DDIA', '11_POSTGRESQL', '12_REDIS', '13_SYSTEM_DESIGN'] },
  { label: '☁️ Infra, cloud & exploitation', ids: [
    '14_KUBERNETES', '17_CLOUD_ARCHITECTURE', '18_DEVOPS_PLATFORM',
    '15_SRE_OBSERVABILITY', '18_SITE_RELIABILITY', '22_PROMETHEUS'] },
  { label: '🔐 Sécurité & réseau', ids: [
    '16_SECURITY_ARCHITECTURE', '21_SECURITY_FOR_CTOS', '24_NETWORKING'] },
  { label: '💻 Code & IA', ids: [
    '19_TECHNICAL_CODING', '19B_CODING_EXERCISES', '23_LLM_RAG', '26_MCP'] },
  { label: '🔬 Reverse & exploit', ids: [
    '27_EXPLOIT_PATCHDIFF'] },
  { label: '🧭 Leadership technique', ids: [
    '16_ENGINEERING_MANAGERS_HANDBOOK', '17_STAFF_ENGINEER'] },
];

// Emoji par chapitre (à défaut, un point générique).
const ICONS: Record<string, string> = {
  '01_GFS': '📁', '02_DYNAMO': '🛒', '03_SPANNER': '🌍', '04_KAFKA': '🪵',
  '05_BIGTABLE': '📊', '06_MAPREDUCE': '⚙️', '07_BORG': '🤖', '08_CHUBBY': '🔒',
  '09_THE_LOG': '📜', '25_PAPERS': '📄', '10_DDIA': '📘', '11_POSTGRESQL': '🐘',
  '12_REDIS': '⚡', '13_SYSTEM_DESIGN': '🏗️', '14_KUBERNETES': '☸️',
  '17_CLOUD_ARCHITECTURE': '☁️', '18_DEVOPS_PLATFORM': '🚀',
  '15_SRE_OBSERVABILITY': '🔭', '18_SITE_RELIABILITY': '🚨', '22_PROMETHEUS': '📈',
  '16_SECURITY_ARCHITECTURE': '🛡️', '21_SECURITY_FOR_CTOS': '🔑', '24_NETWORKING': '🕸️',
  '19_TECHNICAL_CODING': '💻', '19B_CODING_EXERCISES': '🧩', '23_LLM_RAG': '🧠',
  '26_MCP': '🔌', '16_ENGINEERING_MANAGERS_HANDBOOK': '👥', '17_STAFF_ENGINEER': '🎯',
  '27_EXPLOIT_PATCHDIFF': '🩹',
};

function splitTitle(md: string): { title: string; body: string } {
  const lines = md.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+)/);
    if (m) {
      const body = lines.slice(i + 1).join('\n').replace(/^\n+/, '');
      return { title: m[1].trim(), body };
    }
  }
  return { title: 'Sans titre', body: md };
}

function firstParagraph(body: string): string {
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t) continue;
    if (/^[#>`|]/.test(t) || /^-{3,}$/.test(t) || /^\s*[-*]\s/.test(t) || /^\s*\d+\.\s/.test(t)) continue;
    return t.replace(/\s+/g, ' ');
  }
  return '';
}

function readingMin(md: string): number {
  const words = md.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

const byId: Record<string, string> = {};
for (const [path, raw] of Object.entries(files)) {
  const id = path.split('/').pop()!.replace(/\.md$/, '');
  byId[id] = raw;
}

function build(id: string): Chapter | null {
  const raw = byId[id];
  if (!raw) return null;
  const { title, body } = splitTitle(raw);
  return {
    id, title, body,
    intro: firstParagraph(body),
    icon: ICONS[id] ?? '📖',
    group: '',
    readingMin: readingMin(raw),
  };
}

export interface ChapterGroup { label: string; chapters: Chapter[] }

export const chapterGroups: ChapterGroup[] = GROUPS.map((g) => ({
  label: g.label,
  chapters: g.ids.map(build).filter((c): c is Chapter => c !== null)
    .map((c) => ({ ...c, group: g.label })),
}));

// Filet : tout chapitre présent sur disque mais absent d'un groupe.
const placed = new Set(GROUPS.flatMap((g) => g.ids));
const orphans = Object.keys(byId).filter((id) => !placed.has(id)).sort();
if (orphans.length) {
  chapterGroups.push({
    label: '📚 Autres',
    chapters: orphans.map(build).filter((c): c is Chapter => c !== null),
  });
}

export const chapters: Chapter[] = chapterGroups.flatMap((g) => g.chapters);
