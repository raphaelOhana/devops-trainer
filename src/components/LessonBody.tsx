import { Fragment, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

// Rendu markdown enrichi pour les cours (aucune dépendance, JSX sûr).
// Gère : blocs de code ``` ```lang, titres ###/####, listes - / 1., paragraphes,
// et inline **gras** + `code`. Suffisant pour des leçons riches et lisibles.

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  text.split(regex).forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) nodes.push(<code key={i}>{part.slice(1, -1)}</code>);
    else if (part.startsWith('**') && part.endsWith('**')) nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    else if (part) nodes.push(<Fragment key={i}>{part}</Fragment>);
  });
  return nodes;
}

interface Block {
  type: 'p' | 'h3' | 'h4' | 'ul' | 'code';
  lines: string[];
  lang?: string;
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Bloc de code ```lang
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || 'text';
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++; }
      i++; // saute la fence fermante
      blocks.push({ type: 'code', lines: code, lang });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    // Titres
    if (line.startsWith('#### ')) { blocks.push({ type: 'h4', lines: [line.slice(5)] }); i++; continue; }
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', lines: [line.slice(4)] }); i++; continue; }
    if (line.startsWith('## ')) { blocks.push({ type: 'h3', lines: [line.slice(3)] }); i++; continue; }
    // Liste à puces (- ou * ou 1.)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', lines: items });
      continue;
    }
    // Paragraphe (lignes consécutives non vides, non spéciales)
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') &&
           !lines[i].startsWith('#') && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

export function LessonBody({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="lesson-body">
      {blocks.map((b, i) => {
        if (b.type === 'code') return <CodeBlock key={i} code={b.lines.join('\n')} lang={b.lang || 'text'} />;
        if (b.type === 'h3') return <h3 key={i} className="lb-h3">{renderInline(b.lines[0])}</h3>;
        if (b.type === 'h4') return <h4 key={i} className="lb-h4">{renderInline(b.lines[0])}</h4>;
        if (b.type === 'ul') return (
          <ul key={i} className="lb-ul">
            {b.lines.map((li, j) => <li key={j}>{renderInline(li)}</li>)}
          </ul>
        );
        return <p key={i} className="lb-p">{renderInline(b.lines.join(' '))}</p>;
      })}
    </div>
  );
}
