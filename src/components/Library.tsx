import { useMemo, useState } from 'react';
import { chapterGroups, chapters, type Chapter } from '../data/library';

interface Props {
  onOpen: (chapter: Chapter) => void;
}

// Onglet « Bibliothèque » : les chapitres longs à lire, groupés par thème.
export function Library({ onOpen }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapterGroups;
    return chapterGroups
      .map((g) => ({
        label: g.label,
        chapters: g.chapters.filter((c) =>
          c.title.toLowerCase().includes(q) || c.intro.toLowerCase().includes(q)),
      }))
      .filter((g) => g.chapters.length > 0);
  }, [query]);

  const total = chapters.length;
  const shown = groups.reduce((n, g) => n + g.chapters.length, 0);

  return (
    <div className="app">
      <h1 className="screen-title">📖 Bibliothèque</h1>
      <p className="screen-sub">
        {total} chapitres pour comprendre en profondeur — écrits pour être lus, pas récités.
        Chacun : le problème, l'intuition, puis le détail technique.
      </p>

      <div className="search-wrap">
        <span className="search-ico">🔎</span>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un chapitre…" />
        {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
      </div>

      {query && <div className="list-meta"><span><b>{shown}</b> chapitre{shown > 1 ? 's' : ''}</span></div>}

      {groups.map((g) => (
        <div key={g.label} className="lib-group">
          <h2 className="lib-group-title">{g.label}</h2>
          <div className="course-list">
            {g.chapters.map((c) => (
              <button key={c.id} className="course-card" onClick={() => onOpen(c)}>
                <span className="course-ico">{c.icon}</span>
                <span className="course-body">
                  <span className="course-title">{c.title}</span>
                  <span className="course-meta">📖 ~{c.readingMin} min</span>
                </span>
                <span className="course-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {shown === 0 && <div className="empty"><div className="big">🔍</div>Aucun chapitre ne correspond</div>}
    </div>
  );
}
