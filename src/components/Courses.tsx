import { lessons } from '../data/lessons';
import type { Lesson } from '../engine/types';
import { TOPIC_LABEL } from '../engine/meta';

interface Props {
  onOpen: (lesson: Lesson) => void;
}

// Liste des cours disponibles. Chaque carte ouvre la leçon.
export function Courses({ onOpen }: Props) {
  return (
    <div className="app">
      <h1 className="screen-title">📚 Cours</h1>
      <p className="screen-sub">Des leçons détaillées, sujet par sujet. Un exercice raté te renvoie ici.</p>

      <div className="course-list">
        {lessons.map((l) => (
          <button key={l.key} className="course-card" onClick={() => onOpen(l)}>
            <span className="course-ico">{l.icon}</span>
            <span className="course-body">
              <span className="course-title">{l.title}</span>
              <span className="course-meta">{TOPIC_LABEL[l.topic]} · {l.sections.length} sections</span>
            </span>
            <span className="course-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
