import { useMemo, useState } from 'react';
import { exercises } from './data';
import type { Domain, Topic, Difficulty, ExerciseType, Exercise, Lesson } from './engine/types';
import { ExerciseView } from './components/ExerciseView';
import { LevelUp } from './components/LevelUp';
import { Stats } from './components/Stats';
import { Courses } from './components/Courses';
import { LessonView } from './components/LessonView';
import { Library } from './components/Library';
import { ChapterView } from './components/ChapterView';
import { lessonForTopic } from './data/lessons';
import type { Chapter } from './data/library';
import {
  loadProgress, isMastered, resetProgress, levelInfo, isDue,
  XP_BY_DIFFICULTY, type Progress,
} from './store/progress';
import { FilterSheet } from './components/FilterSheet';
import { TOPIC_ICON, TOPIC_LABEL, DOMAIN_LABEL, DIFFICULTY_META, TYPE_LABEL } from './engine/meta';

type Tab = 'learn' | 'courses' | 'library' | 'stats';

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

/**
 * Session « mixte » (interleaving) : on panache les sujets en round-robin
 * pour qu'on tombe rarement deux fois de suite sur le même thème — la
 * pratique entrelacée grave mieux que les blocs d'un seul sujet.
 */
function buildMixedSession(pool: Exercise[], n = 20): Exercise[] {
  if (pool.length <= 1) return [...pool];
  const byTopic = new Map<Topic, Exercise[]>();
  for (const e of pool) {
    const arr = byTopic.get(e.topic) ?? [];
    arr.push(e);
    byTopic.set(e.topic, arr);
  }
  const groups = [...byTopic.values()];
  for (const g of groups) g.sort(() => Math.random() - 0.5);
  groups.sort(() => Math.random() - 0.5);
  const out: Exercise[] = [];
  let progressed = true;
  while (out.length < n && progressed) {
    progressed = false;
    for (const g of groups) {
      const e = g.pop();
      if (e) {
        out.push(e);
        progressed = true;
        if (out.length >= n) break;
      }
    }
  }
  return out;
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
  const [article, setArticle] = useState<Chapter | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  function reviewTopic(t: Topic) {
    const pool = exercises.filter((e) => e.topic === t);
    const q = buildRevision(progress, pool);
    if (q.length) { setSession(q); setPos(0); }
  }

  // ---- Chapitre de la Bibliothèque (lecture plein écran) ----
  if (article) {
    return <ChapterView chapter={article} onBack={() => setArticle(null)} />;
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

  const reviseNum = dueToday > 0 ? dueToday : revisionQueue.length;

  return (
    <>
      {tab === 'stats' && <div className="tab-body"><Stats progress={progress} onBack={() => setTab('learn')} onReviewTopic={reviewTopic} /></div>}
      {tab === 'courses' && <div className="tab-body"><Courses onOpen={setLesson} /></div>}
      {tab === 'library' && <div className="tab-body"><Library onOpen={setArticle} /></div>}

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
              className={`continue-card ${dueToday > 0 ? 'due' : ''}`}
              onClick={() => { setSession(revisionQueue); setPos(0); }}
            >
              <span className="cc-ico">{TOPIC_ICON[revisionQueue[0].topic]}</span>
              <span className="cc-body">
                <span className="cc-eyebrow">{dueToday > 0 ? '🔥 À réviser aujourd’hui' : 'Reprends ta série'}</span>
                <span className="cc-title">{TOPIC_LABEL[revisionQueue[0].topic]}</span>
                <span className="cc-sub"><b>{reviseNum}</b> exercice{reviseNum > 1 ? 's' : ''} à travailler</span>
              </span>
              <span className="cc-go" aria-hidden>→</span>
            </button>
          )}

          {filtered.length > 4 && (
            <button
              className="mixed-btn"
              onClick={() => { const s = buildMixedSession(filtered); if (s.length) { setSession(s); setPos(0); } }}
            >
              🔀 Série mixte <span className="mixed-count">{Math.min(20, filtered.length)}</span>
            </button>
          )}

          <div className="search-wrap">
            <span className="search-ico">🔎</span>
            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un sujet, une techno, une entreprise…" />
            {query && <button className="search-clear" onClick={() => setQuery('')}>✕</button>}
          </div>

          <div className="filterbar">
            <button className="filterbtn" onClick={() => setFiltersOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
              Filtres
              {activeFilters > 0 && <span className="filterbtn-badge">{activeFilters}</span>}
            </button>
            {domain !== 'all' && (
              <button className="fchip" onClick={() => { setDomain('all'); setTopic('all'); }}>
                {DOMAIN_LABEL[domain]} <span className="fchip-x">✕</span>
              </button>
            )}
            {topic !== 'all' && (
              <button className="fchip" onClick={() => setTopic('all')}>
                {TOPIC_ICON[topic]} {TOPIC_LABEL[topic]} <span className="fchip-x">✕</span>
              </button>
            )}
            {difficulty !== 'all' && (
              <button className="fchip" onClick={() => setDifficulty('all')}>
                {DIFFICULTY_META[difficulty].label} <span className="fchip-x">✕</span>
              </button>
            )}
            {exType !== 'all' && (
              <button className="fchip" onClick={() => setExType('all')}>
                {TYPE_LABEL[exType]} <span className="fchip-x">✕</span>
              </button>
            )}
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

          <div className="list xlist">
            {filtered.map((e) => {
              const done = isMastered(progress, e.id);
              const diff = DIFFICULTY_META[e.difficulty];
              return (
                <button key={e.id} className={`xrow ${done ? 'done' : ''}`}
                  onClick={() => { setSession([e]); setPos(0); }}>
                  <div className="xrow-ico">{TOPIC_ICON[e.topic]}</div>
                  <div className="xrow-body">
                    <div className="xrow-top">
                      <span className="xrow-title">{e.title}</span>
                      <span className="xrow-diff" style={{ background: `${diff.color}1f`, color: diff.color }}>{diff.label}</span>
                    </div>
                    <div className="xrow-meta">
                      <span className="xrow-xp">+{XP_BY_DIFFICULTY[e.difficulty]} XP</span>
                      <span className="xrow-dot">·</span>
                      <span>{TOPIC_LABEL[e.topic]}</span>
                      {e.company && <><span className="xrow-dot">·</span><span>{e.company}</span></>}
                    </div>
                  </div>
                  {done
                    ? <span className="xrow-check">✓</span>
                    : <span className="xrow-chev" aria-hidden>›</span>}
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
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}>
          <span className="nav-ico">📖</span><span className="nav-lbl">Lire</span>
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          <span className="nav-ico">📊</span><span className="nav-lbl">Stats</span>
        </button>
      </nav>

      {filtersOpen && (
        <FilterSheet
          onClose={() => setFiltersOpen(false)}
          exercises={exercises}
          domain={domain} setDomain={setDomain}
          topic={topic} setTopic={setTopic}
          difficulty={difficulty} setDifficulty={setDifficulty}
          exType={exType} setExType={setExType}
          resultCount={filtered.length}
          onReset={resetFilters}
        />
      )}

      {levelUpTo !== null && <LevelUp level={levelUpTo} onClose={() => setLevelUpTo(null)} />}
    </>
  );
}
