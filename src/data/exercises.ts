import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Premier lot d'exercices (phase 1).
//
// Chaque objet est autonome : sa validation vit dans ses propres données.
// Pour en ajouter un : copier un objet, changer les champs. Aucun code à
// toucher ailleurs. Les cas concrets sont contextualisés par une entreprise
// fictive pour l'ancrage mémoriel.
//
// RÈGLE DE CONCEPTION DES OPTIONS (anti-triche) :
//   Les 4 options doivent être de LONGUEUR ÉQUIVALENTE et toutes plausibles.
//   La bonne réponse ne doit jamais être « la plus longue / la plus détaillée ».
//   Le détail pédagogique va dans `explanation` (affiché APRÈS la réponse),
//   pas dans l'option. Les distracteurs = vraies notions mal appliquées,
//   causes réelles mais secondaires, ou confusions classiques. Jamais de
//   leurre absurde (« augmenter la RAM », « ne rien changer »).
// ---------------------------------------------------------------------------

export const exercises: Exercise[] = [
  // ---------------------------------------------------------------- DOCKER
  {
    id: 'docker-layer-cache',
    type: 'find-error',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'junior',
    title: 'Cache de build cassé',
    company: 'Spotify',
    scenario:
      "Chez Spotify, un build d'image met 8 minutes à chaque petit changement de code. Un ingénieur relit le Dockerfile.",
    question: 'Quelle ligne fait exploser le temps de build en invalidant le cache ?',
    language: 'dockerfile',
    code: `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "server.js"]`,
    options: [
      'FROM node:20-alpine : changer de base à chaque build invalide tout le cache',
      'COPY . . avant npm ci : un changement de source invalide la couche des deps',
      'RUN npm ci : npm ci ignore le cache de couches, contrairement à npm install',
      'CMD en fin de fichier : il force à reconstruire les couches au-dessus',
    ],
    answer: 1,
    explanation:
      "En copiant tout le code (`COPY . .`) **avant** `npm ci`, la moindre modification d'un fichier source invalide la couche des dépendances et force une réinstallation complète. La bonne pratique : copier d'abord `package.json` + `package-lock.json`, lancer `npm ci`, **puis** copier le reste. Ainsi la couche `npm ci` reste en cache tant que les dépendances ne changent pas.",
    tags: ['dockerfile', 'cache', 'layers', 'performance'],
  },
  {
    id: 'docker-write-multistage',
    type: 'write-config',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'intermediate',
    title: 'Image de prod légère',
    company: 'Apple',
    scenario:
      "L'équipe web d'Apple veut réduire une image Node de 1,1 Go. Objectif : un build multi-stage qui ne livre que le nécessaire.",
    prompt:
      'Écris un Dockerfile multi-stage : une étape `build` basée sur node:20, une étape finale basée sur node:20-alpine qui copie le résultat du build. Expose le port 3000.',
    language: 'dockerfile',
    starter: `# étape de build
FROM node:20 AS build
# ...

# étape finale légère
FROM node:20-alpine
# ...
`,
    // Note : le Dockerfile n'est pas du YAML. On le valide via des assertions
    // sur le texte brut à l'aide de "matches" (regex) sur une pseudo-clé "_raw".
    // Pour rester simple en phase 1, on encode le Dockerfile en objet {_raw}.
    assert: [
      { path: '_raw', matches: 'FROM\\s+node:20\\s+AS\\s+build', msg: 'Une étape de build nommée : FROM node:20 AS build' },
      { path: '_raw', matches: 'FROM\\s+node:20-alpine', msg: 'Une étape finale légère : FROM node:20-alpine' },
      { path: '_raw', matches: 'COPY\\s+--from=build', msg: 'Copier le résultat du build : COPY --from=build ...' },
      { path: '_raw', matches: 'EXPOSE\\s+3000', msg: 'Exposer le port : EXPOSE 3000' },
    ],
    solution: `FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
    explanation:
      "Le **multi-stage build** sépare la compilation (lourde : toolchain, dev-deps) de l'exécution (légère). L'étape finale `node:20-alpine` ne récupère que les artefacts via `COPY --from=build`, ce qui fait fondre la taille et la surface d'attaque. `EXPOSE 3000` documente le port.",
    tags: ['dockerfile', 'multi-stage', 'optimisation', 'taille'],
  },

  // ------------------------------------------------------------ KUBERNETES
  {
    id: 'k8s-hpa-amazon',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'Autoscaling pour Black Friday',
    company: 'Amazon',
    scenario:
      "Le service panier d'Amazon doit encaisser le pic du Black Friday. On veut un HorizontalPodAutoscaler qui monte de 3 à 20 pods dès que le CPU dépasse 70 %.",
    prompt:
      'Écris un HorizontalPodAutoscaler (apiVersion autoscaling/v2) ciblant le Deployment "cart", minReplicas 3, maxReplicas 20, seuil CPU moyen 70 %.',
    language: 'yaml',
    starter: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cart
spec:
  # à compléter
`,
    assert: [
      { path: 'kind', equals: 'HorizontalPodAutoscaler', msg: 'kind: HorizontalPodAutoscaler' },
      { path: 'spec.minReplicas', equals: 3, msg: 'minReplicas: 3' },
      { path: 'spec.maxReplicas', equals: 20, msg: 'maxReplicas: 20' },
      { path: 'spec.scaleTargetRef.name', equals: 'cart', msg: 'scaleTargetRef.name: cart (le Deployment ciblé)' },
      {
        path: 'spec.metrics.0.resource.target.averageUtilization',
        equals: 70,
        msg: 'Seuil CPU : averageUtilization 70',
      },
    ],
    solution: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cart
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cart
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70`,
    explanation:
      "Le **HPA** ajuste le nombre de pods selon une métrique. `scaleTargetRef` désigne le Deployment à piloter. `minReplicas`/`maxReplicas` bornent l'échelle. Le bloc `metrics` définit le déclencheur : ici l'utilisation CPU moyenne des pods. Au-delà de 70 %, Kubernetes crée des pods jusqu'à 20 max.",
    tags: ['kubernetes', 'hpa', 'autoscaling', 'cpu'],
  },
  {
    id: 'k8s-liveness-tesla',
    type: 'write-config',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'senior',
    title: 'Redémarrage auto des pods figés',
    company: 'Tesla',
    scenario:
      "La télémétrie des véhicules Tesla tourne sur un Deployment. Certains pods se figent sans planter : ils répondent au TCP mais plus au HTTP. On veut que Kubernetes les redémarre tout seul.",
    prompt:
      'Écris un Deployment "telemetry" (1 conteneur "app", image telemetry:1.4, port 8080) avec un livenessProbe HTTP GET sur /healthz port 8080, délai initial 10s, période 15s.',
    language: 'yaml',
    starter: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: telemetry
  template:
    metadata:
      labels:
        app: telemetry
    spec:
      containers:
        - name: app
          image: telemetry:1.4
          # à compléter
`,
    assert: [
      { path: 'kind', equals: 'Deployment', msg: 'kind: Deployment' },
      { path: 'spec.template.spec.containers.0.image', equals: 'telemetry:1.4', msg: 'image: telemetry:1.4' },
      {
        path: 'spec.template.spec.containers.0.livenessProbe.httpGet.path',
        equals: '/healthz',
        msg: 'livenessProbe.httpGet.path: /healthz',
      },
      {
        path: 'spec.template.spec.containers.0.livenessProbe.httpGet.port',
        equals: 8080,
        msg: 'livenessProbe.httpGet.port: 8080',
      },
      {
        path: 'spec.template.spec.containers.0.livenessProbe.initialDelaySeconds',
        equals: 10,
        msg: 'initialDelaySeconds: 10',
      },
      {
        path: 'spec.template.spec.containers.0.livenessProbe.periodSeconds',
        equals: 15,
        msg: 'periodSeconds: 15',
      },
    ],
    solution: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry
spec:
  replicas: 3
  selector:
    matchLabels:
      app: telemetry
  template:
    metadata:
      labels:
        app: telemetry
    spec:
      containers:
        - name: app
          image: telemetry:1.4
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15`,
    explanation:
      "Un **livenessProbe** HTTP détecte les pods « vivants mais figés » : tant que `/healthz` répond 2xx/3xx, le pod est sain ; sinon Kubernetes le tue et le recrée. `initialDelaySeconds` laisse le temps au démarrage avant la première sonde ; `periodSeconds` cadence les vérifications. Un simple probe TCP n'aurait pas détecté le blocage applicatif.",
    tags: ['kubernetes', 'liveness', 'probe', 'self-healing'],
  },
  {
    id: 'k8s-resources-mcq',
    type: 'mcq',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'requests vs limits',
    company: 'Intel',
    scenario:
      "Sur un cluster Intel, des pods sont expulsés (« evicted ») sous charge. Un SRE révise les ressources.",
    question:
      'Quelle est la différence correcte entre `resources.requests` et `resources.limits` ?',
    options: [
      'requests = plafond maximal autorisé, limits = quantité réservée au démarrage',
      'requests = quantité réservée pour le scheduling, limits = plafond à ne pas dépasser',
      'requests = ressource CPU, limits = ressource mémoire (une clé par ressource)',
      'requests = besoin en stockage du pod, limits = son quota réseau',
    ],
    answer: 1,
    explanation:
      "`requests` est la quantité **réservée** : le scheduler place le pod sur un nœud qui peut la fournir. `limits` est le **plafond** : au-delà, le CPU est throttlé et la mémoire dépassée déclenche un OOM-kill. Des requests trop basses expliquent souvent les évictions sous charge.",
    tags: ['kubernetes', 'resources', 'scheduling', 'oom'],
  },

  // -------------------------------------------------------------- CI / CD
  {
    id: 'cicd-secrets-mcq',
    type: 'mcq',
    domain: 'devops',
    topic: 'ci-cd',
    difficulty: 'junior',
    title: 'Un secret dans les logs',
    company: 'Microsoft',
    scenario:
      "Sur un pipeline GitHub Actions chez une équipe Microsoft, un token AWS est apparu en clair dans les logs d'un build public.",
    question: 'Quelle pratique aurait évité la fuite ?',
    options: [
      'Mettre le token en variable env directement dans le YAML du workflow',
      'Le stocker dans les GitHub Secrets et le référencer via secrets.AWS_TOKEN',
      'Encoder le token en base64 avant de le committer dans le dépôt',
      'Le committer dans un .env ajouté au .gitignore juste après',
    ],
    answer: 1,
    explanation:
      "Les valeurs sensibles vont dans les **secrets chiffrés** du dépôt/organisation, référencés via `${{ secrets.NOM }}`. GitHub les masque automatiquement dans les logs. Base64 n'est pas du chiffrement, et tout secret committé (même supprimé ensuite) reste dans l'historique Git.",
    tags: ['ci-cd', 'github-actions', 'secrets', 'sécurité'],
  },

  // -------------------------------------------------------- IoT / EDGE
  {
    id: 'iot-mqtt-mcq',
    type: 'mcq',
    domain: 'iot',
    topic: 'iot-edge',
    difficulty: 'intermediate',
    title: 'Protocole pour capteurs contraints',
    company: 'NASA',
    scenario:
      "Pour une flotte de capteurs environnementaux à faible bande passante et alimentation limitée, une équipe NASA choisit un protocole de messagerie.",
    question: 'Pourquoi MQTT est-il préféré à HTTP pour ce cas IoT ?',
    options: [
      'MQTT ouvre une connexion HTTP par mesure, plus simple à débuguer',
      'MQTT est un pub/sub léger, à faible overhead, tolérant aux réseaux instables',
      'MQTT chiffre nativement sans TLS, ce qui économise la batterie',
      'MQTT diffuse en broadcast UDP, sans connexion à maintenir',
    ],
    answer: 1,
    explanation:
      "**MQTT** est un protocole **publish/subscribe** conçu pour l'IoT : en-têtes minimes, maintien de connexion peu coûteux, QoS configurable, et fonctionnement fiable sur réseaux intermittents. HTTP, en requête/réponse et plus verbeux, consomme davantage d'énergie et de bande passante — mal adapté aux capteurs sur batterie.",
    tags: ['iot', 'mqtt', 'edge', 'protocole'],
  },
  {
    id: 'iot-ota-write',
    type: 'find-error',
    domain: 'iot',
    topic: 'security',
    difficulty: 'senior',
    title: 'Mise à jour OTA non signée',
    company: 'Tesla',
    scenario:
      "Un firmware de borne de recharge Tesla se met à jour à distance (OTA). Un audit de sécurité relit le processus.",
    question: 'Quel est le défaut de sécurité critique de ce pseudo-flux ?',
    language: 'bash',
    code: `# device
curl http://updates.example.com/firmware.bin -o fw.bin
flash fw.bin
reboot`,
    options: [
      'Téléchargement HTTP sans cache : le firmware est retéléchargé à chaque boot',
      'Aucune signature ni HTTPS : un MITM peut injecter un firmware malveillant',
      'flash sans checksum : une coupure réseau corrompt le binaire en silence',
      'reboot immédiat sans fenêtre de rollback en cas de flash raté',
    ],
    answer: 1,
    explanation:
      "Le firmware est téléchargé en **HTTP clair** et flashé **sans vérifier de signature**. Un attaquant en position d'homme du milieu peut servir un binaire piégé. Une OTA sûre exige : transport chiffré (HTTPS/TLS), **signature cryptographique** du firmware vérifiée par le device avant flash, et idéalement un rollback en cas d'échec. (Le checksum et le rollback sont utiles, mais ne protègent pas d'un attaquant qui signe lui-même son binaire.)",
    tags: ['iot', 'ota', 'sécurité', 'firmware', 'signature'],
  },

  // ----------------------------------------------------------------- WEB
  {
    id: 'web-cors-mcq',
    type: 'mcq',
    domain: 'web',
    topic: 'frontend',
    difficulty: 'junior',
    title: 'Erreur CORS',
    company: 'Netflix',
    scenario:
      "Un front Netflix appelle une API sur un autre domaine et reçoit : « blocked by CORS policy ». Un dev cherche l'origine.",
    question: 'Que signifie cette erreur CORS ?',
    options: [
      "Le serveur d'API n'autorise pas l'origine du front dans ses en-têtes de réponse",
      'Le navigateur a bloqué une exception JavaScript levée par le code du front',
      "La session de l'utilisateur a expiré côté serveur d'API",
      'Le certificat TLS du domaine appelé est invalide ou expiré',
    ],
    answer: 0,
    explanation:
      "**CORS** est un mécanisme de sécurité du navigateur : pour une requête cross-origin, le serveur doit renvoyer `Access-Control-Allow-Origin` autorisant l'origine appelante. L'erreur ne vient pas du front mais de l'**absence d'autorisation côté serveur d'API**. La corriger côté client (ex. désactiver la sécurité) est une fausse solution.",
    tags: ['web', 'cors', 'navigateur', 'api'],
  },
  {
    id: 'web-caching-nginx',
    type: 'write-config',
    domain: 'web',
    topic: 'networking',
    difficulty: 'intermediate',
    title: 'Servir une SPA offline-first',
    company: 'Google',
    scenario:
      "Une équipe Google déploie une SPA statique derrière nginx. On veut que index.html ne soit jamais mis en cache (pour livrer les mises à jour), mais que les assets hashés le soient longtemps.",
    prompt:
      'Écris un extrait de config nginx (au format JSON simplifié attendu ci-dessous) : une clé "location_html" avec cache_control "no-cache", et une clé "location_assets" avec cache_control contenant "max-age=31536000".',
    language: 'json',
    starter: `{
  "location_html": { "cache_control": "" },
  "location_assets": { "cache_control": "" }
}`,
    assert: [
      { path: 'location_html.cache_control', contains: 'no-cache', msg: 'index.html : cache_control "no-cache"' },
      {
        path: 'location_assets.cache_control',
        contains: 'max-age=31536000',
        msg: 'assets hashés : max-age=31536000 (1 an)',
      },
    ],
    solution: `{
  "location_html": { "cache_control": "no-cache" },
  "location_assets": { "cache_control": "public, max-age=31536000, immutable" }
}`,
    explanation:
      "Stratégie **offline-first** classique : `index.html` en `no-cache` pour que le navigateur revérifie toujours et récupère la dernière version (qui référence les nouveaux assets). Les assets portant un hash dans leur nom (`app.a1b2c3.js`) sont immuables : on les cache un an (`max-age=31536000, immutable`). Un changement de contenu change le hash, donc l'URL — pas de cache périmé.",
    tags: ['web', 'nginx', 'cache', 'spa', 'offline'],
  },

  // ------------------------------------------------------------ SOFTWARE
  {
    id: 'software-idempotent-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Paiement rejoué deux fois',
    company: 'Stripe',
    scenario:
      "Sur une passerelle de paiement type Stripe, un client réseau instable renvoie la même requête de paiement, débitant le client deux fois.",
    question: 'Quel principe évite le double débit ?',
    options: [
      'Augmenter le timeout client pour laisser la première requête aboutir',
      "Rendre l'endpoint idempotent via une clé d'idempotence (un rejeu = une opération)",
      'Réessayer plus vite pour que le doublon arrive avant le débit initial',
      'Passer le paiement en GET, méthode considérée comme idempotente',
    ],
    answer: 1,
    explanation:
      "L'**idempotence** garantit qu'une opération répétée avec la même **clé d'idempotence** ne s'exécute qu'une fois : le serveur mémorise le résultat de la première requête et renvoie ce même résultat pour les rejeux. Indispensable pour les paiements sur réseau non fiable. (Et un paiement ne doit jamais être un GET — non idempotent au sens métier et cacheable.)",
    tags: ['software', 'idempotence', 'api', 'paiement', 'fiabilité'],
  },
  {
    id: 'git-rebase-mcq',
    type: 'mcq',
    domain: 'devops',
    topic: 'git',
    difficulty: 'intermediate',
    title: 'Réécrire une branche partagée',
    company: 'GitLab',
    scenario:
      "Un dev de GitLab fait `git push --force` sur `main` après un rebase. L'équipe se retrouve avec un historique cassé.",
    question: 'Quelle est la règle correcte ?',
    options: [
      "Force-push sur main est sûr tant qu'on prévient l'équipe avant",
      "Ne jamais réécrire l'historique d'une branche partagée ; rebaser en local seulement",
      'Le rebase est toujours à proscrire ; merge est la seule option correcte',
      "git pull --force sur main répare l'historique cassé des collègues",
    ],
    answer: 1,
    explanation:
      "Réécrire l'historique d'une branche **partagée** (`main`) invalide l'historique de tous les collaborateurs qui l'ont déjà tirée. Règle d'or : **rebaser uniquement des branches locales/personnelles** ; sur les branches partagées, préférer `merge`. Si un force-push est vraiment nécessaire, `--force-with-lease` limite la casse.",
    tags: ['git', 'rebase', 'force-push', 'collaboration'],
  },

  // -------------------------------------------------- DESIGN PATTERNS
  {
    id: 'pattern-singleton-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'junior',
    title: 'À quoi sert le Singleton',
    company: 'Oracle',
    scenario:
      "Sur un service Oracle, deux pools de connexions à la base sont créés par erreur, épuisant les connexions. Un architecte propose un Singleton.",
    question: 'Que garantit le pattern Singleton ?',
    options: [
      'Que plusieurs instances interchangeables partagent le même état',
      "Qu'une classe a une seule instance, via un point d'accès global",
      'Que la création des objets est déléguée à une fabrique dédiée',
      'Que chaque instance notifie ses observateurs à tout changement',
    ],
    answer: 1,
    explanation:
      "Le **Singleton** garantit **une instance unique** d'une classe et fournit un point d'accès global à cette instance. Utile pour une ressource partagée coûteuse et unique : pool de connexions, cache, configuration. Attention : trop utilisé, il devient une variable globale déguisée qui complique les tests.",
    tags: ['design-patterns', 'singleton', 'création'],
  },
  {
    id: 'pattern-singleton-error',
    type: 'find-error',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'senior',
    title: 'Singleton non thread-safe',
    company: 'Oracle',
    scenario:
      "Ce Singleton fonctionne en dev mono-thread, mais en production multi-thread, deux instances sont parfois créées.",
    question: 'Quelle est la cause du bug ?',
    language: 'typescript',
    code: `class Config {
  private static instance: Config;
  private constructor() {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }
}`,
    options: [
      'Le constructeur privé empêche toute instanciation, même interne',
      'Race condition : deux threads passent le test !instance et créent deux objets',
      "getInstance ne devrait pas être statique pour accéder au champ instance",
      'Le champ instance devrait être public pour pouvoir être partagé',
    ],
    answer: 1,
    explanation:
      "En environnement concurrent, deux threads peuvent évaluer `!Config.instance` **simultanément** avant qu'aucun n'ait affecté `instance` → deux `new Config()`. Solutions : initialisation **eager** (`static instance = new Config()`), verrou (`synchronized` / double-checked locking), ou en JS/TS l'initialisation au chargement du module (les modules ES sont évalués une seule fois, ce qui donne un singleton naturel et sûr).",
    tags: ['design-patterns', 'singleton', 'concurrence', 'thread-safe'],
  },
  {
    id: 'pattern-factory-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'intermediate',
    title: 'Factory Method',
    company: 'Adobe',
    scenario:
      "Une app Adobe doit exporter en PDF, PNG ou SVG. Le code est truffé de `if (type === 'pdf') … else if …` dupliqués partout.",
    question: 'Quel pattern élimine ces if/else dispersés pour la création d\'objets ?',
    options: [
      "Observer : chaque format s'abonne et réagit à la demande d'export",
      'Factory : une fabrique centralise la création et choisit la classe concrète',
      "Singleton : une seule instance d'Exporter partagée pour tous les formats",
      "Decorator : envelopper l'exporter pour lui ajouter chaque format",
    ],
    answer: 1,
    explanation:
      "La **Factory** centralise la logique de création : le client demande un `Exporter` à la fabrique sans connaître la classe concrète (`PdfExporter`, `PngExporter`…). On supprime les `if/else` dupliqués et on respecte l'**Open/Closed** : ajouter un format = ajouter une classe + une entrée dans la fabrique, sans toucher au code client.",
    tags: ['design-patterns', 'factory', 'création', 'solid'],
  },
  {
    id: 'pattern-observer-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'intermediate',
    title: 'Observer',
    company: 'Meta',
    scenario:
      "Sur un fil d'actualité Meta, quand un utilisateur poste, plusieurs modules doivent réagir (notifications, fil, analytics) sans que le code du post les connaisse.",
    question: 'Quel pattern découple l\'émetteur d\'un événement de ses multiples réactions ?',
    options: [
      "Observer : le sujet notifie une liste d'abonnés sans les connaître",
      "Adapter : convertir l'interface de chaque module qui réagit",
      'Factory : produire le bon handler pour chaque type d\'événement',
      'Singleton : centraliser toutes les réactions dans une instance unique',
    ],
    answer: 0,
    explanation:
      "L'**Observer** définit une relation un-à-plusieurs : un **sujet** maintient une liste d'**observateurs** et les notifie d'un changement. L'émetteur ignore qui écoute → couplage faible. C'est la base du pub/sub, des event emitters, de la réactivité (React, RxJS) et des systèmes d'événements.",
    tags: ['design-patterns', 'observer', 'pub-sub', 'comportement'],
  },
  {
    id: 'pattern-strategy-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'intermediate',
    title: 'Strategy',
    company: 'Uber',
    scenario:
      "Uber calcule le prix différemment selon le contexte : normal, heures de pointe, promo. Le code est un gros `switch` de plus en plus long.",
    question: 'Quel pattern remplace ce switch par des algorithmes interchangeables ?',
    options: [
      'Singleton : une instance de calculateur unique pour tous les cas',
      "Strategy : chaque algorithme dans une classe, injectée à l'exécution",
      'Observer : notifier les modules quand le tarif du contexte change',
      'Facade : masquer le switch derrière une interface simplifiée',
    ],
    answer: 1,
    explanation:
      "Le **Strategy** encapsule des algorithmes interchangeables derrière une interface commune (`PricingStrategy`). Le contexte reçoit la stratégie voulue et l'exécute sans savoir laquelle. On remplace un `switch` qui grossit par des classes isolées, testables séparément, et on peut ajouter une stratégie sans modifier l'existant.",
    tags: ['design-patterns', 'strategy', 'comportement', 'solid'],
  },
  {
    id: 'pattern-di-mcq',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'senior',
    title: 'Dependency Injection',
    company: 'Microsoft',
    scenario:
      "Une classe `OrderService` crée elle-même `new SmtpMailer()` à l'intérieur. Impossible de la tester sans envoyer de vrais emails.",
    question: 'Quel principe rend cette classe testable ?',
    options: [
      'Rendre SmtpMailer statique pour y accéder sans instanciation',
      "Injecter le mailer (via une interface) au constructeur, remplaçable en test",
      'Mettre OrderService en Singleton pour partager le mailer',
      'Déplacer new SmtpMailer() dans une méthode privée dédiée',
    ],
    answer: 1,
    explanation:
      "L'**injection de dépendances** consiste à **fournir** les dépendances de l'extérieur (constructeur, setter) plutôt que de les créer en interne. `OrderService` dépend d'une interface `Mailer` ; en production on injecte `SmtpMailer`, en test un `FakeMailer`. Cela inverse le contrôle (IoC), découple les classes et rend le tout testable et remplaçable.",
    tags: ['design-patterns', 'dependency-injection', 'ioc', 'testabilité', 'solid'],
  },
];
