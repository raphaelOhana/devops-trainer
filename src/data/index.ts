import { exercises as baseExercises } from './exercises';
import { realWorldExercises } from './exercises-realworld';
import type { Exercise } from '../engine/types';

// Catalogue complet = lot fondamental + lot « cas réels ».
// Ajouter un fichier de contenu ici suffit à l'intégrer dans l'app.
export const exercises: Exercise[] = [...baseExercises, ...realWorldExercises];
