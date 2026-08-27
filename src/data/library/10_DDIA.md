# Concevoir des systèmes data-intensive : le manuel de décision

*D'après « Designing Data-Intensive Applications », Martin Kleppmann, 2017. Une synthèse orientée décision : non pas « quels outils existent », mais « comment raisonner sur leurs compromis ».*

Il y a deux façons de choisir une base de données. La première consiste à lire des comparatifs, à repérer le nom qui revient le plus souvent, à l'adopter. La seconde consiste à comprendre les quelques lois physiques qui gouvernent *tous* les systèmes de données, à identifier lesquelles votre problème réel fait entrer en tension, puis à choisir l'outil qui place le curseur au bon endroit. Ce chapitre vise la seconde.

C'est le chapitre-charnière du dossier. Les textes précédents vous ont montré des systèmes réels — GFS, Dynamo, Spanner, Kafka, Bigtable — chacun avec ses astuces. Kleppmann fait le travail inverse : il extrait les **principes invariants** qui expliquent pourquoi ces systèmes sont conçus ainsi, et pourquoi leurs successeurs le seront encore. Sa thèse tient en une phrase : *« Software keeps changing, but the fundamental principles remain the same. »* Les logiciels changent, les contraintes non.

Vous venez du bas niveau. Cela va vous servir plus que vous ne le pensez : la plupart des idées difficiles de ce chapitre ont un jumeau exact dans l'architecture des processeurs. La réplication, c'est de la cohérence de cache. L'isolation transactionnelle, c'est un modèle mémoire. Le write-skew, c'est un TOCTOU. La linéarisabilité, c'est la consistance séquentielle. Je tirerai ces fils au fur et à mesure.

---

## Ce que « data-intensive » veut dire

Un système est **compute-intensive** quand le facteur limitant est le CPU : un solveur, un encodeur vidéo, un entraînement de modèle. Il est **data-intensive** quand le facteur limitant est la *donnée* — sa quantité, sa complexité, sa vitesse de changement. La quasi-totalité des applications que vous construirez comme CTO sont dans le second camp. Le CPU n'est presque jamais le mur ; le mur, c'est le débit d'écriture, la latence de lecture sous charge, la cohérence entre réplicas, la migration de schéma sur une table de 400 Go.

Kleppmann pose une grille en trois préoccupations, qui structurent toute la discipline. Retenez-les comme les trois axes d'un cahier des charges implicite ; chaque décision d'architecture améliore l'un au détriment des autres.

**La fiabilité (reliability), c'est continuer à fonctionner correctement quand les choses tournent mal.** Pas *si* elles tournent mal — *quand*. C'est le point de bascule mental le plus important du livre, et il vous est familier : un ingénieur sécurité ne conçoit pas contre l'attaquant moyen, il conçoit en supposant l'attaquant présent. Ici, l'« attaquant » est le réel : les disques meurent (un datacenter perd des disques tous les jours), le réseau se partitionne, un déploiement rate, un humain lance un `DELETE` sans `WHERE`. La bonne question n'est jamais « comment empêcher les pannes » mais « comment le système se comporte-t-il pendant et après ». Les fautes matérielles se traitent par la redondance ; les bugs logiciels et les erreurs humaines, plus insidieux car corrélés (ils frappent tous les réplicas en même temps), se traitent par les tests, l'isolation des composants, les rollbacks rapides et — surtout — la capacité à rejouer l'histoire pour réparer après coup.

**La scalabilité (scalability), c'est absorber la croissance de la charge.** Le mot n'a de sens que quantifié. Avant de dire « ça doit scaler », il faut définir le **paramètre de charge** dominant : est-ce le nombre d'utilisateurs, le volume stocké, le débit de requêtes, le fan-out ? L'exemple canonique de Kleppmann est Twitter : le problème n'est pas les 4 600 tweets/seconde en écriture, ridicules ; c'est le fan-out en lecture, car un tweet doit apparaître dans le fil de tous les abonnés. Le paramètre de charge n'est pas l'écriture, c'est *followers × lectures de fil*. On y revient plus loin, car c'est un cas d'école du raisonnement par compromis.

Deuxième réflexe indispensable : **mesurer la latence par percentiles, pas par la moyenne.** La moyenne ment. Ce qui compte, c'est le P95, le P99, le P999 — la queue de distribution. Un P99 de 1 s signifie qu'un utilisateur sur cent attend une seconde entière ; et ce sont souvent vos plus gros clients (plus de données, plus de requêtes) qui vivent dans la queue. Amazon a chiffré la sanction : 100 ms de latence en plus, c'est environ 1 % de chiffre d'affaires en moins. Vous connaissez déjà ce phénomène : la moyenne d'un accès mémoire n'a aucun intérêt si un miss de cache vous coûte 200 cycles ; ce qui dimensionne le pipeline, c'est le pire cas, pas le cas moyen.

**La maintenabilité (maintainability), c'est garder les ingénieurs productifs dans la durée.** L'essentiel du coût d'un logiciel n'est pas sa création, c'est sa maintenance : corriger, adapter, faire évoluer, faire tourner en production pendant des années. Trois sous-propriétés : l'**opérabilité** (facile à exploiter — monitoring, déploiements, diagnostics), la **simplicité** (de bonnes abstractions qui cachent la complexité accidentelle sans masquer l'essentielle), et l'**évolutivité** (facile à changer quand les besoins bougent, ce qu'ils font toujours). C'est la préoccupation la plus sous-estimée par les ingénieurs brillants, parce qu'elle ne se voit pas dans un benchmark.

Gardez cette triade en tête. Tout le reste du chapitre décrit des mécanismes, et chaque mécanisme se juge à sa position sur ces trois axes.

---

## Deux fondations avant les systèmes distribués

Avant de distribuer quoi que ce soit, deux choix locaux conditionnent tout le reste : *comment on modélise* les données, et *comment on les stocke physiquement*. Ce sont les fondations sur lesquelles reposent les décisions distribuées.

### Modèles de données : la forme épouse les relations

La question utile n'est pas « SQL ou NoSQL » — c'est un faux clivage. La vraie question est : *quelle est la forme des relations dans mes données, et comment vais-je les interroger ?*

Le **modèle relationnel** (PostgreSQL, MySQL) excelle quand les données sont fortement reliées entre elles et que les jointures sont naturelles. Sa force est l'intégrité (contraintes, clés étrangères), la flexibilité des requêtes ad hoc (vous n'avez pas à connaître vos requêtes à l'avance), et un écosystème mûr. Sa faiblesse : les migrations de schéma sur de grosses tables sont douloureuses, et le passage à l'échelle horizontale est un travail d'ingénierie.

Le **modèle document** (MongoDB, Firestore) stocke des objets auto-contenus et hiérarchiques — un profil, une commande, un document JSON entier. Sa force est la **localité** : une lecture ramène le document complet, sans jointure. Idéal quand vos données forment un arbre et se lisent d'un bloc. Sa faiblesse est le miroir de sa force : les relations plusieurs-à-plusieurs sont mal gérées, et les jointures sont limitées ou absentes — l'application doit les faire à la main.

Le **modèle graphe** (Neo4j, Neptune) est fait pour les relations denses et récursives : réseaux sociaux, recommandations, détection de fraude. La requête « amis d'amis qu'Alice ne suit pas encore » est triviale en Cypher et cauchemardesque en SQL (jointures récursives). Faible en revanche pour l'analytique de masse.

Le principe qui sous-tend ce choix : **on modélise selon la structure des relations, pas selon la mode.** Relations fortes et requêtes imprévisibles → relationnel. Arbre auto-contenu lu d'un bloc → document. Graphe dense parcouru en profondeur → graphe. Et par défaut, en cas de doute, le relationnel : c'est le choix qui se trompe le moins souvent, parce qu'il ne vous enferme pas dans un patron d'accès décidé trop tôt.

### Moteurs de stockage : B-Tree contre LSM-Tree

Sous le capot, deux grandes familles de structures d'index, et le choix entre elles est l'un des plus déterminants pour vos performances. Il se résume à une question que vous connaissez bien : **écriture aléatoire in-place, ou écriture séquentielle append-only ?**

Le **B-Tree** (PostgreSQL, InnoDB de MySQL, la quasi-totalité des bases relationnelles) est un arbre équilibré de pages de taille fixe (4 à 16 Ko, alignées sur le disque). Une lecture descend 3 à 5 niveaux — quelques seeks. Une écriture trouve la bonne page feuille et **modifie sur place** ; si la page est pleine, elle se scinde. C'est de l'I/O aléatoire, précédé d'une écriture au **WAL** (write-ahead log) pour la durabilité. Lectures rapides et prévisibles, débit d'écriture modéré.

Le **LSM-Tree** (Log-Structured Merge-Tree — Cassandra, RocksDB, Bigtable, ScyllaDB) renverse le compromis. Les écritures s'accumulent en mémoire dans une **memtable** triée, puis sont vidées sur disque sous forme de **SSTables** immuables et triées. **Toute écriture est séquentielle** — jamais de modification in-place. En arrière-plan, la **compaction** fusionne les SSTables et récupère l'espace. Les lectures doivent consulter la memtable puis plusieurs SSTables (un **filtre de Bloom** évite les recherches inutiles), donc elles sont un peu plus coûteuses.

```
                 B-Tree                    LSM-Tree
                 ───────                    ────────
Écriture         in-place (aléatoire)       append séquentiel → compaction
Débit écriture   modéré                     ÉLEVÉ
Débit lecture    ÉLEVÉ, prévisible          bon, mais amplification lecture
Amplif. écriture faible-moyenne             élevée (réécriture en compaction)
Espace disque    compact                    gaspillage temporaire (compaction)
Pauses           aucune                     oui (compaction en arrière-plan)
Terrain de jeu   lecture-lourde, requêtes   écriture-lourde, séries temporelles
                 complexes, transactions    événements, gros débit
```

La règle pratique : **débit d'écriture élevé** (> 10 K/s, séries temporelles, flux d'événements) → LSM-Tree. **Requêtes complexes, transactions, lectures dominantes** → B-Tree. Mixte → B-Tree bien réglé. Notez l'analogie avec les SSD eux-mêmes : le contrôleur d'un SSD *est* un LSM-Tree déguisé — écriture séquentielle dans des blocs neufs, ramasse-miettes en arrière-plan, amplification d'écriture. Vous connaissez déjà le compromis, à un étage plus bas.

### OLTP contre OLAP : deux mondes, deux orientations mémoire

Dernier axe fondationnel, orthogonal aux précédents : le *type de charge*. L'**OLTP** (Online Transaction Processing) traite beaucoup de petites opérations rapides sur l'état courant — « lis la commande 12345 », « décrémente le stock ». C'est l'application vivante. L'**OLAP** (Online Analytical Processing) traite peu de requêtes énormes qui balaient des millions de lignes pour agréger — « chiffre d'affaires mensuel par catégorie sur trois ans ». C'est l'analytique.

La différence décisive est **l'orientation du stockage**. Une base OLTP est **orientée lignes** : les champs d'un enregistrement sont contigus sur disque, ce qui est parfait pour lire une ligne entière. Une base OLAP est **orientée colonnes** (ClickHouse, BigQuery, Snowflake, Redshift) : toutes les valeurs d'une colonne sont stockées ensemble. Quand vous faites `SELECT SUM(total)`, le moteur colonne ne lit *que* la colonne `total` — 10 Go au lieu de 100 Go, dix fois moins d'I/O, et une compression bien meilleure car des valeurs homogènes se compriment magnifiquement. C'est exactement le raisonnement AoS-vs-SoA (array-of-structs vs struct-of-arrays) que vous feriez pour vectoriser une boucle : on aligne en mémoire selon le motif d'accès dominant. N'exécutez jamais vos analytiques lourdes sur votre base OLTP orientée lignes ; c'est le mauvais layout mémoire pour la question posée.

---

## Axe 1 — La réplication : quand une lecture est-elle sûre ?

On entre dans le distribué. **Répliquer**, c'est garder une copie des mêmes données sur plusieurs machines. On le fait pour trois raisons : tenir la charge de lecture (plus de copies à interroger), survivre aux pannes (une machine tombe, une autre prend le relais), et rapprocher la donnée des utilisateurs (latence géographique). Le prix à payer est unique et incontournable : **la cohérence entre copies**. Dès qu'il y a plus d'une copie, la question « ai-je lu la valeur à jour ? » cesse d'être triviale.

C'est un problème de **cohérence de cache**, et vous l'avez déjà résolu au niveau matériel. Plusieurs cœurs, chacun son cache L1, une même ligne mémoire : que voit un cœur quand un autre écrit ? MESI existe pour ça. En distribué, il n'y a pas de bus de cohérence gratuit — les protocoles doivent être explicites et payer en latence réseau. D'où trois grandes architectures.

### Single-leader : un seul écrivain, la simplicité

Le patron le plus répandu (réplication streaming de PostgreSQL, binlog de MySQL). **Un** nœud est le **leader** : toutes les écritures passent par lui. Il propage chaque changement à ses **followers**, qui servent les lectures. C'est simple à raisonner parce qu'il n'y a qu'un seul point où l'ordre des écritures est décidé — comme un seul cœur qui aurait le droit d'écrire.

Le diable est dans le **lag de réplication**. Si la propagation est asynchrone (le défaut, pour ne pas ralentir les écritures), les followers sont en retard, et ce retard produit trois anomalies visibles par l'utilisateur.

```
   Écriture ─────► LEADER ──async──► Follower A  (à jour)
                     │      ──async──► Follower B  (en retard de 2 s)
   Lecture ◄─────────────────────────┘
   → l'utilisateur peut lire une valeur périmée
```

**Read-your-own-writes.** Un utilisateur modifie son profil (écriture → leader), puis recharge la page (lecture → follower en retard) et voit l'ancien profil. Il croit que sa modification a échoué. Le correctif : pendant la minute qui suit une écriture, lire *cet* utilisateur depuis le leader. On garantit qu'un utilisateur voit au moins ses propres écritures.

**Monotonic reads.** L'utilisateur lit un commentaire depuis le follower A (à jour), rafraîchit, tombe sur le follower B (en retard), et le commentaire *disparaît* — le temps semble reculer. Le correctif : router un utilisateur donné toujours vers le *même* follower (par hachage de son ID). On n'exige pas la fraîcheur absolue, juste qu'on ne remonte jamais dans le temps.

**Consistent prefix reads.** Dans une conversation, la réponse « 40 minutes » arrive avant la question « combien de temps de cuisson ? » parce qu'elles ont transité par des partitions de vitesses différentes. La causalité est brisée. Le correctif : router les écritures causalement liées vers la même partition, pour préserver leur ordre.

Ces trois garanties — read-your-writes, monotonic reads, consistent prefix — sont exactement des contraintes d'ordre mémoire. Vous reconnaissez les barrières : on n'impose pas la cohérence globale la plus forte (coûteuse), on impose juste l'ordre minimal nécessaire pour que le programme reste correct du point de vue de l'observateur.

Le vrai compromis du single-leader est la **synchronicité de la réplication**. Réplication **synchrone** : le leader attend qu'au moins un follower confirme avant d'acquitter l'écriture → durabilité forte (la donnée survit à la mort du leader) mais latence d'écriture accrue, et si le follower synchrone tombe, les écritures se bloquent. Réplication **asynchrone** : le leader acquitte immédiatement → rapide et disponible, mais si le leader meurt avant d'avoir propagé, ces écritures sont **perdues**. En pratique on choisit le **semi-synchrone** : un follower synchrone (durabilité), les autres asynchrones (performance). Retenez le principe : *la durabilité au-delà d'une seule machine se paie en latence, toujours.*

### Multi-leader : écrire partout, résoudre les conflits

Parfois un seul leader ne suffit pas : plusieurs datacenters (on veut écrire localement dans chaque région), ou des clients offline (chaque appareil est son propre leader). On autorise alors **plusieurs leaders** acceptant des écritures, puis on les réconcilie. Le gain est la disponibilité en écriture et la latence locale. Le prix, brutal : **les conflits d'écriture concurrente** — deux leaders modifient la même donnée « en même temps », et il faut décider qui gagne.

Trois stratégies de résolution, chacune avec son défaut :

**Last-Write-Wins (LWW)** — on garde la version au timestamp le plus élevé. Simple, et c'est le défaut de Cassandra. Défaut grave : **on perd silencieusement des écritures.** Deux écritures concurrentes, l'une est jetée, personne n'est prévenu. Et « le plus récent » suppose des horloges synchronisées entre machines — ce qui n'existe pas vraiment (dérive d'horloge, le fameux problème que Spanner combat avec des horloges atomiques). LWW est acceptable pour des données jetables, jamais pour de l'argent.

**CRDTs** (Conflict-free Replicated Data Types) — des structures conçues pour fusionner *automatiquement et sans perte* : compteurs, ensembles, séquences avec des règles de fusion commutatives et associatives. Élégant et correct quand vos données rentrent dans une de ces formes. Défaut : toutes les données n'y rentrent pas.

**Résolution applicative** — la base garde les deux versions et laisse l'application décider (fusion manuelle, comme les conflits Git). Maximum de contrôle, maximum de complexité reportée sur vos épaules.

Le principe à emporter : **le multi-leader échange la simplicité du raisonnement contre la disponibilité géographique.** Ne l'adoptez que si vous avez réellement besoin d'écrire dans plusieurs régions ou hors-ligne, car vous héritez pour toujours du problème de résolution de conflits.

### Leaderless : le quorum, ou la correction par le nombre

Le modèle Dynamo/Cassandra : **pas de leader du tout.** N'importe quel nœud accepte n'importe quelle écriture, et la cohérence émerge d'une arithmétique de **quorum**. Avec N réplicas, une écriture doit être confirmée par W nœuds, une lecture doit interroger R nœuds.

```
   N = 5 réplicas
   W = 3 (une écriture doit toucher 3 nœuds)
   R = 3 (une lecture doit interroger 3 nœuds)

   Condition de quorum :  W + R > N   ⟹   3 + 3 > 5  ✓

   Pourquoi ça marche : tout ensemble de 3 écrivains et
   tout ensemble de 3 lecteurs se CHEVAUCHENT forcément
   sur au moins 1 nœud → la lecture voit toujours la
   dernière écriture (repérée par son numéro de version).
```

L'inégalité **W + R > N** est le cœur du mécanisme. Elle garantit que l'ensemble des nœuds écrits et l'ensemble des nœuds lus ont une intersection non vide : au moins un nœud lu connaît la dernière écriture. La lecture ramène plusieurs versions, garde la plus récente (numéro de version), et au passage effectue une **read repair** — elle recopie la valeur à jour vers les nœuds en retard. C'est de la correction d'erreur par redondance et vote majoritaire ; l'analogie ECC est presque littérale.

Le compromis se règle avec le curseur W/R. W élevé, R faible → écritures coûteuses, lectures rapides et fraîches. W faible, R élevé → l'inverse. Baisser les deux sous le quorum (W + R ≤ N) → performances maximales mais **cohérence éventuelle** : les lectures peuvent rater les écritures récentes. Le leaderless brille pour la haute disponibilité toujours-active et le multi-région (aucun leader à élire, aucun point de bascule), au prix d'une cohérence plus faible et d'aucune transaction multi-clés. C'est le choix « disponibilité d'abord ».

---

## Axe 2 — Le partitionnement : découper pour grandir

La réplication met la *même* donnée sur plusieurs machines. Le **partitionnement** (ou *sharding*) met des données *différentes* sur des machines différentes. On le fait quand le volume ou le débit dépasse ce qu'une machine peut tenir : chaque partition est un sous-ensemble, et l'ensemble se répartit sur le cluster. On combine toujours les deux — chaque partition est elle-même répliquée. Le problème central du partitionnement : **choisir la fonction qui attribue une clé à une partition, et éviter les points chauds.**

### Par intervalle de clés

On découpe l'espace des clés en tranches ordonnées : `[a–d]`, `[e–m]`, `[n–z]`. Bigtable et HBase fonctionnent ainsi.

L'avantage est décisif pour certaines charges : **les scans par intervalle sont efficaces**, car les clés voisines sont physiquement voisines. « Tous les événements entre lundi et mercredi » se lit d'un trait. Le danger est le **point chaud (hotspot)** : si votre clé est un timestamp, *toutes* les écritures récentes tombent sur la dernière partition, pendant que les autres dorment. Vous avez sharded, mais une seule machine travaille. Les parades : inverser la clé, ou préfixer d'un sel (hash) pour disperser — au prix de la perte des scans ordonnés. C'est le compromis fondamental : *localité contre répartition uniforme, on ne peut pas maximiser les deux.*

### Par hachage de clé

On applique une fonction de hachage à la clé et on route selon le résultat (Cassandra, DynamoDB). Le hachage **détruit l'ordre** — deux clés voisines partent aux antipodes — donc les scans par intervalle deviennent impossibles. En échange, la **répartition est uniforme** : plus de point chaud lié à la structure des clés.

Cassandra propose un compromis malin qu'il faut connaître : une **clé de partition** (hachée → choisit le nœud) *plus* une **clé de clustering** (triée *à l'intérieur* de la partition). Avec `PRIMARY KEY ((user_id), timestamp)`, toutes les lignes d'un `user_id` vivent sur le même nœud, triées par temps. On récupère le meilleur des deux mondes *dans* une partition : répartition uniforme entre utilisateurs, scan temporel efficace pour un utilisateur donné. C'est le patron à imiter dès qu'on modélise pour Cassandra.

### Les index secondaires : le compromis caché

Partitionner par clé primaire est facile ; le piège, ce sont les **index secondaires** (« trouve toutes les voitures rouges »), car la donnée recherchée ne correspond pas à la clé de partitionnement. Deux approches, et le choix conditionne où la douleur se situe.

**Index local (document-partitioned).** Chaque partition indexe *ses propres* données. Écriture rapide (on ne touche que l'index local), mais la lecture doit interroger **toutes** les partitions et fusionner — le *scatter-gather*. Lectures coûteuses et à latence de queue élevée (vous attendez la partition la plus lente).

**Index global (term-partitioned).** L'index lui-même est partitionné, par terme indexé. La lecture ne consulte que *la* partition qui détient « rouge » → rapide. Mais l'écriture doit mettre à jour une partition d'index *distante*, potentiellement plusieurs → écriture plus lente et distribuée. C'est le choix de DynamoDB (Global Secondary Indexes) et d'Elasticsearch.

Le principe : **index local = écritures rapides / lectures lentes ; index global = l'inverse.** On choisit selon le ratio lecture/écriture de la charge. Encore un curseur, jamais un repas gratuit.

### Le rebalancing : ne jamais utiliser `hash % N`

Quand on ajoute ou retire un nœud, il faut redistribuer les partitions. Ici se cache l'erreur classique, et elle est instructive. La tentation est d'écrire `partition = hash(key) % N` avec N = nombre de nœuds. Le problème :

```
   10 nœuds :  hash(key) % 10
   on ajoute 1 nœud → hash(key) % 11
   → ≈ 90 % des clés changent de nœud → migration massive, cluster à genoux
```

Changer le diviseur remappe presque tout. La solution est de **découpler le nombre de partitions du nombre de nœuds** : on fixe un grand nombre de partitions une fois pour toutes (disons 1000), bien supérieur au nombre de nœuds. Chaque nœud héberge un paquet de partitions (≈ 100 avec 10 nœuds). Ajouter un nœud, c'est lui déplacer quelques partitions entières (≈ 10 %), pas remapper les clés. Cassandra atteint le même but avec un **anneau de hachage cohérent** : chaque nœud possède un arc de l'anneau, et un nouveau nœud ne prend des clés qu'à ses voisins immédiats — seulement ≈ 1/N des clés bougent. Le principe général : *une bonne stratégie de partitionnement minimise les données déplacées lors d'un changement de topologie.* C'est le même critère qui rend le hachage cohérent supérieur pour un cache distribué.

---

## Axe 3 — Les transactions : ACID, et la vérité sur l'isolation

Une **transaction** regroupe plusieurs opérations en une unité qui réussit ou échoue en bloc. Son intérêt est de simplifier votre modèle mental : au lieu de gérer une combinatoire de pannes et de concurrences partielles, vous obtenez une garantie tout-ou-rien. ACID nomme quatre propriétés, mais Kleppmann insiste : deux d'entre elles sont mal comprises, et une est carrément un abus de langage.

**Atomicity (atomicité)** ne parle *pas* de concurrence. Elle parle de **sécurité au crash** : si une transaction est interrompue au milieu, aucune de ses écritures ne reste visible. Le WAL le garantit — soit tout est commité, soit rien. « Atomique » ici veut dire « pas d'état partiel après un plantage », pas « indivisible vis-à-vis des autres threads ».

**Consistency (cohérence)** dans ACID est, selon Kleppmann, le mot de trop : c'est **votre** responsabilité, pas celle de la base. La base fait respecter des contraintes qu'on lui déclare (`NOT NULL`, `UNIQUE`, clés étrangères), mais l'invariant métier « le solde ne descend jamais sous zéro » ou « au moins un médecin de garde », c'est à votre code de le maintenir. La base fournit les *outils* (atomicité, isolation) ; l'invariant, c'est vous.

**Durability (durabilité)** : une fois commité, ça survit au crash. Sur une machine, c'est le WAL. En distribué, la durabilité « vraie » exige la réplication synchrone vers 2+ nœuds — sinon un commit durable sur un leader mort et non répliqué est perdu. On retrouve le compromis de l'axe 1.

Reste **Isolation** — la propriété difficile, celle qui occupe la moitié de ce chapitre chez Kleppmann. C'est votre modèle mémoire.

### L'isolation *est* un modèle mémoire

Voici le pont avec votre monde. Un CPU moderne n'exécute pas les accès mémoire dans l'ordre naïf du programme : il réordonne, met en tampon les écritures, spécule. Le **modèle mémoire** (x86-TSO, ARM faible, etc.) définit précisément quelles réordonnancements sont visibles, et vous placez des barrières pour interdire ceux qui casseraient votre programme. Le compromis est éternel : *plus le modèle est fort, plus il est simple à raisonner, plus il coûte cher.*

Les **niveaux d'isolation** d'une base sont exactement cela, appliqués aux transactions concurrentes. Un niveau fort rend le raisonnement trivial (tout se passe comme si les transactions s'exécutaient une par une) mais coûte en débit. Un niveau faible est rapide mais laisse passer des **anomalies** — des comportements que votre code n'a pas prévus. Comprendre l'isolation, c'est savoir exactement quelles anomalies chaque niveau autorise, et si votre invariant y survit.

Parcourons les niveaux du plus faible au plus fort, chacun défini par l'anomalie qu'il élimine.

### Read Committed : pas de lecture sale

C'est le défaut de PostgreSQL et d'Oracle. Deux garanties : on ne lit que des données **commitées** (pas de *dirty read* — on ne voit jamais l'écriture non encore validée d'une autre transaction, qui pourrait être annulée), et on n'écrase que des données commitées (pas de *dirty write*).

Ce que Read Committed **laisse passer** : la **lecture non répétable** (*non-repeatable read*, ou *read skew*). Dans une même transaction, vous lisez une valeur, une autre transaction la modifie et commit, vous relisez : la valeur a changé *à l'intérieur* de votre transaction.

```
   T1 : SELECT balance → 500
                              T2 : UPDATE balance = 300; COMMIT
   T1 : SELECT balance → 300     ← deux réponses différentes dans T1 !
```

Anodin pour une valeur isolée, catastrophique pour une opération qui lit plusieurs lignes censées être cohérentes entre elles (un backup, un rapport financier qui voit un virement à moitié appliqué). D'où le niveau suivant.

### Snapshot Isolation : un instantané figé, grâce au MVCC

Aussi appelé *Repeatable Read* dans PostgreSQL et MySQL. L'idée : **chaque transaction voit un instantané cohérent** de la base, figé à l'instant où elle a commencé. Tout ce qui est commité après le début de la transaction lui est invisible. Vous êtes dans une bulle temporelle stable.

Le mécanisme est le **MVCC** (Multi-Version Concurrency Control), et il va vous parler : au lieu de modifier une ligne en place, la base garde **plusieurs versions** de chaque ligne. Dans PostgreSQL, chaque ligne porte un `xmin` (l'ID de transaction qui l'a créée) et un `xmax` (celle qui l'a supprimée/remplacée). Une transaction ne voit qu'une version selon une règle de visibilité :

```
   visible  ⟺  xmin ≤ mon_tx_id  ET  (xmax = 0  OU  xmax > mon_tx_id)
             « créée avant moi, et pas encore supprimée de mon point de vue »
```

C'est du **RCU** (Read-Copy-Update). Les lecteurs ne bloquent jamais les écrivains, les écrivains ne bloquent jamais les lecteurs, parce que chacun lit sa version. Vous avez implémenté cette idée dans un noyau ; c'est la même, et c'est pourquoi Snapshot Isolation est si performante. Elle élimine les lectures sales *et* non répétables. Excellent défaut pour la grande majorité des applications.

Mais elle laisse passer une anomalie subtile, et c'est celle qui piège même les ingénieurs chevronnés.

### Le write-skew : un TOCTOU distribué

Voici l'anomalie que Snapshot Isolation ne bloque *pas*, et c'est structurellement un **TOCTOU** — Time-Of-Check to Time-Of-Use, la classe de failles que vous connaissez par cœur en sécurité. Deux transactions **lisent** le même état, chacune **décide** en fonction de ce qu'elle a vu, puis **agit** — et parce que chacune a agi sur une ligne *différente*, aucun verrou de ligne ne les a fait entrer en collision. L'invariant global saute.

L'exemple canonique : la règle « au moins un médecin de garde ».

```
   Invariant métier : COUNT(médecins de garde) ≥ 1

   Alice et Bob sont tous deux de garde. Chacun veut se retirer.

   T_Alice : SELECT COUNT(*) WHERE de_garde → 2   (voit Bob de garde)
   T_Bob   : SELECT COUNT(*) WHERE de_garde → 2   (voit Alice de garde)
   T_Alice : UPDATE ... SET de_garde=false WHERE nom='Alice'   ← ligne Alice
   T_Bob   : UPDATE ... SET de_garde=false WHERE nom='Bob'     ← ligne Bob
   COMMIT / COMMIT

   Résultat : PERSONNE de garde. Invariant violé.
```

Chaque transaction, dans sa bulle Snapshot, a vu un état où l'invariant tenait. Elles ont écrit sur des lignes distinctes (Alice ↔ Bob), donc aucun conflit d'écriture, aucun verrou déclenché. Le check et le use étaient séparés par une fenêtre, et l'autre transaction s'y est glissée. C'est un TOCTOU jusqu'à l'os.

**Attention au faux correctif.** Le réflexe est d'écrire `SELECT COUNT(*) ... FOR UPDATE` pour verrouiller ce qu'on a lu. C'est faux à deux titres. D'abord, c'est **invalide en SQL PostgreSQL** : `FOR UPDATE` est interdit avec une agrégation. Ensuite, même corrigé conceptuellement, c'est **inopérant** : les verrous de ligne verrouillent des lignes *existantes*, ils n'empêchent pas l'apparition d'une *nouvelle* ligne (un **phantom**) qui violerait le prédicat. Le write-skew survit. Verrouiller ce qu'on a lu ne suffit pas quand le danger est ce qu'on *n'a pas encore* lu.

**Les vrais correctifs**, il faut les connaître précisément :

1. **L'isolation SERIALIZABLE.** On monte au niveau maximal ; en PostgreSQL, le **SSI** (Serializable Snapshot Isolation) détecte le cycle de dépendances lecture/écriture et **avorte** l'une des deux transactions, qui devra réessayer. C'est le correctif propre et général.

2. **Matérialiser le conflit.** On force les deux transactions à entrer en collision sur un *objet réel commun*. Concrètement : verrouiller une ligne qui *représente* le prédicat — par exemple `SELECT ... FOR UPDATE` sur une ligne « garde du jour J » que les deux transactions doivent prendre —, ou utiliser un **verrou de prédicat / verrou consultatif (advisory lock)** explicite. Les deux transactions se sérialisent alors sur le même verrou, et le TOCTOU se referme.

Retenez la logique de sécurité : *pour tuer un TOCTOU, il faut que le check et le use soient atomiques vis-à-vis de tout ce qui pourrait invalider la condition — y compris ce qui n'existe pas encore.* Verrouiller les lignes lues ne le fait pas ; sérialiser les transactions, ou matérialiser un point de rendez-vous commun, le fait.

Pour être complet, l'anomalie du **phantom** est le cas général derrière le write-skew : une transaction écrit et change le résultat d'une recherche par prédicat qu'une autre transaction a effectuée. Snapshot Isolation gère les phantoms simples via le MVCC, mais pas ceux qui traversent un write-skew. Seul le sérialisable les élimine tous.

### Serializable : l'étalon-or, et ses trois implémentations

Le niveau **Serializable** garantit que le résultat est *comme si* les transactions s'étaient exécutées une par une, en série, dans un ordre quelconque. Toutes les anomalies disparaissent — c'est le modèle mémoire séquentiellement cohérent des bases de données. Trois façons de l'atteindre, avec des profils de coût opposés :

**Exécution série réelle.** On exécute littéralement une transaction à la fois, sur un seul thread (VoltDB/H-Store, Redis). Étonnamment viable si les transactions sont courtes et que tout tient en RAM — pas de verrou, pas de surcoût de coordination. Ne passe pas l'échelle sur des transactions longues ou I/O-bound.

**Two-Phase Locking (2PL).** L'approche traditionnelle et pessimiste : on prend des verrous (partagés en lecture, exclusifs en écriture) et on les garde jusqu'au commit. Correct, mais lent et sujet aux interblocages et à la contention. C'est le gros verrou global : sûr, mais il tue le parallélisme.

**Serializable Snapshot Isolation (SSI).** L'approche moderne et **optimiste** (PostgreSQL 9.1+, CockroachDB, FoundationDB). On laisse les transactions avancer comme en Snapshot Isolation — donc rapides, sans verrou pénalisant —, mais on **traque les dépendances** lecture/écriture. Si, au commit, on détecte un cycle qui trahirait une exécution non sérialisable, on **avorte le perdant**, qui réessaie. Excellent quand la contention est faible (les avortements sont rares) ; se dégrade quand elle est forte (beaucoup de retries). C'est de la concurrence optimiste, exactement comme un compare-and-swap qui échoue et reboucle : on parie sur l'absence de conflit et on paie seulement quand il y en a un.

Le principe de décision : **choisissez le niveau d'isolation explicitement, en sachant lequel vous utilisez.** Le défaut varie selon la base (Read Committed pour PostgreSQL, Repeatable Read pour MySQL), et il est souvent *plus faible* que ce que votre invariant exige. Pour de l'argent ou une règle métier dure, montez à Serializable et acceptez le coût. Pour des préférences utilisateur, Read Committed suffit largement. Ne payez la cohérence forte que là où elle achète réellement de la correction.

---

## Axe 4 — Cohérence et consensus : s'accorder malgré les pannes

On remonte d'un cran en abstraction. Au-delà des transactions locales, les systèmes distribués posent la question : *quand plusieurs machines détiennent une donnée, quelles garanties d'ordre et de fraîcheur offre-t-on à l'observateur ?* C'est une hiérarchie de **modèles de cohérence**, du plus faible au plus fort — encore une fois, votre hiérarchie de modèles mémoire, transposée au réseau.

```
   Plus FAIBLE (rapide, disponible)  ────────────►  Plus FORT (lent, coordonné)

   Cohérence      Monotonic     Read-your     Snapshot      Linéarisabilité
   éventuelle  →  reads      →  -writes    →  isolation  →  (linearizability)

   « finiront    « jamais      « je vois    « instantané  « comme s'il n'y
   par            de retour     mes propres  cohérent      avait qu'UNE
   s'accorder »   en arrière »  écritures »  par tx »      seule copie »
```

**Cohérence éventuelle (eventual consistency).** La garantie la plus faible : *si les écritures cessent, toutes les copies finiront par converger.* Aucune borne de temps. C'est le défaut de Cassandra, de DynamoDB, du DNS (une mise à jour DNS met 24-48 h à se propager mondialement). Parfait pour ce qui tolère un décalage ; piégeux si votre code suppose de la fraîcheur.

**Linéarisabilité (linearizability).** La garantie la plus forte : le système se comporte *comme s'il n'existait qu'une seule copie de la donnée*, et toute opération semble prendre effet atomiquement à un instant précis entre son début et sa fin, dans l'ordre temps-réel. Dès qu'une écriture est confirmée, toute lecture ultérieure la voit — partout. C'est la **consistance séquentielle** que vous attendez d'un registre atomique matériel, hissée au niveau d'un système réparti. etcd, ZooKeeper, Spanner l'offrent. Elle coûte cher : elle exige une coordination — un **consensus** — à chaque opération.

### Le consensus : l'accord sur l'ordre

Comment plusieurs machines faillibles, reliées par un réseau qui ment (messages perdus, retardés, dupliqués), se mettent-elles d'accord sur une valeur unique — ou, plus utile, sur *l'ordre* d'une séquence d'opérations ? C'est le problème du **consensus**, résolu par des algorithmes comme **Paxos** et **Raft**. Ils garantissent qu'une majorité (un quorum) s'accorde sur chaque décision, et qu'une décision prise ne se rétracte jamais, même si des nœuds tombent et reviennent.

Le lien avec le chapitre sur le log est direct : *le consensus, c'est se mettre d'accord sur l'ordre du log.* Une fois l'ordre fixé et répliqué, chaque machine rejoue la même séquence et atteint le même état (réplication par machine à états). C'est pourquoi ZooKeeper, etcd et consorts servent de « colonne vertébrale » de coordination — élection de leader, verrous distribués, configuration — pour des systèmes plus gros qui, eux, n'ont pas envie de refaire du consensus à chaque écriture. Le consensus est puissant mais lent (plusieurs allers-retours réseau, quorum obligatoire) : on l'utilise pour les *décisions rares et critiques*, pas pour le trafic de données courant.

### CAP, et pourquoi il faut le dépasser

Le **théorème CAP** est le slogan le plus cité et le plus mal compris du domaine. Sa formulation populaire — « choisis deux parmi Cohérence, Disponibilité, tolérance au Partitionnement » — est trompeuse. La partition réseau n'est pas un choix : sur un vrai réseau, les partitions *arrivent*, point. Donc le P est imposé. Le vrai énoncé est plus étroit : **pendant une partition réseau, un système doit choisir entre rester cohérent (linéarisable) ou rester disponible.** Il ne peut pas les deux. Un système **CP** (comme Spanner, etcd) refuse les requêtes du côté minoritaire pour ne jamais mentir ; un système **AP** (comme Cassandra en mode éventuel) répond toujours, quitte à servir du périmé.

Kleppmann ajoute une nuance essentielle : CAP définit « cohérence » comme **linéarisabilité** précisément, la plus forte. La plupart des systèmes utilisent une cohérence *plus faible* — et sous cette définition relâchée, on peut parfaitement avoir « du C » *et* « de l'A ». CAP ne s'applique qu'au sommet de la hiérarchie. Ne laissez pas ce théorème binaire écraser tout le spectre des cohérences intermédiaires qui font tourner la vraie vie.

### PACELC : le compromis que CAP oublie

CAP a un angle mort béant : il ne parle *que* du cas de panne. Or les partitions sont rares ; le régime normal est la vaste majorité du temps. **PACELC** (Abadi) complète le tableau et c'est le modèle mental à retenir :

```
   PAC  : en cas de Partition (P),  choisir Availability (A) ou Consistency (C)
   ELC  : Else (E), en régime normal, choisir Latency (L) ou Consistency (C)
```

Traduction : *même sans aucune panne*, offrir une cohérence forte coûte de la **latence** — parce qu'il faut coordonner les réplicas (attendre un quorum, un aller-retour de consensus) avant de répondre. Un système peut donc être « PC/EL » : cohérent pendant les partitions, mais privilégiant la latence en temps normal. Ou « PC/EC » comme Spanner : cohérent tout le temps, et il paie la latence tout le temps (les fameuses attentes sur TrueTime). C'est le cadre juste pour décider, parce qu'il vous oblige à raisonner sur le coût de la cohérence *au quotidien*, pas seulement lors des incidents rares. La question de CTO n'est pas « CP ou AP ? » une fois par an ; c'est « combien de latence suis-je prêt à payer pour de la cohérence, à chaque requête ? ».

---

## Axe 5 — Batch et stream : traiter le passé et le présent

Dernier grand axe : une fois les données stockées et répliquées, comment les *transformer* à grande échelle ? Deux paradigmes, distingués par une seule propriété — **la donnée est-elle bornée ou infinie ?**

**Le traitement par lots (batch)** — MapReduce, Spark — opère sur un jeu de données **borné et fini** : le contenu d'hier, l'intégralité d'une table, un instantané. On optimise pour le **débit maximal** : latence de quelques minutes à quelques heures, on ne s'en soucie pas, on veut ingérer des téraoctets efficacement. Tolérance aux pannes simple et robuste : une tâche échoue, on la **ré-exécute** ; comme les entrées sont immuables et les fonctions déterministes, rejouer donne le même résultat (idempotence → *exactly-once* naturel). Cas d'usage : rapports nocturnes, reconstruction d'un index de recherche depuis zéro, entraînement de modèles, ETL vers l'entrepôt de données.

**Le traitement de flux (stream)** — Kafka Streams, Flink — opère sur un flux **non borné et infini** d'événements qui arrivent en continu. On optimise pour la **faible latence** : millisecondes à secondes. Le débit est moindre que le batch, et la tolérance aux pannes est plus délicate : on **checkpointe** l'état régulièrement et on redémarre depuis le dernier point ; l'*exactly-once* y est plus dur à garantir (il faut des consommateurs idempotents). Cas d'usage : détection de fraude en temps réel (< 1 s), tableaux de bord vivants, alerting, pipelines CDC (Change Data Capture).

Le compromis se lit d'une ligne : **batch = débit maximal, latence élevée, tolérance aux pannes triviale ; stream = latence minimale, débit moindre, tolérance aux pannes subtile.** Vous choisissez selon la fraîcheur exigée par le besoin, pas par goût de la modernité.

### Lambda contre Kappa : faut-il deux moteurs ou un seul ?

Comme on veut souvent *les deux* (l'exactitude du batch et la réactivité du stream), deux architectures s'affrontent.

**L'architecture Lambda** fait tourner les deux en parallèle : une **couche batch** lente mais exacte qui retraite tout l'historique, une **couche vitesse** (stream) rapide mais approximative sur les données récentes, et une **couche service** qui fusionne les deux résultats. Ça marche, mais le défaut est lourd : **deux bases de code à maintenir** (la même logique métier écrite deux fois, en batch et en stream), avec le risque permanent de divergence.

**L'architecture Kappa** (Kreps, 2014) supprime la couche batch. *Tout* est un flux ; le « batch » n'est qu'un rejeu du log Kafka depuis le début. **Une seule base de code** sert le temps réel et l'historique. L'avantage — un seul moteur, une seule logique — est énorme pour la maintenabilité. L'inconvénient : le traitement de flux reste plus ardu que le batch pour certaines analytiques lourdes et complexes. Le lien avec le chapitre du log est direct : Kappa *est* la vision « le log est la source de vérité, tout le reste en dérive » poussée à sa conclusion. Si vous avez lu le chapitre sur le Log, vous savez déjà pourquoi Kreps préfère Kappa.

Un mot sur la conclusion pratique de cet axe : l'**Event Sourcing** (stocker les événements, pas l'état) et le **CQRS** (séparer le modèle d'écriture du modèle de lecture) sont les patrons applicatifs qui matérialisent cette philosophie. On stocke une séquence immuable de faits (`CommandeCréée`, `ArticleAjouté`, `CommandePayée`) et on *dérive* l'état courant en les rejouant. Bénéfices : audit intégré, voyage dans le temps (l'état à n'importe quelle date), rejeu après correction de bug, projections multiples depuis les mêmes événements. Coût : plus de complexité, et une cohérence éventuelle entre le modèle d'écriture et les vues de lecture. À réserver aux domaines où l'historique et l'auditabilité sont de vraies exigences métier — comptabilité, finance, workflows réglementés —, pas à un CRUD ordinaire.

---

## Synthèse : comment décider

Vous avez maintenant les cinq axes. Le talent d'architecte n'est pas de les connaître, c'est de repérer *lequel votre problème réel met sous tension* et de placer le curseur en conscience. Voici la démarche.

**Commencez par mesurer, pas par imaginer.** Quel est votre paramètre de charge dominant — utilisateurs, volume, débit, fan-out ? Quel est votre ratio lecture/écriture ? Quelle fraîcheur le métier exige-t-il *réellement* ? Un rapport financier tolère quelques minutes de retard ; un solde de compte, non. La plupart des débats d'architecture s'évaporent dès qu'on chiffre ces trois nombres.

**Choisissez votre base par défaut, et justifiez tout écart.** Le raisonnement de Kleppmann est un arbre court :

```
   Transactions ACID entre plusieurs enregistrements ?
     ├─ oui + échelle mondiale  → NewSQL (Spanner, CockroachDB)
     ├─ oui, échelle normale    → PostgreSQL   ◄── le défaut qui se trompe rarement
     └─ non → quel est le patron d'accès dominant ?
           ├─ cache clé-valeur, < 1 ms     → Redis
           ├─ séries temporelles           → TimescaleDB / ClickHouse
           ├─ recherche plein-texte        → Elasticsearch (ou pg_search)
           ├─ parcours de graphe           → Neo4j / Neptune
           ├─ écriture massive, multi-région → Cassandra
           └─ analytique lourde            → ClickHouse / BigQuery
```

PostgreSQL est le défaut par défaut : il gère des millions de transactions/jour, il fait du JSON, du plein-texte, du géospatial, du time-series avec des extensions. On ne s'en écarte que pour un patron d'accès qu'il sert mal *et qu'on a mesuré*. Un système spécialisé n'est jamais gratuit : il ajoute de l'exploitation, une source de vérité de plus, une cohérence à réconcilier.

**Choisissez vos niveaux de cohérence et d'isolation explicitement.** Le défaut de votre base est souvent plus faible que votre invariant. Argent, stocks, règles métier dures → Serializable / linéarisable, et payez la latence. Préférences, compteurs de vues, fils d'actualité → Read Committed / cohérence éventuelle, encaissez la performance. Le PACELC est votre boussole : à chaque requête, combien de latence pour combien de cohérence ?

**Ne concevez pas pour une échelle que vous n'avez pas.** Kleppmann et l'expérience convergent : 99 % des applications n'atteignent jamais la phase de sharding. La trajectoire saine est graduelle — un serveur (PostgreSQL + Redis) tant que ça tient ; puis scalabilité verticale + réplicas de lecture + cache + file asynchrone ; puis, seulement si la douleur est réelle, scalabilité horizontale (load balancer, app stateless, pooling de connexions, file de messages) ; et le sharding en tout dernier recours. *Scalez quand la douleur est réelle, pas imaginaire.* Le distribué ajoute de la complexité à chaque couche ; il faut que le bénéfice la justifie.

**Illustration — le fan-out de Twitter, un compromis en action.** Comment livrer un tweet aux fils de tous les abonnés ? Deux options pures. En **pull** (calcul à la lecture), l'écriture est triviale (un `INSERT`) mais lire un fil exige de requêter tous les comptes suivis — insoutenable à 300 K lectures de fil/seconde. En **push** (pré-calcul), on écrit le tweet dans le cache de chaque abonné : la lecture devient triviale (`O(1)`), mais un compte à 30 M d'abonnés déclenche 30 M d'écritures par tweet. Aucune des deux n'est bonne partout. La solution de Twitter est **hybride** : push pour les utilisateurs normaux (lectures rapides, coût d'écriture acceptable), pull pour les célébrités (on évite l'explosion d'écritures), et fusion des deux à la lecture. C'est exactement le raisonnement qu'on attend de vous — non pas « quelle est la bonne architecture », mais « quel paramètre de charge domine *pour ce segment*, et quel curseur y répond ».

**Gardez à l'esprit l'ordre de grandeur des latences.** Toutes vos décisions de placement en découlent :

```
   Cache L1                 0,5 ns          ┐
   Cache L2                   7 ns          │ le domaine du CPU
   RAM                      100 ns          ┘
   Lecture SSD aléatoire    100 µs   (0,1 ms)      ┐
   Aller-retour même DC     0,5 ms                 │ le domaine du système
   Aller-retour inter-DC     30 ms                 │
   Aller-retour mondial     150 ms                 ┘
```

Un accès mémoire est 100 000 fois plus rapide qu'un aller-retour inter-datacenter. C'est pourquoi le cache en mémoire (Redis) sert des lectures sous la milliseconde, pourquoi un cache miss froid sur SSD coûte 100× plus, et pourquoi *toute* traversée inter-datacenter est à minimiser avec acharnement. Vous avez cette table gravée pour le sous-système mémoire ; c'est la même discipline, deux ou trois ordres de grandeur plus haut.

---

## À retenir

1. **Concevez pour la panne, pas contre elle.** Les disques meurent, le réseau se partitionne, les humains se trompent — comme un ingénieur sécurité suppose l'attaquant présent. La question n'est jamais « comment empêcher », c'est « comment le système se comporte pendant et après ». La capacité à rejouer l'histoire pour réparer vaut mieux que l'illusion de ne jamais tomber.

2. **Mesurez avant d'optimiser, et mesurez la queue.** Définissez votre paramètre de charge dominant, raisonnez en P99/P999 et non en moyenne. La plupart des débats d'architecture se règlent en chiffrant trois nombres : charge dominante, ratio lecture/écriture, fraîcheur réellement exigée.

3. **La réplication est un problème de cohérence de cache, et chaque architecture place un curseur.** Single-leader = simple à raisonner, limité par le lag. Multi-leader = disponibilité géographique contre l'enfer de la résolution de conflits. Leaderless = quorum `W + R > N`, disponibilité d'abord, cohérence éventuelle. Il n'y a pas de repas gratuit, seulement des curseurs.

4. **L'isolation est un modèle mémoire ; connaissez le vôtre explicitement.** Read Committed tue les lectures sales, Snapshot Isolation (MVCC = RCU) tue les lectures non répétables, Serializable tue tout. Le défaut de votre base est souvent plus faible que votre invariant — montez à Serializable pour l'argent, restez bas pour les préférences.

5. **Le write-skew est un TOCTOU, et son correctif n'est pas de verrouiller ce qu'on a lu.** `SELECT COUNT(*) FOR UPDATE` est invalide *et* inefficace (les verrous de ligne n'arrêtent pas un phantom). Les vrais correctifs : l'isolation **SERIALIZABLE** (le SSI de PostgreSQL détecte le cycle et avorte un perdant), ou **matérialiser le conflit** sur un objet commun (verrou de prédicat / advisory lock). Rendez le check et le use atomiques vis-à-vis de ce qui n'existe pas encore.

6. **CAP est trop binaire ; raisonnez en PACELC.** En partition, choisissez cohérence ou disponibilité ; mais *en régime normal*, chaque cran de cohérence forte coûte de la latence, à chaque requête. La cohérence forte exige un consensus (Paxos/Raft = s'accorder sur l'ordre du log), donc des allers-retours. Réservez-la aux décisions rares et critiques.

7. **Restez simple, scalez quand la douleur est réelle.** PostgreSQL est le défaut qui se trompe rarement ; on ne s'en écarte que pour un patron d'accès mal servi *et mesuré*. 99 % des applications n'atteignent jamais le sharding. Le distribué ajoute de la complexité partout — que le bénéfice la justifie. « Make it work, make it right, make it fast » — dans cet ordre.

---

## Pour aller plus loin

- **Martin Kleppmann — *Designing Data-Intensive Applications*** (O'Reilly, 2017). La source. À lire intégralement une fois, puis à rouvrir chapitre par chapitre selon vos décisions du moment. Les chapitres 5 (réplication), 6 (partitionnement), 7 (transactions) et 9 (cohérence & consensus) sont le cœur de ce dossier.
- **Les papiers fondateurs, en regard des chapitres** : Dynamo (leaderless, hachage cohérent, cohérence éventuelle), Spanner (ACID et linéarisabilité à l'échelle mondiale, TrueTime), Bigtable (LSM-Tree, partitionnement par intervalle), GFS (la panne comme norme), Kafka et *The Log* de Kreps (le socle de l'axe batch/stream et de l'architecture Kappa). DDIA est explicitement le pont entre ces papiers et la pratique.
- **Daniel Abadi — *Consistency Tradeoffs in Modern Distributed Database System Design*** (2012), l'article qui introduit PACELC, pour aller au-delà de CAP.
- **Peter Bailis et al. — *Highly Available Transactions*** et les travaux sur les anomalies d'isolation, pour formaliser dirty read / non-repeatable / phantom / write-skew et savoir exactement quel niveau bloque quoi.
- **Le papier Raft (Ongaro & Ousterhout, 2014), *In Search of an Understandable Consensus Algorithm***, pour voir « l'accord sur l'ordre du log » décrit avec une clarté rare — la brique sous ZooKeeper, etcd et Spanner.
- **La documentation PostgreSQL sur les niveaux d'isolation et le SSI**, pour passer de la théorie du write-skew à sa prévention concrète en production.
