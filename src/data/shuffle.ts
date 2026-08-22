import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Anti-triche : mélange DÉTERMINISTE des options.
//
// Problème : si la bonne réponse est toujours à la même position (souvent « B »),
// on la devine sans savoir. On permute donc l'ordre des options de chaque QCM /
// « trouve l'erreur », en remappant l'index de la bonne réponse.
//
// Le mélange est SEEDÉ par l'id de l'exercice → il est stable : la même question
// montre toujours le même ordre (pas de saut d'un affichage à l'autre), mais
// l'ordre varie d'une question à l'autre. Aucune dépendance à Math.random :
// tout est reproductible (utile pour la révision espacée et les tests).
// ---------------------------------------------------------------------------

/** Hash FNV-1a 32 bits d'une chaîne → graine du générateur. */
function hashStr(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** LCG (générateur congruentiel linéaire) seedé → suite pseudo-aléatoire reproductible. */
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Ordre de permutation (Fisher-Yates seedé) : indices anciens dans le nouvel ordre. */
function shuffledOrder(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rand = makeRand(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * Renvoie l'exercice avec ses options permutées et son `answer` remappé.
 * `salt` décale la graine (utilisé par la passe anti-série).
 */
function withShuffledOptions(ex: Exercise, salt = 0): Exercise {
  if (ex.type !== 'mcq' && ex.type !== 'find-error') return ex;
  const seed = hashStr(salt ? `${ex.id}#${salt}` : ex.id);
  const order = shuffledOrder(ex.options.length, seed);
  const options = order.map((i) => ex.options[i]);
  const answer = order.indexOf(ex.answer); // nouvelle position de la bonne réponse
  return { ...ex, options, answer };
}

/**
 * Applique le mélange à tout le catalogue, avec une passe « anti-série » :
 * on évite que 3 bonnes réponses tombent à la même position d'affilée
 * (sinon, en parcourant un sujet, on a l'illusion que « c'est toujours A »).
 * Reste déterministe : la graine ne dépend que de l'id (+ un sel stable).
 */
export function shuffleAll(list: Exercise[]): Exercise[] {
  const out: Exercise[] = [];
  let prev = -1; // position de la bonne réponse précédente
  let run = 1; // longueur de la série courante
  for (const ex of list) {
    if (ex.type !== 'mcq' && ex.type !== 'find-error') {
      out.push(ex);
      prev = -1; run = 1;
      continue;
    }
    // Si on s'apprête à faire une 3e même position d'affilée, on re-sale
    // jusqu'à changer de position (au plus 8 essais, sinon on laisse).
    let s = withShuffledOptions(ex, 0) as Exercise & { answer: number };
    let salt = 1;
    while (s.answer === prev && run >= 2 && salt <= 8) {
      s = withShuffledOptions(ex, salt++) as Exercise & { answer: number };
    }
    if (s.answer === prev) run += 1;
    else { run = 1; prev = s.answer; }
    out.push(s);
  }
  return out;
}
