===LESSON===
KEY: databases
TOPIC: databases
TITLE: Bases de données
ICON: 🗄️
INTRO: Derrière chaque application se cache un système chargé de stocker, retrouver et protéger l'intégrité des données sous une charge concurrente — et comprendre comment il fonctionne réellement transforme des décisions floues (« quel index ? quelle base ? pourquoi c'est lent ? ») en choix d'ingénierie éclairés.
---SECTION---
HEADING: Le stockage n'est pas neutre : ce qu'une base fait vraiment
BODY:
Une base de données répond à deux exigences en tension : **stocker** durablement des données et les **retrouver** efficacement. Toute la richesse du domaine vient de ce que ces deux buts sont contradictoires. Optimiser l'écriture (empiler vite des données) dégrade la lecture (il faut les fouiller) ; optimiser la lecture (les trier, les indexer) dégrade l'écriture (il faut maintenir cette organisation à chaque insertion).

Kleppmann (DDIA) structure toute sa réflexion autour de trois propriétés recherchées d'un système de données :

- **Fiabilité** (*reliability*) : le système continue de fonctionner correctement même en cas de panne matérielle, de bug logiciel ou d'erreur humaine.
- **Scalabilité** (*scalability*) : il garde des performances acceptables quand la charge augmente (plus d'utilisateurs, plus de données, plus de requêtes).
- **Maintenabilité** (*maintainability*) : des humains différents peuvent le faire évoluer sereinement dans le temps.

Le point central à intérioriser : **il n'existe pas de base « meilleure » dans l'absolu**. Chaque choix — modèle de données, moteur de stockage, stratégie de réplication — est un *compromis* (trade-off) qui privilégie certains accès au détriment d'autres. Votre travail d'ingénieur n'est pas de trouver la solution parfaite, mais de choisir consciemment quel compromis correspond à votre charge de travail (*workload*). Ce cours vous donne le vocabulaire et les mécanismes pour faire ces choix.
---SECTION---
HEADING: Modèles de données : relationnel, document, graphe, colonne
BODY:
Le **modèle de données** est l'abstraction la plus importante d'un système, car il façonne la manière dont vous *pensez* le problème. Quatre grandes familles :

### Relationnel (SQL)
Les données sont des **tuples** rangés dans des **relations** (tables). On relie les tables par des clés étrangères et on assemble à la lecture via des **jointures**. Force : requêtes flexibles et arbitraires sur des données bien structurées ; les relations « plusieurs-à-plusieurs » sont naturelles. C'est le choix par défaut, et il le reste dans la plupart des cas.

### Document (JSON)
On stocke des documents auto-contenus (MongoDB, PostgreSQL `jsonb`). Force : **localité** — un agrégat entier (un profil, une commande avec ses lignes) est lu d'un coup, sans jointure. Idéal quand les données forment un arbre chargé en bloc. Faiblesse : les liens plusieurs-à-plusieurs et les jointures deviennent pénibles ; l'application doit souvent les gérer.

### Graphe
Nœuds et arêtes de premier ordre (Neo4j, Cypher). Force : quand les **relations elles-mêmes** sont le cœur du problème et que la profondeur de parcours est variable — réseaux sociaux, graphes de dépendances, détection de fraude. Une requête « amis d'amis d'amis » y est naturelle là où elle explose en jointures récursives en SQL.

### Orienté colonne
On stocke les valeurs **colonne par colonne** plutôt que ligne par ligne. Idéal pour l'**analytique** (OLAP) : agréger une colonne sur des milliards de lignes ne lit que cette colonne, et la compression est excellente (valeurs voisines similaires). À opposer aux moteurs **orientés lignes**, taillés pour l'**opérationnel** (OLTP), où l'on lit/écrit des enregistrements entiers.

Kleppmann résume : le débat « relationnel vs document » se ramène souvent à la **localité** vs la **flexibilité des jointures**. Choisissez selon la forme réelle de vos accès, pas selon la mode.
---SECTION---
HEADING: OLTP vs OLAP : deux mondes, deux moteurs
BODY:
Distinction fondatrice qui explique presque toutes les décisions d'architecture data.

**OLTP** (*Online Transaction Processing*) — la base « opérationnelle » :
- Beaucoup de requêtes, chacune touchant **peu de lignes**, retrouvées par clé.
- Accès surtout aléatoires, lecture *et* écriture, latence critique (millisecondes).
- Exemple : « récupère la commande #4821 », « débite ce compte ».

**OLAP** (*Online Analytical Processing*) — la base « analytique » / entrepôt de données :
- Peu de requêtes, mais chacune **scanne des millions de lignes** pour agréger.
- Lecture massive, écriture par lots (ETL/ELT), débit plutôt que latence.
- Exemple : « chiffre d'affaires par région et par mois sur 3 ans ».

Pourquoi ne pas tout faire sur la même base ? Parce que les moteurs sont physiquement optimisés à l'opposé. L'OLTP veut un stockage **en lignes** (charger une commande = un accès contigu) ; l'OLAP veut un stockage **en colonnes** (agréger un montant = lire une seule colonne compressée). Lancer de gros rapports analytiques sur la base de production OLTP la met à genoux : c'est précisément pourquoi on extrait les données vers un **entrepôt** (data warehouse) séparé. Gardez cette dualité en tête : beaucoup de « la base est lente » viennent d'une charge OLAP lancée sur un moteur OLTP.
---SECTION---
HEADING: Le B-tree : l'index qui gouverne la plupart des bases
BODY:
Un **index** est une structure de données *secondaire*, dérivée des données primaires, dont le seul but est d'accélérer les lectures — au prix d'un ralentissement des écritures (il faut le maintenir). C'est le compromis fondamental de tout index.

Le **B-tree** (arbre équilibré) est la structure d'indexation dominante (PostgreSQL, MySQL/InnoDB, Oracle…). Petrov (*Database Internals*) en détaille la mécanique :

- Les données sont découpées en **pages** (blocs de taille fixe, typiquement 4 à 16 Ko), l'unité de lecture/écriture sur disque.
- L'arbre est **peu profond mais très large** : chaque nœud interne pointe vers des centaines d'enfants. Un arbre de 3-4 niveaux indexe déjà des milliards de clés.
- Il reste **trié** et **équilibré** : trouver une clé coûte O(log n) — une poignée de sauts de page — et l'arbre se rééquilibre par découpage (*split*) de pages lors des insertions.

Conséquence pratique décisive : parce qu'un B-tree maintient les clés **triées**, il excelle non seulement sur l'égalité (`WHERE id = 42`) mais aussi sur les **plages** (`WHERE date BETWEEN … AND …`) et le **tri** (`ORDER BY`). C'est ce qui en fait le couteau suisse de l'indexation. Winand (*Use The Index, Luke*) insiste : l'index n'est pas magique, c'est une structure triée que vous devez apprendre à faire correspondre à vos requêtes.
---SECTION---
HEADING: B-tree vs LSM-tree : écrire vite ou lire vite
BODY:
Face au B-tree, l'autre grande famille de moteurs est le **LSM-tree** (*Log-Structured Merge-tree*), au cœur de Cassandra, RocksDB, LevelDB, ScyllaDB. Comprendre l'opposition, c'est comprendre pourquoi ces bases se comportent différemment.

### Le principe LSM
Les écritures sont d'abord accumulées en mémoire dans une structure triée (la *memtable*). Quand elle est pleine, on la **vide sur disque en un seul fichier trié et immuable** (une *SSTable*). Les écritures sont donc **séquentielles** — jamais de modification en place. En arrière-plan, un processus de **compaction** fusionne les SSTables, élimine les doublons et les valeurs effacées.

### L'opposition fondamentale
- **B-tree** : modifie les données **en place**, écritures plus dispersées (aléatoires). Excellent en **lecture** (une clé = un chemin unique dans l'arbre).
- **LSM** : écritures **séquentielles** donc très rapides et à fort débit. Mais une **lecture** peut devoir consulter plusieurs SSTables (d'où les *filtres de Bloom* pour éviter les fichiers inutiles).

### Le concept clé : l'amplification
- **Amplification d'écriture** : une écriture logique en engendre plusieurs physiques. Les B-trees écrivent au moins deux fois (journal + page) ; les LSM réécrivent lors des compactions.
- **Amplification de lecture / d'espace** : le LSM peut lire plusieurs fichiers et garder temporairement des données périmées avant compaction.

Règle mentale de Kleppmann : **LSM pour les charges à écriture intensive**, **B-tree pour des lectures prévisibles et un support transactionnel mûr**. Ce n'est pas absolu, mais c'est le bon point de départ.
---SECTION---
HEADING: L'ordre des colonnes d'un index composite
BODY:
C'est l'un des points les plus mal compris — et les plus rentables — de l'indexation. Un **index composite** (multi-colonnes) porte sur `(A, B, C)`. Winand le compare à un **annuaire téléphonique**, trié par *nom* puis par *prénom*.

La règle d'or : un index composite est trié par sa **première colonne d'abord**, puis par la deuxième *à l'intérieur* de chaque valeur de la première, etc. Conséquence :

- Il sert une requête qui filtre sur `A` seul, ou sur `A ET B`, ou sur `A, B, C` — un **préfixe** de gauche à droite.
- Il **ne sert pas** (ou mal) une requête qui filtre sur `B` seul, ou sur `C` seul. Chercher un prénom dans un annuaire trié par nom : inutilisable, il faut tout parcourir.

```sql
-- Index : (client_id, date_commande)
CREATE INDEX idx ON commandes (client_id, date_commande);

-- SERVI efficacement (préfixe respecté) :
WHERE client_id = 42 AND date_commande > '2026-01-01'

-- MAL SERVI : date_commande n'est pas préfixe
WHERE date_commande > '2026-01-01'
```

Le principe qui guide l'ordre (Winand) : **placer d'abord les colonnes utilisées pour l'égalité** (`=`), *ensuite* la colonne utilisée pour une **plage** (`>`, `<`, `BETWEEN`) ou le tri. Une colonne interrogée par plage « ferme la porte » aux colonnes suivantes de l'index pour le filtrage fin. Un seul index bien ordonné remplace souvent plusieurs index mal pensés.
---SECTION---
HEADING: Index couvrant et index partiel : lire sans toucher la table
BODY:
Deux raffinements qui font une énorme différence sur des requêtes chaudes.

### Index couvrant (covering index)
Normalement, l'index vous donne l'emplacement de la ligne, puis la base va **chercher la ligne dans la table** pour lire les autres colonnes : c'est un aller-retour coûteux, souvent la vraie source de lenteur. Un **index couvrant** contient *toutes les colonnes dont la requête a besoin*. La base répond alors **entièrement depuis l'index**, sans jamais toucher la table — Winand parle d'*index-only scan*.

```sql
-- La requête ne lit que client_id, date, montant
CREATE INDEX idx ON commandes (client_id, date_commande) INCLUDE (montant);
-- PostgreSQL : INCLUDE ajoute montant à la feuille de l'index
-- sans l'utiliser pour le tri -> index-only scan possible
```

### Index partiel (partial index)
Un index qui n'indexe **qu'un sous-ensemble** des lignes, via une clause `WHERE`. Utile quand vos requêtes ne portent que sur une fraction des données (les commandes `actives`, les lignes non archivées).

```sql
CREATE INDEX idx_actives ON commandes (date_commande)
WHERE statut = 'active';
```

Avantages : index **plus petit** (tient mieux en mémoire, plus rapide à parcourir) et **moins coûteux à maintenir** (les lignes exclues ne le mettent pas à jour). L'idée générale : un index ne devrait indexer que ce que vous interrogez réellement.
---SECTION---
HEADING: Transactions et ACID : le contrat d'intégrité
BODY:
Une **transaction** regroupe plusieurs opérations en une **unité logique** qui réussit ou échoue *en bloc*. C'est un mécanisme de simplification : elle vous permet d'ignorer certaines classes de pannes et de concurrence, en offrant des garanties résumées par l'acronyme **ACID**. Kleppmann met en garde : ACID est souvent un argument marketing flou ; il faut connaître le sens précis de chaque lettre.

- **Atomicité** (*Atomicity*) : tout ou rien. Si une opération échoue en cours de route, la transaction est **annulée intégralement** (*rollback*) — aucun état intermédiaire ne subsiste. (Rien à voir avec la concurrence : ici « atomique » = *abortable*.)
- **Cohérence** (*Consistency*) : la transaction fait passer la base d'un état valide à un autre état valide *selon vos invariants applicatifs* (ex. un solde ne devient pas négatif). Kleppmann souligne que ce « C » est surtout une propriété de **votre application**, pas de la base — c'est un peu l'intrus de l'acronyme.
- **Isolation** : les transactions concurrentes s'exécutent **comme si** elles étaient seules. C'est la lettre la plus subtile — et rarement totale en pratique, d'où les niveaux d'isolation.
- **Durabilité** (*Durability*) : une fois validée (*commit*), la transaction survit à une panne (données écrites sur disque / répliquées).

Atomicité et durabilité concernent une seule transaction face aux pannes ; **isolation** concerne les transactions *entre elles*. C'est cette dernière qui va nous occuper, car c'est là que vivent les bugs subtils.
---SECTION---
HEADING: Les anomalies de concurrence : ce que l'isolation doit empêcher
BODY:
Sans isolation, des transactions concurrentes se marchent dessus et produisent des **anomalies**. Les nommer précisément est indispensable pour comprendre les niveaux d'isolation, car ceux-ci se *définissent* par les anomalies qu'ils autorisent ou interdisent.

- **Dirty read** (lecture sale) : une transaction lit une donnée écrite par une autre transaction **non encore validée**. Si cette dernière fait un rollback, vous avez lu une valeur qui n'a jamais existé.
- **Dirty write** (écriture sale) : une transaction **écrase** une écriture non validée d'une autre. Toujours à interdire ; brise l'atomicité.
- **Non-repeatable read** (lecture non répétable / *read skew*) : vous lisez une ligne, puis la relisez plus tard dans la même transaction et elle a **changé** (une autre transaction l'a validée entre-temps). La transaction voit une base incohérente dans le temps.
- **Phantom** (lecture fantôme) : vous exécutez une requête à condition (`WHERE statut='libre'`), une autre transaction **insère ou supprime** une ligne qui correspond, et une nouvelle exécution renvoie un ensemble différent. Le problème n'est pas une ligne modifiée mais l'**apparition/disparition** de lignes.
- **Lost update** (mise à jour perdue) : deux transactions lisent la même valeur, la modifient chacune, et la seconde **écrase** la première. Classique du `compteur = compteur + 1` en lecture-modification-écriture.
- **Write skew** : deux transactions lisent le même ensemble, prennent chacune une décision valide *individuellement*, mais dont la **combinaison viole un invariant**. Ex. : deux médecins de garde se retirent simultanément parce que chacun voit que « l'autre est encore là » — résultat : plus personne de garde.

Ces anomalies ne sont pas académiques : ce sont des bugs de production, souvent invisibles en test et destructeurs en charge réelle.
---SECTION---
HEADING: Les niveaux d'isolation : le vrai sens de « Read Committed » à « Serializable »
BODY:
Le SQL standard définit des **niveaux d'isolation** croissants, chacun interdisant davantage d'anomalies — au prix de plus de coordination, donc de moins de concurrence. Kleppmann insiste : ces niveaux sont mal nommés et leur comportement varie selon les bases ; raisonnez en termes d'**anomalies empêchées**, pas d'étiquettes.

| Niveau | Dirty read | Non-repeatable | Phantom | Write skew |
|---|---|---|---|---|
| **Read Committed** | empêché | possible | possible | possible |
| **Repeatable Read / Snapshot** | empêché | empêché | souvent empêché* | possible |
| **Serializable** | empêché | empêché | empêché | empêché |

\* En pratique, l'isolation *snapshot* (souvent nommée « Repeatable Read », notamment dans PostgreSQL) empêche les phantoms sur les lignes lues, mais **pas** le write skew.

- **Read Committed** (défaut fréquent) : vous ne lisez que des données validées, et ne surchargez que des écritures validées. Empêche dirty read/write, rien de plus. Suffisant pour beaucoup de cas, insuffisant dès que vous faites de la lecture-décision-écriture.
- **Snapshot Isolation** (« Repeatable Read ») : chaque transaction voit un **instantané cohérent** de la base figé à son démarrage. Excellent compromis, implémenté par MVCC (section suivante). Attention : **ne protège pas du write skew ni du lost update** dans le cas général.
- **Serializable** : garantit que le résultat est **équivalent à une exécution séquentielle** des transactions. Le seul niveau qui élimine *toutes* les anomalies, write skew inclus. Implémentations : verrouillage 2-phases (2PL), ou **SSI** (*Serializable Snapshot Isolation*, PostgreSQL) qui détecte les conflits et annule une transaction fautive.

Leçon opérationnelle : si votre logique fait « lire, décider, écrire » sur un invariant, **Read Committed ne suffit pas** — il faut Serializable, un verrou explicite (`SELECT … FOR UPDATE`), ou une contrainte en base.
---SECTION---
HEADING: MVCC : comment lecteurs et rédacteurs cohabitent
BODY:
Comment une base offre-t-elle un « instantané cohérent » sans bloquer tout le monde ? Grâce au **MVCC** (*Multi-Version Concurrency Control*), le mécanisme au cœur de PostgreSQL, MySQL/InnoDB, Oracle. C'est l'idée qui fait que **les lecteurs ne bloquent jamais les rédacteurs, et réciproquement**.

Le principe : au lieu de modifier une donnée **en place**, la base conserve **plusieurs versions** de chaque ligne. Chaque transaction reçoit un identifiant croissant et ne voit que les versions **validées avant son démarrage** — son instantané.

- Une **écriture** ne détruit pas l'ancienne version : elle crée une **nouvelle version** (dans PostgreSQL, un nouveau *tuple*) et marque l'ancienne comme périmée à partir d'un certain identifiant de transaction (`xmin`/`xmax`).
- Une **lecture** concurrente continue de voir l'**ancienne** version — celle valide dans son instantané. D'où : pas de blocage lecteur/rédacteur.

C'est exactement ce qui implémente la *snapshot isolation*. Mais ce mécanisme a une contrepartie physique majeure : les anciennes versions **s'accumulent**. Il faut un processus de nettoyage — le **VACUUM** dans PostgreSQL — pour récupérer l'espace des versions dont plus aucune transaction n'a besoin. Comprendre MVCC, c'est comprendre pourquoi une base peut « grossir » alors que le nombre de lignes reste stable (voir la section *bloat*).
---SECTION---
HEADING: Réplication : leader-follower, lag et cohérence
BODY:
La **réplication** consiste à garder une copie des mêmes données sur plusieurs machines (nœuds). Objectifs : **haute disponibilité** (survivre à la panne d'un nœud), **rapprocher** les données des utilisateurs, et **scaler les lectures**. Le schéma le plus courant est **leader-follower** (aussi dit *primary-replica*, *master-slave*).

Le mécanisme (Kleppmann) :
- Un nœud est désigné **leader** : toutes les **écritures** passent par lui.
- Le leader diffuse son flux de changements (*replication log*) aux **followers**, qui l'appliquent dans le même ordre.
- Les **lectures** peuvent être servies par n'importe quel nœud — d'où le passage à l'échelle des lectures.

Le piège central est le **replication lag** : les followers appliquent les changements avec un **retard**. Une réplication **asynchrone** (le leader valide sans attendre les followers — le défaut pour la performance) crée une fenêtre où un follower renvoie des données **périmées** (*stale*). D'où des anomalies visibles par l'utilisateur, que Kleppmann nomme et que vous devez connaître :

- **Read-your-writes** : j'écris un commentaire, je recharge, je lis un follower en retard… mon commentaire a disparu. Il faut garantir qu'un utilisateur *lit ses propres écritures* (ex. le router vers le leader juste après une écriture).
- **Monotonic reads** : deux lectures successives tombent sur deux followers de retards différents, et le temps semble « reculer ». Garantie à assurer : ne jamais voir plus vieux qu'avant.

La réplication **synchrone** supprime le lag mais rend l'écriture dépendante des followers (plus lente, plus fragile). Presque tous les systèmes réels sont donc *semi-synchrones* : un follower synchrone, les autres asynchrones.
---SECTION---
HEADING: Quorums : la règle R + W > N
BODY:
Au-delà du leader unique, les systèmes **sans leader** (*leaderless*, façon Dynamo : Cassandra, Riak) répliquent différemment : le client (ou un coordinateur) écrit vers **plusieurs nœuds en parallèle** et lit de même. La cohérence ne repose plus sur un leader mais sur des **quorums**.

Posons **N** = nombre de répliques d'une donnée, **W** = nombre de répliques qui doivent accuser réception d'une **écriture**, **R** = nombre de répliques interrogées à la **lecture**. La règle de quorum :

> **R + W > N**

Pourquoi ça marche : si le jeu des nœuds écrits et le jeu des nœuds lus se **recouvrent** forcément (leur somme dépasse N), alors toute lecture touche **au moins un nœud** qui possède la dernière écriture. On échange de la disponibilité contre de la cohérence en réglant R et W :

- **W = N, R = 1** : lectures rapides, mais toute écriture exige tous les nœuds (fragile aux pannes).
- **W = 1, R = N** : écritures toujours possibles, lectures coûteuses.
- Choix courant : **N = 3, W = 2, R = 2** — tolère la perte d'un nœud tout en garantissant le recouvrement.

Attention (Kleppmann) : même avec R + W > N, des cas limites subsistent (écritures concurrentes, écritures partielles). Des mécanismes comme le **read repair** (le lecteur corrige les répliques en retard qu'il détecte) et le *hinted handoff* renforcent la convergence, mais un quorum **n'est pas** une garantie de linéarisabilité.
---SECTION---
HEADING: Multi-leader et résolution de conflits
BODY:
Parfois plusieurs nœuds doivent accepter des **écritures** : plusieurs datacenters, applications mobiles hors-ligne, édition collaborative. C'est la réplication **multi-leader** (plusieurs primaires). Elle améliore la disponibilité en écriture et la latence locale, mais introduit **le** problème dur de la réplication distribuée : **les conflits**.

Le conflit survient quand **deux leaders modifient la même donnée en parallèle**, chacun validant localement, avant que les flux ne se croisent. Contrairement au leader unique (qui sérialise tout), personne n'a tranché l'ordre. Il faut donc une **stratégie de résolution** :

- **LWW** (*Last Write Wins*) : on garde l'écriture au plus grand horodatage. Simple, mais **destructeur** : il perd silencieusement des données, et les horloges des machines ne sont pas fiables. Kleppmann le déconseille sauf données jetables.
- **Convergence applicative** : fusionner selon une logique métier (ex. additionner les paniers plutôt qu'en choisir un).
- **CRDTs** (*Conflict-free Replicated Data Types*) : des structures de données conçues pour **fusionner automatiquement** sans conflit (compteurs, ensembles, texte collaboratif). C'est la voie moderne pour l'édition concurrente.

La leçon : le multi-leader n'est pas « du leader-follower en mieux ». C'est un modèle qui **délègue à vous** la sémantique de résolution des conflits. Ne l'adoptez que si vous avez un vrai besoin (multi-datacenter actif-actif, offline-first) et une stratégie de fusion claire.
---SECTION---
HEADING: Partitionnement / sharding : par plage ou par hash
BODY:
Quand les données ne tiennent plus sur une machine, on les **partitionne** (on *shard*) : chaque partition vit sur un nœud différent. Le but est de **répartir données et charge** uniformément. Tout l'art est de choisir la **clé de partitionnement** — et Kleppmann montre que ce choix décide de vos performances futures.

### Par plage (range)
On découpe la clé en intervalles contigus (A–F sur le nœud 1, G–M sur le nœud 2…). **Avantage** : les requêtes par plage restent efficaces (données voisines groupées). **Danger** : les **hotspots** (points chauds) — si la clé est le temps, *toutes* les écritures d'aujourd'hui tombent sur la même partition. La charge n'est plus répartie.

### Par hachage (hash)
On applique une fonction de hachage à la clé, et le hash décide de la partition. **Avantage** : distribution **uniforme**, on tue les hotspots dus aux clés séquentielles. **Prix payé** : on **perd** l'efficacité des requêtes par plage (les clés voisines partent sur des nœuds différents).

### Le hotspot résiduel
Même le hachage ne sauve pas d'une **clé très populaire** (une célébrité sur un réseau social) : toutes ses requêtes visent la même partition. Il faut alors des palliatifs applicatifs (ajouter un suffixe aléatoire pour éclater la clé chaude sur plusieurs partitions, au prix de lectures plus complexes).

Point crucial souvent oublié : les **index secondaires** doivent eux aussi être partitionnés, soit **par document** (chaque partition indexe ses propres données — écritures locales mais lectures *scatter/gather* sur toutes les partitions), soit **par terme** (index global partitionné par valeur — lectures ciblées mais écritures dispersées).
---SECTION---
HEADING: Le hachage cohérent : repartitionner sans tout casser
BODY:
Le partitionnement par hash naïf a un défaut fatal. Si vous faites `partition = hash(clé) mod N` et que **N change** (vous ajoutez un nœud), *presque toutes* les clés changent de partition d'un coup : un **rééquilibrage massif** qui déplace la quasi-totalité des données et paralyse le cluster. C'est inacceptable en production.

Le **hachage cohérent** (*consistent hashing*) résout ça. L'idée : placer nœuds *et* clés sur un même **anneau** de hachage (un espace de valeurs circulaire). Une clé appartient au premier nœud rencontré en tournant dans le sens horaire.

- Ajouter/retirer un nœud ne déplace que les clés situées **entre ce nœud et son voisin** — soit environ **1/N des données**, pas la totalité.
- On utilise des **nœuds virtuels** (chaque machine physique occupe plusieurs positions sur l'anneau) pour lisser la répartition et éviter qu'un nœud hérite d'un arc trop grand.

Nuance importante (Kleppmann) : beaucoup de bases distribuées n'utilisent pas l'anneau « à la Dynamo » mais un **nombre fixe de partitions** (bien supérieur au nombre de nœuds), qu'on **redistribue** entre nœuds lors du redimensionnement — ce qui atteint le même but (déplacer peu de données) plus simplement. Retenez le **principe** : un bon schéma de partitionnement rend l'ajout/retrait de nœuds **incrémental**, jamais global.
---SECTION---
HEADING: Connection pooling : le goulot d'étranglement invisible
BODY:
Chaque connexion à une base a un **coût** : dans PostgreSQL, une connexion = un **processus** côté serveur, avec sa mémoire et son overhead d'ordonnancement. Ouvrir une connexion par requête est ruineux ; en ouvrir des milliers en parallèle **écroule** le serveur. La solution est un **pool de connexions** : un ensemble de connexions **réutilisées** entre les requêtes.

### Dimensionner le pool
Contre-intuitif mais capital : **plus de connexions ≠ plus de débit**. Au-delà d'un certain point, ajouter des connexions *dégrade* les performances (contention sur les verrous, les caches, le CPU). Une base empirique répandue pour le nombre de connexions actives :

```
connexions ≈ (nombre de cœurs × 2) + nombre de disques effectifs
```

Un serveur à 8 cœurs travaille souvent mieux avec ~20 connexions actives qu'avec 500. Les 500 requêtes concurrentes doivent **attendre dans le pool**, pas marteler la base.

### PgBouncer et les read replicas
- **PgBouncer** est un *pooler* externe léger pour PostgreSQL. En mode **transaction** (le plus courant), une connexion serveur n'est attribuée à un client que **le temps d'une transaction**, ce qui permet à des milliers de clients de partager quelques dizaines de connexions réelles. (Contrepartie : certaines fonctionnalités liées à la session, comme les *prepared statements* classiques, demandent de la prudence.)
- **Read replicas** : on route les lectures vers des répliques et on **réserve le leader aux écritures**. C'est le moyen de scaler les lectures — à condition d'accepter le *replication lag* (section réplication) et de renvoyer vers le leader les lectures qui exigent la dernière valeur.
---SECTION---
HEADING: Le problème N+1 : le tueur de performance applicatif
BODY:
Le **problème N+1** est sans doute la cause la plus fréquente de lenteur applicative, et il ne vient pas de la base mais de la **manière dont le code l'interroge** — typiquement via un ORM.

Le scénario : vous récupérez une liste de N éléments (1 requête), puis, pour chacun, vous accédez à une relation qui déclenche **une requête supplémentaire**. Total : **1 + N requêtes** là où **1 ou 2** auraient suffi.

```python
# 1 requête : charge 100 commandes
commandes = Commande.objects.all()
for c in commandes:
    # +1 requête PAR commande -> 100 requêtes de plus !
    print(c.client.nom)
# Total : 101 allers-retours réseau
```

Pourquoi c'est si coûteux : chaque requête paie un **aller-retour réseau** complet (latence). 100 requêtes de 1 ms, c'est 100 ms passés à attendre le réseau, indépendamment de la vitesse de la base elle-même.

La correction : **charger les données liées en une seule fois**, via une jointure ou un chargement anticipé (*eager loading* : `JOIN`, ou `IN (…)` groupé).

```python
# 1 seule requête avec jointure
commandes = Commande.objects.select_related('client').all()
```

Le diagnostic clé : si une page fait des **centaines de requêtes quasi identiques**, vous tenez un N+1. Activez le **log des requêtes** en développement — c'est le moyen le plus sûr de le repérer avant la production.
---SECTION---
HEADING: EXPLAIN : lire ce que la base fait vraiment
BODY:
Quand une requête est lente, **cessez de deviner** : demandez à la base son **plan d'exécution** avec `EXPLAIN`. C'est l'outil de diagnostic n°1, et Winand en fait le cœur de sa méthode.

`EXPLAIN` montre la stratégie choisie par le **planificateur** (*query planner*) ; `EXPLAIN ANALYZE` l'**exécute réellement** et donne les temps et le nombre de lignes *réels* — le plus utile.

Les nœuds à reconnaître en priorité :

- **Seq Scan** (*sequential scan*) : la base **lit toute la table** ligne par ligne. Acceptable sur une petite table ou quand la requête ramène la majorité des lignes ; **alarmant** sur une grosse table filtrée — signe qu'un **index manque** ou n'est pas utilisable.
- **Index Scan** : la base utilise un index pour aller droit aux lignes. Ce qu'on veut sur une requête sélective.
- **Index Only Scan** : réponse entièrement servie par l'index couvrant, **sans toucher la table** — l'optimum.
- **Bitmap Heap Scan** : compromis, quand l'index ramène beaucoup de lignes dispersées.

```sql
EXPLAIN ANALYZE
SELECT * FROM commandes WHERE client_id = 42;
-- Bon  : Index Scan using idx_client on commandes ...
-- Mauvais : Seq Scan on commandes ... (rows=2000000) filtre après lecture
```

Deux réflexes décisifs : (1) comparer les lignes **estimées** et **réelles** — un grand écart signale des **statistiques périmées** (lancez `ANALYZE`) et de mauvais choix de plan ; (2) un `Seq Scan` sur une requête censée être sélective doit vous faire chercher **pourquoi l'index n'est pas utilisé** (fonction appliquée à la colonne, type incompatible, sélectivité trop faible).
---SECTION---
HEADING: Normalisation vs dénormalisation
BODY:
La **normalisation** consiste à structurer les données pour que **chaque fait ne soit stocké qu'une seule fois** (une donnée, un seul endroit). On éclate en tables reliées par des clés, on évite la redondance.

- **Avantages** : pas d'incohérence possible (on met à jour un fait à un seul endroit), écritures compactes, intégrité forte.
- **Coût** : lire une vue complète exige des **jointures**, qui peuvent devenir coûteuses à grande échelle.

La **dénormalisation** fait l'inverse : elle **duplique** volontairement certaines données (ou pré-calcule des agrégats) pour **éviter les jointures** à la lecture.

- **Avantage** : lectures très rapides, idéales pour les charges à lecture dominante.
- **Coût** : **redondance** — la même information vit à plusieurs endroits, et c'est désormais à *vous* de la maintenir cohérente à chaque écriture. Un oubli = des données divergentes.

Le compromis (Kleppmann) est clair : **normaliser privilégie l'intégrité en écriture, dénormaliser privilégie la vitesse en lecture**. La règle de sagesse : **commencez normalisé**, mesurez, puis dénormalisez **chirurgicalement** les points chauds identifiés — jamais par anticipation. Une donnée dénormalisée est un cache : il faut une stratégie pour l'invalider et le régénérer.
---SECTION---
HEADING: CAP et PACELC : les compromis des systèmes distribués
BODY:
Dès qu'une base est **distribuée** (répliquée sur plusieurs nœuds), un théorème gouverne ses limites. Le **théorème CAP** énonce que, face à une **partition réseau** (P — des nœuds ne peuvent plus communiquer), un système doit choisir entre :

- **Cohérence** (C, au sens *linéarisabilité* : tout le monde voit la dernière valeur) : refuser de répondre plutôt que renvoyer une donnée périmée.
- **Disponibilité** (A) : répondre quand même, quitte à servir une donnée potentiellement périmée.

Autrement dit : **quand le réseau se coupe, choisissez cohérence OU disponibilité, pas les deux**. Kleppmann met en garde : CAP est souvent mal formulé (« choisir 2 sur 3 »). La partition n'est **pas un choix** — elle *arrive* ; le vrai choix est C vs A **pendant** la partition.

Le modèle **PACELC** complète et corrige CAP, et c'est le plus utile en pratique :

> **si Partition (P) → choisir Availability (A) ou Consistency (C) ; Else (E, fonctionnement normal) → choisir Latency (L) ou Consistency (C).**

L'apport décisif : **même sans panne**, il y a un compromis permanent entre **latence** et **cohérence**. Attendre la confirmation de plusieurs répliques (forte cohérence) coûte de la latence ; répondre depuis une réplique locale (faible latence) risque de servir des données périmées. Ainsi, un système comme Cassandra est *PA/EL* (disponibilité et faible latence), tandis qu'une base fortement cohérente est *PC/EC*. PACELC vous donne le bon cadre : le compromis cohérence/latence est **quotidien**, pas seulement en cas de panne.
---SECTION---
HEADING: CDC et pattern Outbox : propager les changements de façon fiable
BODY:
Problème récurrent des architectures modernes : une donnée écrite dans la base doit se **propager** ailleurs (cache, moteur de recherche, autre microservice, entrepôt). La tentation est d'écrire *dans la base* **et** de *publier un message* (Kafka…) depuis le code applicatif. C'est un piège : ces deux actions ne sont **pas atomiques**. Si la base valide mais que la publication échoue (ou l'inverse), vos systèmes **divergent** — c'est le problème de la **double écriture** (*dual write*).

### CDC (Change Data Capture)
Le **CDC** capture les changements **à la source de vérité** — le **journal de réplication** de la base (le WAL de PostgreSQL, le binlog de MySQL) — et les diffuse comme un flux d'événements (outils : Debezium). L'avantage décisif : on ne rejoue pas ce que l'application *croit* avoir fait, mais ce qui a été **réellement et durablement validé** dans la base. Le journal devient la **source unique de vérité** dont dérivent tous les systèmes en aval (idée centrale de la partie « flux de données » de DDIA).

### Le pattern Outbox
Complémentaire, il résout la double écriture au niveau applicatif. Au lieu de publier un message séparément, on **écrit l'événement dans une table `outbox`** de la **même base**, **dans la même transaction** que la modification métier :

```sql
BEGIN;
  UPDATE comptes SET solde = solde - 100 WHERE id = 1;
  INSERT INTO outbox (type, payload) VALUES ('debit', '{...}');
COMMIT;
```

L'atomicité de la transaction **garantit** que l'événement existe si et seulement si la modification a eu lieu. Un processus séparé (souvent alimenté par CDC sur la table `outbox`) lit ensuite ces événements et les publie vers le bus de messages, avec une sémantique **au-moins-une-fois**. On a ainsi transformé une double écriture fragile en une **écriture locale atomique** — c'est le patron de référence pour fiabiliser la propagation d'événements.
---SECTION---
HEADING: TOAST et bloat : la physique cachée de PostgreSQL
BODY:
Deux phénomènes très concrets qui expliquent des comportements déroutants en production PostgreSQL — et qui découlent directement du MVCC et du stockage en pages.

### TOAST
PostgreSQL stocke ses lignes dans des **pages de 8 Ko**, et une ligne ne peut pas franchir une page. Que se passe-t-il pour une grande valeur (long texte, gros JSON, bytea) ? Le mécanisme **TOAST** (*The Oversized-Attribute Storage Technique*) entre en jeu : la valeur volumineuse est **compressée** et, si nécessaire, **découpée en morceaux** stockés dans une **table TOAST** annexe, la ligne principale ne gardant qu'un pointeur.

Conséquence pratique : les grandes colonnes sont **déportées**. Tant que vous n'accédez pas à cette colonne, la lecture de la ligne reste rapide (elle n'a pas à charger le TOAST). Mais `SELECT *` sur des lignes avec de gros JSON paie systématiquement la reconstitution TOAST — une raison de plus de **ne sélectionner que les colonnes utiles**.

### Le bloat (ballonnement)
Rappel du MVCC : un `UPDATE` ou un `DELETE` ne supprime pas physiquement l'ancienne version, il la marque périmée (*dead tuple*). Ces tuples morts **occupent de l'espace** jusqu'à ce que **VACUUM** les recycle. Le **bloat** est l'accumulation de cet espace mort : une table peut occuper plusieurs fois la taille de ses données vivantes.

- **Symptômes** : la table et ses index **grossissent**, les scans ralentissent (plus de pages à lire pour la même donnée utile), le cache se remplit de vide.
- **Causes** : écritures très fréquentes (`UPDATE`/`DELETE` massifs), ou transactions **longues** qui empêchent VACUUM de nettoyer (une vieille transaction peut encore « avoir besoin » des anciennes versions).
- **Traitement** : l'**autovacuum** gère le cas normal ; `VACUUM` récupère l'espace pour réutilisation, `VACUUM FULL` (verrouillant) réécrit la table pour rendre l'espace au système. La prévention passe surtout par **éviter les transactions longues** et laisser l'autovacuum bien dimensionné faire son travail.

Comprendre TOAST et le bloat, c'est comprendre que sous le modèle logique se cache une **réalité physique** — pages, versions, compression — qui décide de vos performances réelles.
===END===
