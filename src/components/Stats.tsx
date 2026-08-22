import { useMemo } from 'react';
import { exercises } from '../data';
import type { Domain, Topic } from '../engine/types';
import { isMastered, isDue, levelInfo, type Progress } from '../store/progress';
import { TOPIC_ICON, TOPIC_LABEL, DOMAIN_LABEL, DOMAIN_COLOR } from '../engine/meta';

// Écran « Ta maîtrise » : vue d'ensemble + carte de compétences par sujet
// (Novice / Confirmé / Expert) et sujets à revoir en priorité.

interface Props {
  progress: Progress;
  onBack: () => void;
  /** Lancer une session de révision ciblée sur un sujet. */
  onReviewTopic?: (t: Topic) => void;
}

interface TopicStat {
  topic: Topic;
  total: number;
  done: number;
  attempted: number;
  due: number;
  pct: number;
}

function levelOf(pct: number): { label: string; cls: string; color: string } {
  if (pct >= 75) return { label: 'Expert', cls: 'exp', color: 'var(--green)' };
  if (pct >= 40) return { label: 'Confirmé', cls: 'conf', color: 'var(--blue)' };
  return { label: 'Novice', cls: 'nov', color: 'var(--text-dim)' };
}

export function Stats({ progress, onBack, onReviewTopic }: Props) {
  const lvl = levelInfo(progress.xp);

  const byDomain = useMemo(() => {
    const map = new Map<Domain, { total: number; done: number }>();
    for (const e of exercises) {
      const cur = map.get(e.domain) ?? { total: 0, done: 0 };
      cur.total++;
      if (isMastered(progress, e.id)) cur.done++;
      map.set(e.domain, cur);
    }
    return [...map.entries()];
  }, [progress]);

  const topics = useMemo(() => {
    const map = new Map<Topic, TopicStat>();
    const now = Date.now();
    for (const e of exercises) {
      const cur = map.get(e.topic) ?? { topic: e.topic, total: 0, done: 0, attempted: 0, due: 0, pct: 0 };
      cur.total++;
      const a = progress.attempts[e.id];
      if (isMastered(progress, e.id)) cur.done++;
      if ((a?.attempts ?? 0) > 0) cur.attempted++;
      if (isDue(progress, e.id, now)) cur.due++;
      map.set(e.topic, cur);
    }
    const list = [...map.values()];
    list.forEach((s) => { s.pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100); });
    return list;
  }, [progress]);

  const skillMap = useMemo(() => [...topics].sort((a, b) => b.pct - a.pct), [topics]);
  const toReview = useMemo(
    () => topics.filter((s) => s.attempted > 0 && s.pct < 70).sort((a, b) => a.pct - b.pct).slice(0, 4),
    [topics],
  );

  const totalDone = topics.reduce((n, s) => n + s.done, 0);
  const globalPct = exercises.length === 0 ? 0 : Math.round((totalDone / exercises.length) * 100);

  return (
    <div className="app">
      <div className="ex-head">
        <button className="icon-btn" onClick={onBack}>←</button>
        <div className="lesson-htitle">📊 Ta maîtrise</div>
      </div>

      {/* Tuiles clés */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--green-d)' }}>{totalDone}</div>
          <div className="stat-lbl">Exercices maîtrisés</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--blue-d)' }}>{globalPct}%</div>
          <div className="stat-lbl">Progression globale</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--orange)' }}>🔥 {progress.bestStreak}</div>
          <div className="stat-lbl">Série record</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--purple)' }}>{progress.xp}</div>
          <div className="stat-lbl">XP · niveau {lvl.level}</div>
        </div>
      </div>

      {/* À revoir en priorité */}
      {toReview.length > 0 && (
        <>
          <h3 className="stat-h3">À revoir en priorité</h3>
          <div className="review-list">
            {toReview.map((s) => (
              <div key={s.topic} className="review-row">
                <span className="review-ico">{TOPIC_ICON[s.topic]}</span>
                <div className="review-body">
                  <div className="review-name">{TOPIC_LABEL[s.topic]}</div>
                  <div className="review-meta">{s.pct}% maîtrisé{s.due > 0 ? ` · ${s.due} à réviser` : ''}</div>
                </div>
                {onReviewTopic && (
                  <button className="review-go" onClick={() => onReviewTopic(s.topic)}>Réviser</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Carte de compétences */}
      <h3 className="stat-h3">Carte de compétences</h3>
      <div className="skill-list">
        {skillMap.map((s) => {
          const L = levelOf(s.pct);
          return (
            <button
              key={s.topic}
              className="skill-row"
              onClick={onReviewTopic ? () => onReviewTopic(s.topic) : undefined}
            >
              <span className="skill-ico">{TOPIC_ICON[s.topic]}</span>
              <span className="skill-body">
                <span className="skill-top">
                  <span className="skill-name">{TOPIC_LABEL[s.topic]}</span>
                  <span className={`skill-lvl ${L.cls}`}>{L.label}</span>
                </span>
                <span className="skill-barwrap">
                  <span className="skill-bar"><i style={{ width: `${s.pct}%`, background: L.color }} /></span>
                  <span className="skill-pct" style={{ color: L.color }}>{s.pct}%</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Par domaine (repère rapide) */}
      <h3 className="stat-h3">Par domaine</h3>
      {byDomain.map(([d, s]) => {
        const p = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
        return (
          <div key={d} className="bar-row">
            <div className="bar-head">
              <span>{DOMAIN_LABEL[d]}</span>
              <span className="bar-val">{s.done}/{s.total}</span>
            </div>
            <div className="bar"><i style={{ width: `${p}%`, background: DOMAIN_COLOR[d] }} /></div>
          </div>
        );
      })}

      <div style={{ height: 40 }} />
    </div>
  );
}
