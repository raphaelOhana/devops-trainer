import type { Lesson, Topic, LessonSection } from '../engine/types';

// Cours détaillés, rédigés à partir de la doc de chaque source (OWASP, WSTG,
// HackTricks, docs officielles, system-design-primer…). Le contenu brut vit
// dans des fichiers .md (import ?raw) et est parsé ici — ainsi le markdown
// (backticks, ${}, <, >) n'a besoin d'aucun échappement TypeScript.

import appsecMd from './courses/appsec.md?raw';
import securityMd from './courses/security.md?raw';
import devopsMd from './courses/devops.md?raw';
import opsMd from './courses/ops.md?raw';
import csMd from './courses/cs.md?raw';
import memoryMd from './courses/memory.md?raw';

// Décode les entités HTML laissées par la génération (&lt; &gt; &amp; …).
function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function field(head: string, key: string): string {
  const m = head.match(new RegExp('^' + key + ':\\s*([\\s\\S]*?)\\s*$', 'm'));
  return m ? m[1].trim() : '';
}

// Parse le format ===LESSON=== / ---SECTION--- en objets Lesson.
function parse(raw: string): Lesson[] {
  const out: Lesson[] = [];
  const blocks = decode(raw).split('===LESSON===').slice(1);
  for (const block of blocks) {
    const body = block.split('===END===')[0];
    const parts = body.split('---SECTION---');
    const head = parts[0];
    const key = field(head, 'KEY');
    const topic = field(head, 'TOPIC') as Topic;
    if (!key || !topic) continue;
    const title = field(head, 'TITLE');
    const icon = field(head, 'ICON') || '📘';
    const intro = field(head, 'INTRO');
    const sections: LessonSection[] = [];
    for (const s of parts.slice(1)) {
      const hMatch = s.match(/HEADING:\s*(.*)/);
      const heading = hMatch ? hMatch[1].trim() : '';
      const bi = s.indexOf('BODY:');
      const bText = bi >= 0 ? s.slice(bi + 'BODY:'.length) : '';
      if (heading) sections.push({ heading, body: bText.trim() });
    }
    out.push({ key, topic, title, icon, intro, sections });
  }
  return out;
}

export const lessons: Lesson[] = [
  ...parse(appsecMd),
  ...parse(securityMd),
  ...parse(devopsMd),
  ...parse(opsMd),
  ...parse(csMd),
  ...parse(memoryMd),
];

/** Première leçon associée à un sujet (pour le lien exercice → cours). */
export function lessonForTopic(topic: Topic): Lesson | undefined {
  return lessons.find((l) => l.topic === topic);
}
