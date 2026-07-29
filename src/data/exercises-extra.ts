import type { Exercise } from '../engine/types';

// Lot complémentaire — élargit la couverture (réseau, sécurité supply-chain,
// monitoring, Linux, architecture). Toujours ancré sur des pratiques réelles.

export const extraExercises: Exercise[] = [
  // ---- KUBERNETES ----
  {
    id: 'ex-k8s-services',
    type: 'mcq',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'Exposer 10 microservices',
    company: 'Sysdig',
    scenario:
      "Une équipe provisionne un LoadBalancer cloud par microservice pour les exposer en HTTP : la facture explose.",
    question: 'Quelle est la bonne approche pour du HTTP externe multi-services ?',
    options: [
      'Un NodePort par service, sur un port de chaque nœud',
      'Un seul Ingress (LB unique) routant par host/path vers les ClusterIP',
      'Un LoadBalancer cloud par service, c\'est la norme attendue',
      'Exposer les pods directement via leur IP interne',
    ],
    answer: 1,
    explanation:
      "`ClusterIP` (défaut) = IP virtuelle interne. `NodePort` = port 30000-32767 sur chaque nœud. `LoadBalancer` = un LB cloud (coûteux) par service. Pour du HTTP externe multi-services, un **Ingress** derrière **un seul** LoadBalancer route par host/path vers les ClusterIP → un LB au lieu de N, avec TLS et routage L7. kube-proxy installe les règles iptables/IPVS sous-jacentes.",
    tags: ['kubernetes', 'services', 'ingress', 'coûts'],
  },

  // ---- TERRAFORM ----
  {
    id: 'ex-tf-import-rm',
    type: 'mcq',
    domain: 'devops',
    topic: 'terraform',
    difficulty: 'intermediate',
    title: 'import vs state rm',
    company: 'HashiCorp',
    scenario:
      "Une base RDS existe dans AWS mais pas dans le state Terraform. Tu veux la gérer avec Terraform sans la recréer.",
    question: 'Quelle commande utiliser — et quel est le piège de state rm ?',
    options: [
      'terraform destroy puis apply pour la recréer proprement',
      'terraform import fait entrer la ressource dans le state (state rm ≠ destroy)',
      'Supprimer le fichier de state pour repartir de zéro',
      'terraform refresh pour synchroniser l\'état réel',
    ],
    answer: 1,
    explanation:
      "`terraform import <adresse> <id>` fait **rentrer** une ressource existante dans le state (il faut écrire le HCL, ou blocs `import {}` de 1.5+ avec `-generate-config-out`). `terraform state rm` **retire du state sans rien détruire** dans le cloud. Piège classique : confondre `state rm` (ne touche pas au cloud) et `destroy` (supprime réellement). Toujours sauvegarder : `terraform state pull > backup.tfstate`.",
    tags: ['terraform', 'import', 'state', 'state-rm'],
  },

  // ---- MONITORING ----
  {
    id: 'ex-mon-use-red',
    type: 'mcq',
    domain: 'devops',
    topic: 'monitoring',
    difficulty: 'intermediate',
    title: 'USE ou RED ?',
    company: 'Grafana',
    scenario:
      "Une API microservices est lente. Tu veux méthodiquement instrumenter le système pour trouver la cause.",
    question: 'Comment combiner les méthodes USE et RED ?',
    options: [
      'Elles sont interchangeables, on choisit l\'une ou l\'autre',
      'RED par service (symptôme utilisateur), USE par ressource (cause infra)',
      'USE pour les services et RED pour les ressources',
      'On ne surveille que l\'utilisation CPU des nœuds',
    ],
    answer: 1,
    explanation:
      "**RED** (Rate/Errors/Duration) s'applique **par service** → symptômes visibles par l'utilisateur. **USE** (Utilization/Saturation/Errors) s'applique **par ressource** → santé de l'infra. Complémentaires : RED montre *qu'un* service souffre, USE montre *quelle* ressource sature (souvent la **saturation** — run-queue, pool de connexions — plus que l'utilisation). À rapprocher des Four Golden Signals de Google.",
    tags: ['monitoring', 'use', 'red', 'méthode'],
  },
  {
    id: 'ex-mon-alert-fatigue',
    type: 'mcq',
    domain: 'devops',
    topic: 'monitoring',
    difficulty: 'senior',
    title: 'Alert fatigue',
    company: 'Google SRE',
    scenario:
      "L'équipe on-call est paginée sur chaque « CPU > 90 % » ou « pod redémarré ». Après 50 fausses alertes, un vrai incident passe inaperçu.",
    question: 'Quel principe réduit le bruit ?',
    options: [
      'Ajouter plus d\'alertes pour couvrir chaque métrique',
      'Alerter sur les symptômes (SLO, erreurs, latence), pas les causes internes',
      'Supprimer toutes les alertes pour retrouver le calme',
      'Augmenter les seuils au hasard jusqu\'à moins de bruit',
    ],
    answer: 1,
    explanation:
      "Alerter sur des **causes internes** (CPU 90 %, redémarrage) génère du bruit non corrélé à un impact réel → fatigue, MTTR qui explose. Google : **alerter sur les symptômes** (SLO violé, erreurs, latence) via des alertes **basées burn-rate** multi-fenêtres. Cible : < 2 incidents actionnables par 12 h. Toute alerte doit être **actionnable** (runbook associé).",
    tags: ['monitoring', 'alerting', 'slo', 'sre'],
  },

  // ---- LINUX ----
  {
    id: 'ex-linux-oom',
    type: 'mcq',
    domain: 'devops',
    topic: 'linux',
    difficulty: 'senior',
    title: 'L\'OOM killer frappe la DB',
    company: 'Linux',
    scenario:
      "Un serveur en overcommit manque de RAM. `dmesg` montre : `Out of memory: Killed process 1234 (mysqld)`. Pourquoi la base et pas le fautif ?",
    question: 'Comment l\'OOM killer choisit-il sa victime ?',
    options: [
      'Il tue le process qui a directement causé le dépassement',
      'Il tue le plus gros oom_score (protégeable via oom_score_adj)',
      'Il tue systématiquement le plus ancien process lancé',
      'Il redémarre la machine pour libérer toute la RAM',
    ],
    answer: 1,
    explanation:
      "L'**OOM killer** vise le **plus gros consommateur** (`oom_score` ≈ mémoire_process/totale × 1000 + `oom_score_adj`), pas celui qui a déclenché le manque — souvent la DB. Pour protéger un process critique : baisser son `oom_score_adj` (plage −1000 à +1000 ; −1000 = immunisé), par ex. `OOMScoreAdjust=-800` dans son unit systemd.",
    tags: ['linux', 'oom', 'memory', 'systemd'],
  },
  {
    id: 'ex-linux-fd',
    type: 'mcq',
    domain: 'devops',
    topic: 'linux',
    difficulty: 'intermediate',
    title: 'Too many open files',
    company: 'systemd',
    scenario:
      "Nginx sous charge log `Too many open files` et refuse des connexions. Tu as pourtant réglé `ulimit -n` et `/etc/security/limits.conf`.",
    question: 'Pourquoi le service ne respecte-t-il pas la limite ?',
    options: [
      'C\'est un bug interne de gestion des sockets de Nginx',
      'Un service systemd n\'hérite pas de limits.conf (mettre LimitNOFILE)',
      'Il faut redémarrer la machine pour appliquer la limite',
      'La commande ulimit -n est obsolète sur les noyaux récents',
    ],
    answer: 1,
    explanation:
      "`limits.conf`/`ulimit -n` s'appliquent aux sessions PAM, **pas** aux services **systemd**. Pour eux, il faut `LimitNOFILE=65536` dans `[Service]`. Diagnostic : `ls /proc/<pid>/fd | wc -l`, `lsof -p <pid>`. Et augmenter la limite ne corrige pas une **fuite de FD** sous-jacente — la traquer d'abord.",
    tags: ['linux', 'file-descriptors', 'systemd', 'limits'],
  },

  // ---- GIT ----
  {
    id: 'ex-git-interactive',
    type: 'mcq',
    domain: 'devops',
    topic: 'git',
    difficulty: 'intermediate',
    title: 'Nettoyer une PR de 12 commits',
    company: 'Git',
    scenario:
      "Ta PR contient 12 commits « wip », « fix typo ». Avant merge, tu veux la condenser en 2-3 commits atomiques et lisibles.",
    question: 'Quel outil, et quelle précaution ?',
    options: [
      'git merge --squash au moment du merge uniquement',
      'git rebase -i HEAD~12 (squash/fixup) sur ta branche non partagée',
      'Supprimer la branche puis la recréer proprement',
      'git commit --amend répété douze fois de suite',
    ],
    answer: 1,
    explanation:
      "`git rebase -i HEAD~N` permet de **squash** (fusionner + combiner les messages), **fixup** (fusionner + jeter le message), reword, reorder, drop. Workflow pratique : `git commit --fixup=<hash>` puis `git rebase -i --autosquash`. Précaution : c'est une **réécriture d'historique** → seulement sur ta branche locale/non partagée avant la PR.",
    tags: ['git', 'rebase-interactif', 'squash', 'historique'],
  },

  // ---- NETWORKING ----
  {
    id: 'ex-net-l4l7',
    type: 'mcq',
    domain: 'web',
    topic: 'networking',
    difficulty: 'intermediate',
    title: 'Load balancer L4 ou L7 ?',
    company: 'HAProxy',
    scenario:
      "Tu dois router `/api` vers un service et `/img` vers un autre, terminer le TLS, et inspecter les headers HTTP.",
    question: 'Quel niveau de load balancing ?',
    options: [
      'L4 (TCP/UDP) qui route uniquement sur IP et port',
      'L7 : il lit le HTTP (host, path, headers) et termine le TLS',
      'Peu importe le niveau, le résultat est identique',
      'Les deux niveaux font exactement la même chose',
    ],
    answer: 1,
    explanation:
      "**L4** (TCP/UDP) route sur IP/port **sans lire le contenu** → débit et latence optimaux, idéal pour du non-HTTP ou du très haut débit (NLB, HAProxy `mode tcp`). **L7** inspecte le **HTTP** (host, path, headers, SNI) → routage par URL, sticky sessions, terminaison TLS, WAF (ALB, Nginx). Du routage par path + TLS impose le **L7**.",
    tags: ['networking', 'load-balancing', 'l4', 'l7'],
  },
  {
    id: 'ex-net-tls-sni',
    type: 'mcq',
    domain: 'web',
    topic: 'networking',
    difficulty: 'senior',
    title: 'HTTPS mais domaine visible',
    company: 'Cloudflare',
    scenario:
      "Malgré HTTPS (TLS 1.3), un FAI arrive à voir quel domaine un utilisateur visite et le censure par nom de domaine.",
    question: 'Pourquoi, et quelle est la parade moderne ?',
    options: [
      'TLS 1.3 est cassé et laisse fuir le trafic déchiffré',
      'Le SNI reste en clair dans le ClientHello ; parade : ECH',
      'Il faut désactiver HTTPS pour masquer le domaine visité',
      'Le certificat serveur est expiré et révèle le domaine',
    ],
    answer: 1,
    explanation:
      "TLS 1.3 chiffre le canal et impose la forward secrecy (ECDHE éphémère), mais le **SNI** — le nom d'hôte demandé — voyage **en clair** dans le ClientHello (nécessaire au routage virtuel). D'où la censure par domaine. **ECH** (Encrypted Client Hello) chiffre le ClientHello interne avec une clé publiée via DNS (HTTPS/SVCB). L'ancien ESNI est obsolète.",
    tags: ['networking', 'tls', 'sni', 'ech', 'confidentialité'],
  },
  {
    id: 'ex-net-mtls',
    type: 'mcq',
    domain: 'software',
    topic: 'networking',
    difficulty: 'senior',
    title: 'Zero Trust entre services',
    company: 'Istio',
    scenario:
      "Dans un service mesh Zero Trust, chaque service doit prouver son identité, sans se reposer sur « le réseau interne est de confiance ».",
    question: 'Qu\'apporte le mTLS, et sa limite ?',
    options: [
      'Rien de plus que le TLS classique côté serveur',
      'Authentification mutuelle par certificats (mais pas d\'autorisation)',
      'Il remplace les mots de passe des utilisateurs finaux',
      'Il chiffre le trafic uniquement dans le sens serveur→client',
    ],
    answer: 1,
    explanation:
      "En **mTLS**, le serveur envoie un `CertificateRequest` et le client répond avec son propre certificat + `CertificateVerify` : les deux s'authentifient **mutuellement** contre une CA. Idéal pour API-to-API, mesh, IoT. Limite : mTLS **authentifie** (qui tu es) mais **n'autorise pas** (ce que tu as le droit de faire) → couche d'authz nécessaire. Et la **rotation/révocation** des certs doit être automatisée, sinon expiration = panne.",
    tags: ['networking', 'mtls', 'zero-trust', 'mesh'],
  },

  // ---- SECURITY ----
  {
    id: 'ex-sec-vault',
    type: 'mcq',
    domain: 'software',
    topic: 'security',
    difficulty: 'senior',
    title: 'Le problème du « secret zéro »',
    company: 'HashiCorp Vault',
    scenario:
      "Une équipe déplace tous ses secrets dans Vault, mais code en dur le token racine de Vault dans l'app. Elle a juste déplacé le problème.",
    question: 'Comment résoudre le « secret zéro » (secret d\'amorçage) ?',
    options: [
      'Mettre le token racine dans un fichier .env non versionné',
      'Authentifier l\'app par son identité de plateforme (AppRole/IAM)',
      'Chiffrer le token racine en base64 avant de l\'embarquer',
      'Committer le token dans un dépôt Git privé de l\'équipe',
    ],
    answer: 1,
    explanation:
      "Vault génère des **secrets dynamiques** (ex. credentials DB à la volée) avec **lease TTL** et révocation auto. Mais reste le **secret zéro** : comment l'app s'authentifie à Vault ? La réponse n'est **pas** un token codé en dur, mais une **auth par identité de plateforme** (AppRole, K8s ServiceAccount, cloud IAM) — l'identité prouvée par l'environnement, sans secret statique.",
    tags: ['security', 'vault', 'secret-zero', 'dynamic-secrets'],
  },
  {
    id: 'ex-sec-sbom',
    type: 'mcq',
    domain: 'software',
    topic: 'security',
    difficulty: 'senior',
    title: 'Sommes-nous exposés ?',
    company: 'Sigstore',
    scenario:
      "Après Log4Shell, une entreprise met des heures à répondre à « quels services embarquent log4j ? », faute d'inventaire de dépendances.",
    question: 'Quelle pratique permet une réponse instantanée + une provenance vérifiable ?',
    options: [
      'Relire tout le code source à la main, service par service',
      'Un SBOM (CycloneDX/SPDX) + signature cosign + provenance SLSA',
      'Attendre le prochain audit de sécurité annuel',
      'Désactiver toutes les dépendances tierces du projet',
    ],
    answer: 1,
    explanation:
      "Un **SBOM** (Software Bill of Materials, CycloneDX/SPDX généré par Syft) inventorie tous les composants → on répond en secondes à « suis-je exposé ? » et on scanne en continu (Grype). **Sigstore/cosign** signe les artefacts (keyless, via identité OIDC + log de transparence Rekor) ; **SLSA** atteste la provenance du build. Clé : la signature n'a de valeur que **vérifiée en gate** au déploiement, pas juste produite.",
    tags: ['security', 'sbom', 'sigstore', 'slsa', 'supply-chain'],
  },

  // ---- IoT ----
  {
    id: 'ex-iot-retained-lwt',
    type: 'mcq',
    domain: 'iot',
    topic: 'iot-edge',
    difficulty: 'senior',
    title: 'Dashboard à froid + device tombé',
    company: 'AWS IoT',
    scenario:
      "Un dashboard ouvert à froid n'affiche rien tant qu'un capteur (qui publie toutes les 10 min) n'a pas re-publié. On veut aussi détecter instantanément un device déconnecté.",
    question: 'Quels deux mécanismes MQTT répondent à ça ?',
    options: [
      'Le niveau QoS 2 combiné à un keepalive court',
      'Message retained (dernière valeur) + Last Will and Testament (LWT)',
      'Déployer deux brokers MQTT redondants en parallèle',
      'Un polling HTTP périodique du statut de chaque device',
    ],
    answer: 1,
    explanation:
      "Un message **retained** (`retain=1`) est conservé par le broker (le dernier par topic) et livré à **tout nouvel abonné** → « last known value » pour un dashboard à froid. Le **LWT**, enregistré au CONNECT, est publié **automatiquement par le broker** si le client se déconnecte anormalement (ex. `status=offline`) → détection de panne instantanée. Penser à re-publier un `online` retained à la reconnexion.",
    tags: ['iot', 'mqtt', 'retained', 'lwt'],
  },
  {
    id: 'ex-iot-edge',
    type: 'mcq',
    domain: 'iot',
    topic: 'iot-edge',
    difficulty: 'intermediate',
    title: 'Patterns cloud sur l\'edge',
    company: 'Mender',
    scenario:
      "Une équipe cloud déploie une image Docker de 800 Mo + un agent verbeux sur des passerelles à 128 Mo de RAM, sur liens cellulaires facturés au Mo. Saturation RAM, forfait épuisé.",
    question: 'Quel est le bon réflexe de conception pour l\'edge ?',
    options: [
      'Supposer une connexion permanente et pousser de gros volumes',
      'Concevoir pour l\'intermittence : protocoles légers, buffering, resync',
      'Augmenter la RAM des passerelles pour tenir les conteneurs',
      'Réutiliser tels quels les patterns cloud sur les passerelles',
    ],
    answer: 1,
    explanation:
      "L'edge = CPU/RAM/flash limités, énergie, **connectivité intermittente et coûteuse**. Les patterns cloud (conteneurs lourds, polling fréquent, always-on) y échouent. Bons réflexes : protocoles légers (MQTT/CoAP), **traitement local** pour n'émettre que l'utile, **buffering hors-ligne + resync**, images minimalistes, OTA A/B robuste, sécurité intégrée. Concevoir pour la **déconnexion** et l'idempotence.",
    tags: ['iot', 'edge', 'contraintes', 'offline'],
  },

  // ---- WEB ----
  {
    id: 'ex-web-etag',
    type: 'mcq',
    domain: 'web',
    topic: 'frontend',
    difficulty: 'intermediate',
    title: 'Le 304 Not Modified',
    company: 'MDN',
    scenario:
      "Un asset est servi avec `Cache-Control: max-age=3600` et `ETag: \"abc123\"`. Après expiration, le navigateur renvoie `If-None-Match: \"abc123\"`.",
    question: 'Que fait le serveur si le contenu n\'a pas changé ?',
    options: [
      'Renvoyer le fichier entier à nouveau dans la réponse',
      'Répondre 304 Not Modified sans corps : la copie cachée est réutilisée',
      'Renvoyer une erreur 400 car l\'en-tête est invalide',
      'Vider le cache du navigateur et forcer un rechargement',
    ],
    answer: 1,
    explanation:
      "`max-age` définit la **fraîcheur** ; à expiration, le navigateur **revalide** via `ETag`/`If-None-Match` (ou `Last-Modified`/`If-Modified-Since`). Si rien n'a changé → **304 Not Modified sans corps**, le navigateur réutilise sa copie (économie de bande passante). Distinguer `no-cache` (stocke mais revalide **toujours**) de `no-store` (ne stocke **jamais**). Pour des assets fingerprintés : `max-age` long + `immutable`.",
    tags: ['web', 'http', 'cache', 'etag'],
  },
  {
    id: 'ex-web-http3',
    type: 'mcq',
    domain: 'web',
    topic: 'networking',
    difficulty: 'senior',
    title: 'HTTP/2 vs HTTP/3',
    company: 'Cloudflare',
    scenario:
      "Sur une 4G chargée (~2 % de perte de paquets), un site en HTTP/2 est lent : un paquet perdu (image de fond) bloque la livraison du CSS déjà reçu.",
    question: 'Pourquoi, et qu\'apporte HTTP/3 ?',
    options: [
      'HTTP/2 n\'a aucun problème de blocage sur réseau lossy',
      'HTTP/2 sur TCP : une perte bloque tous les streams (HTTP/3 non)',
      'HTTP/3 est en réalité plus lent que HTTP/2 partout',
      'Il faut revenir à HTTP/1.1 pour éviter le problème',
    ],
    answer: 1,
    explanation:
      "HTTP/2 multiplexe plusieurs streams sur **une connexion TCP** : une perte de paquet bloque la livraison de **tous** les streams (head-of-line blocking au niveau TCP), même les données déjà arrivées. **HTTP/3 sur QUIC (UDP)** implémente des streams **indépendants** : une perte ne bloque que son stream. Bonus QUIC : handshake 0/1-RTT (TLS 1.3 intégré), migration de connexion. Fallback HTTP/2 via `Alt-Svc` si UDP est bloqué.",
    tags: ['web', 'http3', 'quic', 'performance'],
  },

  // ---- ARCHITECTURE ----
  {
    id: 'ex-arch-stateless',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'intermediate',
    title: 'Sessions perdues au scale',
    company: '12-Factor',
    scenario:
      "Une app garde les sessions en mémoire et compte sur les sticky sessions. Quand une instance est terminée (autoscaling, déploiement), tous ses utilisateurs perdent leur session.",
    question: 'Quel principe corrige cela ?',
    options: [
      'Renforcer les sticky sessions pour fixer chaque utilisateur',
      'Rendre les process stateless : la session dans un backing service (Redis)',
      'Garder un seul serveur sans aucun scaling horizontal',
      'Doubler la RAM des instances pour tenir plus de sessions',
    ],
    answer: 1,
    explanation:
      "Le scaling horizontal exige des **process stateless** : n'importe quelle réplique traite n'importe quelle requête. Les **sticky sessions** ne font que **masquer** le problème (distribution inégale + perte à la mort de l'instance). Solution 12-Factor : état hors du process, dans un **backing service** (Redis avec expiration). Idem pour un cache local supposé cohérent entre répliques : il ne l'est pas.",
    tags: ['architecture', 'stateless', 'scaling', '12-factor'],
  },
  {
    id: 'ex-arch-bulkhead',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Cloisonner les pannes',
    company: 'Netflix',
    scenario:
      "L'API gateway de Netflix veut éviter qu'un seul service lent épuise tous ses threads et fasse tomber les appels vers les autres services.",
    question: 'Quel pattern isole les défaillances ?',
    options: [
      'Un unique thread pool géant partagé par tous les services',
      'Le Bulkhead : un pool de ressources dédié par dépendance',
      'Supprimer les timeouts pour laisser les appels aboutir',
      'Rendre tous les appels inter-services synchrones',
    ],
    answer: 1,
    explanation:
      "Le **Bulkhead** (cloison étanche, métaphore des compartiments de navire) **partitionne les ressources** (thread pools, connexions) par dépendance ou client. Un backend lent épuise **seulement son compartiment** → la panne est confinée, les autres services répondent. Hystrix l'implémente par thread pool isolation (timeout possible) ou semaphore. À combiner avec circuit breaker + timeouts ; ne pas sur-cloisonner (coût mémoire).",
    tags: ['architecture', 'bulkhead', 'résilience', 'isolation'],
  },

  // ---- DESIGN PATTERNS ----
  {
    id: 'ex-pattern-observer-leak',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'senior',
    title: 'La fuite mémoire de l\'Observer',
    company: 'patterns.dev',
    scenario:
      "Une SPA ajoute des observateurs à un Subject à chaque montage de composant, mais l'app ralentit et la RAM grimpe au fil de la navigation.",
    question: 'Quelle est la cause classique (« lapsed listener ») ?',
    options: [
      'Le Subject observé est devenu trop volumineux en mémoire',
      'Les observateurs ne sont jamais désabonnés au démontage (lapsed listener)',
      'Il faudrait ajouter davantage d\'observateurs au Subject',
      'Le pattern Observer ne fonctionne pas correctement en JS',
    ],
    answer: 1,
    explanation:
      "Le piège **« lapsed listener »** : on **ajoute** des observateurs sans jamais les **retirer**. Le Subject conserve des références vers des composants démontés → ils ne sont pas garbage-collectés (fuite mémoire) et reçoivent des notifications inutiles. Règle : **se désabonner au cleanup** (dans React, la fonction de retour du `useEffect`). C'est la contrepartie du couplage faible qu'offre l'Observer.",
    tags: ['design-patterns', 'observer', 'memory-leak', 'cleanup'],
  },
];
