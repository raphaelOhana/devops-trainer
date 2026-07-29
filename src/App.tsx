import { useMemo, useState } from 'react';
import { exercises } from './data';
import type { Domain, Exercise } from './engine/types';
import { ExerciseView } from './components/ExerciseView';
import { LevelUp } from './components/LevelUp';
import { Stats } from './components/Stats';
import {
  loadProgress, isMastered, resetProgress, levelInfo, isDue,
  XP_BY_DIFFICULTY, type Progress,
} from './store/progress';
import { TOPIC_ICON, DOMAIN_LABEL, DOMAIN_COLOR, DIFFICULTY_META } from './engine/meta';

const DOMAINS: (Domain | 'all')[] = ['all', 'devops', 'software', 'web', 'iot'];

/**
 * Session de révision espacée : d'abord les exercices « dus » (dont les
 * maîtrisés à ré-ancrer), puis les ratés récents, puis les nouveaux.
 */
function buildRevision(p: Progress, pool: Exercise[]): Exercise[] {
  const now = Date.now();
  const due = pool.filter((e) => isDue(p, e.id, now));
  const failed = pool.filter((e) => !isDue(p, e.id, now) && !isMastered(p, e.id) && (p.attempts[e.id]?.attempts ?? 0) > 0);
  const fresh = pool.filter((e) => (p.attempts[e.id]?.attempts ?? 0) === 0);
  // due trié par date d'échéance (le plus en retard d'abord)
  due.sort((a, b) => (p.attempts[a.id]?.dueAt ?? 0) - (p.attempts[b.id]?.dueAt ?? 0));
  return [...due, ...failed, ...fresh];
}

export default function App() {
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  // Une session = file d'exercices + position. Un clic simple = session de 1.
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [pos, setPos] = useState(0);
  const [showStats, setShowStats] = useState(false);

  const filtered = useMemo(
    () => (domain === 'all' ? exercises : exercises.filter((e) => e.domain === domain)),
    [domain]
  );
  const masteredCount = exercises.filter((e) => isMastered(progress, e.id)).length;
  const revisionQueue = useMemo(() => buildRevision(progress, filtered), [progress, filtered]);
  const dueToday = useMemo(() => filtered.filter((e) => isDue(progress, e.id)).length, [progress, filtered]);
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

  // ---- Écran stats ----
  if (showStats) {
    return <Stats progress={progress} onBack={() => setShowStats(false)} />;
  }

  // ---- Accueil ----
  const reviseLabel = dueToday > 0 ? '🔥 À réviser aujourd\'hui' : '🎯 Réviser mes lacunes';
  const reviseNum = dueToday > 0 ? dueToday : revisionQueue.length;

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
          <div className={`streak ${progress.streak >= 3 ? 'hot' : ''}`} title="Série">
            <span className="flame">🔥</span>{progress.streak}
          </div>
          <button className="hud-stats-btn" onClick={() => setShowStats(true)} title="Statistiques">📊</button>
        </div>
      </header>

      {/* Bouton révision (priorise les exercices dus) */}
      {revisionQueue.length > 0 && (
        <button
          className="revise-btn"
          style={dueToday > 0 ? { background: 'linear-gradient(135deg, var(--streak), #ff9147)', color: '#231004', boxShadow: '0 6px 18px rgba(255,122,61,.35)' } : undefined}
          onClick={() => { if (revisionQueue.length) { setSession(revisionQueue); setPos(0); } }}
        >
          {reviseLabel}<span className="revise-count">{reviseNum}</span>
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
