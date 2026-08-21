import { exercises as baseExercises } from './exercises';
import { realWorldExercises } from './exercises-realworld';
import { extraExercises } from './exercises-extra';
import { practiceExercises } from './exercises-practice';
import { securityExercises } from './exercises-security';
import { logicExercises } from './exercises-logic';
import { algoExercises } from './exercises-algo';
import { reviewExercises } from './exercises-review';
import { sysDesignExercises } from './exercises-sysdesign';
import { sysDesign2Exercises } from './exercises-sysdesign2';
import { algo2Exercises } from './exercises-algo2';
import { security2Exercises } from './exercises-security2';
import { appsecExercises } from './exercises-appsec';
import { designExercises } from './exercises-design';
import { cveExercises } from './exercises-cve';
import { gotchaExercises } from './exercises-gotchas';
import { cloudExercises } from './exercises-cloud';
import { sreExercises } from './exercises-sre';
import { memoryExercises } from './exercises-memory';
import { ops2Exercises } from './exercises-ops2';
import { problemSolvingExercises } from './exercises-problem-solving';
import { aiLlmExercises } from './exercises-ai-llm';
import { hardwareExercises } from './exercises-hardware';
import { secureReviewExercises } from './exercises-secure-review';
import { cloudArchExercises } from './exercises-cloud-arch';
import { databasesExercises } from './exercises-databases';
import { performanceExercises } from './exercises-performance';
import { mcpExercises } from './exercises-mcp';
import { shuffleAll } from './shuffle';
import type { Exercise } from '../engine/types';

// Catalogue complet. Ajouter un fichier de contenu ici suffit à l'intégrer.
// `shuffleAll` permute l'ordre des options (anti-triche) de façon déterministe.
export const exercises: Exercise[] = shuffleAll([
  ...baseExercises,
  ...realWorldExercises,
  ...extraExercises,
  ...practiceExercises,
  ...securityExercises,
  ...logicExercises,
  ...algoExercises,
  ...reviewExercises,
  ...sysDesignExercises,
  ...sysDesign2Exercises,
  ...algo2Exercises,
  ...security2Exercises,
  ...appsecExercises,
  ...designExercises,
  ...cveExercises,
  ...gotchaExercises,
  ...cloudExercises,
  ...sreExercises,
  ...memoryExercises,
  ...ops2Exercises,
  ...problemSolvingExercises,
  ...aiLlmExercises,
  ...hardwareExercises,
  ...secureReviewExercises,
  ...cloudArchExercises,
  ...databasesExercises,
  ...performanceExercises,
  ...mcpExercises,
]);
