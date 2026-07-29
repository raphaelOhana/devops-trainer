import { useState } from 'react';
import type { Exercise, ValidationResult } from '../engine/types';
import { validate } from '../engine/validate';
import { recordAttempt, type RecordResult } from '../store/progress';
import { Markdown } from './Markdown';
import { Confetti } from './Confetti';
import { TOPIC_ICON, DIFFICULTY_META, TYPE_LABEL, DOMAIN_COLOR } from '../engine/meta';

interface Props {
  exercise: Exercise;
  onBack: () => void;
  onResult: (rec: RecordResult) => void;
}

const PASS_MSGS = ['Bravo ! 🎉', 'Excellent ! 💪', 'Nickel ! ✨', 'Parfait ! 🚀', 'Bien joué ! 🔥'];
const FAIL_MSGS = ['Presque !', 'Pas tout à fait', 'On réessaie ?', 'Courage !'];

export function ExerciseView({ exercise, onBack, onResult }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState(exercise.type === 'write-config' ? exercise.starter ?? '' : '');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [rec, setRec] = useState<RecordResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  const isChoice = exercise.type === 'mcq' || exercise.type === 'find-error';
  const diff = DIFFICULTY_META[exercise.difficulty];

  function submit(answer: number | string) {
    const r = validate(exercise, answer);
    const record = recordAttempt(exercise.id, r.score, exercise.difficulty);
    setResult(r);
    setRec(record);
    onResult(record);
  }

  function retry() {
    setResult(null);
    setRec(null);
    setPicked(null);
    setShowSolution(false);
  }

  const passed = result?.passed ?? false;
  const canSubmit = isChoice ? picked !== null : text.trim().length > 0;

  return (
    <div className="app ex">
      {passed && <Confetti />}

      {/* Header */}
      <div className="ex-head">
        <button className="icon-btn" onClick={onBack}>←</button>
        <div className="ex-progress"><i style={{ width: result ? '100%' : '35%' }} /></div>
      </div>

      <div className="chip-line">
        <span className="tag">{TOPIC_ICON[exercise.topic]} {exercise.topic}</span>
        <span className="tag" style={{ color: diff.color }}>{diff.label}</span>
        <span className="tag">{TYPE_LABEL[exercise.type]}</span>
      </div>

      {exercise.scenario && (
        <div className="scenario">
          <div className="avatar" style={{ background: `${DOMAIN_COLOR[exercise.domain]}22` }}>
            {exercise.company ? '🏢' : '💡'}
          </div>
          <div>
            {exercise.company && <div className="who" style={{ color: DOMAIN_COLOR[exercise.domain] }}>{exercise.company}</div>}
            <div className="txt">{exercise.scenario}</div>
          </div>
        </div>
      )}

      <h1 className="qtitle">{exercise.title}</h1>

      {exercise.type === 'mcq' && <p className="qtext">{exercise.question}</p>}
      {exercise.type === 'find-error' && (
        <>
          <p className="qtext">{exercise.question}</p>
          <pre className="code">{exercise.code}</pre>
        </>
      )}
      {exercise.type === 'write-config' && <p className="qtext">{exercise.prompt}</p>}

      {/* Réponses */}
      {isChoice && (
        <div className="options">
          {exercise.options.map((opt, i) => {
            let cls = 'opt';
            if (result) {
              if (i === exercise.answer) cls += ' correct';
              else if (i === picked) cls += ' wrong';
            } else if (i === picked) cls += ' picked';
            return (
              <button key={i} className={cls} disabled={!!result} onClick={() => setPicked(i)}>
                <span className="letter">{String.fromCharCode(65 + i)}</span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
      )}

      {exercise.type === 'write-config' && (
        <textarea
          className="editor"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ta config ${exercise.language.toUpperCase()}…`}
          disabled={passed}
        />
      )}

      {/* Résultat + explication */}
      {result && (
        <div className="rise">
          <div className={`result-card ${passed ? 'pass' : 'fail'}`}>
            <div className="result-head">
              <span className="result-emoji">{passed ? '🎉' : '🤔'}</span>
              <div>
                <div className="result-title">
                  {passed ? PASS_MSGS[exercise.id.length % PASS_MSGS.length] : `${Math.round(result.score * 100)}%`}
                </div>
                <div className="result-sub">
                  {passed ? 'Réponse correcte' : FAIL_MSGS[exercise.id.length % FAIL_MSGS.length]}
                </div>
              </div>
            </div>

            {exercise.type === 'write-config' && (
              <div className="checks">
                {result.checks.map((c, i) => (
                  <div key={i} className={`check ${c.ok ? 'ok' : 'ko'}`}>
                    <b>{c.ok ? '✓' : '✗'}</b><span>{c.label}</span>
                  </div>
                ))}
              </div>
            )}

            {rec && rec.xpGained > 0 && (
              <div className="xp-toast">⚡ +{rec.xpGained} XP{rec.leveledUp ? ' · Niveau supérieur !' : ''}</div>
            )}
          </div>

          <div className="explain">
            <h3>💡 Explication</h3>
            <Markdown text={exercise.explanation} />
          </div>

          {exercise.type === 'write-config' && (
            <div className="explain solution">
              <button className="btn ghost solution-btn" style={{ width: '100%' }} onClick={() => setShowSolution((s) => !s)}>
                {showSolution ? 'Masquer' : '👀 Voir'} la solution de référence
              </button>
              {showSolution && <pre>{exercise.solution}</pre>}
            </div>
          )}
        </div>
      )}

      {/* Dock d'action sticky */}
      <div className="dock">
        <div className="inner">
          {!result && (
            <button className="btn" disabled={!canSubmit} onClick={() => submit(isChoice ? picked! : text)}>
              Valider
            </button>
          )}
          {result && !passed && (
            <>
              <button className="btn ghost" onClick={onBack}>Quitter</button>
              <button className="btn" onClick={retry}>Réessayer</button>
            </>
          )}
          {result && passed && (
            <button className="btn success" onClick={onBack}>Continuer →</button>
          )}
        </div>
      </div>
    </div>
  );
}
