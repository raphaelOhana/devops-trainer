// ---------------------------------------------------------------------------
// Progression + gamification — persisté localement, 100 % hors-ligne.
//
// On récompense l'apprentissage : XP, niveaux, série (streak) de réussites.
// L'XP d'un exercice n'est gagné qu'à sa PREMIÈRE maîtrise (pas de farm),
// mais la série s'entretient à chaque bonne réponse pour l'effet « chaîne ».
// ---------------------------------------------------------------------------

import type { Difficulty } from '../engine/types';

export interface Attempt {
  exerciseId: string;
  bestScore: number;
  attempts: number;
  lastSeen: number;
}

export interface Progress {
  attempts: Record<string, Attempt>;
  xp: number;
  streak: number;
  bestStreak: number;
}

/** Récompense d'XP à la première maîtrise, selon la difficulté. */
export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  junior: 10,
  intermediate: 20,
  senior: 30,
};

/** Chaque niveau demande ce nombre d'XP (courbe linéaire, lisible). */
const XP_PER_LEVEL = 100;

const KEY = 'devops-trainer:progress:v2';
const empty: Progress = { attempts: {}, xp: 0, streak: 0, bestStreak: 0 };

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...empty, attempts: {} };
    const p = JSON.parse(raw) as Progress;
    return { ...empty, ...p, attempts: p.attempts ?? {} };
  } catch {
    return { ...empty, attempts: {} };
  }
}

function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / mode privé */
  }
}

export interface RecordResult {
  progress: Progress;
  xpGained: number;
  leveledUp: boolean;
  firstMastery: boolean;
}

/** Enregistre une tentative, met à jour XP + série, et renvoie les events pour l'UI. */
export function recordAttempt(
  exerciseId: string,
  score: number,
  difficulty: Difficulty
): RecordResult {
  const p = loadProgress();
  const prev = p.attempts[exerciseId];
  const wasMastered = (prev?.bestScore ?? 0) >= 1;
  const nowMastered = score >= 1;
  const firstMastery = !wasMastered && nowMastered;

  const levelBefore = levelFromXp(p.xp);

  // XP : uniquement à la première maîtrise.
  let xpGained = 0;
  if (firstMastery) {
    xpGained = XP_BY_DIFFICULTY[difficulty];
    p.xp += xpGained;
  }

  // Série : +1 si bonne réponse (score plein), sinon remise à zéro.
  if (score >= 1) {
    p.streak += 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
  } else {
    p.streak = 0;
  }

  p.attempts[exerciseId] = {
    exerciseId,
    bestScore: Math.max(prev?.bestScore ?? 0, score),
    attempts: (prev?.attempts ?? 0) + 1,
    lastSeen: Date.now(),
  };

  save(p);
  return {
    progress: p,
    xpGained,
    leveledUp: levelFromXp(p.xp) > levelBefore,
    firstMastery,
  };
}

export function resetProgress(): Progress {
  const fresh = { ...empty, attempts: {} };
  save(fresh);
  return fresh;
}

export function isMastered(p: Progress, exerciseId: string): boolean {
  return (p.attempts[exerciseId]?.bestScore ?? 0) >= 1;
}

// ----- Dérivés de gamification -----

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export interface LevelInfo {
  level: number;
  xpInLevel: number;
  xpForLevel: number;
  progressPct: number;
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelFromXp(xp);
  const xpInLevel = xp % XP_PER_LEVEL;
  return {
    level,
    xpInLevel,
    xpForLevel: XP_PER_LEVEL,
    progressPct: Math.round((xpInLevel / XP_PER_LEVEL) * 100),
  };
}
