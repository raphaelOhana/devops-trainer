import { useMemo, useState } from 'react';
import { exercises } from './data';
import type { Domain, Topic, Difficulty, ExerciseType, Exercise, Lesson } from './engine/types';
import { ExerciseView } from './components/ExerciseView';
import { LevelUp } from './components/LevelUp';
import { Stats } from './components/Stats';
import { Courses } from './components/Courses';
import { LessonView } from './components/LessonView';
import { lessonForTopic } from './data/lessons';
import {
  loadProgress, isMastered, resetProgress, levelInfo, isDue,
  XP_BY_DIFFICULTY, type Progress,
} from './store/progress';
import { TOPIC_ICON, TOPIC_LABEL, DOMAIN_LABEL, DOMAIN_COLOR, DIFFICULTY_META, TYPE_LABEL } from './engine/meta';

const DOMAINS: (Domain | 'all')[] = ['all', 'devops', 'software', 'web', 'iot'];
const DIFFICULTIES: (Difficulty | 'all')[] = ['all', 'junior', 'intermediate', 'senior'];
const TYPES: (ExerciseType | 'all')[] = ['all', 'mcq', 'find-error', 'write-config'];

type Tab = 'learn' | 'courses' | 'stats';

/**
 * Session de révision espacée : d'abord les exercices « dus » (dont les
 * maîtrisés à ré-ancrer), puis les ratés récents, puis les nouveaux.
 */
function buildRevision(p: Progress, pool: Exercise[]): Exercise[] {
  const now = Date.now();
  const due = pool.filter((e) => isDue(p, e.id, now));
  const failed = pool.filter((e) => !isDue(p, e.id, now) && !isMastered(p, e.id) && (p.attempts[e.id]?.attempts ?? 0) > 0);
  const fresh = pool.filter((e) => (p.attempts[e.id]?.attempts ?? 0) === 0);
  due.sort((a, b) => (p.attempts[a.id]?.dueAt ?? 0) - (p.attempts[b.id]?.dueAt ?? 0));
  return [...due, ...failed, ...fresh];
}

export default function App() {
  const [tab, setTab] = useState<Tab>('learn');
  const [domain, setDomain] = useState<Domain | 'all'>('all');
  const [topic, setTopic] = useState<Topic | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [exType, setExType] = useState<ExerciseType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [levelUpTo, setLevelUpTo] = useState<number | null>(null);
  const [session, setSession] = useState<Exercise[] | null>(null);
  const [pos, setPos] = useState(0);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const topicsInDomain = useMemo(() => {
    const pool = domain === 'all' ? exercises : exercises.filter((e) => e.domain === domain);
    const counts = new Map<Topic, number>();
    pool.forEach((e) => counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [domain]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) =>
      (domain === 'all' || e.domain === domain) &&
      (topic === 'all' || e.topic === topic) &&
      (difficulty === 'all' || e.difficulty === difficulty) &&
      (exType === 'all' || e.type === exType) &&
      (q === '' ||
        e.title.toLowerCase().includes(q) ||
        (e.company ?? '').toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q)))
    );
  }, [domain, topic, difficulty, exType, query]);

  const activeFilters = (domain !== 'all' ? 1 : 0) + (topic !== 'all' ? 1 : 0) +
    (difficulty !== 'all' ? 1 : 0) + (exType !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0);
  function resetFilters() {
    setDomain('all'); setTopic('all'); setDifficulty('all'); setExType('all'); setQuery('');
  }
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
  function openLessonForTopic(t: Topic) {
    const l = lessonForTopic(t);
    if (l) setLesson(l);
  }
  function practiceLesson(l: Lesson) {
    const pool = exercises.filter((e) => e.topic === l.topic);
    if (pool.length) { setSession(pool); setPos(0); setLesson(null); setTab('learn'); }
  }

  // ---- Leçon (prioritaire : peut être ouverte depuis un exercice) ----
  if (lesson) {
    return (
      <LessonView
        lesson={lesson}
        onBack={() => setLesson(null)}
        onPractice={exercises.some((e) => e.topic === lesson.topic) ? () => practiceLesson(lesson) : undefined}
      />
    );
  }

  // ---- Exercice (dans une session) ----
  if (session && session[pos]) {
    const cur = session[pos];
    return (
      <>
        <ExerciseView
          key={cur.id}
          exercise={cur}
          position={session.length > 1 ? { current: pos + 1, total: session.length } : undefined}
          onBack={() => { setSession(null); setPos(0); }}
          onNext={nextInSession}
          onResult={handleResult}
          onOpenLesson={lessonForTopic(cur.topic) ? () => openLessonForTopic(cur.topic) : undefined}
        />
        {levelUpTo !== null && <LevelUp level={levelUpTo} onClose={() => setLevelUpTo(null)} />}
      </>
    );
  }

  const reviseLabel = dueToday > 0 ? '🔥 À réviser aujourd\'hui' : '🎯 Réviser mes lacunes';
  const reviseNum = dueToday > 0 ? dueToday : revisionQueue.length;

  return (
    <>
      {tab === 'stats' && <div className="tab-body"><Stats progress={progress} onBack={() => setTab('learn')} /></div>}
      {tab === 'courses' && <div className="tab-body"><Courses onOpen={setLesson} /></div>}

      {tab === 'learn' && (
        <div className="app tab-body">
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
            </div>
          </header>

          {revisionQueue.length > 0 && (
            <button
              className="revise-btn"
              style={dueToday > 0 ? { background: 'linear-gradient(135deg, var(--streak), #ff9147)', color: '#231004', boxShadow: '0 6px 18px rgba(255,122,61,.35)' } : undefined}
              onClick={() => { if (revisionQueue.length) { setSession(revisionQueue); setPos(0); } }}
            >
              {reviseLabel}<span className="revise-count">{reviseNum}</span>
            </button>
          )}

          <div className="search-wrap">
            <span className="search-ico">🔎</span>
            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un sujet, une techno, une entreprise…" />
            {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
          </div>

          <div className="filters" aria-label="Domaine">
            {DOMAINS.map((d) => {
              const active = domain === d;
              const color = d === 'all' ? '#4f8cff' : DOMAIN_COLOR[d];
              return (
                <button key={d} className={`chip ${active ? 'active' : ''}`}
                  style={active ? { background: color } : undefined}
                  onClick={() => { setDomain(d); setTopic('all'); }}>
                  {d === 'all' ? '⭐ Tout' : DOMAIN_LABEL[d]}
                </button>
              );
            })}
          </div>

          <div className="filters scroll-x" aria-label="Sujet">
            <button className={`chip sm ${topic === 'all' ? 'active' : ''}`} onClick={() => setTopic('all')}>
              Tous les sujets
            </button>
            {topicsInDomain.map((t) => (
              <button key={t} className={`chip sm ${topic === t ? 'active' : ''}`} onClick={() => setTopic(t)}>
                {TOPIC_ICON[t]} {TOPIC_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="filters scroll-x" aria-label="Difficulté et type">
            {DIFFICULTIES.map((d) => (
              <button key={d} className={`chip sm ${difficulty === d ? 'active' : ''}`}
                style={difficulty === d && d !== 'all' ? { background: DIFFICULTY_META[d].color, color: '#fff' } : undefined}
                onClick={() => setDifficulty(d)}>
                {d === 'all' ? 'Toute difficulté' : DIFFICULTY_META[d].label}
              </button>
            ))}
            {TYPES.map((t) => (
              <button key={t} className={`chip sm ${exType === t ? 'active' : ''}`} onClick={() => setExType(t)}>
                {t === 'all' ? 'Tout format' : TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="list-meta">
            <span>
              <b>{filtered.length}</b> exercice{filtered.length > 1 ? 's' : ''}
              {activeFilters === 0 && <> · {masteredCount} maîtrisés · record 🔥 {progress.bestStreak}</>}
            </span>
            {activeFilters > 0 ? (
              <button className="link-blue" onClick={resetFilters}>✕ effacer ({activeFilters})</button>
            ) : progress.xp > 0 && (
              <button className="link-dim" onClick={() => { if (confirm('Réinitialiser toute la progression ?')) setProgress(resetProgress()); }}>↺ reset</button>
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
      )}

      {/* Barre de navigation basse */}
      <nav className="bottom-nav">
        <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>
          <span className="nav-ico">🎯</span><span className="nav-lbl">Apprendre</span>
        </button>
        <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>
          <span className="nav-ico">📚</span><span className="nav-lbl">Cours</span>
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <span className="nav-ico">📊</span><span className="nav-lbl">Stats</span>
        </button>
      </nav>

      {levelUpTo !== null && <LevelUp level={levelUpTo} onClose={() => setLevelUpTo(null)} />}
    </>
  );
}
