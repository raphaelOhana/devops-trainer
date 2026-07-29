import type { Exercise } from '../engine/types';

// Lot « pratique » — priorité à l'ÉCRITURE de config réelle (write-config)
// et au debug (find-error). C'est le type d'exercice le plus formateur :
// l'utilisateur produit un vrai artefact, validé par assertions déclaratives.

export const practiceExercises: Exercise[] = [
  // ================= DOCKER (écriture) =================
  {
    id: 'pr-docker-nonroot',
    type: 'write-config',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'intermediate',
    title: 'Durcir une image (non-root)',
    company: 'Snyk',
    scenario:
      "Un audit exige que le conteneur ne tourne plus en root. Tu dois durcir un Dockerfile Node.",
    prompt:
      "Complète le Dockerfile : crée un utilisateur non-root, bascule dessus avec USER avant le CMD, et expose le port 3000.",
    language: 'dockerfile',
    starter: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
# durcir ci-dessous
`,
    assert: [
      { path: '_raw', matches: 'adduser|useradd|USER\\s+node', msg: "Créer un utilisateur non-root (adduser) ou utiliser l'utilisateur 'node'" },
      { path: '_raw', matches: 'USER\\s+\\w+', msg: 'Basculer sur cet utilisateur : USER <nom>' },
      { path: '_raw', matches: 'EXPOSE\\s+3000', msg: 'Exposer le port : EXPOSE 3000' },
      { path: '_raw', matches: 'CMD|ENTRYPOINT', msg: 'Définir la commande de démarrage (CMD)' },
    ],
    solution: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
RUN adduser -D appuser
USER appuser
EXPOSE 3000
CMD ["node", "server.js"]`,
    explanation:
      "Tourner en **non-root** limite l'impact d'une RCE (voir l'exercice « Conteneur en root »). L'image `node` fournit déjà un utilisateur `node`, sinon on crée `adduser -D appuser`. `USER` doit venir **après** les `RUN` qui ont besoin de droits (installation) et **avant** le `CMD`. `EXPOSE` documente le port.",
    tags: ['docker', 'sécurité', 'non-root', 'user'],
  },
  {
    id: 'pr-docker-healthcheck',
    type: 'write-config',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'intermediate',
    title: 'HEALTHCHECK',
    company: 'Docker',
    scenario:
      "L'orchestrateur doit savoir si le conteneur est réellement sain, pas juste démarré.",
    prompt:
      "Ajoute une instruction HEALTHCHECK qui teste http://localhost:3000/health toutes les 30s, avec un intervalle (--interval=30s).",
    language: 'dockerfile',
    starter: `FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
# ajoute le HEALTHCHECK
CMD ["node", "server.js"]`,
    assert: [
      { path: '_raw', matches: 'HEALTHCHECK', msg: 'Instruction HEALTHCHECK présente' },
      { path: '_raw', matches: '--interval=30s', msg: 'Intervalle : --interval=30s' },
      { path: '_raw', matches: '/health', msg: 'Tester le endpoint /health' },
    ],
    solution: `FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \\
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]`,
    explanation:
      "`HEALTHCHECK` fait passer le conteneur en `healthy`/`unhealthy` selon une commande de test. `--interval` cadence les vérifications, `--timeout` borne chaque test. La commande doit renvoyer 0 (sain) ou 1 (malade). Utile pour que Docker/Compose/Swarm ne route le trafic que vers des conteneurs réellement prêts.",
    tags: ['docker', 'healthcheck', 'observabilité'],
  },

  // ================= KUBERNETES (écriture) =================
  {
    id: 'pr-k8s-deployment',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'junior',
    title: 'Ton premier Deployment',
    company: 'Kubernetes',
    scenario:
      "Tu déploies une API `web` en 3 exemplaires sur le cluster.",
    prompt:
      'Écris un Deployment nommé "web" : 3 replicas, label app=web, un conteneur "api" image web:1.0 exposant le port 8080.',
    language: 'yaml',
    starter: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  # à compléter
`,
    assert: [
      { path: 'kind', equals: 'Deployment', msg: 'kind: Deployment' },
      { path: 'spec.replicas', equals: 3, msg: 'replicas: 3' },
      { path: 'spec.selector.matchLabels.app', equals: 'web', msg: 'selector.matchLabels.app: web' },
      { path: 'spec.template.metadata.labels.app', equals: 'web', msg: 'template.metadata.labels.app: web (doit matcher le selector)' },
      { path: 'spec.template.spec.containers.0.image', equals: 'web:1.0', msg: 'image: web:1.0' },
      { path: 'spec.template.spec.containers.0.ports.0.containerPort', equals: 8080, msg: 'containerPort: 8080' },
    ],
    solution: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: api
          image: web:1.0
          ports:
            - containerPort: 8080`,
    explanation:
      "Le **Deployment** gère un jeu de pods identiques. Point crucial : le `selector.matchLabels` **doit correspondre** aux `template.metadata.labels`, sinon le Deployment ne « possède » aucun pod. `replicas` fixe le nombre d'exemplaires ; le contrôleur les recrée s'ils meurent.",
    tags: ['kubernetes', 'deployment', 'replicas', 'labels'],
  },
  {
    id: 'pr-k8s-service',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'junior',
    title: 'Exposer en interne (Service)',
    company: 'Kubernetes',
    scenario:
      "Tes pods `web` (port 8080) doivent être joignables par d'autres services du cluster via une IP stable.",
    prompt:
      'Écris un Service ClusterIP "web" qui cible les pods app=web, port 80 → targetPort 8080.',
    language: 'yaml',
    starter: `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  # à compléter
`,
    assert: [
      { path: 'kind', equals: 'Service', msg: 'kind: Service' },
      { path: 'spec.type', equals: 'ClusterIP', msg: 'type: ClusterIP' },
      { path: 'spec.selector.app', equals: 'web', msg: 'selector.app: web' },
      { path: 'spec.ports.0.port', equals: 80, msg: 'port: 80' },
      { path: 'spec.ports.0.targetPort', equals: 8080, msg: 'targetPort: 8080' },
    ],
    solution: `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080`,
    explanation:
      "Un **Service ClusterIP** donne une IP virtuelle stable + une entrée DNS interne (`web.namespace.svc`) qui load-balance vers les pods correspondant au `selector`. `port` = port du Service ; `targetPort` = port du conteneur. C'est la brique de communication service-à-service.",
    tags: ['kubernetes', 'service', 'clusterip', 'networking'],
  },
  {
    id: 'pr-k8s-resources',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'requests & limits',
    company: 'Kubernetes',
    scenario:
      "Pour éviter qu'un pod affame ses voisins (et se fasse OOM-killer), tu définis ses ressources.",
    prompt:
      "Ajoute au conteneur un bloc resources : requests 128Mi de mémoire et 100m CPU ; limits 256Mi de mémoire et 500m CPU.",
    language: 'yaml',
    starter: `apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  containers:
    - name: api
      image: web:1.0
      # ajoute resources
`,
    assert: [
      { path: 'spec.containers.0.resources.requests.memory', equals: '128Mi', msg: 'requests.memory: 128Mi' },
      { path: 'spec.containers.0.resources.requests.cpu', equals: '100m', msg: 'requests.cpu: 100m' },
      { path: 'spec.containers.0.resources.limits.memory', equals: '256Mi', msg: 'limits.memory: 256Mi' },
      { path: 'spec.containers.0.resources.limits.cpu', equals: '500m', msg: 'limits.cpu: 500m' },
    ],
    solution: `apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  containers:
    - name: api
      image: web:1.0
      resources:
        requests:
          memory: 128Mi
          cpu: 100m
        limits:
          memory: 256Mi
          cpu: 500m`,
    explanation:
      "`requests` = ce que le scheduler **réserve** (garanti) ; `limits` = le **plafond**. Unités : mémoire en `Mi`/`Gi`, CPU en `m` (millicœurs, 1000m = 1 cœur). Dépasser `limits.memory` → OOM-kill ; dépasser `limits.cpu` → throttling. Sans `requests`, le scheduler place à l'aveugle et l'HPA CPU ne peut rien calculer.",
    tags: ['kubernetes', 'resources', 'requests', 'limits'],
  },
  {
    id: 'pr-k8s-cronjob',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'Tâche planifiée (CronJob)',
    company: 'Kubernetes',
    scenario:
      "Un backup doit s'exécuter tous les jours à 2h du matin.",
    prompt:
      'Écris un CronJob "backup" avec schedule "0 2 * * *" et un conteneur "job" image backup:1.0.',
    language: 'yaml',
    starter: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  # à compléter
`,
    assert: [
      { path: 'kind', equals: 'CronJob', msg: 'kind: CronJob' },
      { path: 'spec.schedule', equals: '0 2 * * *', msg: 'schedule: "0 2 * * *" (tous les jours à 2h)' },
      { path: 'spec.jobTemplate.spec.template.spec.containers.0.image', equals: 'backup:1.0', msg: 'image: backup:1.0' },
    ],
    solution: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: job
              image: backup:1.0`,
    explanation:
      "Un **CronJob** crée un Job selon un `schedule` cron (`minute heure jour mois jour-semaine` → `0 2 * * *` = 02:00 chaque jour). Le conteneur est décrit sous `jobTemplate.spec.template.spec`. Prévoir `restartPolicy: OnFailure` et, en prod, `concurrencyPolicy` pour éviter les chevauchements.",
    tags: ['kubernetes', 'cronjob', 'batch', 'cron'],
  },
  {
    id: 'pr-k8s-ingress',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'senior',
    title: 'Router par domaine (Ingress)',
    company: 'Kubernetes',
    scenario:
      "Le trafic de `shop.example.com` doit arriver sur le Service `web` (port 80), via un seul point d'entrée.",
    prompt:
      'Écris un Ingress "web" : host shop.example.com, path "/" (pathType Prefix) → service "web" port 80.',
    language: 'yaml',
    starter: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  rules:
    # à compléter
`,
    assert: [
      { path: 'kind', equals: 'Ingress', msg: 'kind: Ingress' },
      { path: 'spec.rules.0.host', equals: 'shop.example.com', msg: 'host: shop.example.com' },
      { path: 'spec.rules.0.http.paths.0.path', equals: '/', msg: 'path: /' },
      { path: 'spec.rules.0.http.paths.0.pathType', equals: 'Prefix', msg: 'pathType: Prefix' },
      { path: 'spec.rules.0.http.paths.0.backend.service.name', equals: 'web', msg: 'backend.service.name: web' },
      { path: 'spec.rules.0.http.paths.0.backend.service.port.number', equals: 80, msg: 'backend.service.port.number: 80' },
    ],
    solution: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80`,
    explanation:
      "L'**Ingress** route le trafic HTTP externe (L7) par **host** et **path** vers des Services internes, derrière un seul LoadBalancer. `pathType: Prefix` matche tout ce qui commence par `/`. Un **Ingress Controller** (nginx, Traefik…) doit tourner dans le cluster pour l'appliquer. C'est l'alternative économique à un LoadBalancer par service.",
    tags: ['kubernetes', 'ingress', 'routing', 'l7'],
  },
  {
    id: 'pr-k8s-configmap',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'junior',
    title: 'Configuration externalisée',
    company: 'Kubernetes',
    scenario:
      "Tu externalises la config de l'app hors de l'image (12-Factor).",
    prompt:
      'Écris un ConfigMap "web-config" avec les données : LOG_LEVEL="info" et MAX_CONNECTIONS="100".',
    language: 'yaml',
    starter: `apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
# à compléter
`,
    assert: [
      { path: 'kind', equals: 'ConfigMap', msg: 'kind: ConfigMap' },
      { path: 'data.LOG_LEVEL', equals: 'info', msg: 'data.LOG_LEVEL: info' },
      { path: 'data.MAX_CONNECTIONS', contains: '100', msg: 'data.MAX_CONNECTIONS: "100"' },
    ],
    solution: `apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
data:
  LOG_LEVEL: "info"
  MAX_CONNECTIONS: "100"`,
    explanation:
      "Un **ConfigMap** stocke de la configuration non sensible en clair (clé/valeur), injectée dans les pods en variables d'env (`envFrom`) ou fichiers montés. Pour du sensible → **Secret**. Externaliser la config respecte le 12-Factor (« config dans l'environnement ») et permet de changer les paramètres sans reconstruire l'image.",
    tags: ['kubernetes', 'configmap', '12-factor', 'config'],
  },
  {
    id: 'pr-k8s-netpol',
    type: 'write-config',
    domain: 'devops',
    topic: 'security',
    difficulty: 'senior',
    title: 'Zero Trust réseau (NetworkPolicy)',
    company: 'Cilium',
    scenario:
      "Par défaut, tous les pods d'un namespace peuvent se parler. Tu veux tout bloquer en entrée, puis n'ouvrir que le nécessaire.",
    prompt:
      'Écris une NetworkPolicy "default-deny" qui sélectionne tous les pods (podSelector vide) et bloque tout le trafic Ingress (policyTypes: [Ingress], aucune règle ingress).',
    language: 'yaml',
    starter: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
spec:
  # à compléter
`,
    assert: [
      { path: 'kind', equals: 'NetworkPolicy', msg: 'kind: NetworkPolicy' },
      { path: 'spec.podSelector', exists: true, msg: 'podSelector présent (vide = tous les pods)' },
      { path: 'spec.policyTypes.0', equals: 'Ingress', msg: 'policyTypes: [Ingress]' },
    ],
    solution: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
spec:
  podSelector: {}
  policyTypes:
    - Ingress`,
    explanation:
      "Une **NetworkPolicy** avec `podSelector: {}` (tous les pods) et `policyTypes: [Ingress]` **sans aucune règle ingress** bloque **tout le trafic entrant** → base d'une posture Zero Trust. On ajoute ensuite des policies ciblées pour autoriser explicitement les flux nécessaires. Requiert un CNI qui les applique (Calico, Cilium…). Sans policy, Kubernetes est ouvert par défaut.",
    tags: ['kubernetes', 'networkpolicy', 'zero-trust', 'sécurité'],
  },

  // ================= TERRAFORM (écriture) =================
  {
    id: 'pr-tf-backend',
    type: 'write-config',
    domain: 'devops',
    topic: 'terraform',
    difficulty: 'intermediate',
    title: 'State distant + lock',
    company: 'HashiCorp',
    scenario:
      "En équipe, le state ne doit plus être local. Tu configures un backend S3 avec verrouillage.",
    prompt:
      'Écris un bloc backend "s3" : bucket "tf-state", key "prod/terraform.tfstate", region "eu-west-1", et active le verrouillage natif (use_lockfile = true).',
    language: 'hcl',
    starter: `terraform {
  backend "s3" {
    # à compléter
  }
}`,
    assert: [
      { path: '_raw', matches: 'backend\\s+"s3"', msg: 'backend "s3"' },
      { path: '_raw', matches: 'bucket\\s*=\\s*"tf-state"', msg: 'bucket = "tf-state"' },
      { path: '_raw', matches: 'key\\s*=\\s*"prod/terraform.tfstate"', msg: 'key = "prod/terraform.tfstate"' },
      { path: '_raw', matches: 'region\\s*=\\s*"eu-west-1"', msg: 'region = "eu-west-1"' },
      { path: '_raw', matches: 'use_lockfile\\s*=\\s*true', msg: 'use_lockfile = true' },
    ],
    solution: `terraform {
  backend "s3" {
    bucket       = "tf-state"
    key          = "prod/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true
  }
}`,
    explanation:
      "Un **backend distant S3** partage le state entre l'équipe. `use_lockfile = true` (Terraform 1.10+) active le **verrouillage natif** qui empêche deux `apply` concurrents de corrompre le state (remplace l'ancien lock DynamoDB). Toujours `encrypt = true` et un bucket **versionné**.",
    tags: ['terraform', 'backend', 's3', 'state-lock'],
  },

  // ================= WEB (écriture) =================
  {
    id: 'pr-web-compose',
    type: 'write-config',
    domain: 'web',
    topic: 'backend',
    difficulty: 'junior',
    title: 'docker-compose',
    company: 'Docker',
    scenario:
      "Tu démarres une app web + sa base en local avec un seul fichier.",
    prompt:
      'Écris un docker-compose (version "3.8") avec un service "web" (image myapp:1.0) qui mappe le port 8080 de l\'hôte vers le 3000 du conteneur.',
    language: 'yaml',
    starter: `version: "3.8"
services:
  web:
    # à compléter
`,
    assert: [
      { path: 'services.web.image', equals: 'myapp:1.0', msg: 'services.web.image: myapp:1.0' },
      { path: 'services.web.ports.0', contains: '8080:3000', msg: 'ports: mapping "8080:3000" (hôte:conteneur)' },
    ],
    solution: `version: "3.8"
services:
  web:
    image: myapp:1.0
    ports:
      - "8080:3000"`,
    explanation:
      "**docker-compose** décrit une stack multi-conteneurs. `ports: \"8080:3000\"` mappe le port **hôte 8080** vers le **conteneur 3000** (gauche:droite). On ajoute d'autres services (DB, cache) et des `depends_on`, `environment`, `volumes`. Idéal pour un environnement de dev reproductible.",
    tags: ['web', 'docker-compose', 'ports'],
  },
  {
    id: 'pr-web-nginx-gzip',
    type: 'write-config',
    domain: 'web',
    topic: 'networking',
    difficulty: 'intermediate',
    title: 'nginx : SPA + compression',
    company: 'nginx',
    scenario:
      "Tu sers une SPA derrière nginx. On te donne un objet JSON simplifié décrivant la config attendue.",
    prompt:
      'Écris un JSON avec : "gzip" = "on", "try_files" = "$uri /index.html" (fallback SPA), et "gzip_types" contenant "application/javascript".',
    language: 'json',
    starter: `{
  "gzip": "",
  "try_files": "",
  "gzip_types": ""
}`,
    assert: [
      { path: 'gzip', equals: 'on', msg: 'gzip: "on"' },
      { path: 'try_files', contains: 'index.html', msg: 'try_files: fallback vers /index.html' },
      { path: 'gzip_types', contains: 'application/javascript', msg: 'gzip_types inclut application/javascript' },
    ],
    solution: `{
  "gzip": "on",
  "try_files": "$uri /index.html",
  "gzip_types": "text/css application/javascript application/json"
}`,
    explanation:
      "Pour une **SPA**, `try_files $uri /index.html` renvoie l'index pour toute route inconnue (le routing se fait côté client). `gzip on` + `gzip_types` compresse les assets texte (CSS/JS/JSON) → moins de bande passante. Les images/binaires déjà compressés n'ont pas besoin de gzip.",
    tags: ['web', 'nginx', 'spa', 'gzip'],
  },

  // ================= DEBUG (find-error) =================
  {
    id: 'pr-docker-latest',
    type: 'find-error',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'junior',
    title: 'Le tag qui trahit',
    company: 'Docker',
    scenario:
      "Un build reproductible en CI donne parfois des résultats différents d'une exécution à l'autre, sans changement de code.",
    question: 'Quel est le problème dans ce Dockerfile ?',
    language: 'dockerfile',
    code: `FROM node:latest
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "server.js"]`,
    options: [
      'WORKDIR est mal placé',
      "FROM node:latest n'est pas déterministe : l'image de base change dans le temps → builds non reproductibles. Épingler une version (node:20.11-alpine) voire un digest @sha256",
      'COPY package*.json est inutile',
      'Il manque EXPOSE',
    ],
    answer: 1,
    explanation:
      "`node:latest` est un **tag mobile** : il pointe vers une image différente au fil du temps → deux builds à des dates différentes n'utilisent pas la même base = **non reproductible** (et surprises de compatibilité). Épingler une version précise (`node:20.11-alpine`), voire un **digest** `node@sha256:...` pour une reproductibilité totale. Utiliser aussi `npm ci` plutôt que `npm install`.",
    tags: ['docker', 'latest', 'reproductibilité', 'tag'],
  },
  {
    id: 'pr-k8s-selector-mismatch',
    type: 'find-error',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'Le Deployment sans pods',
    company: 'Kubernetes',
    scenario:
      "Un Deployment est appliqué sans erreur, mais `kubectl get pods` ne montre aucun pod, et le Service ne route rien.",
    question: 'Où est l\'erreur ?',
    language: 'yaml',
    code: `spec:
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: api
          image: web:1.0`,
    options: [
      "L'image est invalide",
      "Le selector (app: web) ne correspond PAS aux labels du template (app: frontend) : le Deployment ne reconnaît aucun pod comme sien. Les deux doivent être identiques",
      'Il manque replicas',
      'containers doit être une map',
    ],
    answer: 1,
    explanation:
      "Le `selector.matchLabels` (`app: web`) doit **correspondre exactement** aux `template.metadata.labels` (`app: frontend`). Ici ils diffèrent → le Deployment crée des pods mais ne les « possède » pas, et le Service (qui matche sur un label) ne les trouve pas. Aligner les deux sur la même valeur.",
    tags: ['kubernetes', 'selector', 'labels', 'debug'],
  },
  {
    id: 'pr-yaml-indent',
    type: 'find-error',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'junior',
    title: 'Piège d\'indentation YAML',
    company: 'YAML',
    scenario:
      "`kubectl apply` renvoie une erreur de parsing sur ce fragment.",
    question: 'Quelle est l\'erreur YAML ?',
    language: 'yaml',
    code: `spec:
  containers:
  - name: api
    image: web:1.0
     ports:
    - containerPort: 8080`,
    options: [
      'name et image sont inversés',
      "L'indentation de `ports` est incohérente (5 espaces au lieu de 4) : YAML est sensible à l'indentation, chaque niveau doit être aligné avec des espaces (jamais de tabulations)",
      'containerPort doit être une string',
      'Il manque un tiret devant name',
    ],
    answer: 1,
    explanation:
      "**YAML est sensible à l'indentation** : `ports` a 5 espaces alors que `name`/`image` en ont 4, donc le parseur ne rattache pas `ports` au bon niveau. Règle : indentation **cohérente**, uniquement des **espaces** (les tabulations sont interdites en YAML), chaque niveau imbriqué décalé du même nombre d'espaces.",
    tags: ['kubernetes', 'yaml', 'indentation', 'debug'],
  },
];
