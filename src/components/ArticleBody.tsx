import { Fragment, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

// Rendu markdown enrichi pour les chapitres de la Bibliothèque (aucune
// dépendance, JSX sûr). Gère en plus de LessonBody : titres ##, tableaux,
// citations >, séparateurs ---, listes numérotées, italique et liens.

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Ordre important : **gras** avant *italique*.
  const regex = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*\n]+?\*|\[[^\]]+\]\([^)]+\))/g;
  text.split(regex).forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={i}>{part.slice(1, -1)}</code>);
    } else if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('*') && part.endsWith('*')) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else if (part.startsWith('[')) {
      const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) nodes.push(<a key={i} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a>);
      else nodes.push(<Fragment key={i}>{part}</Fragment>);
    } else {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  });
  return nodes;
}

type BType = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'ul' | 'ol' | 'code' | 'quote' | 'hr' | 'table';
interface Block { type: BType; lines: string[]; lang?: string }

const isTableSep = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-');
const rowCells = (l: string) =>
  l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

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
      i++;
      blocks.push({ type: 'code', lines: code, lang });
      continue;
    }

    if (!line.trim()) { i++; continue; }

    // Séparateur horizontal
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { blocks.push({ type: 'hr', lines: [] }); i++; continue; }

    // Titres
    if (line.startsWith('#### ')) { blocks.push({ type: 'h4', lines: [line.slice(5)] }); i++; continue; }
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', lines: [line.slice(4)] }); i++; continue; }
    if (line.startsWith('## ')) { blocks.push({ type: 'h2', lines: [line.slice(3)] }); i++; continue; }
    if (line.startsWith('# ')) { blocks.push({ type: 'h1', lines: [line.slice(2)] }); i++; continue; }

    // Tableau : ligne « | … | » suivie d'une ligne séparatrice
    if (/\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const tbl: string[] = [line];
      i++; // saute l'en-tête déjà pris
      tbl.push(lines[i]); i++; // la ligne séparatrice
      while (i < lines.length && lines[i].trim() && /\|/.test(lines[i])) { tbl.push(lines[i]); i++; }
      blocks.push({ type: 'table', lines: tbl });
      continue;
    }

    // Citation
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      blocks.push({ type: 'quote', lines: q });
      continue;
    }

    // Liste numérotée
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      blocks.push({ type: 'ol', lines: items });
      continue;
    }

    // Liste à puces
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push({ type: 'ul', lines: items });
      continue;
    }

    // Paragraphe
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```') &&
           !lines[i].startsWith('#') && !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*>/.test(lines[i]) &&
           !/^\s*(---+|\*\*\*+|___+)\s*$/.test(lines[i]) &&
           !(/\|/.test(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

function Table({ rows }: { rows: string[] }) {
  const header = rowCells(rows[0]);
  const body = rows.slice(2).map(rowCells);
  return (
    <div className="ar-table-wrap">
      <table className="ar-table">
        <thead>
          <tr>{header.map((c, j) => <th key={j}>{renderInline(c)}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ArticleBody({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="article-body">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'code': return <CodeBlock key={i} code={b.lines.join('\n')} lang={b.lang || 'text'} />;
          case 'h1': return <h2 key={i} className="ar-h2">{renderInline(b.lines[0])}</h2>;
          case 'h2': return <h2 key={i} className="ar-h2">{renderInline(b.lines[0])}</h2>;
          case 'h3': return <h3 key={i} className="ar-h3">{renderInline(b.lines[0])}</h3>;
          case 'h4': return <h4 key={i} className="ar-h4">{renderInline(b.lines[0])}</h4>;
          case 'hr': return <hr key={i} className="ar-hr" />;
          case 'quote': return <blockquote key={i} className="ar-quote">{renderInline(b.lines.join(' '))}</blockquote>;
          case 'ul': return <ul key={i} className="ar-ul">{b.lines.map((li, j) => <li key={j}>{renderInline(li)}</li>)}</ul>;
          case 'ol': return <ol key={i} className="ar-ol">{b.lines.map((li, j) => <li key={j}>{renderInline(li)}</li>)}</ol>;
          case 'table': return <Table key={i} rows={b.lines} />;
          default: return <p key={i} className="ar-p">{renderInline(b.lines.join(' '))}</p>;
        }
      })}
    </div>
  );
}
