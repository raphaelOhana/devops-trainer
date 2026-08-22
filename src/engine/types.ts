// ---------------------------------------------------------------------------
// Modèle de données des exercices.
//
// Principe directeur : un exercice EST une donnée (objet), jamais du code.
// Ajouter un exercice = ajouter un objet dans src/data/. Le moteur de
// validation lit ces objets ; il n'a jamais besoin d'être modifié pour du
// nouveau contenu. C'est ce qui rend le catalogue extensible à l'infini.
// ---------------------------------------------------------------------------

export type Domain = 'devops' | 'iot' | 'web' | 'software';

export type Topic =
  | 'docker'
  | 'kubernetes'
  | 'ci-cd'
  | 'terraform'
  | 'monitoring'
  | 'linux'
  | 'git'
  | 'networking'
  | 'security'
  | 'architecture'
  | 'design-patterns'
  | 'iot-edge'
  | 'frontend'
  | 'backend'
  | 'appsec'
  | 'algorithms'
  | 'system-design'
  | 'languages'
  | 'memory-safety'
  | 'problem-solving'
  | 'ai-llm'
  | 'hardware'
  | 'secure-review'
  | 'cloud-arch'
  | 'databases'
  | 'performance'
  | 'mcp'
  | 'interview'
  | 'reversing';

export type Difficulty = 'junior' | 'intermediate' | 'senior';

/** Champs communs à tout exercice. */
interface BaseExercise {
  id: string;
  domain: Domain;
  topic: Topic;
  difficulty: Difficulty;
  /** Titre court affiché dans les listes. */
  title: string;
  /** Entreprise fictive du cas concret (NASA, Tesla, Amazon…), optionnel. */
  company?: string;
  /** Mise en situation narrative. */
  scenario?: string;
  /** Explication pédagogique montrée APRÈS la réponse (markdown léger). */
  explanation: string;
  /** Étiquettes libres pour la recherche. */
  tags?: string[];
  /**
   * Feedback par option (QCM / trouve-l'erreur) : une phrase courte par
   * option, dans le même ordre que `options`. Montré après la réponse
   * (pourquoi la bonne est juste / pourquoi chaque distracteur est faux).
   * Optionnel : l'UI dégrade proprement s'il est absent.
   */
  optionNotes?: string[];
}

/** QCM à choix unique. */
export interface McqExercise extends BaseExercise {
  type: 'mcq';
  question: string;
  options: string[];
  /** Index de la bonne réponse dans `options`. */
  answer: number;
}

/** « Trouve l'erreur » : un bloc de code fautif, l'utilisateur choisit le problème. */
export interface FindErrorExercise extends BaseExercise {
  type: 'find-error';
  question: string;
  /** Le bloc de code/config présenté. */
  code: string;
  language:
    | 'dockerfile' | 'yaml' | 'bash' | 'hcl' | 'json'
    | 'typescript' | 'javascript' | 'c' | 'python' | 'php' | 'sql'
    | 'go' | 'java' | 'nginx' | 'rust';
  options: string[];
  answer: number;
}

/**
 * Une assertion de validation appliquée à la config écrite par l'utilisateur.
 * `path` est un chemin pointé dans l'objet YAML/JSON parsé
 * (ex. "spec.replicas", "spec.template.spec.containers.0.image").
 */
export interface Assertion {
  path: string;
  /** Un seul opérateur par assertion. */
  equals?: string | number | boolean;
  gte?: number;
  lte?: number;
  /** La valeur (convertie en chaîne) doit contenir cette sous-chaîne. */
  contains?: string;
  /** La valeur (convertie en chaîne) doit correspondre à cette regex. */
  matches?: string;
  /** Le chemin doit simplement exister (n'importe quelle valeur). */
  exists?: boolean;
  /** Message affiché quand l'assertion échoue (feedback pédagogique). */
  msg: string;
}

/**
 * « Écris la config » : l'utilisateur saisit du YAML/Dockerfile/JSON,
 * validé par une liste d'assertions déclaratives (aucun code de validation
 * spécifique à l'exercice).
 */
export interface WriteConfigExercise extends BaseExercise {
  type: 'write-config';
  prompt: string;
  language: 'yaml' | 'dockerfile' | 'json' | 'hcl';
  /** Squelette pré-rempli dans l'éditeur (optionnel). */
  starter?: string;
  /** Règles à satisfaire. Le score = assertions réussies / total. */
  assert: Assertion[];
  /** Une solution de référence, révélée à la demande. */
  solution: string;
}

export type Exercise =
  | McqExercise
  | FindErrorExercise
  | WriteConfigExercise;

export type ExerciseType = Exercise['type'];

// ---------------------------------------------------------------------------
// Cours (leçons). Chaque leçon est reliée à un `topic` : depuis un exercice,
// on ouvre le cours de son sujet (notamment après un échec).
// ---------------------------------------------------------------------------

export interface LessonSection {
  heading: string;
  /** Corps en markdown léger (titres ###, listes -, code ``` ```, **gras**, `code`). */
  body: string;
}

export interface Lesson {
  /** Identifiant unique de la leçon. */
  key: string;
  /** Sujet associé (permet le lien exercice → cours). */
  topic: Topic;
  title: string;
  /** Emoji d'illustration. */
  icon: string;
  intro: string;
  sections: LessonSection[];
}

/** Résultat d'une tentative, produit par le moteur de validation. */
export interface ValidationResult {
  /** Vrai si l'exercice est considéré comme réussi. */
  passed: boolean;
  /** Score partiel entre 0 et 1 (1 = tout bon). */
  score: number;
  /** Détail ligne par ligne, pour le feedback (write-config surtout). */
  checks: { ok: boolean; label: string }[];
}
