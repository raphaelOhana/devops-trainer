import { useState } from 'react';
import type { Lesson } from '../engine/types';
import { LessonBody } from './LessonBody';

interface Props {
  lesson: Lesson;
  onBack: () => void;
  /** Lancer une session d'entraînement sur le sujet du cours. */
  onPractice?: () => void;
}

// Lecture d'une leçon : sommaire repliable + sections détaillées.
export function LessonView({ lesson, onBack, onPractice }: Props) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="app lesson">
      <div className="ex-head">
        <button className="icon-btn" onClick={onBack}>←</button>
        <div className="lesson-htitle"><span className="lesson-ico">{lesson.icon}</span> {lesson.title}</div>
      </div>

      <p className="lesson-intro">{lesson.intro}</p>

      {onPractice && (
        <button className="btn" style={{ marginBottom: 16 }} onClick={onPractice}>
          🎯 S'entraîner sur ce sujet
        </button>
      )}

      <div className="lesson-toc">
        {lesson.sections.map((s, i) => (
          <div key={i} className={`toc-item ${open === i ? 'open' : ''}`}>
            <button className="toc-head" onClick={() => setOpen(open === i ? null : i)}>
              <span className="toc-num">{i + 1}</span>
              <span className="toc-title">{s.heading}</span>
              <span className="toc-chev">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && (
              <div className="toc-content">
                <LessonBody text={s.body} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
