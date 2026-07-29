===LESSON===
KEY: docker
TOPIC: docker
TITLE: Docker
ICON: 🐳
INTRO: Docker empaquète une application et ses dépendances dans une **image** portable, exécutée comme un **conteneur** isolé. Maîtriser les couches, le cache de build, le multi-stage et les bonnes pratiques de sécurité permet de produire des images petites, rapides à construire et sûres en production. Ces leçons s'appuient sur la documentation officielle Docker et les recommandations BuildKit.
---SECTION---
HEADING: Images, couches et système de fichiers en union
BODY:
Une image Docker est une pile de **couches en lecture seule**. Chaque instruction `RUN`, `COPY` ou `ADD` d'un Dockerfile crée une nouvelle couche ; les autres instructions (`ENV`, `CMD`, `LABEL`...) ne créent que des métadonnées. Au démarrage, le conteneur ajoute une fine **couche inscriptible** par-dessus (copy-on-write).

- Les couches sont **immuables** et partagées entre images : deux images basées sur `debian:12` réutilisent la même couche de base sur le disque.
- Moins de couches et un ordre stable = meilleur cache et téléchargements plus légers.
- Inspecter l'historique des couches :

```bash
docker image history mon-image:1.0
docker image inspect mon-image:1.0 --format '{{ .RootFS.Layers }}'
```

Comprendre ce modèle explique pourquoi l'ordre des instructions influence directement la taille finale et la vitesse de rebuild.
---SECTION---
HEADING: Le cache de build et l'ordre des instructions
BODY:
BuildKit met en cache chaque couche. Une couche est réutilisée si son instruction **et** son contexte (fichiers copiés, image parente) sont inchangés. Dès qu'une couche est invalidée, **toutes les couches suivantes** sont reconstruites.

Règle d'or : placer ce qui change rarement **avant** ce qui change souvent. Pour un projet Node, copier d'abord les manifestes de dépendances, installer, puis copier le code :

```dockerfile
FROM node:20-slim
WORKDIR /app

# Change rarement -> couche mise en cache
COPY package.json package-lock.json ./
RUN npm ci

# Change souvent -> n'invalide pas npm ci
COPY . .
CMD ["node", "server.js"]
```

- Si vous copiez tout (`COPY . .`) avant `npm ci`, la moindre modification de code réinstalle toutes les dépendances.
- `--mount=type=cache` (BuildKit) persiste un cache de paquets entre builds :

```dockerfile
RUN --mount=type=cache,target=/root/.npm npm ci
```
---SECTION---
HEADING: Builds multi-stage
BODY:
Le **multi-stage** sépare l'environnement de compilation (compilateurs, SDK, outils) de l'image finale d'exécution. Seuls les artefacts nécessaires sont copiés dans la dernière étape, ce qui réduit drastiquement la taille et la surface d'attaque.

```dockerfile
# Étape 1 : build
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/server ./cmd/server

# Étape 2 : runtime minimal
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

- `--from=builder` copie uniquement le binaire ; le SDK Go (~800 Mo) n'est pas dans l'image finale.
- Cibler une étape précise : `docker build --target builder -t debug .`
- Une image `distroless` ou `scratch` ne contient ni shell ni gestionnaire de paquets, limitant les vecteurs d'exploitation.
---SECTION---
HEADING: Réduire la taille des images
BODY:
Une image légère se télécharge et démarre plus vite, et expose moins de composants vulnérables.

- **Image de base minimale** : `alpine`, `-slim` ou `distroless` plutôt que la variante complète.
- **Chaîner les commandes** dans un seul `RUN` et nettoyer dans la même couche (sinon les fichiers supprimés restent dans une couche antérieure) :

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
```

- Éviter `apt-get upgrade` : préférer mettre à jour l'image de base.
- Ne pas installer de paquets « au cas où » (`--no-install-recommends`).
---SECTION---
HEADING: Le Dockerfile en bonnes pratiques
BODY:
La documentation officielle recommande plusieurs conventions clés.

- **Contexte de build restreint** : un contexte volumineux ralentit chaque build (tout est envoyé au démon).
- **Épingler les versions** des images de base par tag précis, idéalement par **digest** :

```dockerfile
FROM python:3.12-slim@sha256:abcd1234...
```

- Utiliser `WORKDIR` plutôt que des `cd` dans des `RUN`.
- Préférer `COPY` à `ADD` (sauf pour extraire une archive tar locale) : `ADD` peut télécharger des URL, comportement plus difficile à auditer.
- Déclarer les métadonnées utiles (`LABEL`, `EXPOSE`). `EXPOSE` est documentaire (n'ouvre pas de port réel) mais renseigne les outils.
---SECTION---
HEADING: Sécurité : utilisateur non-root
BODY:
Par défaut un conteneur s'exécute en **root**, ce qui amplifie l'impact d'une évasion de conteneur. Toujours créer et basculer sur un utilisateur non privilégié.

```dockerfile
FROM node:20-slim
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app
COPY --chown=app:app . .
USER app
CMD ["node", "server.js"]
```

Au runtime, renforcer encore l'isolation :

```bash
docker run \
  --user 1000:1000 \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --tmpfs /tmp \
  mon-image:1.0
```

- `--cap-drop=ALL` retire toutes les capabilities Linux, à ré-ajouter à la carte avec `--cap-add`.
- `--read-only` monte le rootfs en lecture seule ; les répertoires inscriptibles passent par `--tmpfs` ou des volumes.
- `no-new-privileges` empêche l'élévation via des binaires setuid.
---SECTION---
HEADING: Secrets au build avec BuildKit
BODY:
**Ne jamais** mettre un secret dans une instruction `ENV`, `ARG` ou un `RUN` : il reste inscrit dans l'historique des couches et est lisible via `docker history`. BuildKit fournit un montage de secret éphémère, absent de l'image finale.

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) \
    npm ci
```

Build en passant la source du secret :

```bash
docker build --secret id=npm_token,env=NPM_TOKEN -t app .
```

- Le secret est monté dans `/run/secrets/` uniquement pendant ce `RUN`, jamais persisté.
- `--mount=type=ssh` permet d'utiliser un agent SSH pour cloner des dépôts privés sans copier de clé.
---SECTION---
HEADING: Le fichier .dockerignore
BODY:
`.dockerignore` exclut des fichiers du **contexte de build**. C'est à la fois une optimisation (contexte plus petit, cache plus stable) et une mesure de sécurité (éviter d'embarquer des secrets).

```
.git
node_modules
**/*.env
*.pem
Dockerfile
.dockerignore
dist/
```

- Exclure `.git` évite de fuiter tout l'historique du dépôt dans l'image via un `COPY . .`.
- Exclure `node_modules` local force une installation propre.
- Sans `.dockerignore`, un `COPY . .` peut copier des `.env` contenant des identifiants.
---SECTION---
HEADING: ENTRYPOINT vs CMD
BODY:
Ces deux instructions définissent ce qui s'exécute au démarrage, mais avec des rôles distincts.

- `ENTRYPOINT` : la commande **fixe** du conteneur (l'exécutable principal).
- `CMD` : les **arguments par défaut**, facilement surchargeables sur la ligne de commande.

```dockerfile
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
```

`docker run mon-image -t` remplace le `CMD` par `-t` mais conserve `nginx`.

**Toujours préférer la forme exec** (tableau JSON) à la forme shell : en forme exec, le processus est PID 1 et reçoit directement `SIGTERM`, permettant un arrêt propre. En forme shell (`node app.js`), un shell devient PID 1 et n'intercepte pas toujours les signaux, provoquant des arrêts brutaux au bout de 10 s. Pour la gestion des signaux et des zombies, ajouter `docker run --init`.
---SECTION---
HEADING: Healthcheck
BODY:
Un `HEALTHCHECK` indique à Docker si le conteneur est réellement opérationnel, au-delà du simple fait que le processus tourne.

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

- Le statut passe de `starting` à `healthy` ou `unhealthy`, visible dans `docker ps`.
- `--start-period` accorde un délai de démarrage sans compter les échecs.
- Un orchestrateur (Swarm, Compose avec `depends_on: condition: service_healthy`) peut s'appuyer dessus.
---SECTION---
HEADING: Réseaux
BODY:
Docker crée des réseaux virtuels pour connecter les conteneurs.

- **bridge** (par défaut) : réseau privé sur l'hôte. Sur un bridge **défini par l'utilisateur**, les conteneurs se résolvent par **nom** via le DNS intégré.
- **host** : le conteneur partage la pile réseau de l'hôte (pas d'isolation, pas de mapping de port).
- **none** : aucune interface réseau.

```bash
docker network create app-net
docker run -d --name db --network app-net postgres:16
docker run -d --name api --network app-net mon-api   # joint db via http://db:5432
```

- La publication de port `-p 8080:80` mappe un port de l'hôte vers le conteneur.
- Segmenter les réseaux (front / back) limite la portée en cas de compromission.
---SECTION---
HEADING: Volumes et persistance
BODY:
La couche inscriptible d'un conteneur est **éphémère** : elle disparaît avec le conteneur. Pour persister des données, utiliser des volumes.

- **Volume nommé** (géré par Docker, recommandé pour les données) :

```bash
docker volume create pgdata
docker run -v pgdata:/var/lib/postgresql/data postgres:16
```

- **Bind mount** (dossier de l'hôte, utile en développement) :

```bash
docker run -v "$(pwd)/src:/app/src:ro" mon-image
```

- **tmpfs** : en mémoire uniquement, idéal pour des secrets ou fichiers temporaires.

Le suffixe `:ro` monte en lecture seule. Les volumes nommés survivent à la suppression du conteneur.
---SECTION---
HEADING: Registres, tags et rate limits
BODY:
Une image est identifiée par `registre/dépôt:tag`. Sans registre explicite, Docker Hub (`docker.io`) est utilisé.

```bash
docker tag mon-app:1.0 ghcr.io/org/mon-app:1.0
docker push ghcr.io/org/mon-app:1.0
```

- **Éviter le tag `latest`** en production : il est mouvant et non reproductible. Épingler par version, voire par **digest** immuable : `image@sha256:...`.
- **Rate limits Docker Hub** : les tirages anonymes sont plafonnés par tranche horaire et par adresse IP. En CI, cela provoque des erreurs `toomanyrequests`. Solutions : s'authentifier (`docker login`), utiliser un **registre miroir/cache** (pull-through cache), ou héberger les images sur GHCR / ECR.
- Scanner les images avant publication (`docker scout cves`, Trivy).
===END===
===LESSON===
KEY: kubernetes
TOPIC: kubernetes
TITLE: Kubernetes
ICON: ☸️
INTRO: Kubernetes orchestre des conteneurs sur un cluster : il planifie les charges, maintient l'état désiré, gère la montée en charge et l'auto-réparation. Ces leçons couvrent les objets fondamentaux, la robustesse (probes, ressources, QoS), la sécurité et le diagnostic des pannes courantes, en s'appuyant sur la documentation officielle Kubernetes.
---SECTION---
HEADING: Pods, ReplicaSets et Deployments
BODY:
Le **Pod** est la plus petite unité déployable : un ou plusieurs conteneurs partageant réseau (même IP) et volumes. On ne crée presque jamais un Pod directement.

- Un **ReplicaSet** garantit un nombre de répliques d'un Pod.
- Un **Deployment** gère les ReplicaSets et orchestre les mises à jour progressives (rolling update) et les rollbacks. C'est l'objet standard pour une application sans état.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: ghcr.io/org/web:1.4.2
          ports:
            - containerPort: 8080
```

Le contrôleur compare en permanence l'état réel à l'état désiré et corrige tout écart (boucle de réconciliation).
---SECTION---
HEADING: Services : ClusterIP, NodePort, LoadBalancer
BODY:
Les Pods sont éphémères et leurs IP changent. Un **Service** fournit une adresse stable et répartit le trafic vers les Pods correspondant à un sélecteur de labels.

- **ClusterIP** (défaut) : IP interne au cluster, joignable uniquement de l'intérieur.
- **NodePort** : ouvre un port (30000-32767) sur chaque nœud, exposant le service à l'extérieur.
- **LoadBalancer** : provisionne un équilibreur externe (cloud) devant le service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector: { app: web }
  ports:
    - port: 80
      targetPort: 8080
```

Le sélecteur `app: web` doit correspondre aux labels des Pods, sinon le service ne route vers aucun endpoint.
---SECTION---
HEADING: Ingress
BODY:
Un **Ingress** gère l'accès HTTP/HTTPS externe : routage par hôte et par chemin, terminaison TLS, un seul point d'entrée pour plusieurs services. Il nécessite un **Ingress Controller** (nginx, Traefik...) déployé dans le cluster.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service: { name: api, port: { number: 80 } }
  tls:
    - hosts: [app.example.com]
      secretName: app-tls
```

- Sans contrôleur installé, l'objet Ingress reste inerte.
- La Gateway API est la successeuse plus expressive de l'Ingress.
---SECTION---
HEADING: Requests, limits et classes QoS
BODY:
Chaque conteneur peut déclarer des **requests** (ressources garanties, utilisées par le scheduler) et des **limits** (plafond).

```yaml
resources:
  requests: { cpu: "250m", memory: "256Mi" }
  limits:   { cpu: "500m", memory: "512Mi" }
```

Les valeurs déterminent la **classe QoS**, qui influence l'ordre d'éviction sous pression :

- **Guaranteed** : requests = limits pour CPU et mémoire. Évincé en dernier.
- **Burstable** : au moins une request définie, mais pas égale aux limits.
- **BestEffort** : aucune request ni limit. Évincé en premier.

Points clés : dépasser la **limite mémoire** entraîne un `OOMKilled` immédiat (la mémoire est incompressible) ; dépasser la **limite CPU** ne tue pas le conteneur mais le **throttle** (CPU compressible).
---SECTION---
HEADING: Probes : liveness, readiness, startup
BODY:
Les sondes permettent à Kubernetes de connaître l'état d'un conteneur.

- **livenessProbe** : si elle échoue, le conteneur est **redémarré** (utile pour sortir d'un blocage).
- **readinessProbe** : si elle échoue, le Pod est retiré des endpoints du Service (ne reçoit plus de trafic) mais **n'est pas redémarré**.
- **startupProbe** : couvre un démarrage lent ; tant qu'elle n'est pas réussie, liveness et readiness sont suspendues.

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 5
```

Piège classique : une liveness trop agressive sur une app à démarrage lent provoque un `CrashLoopBackOff`. Utiliser une startupProbe pour l'éviter. Ne pas mettre de dépendance externe (DB) dans une liveness (spirale de redémarrage) — la mettre en readiness.
---SECTION---
HEADING: Autoscaling horizontal (HPA)
BODY:
Le **HorizontalPodAutoscaler** ajuste automatiquement le nombre de répliques selon des métriques (CPU, mémoire, custom). Il requiert le **metrics-server** et des **requests** définies (le pourcentage se calcule par rapport à la request).

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: web }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: web }
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
```

- Sans `requests.cpu`, l'utilisation en pourcentage est indéfinie et le HPA ne peut pas scaler.
- Le HPA gère le nombre de Pods (horizontal) ; le **VPA** ajuste les ressources d'un Pod (vertical).
---SECTION---
HEADING: ConfigMap et Secret
BODY:
Séparer la configuration du code. Une **ConfigMap** stocke des données non sensibles, un **Secret** des données sensibles (encodées en base64, **pas chiffrées** par défaut au repos sans configuration additionnelle).

```yaml
apiVersion: v1
kind: Secret
metadata: { name: app-secret }
type: Opaque
stringData:
  DB_PASSWORD: "s3cr3t"
```

Injection dans un Pod :

```yaml
envFrom:
  - configMapRef: { name: app-config }
  - secretRef: { name: app-secret }
```

- `stringData` accepte du texte clair (encodé automatiquement).
- Activer le **chiffrement au repos** (EncryptionConfiguration sur etcd) et restreindre l'accès aux Secrets par RBAC.
- Monter un Secret en volume permet une rotation sans redémarrage.
---SECTION---
HEADING: RBAC
BODY:
Le **Role-Based Access Control** régit qui peut faire quoi. Un `Role` (dans un namespace) ou `ClusterRole` (global) définit des permissions ; un `RoleBinding`/`ClusterRoleBinding` les associe à un utilisateur, groupe ou **ServiceAccount**.

```yaml
kind: Role
metadata: { namespace: prod, name: pod-reader }
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

- Appliquer le **moindre privilège** : éviter le ClusterRole `cluster-admin` et les wildcards `verbs: ["*"]`.
- Chaque Pod utilise un ServiceAccount ; ne montez pas le token si l'app n'appelle pas l'API (`automountServiceAccountToken: false`).
---SECTION---
HEADING: securityContext et Pod Security Standards
BODY:
Le **securityContext** durcit un Pod ou conteneur.

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities: { drop: ["ALL"] }
  seccompProfile: { type: RuntimeDefault }
```

Les **Pod Security Standards** définissent trois profils appliqués au niveau du namespace via le Pod Security Admission :

- **privileged** : sans restriction.
- **baseline** : bloque les élévations connues (host namespaces, privileged...).
- **restricted** : durci, impose `runAsNonRoot`, drop des capabilities, seccomp.

```yaml
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
```

Le mode `enforce` rejette les Pods non conformes ; `warn` et `audit` remontent seulement des alertes.
---SECTION---
HEADING: NetworkPolicy
BODY:
Par défaut, **tous les Pods communiquent librement**. Une **NetworkPolicy** restreint le trafic entrant (ingress) et sortant (egress) par labels. Elle nécessite un plugin CNI qui la supporte (Calico, Cilium...).

```yaml
kind: NetworkPolicy
metadata: { name: api-allow-web, namespace: prod }
spec:
  podSelector:
    matchLabels: { app: api }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { app: web } }
      ports:
        - { protocol: TCP, port: 8080 }
```

- Dès qu'une policy sélectionne un Pod, tout ce qui n'est pas explicitement autorisé est **refusé** pour ce type.
- Bonne pratique : une policy « deny-all » de base, puis autorisations ciblées.
---SECTION---
HEADING: Scheduling : taints, tolerations, affinity
BODY:
Le scheduler place les Pods selon les ressources et des contraintes.

- **Taints/tolerations** : un nœud « taché » repousse les Pods, sauf ceux portant la **toleration** correspondante (ex. nœuds GPU réservés).
- **nodeAffinity** : attire les Pods vers des nœuds selon des labels.
- **podAntiAffinity** : évite de colocaliser des répliques sur le même nœud (haute dispo).

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector: { matchLabels: { app: web } }
          topologyKey: kubernetes.io/hostname
```

`topologySpreadConstraints` répartit finement les Pods entre zones/nœuds.
---SECTION---
HEADING: Rollouts et rollback
BODY:
Un Deployment met à jour progressivement via une stratégie **RollingUpdate**, contrôlée par `maxSurge` (pods en plus) et `maxUnavailable` (pods indisponibles tolérés).

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
```

```bash
kubectl rollout status deployment/web
kubectl rollout undo deployment/web --to-revision=3
kubectl rollout restart deployment/web
```

- `maxUnavailable: 0` garantit zéro interruption (avec de bonnes readiness probes).
- Une readiness probe fiable est essentielle : sans elle, Kubernetes croit le nouveau Pod prêt et coupe l'ancien trop tôt.
- Un **PodDisruptionBudget** protège un minimum de répliques lors des opérations volontaires (drain de nœud).
---SECTION---
HEADING: Diagnostiquer OOMKilled, CrashLoopBackOff, ImagePullBackOff
BODY:
Trois pannes récurrentes, avec leur cause et leur remède.

- **ImagePullBackOff / ErrImagePull** : image introuvable ou registre inaccessible. Vérifier le nom/tag, le `imagePullSecrets`, les droits sur le registre privé.
- **CrashLoopBackOff** : le conteneur démarre puis plante en boucle (le back-off croît jusqu'à 5 min). Causes fréquentes : erreur applicative, config/secret manquant, liveness probe trop stricte.
- **OOMKilled** : le conteneur a dépassé sa **limite mémoire**. Augmenter `limits.memory` ou corriger une fuite.

```bash
kubectl describe pod web-xxxx          # section Events + Last State
kubectl logs web-xxxx --previous       # logs du conteneur qui a planté
```

`Reason: OOMKilled, Exit Code: 137` confirme un dépassement mémoire (137 = 128 + SIGKILL).
---SECTION---
HEADING: Throttling CPU et CFS
BODY:
Une **limite CPU** est appliquée par le **CFS (Completely Fair Scheduler)** du noyau Linux via un quota par période (100 ms par défaut). Le conteneur reçoit `quota = limit × période` de temps CPU par tranche ; une fois épuisé, il est **throttlé** jusqu'à la période suivante.

- Une limite de `500m` = 50 ms de CPU par 100 ms. Un pic de calcul est stoppé net dès le quota atteint, ajoutant de la latence même si le nœud est peu chargé.
- Diagnostiquer via `container_cpu_cfs_throttled_periods_total`.

Bonnes pratiques : définir des **requests** CPU réalistes (pour le scheduling) et être prudent avec des **limits** CPU trop basses sur des charges latency-sensitive. Toujours fixer une **limite mémoire** (incompressible), mais réfléchir à deux fois avant une limite CPU agressive qui provoque du throttling invisible.
===END===
===LESSON===
KEY: ci-cd
TOPIC: ci-cd
TITLE: CI/CD
ICON: 🔄
INTRO: L'intégration continue (CI) et le déploiement continu (CD) automatisent la construction, les tests et la livraison. Un bon pipeline est rapide, reproductible, sécurisé et traçable. Ces leçons couvrent la structure des pipelines, la gestion des secrets, les vulnérabilités spécifiques à la CI (pwn request), les stratégies de déploiement et la sécurité de la chaîne d'approvisionnement.
---SECTION---
HEADING: Anatomie d'un pipeline
BODY:
Un pipeline enchaîne des **étapes** (build, test, scan, deploy), elles-mêmes composées de **jobs** exécutés sur des runners. Les jobs d'une même étape tournent en parallèle ; les étapes s'exécutent en séquence.

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make build
  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: make test
```

- `needs` (GitHub) crée un graphe de dépendances explicite.
- Découpler build et test permet de paralléliser et d'échouer vite (fail fast).
---SECTION---
HEADING: Artefacts et cache
BODY:
Distinguer deux notions souvent confondues :

- **Cache** : accélère les builds en réutilisant des dépendances entre exécutions. Non garanti, peut être évincé.
- **Artefacts** : sorties d'un job (binaires, rapports) transmises aux jobs suivants ou conservées pour téléchargement.

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ hashFiles('package-lock.json') }}
- uses: actions/upload-artifact@v4
  with: { name: build-output, path: dist/ }
```

- La **clé de cache** doit dépendre du lockfile : elle change quand les dépendances changent.
- Ne jamais mettre de secret dans un cache ou un artefact (potentiellement téléchargeable).
---SECTION---
HEADING: Secrets : jamais en clair
BODY:
Les secrets (tokens, clés) doivent passer par le **coffre de secrets** de la plateforme, jamais être écrits dans le YAML ou les logs.

```yaml
steps:
  - run: ./deploy.sh
    env:
      API_TOKEN: ${{ secrets.API_TOKEN }}
```

Bonnes pratiques :
- Les plateformes **masquent** automatiquement les valeurs de secrets dans les logs — mais un `echo $TOKEN | base64` contourne le masquage. Ne jamais afficher de secret, même transformé.
- Portée minimale : préférer des secrets d'**environnement** plutôt que globaux.
- Sur GitLab, marquer les variables **Masked** et **Protected**.
- Faire une **rotation** régulière et révoquer immédiatement tout secret exposé.
- Attention aux forks : par défaut, les secrets ne sont **pas** exposés aux workflows déclenchés par des PR de forks.
---SECTION---
HEADING: OIDC vs clés statiques
BODY:
Stocker des clés cloud long-terme (`AWS_SECRET_ACCESS_KEY`) dans la CI est risqué : elles fuient, ne tournent pas, et donnent un accès permanent. L'**OIDC** permet au runner d'échanger un **token de courte durée** contre des identifiants cloud éphémères, sans secret stocké.

```yaml
permissions:
  id-token: write   # requis pour l'OIDC
  contents: read
jobs:
  deploy:
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/ci-deploy
          aws-region: eu-west-1
```

- Côté cloud, une **relation de confiance** restreint le rôle à un dépôt/branche précis (claim `sub`).
- Avantages : pas de secret à stocker ni à faire tourner, identifiants valables quelques minutes, permissions IAM finement scopées.
---SECTION---
HEADING: pull_request vs pull_request_target (pwn request)
BODY:
Sur GitHub Actions, le déclencheur choisi détermine le **contexte de sécurité**, source d'une vulnérabilité classique surnommée **« pwn request »**.

- **`pull_request`** : le workflow s'exécute avec un token en **lecture seule** et **sans accès aux secrets** pour les PR de forks. Il checkout le code de la PR (non fiable) — c'est sûr.
- **`pull_request_target`** : s'exécute dans le contexte de la **branche de base**, avec **accès aux secrets** et un token en écriture.

Le danger : utiliser `pull_request_target` **et** checkouter le code de la PR, puis l'exécuter (build, tests). Un attaquant soumet une PR malveillante qui s'exécute avec vos secrets.

```yaml
# DANGEREUX
on: pull_request_target
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with: { ref: ${{ github.event.pull_request.head.sha }} }  # code non fiable
      - run: npm ci && npm run build   # exécute du code attaquant avec secrets !
```

Règle : ne jamais checkouter **ni exécuter** le code d'une PR sous `pull_request_target`. Réserver ce trigger à des tâches sans exécution de code non fiable (labels, commentaires).
---SECTION---
HEADING: Épinglage des actions par SHA
BODY:
Référencer une action tierce par tag mouvant (`@v4`) est vulnérable : le mainteneur — ou un attaquant qui compromet le dépôt — peut repointer le tag vers du code malveillant qui s'exécutera dans votre pipeline avec vos secrets.

```yaml
# Fragile : le tag peut être déplacé
- uses: actions/checkout@v4
# Sûr : commit immuable
- uses: actions/checkout@8ade135a41bc03ea155e62e844d188df1ea18608 # v4.1.0
```

- Épingler par **SHA de commit complet** garantit un code immuable.
- Utiliser Dependabot pour proposer des montées de version contrôlées.
- Limiter les actions autorisées dans les paramètres du dépôt/organisation (allow-list).

L'incident tj-actions/changed-files (2025), où un tag a été repointé vers du code exfiltrant des secrets, illustre ce risque.
---SECTION---
HEADING: Environnements et approbations
BODY:
Les **environnements** (production, staging) portent des règles de protection : secrets dédiés, réviseurs obligatoires, délais d'attente, restriction de branches.

```yaml
jobs:
  deploy-prod:
    environment:
      name: production
      url: https://app.example.com
    steps:
      - run: ./deploy.sh
```

- Configurer des **required reviewers** : le job se met en pause jusqu'à approbation manuelle (gate humaine avant prod).
- Restreindre le déploiement aux **branches protégées** uniquement.
- GitLab : `environment:` + `when: manual`.

Cela sépare l'intégration continue automatisée du déploiement, qui peut exiger un contrôle humain.
---SECTION---
HEADING: Stratégies de déploiement : canary, blue-green, rolling
BODY:
Réduire le risque d'une mise en production :

- **Rolling** : remplacement progressif des instances anciennes par les nouvelles. Pas de double infra, mais deux versions coexistent transitoirement.
- **Blue-Green** : deux environnements complets. On bascule tout le trafic de « blue » vers « green » d'un coup ; rollback instantané en repointant vers blue.
- **Canary** : on route un faible pourcentage du trafic (ex. 5 %) vers la nouvelle version, on surveille les métriques, puis on augmente progressivement.

```yaml
strategy:
  canary:
    steps:
      - setWeight: 5
      - pause: { duration: 5m }
      - setWeight: 25
      - setWeight: 100
```

- Canary limite le rayon d'impact d'une régression.
- Blue-green privilégie un rollback immédiat au prix d'un doublement des ressources.
- Toutes ces stratégies s'appuient sur des **health checks** et un **rollback automatisé**.
---SECTION---
HEADING: Chaîne d'approvisionnement : SBOM et signature
BODY:
Sécuriser la **supply chain** logicielle, c'est garantir la traçabilité et l'intégrité des artefacts livrés.

- **SBOM (Software Bill of Materials)** : inventaire de tous les composants et versions (formats SPDX, CycloneDX). Permet de savoir rapidement si l'on est exposé à une CVE.

```bash
syft ghcr.io/org/app:1.0 -o spdx-json > sbom.json
grype sbom:sbom.json          # scan de vulnérabilités
```

- **Signature d'artefacts** avec Sigstore/cosign, idéalement en **keyless** (via OIDC).
- **Provenance / attestations** (SLSA) : prouver comment et où l'artefact a été construit.
- Vérifier la signature **avant déploiement** (policy d'admission) empêche de lancer une image non signée ou falsifiée.
---SECTION---
HEADING: Tests, quality gates et runners
BODY:
Un pipeline doit **bloquer** la livraison si la qualité n'est pas au rendez-vous.

- Structurer les tests en pyramide : beaucoup de tests unitaires (rapides), moins d'intégration, encore moins d'end-to-end.
- Définir des **quality gates** : couverture minimale, zéro vulnérabilité critique, lint sans erreur.
- Intégrer des scans automatiques : **SAST** (code), **SCA** (dépendances), **secret scanning**, **DAST** sur l'app en fonctionnement.
- Coupler aux **branch protection rules** : la fusion est interdite tant que les checks requis ne passent pas.

Sécurité des runners :
- **Runners éphémères** : une machine neuve par job élimine la persistance d'un attaquant.
- **Ne jamais** utiliser de runner self-hosted sur des dépôts publics acceptant des PR de forks.
- Appliquer le **moindre privilège au token** (`permissions: contents: read` par défaut).
- Isoler les jobs de build (code non fiable) des jobs de deploy (secrets sensibles).
===END===
===LESSON===
KEY: terraform
TOPIC: terraform
TITLE: Terraform / IaC
ICON: 🏗️
INTRO: Terraform décrit l'infrastructure comme du code (IaC) de façon déclarative : on définit l'état désiré, Terraform calcule et applique les changements nécessaires. Ces leçons couvrent le langage HCL, les providers, la gestion critique du state, les modules, le cycle de vie des ressources et les bonnes pratiques, d'après la documentation HashiCorp.
---SECTION---
HEADING: HCL, le langage de configuration
BODY:
Terraform utilise **HCL (HashiCorp Configuration Language)**, déclaratif et orienté ressources. Les blocs principaux : `resource`, `variable`, `output`, `data`, `provider`, `module`.

```hcl
variable "instance_type" {
  type    = string
  default = "t3.micro"
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  tags = { Name = "web-server" }
}
```

- Les ressources se **référencent** entre elles (`data.aws_ami.ubuntu.id`), créant un graphe de dépendances que Terraform ordonne automatiquement.
- `terraform fmt` normalise le formatage, `terraform validate` vérifie la syntaxe.
- Un `data` source lit une ressource existante sans la gérer.
---SECTION---
HEADING: Providers
BODY:
Un **provider** est un plugin qui traduit HCL en appels d'API (AWS, Azure, GCP, Kubernetes). On épingle les versions pour la reproductibilité.

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.40" }
  }
}
provider "aws" { region = "eu-west-1" }
```

- `~> 5.40` autorise les correctifs `5.40.x` mais pas `5.41` (opérateur pessimiste).
- `terraform init` télécharge les providers et génère le **`.terraform.lock.hcl`**, qui verrouille versions **et** hachages : à committer.
- Le multi-provider (plusieurs régions/comptes) se gère via des `alias`.
---SECTION---
HEADING: Le state Terraform
BODY:
Terraform maintient un **state** (`terraform.tfstate`), une correspondance entre votre configuration et les ressources réelles. C'est la source de vérité qui permet de calculer les diffs.

- Le state contient des **IDs de ressources**, des métadonnées et parfois des **valeurs sensibles** (mots de passe, clés).
- **Ne jamais** committer `terraform.tfstate` dans Git : risque de fuite de secrets et de corruption en cas d'accès concurrent.
- Ne pas éditer le fichier à la main ; utiliser les commandes `terraform state`.

```bash
terraform state list
terraform state show aws_instance.web
```
---SECTION---
HEADING: Backend distant
BODY:
Par défaut le state est **local**. En équipe, on le stocke dans un **backend distant** : partagé, versionné, chiffré, et support du verrouillage.

```hcl
terraform {
  backend "s3" {
    bucket       = "mon-org-tfstate"
    key          = "prod/network.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true   # verrouillage natif S3 (Terraform >= 1.10)
  }
}
```

- **Avantages** : state unique partagé, chiffrement au repos, versioning (rollback), pas de state sur les postes.
- Autres backends : `gcs`, `azurerm`, HCP Terraform (qui ajoute exécution distante et politique Sentinel/OPA).
- Bonne pratique : un state distinct par environnement (prod/staging) pour limiter le rayon d'impact.
---SECTION---
HEADING: Verrouillage du state (locking)
BODY:
Sans verrou, deux `apply` simultanés corrompraient le state. Le **state locking** garantit qu'une seule opération d'écriture s'exécute à la fois.

- Backend S3 : verrouillage via un fichier de lock natif (`use_lockfile = true`) ou, historiquement, une table DynamoDB.
- Le verrou est **automatique** ; Terraform affiche « Acquiring state lock ».

```bash
# En cas de verrou bloqué après un crash (avec prudence)
terraform force-unlock <LOCK_ID>
```

- Ne recourir à `force-unlock` que si l'on est **certain** qu'aucune autre opération n'est en cours.
- En CI, sérialiser les jobs Terraform sur un même state.
---SECTION---
HEADING: Import et suppression du state
BODY:
Distinguer deux opérations aux effets opposés :

- **`import`** : place une ressource **existante** sous gestion Terraform, sans la recréer.

```hcl
import { to = aws_instance.web, id = "i-0abc123def456" }
```

- **`state rm`** : retire une ressource du state **sans la détruire** dans le cloud. Terraform « oublie » la ressource, qui continue d'exister.

```bash
terraform state rm aws_instance.legacy
```

Points clés : `import` n'écrit pas le HCL correspondant (hors bloc `import` + génération) ; `state rm` est à ne pas confondre avec `destroy`, qui supprime réellement.
---SECTION---
HEADING: Drift et refresh-only
BODY:
Le **drift** (dérive) survient quand l'infrastructure réelle diffère du state — modification manuelle en console, action d'un autre outil.

- `terraform plan` compare state, config et réalité, et signale les écarts.
- Le mode **refresh-only** met à jour le state pour refléter la réalité **sans** modifier l'infrastructure :

```bash
terraform plan -refresh-only
terraform apply -refresh-only
```

- Cela permet d'**accepter** une dérive (adopter le changement manuel dans le state).
- À l'inverse, un `apply` normal **réaligne** le réel sur la config, annulant les changements manuels.
- Bonne pratique : détecter le drift régulièrement (plan planifié en CI) et interdire les changements manuels en production.
---SECTION---
HEADING: Modules, workspaces et lifecycle
BODY:
### Modules
Un **module** est un ensemble réutilisable de ressources, paramétré par des variables et exposant des outputs. **Épingler la version** d'un module distant (`?ref=v1.2.0`).

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.8.1"
  name = "prod-vpc"
  cidr = "10.0.0.0/16"
}
```

### Workspaces
Plusieurs instances de state à partir d'une même configuration. **Limite** : tous partagent la même config et le même backend — HashiCorp déconseille de s'en servir pour isoler prod/staging (préférer des dossiers/backends séparés).

### lifecycle
```hcl
lifecycle {
  prevent_destroy       = true
  create_before_destroy = true
  ignore_changes        = [tags["LastModified"]]
}
```
- `prevent_destroy` : garde-fou contre la destruction d'une ressource critique.
- `create_before_destroy` : évite une interruption lors d'un remplacement.
- `ignore_changes` : ignore les attributs gérés par un autre système (ex. `desired_capacity` d'un autoscaler).
---SECTION---
HEADING: Le workflow plan / apply et les secrets
BODY:
Le cœur de Terraform : prévisualiser avant d'appliquer.

```bash
terraform init
terraform plan -out=tfplan   # calcule et enregistre le plan
terraform apply tfplan       # applique EXACTEMENT le plan enregistré
```

- Toujours **lire le plan** : `+` création, `~` modification en place, `-/+` remplacement (destruction puis recréation, dangereux sur une DB), `-` destruction.
- Appliquer un **plan enregistré** (`-out`) garantit que ce qui est validé en revue est exactement ce qui s'exécute.
- En CI/CD : `plan` sur la PR (revue), `apply` après merge avec approbation manuelle sur les environnements sensibles.

**Secrets dans le state** : le state peut contenir des secrets en clair. Chiffrer le state **au repos** (backend chiffré + KMS) et **restreindre l'accès** (IAM). Marquer les variables `sensitive = true`, ne jamais committer tfstate ni `*.tfvars` secrets. Ajouter tflint + tfsec/Checkov en CI.
===END===
