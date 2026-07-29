import type { Domain, Topic, Difficulty } from './types';

// Métadonnées visuelles — icônes (emoji, zéro dépendance) et couleurs.
// Centralisées ici pour que l'UI reste cohérente partout.

export const TOPIC_ICON: Record<Topic, string> = {
  docker: '🐳',
  kubernetes: '☸️',
  'ci-cd': '🔄',
  terraform: '🏗️',
  monitoring: '📊',
  linux: '🐧',
  git: '🔀',
  networking: '🌐',
  security: '🔒',
  architecture: '🏛️',
  'design-patterns': '🧩',
  'iot-edge': '📡',
  frontend: '🎨',
  backend: '⚙️',
  appsec: '🛡️',
  algorithms: '🧠',
};

export const DOMAIN_LABEL: Record<Domain, string> = {
  devops: 'DevOps',
  iot: 'IoT',
  web: 'Web',
  software: 'Software',
};

export const DOMAIN_COLOR: Record<Domain, string> = {
  devops: '#4f8cff',
  iot: '#2ec39b',
  web: '#b26bff',
  software: '#ff9147',
};

export const DIFFICULTY_META: Record<Difficulty, { label: string; color: string }> = {
  junior: { label: 'Facile', color: '#2ec39b' },
  intermediate: { label: 'Moyen', color: '#ffb020' },
  senior: { label: 'Expert', color: '#ff5c73' },
};

export const TYPE_LABEL: Record<string, string> = {
  mcq: 'Quiz',
  'find-error': 'Debug',
  'write-config': 'Code',
};
