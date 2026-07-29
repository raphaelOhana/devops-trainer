import { exercises as baseExercises } from './exercises';
import { realWorldExercises } from './exercises-realworld';
import { extraExercises } from './exercises-extra';
import { practiceExercises } from './exercises-practice';
import { securityExercises } from './exercises-security';
import { logicExercises } from './exercises-logic';
import { algoExercises } from './exercises-algo';
import { reviewExercises } from './exercises-review';
import type { Exercise } from '../engine/types';

// Catalogue complet. Ajouter un fichier de contenu ici suffit à l'intégrer.
export const exercises: Exercise[] = [
  ...baseExercises,
  ...realWorldExercises,
  ...extraExercises,
  ...practiceExercises,
  ...securityExercises,
  ...logicExercises,
  ...algoExercises,
  ...reviewExercises,
];
