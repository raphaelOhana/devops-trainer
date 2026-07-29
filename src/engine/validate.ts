// ---------------------------------------------------------------------------
// Moteur de validation — 100 % hors-ligne, aucun appel réseau.
//
// Trois modes, tous pilotés par les données de l'exercice :
//   - mcq / find-error : comparaison d'index (trivial)
//   - write-config     : parsing YAML/JSON + assertions déclaratives
//
// Le mode « exécution réelle » (hadolint/kubeval en WASM) viendra en phase 3
// et s'branchera ici comme un mode supplémentaire, sans toucher au reste.
// ---------------------------------------------------------------------------

import yaml from 'js-yaml';
import type { Exercise, Assertion, ValidationResult } from './types';

/** Résout un chemin pointé ("spec.replicas", "a.0.b") dans un objet parsé. */
function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Applique une assertion à une valeur résolue. */
function checkAssertion(value: unknown, a: Assertion): boolean {
  if (a.exists !== undefined) return a.exists ? value !== undefined : value === undefined;
  if (value === undefined) return false;

  if (a.equals !== undefined) return value === a.equals;
  if (a.gte !== undefined) return typeof value === 'number' && value >= a.gte;
  if (a.lte !== undefined) return typeof value === 'number' && value <= a.lte;
  if (a.contains !== undefined) return String(value).includes(a.contains);
  if (a.matches !== undefined) {
    try {
      return new RegExp(a.matches).test(String(value));
    } catch {
      return false;
    }
  }
  return false;
}

/** Parse l'entrée utilisateur selon le langage. Renvoie null si illisible. */
function parseConfig(input: string, language: string): unknown {
  const text = input.trim();
  if (!text) return null;
  // Dockerfile / HCL : pas de structure clé-valeur exploitable → on valide le
  // texte brut via des assertions sur le chemin spécial "_raw" (avec matches).
  if (language === 'dockerfile' || language === 'hcl') {
    return { _raw: text };
  }
  try {
    if (language === 'json') return JSON.parse(text);
    // YAML couvre aussi le cas JSON (sur-ensemble) ; suffisant pour la validation.
    return yaml.load(text);
  } catch {
    return null;
  }
}

/**
 * Valide une tentative.
 * @param exercise l'exercice
 * @param answer   pour mcq/find-error : l'index choisi (number).
 *                 pour write-config   : le texte saisi (string).
 */
export function validate(exercise: Exercise, answer: number | string): ValidationResult {
  switch (exercise.type) {
    case 'mcq':
    case 'find-error': {
      const ok = answer === exercise.answer;
      return {
        passed: ok,
        score: ok ? 1 : 0,
        checks: [{ ok, label: ok ? 'Bonne réponse' : 'Mauvaise réponse' }],
      };
    }

    case 'write-config': {
      const parsed = parseConfig(String(answer), exercise.language);
      if (parsed == null) {
        return {
          passed: false,
          score: 0,
          checks: [{ ok: false, label: `${exercise.language.toUpperCase()} invalide ou vide — vérifie la syntaxe` }],
        };
      }
      const checks = exercise.assert.map((a) => ({
        ok: checkAssertion(resolvePath(parsed, a.path), a),
        label: a.msg,
      }));
      const passedCount = checks.filter((c) => c.ok).length;
      const score = checks.length === 0 ? 1 : passedCount / checks.length;
      return { passed: score === 1, score, checks };
    }
  }
}
