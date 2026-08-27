# PostgreSQL, de l'intérieur

*Comprendre le moteur : MVCC, WAL, index, planificateur, VACUUM — et pourquoi tout cela vous concerne.*

Il y a une phrase qui circule chez les ingénieurs qui ont vu passer beaucoup de bases de données : *« PostgreSQL est la seule base que vous devriez connaître en profondeur avant d'aller chercher autre chose. »* Ce n'est pas du chauvinisme. C'est qu'à l'intérieur d'un seul binaire, Postgres réunit presque tout ce que les grands systèmes distribués ont inventé séparément : un **journal d'écriture** (comme GFS), un **contrôle de concurrence multiversion** (comme Spanner), des **B-Trees** (le socle de tous les moteurs de stockage), du partitionnement, de la réplication. C'est un moteur qui encaisse des téraoctets et des milliers de requêtes par seconde — à condition qu'on sache ce qu'il fait sous le capot.

Or c'est précisément là que la plupart des ingénieurs s'arrêtent. On apprend le SQL comme un langage de requête, une interface déclarative : on décrit *ce qu'on veut*, la base se débrouille. C'est vrai jusqu'au jour où une requête qui marchait devient lente sans raison apparente, où une table de 10 Go en occupe 30 sur le disque, où deux transactions se marchent dessus, ou où le serveur refuse subitement d'accepter la moindre écriture. À ce moment-là, l'abstraction fuit, et il faut savoir ce qu'il y a derrière.

Ce chapitre est cette descente sous le capot. On va suivre un fil : **comment Postgres range les données et gère la concurrence** (le cœur : MVCC, VACUUM, le journal WAL), puis **comment il retrouve les données vite** (les index, le planificateur, et l'art de lire un `EXPLAIN`), ensuite **comment il garantit la correction** face à des transactions concurrentes (les niveaux d'isolation), et enfin **ce qui vous mordra en production** (le pooling de connexions, la pagination, le *bloat*). Chaque mécanisme vient avec sa motivation, son intuition, son détail technique réel, et son coût. Parce qu'en ingénierie, il n'y a pas de magie — seulement des compromis qu'on a choisis en connaissance de cause, ou subis par ignorance.

---

## L'architecture, en une image

Avant de plonger, une carte du terrain. Postgres est un système **multi-processus**, pas multi-thread. Un processus parent, le **postmaster**, écoute les connexions. À chaque client qui se connecte, il *forke* un **backend** dédié : un processus Unix entier, rien que pour cette connexion, qui va parser, planifier et exécuter les requêtes. Retenez ce détail — il explique à lui seul pourquoi les connexions coûtent cher et pourquoi le pooling n'est pas optionnel.

```
CÔTÉ CLIENT                        SERVEUR POSTGRESQL

┌─────────────┐   libpq / TCP    ┌──────────────────────────────┐
│ Application │ ───────────────► │ Postmaster (processus parent)│
│ (Python/JS) │                  │  • écoute les connexions     │
└─────────────┘                  │  • fork() un backend / client│
                                 └───────────────┬──────────────┘
                                                 │ fork()
                                                 ▼
                                     ┌────────────────────────┐
                                     │  Backend (1 par client)│
                                     │  • parse le SQL        │
                                     │  • planifie            │
                                     │  • exécute             │
                                     └───────────┬────────────┘
                                                 │
                    ┌────────────────────────────┼───────────────────────┐
                    ▼                             ▼                        ▼
          ┌──────────────────┐          ┌────────────────┐    ┌────────────────────┐
          │  Shared Buffers  │          │  WAL Buffers   │    │ Processus de fond  │
          │  cache de pages  │          │  journal en    │    │  • autovacuum      │
          │  8 Ko / page     │          │  attente       │    │  • checkpointer    │
          └────────┬─────────┘          └───────┬────────┘    │  • bgwriter        │
                   │                            │             └────────────────────┘
                   ▼                            ▼
          ┌─────────────────────────────────────────────────┐
          │                    DISQUE                        │
          │  base/  → fichiers de tables et d'index          │
          │  pg_wal/ → segments de journal, 16 Mo chacun     │
          └─────────────────────────────────────────────────┘
```

Deux zones de mémoire partagée dominent le tableau : les **shared buffers** (le cache des pages de données, en RAM) et les **WAL buffers** (le journal en attente d'être écrit sur disque). Et trois processus de fond travaillent en permanence, invisibles : l'**autovacuum** qui nettoie, le **checkpointer** qui synchronise, le **bgwriter** qui écrit les pages sales. Tout ce chapitre consiste à comprendre le dialogue entre ces pièces.

---

## Le cœur : MVCC, ou comment lire sans jamais attendre

### Le problème : lecteurs contre écrivains

Imaginez la solution naïve à la concurrence : quand une transaction veut modifier une ligne, elle pose un verrou dessus ; quiconque veut la lire attend que le verrou tombe. Simple, correct — et catastrophique en pratique. Dès qu'une écriture longue touche une ligne populaire, toutes les lectures de cette ligne s'empilent derrière. Un rapport analytique qui balaie un million de lignes bloquerait toutes les écritures sur son passage. La base passerait son temps à attendre.

Postgres refuse ce marché. Son principe fondateur tient en une phrase : **les lecteurs ne bloquent jamais les écrivains, et les écrivains ne bloquent jamais les lecteurs.** Le mécanisme qui rend cela possible s'appelle **MVCC** — *Multi-Version Concurrency Control*, contrôle de concurrence multiversion. C'est le cœur battant de PostgreSQL, et l'idée est d'une élégance redoutable.

### L'intuition : ne jamais écraser, toujours versionner

L'analogie la plus juste est celle d'un **système de gestion de versions**, un Git pour vos lignes. Quand vous modifiez une ligne, Postgres n'écrase pas l'ancienne valeur. Il écrit une **nouvelle version** de la ligne, à côté, et laisse l'ancienne en place, marquée comme périmée. Chaque transaction, en démarrant, prend une **photo instantanée** (un *snapshot*) de la base : elle verra le monde tel qu'il était à cet instant, et cette photo ne changera pas sous ses pieds, même si d'autres transactions modifient les données pendant qu'elle travaille.

Les lectures ne bloquent rien parce qu'elles lisent une version qui, elle, ne bouge plus. Les écritures ne bloquent rien parce qu'elles créent une version neuve sans toucher à celle que les autres sont en train de lire. Personne n'attend.

### Le détail technique : xmin, xmax, et le test de visibilité

Comment Postgres sait-il quelle version chaque transaction a le droit de voir ? Par deux champs cachés, présents dans **chaque ligne** (chaque *tuple*, dans le vocabulaire du moteur) :

- **`xmin`** : l'identifiant de la transaction qui a **créé** cette version.
- **`xmax`** : l'identifiant de la transaction qui l'a **supprimée ou remplacée** (0 si la version est encore vivante).

Un troisième champ, **`ctid`**, donne l'emplacement physique du tuple : le numéro de page et l'offset dans la page. Suivons une ligne à la trace.

```sql
CREATE TABLE users (id INT, name TEXT, balance INT);
INSERT INTO users VALUES (1, 'Alice', 100);
```

Après l'`INSERT`, disons que la transaction courante portait l'identifiant 501. Voici ce qui existe physiquement sur la page :

```
xmin=501  xmax=0  ctid=(0,1)  │  id=1  name='Alice'  balance=100   ← version vivante
```

Maintenant, la transaction 502 modifie le solde :

```sql
UPDATE users SET balance = 90 WHERE id = 1;
```

Contre toute intuition, **l'ancienne version n'est pas effacée**. Elle est simplement estampillée « morte à partir de 502 », et une deuxième version apparaît :

```
xmin=501  xmax=502  ctid=(0,1)  │  balance=100   ← version MORTE (dead tuple)
xmin=502  xmax=0    ctid=(0,2)  │  balance=90    ← version COURANTE
```

Arrive une transaction 503 qui fait un `SELECT`. Pour chaque version rencontrée, elle applique un **test de visibilité** dont la logique, simplifiée, est : *« cette version a-t-elle été créée par une transaction déjà validée avant ma photo, et pas encore supprimée à ce moment-là ? »*

- Version `xmin=501, xmax=502` : créée par 501 (avant moi, ✓), mais supprimée par 502 (avant moi aussi, ✗). **Invisible** — c'est bien l'ancienne valeur, je ne dois pas la voir.
- Version `xmin=502, xmax=0` : créée par 502 (avant moi, ✓), jamais supprimée (✓). **Visible** — c'est la bonne.

La transaction 503 lit donc `balance=90`, et ce, sans avoir posé le moindre verrou.

### Le snapshot en action

Le vrai pouvoir du mécanisme se voit quand deux sessions se croisent. Session A ouvre une transaction et lit un solde de 100. Pendant qu'elle réfléchit, session B modifie ce solde à 50 et **valide**. Que voit A si elle relit ?

```sql
-- Session A
BEGIN;
SELECT balance FROM users WHERE id = 1;  -- 100

-- Session B, en parallèle
BEGIN;
UPDATE users SET balance = 50 WHERE id = 1;
COMMIT;                                   -- validé ! nouvelle version xmin=101

-- Session A, de retour
SELECT balance FROM users WHERE id = 1;   -- 100, et non 50 !
COMMIT;
```

A voit toujours 100. Sa photo a été prise quand les transactions allaient jusqu'à, disons, l'identifiant 100 ; la nouvelle version porte `xmin=101`, qui n'existait pas encore sur sa photo. A l'ignore donc et lit l'ancienne version — celle que MVCC a eu la sagesse de conserver. C'est exactement ce que garantit le niveau d'isolation **Repeatable Read** de PostgreSQL, sur lequel nous reviendrons : une transaction voit un instantané figé du passé, cohérent du début à la fin.

### Le coût : les tuples morts

Toute cette élégance a un prix, et il faut le nommer clairement. **Chaque `UPDATE` et chaque `DELETE` laisse derrière lui un tuple mort.** Postgres ne peut pas récupérer la place immédiatement : d'anciennes transactions ont peut-être encore besoin de ces versions pour leur propre photo. Les cadavres s'accumulent donc.

Sur une table très sollicitée, après un million de modifications, vous pouvez vous retrouver avec un million de lignes vivantes *et* un million de lignes mortes — deux fois la place sur disque. Pire : un balayage de table (*seq scan*) doit **traverser les tuples morts aussi**, ne serait-ce que pour constater qu'ils sont invisibles. Plus de cadavres, plus de pages à lire, requêtes plus lentes. Ce phénomène porte un nom qui reviendra souvent : le **bloat** (le gonflement). Quelqu'un doit passer ramasser les morts. Ce quelqu'un, c'est VACUUM.

---

## VACUUM : le ramasseur, et le danger silencieux du wraparound

### Ce que fait VACUUM

**VACUUM** parcourt les tables et récupère l'espace occupé par les tuples morts qu'aucune transaction ne peut plus voir. Trois précisions importantes sur son comportement.

D'abord, un `VACUUM` ordinaire **ne rend pas la place au système d'exploitation**. Il marque les emplacements des tuples morts comme *réutilisables* à l'intérieur du fichier de la table, pour les prochains `INSERT`. Le fichier ne rétrécit pas ; il cesse simplement de grossir. C'est un choix délibéré : rendre l'espace impliquerait de réorganiser physiquement le fichier et de poser un verrou lourd.

Ensuite, VACUUM entretient deux structures cruciales pour la performance : la **visibility map** (qui marque les pages entièrement visibles par tout le monde, condition sine qua non des *index-only scans* qu'on verra plus loin) et les **statistiques** du planificateur, via `pg_statistic`.

Enfin, il existe plusieurs variantes qu'il faut savoir distinguer :

```sql
VACUUM users;         -- nettoie, sans verrou bloquant, ne rend pas la place à l'OS
VACUUM FULL users;    -- réécrit toute la table, rend la place, mais VERROU EXCLUSIF total
ANALYZE users;        -- met à jour les seules statistiques du planificateur
VACUUM ANALYZE users; -- les deux à la fois
```

Le `VACUUM FULL` est la seule manière de vraiment récupérer l'espace disque, mais il **verrouille la table entière** pendant qu'il la réécrit : personne ne lit ni n'écrit tant qu'il tourne. En production, sur une grosse table, c'est une opération à planifier, jamais à lancer à l'aveugle en pleine journée.

### L'autovacuum, et pourquoi on le règle par table

Vous ne lancez presque jamais VACUUM à la main. Un processus de fond, l'**autovacuum**, s'en charge automatiquement. Par défaut, il se déclenche sur une table quand le nombre de tuples morts dépasse **20 %** des lignes vivantes. Ce seuil est raisonnable pour une table calme, mais désastreux pour une table brûlante : 20 % d'une table de 50 millions de lignes, c'est 10 millions de cadavres tolérés avant le moindre nettoyage.

D'où un réflexe de production : baisser le seuil sur les tables les plus actives.

```sql
ALTER TABLE hot_table SET (
    autovacuum_vacuum_scale_factor = 0.01,  -- déclenche à 1 % de morts, pas 20 %
    autovacuum_vacuum_cost_delay = 2        -- moins de bridage, nettoie plus vite
);
```

Et un réflexe de surveillance : garder un œil sur le ratio de tuples morts.

```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup, 0) * 100, 2) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;
```

### Le danger silencieux : le transaction ID wraparound

Voici le mécanisme que peu de gens connaissent et qui a mis à genoux des entreprises entières — parce qu'il reste invisible jusqu'à ce qu'il soit trop tard.

Les identifiants de transaction (`xid`) de PostgreSQL sont codés sur **32 bits**. Soit environ 4 milliards de valeurs, qui forment un anneau : après la dernière, on repart à zéro. Le test de visibilité de MVCC repose sur la comparaison « telle transaction est-elle antérieure à telle autre ? ». Mais sur un anneau, « antérieur » n'a plus de sens absolu : au bout de ~2 milliards de transactions, une transaction très ancienne finirait par apparaître *dans le futur* d'une transaction récente. Le test de visibilité s'inverserait, et des lignes valides disparaîtraient d'un coup. C'est le **transaction ID wraparound**, et sa conséquence est une perte de données silencieuse.

La parade s'appelle le **freezing** (le gel). Passé un certain âge, une ligne est marquée comme « gelée » : le moteur la considère alors comme *plus vieille que toute transaction imaginable*, définitivement visible, et l'exclut du raisonnement circulaire. Un point de vocabulaire, souvent mal expliqué : dans les versions modernes de PostgreSQL (depuis la 9.4), le gel **ne réécrit plus physiquement** le `xmin` à une valeur spéciale ; il **positionne un bit d'indicateur (« frozen hint bit ») dans l'en-tête du tuple**. Le résultat logique est le même — la ligne est considérée comme infiniment ancienne — mais l'implémentation évite de récrire les données.

C'est l'autovacuum qui effectue ce gel, en plus de son ménage ordinaire. Autrement dit : **si votre autovacuum ne suit pas la cadence, vous ne courez pas seulement au bloat, vous courez au wraparound.** Quand l'âge devient critique, PostgreSQL refuse toute nouvelle écriture pour se protéger — la base passe en lecture seule jusqu'à ce qu'un VACUUM d'urgence rattrape le retard. La surveillance tient en une requête, à brancher sur une alerte :

```sql
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY age(datfrozenxid) DESC;
-- Alerter si l'âge dépasse ~1,5 milliard. Le plafond dur est à ~2 milliards.
```

---

## WAL : la durabilité sans payer le prix du disque à chaque écriture

### Le dilemme de la durabilité

Une transaction validée doit **survivre à un crash**. C'est le « D » d'ACID, la durabilité. La façon évidente de l'assurer serait d'écrire chaque modification directement sur le disque, à sa place définitive, avant de confirmer au client. Mais les données d'une table sont éparpillées un peu partout dans le fichier ; les écrire à leur place, c'est provoquer une nuée de petites écritures **aléatoires**, l'opération la plus lente qu'un disque connaisse. Confirmer chaque transaction à ce rythme condamnerait le débit.

### L'intuition : d'abord le journal, la place définitive plus tard

La solution est le **WAL** — *Write-Ahead Log*, journal d'écriture anticipée. Le principe : avant de toucher quoi que ce soit à sa place définitive, on écrit **ce qu'on s'apprête à faire** dans un journal séquentiel. Ce journal, lui, ne fait que grossir par la fin — des écritures **séquentielles**, l'opération la plus rapide d'un disque.

L'analogie du comptable est parfaite. Un comptable ne va pas réécrire ses grands livres à chaque opération. Il tient un **journal chronologique** : « le 3, reçu 100 € de X ; le 3, payé 40 € à Y ». Le journal est la vérité. Si le bureau brûle, il suffit de rejouer le journal pour reconstruire les grands livres. Postgres fait exactement cela : le WAL est la source de vérité durable ; les fichiers de tables ne sont qu'un *cache* de l'état, qu'on peut toujours reconstruire.

### Le déroulé d'une écriture

Voici, pas à pas, ce qui se passe quand vous modifiez une ligne :

```
1. Modifier la page en RAM, dans les shared buffers, et la marquer « sale ».
   (Rien n'a encore touché le disque de données.)

2. Écrire l'enregistrement WAL décrivant le changement dans les WAL buffers :
   { lsn, type: HEAP_UPDATE, page, ancien_tuple, nouveau_tuple, xid }
   Le LSN (Log Sequence Number) est l'adresse de cet enregistrement dans le journal.

3. Au COMMIT : forcer l'écriture du WAL sur disque (fsync).
   ← C'est ici, et seulement ici, qu'on paie le disque. 1 à 10 ms.
   Le COMMIT ne renvoie « ok » au client qu'APRÈS ce fsync réussi.

4. La page sale reste en RAM. Elle sera écrite à sa place définitive
   plus tard, tranquillement, par le bgwriter ou au prochain checkpoint.
   C'est sûr : même si le crash survient avant, le WAL sur disque suffit à rejouer.
```

L'astuce tient tout entière dans l'étape 4. On a transformé une nuée d'écritures aléatoires (les pages de données) en **une seule écriture séquentielle** (le WAL) sur le chemin critique du commit. Les vraies pages rejoignent le disque plus tard, groupées, hors du chemin critique.

### Le compromis : le fsync, et comment l'assouplir

Le `fsync` de l'étape 3 est le goulot. Il coûte de 1 à 10 ms, ce qui plafonne un serveur prudent autour de **1 000 transactions/seconde** si chacune attend son propre fsync. Deux leviers permettent d'aller bien au-delà.

Le premier est le **group commit** : Postgres regroupe les commits de plusieurs transactions concurrentes dans un **seul** fsync. Plus il y a de charge, plus le regroupement est efficace — un cas rare où la contention aide.

Le second est plus radical et se paie en garantie : `synchronous_commit = off`. Le COMMIT renvoie « ok » *avant* que le WAL soit sur disque. Le débit grimpe à des dizaines, voire des centaines de milliers de transactions/seconde. Le risque : lors d'un crash, vous perdez les toutes dernières transactions confirmées (typiquement moins de 200 ms de commits). C'est **inacceptable pour un paiement, parfaitement acceptable pour un flux d'événements analytiques.** Le choix vous appartient, table par table, transaction par transaction — mais il doit être conscient.

### Checkpoints et réplication

Le WAL grossit sans fin ; il faut bien le tronquer un jour. C'est le rôle du **checkpoint** : périodiquement, le checkpointer garantit que toutes les pages sales antérieures à un certain point sont bien sur le disque de données. Une fois ce point acquis, le WAL antérieur devient inutile pour la reprise (on n'aura jamais à rejouer plus loin que le dernier checkpoint) et peut être recyclé.

Le réglage clé est un compromis entre pics d'I/O et durée de reprise. Des checkpoints rares laissent le WAL grossir et rallongent le temps de reprise après crash ; des checkpoints fréquents lissent la reprise mais multiplient les écritures.

```ini
max_wal_size = 4GB                    # taille de WAL tolérée avant checkpoint forcé
checkpoint_completion_target = 0.9    # étaler l'I/O du checkpoint sur 90 % de l'intervalle
synchronous_commit = on               # défaut sûr
```

Le `checkpoint_completion_target = 0.9` mérite un mot : sans lui, un checkpoint déverse toutes ses pages sales d'un coup, provoquant un pic d'I/O qui fige la base. La valeur 0.9 demande d'étaler ces écritures sur 90 % du temps disponible avant le prochain checkpoint — un flux régulier plutôt qu'un raz-de-marée.

Bonus inattendu : puisque le WAL décrit *tout* ce qui change, il suffit de l'expédier à un second serveur pour que celui-ci reconstruise une copie exacte en rejouant les enregistrements. C'est le fondement de la **réplication** de PostgreSQL. Le décalage (*lag*) reste généralement sous les 100 ms au sein d'un même centre de données.

```sql
SELECT pg_current_wal_lsn();                         -- position actuelle dans le WAL
SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS lag_bytes
FROM pg_stat_replication;                            -- retard de réplication, en octets
```

---

## Le buffer cache : la RAM comme scène de travail

Un détail traverse tout ce qui précède : Postgres ne travaille jamais directement sur le disque. Toutes les pages, de tables comme d'index, transitent par les **shared buffers**, un grand cache en mémoire partagée, découpé en pages de **8 Ko**. Une lecture cherche d'abord sa page dans ce cache (un *hit*) ; si elle n'y est pas, elle la charge depuis le disque (un *read*, bien plus lent). Une écriture modifie la page en RAM et la marque « sale » ; le WAL assure sa durabilité, et la page ne rejoint le disque que plus tard.

Le ratio *hits / reads* est l'un des indicateurs de santé les plus parlants d'une base : une base bien dimensionnée sert l'écrasante majorité de ses lectures depuis la RAM. Quand vous verrez, dans un `EXPLAIN (ANALYZE, BUFFERS)`, la ligne `shared read` grimper au-dessus de `shared hit`, ce sera le signe d'un cache trop petit ou froid. Le réglage principal, `shared_buffers`, tourne classiquement autour de **25 % de la RAM** de la machine.

---

## Les index : quatre familles, quatre géométries

Sans index, retrouver une ligne, c'est parcourir toute la table. Un index est une structure annexe qui répond à la question « où sont les lignes qui valent *x* ? » sans tout lire. Mais un index n'est pas gratuit : il occupe de la place, et il faut le **maintenir à chaque écriture**. Chaque `INSERT`, `UPDATE`, `DELETE` doit mettre à jour tous les index concernés. Un index inutile ne fait donc pas que gaspiller de l'espace : il **ralentit toutes vos écritures pour rien.** La bonne question n'est jamais « faut-il indexer ? » mais « quelle forme d'index pour quelle forme de requête ? ».

### B-Tree : l'arbre équilibré et trié, votre défaut à 95 %

Le **B-Tree** est un arbre équilibré dont les feuilles contiennent les valeurs **triées**. C'est cette organisation triée qui le rend si polyvalent : il excelle sur l'égalité (`=`), mais aussi sur les intervalles (`<`, `>`, `BETWEEN`), les préfixes (`LIKE 'abc%'`) et les tris (`ORDER BY`), puisque les valeurs voisines dans l'arbre le sont aussi dans la requête.

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);  -- l'ordre est mémorisé
```

**L'ordre des colonnes d'un index composite est décisif.** Un index sur `(user_id, created_at)` se lit comme un annuaire trié d'abord par `user_id`, puis par `created_at` à `user_id` égal. On peut donc s'en servir dès qu'on connaît le préfixe le plus à gauche :

```sql
-- L'index (user_id, created_at) sert ces requêtes :
SELECT * FROM orders WHERE user_id = 1;                          -- ✓ préfixe gauche
SELECT * FROM orders WHERE user_id = 1 AND created_at > '2024';  -- ✓ les deux colonnes
SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at;      -- ✓ tri déjà fait

-- Mais PAS celle-ci :
SELECT * FROM orders WHERE created_at > '2024';                  -- ✗ pas de préfixe user_id
```

Chercher par `created_at` seul dans cet index revient à chercher un nom dans un annuaire trié par ville : la colonne existe, mais pas dans l'ordre qui permettrait de sauter directement au bon endroit. Il faudrait un index dédié.

Trois raffinements du B-Tree valent d'être connus, car ils résolvent des problèmes très concrets.

**L'index couvrant (*covering index*)** vise le graal : ne jamais toucher la table. Normalement, l'index donne l'emplacement de la ligne, puis Postgres va lire la ligne dans le *heap* (le fichier de la table) pour récupérer les colonnes demandées. Mais si l'index contient déjà **toutes** les colonnes dont la requête a besoin, l'aller-retour vers le heap devient inutile : c'est un **index-only scan**, la lecture la plus rapide possible. La clause `INCLUDE` ajoute des colonnes « passagères » aux feuilles de l'index sans les faire entrer dans la clé de tri.

```sql
CREATE INDEX idx_orders_covering ON orders(user_id, created_at)
    INCLUDE (total, status);

SELECT user_id, created_at, total, status FROM orders WHERE user_id = 1;
-- → index-only scan : la table n'est jamais lue.
```

(Petite subtilité liée à MVCC : l'index-only scan n'est vraiment « only » que si la *visibility map* confirme que les pages concernées sont visibles par tous — sinon Postgres doit tout de même vérifier la visibilité dans le heap. Encore une raison de laisser VACUUM travailler.)

**L'index partiel** n'indexe qu'un sous-ensemble de lignes, celles qui satisfont une condition. Si vous ne cherchez jamais que parmi les utilisateurs actifs, pourquoi indexer les autres ?

```sql
CREATE INDEX idx_active_users ON users(email) WHERE active = TRUE;
-- Beaucoup plus petit, donc plus rapide, pour : WHERE active = TRUE AND email = 'x'.
```

**L'index d'expression** indexe une valeur *calculée*. C'est la parade à un piège classique : appliquer une fonction à une colonne indexée **désactive l'index**, car l'index connaît `email`, pas `lower(email)`.

```sql
CREATE INDEX idx_users_lower_email ON users(lower(email));
-- Rend possible : WHERE lower(email) = 'alice@example.com'.
```

### GIN : l'index inversé pour ce qui contient plusieurs valeurs

Le B-Tree indexe *une* valeur par ligne. Mais que faire quand une colonne en contient plusieurs — un tableau, un document JSON, un texte plein de mots ? C'est le terrain du **GIN** (*Generalized Inverted Index*, index inversé généralisé). Le principe est celui de l'**index d'un livre** : au lieu de pointer « ligne → valeurs », il pointe « valeur → lignes ». Pour chaque mot, chaque clé, chaque élément, GIN maintient la liste des lignes qui le contiennent.

C'est l'outil de la **recherche plein texte** :

```sql
ALTER TABLE articles ADD COLUMN fts_vector tsvector;
UPDATE articles SET fts_vector = to_tsvector('english', title || ' ' || body);
CREATE INDEX idx_articles_fts ON articles USING GIN(fts_vector);

SELECT title FROM articles
WHERE fts_vector @@ to_tsquery('english', 'postgresql & performance');
```

Et l'outil du **JSONB** et des **tableaux**, avec les opérateurs de contenance (`@>`), de présence de clé (`?`), etc. :

```sql
CREATE INDEX idx_events_data ON events USING GIN(data);

SELECT * FROM events WHERE data @> '{"type": "click"}';  -- « contient »
SELECT * FROM events WHERE data ? 'user_id';             -- « possède la clé »

CREATE INDEX idx_tags ON tags USING GIN(tags);
SELECT * FROM tags WHERE tags @> ARRAY['postgres', 'performance'];
```

Le compromis : GIN est plus lent à construire et à maintenir en écriture qu'un B-Tree — logique, une seule ligne peut toucher des dizaines d'entrées de l'index inversé. On l'accepte volontiers pour la puissance de recherche qu'il ouvre.

### BRIN : l'index minuscule pour les données naturellement ordonnées

Voici un index à la philosophie inverse de tous les autres. Un B-Tree stocke une entrée **par ligne** ; un **BRIN** (*Block Range Index*) ne stocke que le **min et le max par plage de blocs**. Au lieu de « la valeur *x* est à la ligne *n* », il dit « les blocs 100 à 128 contiennent des dates entre le 3 et le 4 janvier ». Une requête sur le 3 janvier peut alors **ignorer d'emblée** tous les blocs dont l'intervalle ne recouvre pas cette date.

```sql
CREATE INDEX idx_events_ts ON events USING BRIN(created_at);
-- Environ 100 fois plus petit qu'un B-Tree.
```

Le résultat est un index dérisoirement petit — souvent cent fois moins qu'un B-Tree. Mais il n'a de sens qu'à **une condition stricte** : la table doit être **physiquement ordonnée** selon la colonne. C'est le cas parfait des tables *append-only* horodatées — logs, données de capteurs, journaux d'audit, séries temporelles — où les lignes arrivent dans l'ordre du temps et ne bougent plus. Sur une colonne à distribution aléatoire, les intervalles min/max de chaque bloc se recouvrent tous, et BRIN ne peut rien éliminer : il devient inutile.

### Hash : l'égalité pure, rarement le bon choix

L'**index Hash** ne sait faire qu'une chose : l'égalité (`=`), en temps constant théorique. Pas d'intervalle, pas de tri. On pourrait croire qu'il est plus compact que le B-Tree puisqu'il fait moins — **c'est faux, et c'est une erreur répandue.** Sur disque, un index Hash est généralement **égal ou plus gros** qu'un B-Tree équivalent. Et comme le B-Tree gère déjà l'égalité très efficacement tout en offrant les intervalles et le tri par-dessus, le Hash n'apporte, dans la quasi-totalité des cas, aucun avantage décisif.

```sql
CREATE INDEX idx_sessions_token ON sessions USING HASH(token);
-- Marginalement plus rapide sur l'égalité pure, mais presque jamais nécessaire.
```

Retenez-le comme une curiosité utile à connaître pour ne pas s'y tromper, pas comme un outil du quotidien. En cas de doute, c'est B-Tree.

---

## Le planificateur : lire dans les pensées du moteur

### Pourquoi il existe

Le SQL est **déclaratif** : vous dites *quoi*, pas *comment*. Entre votre requête et son résultat, un composant décide *comment* l'exécuter — faut-il balayer la table ou passer par l'index ? Dans quel ordre joindre trois tables ? Trier en mémoire ou déborder sur disque ? Ce composant est le **query planner**, le planificateur, et il fonde ses décisions sur des **estimations de coût** calculées à partir des **statistiques** de vos données.

D'où une vérité qui explique la moitié des mystères de performance : **le planificateur n'est bon que si ses statistiques sont justes.** S'il croit qu'une table a 100 lignes alors qu'elle en a 10 millions, il choisira un plan catastrophique — non par bêtise, mais parce qu'on lui a menti sur le terrain.

### EXPLAIN ANALYZE : votre instrument le plus important

Face à une requête lente, on ne devine pas, on mesure. L'outil est `EXPLAIN (ANALYZE, BUFFERS)`. `EXPLAIN` seul montre le plan *estimé* ; ajouter `ANALYZE` **exécute réellement** la requête et affiche les temps et volumes *réels* ; `BUFFERS` révèle les accès au cache et au disque. Comparer l'estimé au réel, c'est prendre le planificateur en flagrant délit de mauvaise estimation.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.name, COUNT(o.id) AS order_count, SUM(o.total) AS revenue
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
ORDER BY revenue DESC
LIMIT 10;
```

Un plan se lit **de l'intérieur vers l'extérieur** et **de bas en haut** : les nœuds les plus indentés s'exécutent d'abord, et leurs résultats remontent vers les nœuds parents. Voici un extrait annoté :

```
Sort  (cost=1234.56..1234.57 rows=10) (actual time=45.3..45.4 rows=10 loops=1)
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=1200 read=300          ← 300 pages lues sur DISQUE (cache miss)
  ->  HashAggregate  (cost=1220..1225 rows=1000) (actual time=44.1..44.8)
        ->  Hash Left Join  (actual time=12.3..38.2)
              Hash Cond: (o.user_id = u.id)
              ->  Seq Scan on orders o        ← LE PROBLÈME
                    Rows Removed by Filter: 50000
              ->  Hash
                    ->  Index Scan on users u (using idx_users_created_at)
```

Quelques signaux à reconnaître d'un coup d'œil, et leur diagnostic :

- **`Seq Scan` sur une grosse table** : souvent un index manquant, ou un index que la requête empêche d'utiliser.
- **`Rows Removed by Filter` très supérieur aux lignes gardées** : le moteur lit beaucoup pour ne retenir presque rien — mauvaise sélectivité, souvent un index qui aiderait.
- **`loops` > 1 avec un `Seq Scan` à l'intérieur d'une jointure** : la signature du **problème N+1**, on rebalaie une table pour chaque ligne de l'autre.
- **`shared read` ≫ `shared hit`** : le cache ne sert pas la requête — trop petit, ou froid.
- **`actual time` très éloigné de `cost`** : les statistiques sont périmées, le planificateur se trompe de modèle. Réflexe : `ANALYZE`.

### Nourrir le planificateur : les statistiques

Puisque tout dépend des statistiques, sachez les inspecter et les affiner. Elles vivent dans `pg_stats` :

```sql
SELECT attname, n_distinct, correlation
FROM pg_stats WHERE tablename = 'orders';
```

Deux colonnes parlent beaucoup. **`n_distinct`** estime la cardinalité : positif, c'est un nombre de valeurs distinctes ; négatif, c'est une *fraction* des lignes (`-0.5` signifie « la moitié des valeurs sont uniques »). **`correlation`** mesure à quel point l'ordre physique des lignes suit l'ordre de la colonne : proche de 1, la table est quasi triée selon cette colonne (un *index scan* y est très efficace, et c'est là que BRIN brille) ; proche de 0, l'ordre est aléatoire.

Quand une colonne a une distribution compliquée, on augmente la finesse de son histogramme :

```sql
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 500;  -- défaut : 100
ANALYZE orders;
```

Et quand deux colonnes sont **corrélées**, le planificateur, qui les suppose indépendantes par défaut, se trompe lourdement. S'il sait que `status = 'pending'` concerne 30 % des lignes et que `user_id = 1` en concerne 1 %, il multipliera naïvement pour estimer la combinaison — alors qu'en réalité les commandes de cet utilisateur sont peut-être toutes en attente. Les **statistiques étendues** lui apprennent la corrélation :

```sql
CREATE STATISTICS stat_orders_user_status ON user_id, status FROM orders;
ANALYZE orders;
```

Enfin, un levier ponctuel : `work_mem` fixe la mémoire allouée à chaque tri ou table de hachage. Trop bas, l'opération **déborde sur disque** (visible dans le plan quand une jointure affiche plusieurs *batches*). L'augmenter localement peut transformer une requête. Mais attention au piège multiplicatif : ce réglage est **par opération et par connexion**. `work_mem = 256MB` avec 200 connexions faisant chacune deux tris, c'est potentiellement 100 Go réclamés. On l'ajuste finement, souvent au niveau d'une session ou d'une requête, pas globalement à la légère.

### Les anti-patterns qui reviennent toujours

Certaines erreurs sont si fréquentes qu'il faut les reconnaître par réflexe.

**Une fonction sur la colonne indexée.** On l'a vu pour `lower()`, c'est vrai de toute fonction : elle masque l'index.

```sql
-- Mauvais : DATE() enveloppe la colonne, l'index sur created_at est inutile.
SELECT * FROM orders WHERE DATE(created_at) = '2024-01-15';

-- Bon : un intervalle laisse l'index travailler.
SELECT * FROM orders
WHERE created_at >= '2024-01-15' AND created_at < '2024-01-16';
```

**Le `LIKE '%mot%'` avec joker en tête.** Un B-Tree sait chercher un préfixe, pas une sous-chaîne : commencer par `%` interdit tout saut dans l'arbre, donc balayage complet. La bonne réponse est la recherche plein texte sur index GIN.

```sql
-- Mauvais : joker initial → seq scan.
SELECT * FROM products WHERE name LIKE '%phone%';

-- Bon : GIN + tsvector.
SELECT * FROM products
WHERE to_tsvector('english', name) @@ to_tsquery('phone');
```

**Le `SELECT *` dans une sous-requête ou un CTE**, qui traîne toutes les colonnes alors qu'on n'en veut qu'une ou deux — du travail et de la mémoire gaspillés à chaque étage.

**Et le tueur numéro un en production, le N+1.** Une requête pour récupérer une liste, puis une requête par élément de la liste. Cent commandes deviennent cent-une requêtes, chacune avec son aller-retour réseau.

```python
# Mauvais : 1 + 100 requêtes.
orders = db.query("SELECT * FROM orders LIMIT 100")
for order in orders:
    user = db.query(f"SELECT * FROM users WHERE id = {order.user_id}")
```
```sql
-- Bon : une seule requête, une jointure.
SELECT o.*, u.name FROM orders o
JOIN users u ON o.user_id = u.id
LIMIT 100;
```

Le N+1 se cache souvent derrière un ORM qui charge les relations paresseusement. Le `EXPLAIN` ne le montre pas toujours — il faut compter les requêtes côté application, ou le débusquer dans `pg_stat_statements`.

---

## Isolation : jusqu'où deux transactions peuvent-elles s'ignorer ?

MVCC donne à chaque transaction sa photo du monde. Reste à définir **à quel instant** cette photo est prise et **combien de temps** elle reste figée. C'est le rôle des **niveaux d'isolation**, qui arbitrent entre correction et concurrence. PostgreSQL en propose trois utiles.

En **Read Committed** — le niveau **par défaut** — la photo est reprise **à chaque instruction**. Une transaction voit toujours les données validées les plus récentes au moment où elle lance chaque requête. Conséquence : deux `SELECT` successifs dans la même transaction peuvent renvoyer des valeurs différentes si quelqu'un a validé entre les deux (une *lecture non répétable*). C'est le bon défaut pour l'écrasante majorité des applications web.

En **Repeatable Read**, la photo est prise **une fois**, au début de la transaction, et ne bouge plus jusqu'au `COMMIT`. C'est exactement le comportement de la session A vue plus haut : elle lisait 100 obstinément, malgré la validation concurrente. Ce niveau élimine les lectures non répétables — et, point souvent mal compris, il **élimine aussi complètement les lectures fantômes**. Un *phantom* survient quand une nouvelle ligne satisfaisant votre condition apparaît entre deux lectures ; sous la *snapshot isolation* de PostgreSQL, votre photo figée ignore par construction toute ligne créée après elle. Là où le standard SQL autorise encore les fantômes en Repeatable Read, l'implémentation de Postgres, plus forte que la lettre du standard, les interdit. En contrepartie, si votre transaction tente d'écrire sur une donnée qu'une autre a modifiée entre-temps, elle échoue avec une erreur de sérialisation : à l'application de réessayer.

En **Serializable**, enfin, Postgres garantit que le résultat concurrent est **équivalent à une exécution séquentielle** des transactions, l'une après l'autre. C'est la sécurité maximale, obtenue au prix d'un suivi supplémentaire des dépendances et d'un taux plus élevé d'échecs de sérialisation à gérer côté application. On le réserve aux invariants critiques que rien d'autre ne protège.

Le compromis se lit d'un trait : **plus l'isolation monte, plus la correction est forte, mais plus la concurrence se paie** — en photos figées plus longtemps et en transactions à rejouer. Le bon réflexe n'est pas de tout monter en Serializable « pour être tranquille », mais de rester en Read Committed par défaut et de n'élever le niveau que là où la logique métier l'exige vraiment.

---

## En production : trois combats que vous mènerez

### Le pooling de connexions : dompter le coût du fork

Souvenez-vous du tout début : chaque connexion est un **processus** entier, avec ses 5 à 10 Mo de RAM et son coût de création. Une application web qui ouvre une connexion par requête HTTP en crée et détruit des milliers par seconde — un gâchis pur, et un chemin rapide vers l'épuisement de `max_connections`, au-delà duquel Postgres refuse toute nouvelle connexion.

La réponse est un **pool de connexions** : un jeu de connexions ouvertes une fois, gardées vivantes, et **prêtées** aux requêtes qui en ont besoin. En pratique, on place un **PgBouncer** devant PostgreSQL ; les applications parlent à PgBouncer, qui multiplexe leurs demandes sur un petit nombre de connexions réelles. On garde ainsi `max_connections` bas (quelques centaines) tout en servant des milliers de clients. Le compromis à connaître : en mode *transaction pooling*, une connexion physique change de locataire à chaque transaction, ce qui interdit les états attachés à la session (certaines requêtes préparées, variables de session) — une contrainte à intégrer, pas un obstacle.

### La pagination : pourquoi OFFSET vous trahit

La pagination naïve utilise `LIMIT ... OFFSET`. Le piège est que **OFFSET n'évite pas le travail, il le jette.** Pour afficher la page 500, `OFFSET 10000` force Postgres à lire les 10 020 premières lignes triées puis à **en jeter 10 000**. Le coût croît linéairement avec le numéro de page : la page 1 est instantanée, la page 5 000 rampe.

```sql
-- Mauvais : coûte de plus en plus cher à mesure qu'on avance.
SELECT * FROM events ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
```

La bonne technique est la **pagination par clé** (*keyset pagination*, ou pagination par curseur). Plutôt que « saute les 10 000 premières », on dit « donne-moi les 20 suivant la dernière ligne que j'ai vue ». On mémorise la clé de la dernière ligne de la page courante, et on la réutilise comme point de départ. L'index fait le reste : Postgres saute directement au bon endroit de l'arbre.

```sql
-- Première page :
SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT 20;
-- Dernière ligne renvoyée : created_at = '2024-01-15 10:30:00', id = 9876.

-- Page suivante : on repart de cette clé.
SELECT * FROM events
WHERE (created_at, id) < ('2024-01-15 10:30:00', 9876)
ORDER BY created_at DESC, id DESC
LIMIT 20;
-- Coût O(log N), quel que soit le numéro de page.
```

Le `id` en second critère n'est pas décoratif : il départage les lignes de même `created_at`, garantissant un ordre total et donc une pagination sans trou ni doublon. Le seul renoncement est l'accès direct à « la page 500 » — mais un flux infini, celui dont vos utilisateurs ont réellement besoin, n'en a pas l'usage.

### Le bloat : surveiller, et couper à la racine

On a vu naître le *bloat* avec MVCC et le combattre avec VACUUM. En production, il faut le **surveiller activement** et débusquer aussi ce qui l'entoure : les tables gonflées de tuples morts, et les **index inutiles** qui alourdissent chaque écriture sans jamais servir une lecture.

```sql
-- Index jamais utilisés : à supprimer, ils ne coûtent que des écritures.
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE 'pg_%';

-- Tables gonflées : plus de 10 % de tuples morts.
SELECT relname, n_dead_tup, n_live_tup,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE n_dead_tup > n_live_tup * 0.1
ORDER BY n_dead_tup DESC;
```

Pour les très grosses tables où le bloat et le VACUUM deviennent structurellement difficiles à suivre, la meilleure arme est souvent de **ne pas laisser la table grandir sans fin** : le **partitionnement**. On découpe physiquement une table géante en sous-tables — typiquement une par mois pour des données horodatées. Une requête bornée dans le temps ne balaie alors que la partition concernée (*partition pruning*), et surtout, purger les vieilles données devient un `DROP TABLE` **instantané** — sans le moindre VACUUM, puisqu'on supprime le fichier entier.

```sql
CREATE TABLE events (
    id BIGSERIAL,
    created_at TIMESTAMP NOT NULL,
    data JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2024_01 PARTITION OF events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Purge d'un mois entier : instantané, aucun bloat.
DROP TABLE events_2023_01;
```

C'est le compromis du passage à l'échelle : un peu de complexité de gestion (créer les partitions à l'avance, souvent via l'extension `pg_partman`) contre une exploitation qui reste saine à des centaines de millions de lignes.

---

## À retenir

1. **MVCC versionne au lieu d'écraser.** Chaque écriture crée une nouvelle version de la ligne (`xmin`/`xmax`) ; les lecteurs ne bloquent jamais les écrivains, mais chaque `UPDATE`/`DELETE` laisse un tuple mort.

2. **VACUUM n'est pas une corvée, c'est vital.** Il ramasse les tuples morts *et* gèle les vieilles lignes contre le *transaction ID wraparound* — un anneau de 32 bits qui, saturé, met la base en lecture seule. Réglez l'autovacuum finement sur les tables chaudes et surveillez `age(datfrozenxid)`.

3. **Le WAL, c'est la durabilité au prix du séquentiel.** On journalise avant d'écrire à la place définitive ; un seul `fsync` séquentiel au commit remplace une nuée d'écritures aléatoires. `synchronous_commit = off` échange un peu de sécurité contre beaucoup de débit — un choix, jamais un défaut subi.

4. **Choisissez l'index selon la forme de la requête.** B-Tree pour l'égalité, les intervalles et le tri (95 % des cas) ; GIN pour JSONB, tableaux et plein texte ; BRIN, minuscule, pour les tables horodatées physiquement ordonnées. Le Hash n'est **pas** plus petit qu'un B-Tree et ne sert presque jamais. L'ordre des colonnes d'un index composite est décisif.

5. **Ne devinez jamais, mesurez avec `EXPLAIN (ANALYZE, BUFFERS)`.** Un `Seq Scan` sur grosse table, un `Rows Removed by Filter` massif, `shared read ≫ shared hit`, ou un `actual time` très loin du `cost` (statistiques périmées → `ANALYZE`) sont vos signaux. Le planificateur ne vaut que ses statistiques.

6. **En Repeatable Read, la photo est figée pour toute la transaction — fantômes inclus.** L'implémentation snapshot de PostgreSQL interdit *totalement* les lectures fantômes, au-delà de ce qu'exige le standard SQL. Restez en Read Committed par défaut, montez le niveau seulement là où la logique métier l'impose.

7. **En production : poolez, paginez par clé, partitionnez.** Chaque connexion est un processus coûteux (PgBouncer devant) ; `OFFSET` jette le travail qu'il vient de faire (préférez la *keyset pagination*) ; les tables géantes se domptent par partitionnement, où purger devient un `DROP TABLE` instantané.

---

## Pour aller plus loin

- **Bruce Momjian, *MVCC Unmasked***  — la présentation de référence sur les rouages internes de MVCC, par un des développeurs cœur de PostgreSQL. À compléter par la série *Postgres Internals* de son site.
- **La documentation officielle**, chapitres *Concurrency Control*, *Write-Ahead Logging* et *Indexes* — dense mais exacte ; le seul endroit qui suit l'évolution réelle du moteur version après version.
- **Egor Rogov, *PostgreSQL 14 Internals*** (téléchargeable gratuitement) — le livre le plus clair et le plus complet sur le stockage, MVCC, le WAL et le planificateur ; l'équivalent d'un DDIA centré sur Postgres.
- **`use-the-index-luke.com`** (Markus Winand) — pour approfondir spécifiquement les index B-Tree, la sélectivité et l'art de faire coopérer une requête avec son index.
- **Kleppmann, *Designing Data-Intensive Applications*, chapitre 7 (*Transactions*)** — pour resituer l'isolation et MVCC de PostgreSQL dans le paysage plus large des garanties transactionnelles.
