import { useMemo } from 'react';
import { exercises } from '../data';
import type { Domain, Topic } from '../engine/types';
import { isMastered, levelInfo, type Progress } from '../store/progress';
import { TOPIC_ICON, DOMAIN_LABEL, DOMAIN_COLOR } from '../engine/meta';

// Écran de statistiques : vue d'ensemble de la progression, par domaine et par
// sujet, pour repérer ses points faibles.

interface Props {
  progress: Progress;
  onBack: () => void;
}

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function Stats({ progress, onBack }: Props) {
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

  const byTopic = useMemo(() => {
    const map = new Map<Topic, { total: number; done: number }>();
    for (const e of exercises) {
      const cur = map.get(e.topic) ?? { total: 0, done: 0 };
      cur.total++;
      if (isMastered(progress, e.id)) cur.done++;
      map.set(e.topic, cur);
    }
    // Trié par taux de maîtrise croissant : les points faibles en premier.
    return [...map.entries()].sort((a, b) => pct(a[1].done, a[1].total) - pct(b[1].done, b[1].total));
  }, [progress]);

  const totalDone = exercises.filter((e) => isMastered(progress, e.id)).length;

  return (
    <div className="app">
      <div className="ex-head">
        <button className="icon-btn" onClick={onBack}>←</button>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>📊 Mes statistiques</h1>
      </div>

      {/* Cartes clés */}
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--xp)' }}>{lvl.level}</div>
          <div className="stat-lbl">Niveau</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--blue)' }}>{progress.xp}</div>
          <div className="stat-lbl">XP total</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--streak)' }}>🔥{progress.bestStreak}</div>
          <div className="stat-lbl">Série record</div>
        </div>
        <div className="stat-tile">
          <div className="stat-big" style={{ color: 'var(--green)' }}>{pct(totalDone, exercises.length)}%</div>
          <div className="stat-lbl">{totalDone}/{exercises.length} maîtrisés</div>
        </div>
      </div>

      {/* Par domaine */}
      <h3 className="stat-h3">Par domaine</h3>
      {byDomain.map(([d, s]) => (
        <div key={d} className="bar-row">
          <div className="bar-head">
            <span>{DOMAIN_LABEL[d]}</span>
            <span className="bar-val">{s.done}/{s.total}</span>
          </div>
          <div className="bar"><i style={{ width: `${pct(s.done, s.total)}%`, background: DOMAIN_COLOR[d] }} /></div>
        </div>
      ))}

      {/* Par sujet — points faibles en haut */}
      <h3 className="stat-h3">Par sujet <span className="stat-hint">(points faibles en premier)</span></h3>
      {byTopic.map(([t, s]) => (
        <div key={t} className="bar-row">
          <div className="bar-head">
            <span>{TOPIC_ICON[t]} {t}</span>
            <span className="bar-val">{s.done}/{s.total}</span>
          </div>
          <div className="bar">
            <i style={{ width: `${pct(s.done, s.total)}%`, background: pct(s.done, s.total) < 50 ? 'var(--amber)' : 'var(--green)' }} />
          </div>
        </div>
      ))}

      <div style={{ height: 40 }} />
    </div>
  );
}
