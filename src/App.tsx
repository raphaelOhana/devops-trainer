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

/** Session de révision : exercices non maîtrisés, les ratés d'abord. */
function buildRevision(p: Progress, pool: Exercise[]): Exercise[] {
  const notMastered = pool.filter((e) => !isMastered(p, e.id));
  const failed = notMastered.filter((e) => (p.attempts[e.id]?.attempts ?? 0) > 0);
  const fresh = notMastered.filter((e) => (p.attempts[e.id]?.attempts ?? 0) === 0);
  return [...failed, ...fresh];
}

export default function App() {
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  // Une session = file d'exercices + position. Un clic simple = session de 1.
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [pos, setPos] = useState(0);

  const filtered = useMemo(
    () => (domain === 'all' ? exercises : exercises.filter((e) => e.domain === domain)),
    [domain]
  );
  const masteredCount = exercises.filter((e) => isMastered(progress, e.id)).length;
  const notMasteredCount = exercises.length - masteredCount;
  const lvl = levelInfo(progress.xp);

  function handleResult(rec: { progress: Progress; leveledUp: boolean }) {
    setProgress(rec.progress);
    if (rec.leveledUp) setLevelUpTo(levelInfo(rec.progress.xp).level);
  }

  function nextInSession() {
    if (session && pos < session.length - 1) setPos(pos + 1);
    else { setSession(null); setPos(0); }
  }

  // ---- Écran exercice (dans une session) ----
  if (session && session[pos]) {
    return (
      <>
        <ExerciseView
          key={session[pos].id}
          exercise={session[pos]}
          position={session.length > 1 ? { current: pos + 1, total: session.length } : undefined}
          onBack={() => { setSession(null); setPos(0); }}
          onNext={nextInSession}
          onResult={handleResult}
        />
        {levelUpTo !== null && <LevelUp level={levelUpTo} onClose={() => setLevelUpTo(null)} />}
      </>
    );
  }

  // ---- Accueil ----
  return (
    <div className="app">
      <header className="hud">
        <div className="hud-row">
          <div className="level-badge">{lvl.level}<small>NIV</small></div>
          <div className="xp-wrap">
            <div className="xp-top">
              <span>Niveau {lvl.level}</span>
              <span><b>{lvl.xpInLevel}</b> / {lvl.xpForLevel} XP</span>
            </div>
            <div className="xp-bar"><div className="xp-fill" style={{ width: `${lvl.progressPct}%` }} /></div>
          </div>
          <div className={`streak ${progress.streak >= 3 ? 'hot' : ''}`} title="Série de bonnes réponses">
            <span className="flame">🔥</span>{progress.streak}
          </div>
        </div>
      </header>

      {/* Bouton révision */}
      {notMasteredCount > 0 && (
        <button
          className="revise-btn"
          onClick={() => { const s = buildRevision(progress, filtered); if (s.length) { setSession(s); setPos(0); } }}
        >
          🎯 Réviser mes lacunes<span className="revise-count">{buildRevision(progress, filtered).length}</span>
        </button>
      )}

      <div className="filters">
        {DOMAINS.map((d) => {
          const active = domain === d;
          const color = d === 'all' ? '#4f8cff' : DOMAIN_COLOR[d];
          return (
            <button key={d} className={`chip ${active ? 'active' : ''}`}
              style={active ? { background: color } : undefined} onClick={() => setDomain(d)}>
              {d === 'all' ? '⭐ Tout' : DOMAIN_LABEL[d]}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, color: 'var(--dim)' }}>
        <span>{masteredCount} / {exercises.length} maîtrisés · record 🔥 {progress.bestStreak}</span>
        {progress.xp > 0 && (
          <button onClick={() => { if (confirm('Réinitialiser toute la progression ?')) setProgress(resetProgress()); }}
            style={{ color: 'var(--dim)', fontSize: 12 }}>↺ reset</button>
        )}
      </div>

      <div className="list">
        {filtered.map((e) => {
          const done = isMastered(progress, e.id);
          const diff = DIFFICULTY_META[e.difficulty];
          return (
            <button key={e.id} className={`xcard ${done ? 'done' : ''}`}
              onClick={() => { setSession([e]); setPos(0); }}>
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
          <div className="empty"><div className="big">🔍</div>Aucun exercice ici</div>
        )}
      </div>
    </div>
  );
}
