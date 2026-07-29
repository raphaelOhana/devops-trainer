import { exercises as baseExercises } from './exercises';
import { realWorldExercises } from './exercises-realworld';
import { extraExercises } from './exercises-extra';
import type { Exercise } from '../engine/types';

// Catalogue complet = fondamental + cas réels + lot complémentaire.
// Ajouter un fichier de contenu ici suffit à l'intégrer dans l'app.
export const exercises: Exercise[] = [
  ...baseExercises,
  ...realWorldExercises,
  ...extraExercises,
];
