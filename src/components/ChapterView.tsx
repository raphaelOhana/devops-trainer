import { useEffect } from 'react';
import type { Chapter } from '../data/library';
import { ArticleBody } from './ArticleBody';

interface Props {
  chapter: Chapter;
  onBack: () => void;
}

// Lecture plein écran d'un chapitre de la Bibliothèque.
export function ChapterView({ chapter, onBack }: Props) {
  // Remonte en haut à l'ouverture d'un chapitre.
  useEffect(() => { window.scrollTo(0, 0); }, [chapter.id]);

  return (
    <div className="app article">
      <div className="ex-head">
        <button className="icon-btn" onClick={onBack}>←</button>
        <div className="lesson-htitle"><span className="lesson-ico">{chapter.icon}</span> {chapter.title}</div>
      </div>

      <div className="article-meta">📖 Lecture ~{chapter.readingMin} min · {chapter.group}</div>

      <ArticleBody text={chapter.body} />

      <button className="btn ghost article-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        ↑ Haut de page
      </button>
    </div>
  );
}
