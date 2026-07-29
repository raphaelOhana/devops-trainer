// Rendu markdown minimal et sûr (pas de dépendance, pas de dangerouslySetInnerHTML).
// Gère : **gras** et `code` inline. Suffisant pour les explications des exercices.

import { Fragment, type ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Découpe sur `code` et **gras** en conservant les délimiteurs.
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = text.split(regex);
  parts.forEach((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={i}>{part.slice(1, -1)}</code>);
    } else if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part) {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  });
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  // Un paragraphe par ligne non vide.
  const paragraphs = text.split('\n').filter((l) => l.trim());
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ marginBottom: i < paragraphs.length - 1 ? 8 : 0 }}>
          {renderInline(p)}
        </p>
      ))}
    </>
  );
}
