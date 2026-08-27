import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Domain, Topic, Difficulty, ExerciseType, Exercise } from '../engine/types';
import { TOPIC_ICON, TOPIC_LABEL, DOMAIN_LABEL, DIFFICULTY_META, TYPE_LABEL } from '../engine/meta';

const DOMAINS: (Domain | 'all')[] = ['all', 'devops', 'software', 'web', 'iot'];
const DIFFICULTIES: (Difficulty | 'all')[] = ['all', 'junior', 'intermediate', 'senior'];
const TYPES: (ExerciseType | 'all')[] = ['all', 'mcq', 'find-error', 'write-config'];

interface Props {
  onClose: () => void;
  exercises: Exercise[];
  domain: Domain | 'all'; setDomain: Dispatch<SetStateAction<Domain | 'all'>>;
  topic: Topic | 'all'; setTopic: Dispatch<SetStateAction<Topic | 'all'>>;
  difficulty: Difficulty | 'all'; setDifficulty: Dispatch<SetStateAction<Difficulty | 'all'>>;
  exType: ExerciseType | 'all'; setExType: Dispatch<SetStateAction<ExerciseType | 'all'>>;
  resultCount: number;
  onReset: () => void;
}

// Panneau de filtres (bottom sheet) : domaine, difficulté, format, et surtout
// les sujets sous forme de grille CHERCHABLE au lieu d'un long scroll horizontal.
export function FilterSheet(p: Props) {
  const [q, setQ] = useState('');

  const topics = useMemo(() => {
    const pool = p.domain === 'all' ? p.exercises : p.exercises.filter((e) => e.domain === p.domain);
    const counts = new Map<Topic, number>();
    pool.forEach((e) => counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1));
    const query = q.trim().toLowerCase();
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t)
      .filter((t) => query === '' || TOPIC_LABEL[t].toLowerCase().includes(query));
  }, [p.domain, p.exercises, q]);

  return (
    <div className="sheet-overlay" onClick={p.onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <span className="sheet-title">Filtres</span>
          <button className="sheet-reset" onClick={p.onReset}>Réinitialiser</button>
        </div>

        <div className="sheet-body">
          <div className="sheet-sec">
            <div className="sheet-sec-title">Domaine</div>
            <div className="sheet-chips">
              {DOMAINS.map((d) => (
                <button key={d} className={`sheet-chip ${p.domain === d ? 'active' : ''}`}
                  onClick={() => { p.setDomain(d); p.setTopic('all'); }}>
                  {d === 'all' ? 'Tout' : DOMAIN_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="sheet-sec">
            <div className="sheet-sec-title">Difficulté</div>
            <div className="sheet-chips">
              {DIFFICULTIES.map((d) => (
                <button key={d} className={`sheet-chip ${p.difficulty === d ? 'active' : ''}`}
                  style={p.difficulty === d && d !== 'all' ? { background: DIFFICULTY_META[d].color, borderColor: 'transparent', color: '#fff' } : undefined}
                  onClick={() => p.setDifficulty(d)}>
                  {d === 'all' ? 'Toute' : DIFFICULTY_META[d].label}
                </button>
              ))}
            </div>
          </div>

          <div className="sheet-sec">
            <div className="sheet-sec-title">Format</div>
            <div className="sheet-chips">
              {TYPES.map((t) => (
                <button key={t} className={`sheet-chip ${p.exType === t ? 'active' : ''}`}
                  onClick={() => p.setExType(t)}>
                  {t === 'all' ? 'Tout' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="sheet-sec">
            <div className="sheet-sec-title">Sujet</div>
            <div className="sheet-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9096a2" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un sujet…" />
              {q && <button className="search-clear" onClick={() => setQ('')}>✕</button>}
            </div>
            <div className="sheet-chips">
              <button className={`sheet-chip ${p.topic === 'all' ? 'active' : ''}`} onClick={() => p.setTopic('all')}>
                Tous les sujets
              </button>
              {topics.map((t) => (
                <button key={t} className={`sheet-chip ${p.topic === t ? 'active' : ''}`} onClick={() => p.setTopic(t)}>
                  {TOPIC_ICON[t]} {TOPIC_LABEL[t]}
                </button>
              ))}
              {topics.length === 0 && <span className="sheet-empty">Aucun sujet</span>}
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <button className="sheet-apply" onClick={p.onClose}>
            Voir {p.resultCount} exercice{p.resultCount > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
