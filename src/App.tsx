import { useMemo, useState } from 'react';
import { exercises } from './data';
import type { Domain, Exercise } from './engine/types';
import { ExerciseView } from './components/ExerciseView';
import { LevelUp } from './components/LevelUp';
import {
  loadProgress, isMastered, resetProgress, levelInfo,
  XP_BY_DIFFICULTY, type Progress,
} from './store/progress';
import { TOPIC_ICON, DOMAIN_LABEL, DOMAIN_COLOR, DIFFICULTY_META } from './engine/meta';

const DOMAINS: (Domain | 'all')[] = ['all', 'devops', 'software', 'web', 'iot'];

export default function App() {
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [current, setCurrent] = useState<Exercise | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);

  const filtered = useMemo(
    () => (domain === 'all' ? exercises : exercises.filter((e) => e.domain === domain)),
    [domain]
  );
  const masteredCount = exercises.filter((e) => isMastered(progress, e.id)).length;
  const lvl = levelInfo(progress.xp);

  if (current) {
    return (
      <>
        <ExerciseView
          exercise={current}
          onBack={() => setCurrent(null)}
          onResult={(rec) => {
            setProgress(rec.progress);
            if (rec.leveledUp) setLevelUpTo(levelInfo(rec.progress.xp).level);
          }}
        />
        {levelUpTo !== null && <LevelUp level={levelUpTo} onClose={() => setLevelUpTo(null)} />}
      </>
    );
  }

  return (
    <div className="app">
      {/* HUD gamifié */}
      <header className="hud">
        <div className="hud-row">
          <div className="level-badge">
            {lvl.level}
            <small>NIV</small>
          </div>
          <div className="xp-wrap">
            <div className="xp-top">
              <span>Niveau {lvl.level}</span>
              <span><b>{lvl.xpInLevel}</b> / {lvl.xpForLevel} XP</span>
            </div>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${lvl.progressPct}%` }} />
            </div>
          </div>
          <div className={`streak ${progress.streak >= 3 ? 'hot' : ''}`} title="Série de bonnes réponses">
            <span className="flame">🔥</span>
            {progress.streak}
          </div>
        </div>
      </header>

      {/* Filtres domaines */}
      <div className="filters">
        {DOMAINS.map((d) => {
          const active = domain === d;
          const color = d === 'all' ? '#4f8cff' : DOMAIN_COLOR[d];
          return (
            <button
              key={d}
              className={`chip ${active ? 'active' : ''}`}
              style={active ? { background: color } : undefined}
              onClick={() => setDomain(d)}
            >
              {d === 'all' ? '⭐ Tout' : DOMAIN_LABEL[d]}
            </button>
          );
        })}
      </div>

      {/* Bandeau progression global */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, color: 'var(--dim)' }}>
        <span>{masteredCount} / {exercises.length} maîtrisés · série record 🔥 {progress.bestStreak}</span>
        {progress.xp > 0 && (
          <button
            onClick={() => { if (confirm('Réinitialiser toute la progression ?')) setProgress(resetProgress()); }}
            style={{ color: 'var(--dim)', fontSize: 12 }}
          >
            ↺ reset
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="list">
        {filtered.map((e) => {
          const done = isMastered(progress, e.id);
          const diff = DIFFICULTY_META[e.difficulty];
          return (
            <button key={e.id} className={`xcard ${done ? 'done' : ''}`} onClick={() => setCurrent(e)}>
              <div className="xicon">{TOPIC_ICON[e.topic]}</div>
              <div className="xbody">
                <div className="xtitle">{e.title}</div>
                {e.company && <div className="xcompany">📍 {e.company}</div>}
                <div className="xtags">
                  <span className="pill" style={{ background: `${diff.color}22`, color: diff.color }}>{diff.label}</span>
                  <span className="pill xp">+{XP_BY_DIFFICULTY[e.difficulty]} XP</span>
                </div>
              </div>
              {done && <div className="check-round">✓</div>}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty"><div className="big">🔍</div>Aucun exercice ici pour l'instant</div>
        )}
      </div>
    </div>
  );
}
