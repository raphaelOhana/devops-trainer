===LESSON===
KEY: system-design
TOPIC: system-design
TITLE: System Design
ICON: 🗺️
INTRO: Concevoir un système à grande échelle, c'est arbitrer sans cesse entre latence, débit, cohérence, disponibilité et coût. Aucune solution n'est « bonne » dans l'absolu : chaque choix crée un compromis. Ce cours parcourt les briques fondamentales (répartition de charge, cache, stockage, réplication, messagerie) et les lois qui les gouvernent (CAP, PACELC, cohérence de quorum).
---SECTION---
HEADING: Scalabilité verticale vs horizontale
BODY:
La **scalabilité verticale** (scale up) consiste à grossir une machine : plus de CPU, RAM, disque. Simple, mais bornée par le hardware et créant un point de défaillance unique (SPOF).

La **scalabilité horizontale** (scale out) ajoute des machines. C'est la voie du web à grande échelle, mais elle impose de gérer l'état partagé, la cohérence et la coordination réseau.

- **Vertical** : pas de changement applicatif, coût qui explose en fin de courbe, plafond physique.
- **Horizontal** : quasi illimité, tolérant aux pannes, mais exige des services **stateless** et une gestion de session externalisée (Redis, cookies signés).

Règle pratique : on scale verticalement d'abord (moins de complexité), puis horizontalement quand le plafond ou le besoin de résilience l'exige.
---SECTION---
HEADING: Load balancing : L4 vs L7 et algorithmes
BODY:
Un **load balancer** distribue le trafic entre plusieurs instances et retire celles en panne (via health checks).

### L4 vs L7
- **L4 (transport)** : route selon IP/port TCP/UDP, sans lire le contenu. Très rapide, mais aucune décision applicative.
- **L7 (application)** : lit HTTP (URL, headers, cookies). Permet le routage par chemin (`/api` → service A), la terminaison TLS. Plus coûteux en CPU.

### Algorithmes
- **Round robin** : distribution cyclique, simple, suppose des requêtes homogènes.
- **Least connections** : vers l'instance la moins chargée, bon pour des requêtes de durées variables.
- **Weighted** : pondère selon la capacité des serveurs.
- **IP hash / consistent hash** : affinité de session (sticky) sans état côté LB.

On déploie souvent le LB en paire active-passive avec une IP virtuelle (VRRP) pour éviter qu'il devienne lui-même un SPOF.
---SECTION---
HEADING: Reverse proxy vs load balancer
BODY:
Un **reverse proxy** (nginx, Envoy) se place devant les serveurs et gère : terminaison TLS, compression, cache statique, protection (rate limiting), et masquage de la topologie interne.

- Un **load balancer** répartit la charge entre plusieurs instances *identiques*.
- Un **reverse proxy** apporte des services transverses même devant **un seul** backend.

En pratique les deux rôles fusionnent souvent dans le même composant. À ne pas confondre avec le **forward proxy**, qui représente le *client* sortant (ex. proxy d'entreprise), pas le serveur.
---SECTION---
HEADING: Caching : stratégies d'écriture
BODY:
Le cache stocke des données chaudes en mémoire (Redis, Memcached) pour réduire latence et charge sur la base.

### Cache-aside (lazy loading)
L'application gère le cache : lecture → miss → lire la DB → peupler le cache. Le plus courant.
```
val = cache.get(k)
if val is None:
    val = db.read(k)
    cache.set(k, val, ttl=60)
return val
```
Risque : données périmées jusqu'au TTL ; il faut invalider à l'écriture.

### Write-through
Écrit **en même temps** dans le cache et la DB. Cache toujours cohérent, mais latence d'écriture accrue.

### Write-back (write-behind)
Écrit dans le cache puis **de façon asynchrone** dans la DB. Écritures très rapides, mais risque de perte de données si le cache tombe avant le flush. Réservé aux cas tolérant une perte (compteurs, métriques).
---SECTION---
HEADING: Caching : éviction, invalidation et pièges
BODY:
### Politiques d'éviction
- **LRU** (Least Recently Used) : évince l'entrée la moins récemment accédée. Défaut le plus courant.
- **LFU** (Least Frequently Used) : évince la moins fréquemment accédée ; sensible aux pics anciens.
- **TTL / FIFO** : simples, sans notion d'usage.

### Invalidation
« Il n'y a que deux choses difficiles en informatique : l'invalidation de cache et nommer les choses. » Stratégies : TTL court, invalidation explicite à l'écriture, versionnage de clé.

### Pièges
- **Hot key** : une clé ultra-populaire sature un seul nœud. Remèdes : réplication de la clé, cache local (L1) devant Redis.
- **Dogpile / cache stampede** : à l'expiration d'une clé chaude, mille requêtes frappent la DB simultanément. Remèdes : **lock** de recomputation (un seul recalcule), **early recompute** probabiliste avant expiration, ou « stale-while-revalidate ».
---SECTION---
HEADING: CDN : push vs pull
BODY:
Un **CDN** réplique le contenu sur des serveurs edge proches des utilisateurs, réduisant latence et charge d'origine. Idéal pour statique (images, JS, CSS, vidéo).

- **Pull CDN** : l'edge récupère le contenu depuis l'origine au **premier** accès (cache miss), puis le sert selon un TTL. Simple à opérer ; premier utilisateur pénalisé ; bon pour trafic élevé et contenu changeant.
- **Push CDN** : on **pousse** activement le contenu vers le CDN. Contrôle fin, pas de miss initial ; mais gestion manuelle des mises à jour. Bon pour gros fichiers rarement modifiés.

Le contenu doit rester cacheable : attention aux URL versionnées (`app.a1b2.js`) pour forcer le rafraîchissement lors des déploiements.
---SECTION---
HEADING: SQL vs NoSQL
BODY:
### SQL (relationnel)
Schéma fixe, transactions **ACID**, jointures, langage déclaratif puissant. Idéal quand les relations et la cohérence forte comptent (finance, commandes). Scale verticalement ou via réplication/sharding (plus dur).

### NoSQL — familles
- **Clé-valeur** (Redis, DynamoDB) : accès O(1) par clé, sessions, caches.
- **Document** (MongoDB) : JSON flexible, agrégats auto-contenus.
- **Colonne large** (Cassandra, HBase) : écritures massives, séries temporelles.
- **Graphe** (Neo4j) : relations denses (réseaux sociaux).

NoSQL privilégie souvent **BASE** (Basically Available, Soft state, Eventual consistency) : scale horizontal facile, schéma flexible, mais jointures et transactions multi-clés limitées.

Choix : commencez SQL par défaut ; passez NoSQL pour un besoin d'échelle, de débit d'écriture, ou un modèle de données spécifique clairement identifié.
---SECTION---
HEADING: Indexation : B-tree, hash, LSM
BODY:
Un index accélère les lectures au prix d'écritures et d'espace supplémentaires.

- **B-tree / B+tree** : équilibré, `O(log n)` pour recherche/insertion, supporte les **requêtes par plage** (`WHERE age > 30`) et le tri. Défaut des bases relationnelles.
- **Index hash** : `O(1)` en moyenne pour l'égalité stricte (`= x`), mais **inutile** pour les plages ou le tri.
- **LSM-tree** (Log-Structured Merge) : écritures séquentielles dans une memtable, flush en SSTables triées, compaction en arrière-plan. Écritures très rapides (Cassandra, RocksDB) ; lectures potentiellement plus lentes (plusieurs niveaux + bloom filters).

Règle : B-tree favorise la lecture et les plages ; LSM favorise le débit d'écriture.
---SECTION---
HEADING: Réplication : master-slave et master-master
BODY:
La **réplication** copie les données sur plusieurs nœuds pour la disponibilité et le passage à l'échelle en lecture.

### Master-slave (primary-replica)
Écritures sur le master, lectures réparties sur les réplicas. Excellent pour des charges **read-heavy**. Défis : **lag de réplication** (lecture de données périmées), et promotion d'un replica en cas de panne du master.

### Master-master (multi-primary)
Plusieurs nœuds acceptent les écritures. Améliore la disponibilité en écriture et la latence géographique, mais introduit des **conflits d'écriture** à résoudre (last-write-wins, CRDT).

- **Réplication synchrone** : le master attend la confirmation des réplicas → cohérence forte, latence accrue.
- **Réplication asynchrone** : réponse immédiate → rapide, mais risque de perte des dernières écritures si le master tombe.
---SECTION---
HEADING: Sharding, shard key et fédération
BODY:
Le **sharding** partitionne horizontalement les données sur plusieurs bases, chacune détenant un sous-ensemble.

### Choix de la shard key
Clé critique et difficile à changer après coup. Une mauvaise clé crée des **hot shards** (déséquilibre).
- **Par plage** : `user_id 0–1M` sur shard A. Simple, bon pour les plages, mais risque de points chauds.
- **Par hash** : `hash(key) % N`. Distribution uniforme, mais les requêtes par plage éclatent sur tous les shards, et `% N` casse au **rebalancing** (→ consistent hashing).
- **Par répertoire** : table de correspondance clé→shard (souple, mais SPOF potentiel).

Coûts : jointures inter-shards difficiles, transactions distribuées, re-sharding complexe.

### Fédération
La **fédération** partitionne **par fonction** : une DB par domaine (users, produits, commandes). Réduit la charge par base, mais complique les requêtes joignant plusieurs domaines.
---SECTION---
HEADING: CAP et PACELC
BODY:
### Théorème CAP
En présence d'une **partition réseau (P)**, un système distribué doit choisir entre :
- **CP** : privilégier la **cohérence**, quitte à refuser des requêtes (indisponibilité). Ex. HBase, etcd.
- **AP** : privilégier la **disponibilité**, quitte à servir des données potentiellement périmées. Ex. Cassandra, DynamoDB.

La partition n'est pas optionnelle : sur un réseau réel, on ne « choisit » pas d'abandonner P. CAP ne s'applique **que pendant** une partition.

### PACELC
Extension : **si P**artition → choix **A**vailability/**C**onsistency ; **E**lse (fonctionnement normal) → choix **L**atency/**C**onsistency. Reconnaît qu'en régime nominal, la cohérence forte coûte de la **latence** (attendre les réplicas). Ex. Dynamo est **PA/EL**, une base fortement cohérente est **PC/EC**.
---SECTION---
HEADING: Modèles de cohérence et quorum
BODY:
- **Cohérence forte** : toute lecture voit la dernière écriture. Simple à raisonner, coûteux en latence/disponibilité.
- **Cohérence éventuelle** : les réplicas convergent « à terme » si les écritures cessent. Haute disponibilité, mais lectures potentiellement périmées.
- **Read-your-writes, monotonic reads** : garanties intermédiaires utiles côté session.

### Quorum
Avec **N** réplicas, **W** confirmations en écriture, **R** en lecture :
- **R + W > N** garantit qu'une lecture recoupe au moins une écriture récente → cohérence forte.
- **R + W ≤ N** : haute disponibilité, cohérence éventuelle.

Exemple : `N=3, W=2, R=2` → 2+2 > 3, on tolère la panne d'un nœud tout en restant cohérent.
---SECTION---
HEADING: Files de messages et Kafka
BODY:
Les **files** découplent producteurs et consommateurs, absorbent les pics et permettent le traitement asynchrone.

- **Message queue** classique (RabbitMQ, SQS) : le message est généralement supprimé après consommation ; souvent une seule consommation.
- **Log distribué** (Kafka) : les messages sont **persistés** dans un log partitionné et ordonné ; les consommateurs suivent un **offset** et peuvent **rejouer** l'historique. Plusieurs groupes de consommateurs lisent indépendamment.

Kafka garantit l'ordre **au sein d'une partition** (pas globalement). La clé de partitionnement détermine l'ordonnancement (ex. tous les événements d'un `user_id` sur la même partition).

Sémantiques : **at-most-once**, **at-least-once** (défaut → exige l'idempotence côté consommateur), **exactly-once** (coûteux).
---SECTION---
HEADING: Back-pressure et rate limiting
BODY:
La **back-pressure** est le signal qu'un consommateur envoie en amont quand il est saturé, pour ralentir la production. Sans elle, un système accumule des messages jusqu'à l'OOM.

### Rate limiting — algorithmes
- **Token bucket** : un seau se remplit de jetons à taux constant ; chaque requête consomme un jeton. Autorise des **rafales** jusqu'à la capacité du seau. Le plus utilisé.
- **Leaky bucket** : les requêtes sortent à débit constant (file FIFO) ; lisse le trafic, pas de rafale.
- **Fixed window** : compteur par fenêtre (ex. 100/min). Simple, mais pic possible à la frontière de deux fenêtres (jusqu'à 2× la limite).
- **Sliding window** : lisse la frontière en pondérant la fenêtre précédente ; plus précis, plus coûteux.
---SECTION---
HEADING: Consistent hashing
BODY:
Le hachage naïf `hash(key) % N` **remappe presque toutes les clés** quand N change → invalidation massive de cache, re-shard coûteux.

Le **consistent hashing** place nœuds et clés sur un **anneau** [0, 2³²). Une clé appartient au premier nœud rencontré dans le sens horaire. Ajouter/retirer un nœud ne déplace que `K/N` clés en moyenne, pas toutes.

- **Nœuds virtuels (vnodes)** : chaque nœud physique occupe plusieurs positions sur l'anneau → distribution plus uniforme et rééquilibrage plus lisse à la panne.

Usage : caches distribués (Memcached), Cassandra, DynamoDB, sharding de bases.
---SECTION---
HEADING: Idempotence, structures probabilistes, ID
BODY:
### Idempotence
Une opération est **idempotente** si l'exécuter N fois équivaut à l'exécuter une fois. Indispensable avec les retries et le at-least-once. Technique : **clé d'idempotence** (le client envoie un UUID, le serveur déduplique).

### Structures probabilistes (mémoire minime, réponse approchée)
- **Bloom filter** : « x est-il *peut-être* présent ou *certainement* absent ? ». Faux positifs possibles, jamais de faux négatif. Usage : éviter des lectures disque inutiles (LSM).
- **HyperLogLog** : cardinalité (nombre d'éléments distincts) avec ~1,5 KB pour des milliards, erreur ~2 %.
- **Count-Min Sketch** : fréquence approchée (heavy hitters), surestime jamais sous-estime.

### Génération d'ID — Snowflake
ID 64 bits triable dans le temps : `[timestamp | machine id | séquence]`. Unique, ordonné, généré sans coordination centrale — meilleur qu'un auto-increment centralisé pour un système distribué.
---SECTION---
HEADING: CDC, outbox et cohérence entre systèmes
BODY:
Problème du **dual write** : écrire dans la DB **et** publier un événement dans Kafka ne sont pas atomiques → si l'un échoue, incohérence.

### Pattern Outbox
Dans **la même transaction** que la donnée métier, on écrit l'événement dans une table `outbox`. Un processus séparé lit cette table et publie dans le broker. L'atomicité DB garantit qu'aucun événement n'est perdu ni orphelin.

### CDC (Change Data Capture)
Capture les changements en lisant le **log de transactions** de la base (binlog MySQL, WAL Postgres) via un outil comme Debezium, et les émet comme flux d'événements. Permet d'alimenter caches, index de recherche, data warehouses sans modifier l'application. Souvent combiné avec l'outbox.
---SECTION---
HEADING: Disponibilité, SLA et fiabilité
BODY:
La **disponibilité** se mesure en « neufs » :
- **99,9 %** (three nines) ≈ 8,7 h d'indisponibilité/an.
- **99,99 %** ≈ 52 min/an.
- **99,999 %** ≈ 5 min/an.

### Composition
- **En série** : `A × B`. Deux composants à 99,9 % en série → 99,8 %. Chaque dépendance dégrade la disponibilité.
- **En parallèle** (redondance) : `1 − (1−A)(1−B)`. Deux composants à 99,9 % en parallèle → 99,9999 %. La redondance **augmente** la disponibilité.

### Vocabulaire
- **SLA** : engagement contractuel (avec pénalités).
- **SLO** : objectif interne visé.
- **SLI** : la métrique mesurée.

Concevez pour la panne : redondance, health checks, dégradation gracieuse, et évitez les SPOF.
===END===
===LESSON===
KEY: architecture
TOPIC: architecture
TITLE: Architecture logicielle
ICON: 🏛️
INTRO: L'architecture logicielle décide comment découper un système en composants, comment ils communiquent et comment ils survivent aux pannes. Ce cours couvre le spectre monolithe ↔ microservices, les styles de communication, les transactions distribuées, les patterns de résilience et les fondations transactionnelles (MVCC, isolation).
---SECTION---
HEADING: Monolithe vs microservices
BODY:
### Monolithe
Une seule unité déployable. **Avantages** : simplicité de développement, débogage et déploiement, appels de fonctions locaux (pas de latence réseau), transactions ACID triviales. **Inconvénients** : couplage fort, un bug peut tout faire tomber, déploiement global pour un petit changement, scaling « tout ou rien ».

### Microservices
Services indépendants, déployables et scalables séparément, autour de capacités métier (bounded contexts). **Avantages** : autonomie des équipes, scaling ciblé, isolation des pannes, liberté technologique. **Inconvénients** : complexité opérationnelle (réseau, observabilité), cohérence des données distribuée, latence, tests d'intégration difficiles.

Conseil largement partagé : **commencer monolithe** (bien modularisé), extraire des services quand la charge organisationnelle ou technique le justifie. Les microservices résolvent un problème d'**échelle organisationnelle** autant que technique.
---SECTION---
HEADING: API Gateway
BODY:
L'**API Gateway** est le point d'entrée unique devant les microservices. Elle prend en charge des responsabilités transverses :

- **Routage** vers le bon service, **agrégation** de plusieurs appels en une réponse.
- **Authentification / autorisation** centralisée, **rate limiting**, terminaison TLS.
- **Traduction de protocole** (REST public → gRPC interne), versionnage, cache.

Bénéfice : les clients ne connaissent pas la topologie interne. Risque : elle peut devenir un **goulot d'étranglement** ou un SPOF (à déployer en redondance), et un « fourre-tout » si on y met de la logique métier.

Variante **Backend-for-Frontend (BFF)** : une gateway par type de client (web, mobile) pour des réponses taillées sur mesure.
---SECTION---
HEADING: Service mesh et sidecar
BODY:
Un **service mesh** (Istio, Linkerd) gère la communication **service-à-service** en la sortant du code applicatif.

### Pattern Sidecar
Un proxy (ex. Envoy) est déployé **à côté** de chaque service (même pod). Tout le trafic passe par lui. Il fournit, sans toucher au code métier :
- **mTLS** (chiffrement + identité entre services), autorisation.
- **Retry, timeout, circuit breaking, load balancing** côté client.
- **Observabilité** : métriques, traces, logs uniformes.

Architecture : le **data plane** (les sidecars) transporte le trafic ; le **control plane** les configure. Coût : latence supplémentaire par hop et complexité opérationnelle. À réserver aux flottes de services conséquentes.
---SECTION---
HEADING: Styles de communication : REST, gRPC, GraphQL
BODY:
- **REST** : ressources sur HTTP, verbes standard, sans état, cacheable. Simple, universel. Défauts : **over/under-fetching**, plusieurs allers-retours.
- **gRPC** : RPC binaire sur HTTP/2 avec **Protobuf**. Très performant, contrat typé, streaming bidirectionnel. Idéal **interne**. Moins adapté au navigateur.
- **GraphQL** : le client demande **exactement** les champs voulus en une requête. Résout l'over/under-fetching, idéal pour agréger plusieurs sources. Coûts : cache HTTP plus difficile, requêtes coûteuses à protéger, problème **N+1** côté résolveurs.

Règle : REST pour des API publiques simples, gRPC en interne haute performance, GraphQL pour des clients aux besoins de données variés.
---SECTION---
HEADING: Communication temps réel : SSE et WebSocket
BODY:
- **Polling** : le client redemande périodiquement. Simple mais latence et charge inutiles. Le **long polling** garde la connexion ouverte jusqu'à une donnée.
- **SSE (Server-Sent Events)** : canal **unidirectionnel** serveur → client sur une connexion HTTP durable. Reconnexion automatique, simple. Idéal pour flux de notifications, feed. Ne remonte pas d'événements client.
- **WebSocket** : canal **bidirectionnel** full-duplex persistant. Idéal chat, jeux, édition collaborative. Plus lourd : les connexions sont *stateful* → adhérence au serveur, besoin d'un backplane pub/sub (Redis) pour scaler.

Choix : SSE si le serveur pousse seulement ; WebSocket si dialogue bidirectionnel réel.
---SECTION---
HEADING: Transactions distribuées : 2PC
BODY:
Sans base unique, une transaction couvrant plusieurs services perd l'atomicité ACID native.

### Two-Phase Commit (2PC)
Un **coordinateur** orchestre :
1. **Prepare** : chaque participant verrouille et répond « prêt » ou « refus ».
2. **Commit / Abort** : si tous sont prêts, le coordinateur ordonne le commit ; sinon l'abort.

Garantit l'atomicité forte, **mais** : **bloquant** (si le coordinateur tombe entre les phases, les participants restent verrouillés), mauvaise **disponibilité** et scalabilité (verrous longs, synchronisme). Peu utilisé dans les microservices modernes ; on lui préfère souvent les Sagas.
---SECTION---
HEADING: Saga et pattern Outbox
BODY:
### Saga
Une transaction métier longue est décomposée en une **séquence de transactions locales**, chacune publiant un événement déclenchant la suivante. En cas d'échec à l'étape k, on exécute des **transactions de compensation** (annuler le débit, libérer le stock) pour revenir en arrière.

- **Chorégraphie** : chaque service réagit aux événements des autres. Découplé, mais logique globale difficile à suivre.
- **Orchestration** : un orchestrateur central pilote les étapes. Plus lisible et testable, mais composant central à maintenir.

Une Saga offre une **cohérence éventuelle**, pas d'isolation : des états intermédiaires sont visibles (prévoir des états « en attente »).

### Outbox
Pour publier de façon fiable un événement **et** committer la donnée atomiquement, on écrit l'événement dans une table `outbox` dans la même transaction locale, relayée ensuite vers le broker (souvent via CDC). C'est la brique qui rend les Sagas fiables.
---SECTION---
HEADING: Event Sourcing et CQRS
BODY:
### Event Sourcing
Au lieu de stocker l'**état courant**, on stocke la **séquence immuable d'événements** qui l'ont produit (`CompteCréé`, `Déposé 100`, `Retiré 30`). L'état se **rejoue** depuis les événements.
- **Atouts** : audit complet, historique, capacité à reconstruire n'importe quel état passé, débogage.
- **Coûts** : complexité, requêtes « état courant » coûteuses (→ snapshots), versionnage des événements.

### CQRS (Command Query Responsibility Segregation)
Séparer le modèle d'**écriture** (commandes) du modèle de **lecture** (requêtes), potentiellement dans des stores différents et optimisés séparément. Souvent couplé à l'Event Sourcing : les événements alimentent des **vues de lecture** dénormalisées (projections).
- **Atout** : lecture et écriture scalent indépendamment.
- **Coût** : cohérence éventuelle entre écriture et vues, duplication. À n'employer que si le déséquilibre lecture/écriture le justifie.
---SECTION---
HEADING: Résilience : Circuit Breaker
BODY:
Quand un service appelé est en panne, continuer à l'appeler gaspille des ressources et propage la défaillance (**cascade**). Le **circuit breaker** enveloppe l'appel avec trois états :

- **Closed** : les appels passent ; on compte les échecs.
- **Open** : au-delà d'un seuil d'échecs, on **court-circuite** : échec immédiat (fail-fast) sans appeler, pendant un cooldown. Cela laisse le service se rétablir.
- **Half-Open** : après le délai, on laisse passer **quelques** appels de test. S'ils réussissent → Closed ; sinon → Open.

Bénéfice : évite l'effondrement en cascade et libère les threads bloqués. À combiner avec un **fallback** (valeur par défaut, cache, réponse dégradée).
---SECTION---
HEADING: Résilience : Bulkhead, Retry, Timeout
BODY:
### Bulkhead (cloison)
Comme les compartiments étanches d'un navire : on **isole** les ressources par dépendance (pools de threads/connexions séparés). Si un service sature son pool, les autres continuent.

### Timeout
Toujours borner les appels réseau. Sans timeout, un service lent bloque les threads et provoque un épuisement des ressources. Régler selon les percentiles de latence (ex. p99).

### Retry + jitter
Réessayer les erreurs **transitoires** — mais :
- Uniquement sur des opérations **idempotentes**.
- **Exponential backoff** : délais croissants (1s, 2s, 4s…) pour ne pas marteler un service en difficulté.
- **Jitter** (aléa ajouté au délai) : évite le **thundering herd** où tous les clients réessaient en même temps.
- Plafonner le nombre de tentatives ; combiner avec un circuit breaker.
---SECTION---
HEADING: Stateless et méthodologie 12-Factor
BODY:
Un service **stateless** ne conserve aucun état de session en mémoire locale : n'importe quelle instance peut traiter n'importe quelle requête. L'état va dans un store partagé (DB, Redis). C'est le prérequis du **scaling horizontal** et du **basculement** transparent.

### Extraits des 12 factors (apps cloud-native)
- **Config** dans l'**environnement**, pas dans le code.
- **Backing services** (DB, cache, queue) traités comme des ressources attachées, échangeables via config.
- **Processes** stateless et « share-nothing ».
- **Disposability** : démarrage rapide, arrêt gracieux (SIGTERM).
- **Logs** comme flux d'événements (stdout), pas des fichiers gérés par l'app.

Ces principes rendent une application portable, scalable et résiliente.
---SECTION---
HEADING: Idempotence dans les systèmes distribués
BODY:
Dans un système distribué, les messages sont **rejoués** (at-least-once), les clients **réessaient** après un timeout ambigu. Sans idempotence, on double un paiement, on crée deux commandes.

### Techniques
- **Clé d'idempotence** : le client génère un identifiant unique par opération ; le serveur stocke le résultat et **renvoie le même** pour une clé déjà vue.
- **Déduplication** : rejeter les messages déjà traités (table de `processed_ids`).
- **Opérations naturellement idempotentes** : `SET x = 5` (idempotent) plutôt que `x += 5` (non idempotent).
- **Upsert** conditionnel, verrouillage optimiste par version.

C'est le pilier discret qui rend fiables retries, files, Sagas et webhooks.
---SECTION---
HEADING: MVCC et niveaux d'isolation
BODY:
### MVCC (Multi-Version Concurrency Control)
Plutôt que de verrouiller en lecture, la base conserve **plusieurs versions** d'une ligne. Chaque transaction voit un **snapshot** cohérent à son instant de démarrage. Résultat : **les lecteurs ne bloquent pas les écrivains** et inversement (Postgres, MySQL/InnoDB, Oracle).

### Niveaux d'isolation (SQL) et anomalies évitées
- **Read Uncommitted** : lit des données non committées → **dirty read** possible.
- **Read Committed** : ne lit que du committé ; **non-repeatable read** encore possible. (Défaut Postgres.)
- **Repeatable Read** : mêmes lignes relues à l'identique ; **phantom reads** possibles.
- **Serializable** : équivaut à une exécution séquentielle ; élimine toutes les anomalies, au prix de performance/contention.

Compromis : plus l'isolation est forte, plus la cohérence est bonne mais plus la concurrence est bridée.
===END===
===LESSON===
KEY: algorithms
TOPIC: algorithms
TITLE: Algorithmes & structures
ICON: 🧠
INTRO: Réussir un problème algorithmique, c'est surtout **reconnaître le pattern** derrière l'énoncé. Ce cours présente les patterns les plus rentables : pour chacun, quand l'appliquer, l'idée clé et la complexité. La maîtrise vient de savoir *pourquoi* un pattern transforme un `O(n²)` en `O(n log n)` ou `O(n)`.
---SECTION---
HEADING: Complexité : Big-O
BODY:
La **notation Big-O** décrit comment le coût croît avec la taille d'entrée `n`, dans le **pire cas asymptotique** (on ignore constantes et termes dominés).

### Hiérarchie (du meilleur au pire)
`O(1)` < `O(log n)` < `O(n)` < `O(n log n)` < `O(n²)` < `O(2ⁿ)` < `O(n!)`

- `O(log n)` : on **divise** l'espace à chaque étape (binary search).
- `O(n log n)` : tri efficace, diviser-pour-régner.
- `O(2ⁿ)` : explorer tous les sous-ensembles ; `O(n!)` : toutes les permutations.

Distinguer **temps** et **espace**. Attention à l'analyse **amortie** : un `append` sur tableau dynamique est `O(1)` amorti malgré des redimensionnements `O(n)` occasionnels. Repère pratique : pour `n ≤ 10⁶`, visez `O(n)` ou `O(n log n)` ; `O(n²)` ne passe que pour `n` de quelques milliers.
---SECTION---
HEADING: Two pointers
BODY:
**Quand** : tableau/chaîne **trié** ou problème symétrique où l'on rapproche deux extrémités, ou détection de doublon/palindrome.

**Idée** : deux indices avançant l'un vers l'autre (ou dans le même sens) éliminent le besoin d'une double boucle.

```
l, r = 0, len(a)-1
while l < r:
    s = a[l] + a[r]
    if s == target: return (l, r)
    if s < target:  l += 1   # besoin plus grand
    else:           r -= 1   # besoin plus petit
```

**Complexité** : `O(n)` temps, `O(1)` espace — contre `O(n²)` en force brute. Variantes : suppression de doublons en place, `3Sum` (fixer un élément + two pointers).
---SECTION---
HEADING: Sliding window
BODY:
**Quand** : sous-tableau/sous-chaîne **contigu** optimal (plus longue sous-chaîne sans répétition, plus petit sous-tableau de somme ≥ k).

**Idée** : maintenir une fenêtre `[left, right]` ; étendre `right`, et **contracter** `left` tant qu'une contrainte est violée. Chaque élément entre et sort **une fois**.

```
seen = {}; left = 0; best = 0
for right, c in enumerate(s):
    if c in seen and seen[c] >= left:
        left = seen[c] + 1
    seen[c] = right
    best = max(best, right - left + 1)
```

**Complexité** : `O(n)` au lieu de `O(n²)`. Clé : reconnaître « contigu » + « optimiser une longueur/somme ».
---SECTION---
HEADING: Prefix sum
BODY:
**Quand** : nombreuses requêtes de **somme sur des plages**, ou compter des sous-tableaux de somme donnée.

**Idée** : précalculer `P[i] = a[0] + … + a[i-1]`. La somme de `[i, j]` devient `P[j+1] − P[i]` en `O(1)`.

Combiné à une **hashmap** des préfixes vus, on compte les sous-tableaux de somme `k` en une passe :
```
count = 0; s = 0; freq = {0: 1}
for x in a:
    s += x
    count += freq.get(s - k, 0)   # préfixe manquant vu ?
    freq[s] = freq.get(s, 0) + 1
```

**Complexité** : construction `O(n)`, requête `O(1)`. Généralise en 2D et en **difference array**.
---SECTION---
HEADING: Fast & slow pointers
BODY:
**Quand** : listes chaînées (cycle, milieu, k-ème depuis la fin) ou suites fonctionnelles.

**Idée** : deux pointeurs à **vitesses différentes**. Le rapide avance de 2, le lent de 1.

- **Détection de cycle (Floyd)** : s'ils se rencontrent, il y a un cycle. Pour trouver l'entrée du cycle : replacer un pointeur au début et avancer les deux d'un pas.
- **Milieu de liste** : quand le rapide atteint la fin, le lent est au milieu.

```
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
    if slow is fast: return True   # cycle
```

**Complexité** : `O(n)` temps, `O(1)` espace (contre un set `O(n)` mémoire).
---SECTION---
HEADING: Binary search (et recherche sur la réponse)
BODY:
**Quand** : espace **trié** ou **monotone** — dès qu'un prédicat passe de faux à vrai une seule fois.

```
lo, hi = 0, len(a) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    if a[mid] == t: return mid
    if a[mid] < t: lo = mid + 1
    else:          hi = mid - 1
```

### Binary search sur la réponse
Puissant : quand on cherche une valeur optimale et qu'on peut **vérifier** en `O(n)` si un candidat `x` est faisable de façon **monotone** (faisable pour `x` ⟹ faisable pour tout `> x`). Exemples : « capacité minimale pour livrer en D jours », « plus petite vitesse pour finir à temps ». On binaire-cherche sur la réponse, pas sur l'index.

**Complexité** : `O(log n)` (ou `O(n log(max))` avec vérification). Piège : `mid = lo + (hi-lo)//2` évite l'overflow.
---SECTION---
HEADING: Monotonic stack
BODY:
**Quand** : « prochain élément plus grand/petit », températures, histogramme, plages où un élément « domine ».

**Idée** : une pile qui reste **monotone** (croissante ou décroissante). En dépilant les éléments violant la monotonie, chaque élément est empilé et dépilé **une fois**.

```
res = [0] * len(t); stack = []   # indices
for i, temp in enumerate(t):
    while stack and t[stack[-1]] < temp:
        j = stack.pop()
        res[j] = i - j
    stack.append(i)
```

**Complexité** : `O(n)` au lieu de `O(n²)`. Signal : « pour chaque élément, trouver le prochain/précédent qui satisfait une comparaison ».
---SECTION---
HEADING: Intervals
BODY:
**Quand** : réunions, plages de temps, fusion/insertion/chevauchement d'intervalles.

**Idée** : **trier par début** (ou par fin selon le problème), puis balayer en une passe.

```
intervals.sort(key=lambda x: x[0])
merged = [intervals[0]]
for s, e in intervals[1:]:
    if s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
```

- **Salles de réunion minimales** : un **min-heap** des fins → nombre max de chevauchements simultanés.

**Complexité** : `O(n log n)` dominée par le tri.
---SECTION---
HEADING: Heap et quickselect
BODY:
### Heap (tas binaire)
File de priorité : insertion et extraction du min/max en `O(log n)`, accès au sommet `O(1)`.

**Quand** : « top-k », k-ème plus grand, flux de données, fusion de k listes triées.
- **k plus grands** : maintenir un **min-heap de taille k** → `O(n log k)`, meilleur que trier tout.
- **Médiane d'un flux** : deux heaps (max-heap des petits, min-heap des grands).

### Quickselect
Pour **le** k-ème élément (sans les ordonner tous) : partitionnement à la Quicksort, mais on ne récurse que d'un côté. **Complexité** : `O(n)` en moyenne, `O(n²)` pire cas (atténué par pivot aléatoire).
---SECTION---
HEADING: Trie
BODY:
**Quand** : préfixes, autocomplétion, dictionnaire, correcteur.

**Idée** : arbre où chaque nœud représente un caractère ; un chemin de la racine à un nœud « fin de mot » = un mot. Les préfixes communs partagent des nœuds.

```
class Trie:
    def __init__(self): self.root = {}
    def insert(self, w):
        node = self.root
        for c in w:
            node = node.setdefault(c, {})
        node['$'] = True   # marqueur fin de mot
```

**Complexité** : insertion/recherche en `O(L)` (L = longueur du mot), **indépendant** du nombre de mots stockés — là où une hashmap ne donne pas les préfixes efficacement. Coût : mémoire.
---SECTION---
HEADING: Union-Find (Disjoint Set)
BODY:
**Quand** : composantes connexes, détection de cycle dans un graphe **non orienté**, regroupement dynamique, Kruskal (MST).

**Idée** : chaque élément pointe vers un représentant. `find(x)` remonte à la racine ; `union(a, b)` relie deux ensembles.

Optimisations essentielles : **path compression** (`find` aplatit le chemin) et **union by rank/size**.

```
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]  # compression
        x = parent[x]
    return x
```

**Complexité** : quasi `O(α(n))` par opération (≈ constante). Idéal quand les regroupements arrivent dynamiquement.
---SECTION---
HEADING: Tri topologique
BODY:
**Quand** : ordonner des tâches avec **dépendances** dans un graphe **orienté acyclique (DAG)** — planning de cours, build, ordonnancement.

### Kahn (BFS)
Calculer le **degré entrant** ; enfiler ceux à 0 ; à chaque dépilement, décrémenter les voisins et enfiler ceux qui tombent à 0.
```
queue = [n for n in nodes if indeg[n] == 0]
order = []
while queue:
    n = queue.pop()
    order.append(n)
    for m in adj[n]:
        indeg[m] -= 1
        if indeg[m] == 0: queue.append(m)
# si len(order) < N → cycle
```

**Complexité** : `O(V + E)`. Bonus : détecte les **cycles**.
---SECTION---
HEADING: BFS et DFS
BODY:
### BFS (largeur)
File (queue), explore niveau par niveau. **Quand** : **plus court chemin en nombre d'arêtes** (graphe non pondéré), distance minimale.

### DFS (profondeur)
Pile (ou récursion). **Quand** : explorer entièrement, détecter des cycles, backtracking, composantes connexes, tri topologique.

**Complexité** : `O(V + E)` tous deux ; mémoire `O(V)`. Choix : **BFS pour le plus court chemin non pondéré**, DFS pour l'exploration exhaustive.
---SECTION---
HEADING: Plus courts chemins : Dijkstra et Bellman-Ford
BODY:
### Dijkstra
Plus court chemin depuis une source, poids **positifs**. Min-heap : extraire le nœud le plus proche, relâcher ses voisins.
```
pq = [(0, src)]; dist = {src: 0}
while pq:
    d, u = heappop(pq)
    for v, w in adj[u]:
        if d + w < dist.get(v, inf):
            dist[v] = d + w
            heappush(pq, (dist[v], v))
```
**Complexité** : `O((V + E) log V)`. **Échoue avec des poids négatifs.**

### Bellman-Ford
Gère les **poids négatifs** et **détecte les cycles négatifs**. Relâche **toutes** les arêtes `V−1` fois. `O(V·E)`, plus lent. (Pour tous-vers-tous : Floyd-Warshall `O(V³)`.)
---SECTION---
HEADING: Backtracking
BODY:
**Quand** : générer **toutes** les solutions ou explorer un espace combinatoire — permutations, combinaisons, sous-ensembles, N-Reines, Sudoku.

**Idée** : construire une solution **incrémentalement** ; à chaque étape, essayer un choix, **récurser**, puis **défaire** le choix (backtrack). **Élaguer** (pruning) dès qu'une branche ne peut aboutir.

```
def backtrack(path, choices):
    if is_solution(path):
        results.append(path[:]); return
    for c in choices:
        if not valid(c, path): continue   # élagage
        path.append(c)
        backtrack(path, remaining(choices, c))
        path.pop()                         # défaire
```

**Complexité** : souvent exponentielle, mais l'élagage la réduit fortement. Signal : « lister/compter toutes les configurations valides ».
---SECTION---
HEADING: Programmation dynamique
BODY:
**Quand** : **sous-problèmes qui se chevauchent** + **sous-structure optimale**. On mémorise pour ne pas recalculer. Signal : « nombre de façons », « min/max coût », choix optimaux séquentiels.

Deux styles : **top-down** (récursion + mémoïsation) ou **bottom-up** (table itérative).

- **1D** : *House Robber*, *Coin Change*. État = un index. Ex. `dp[i] = max(dp[i-1], dp[i-2] + a[i])`.
- **2D / grille** : *Unique Paths*, *Edit Distance*, *LCS*. État = `(i, j)`. Complexité `O(n·m)`.
- **Knapsack 0/1** : capacité W → `O(n·W)` (pseudo-polynomial).
- **Intervalles** : *Burst Balloons* → `dp[i][j]` sur un segment, souvent `O(n³)`.

Méthode : définir l'**état**, la **transition**, les **cas de base**, l'ordre de remplissage.
---SECTION---
HEADING: Greedy et bit manipulation
BODY:
### Greedy (glouton)
Faire à chaque étape le **choix localement optimal** en espérant l'optimum global. **Rapide**, mais **ne marche que si** la propriété de choix glouton est prouvée (interval scheduling, Huffman, Dijkstra). Piège : `Coin Change` en système arbitraire — le glouton **échoue**, il faut la DP.

### Bit manipulation
- `x & 1` : parité ; `x >> 1` : diviser par 2.
- `x & (x-1)` : efface le bit de poids faible allumé (compter les bits, tester puissance de 2).
- **XOR** : `a ^ a = 0`, `a ^ 0 = a` → trouver l'élément unique parmi des doublons en `O(1)` espace.
- **Bitmask** : représenter un sous-ensemble par un entier (DP sur états, `n ≤ 20`).
```
res = 0
for x in a: res ^= x   # élément apparaissant une seule fois
```
===END===
===LESSON===
KEY: design-patterns
TOPIC: design-patterns
TITLE: Design Patterns
ICON: 🧩
INTRO: Les design patterns sont des solutions éprouvées à des problèmes récurrents de conception orientée objet. Ils forment un vocabulaire commun. Ce cours couvre les patterns du Gang of Four, classés en création, structure et comportement, plus SOLID et l'injection de dépendances.
---SECTION---
HEADING: Singleton (création)
BODY:
**Problème** : garantir qu'une classe n'a **qu'une seule instance**, avec un point d'accès global (config, pool de connexions, logger).

```python
class Config:
    _instance = None
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
```

**Piège** : c'est un **état global déguisé** → couplage fort, tests difficiles. **Non thread-safe** naïvement : deux threads peuvent créer deux instances (utiliser un verrou ou l'initialisation à l'import). Souvent un anti-pattern : préférez l'**injection de dépendances** d'une instance unique.
---SECTION---
HEADING: Factory & Builder (création)
BODY:
### Factory Method
**Problème** : créer des objets **sans coder en dur** la classe concrète. Une méthode « fabrique » décide de la classe instanciée.
```python
def make_parser(kind):
    return {"json": JsonParser, "xml": XmlParser}[kind]()
```
Ajouter un nouveau type ne modifie pas le code client (Open/Closed). Ne pas confondre avec l'**Abstract Factory** (crée des *familles* d'objets liés).

### Builder
**Problème** : construire un objet **complexe** étape par étape, avec beaucoup de paramètres optionnels — évite le « constructeur télescopique ».
```java
Pizza p = new Pizza.Builder().size("L").cheese(true).build();
```
Bénéfice : lisibilité, objets **immuables**, validation dans `build()`. Superflu pour peu de paramètres.
---SECTION---
HEADING: Adapter, Decorator, Facade, Proxy (structure)
BODY:
- **Adapter** : faire **collaborer deux interfaces incompatibles** en **traduisant** l'une vers l'autre. Ex. une lib expose `charge(cents)`, votre code attend `pay(euros)`.
- **Decorator** : ajouter des responsabilités **dynamiquement**, sans sous-classer, en enveloppant l'objet dans des décorateurs de **même interface** (`Coffee` + `Milk` + `Sugar`). Respecte Open/Closed.
- **Facade** : fournir une **interface simple** à un sous-système complexe (`orderService.checkout()` masque inventaire, paiement, expédition). Piège : ne pas en faire un god object.
- **Proxy** : contrôler l'accès à un objet via un **substitut** de même interface (lazy loading, contrôle d'accès, cache, remote).

Clé : Adapter **change** l'interface ; Decorator **ajoute** un comportement en gardant l'interface ; Proxy **contrôle l'accès** avec la même interface.
---SECTION---
HEADING: Observer (comportement)
BODY:
**Problème** : notifier automatiquement plusieurs objets (**observateurs**) quand un **sujet** change d'état, sans les coupler fortement. Base du **publish-subscribe** et de la réactivité (UI, événements).

```python
class Subject:
    def __init__(self): self._obs = []
    def subscribe(self, o): self._obs.append(o)
    def notify(self, data):
        for o in self._obs: o.update(data)
```

**Bénéfice** : couplage lâche — le sujet ignore la nature des observateurs. Ajout/retrait dynamique.

**Piège** : **fuites mémoire** (oublier de se désabonner garde les observateurs vivants — lapsed listener) ; ordre de notification non garanti ; un observateur lent bloque les autres (notifications synchrones).
---SECTION---
HEADING: Strategy, Command, State (comportement)
BODY:
- **Strategy** : définir une **famille d'algorithmes interchangeables** et les sélectionner à l'exécution, sans `if/else` géants. Remplace les conditionnelles par de la **composition** (chaque algo isolé et testable).
- **Command** : **encapsuler une requête en objet**, pour la paramétrer, la mettre en file, la journaliser, ou l'**annuler** (undo/redo). Découple l'émetteur (bouton) du récepteur (document).
- **State** : un objet **change de comportement** selon son état interne, sans `switch` massif. Chaque état devient une classe qui gère ses transitions (`Order` : `Pending → Paid → Shipped`).

Strategy et State sont structurellement identiques ; l'intention diffère (choisir un algorithme vs gérer des transitions d'état, les objets se remplaçant eux-mêmes).
---SECTION---
HEADING: Template Method & Iterator (comportement)
BODY:
### Template Method
Figer le **squelette** d'un algorithme dans une classe de base, en laissant les sous-classes redéfinir certaines **étapes**.
```python
class Report:
    def generate(self):        # squelette figé
        self.header(); self.body(); self.footer()
    def body(self): raise NotImplementedError  # à surcharger
```
Piège : couplage par héritage (rigide) ; souvent avantageusement remplacé par **Strategy** (composition).

### Iterator
Parcourir les éléments d'une collection **sans exposer sa structure interne**. En Python, les générateurs (`yield`) l'implémentent. Piège : modifier la collection **pendant** l'itération l'invalide.
---SECTION---
HEADING: Principes SOLID
BODY:
Cinq principes pour un code OO maintenable :

- **S — Single Responsibility** : une classe = **une seule raison de changer**.
- **O — Open/Closed** : **ouvert à l'extension, fermé à la modification**. Ajouter du comportement via de nouvelles classes (Strategy, Decorator), pas en éditant l'existant.
- **L — Liskov Substitution** : un sous-type doit être **substituable** à son type de base sans casser le contrat. Contre-exemple : `Carré` héritant de `Rectangle`.
- **I — Interface Segregation** : préférer **plusieurs interfaces spécifiques** à une grosse interface fourre-tout.
- **D — Dependency Inversion** : dépendre d'**abstractions**, pas d'implémentations concrètes.

SOLID sous-tend la plupart des patterns : ils en sont des applications concrètes.
---SECTION---
HEADING: Injection de dépendances
BODY:
**Problème** : une classe qui **crée elle-même** ses dépendances (`self.db = MySQLDatabase()`) est fortement couplée, difficile à tester et à reconfigurer.

**Solution** : **fournir** les dépendances de l'extérieur (via le constructeur), typées par une **abstraction**. C'est l'application concrète du **D** de SOLID.

```python
class UserService:
    def __init__(self, repo: UserRepository):  # injecté
        self.repo = repo

UserService(PostgresUserRepo())   # prod
UserService(InMemoryUserRepo())   # test : facile à mocker
```

**Bénéfices** : testabilité (mocks/fakes), flexibilité (changer d'implémentation par config), couplage faible.

**Piège** : ne pas confondre **DI** (le principe) et le **conteneur IoC** (l'outil qui câble). Éviter le **service locator** (récupérer les dépendances via un registre global), qui cache les dépendances réelles.
===END===
===LESSON===
KEY: languages
TOPIC: languages
TITLE: Pièges par langage
ICON: 🐛
INTRO: Chaque langage a ses pièges — des comportements corrects selon la spécification mais contre-intuitifs, qui produisent des bugs subtils. Ce cours décortique les pièges les plus fréquents en Python, JavaScript, Go, Rust et Java. Pour chacun : le *pourquoi* (le mécanisme réel), et le *correctif*.
---SECTION---
HEADING: Python — argument par défaut mutable
BODY:
**Piège** :
```python
def add(item, bucket=[]):   # DANGER
    bucket.append(item)
    return bucket

add(1)  # [1]
add(2)  # [1, 2]  ← surprise, la même liste !
```

**Pourquoi** : la valeur par défaut est évaluée **une seule fois**, à la **définition** de la fonction, pas à chaque appel. La même liste est réutilisée et accumulée entre appels.

**Correctif** : utiliser `None` comme sentinelle et créer l'objet dans le corps.
```python
def add(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket
```
Vaut pour toute valeur par défaut **mutable** (list, dict, set).
---SECTION---
HEADING: Python — closures tardives, GIL, is vs ==
BODY:
### Closures tardives (late binding)
```python
fns = [lambda: i for i in range(3)]
[f() for f in fns]   # [2, 2, 2]  attendu [0, 1, 2]
```
La closure capture la **variable** `i`, pas sa valeur. Correctif : `lambda i=i: i`.

### GIL
Le **GIL** (Global Interpreter Lock) de CPython autorise **un seul thread** à exécuter du bytecode à la fois : le multithreading n'accélère pas un calcul **CPU-bound**. Correctif : `multiprocessing` (CPU) ; le threading reste utile pour l'**I/O-bound** (le GIL est relâché pendant les attentes).

### is vs ==
`==` compare la **valeur** ; `is` compare l'**identité** (même objet). CPython met en cache les petits entiers (`-5` à `256`), d'où des `is` parfois `True` par coïncidence — **à ne jamais exploiter**. Réserver `is` aux singletons : `if x is None`.
---SECTION---
HEADING: Python — copies superficielles vs profondes
BODY:
**Piège** :
```python
import copy
a = [[1, 2], [3, 4]]
b = a[:]            # copie superficielle
b[0].append(99)
a                   # [[1, 2, 99], [3, 4]]  a modifié !
```

**Pourquoi** : `a[:]`, `list(a)`, `copy.copy` créent un **nouveau conteneur** mais copient les **références** des éléments. Les sous-listes restent **partagées**.

**Correctif** : `copy.deepcopy(a)` pour une copie **récursive** indépendante. Plus lent ; n'y recourir que si les éléments imbriqués sont réellement mutés.
---SECTION---
HEADING: JavaScript — event loop : micro vs macrotâches
BODY:
**Piège** :
```js
console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');
// Ordre : A, D, C, B
```

**Pourquoi** : après le code synchrone (`A`, `D`), l'event loop vide **entièrement** la file des **microtâches** (promesses, `queueMicrotask`) **avant** de prendre **une** macrotâche (`setTimeout`, I/O). `C` (microtâche) passe donc avant `B` (macrotâche), malgré le délai `0`.

**À retenir** : `setTimeout(fn, 0)` n'exécute pas « immédiatement » — il attend la fin des microtâches. Une chaîne de promesses qui se ré-enqueue peut **affamer** les macrotâches.
---SECTION---
HEADING: JavaScript — coercition, this, hoisting
BODY:
### Coercition et ==
```js
0 == ''    // true
'' == '0'  // false (!) — non transitif
[] == ![]  // true
```
`==` applique des **conversions de type** implicites aux règles complexes et non transitives. **Correctif** : utiliser **toujours `===`**. Réserver `== null` pour tester `null` **ou** `undefined`.

### this
La valeur de `this` dépend de **comment** la fonction est **appelée**, pas d'où elle est définie. Détachée de son objet, `this` devient `undefined` (strict). **Correctif** : **arrow function** (capture le `this` lexical, idéale pour les callbacks) ou `bind/call/apply`.

### hoisting / TDZ
`var` est **hoistée** et initialisée à `undefined` (lisible avant). `let`/`const` sont hoistées **mais non initialisées** : accès avant déclaration → `ReferenceError` (Temporal Dead Zone). Préférer `const`.
---SECTION---
HEADING: JavaScript — flottants et NaN
BODY:
**Piège** :
```js
0.1 + 0.2            // 0.30000000000000004
0.1 + 0.2 === 0.3    // false
NaN === NaN          // false (!)
typeof NaN           // 'number'
```

**Pourquoi** : les nombres sont des **flottants IEEE 754** : `0.1` et `0.2` n'ont pas de représentation binaire exacte. `NaN` n'est **égal à rien**, pas même à lui-même.

**Correctif** : comparer avec une **tolérance** (`Math.abs(a - b) < Number.EPSILON`) ; pour l'argent, travailler en **entiers** (centimes) ; tester NaN avec `Number.isNaN(x)`. Ce piège flottant est **universel** (Python, Java… même IEEE 754).
---SECTION---
HEADING: Go — variable de boucle, nil interface
BODY:
### Variable de boucle capturée (Go < 1.22)
```go
for _, v := range items {
    go func() { fmt.Println(v) }()   // souvent la MÊME dernière valeur
}
```
Avant Go 1.22, `v` était **unique et réutilisée**. Correctif : `v := v` dans la boucle. **Depuis Go 1.22**, la variable est redéclarée à chaque itération : le piège disparaît.

### nil interface
```go
func do() error {
    var p *MyError = nil
    return p            // renvoie un *MyError nil
}
if do() != nil { ... } // VRAI (!) alors qu'on croyait renvoyer nil
```
Une interface Go contient **(type, valeur)**. Elle n'est `nil` que si **les deux** sont nil. Ici l'interface porte le type `*MyError` → pas nil. Correctif : renvoyer explicitement `nil` (le mot-clé) en cas de succès.
---SECTION---
HEADING: Go — goroutines et slices
BODY:
### Fuite de goroutine
```go
ch := make(chan int)   // non bufferisé
go func() { val := <-ch; fmt.Println(val) }()
// on retourne sans écrire dans ch → goroutine bloquée pour toujours
```
Une goroutine bloquée sur un canal qui n'aboutira jamais **ne se termine pas** ; elle et sa mémoire fuient. Correctif : `context` avec annulation + `select` sur `ctx.Done()`, ou garantir un consommateur/producteur.

### Slices et append
```go
a := []int{1, 2, 3, 4, 5}
b := a[:2]              // len 2, cap 5 — MÊME tableau sous-jacent
b = append(b, 99)      // écrase a[2] ! → a == [1, 2, 99, 4, 5]
```
Un slice est une vue (pointeur, `len`, `cap`) sur un **tableau partagé**. `append` écrit **en place** tant que la **capacité** suffit. Correctif : copie explicite, ou three-index slice `a[0:2:2]` pour forcer la réallocation.
---SECTION---
HEADING: Rust — ownership, Option/Result
BODY:
### Ownership et borrowing
```rust
let s = String::from("hi");
let s2 = s;              // MOVE : s n'est plus valide
println!("{}", s);      // erreur: value borrowed after move
```
Chaque valeur a **un seul propriétaire** ; l'assignation d'un type non-`Copy` **déplace** la propriété. Le **borrow checker** autorise soit **plusieurs `&`** (immuables), soit **un seul `&mut`**, jamais les deux — cela prévient les data races à la compilation. Correctif : **emprunter** (`&s`), **cloner** (`s.clone()`), ou `Rc`/`Arc`/`RefCell` pour un partage runtime.

### Option et Result
Rust **n'a pas de null**. L'absence est `Option<T>` (`Some`/`None`), l'échec `Result<T, E>` (`Ok`/`Err`). Le compilateur **force** à traiter les deux cas. `unwrap()` **panique** sur `None`/`Err` — le réserver aux cas prouvés impossibles. Préférer `match`, `if let`, ou l'opérateur `?` (propagation).
---SECTION---
HEADING: Java — == vs equals, cache Integer
BODY:
### == vs equals
```java
String a = new String("hi");
String b = new String("hi");
a == b        // false  — références différentes
a.equals(b)   // true   — contenu identique
```
Pour les **objets**, `==` compare les **références**, pas le contenu. Toujours comparer avec `.equals()` (ou `Objects.equals(a, b)`).

### Cache des Integer
```java
Integer a = 127, b = 127;  a == b   // true
Integer c = 128, d = 128;  c == d   // false (!)
```
L'autoboxing **met en cache** les `Integer` de **−128 à 127** : dans cette plage `==` est vrai (même objet), au-delà faux (objets distincts). Comparer avec `.equals()`, jamais `==` sur des wrappers.
---SECTION---
HEADING: Java — equals/hashCode et finally
BODY:
### Contrat equals/hashCode
Redéfinir `equals()` sans `hashCode()` rend un objet **introuvable** dans une `HashMap`/`HashSet` : les collections localisent d'abord par **bucket** (`hashCode`), puis comparent par `equals`. Le contrat exige : `a.equals(b)` ⟹ `a.hashCode() == b.hashCode()`. **Toujours redéfinir les deux ensemble** (`Objects.hash(...)`).

### finally et return
```java
try { return 1; }
finally { return 2; }   // retourne 2 — écrase le try !
```
`finally` s'exécute **toujours** ; un `return`/`throw` dedans **remplace** celui du `try` (et avale les exceptions). **Ne jamais** faire de `return`/`throw` dans un `finally` ; l'utiliser seulement pour libérer des ressources (ou préférer **try-with-resources**).
===END===
