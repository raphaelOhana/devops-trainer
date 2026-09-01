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
  'system-design': '🗺️',
  languages: '🐛',
  'memory-safety': '🧨',
  'problem-solving': '🧭',
  'ai-llm': '🤖',
  hardware: '🔩',
  'secure-review': '🔎',
  'cloud-arch': '☁️',
  databases: '🗄️',
  performance: '⚡',
  mcp: '🔌',
  interview: '💼',
  reversing: '🔬',
  cryptography: '🔐',
  testing: '🧪',
  'ai-engineering': '🛠️',
  'exploit-dev': '💥',
  'agent-security': '🕵️',
};

// Libellés courts (français) pour le filtre par sujet.
export const TOPIC_LABEL: Record<Topic, string> = {
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  'ci-cd': 'CI/CD',
  terraform: 'Terraform',
  monitoring: 'Monitoring',
  linux: 'Linux',
  git: 'Git',
  networking: 'Réseau',
  security: 'Sécurité',
  architecture: 'Architecture',
  'design-patterns': 'Design Patterns',
  'iot-edge': 'IoT / Edge',
  frontend: 'Frontend',
  backend: 'Backend',
  appsec: 'AppSec',
  algorithms: 'Algorithmes',
  'system-design': 'System Design',
  languages: 'Pièges langages',
  'memory-safety': 'Sécurité mémoire (C)',
  'problem-solving': 'Décortiquer un problème',
  'ai-llm': 'IA & LLM',
  hardware: 'Hardware',
  'secure-review': 'Revue de code sécu',
  'cloud-arch': 'Architecture cloud',
  databases: 'Bases de données',
  performance: 'Optimisation',
  mcp: 'MCP',
  interview: 'Coding interview',
  reversing: 'Reverse engineering',
  cryptography: 'Cryptographie',
  testing: 'Tests & qualité',
  'ai-engineering': 'AI Engineering',
  'exploit-dev': 'Exploit dev',
  'agent-security': 'Sécurité des agents IA',
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
