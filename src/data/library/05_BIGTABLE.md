# Bigtable : stocker des pétaoctets structurés sans base relationnelle

En 2006, Google publie un article qui va fonder une industrie entière. Le problème qu'il résout paraît prosaïque — « où ranger nos données ? » — mais son échelle ne l'est pas. L'index du web, les tuiles de Google Earth, l'historique de Google Analytics, les cours de Google Finance : soixante produits, des centaines de téraoctets chacun, parfois des pétaoctets. Aucun outil de l'époque ne savait faire. **Bigtable** est la réponse, et sa réponse s'est révélée si juste qu'elle a directement engendré HBase, le moteur de stockage de Cassandra, et toute la lignée des bases NoSQL « wide-column ».

Ce chapitre part du problème, construit un modèle mental, puis descend dans chaque mécanisme — le modèle de données, les SSTables et le LSM-tree, les tablets, Chubby, la hiérarchie de localisation, les filtres de Bloom, les locality groups — toujours avec la même trame : *pourquoi ce choix, et qu'est-ce qu'il coûte.*

---

## Le problème : du structuré, à l'échelle du pétaoctet

Posons les contraintes de Google en 2006, parce qu'elles expliquent tout ce qui suit.

Les données sont **semi-structurées**. Une page web a un contenu HTML, une langue détectée, une liste de liens entrants, un score PageRank. Mais toutes les pages n'ont pas les mêmes attributs, et on veut pouvoir en ajouter demain sans réécrire le schéma. Les données sont **volumineuses** — des pétaoctets, bien au-delà d'une seule machine. Elles doivent tolérer les **pannes matérielles** comme un fait quotidien : à cette échelle, un disque meurt toutes les heures. Et il faut des **débits énormes**, en lecture séquentielle comme en écriture.

Regardons pourquoi les outils existants échouent, un par un.

Une **base relationnelle** (PostgreSQL, MySQL) impose un schéma rigide : ajouter une colonne à des milliards de lignes est une migration douloureuse. Elle gère mal la donnée éparse — une colonne absente coûte quand même un `NULL`. Et surtout, elle ne scale pas horizontalement sans une gymnastique de sharding manuelle que personne ne veut opérer sur mille machines.

Un **key-value store** scale, lui, mais il est trop pauvre. Une clé, une valeur opaque. Pas de colonnes, pas de balayage de plages de clés (*range scan*), pas de versions. On ne peut pas dire « donne-moi toutes les pages du domaine cnn.com » ni « donne-moi le contenu tel qu'il était il y a trois mois ».

Bigtable se glisse exactement entre les deux : **stockage structuré, schéma flexible, échelle du pétaoctet**. Il n'est pas relationnel — il abandonne délibérément les jointures, les transactions multi-lignes et les index secondaires — mais il garde ce qui compte pour ces charges : des colonnes, un ordre, des versions, et un débit qui monte linéairement avec le nombre de machines.

Point d'architecture à retenir dès maintenant : Bigtable **ne stocke rien lui-même sur disque**. Il s'appuie sur **GFS** (Google File System), le système de fichiers distribué de Google, pour la persistance et la réplication des octets. Bigtable est la couche qui donne du *sens* structuré à des fichiers que GFS se contente de garder en vie. Cette séparation — un moteur de structure au-dessus d'un moteur de stockage brut — est le premier des grands choix de conception.

---

## Le modèle mental : une carte triée multidimensionnelle

Avant les mécanismes, l'idée centrale. Les auteurs la résument en une phrase qu'il faut apprendre par cœur, parce que tout le reste en découle :

> **« A Bigtable is a sparse, distributed, persistent multidimensional sorted map. »**

Décortiquons chaque adjectif, car chacun est un choix d'ingénierie, pas un mot de marketing.

C'est une **carte** (une *map*, un dictionnaire). On y range des valeurs derrière des clés. Mais la clé est **multidimensionnelle** : elle a trois composantes.

```
(row_key, column_key, timestamp) → value
```

Concrètement, une cellule s'adresse par sa ligne, sa colonne, et son instant :

```python
bigtable["com.cnn.www"]["contents:", t=1000] = "<html>page CNN, sept. 2006..."
bigtable["com.cnn.www"]["contents:", t=900]  = "<html>page CNN, août 2006..."
bigtable["com.cnn.www"]["anchor:cnnsi.com"]  = "CNN"
bigtable["com.cnn.www"]["language:"]         = "en"
```

**Éparse** (*sparse*) : une colonne n'existe que si on lui a donné une valeur. Une ligne peut avoir trois colonnes, sa voisine en avoir un million d'autres, sans le moindre gâchis. Pas de `NULL` à stocker. Pour une table où chaque ligne n'utilise qu'une poignée parmi des millions de colonnes possibles — pensez à Google Analytics, une colonne par URL visitée — c'est décisif.

**Triée** (*sorted*) : les clés de ligne sont rangées dans l'ordre lexicographique, et cet ordre est *garanti et exploitable*. C'est la propriété la plus sous-estimée du modèle. Elle signifie que des lignes aux clés voisines sont physiquement voisines sur le disque, donc qu'un *range scan* — « toutes les lignes de X à Y » — est un balayage séquentiel efficace, pas mille lectures aléatoires.

**Multi-version** : le `timestamp` dans la clé fait que chaque cellule garde plusieurs versions horodatées de sa valeur. Le voyage dans le temps est gratuit et natif. On peut demander « la valeur au temps t » ou « les trois dernières versions », et un garbage collector configurable élague le reste (« ne garde que les 3 dernières », ou « rien de plus vieux que 7 jours »).

**Distribuée et persistante** : la carte est trop grande pour une machine, elle est découpée et répartie sur un cluster, et elle survit aux redémarrages via GFS.

### L'astuce des clés inversées

Puisque l'ordre des clés *est* la localité physique, **le design de la clé de ligne devient un choix d'architecture**. L'exemple canonique, la Webtable de Google, le montre parfaitement.

Une URL naïve, `www.cnn.com`, trie mal : `www.cnn.com` et `www.cnn.com/sports` se retrouvent loin de `mail.cnn.com` dans l'ordre alphabétique, alors qu'ils appartiennent au même site. La solution est d'**inverser les composants du nom de domaine** :

```
www.cnn.com/sports   →   com.cnn.www/sports
mail.cnn.com         →   com.cnn.mail
sports.cnn.com       →   com.cnn.sports
```

Désormais, toutes les pages du domaine `cnn.com` partagent le préfixe `com.cnn.` et se rangent **de façon contiguë** sur le disque. « Balaye tout le site de CNN » redevient un range scan séquentiel. Le domaine devient une unité de localité — et, bonus, différents domaines tombent naturellement sur différentes tablets, ce qui répartit la charge. Nous reviendrons sur cette tension (localité *contre* répartition) quand nous parlerons des *hotspots*.

### Column families : la structure dans la structure

Un dernier étage du modèle de données. Les colonnes ne flottent pas librement ; elles sont regroupées en **column families** (familles de colonnes). Le nom d'une colonne s'écrit `famille:qualificateur` — par exemple `anchor:cnnsi.com`, où `anchor` est la famille et `cnnsi.com` le qualificateur.

La famille est l'**unité de gestion** : c'est à ce niveau qu'on déclare le schéma (les familles sont peu nombreuses et rarement modifiées), qu'on applique le contrôle d'accès, et — on le verra — qu'on configure la compression et le stockage. Les qualificateurs à l'intérieur d'une famille, eux, peuvent être en nombre illimité et créés à la volée. C'est ce qui rend le schéma « flexible » : on fige les familles, on invente les colonnes librement.

Voici la Webtable dans son ensemble, qui donne à voir tout le modèle d'un coup :

```
Ligne : "com.cnn.www"            (URL inversée → localité)

  Famille "contents:"            (le HTML de la page)
    t=1000 : "<html>...sept. 2006..."
    t=900  : "<html>...août 2006..."
    t=800  : "<html>...juil. 2006..."   (GC : ne garder que 3 versions)

  Famille "anchor:"              (liens entrants, un par site référent)
    "anchor:cnnsi.com"   → "CNN"
    "anchor:my.look.ca"  → "CNN"

  Famille "language:"            (langue détectée)
    → "en"
```

---

## Comment c'est servi : master, tablets, tablet servers

La carte logique existe ; reste à la découper et à la faire tourner sur un cluster. Voici l'anatomie.

```
        ┌──────────────────────────────────────────┐
        │  CHUBBY  (service de verrous distribué)   │
        │  • localisation du master                 │
        │  • découverte des tablet servers          │
        │  • schéma + listes de contrôle d'accès    │
        └──────────────────────────────────────────┘
                          │
        ┌──────────────────────────────────────────┐
        │  MASTER  (un seul)                        │
        │  • assigne les tablets aux serveurs       │
        │  • détecte les pannes de serveur          │
        │  • équilibre la charge (migration)        │
        │  • PAS dans le chemin critique lecture/   │
        │    écriture                               │
        └──────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
     ┌────▼─────┐   ┌─────▼────┐    ┌─────▼────┐
     │ TABLET   │   │ TABLET   │    │ TABLET   │
     │ SERVER 1 │   │ SERVER 2 │    │ SERVER N │
     │ 10–1000  │   │ 10–1000  │    │   ...    │
     │ tablets  │   │ tablets  │    │          │
     └────┬─────┘   └──────────┘    └──────────┘
          │ lit / écrit
          ▼
        ┌──────────────────────────────────────────┐
        │  GFS  (Google File System)                │
        │  • fichiers SSTable (triés, immuables)    │
        │  • commit logs (journaux d'écriture)      │
        └──────────────────────────────────────────┘
```

Une **tablet** est le grain de distribution : une plage contiguë de clés de ligne (`start_row` à `end_row`). Une table démarre comme une seule tablet et, quand elle grossit, se **découpe** (*split*) automatiquement en deux à une clé médiane. Chaque tablet vise ~100–200 Mo. Comme les clés sont triées, une tablet est simplement « une tranche de l'ordre global ».

Les **tablet servers** font le travail : chacun sert entre dix et mille tablets, encaisse les lectures et les écritures, lit et écrit sur GFS.

Le **master** orchestre mais ne touche pas aux données. Il assigne les tablets aux serveurs, détecte les serveurs morts et réassigne leurs tablets, équilibre la charge en migrant des tablets, gère les changements de schéma. Le détail crucial est en négatif : **le master n'est pas dans le chemin critique**. Un client qui lit ou écrit une cellule ne parle jamais au master. Il parle directement au tablet server concerné. C'est pour cela qu'un seul master suffit et qu'il n'est pas un goulot d'étranglement — il peut même être momentanément absent sans interrompre le service des données.

Cette **séparation des rôles** est une leçon d'architecture en soi : le master fait de la métadonnée, les tablet servers servent la donnée, GFS persiste les octets, Chubby coordonne. Chaque composant fait *une* chose, bien.

---

## Le moteur de stockage : LSM-tree, memtable et SSTables

Nous arrivons au cœur technique, celui qui séduira l'ancien de chez Intel : que se passe-t-il *exactement* quand on écrit une cellule, et pourquoi cette conception plutôt qu'une autre.

### Pourquoi pas un B-tree

Une base relationnelle classique range ses données dans un **B-tree** et écrit *sur place* (*update-in-place*). Écrire une valeur, c'est : trouver la bonne feuille de l'arbre (**lecture aléatoire**), la modifier (**écriture aléatoire**), et parfois rééquilibrer l'arbre (encore des I/O aléatoires).

Le problème est physique. Sur un disque dur, une opération aléatoire coûte le déplacement de la tête — de l'ordre de **10 ms**. Faites le calcul : 1000 écritures par seconde × 10 ms = 10 secondes de temps disque par seconde d'horloge. C'est impossible. Le B-tree excelle en lecture mais s'effondre sous un débit d'écriture élevé, parce qu'il dissémine ses écritures aux quatre coins du disque.

L'idée qui débloque tout : **convertir les écritures aléatoires en écritures séquentielles**. Une écriture séquentielle, la tête n'a pas à bouger — le débit est plusieurs ordres de grandeur au-dessus. C'est précisément ce que fait le **LSM-tree** (*Log-Structured Merge-tree*), la structure inventée par O'Neil et al. en 1996 et que Bigtable porte à l'échelle industrielle.

### L'idée du LSM-tree

L'intuition tient en une image : **on n'écrit jamais sur place, on empile.** Les écritures récentes vivent en mémoire, dans une structure triée. Quand cette mémoire est pleine, on la déverse d'un bloc sur le disque, séquentiellement, dans un fichier qu'on ne modifiera plus jamais. Le disque n'accumule donc que des fichiers triés et **immuables**, écrits d'une traite. En arrière-plan, on fusionne périodiquement ces fichiers pour éviter qu'ils prolifèrent.

Trois pièces concrètes dans Bigtable :

- La **memtable** — un tampon trié *en mémoire* (arbre rouge-noir ou skip list) qui reçoit toutes les écritures récentes. Insertion en ~1 µs.
- Les **SSTables** (*Sorted String Tables*) — les fichiers triés et immuables sur GFS, résultat du déversement des memtables pleines.
- Le **commit log** — un journal *append-only* sur GFS, écrit avant tout le reste, qui garantit la durabilité en cas de crash.

### Le chemin d'écriture, pas à pas

Voici ce qui se passe quand un client écrit une cellule. Notez que **rien n'est aléatoire** : tout est séquentiel ou en mémoire.

```python
def write(row_key, column, timestamp, value):
    # 1. Contrôle d'accès (ACL lue depuis Chubby, en cache)
    if current_user not in acl_cache[table]:
        raise PermissionDenied

    # 2. Écriture dans le commit log — la durabilité d'abord
    #    Ajout séquentiel sur GFS, puis group commit (voir plus bas)
    commit_log.append(LogEntry(tablet_id, row_key, column, timestamp, value, "SET"))

    # 3. Insertion dans la memtable (structure triée en mémoire)
    memtable.insert((row_key, column, timestamp), value)

    # 4. La memtable est pleine ? On déclenche une minor compaction
    if memtable.size() > THRESHOLD:   # seuil typique : 4–8 Mo
        trigger_minor_compaction()
```

L'ordre est essentiel. On écrit d'abord dans le **commit log** *parce que* la memtable est volatile : si le serveur meurt, la mémoire s'évapore, mais le journal sur GFS permet de rejouer les écritures et de reconstruire la memtable. Le log est un *redo log* — la promesse de durabilité — et l'insertion en memtable rend simplement la donnée immédiatement lisible.

**L'optimisation du group commit.** Écrire une entrée de log par écriture cliente, ce serait une I/O disque par écriture — on retomberait dans le piège. Bigtable **regroupe** plusieurs écritures en attente et les écrit en un seul I/O, puis notifie tous les clients d'un coup. Beaucoup d'écritures logiques, peu d'opérations disque : c'est ce qui permet des milliers d'écritures par seconde par serveur.

```python
def group_commit():
    while pending_writes or new_writes_arriving():
        batch = collect_pending_writes()
        commit_log.write_batch(batch)      # une seule I/O pour tout le lot
        for w in batch:
            w.notify_success()
```

Le compromis assumé : le group commit **augmente légèrement la latence** d'une écriture individuelle (elle attend son lot) pour **maximiser le débit** global. À l'échelle de Google, c'est le bon arbitrage.

### La compaction : le prix du LSM

Les memtables pleines se déversent, les SSTables s'accumulent. Sans entretien, une lecture devrait consulter des centaines de fichiers. La **compaction** est l'entretien qui maintient les performances de lecture — et c'est le coût caché du LSM-tree. Trois formes.

**Minor compaction — memtable → une SSTable.** Déclenchée quand la memtable atteint son seuil (4–8 Mo). On *gèle* la memtable courante, on en crée une neuve pour les nouvelles écritures (pendant que les anciennes restent lisibles), et on écrit la memtable gelée comme une nouvelle SSTable sur GFS. Rapide, fréquent, quasi invisible.

```python
def minor_compaction():
    frozen = memtable
    memtable = new Memtable()                 # les écritures continuent ici
    sstable = new SSTable()
    for key, value in frozen.sorted():        # déjà trié : écriture séquentielle
        sstable.write(key, value)
    sstable.finalize()                        # écrit l'index + le filtre de Bloom
    gfs.write(f"tablet-{tid}-{sid}.sst", sstable)
    sstable_list.append(sstable)
    commit_log.advance_checkpoint()           # on peut tronquer le vieux log
```

Notez le bénéfice collatéral : une fois les écritures matérialisées en SSTable, la portion correspondante du commit log **peut être tronquée**. La minor compaction fait donc double emploi — elle libère de la mémoire *et* borne le journal.

**Merging compaction — N SSTables → moins de SSTables.** Déclenchée quand trop de SSTables se sont accumulées (par exemple dix). C'est une **fusion k-voies** de fichiers triés, exactement comme l'étape de fusion d'un tri fusion, pilotée par un tas (*min-heap*) qui rend toujours la plus petite clé courante. En passant, on applique la politique de versions : ne garder que les N dernières par cellule.

```python
def merging_compaction(sstables):
    heap = MinHeap([(s.first_key(), s) for s in sstables])
    out = new SSTable()
    while not heap.empty():
        key, s = heap.pop()
        for version in collect_versions(key, sstables)[:max_versions]:
            out.write(key, version)
        if s.advance(): heap.push((s.current_key(), s))
    out.finalize()
    gfs.write("merged.sst", out)
    for s in sstables: gfs.delete(s.path)     # les entrées sont supprimées
```

**Major compaction — toutes les SSTables → une seule.** Le cas limite de la fusion. Son intérêt propre : elle **récupère vraiment l'espace**. Dans un LSM-tree, une suppression n'efface rien — elle écrit un marqueur, un *tombstone*, qui dit « cette cellule est morte ». Le tombstone masque les anciennes versions à la lecture, mais elles occupent toujours le disque. La major compaction, qui voit *toutes* les SSTables d'un coup, peut enfin éliminer physiquement la donnée supprimée et ses tombstones. Aucune trace ne subsiste.

**Le compromis — c'est ici le nerf du LSM.** La compaction fait payer une *amplification d'écriture* : une même donnée est réécrite plusieurs fois au fil des fusions. Et pendant qu'une compaction tourne, elle se dispute la bande passante disque avec les écritures clientes — la latence d'écriture P99 grimpe. On l'atténue en limitant le débit de compaction (« pas plus de 50 Mo/s »), en la planifiant aux heures creuses, et en surveillant le retard : si le nombre de SSTables enfle, la compaction décroche et les lectures se dégradent. Les systèmes modernes (RocksDB, Cassandra) ont raffiné cela avec la **compaction par niveaux** (*tiered/leveled*) — les SSTables sont rangées en couches L0, L1, L2… chacune ~10× plus grande, et l'on ne fusionne que des niveaux adjacents, ce qui réduit l'I/O total.

Le mot de la fin sur le LSM, à garder en tête pour la suite : **les écritures sont bon marché, les lectures ne sont pas gratuites.** L'écriture est séquentielle et rapide ; la lecture, elle, doit potentiellement consulter la memtable *et* plusieurs SSTables. Les trois sections suivantes — le chemin de lecture, les filtres de Bloom, les locality groups — sont autant de réponses à ce déséquilibre.

### Le chemin de lecture : une vue fusionnée

Puisque la vérité d'une cellule est éparpillée entre la memtable (écritures fraîches) et plusieurs SSTables (écritures plus anciennes), lire, c'est **fusionner**. On rassemble toutes les versions candidates, on les trie par timestamp décroissant, on rend la plus récente (ou les N demandées).

```python
def read(row_key, column, timestamp=now()):
    # 1. Filtrer les SSTables avec les filtres de Bloom (voir plus bas)
    candidats = [s for s in sstable_list
                 if s.bloom_filter.might_contain(row_key, column)]

    # 2. Fusionner memtable + SSTables candidates
    results = []
    results += memtable.versions_up_to(row_key, column, timestamp)
    for s in reversed(candidats):             # SSTable la plus récente d'abord
        results += s.versions_up_to(row_key, column, timestamp)

    # 3. Trier par timestamp décroissant, rendre la/les version(s)
    results.sort(key=lambda x: -x.timestamp)
    return results
```

Chaque source est déjà triée par clé, donc la fusion est efficace. Mais l'étape 1 est la vraie astuce : sans elle, on devrait ouvrir *chaque* SSTable sur le disque pour découvrir qu'elle ne contient pas la clé cherchée. D'où les filtres de Bloom.

---

## Les filtres de Bloom : éviter les lectures disque inutiles

Voici le problème concret. Une clé donnée ne vit peut-être que dans une SSTable sur cinquante. Vérifier les quarante-neuf autres, c'est quarante-neuf lectures disque pour rien. À 10 ms la lecture aléatoire, c'est ruineux.

Un **filtre de Bloom** est une structure probabiliste qui répond à une seule question — « la clé X est-elle dans cet ensemble ? » — avec une garantie asymétrique très utile : **« peut-être »** ou **« certainement non »**. Il ne se trompe jamais dans le sens « non » (pas de faux négatif), et se trompe rarement dans le sens « oui » (faux positif ~1 %).

L'intuition mécanique — celle qui parlera à quelqu'un qui aime les bits. On prend un tableau de bits, initialement à zéro, et *k* fonctions de hachage. Pour **insérer** une clé, on la hache par les *k* fonctions et on met à 1 les *k* bits correspondants. Pour **tester** une clé, on regarde ces mêmes *k* bits : si l'un d'eux est à 0, la clé n'a jamais pu être insérée — **certainement non**. Si tous sont à 1, elle est *probablement* là (mais d'autres clés ont pu allumer ces bits par coïncidence — d'où le faux positif).

```python
class BloomFilter:
    def add(self, key):
        for h in self.hash_functions:
            self.bits[h(key) % self.size] = 1

    def might_contain(self, key):
        for h in self.hash_functions:
            if self.bits[h(key) % self.size] == 0:
                return False        # certainement absente
        return True                 # peut-être présente (faux positif possible)
```

Dans Bigtable, chaque SSTable embarque son filtre de Bloom (chargé en mémoire à l'ouverture). Avant de toucher au disque, le tablet server interroge le filtre. Résultat : on **saute la quasi-totalité des SSTables** qui ne contiennent pas la clé. Le taux de faux positifs de ~1 % signifie qu'une lecture inutile sur cent passe entre les mailles — un coût négligeable au regard des 99 % de lectures disque évitées.

Le compromis : un filtre de Bloom **consomme de la mémoire** (quelques bits par clé) et n'aide que les *point lookups*, pas les range scans (qui balaient de toute façon). C'est un échange mémoire-contre-I/O, presque toujours gagnant pour une charge de lectures ponctuelles.

---

## Retrouver une tablet : la hiérarchie à trois niveaux

Un client veut lire `com.cnn.www`. Sur quel tablet server est-elle ? Les tablets se découpent et migrent en permanence ; il faut un annuaire, et cet annuaire doit lui-même passer à l'échelle sans devenir un goulot. Bigtable le résout avec une **hiérarchie à trois niveaux**, structurée comme un B-tree à trois étages.

```
Niveau 0 : FICHIER CHUBBY
   → contient l'emplacement de la Root Tablet
   → un unique fichier, point d'entrée stable

Niveau 1 : ROOT TABLET  (ne se découpe JAMAIS)
   → contient l'emplacement de toutes les tablets METADATA

Niveau 2 : TABLETS METADATA
   → contiennent l'emplacement de toutes les tablets utilisateur
   → clé = (table_id, end_row) → localisation de la tablet

Niveau 3 : TABLET UTILISATEUR
   → contient enfin les vraies données
```

La résolution à froid :

```
1. Cache client : MISS → aller voir Chubby
2. Chubby     : « La root tablet est sur TabletServer-1 »
3. Root       : « Les METADATA de Webtable sont sur TabletServer-5 »
4. METADATA   : « Les lignes com.cnn.* sont sur TabletServer-12 »
5. TS-12      : « Voici la donnée pour com.cnn.www »
```

Deux subtilités portent tout le poids. D'abord, la **root tablet ne se découpe jamais** : c'est en réalité la première tablet de la table METADATA, mais on lui interdit le split pour que la hauteur de l'arbre reste fixe à trois. Ensuite, le client **cache agressivement** les localisations et **préfetche** les tablets voisines. À froid, il faut trois allers-retours réseau ; à chaud, zéro ou un. Le cas coûteux est donc rare, et Chubby n'est sollicité qu'au premier accès ou après un cache invalidé.

**Pourquoi exactement trois niveaux ?** Le calcul de capacité montre que trois suffisent pour n'importe quelle table imaginable :

```
Une tablet METADATA fait ~128 Mo, une entrée ~1 Ko
  → 128 Mo / 1 Ko ≈ 131 072 entrées par tablet METADATA
  → 2^17 tablets METADATA au niveau 2, chacune 2^17 entrées
  → soit 2^34 tablets utilisateur adressables (~17 milliards)

Chaque tablet utilisateur ~128 Mo (= 2^27 octets)
  → 2^34 × 2^27 = 2^61 octets ≈ 2 exaoctets adressables
```

Deux exaoctets — bien au-delà de tout déploiement réel. Trois niveaux, plafond suffisant, hauteur constante : l'annuaire ne devient jamais le maillon faible.

---

## Chubby : la dépendance assumée

Chubby est revenu partout : localisation du master, découverte des tablet servers, stockage du schéma et des ACL, ancre de la hiérarchie. **Chubby** est un service de **verrous distribués** (l'équivalent open source est ZooKeeper). Une question s'impose, et un CTO la posera : *n'est-ce pas un point de défaillance unique ?*

D'abord, ce qu'est Chubby. Cinq réplicas, un leader élu par **Paxos**. Le service est vivant tant qu'une **majorité** (3 sur 5) répond — il tolère donc deux pannes simultanées. En mesure réelle chez Google, l'indisponibilité moyenne vue par Bigtable est de **0,0047 %** des heures-serveur, et de 0,0326 % dans le pire cluster. Très haute disponibilité — mais pas 100 %.

Ce qui se passe quand Chubby tombe est instructif, parce que la réponse est **nuancée**, pas binaire. Ce qui *continue* : les tablet servers déjà en service **servent toujours** lectures et écritures — le chemin de données ne consulte pas Chubby. Les clients qui ont leurs localisations en cache **continuent** aussi. Ce qui *casse* : plus de nouvelle inscription de tablet server, le master ne peut plus (ré)acquérir son verrou, et les lectures/écritures de schéma sont bloquées (le schéma vit dans Chubby).

Mais il y a un mécanisme de sûreté délibéré. Chaque tablet server tient une **session Chubby**. Si Chubby reste absent au-delà de quelques secondes, la session expire, et le tablet server **se suicide** (*fail-safe*) — mieux vaut un serveur mort qu'un serveur qui sert en aveugle sans coordination. Le master, ne pouvant plus atteindre le quorum, s'arrête de même. **Bigtable devient alors indisponible.** Chubby est donc bien une dépendance dure sur le long terme, mais le service absorbe les hoquets courts sans broncher.

**Le compromis, et c'est une leçon de conception.** Pourquoi accepter cette dépendance ? L'alternative serait de construire un service de verrous *à l'intérieur* de Bigtable : explosion de complexité, difficile à tester et déboguer, et probablement *moins* fiable qu'un composant dédié et éprouvé. Chubby est simple, prouvé en production, hautement disponible, et concentre l'expertise « coordination » en un seul endroit. Bâtir sur un composant éprouvé plutôt que réinventer : le 0,005 % d'indisponibilité est un prix accepté en connaissance de cause.

---

## Locality groups et compression : la lecture, encore

Retour au déséquilibre du LSM : lire coûte. Deux raffinements, configurés au niveau des column families, s'attaquent à la quantité de données réellement balayée.

### Locality groups

Le problème : une SSTable range côte à côte toutes les familles d'une ligne. Si vous ne voulez que la famille `language:`, vous risquez de balayer aussi le lourd HTML de `contents:` posé juste à côté. Un **locality group** répond à cela : on regroupe les familles souvent lues ensemble, et **chaque groupe est stocké dans ses propres SSTables**.

```python
# "contents" et "language" sont lus ensemble → même groupe
create_locality_group("web-content", families=["contents", "language"])

# "anchor" (les backlinks) est lu séparément → groupe distinct, en mémoire
create_locality_group("backlinks", families=["anchor"], in_memory=True)
```

Désormais, lire `anchor:` ne touche que les SSTables du groupe `backlinks` — beaucoup moins de données à parcourir. On retrouve l'esprit de Google Earth : mettre l'imagerie satellite (des mégaoctets) dans un groupe, les étiquettes de villes (quelques octets) dans un autre, pour que lire une étiquette ne traîne jamais une image derrière elle.

L'option `in_memory=True` va plus loin : elle **épingle un groupe en RAM**. Pour une petite famille très chaude — les métadonnées d'un index de recherche, un score PageRank — toutes les lectures sont alors servies depuis la mémoire, sans disque du tout, avec une latence sub-milliseconde. Le compromis est évident : la RAM est chère et limitée, on ne la réserve qu'aux données petites et brûlantes.

### Compression par column family

Puisqu'une famille est cohérente en type, on peut choisir sa compression au cas par cas :

```python
set_compression("contents", "ZLIB")    # texte HTML très compressible → 2:1 à 5:1
set_compression("imagery",  "NONE")    # JPEG déjà compressé → ne pas gâcher de CPU
set_compression("anchor",   "SNAPPY")  # petites chaînes → décompression très rapide
```

Le trait le plus spectaculaire vient de la **compression à deux niveaux** exploitant le multi-version. Pour le contenu web, on compresse d'abord *entre les versions successives d'une même page* (algorithme de Bentley-McIlroy : deux versions consécutives d'une page CNN diffèrent à peine), puis on applique Zlib par colonne. Résultat : jusqu'à **10:1** sur les versions HTML. Le modèle multi-version, qui semblait un luxe, devient un levier de compression.

Le compromis général de la compression : du **CPU contre de l'I/O et de l'espace**. On dépense des cycles pour décompresser, on économise de la bande passante disque et du stockage. Pour du texte, l'échange est presque toujours gagnant ; pour du JPEG déjà compressé, il serait perdant — d'où le `NONE` explicite.

---

## Le format SSTable et la reprise après crash

Deux plongées finales pour fermer la boucle mécanique.

### À quoi ressemble une SSTable

Une SSTable n'est pas un tas d'octets triés en vrac ; elle est structurée pour la recherche.

```
┌──────────────────────────────────────────────┐
│ BLOC 1  (64 Ko par défaut)                    │
│   (row1, col1, t100) → val1                   │
│   (row1, col2, t90)  → val2   ...             │
├──────────────────────────────────────────────┤
│ BLOC 2  (64 Ko)  ...                          │
├──────────────────────────────────────────────┤
│ INDEX DES BLOCS  (en fin de fichier)          │
│   clé de début du bloc 1 → offset 0           │
│   clé de début du bloc 2 → offset 65536  ...  │
│   → chargé en mémoire à l'ouverture           │
├──────────────────────────────────────────────┤
│ FILTRE DE BLOOM                               │
│   « la clé X est-elle dans cette SSTable ? »  │
└──────────────────────────────────────────────┘
```

La donnée est découpée en **blocs** de 64 Ko. Un **index des blocs**, placé en fin de fichier et chargé en mémoire à l'ouverture, associe la clé de début de chaque bloc à son offset. Chercher une clé devient : (1) interroger le filtre de Bloom — « peut-être » ; (2) **recherche binaire** dans l'index des blocs pour trouver le bon bloc ; (3) lire ce bloc de 64 Ko depuis le disque ; (4) le balayer. Coût typique : **un seul seek disque** en cas de cache miss. L'index tient en mémoire, le bloc est l'unité d'I/O — tout est calibré pour minimiser les allers-retours.

### Reprise après la mort d'un tablet server

Un tablet server tombe. Ses tablets doivent renaître ailleurs. Reconstruire une tablet, c'est retrouver ses SSTables *et* rejouer les écritures récentes qui n'étaient encore qu'en memtable (donc volatiles) :

```python
def recover_tablet(tablet_id):
    meta = metadata_table.read(tablet_id)      # SSTables + points de reprise du log
    for path in meta.sstable_files:
        SSTable.open(path)                     # charge index + filtre de Bloom en RAM
    # Rejoue le commit log après le redo point pour reconstruire la memtable
    for entry in commit_log.read_from(meta.redo_points[tablet_id]):
        if entry.tablet_id == tablet_id:
            memtable.insert((entry.row_key, entry.column, entry.timestamp), entry.value)
    tablet.status = SERVING
```

Le point de conception subtil est ici : **il y a un commit log par tablet server, pas un par tablet.** Un seul journal séquentiel pour toutes les tablets du serveur, c'est bien plus efficace à l'écriture (une seule séquence d'*appends* au lieu de mille journaux entrelacés). Mais cela déplace le coût sur la reprise : pour ressusciter *une* tablet, il faut retrouver *ses* entrées dans un log qui mélange toutes les tablets. Bigtable résout cela en **triant les entrées du log par tablet** au moment de la reprise, en parallèle sur plusieurs serveurs. La reprise prend de l'ordre de la seconde, bornée par la taille du commit log. Encore un arbitrage : optimiser l'écriture (le cas fréquent) au prix d'une reprise plus élaborée (le cas rare).

---

## Concevoir les clés : la performance est dans le schéma

Un thème traverse tout ce qui précède : puisque l'ordre des clés est la localité, **le design de la clé de ligne EST une décision d'architecture**. Le piège classique est le *hotspot*.

Bigtable répartit par plages de clés. Si vos clés sont **séquentielles** — un timestamp, un compteur — les écritures récentes tombent toutes dans la même plage, donc sur **une seule tablet, un seul serveur**. Tout le débit d'écriture s'écrase sur une machine pendant que les autres somnolent.

```
Clé = str(timestamp)     "1704067200", "1704067201", ...

Tablet 1 : 1704067000 – 1704067099
Tablet 2 : 1704067100 – 1704067199
Tablet 3 : 1704067200 – ...     ← TOUTES les écritures neuves ici !
```

Trois parades, chacune avec son compromis.

**Timestamp inversé.** On stocke `MAX - timestamp`. Les données récentes obtiennent alors les plus petites clés, réparties différemment. Cela casse le hotspot d'écriture — mais un range scan « les données les plus récentes » redevient, lui, concentré sur une tablet. On déplace le problème plutôt qu'on l'élimine.

**Salting (préfixe de hachage).** On préfixe la clé par `hash(id) % N`, disons 10 seaux. Les écritures se répartissent sur dix plages, donc dix tablets. Le coût : un range scan doit désormais interroger **les dix seaux** et recoller les morceaux. À ne faire que si les écritures dominent largement les scans.

```python
def make_row_key(user_id, timestamp):
    salt = hash(user_id) % 10
    return f"{salt:02d}_{user_id}_{timestamp}"
```

**URL inversée** — la propre astuce de Bigtable, déjà vue. Pour la donnée web, inverser le domaine donne le meilleur des deux mondes : tous les `com.cnn.*` contigus (range scan efficace par domaine) *et* des domaines différents sur des tablets différentes (charge répartie). C'est le cas heureux où localité et répartition coïncident, parce que la cardinalité des domaines est élevée.

La règle générale : pas de clés numériques séquentielles ; penser aux *patterns d'accès* (range scan contre point lookup) avant de figer la clé ; et, quand deux dimensions d'accès s'opposent, **maintenir deux tables** — par exemple une table `server_id + timestamp` pour les requêtes par serveur, et une table `timestamp + server_id` pour les fenêtres temporelles, mises à jour ensemble. Le schéma n'est pas un détail qu'on ajuste après ; c'est l'architecture.

---

## Bigtable ou Spanner : choisir en connaissance de cause

Une question de CTO revient : quand *ne pas* choisir Bigtable ? La réponse tient dans ce que Bigtable a délibérément abandonné.

Bigtable offre un schéma flexible, le multi-version natif, le modèle éparse, l'échelle du pétaoctet. Mais **pas de transactions multi-lignes** (l'atomicité s'arrête à la ligne unique), **pas de jointures SQL**, **pas d'index secondaires**. C'est parfait pour l'analytique à grande échelle, les séries temporelles (monitoring, IoT), les données de crawl web, les *feature stores* de ML, le semi-structuré.

**Spanner**, l'évolution suivante de Google, ajoute au-dessus d'un stockage à la Bigtable les **transactions ACID multi-lignes**, le **SQL complet** et une **cohérence externe globale** (via TrueTime). Le prix : un schéma rigide, une latence plus élevée (l'attente TrueTime), un coût supérieur. On le choisit quand on a *besoin* de fortes garanties : transactions financières, systèmes d'inventaire, tout ce qui exige cohérence forte et SQL.

L'arbre de décision se résume ainsi : besoin de transactions multi-lignes ou de jointures SQL → Spanner. Besoin de schéma flexible, d'échelle pétaoctet avec des accès simples, de séries temporelles → Bigtable. Spanner n'a pas remplacé Bigtable ; il a répondu aux utilisateurs qui réclamaient SQL et transactions, en gardant l'ADN de stockage de Bigtable et en y greffant les transactions distribuées.

---

## Ce que Bigtable a rendu possible

Bigtable est l'un des trois piliers de l'infrastructure de données de Google, et le trio a été copié tel quel par le monde open source :

```
GFS       : « stocker des pétaoctets de façon fiable »   (fichiers)
Bigtable  : « stocker des pétaoctets structurés »         (lignes/colonnes)
MapReduce : « traiter des pétaoctets en parallèle »       (batch)

Répliqué par Hadoop :  HDFS + HBase + MapReduce
```

**HBase** (2007) est le clone open source direct : même modèle wide-column, mêmes clés triées, les *tablets* rebaptisées *regions*, HDFS à la place de GFS, ZooKeeper à la place de Chubby. Moins optimisé (JVM contre C++), élection de master via ZooKeeper, stratégies de compaction moins raffinées — mais fidèle à l'idée.

**Cloud Bigtable** (2015) est le service managé de Google : entièrement géré, autoscaling, adossé à **Colossus** (le successeur de GFS) pour de meilleures performances, latence ~6 ms en P99 en lecture, API compatible HBase, SLA 99,9 %. Les exercices de dimensionnement le rendent évident — un déploiement IoT réaliste (un million de capteurs, dix relevés/s) réclame vite des centaines de tablet servers et des dizaines de pétaoctets ; opérer cela à la main est un métier, d'où l'existence même du service managé.

**Cassandra** (Facebook) marie le **modèle de données de Bigtable** (wide-column, memtable + SSTable) à la **distribution de Dynamo** (hachage cohérent, cohérence ajustable, *aucun* master unique). Le meilleur des deux mondes pour les séries temporelles et l'événementiel.

**RocksDB** (Meta) et **LevelDB** (Google, écrit par Ghemawat et Dean, les auteurs mêmes de GFS et MapReduce) sont les descendants directs du moteur LSM. LevelDB est l'implémentation minimale et lisible — celle qui fait tourner IndexedDB dans Chrome. RocksDB en est la version industrielle, moteur de stockage de MyRocks, TiKV, CockroachDB. La lignée LSM lancée par Bigtable irrigue aujourd'hui une part énorme des bases modernes.

---

## À retenir

1. **Le modèle de données commande tout.** `(row, column, timestamp) → value`, éparse, triée, multi-version : quatre propriétés simples qui donnent la flexibilité de schéma, le zéro-gâchis, le voyage dans le temps gratuit et — via l'ordre des clés — le contrôle de la localité dans vos mains.

2. **Le LSM-tree échange écriture contre lecture.** En transformant les écritures aléatoires en écritures séquentielles (commit log + memtable + SSTables immuables), on obtient un débit d'écriture massif. La contrepartie : lire doit fusionner plusieurs sources, et la compaction en arrière-plan est une taxe permanente (amplification d'écriture, contention I/O).

3. **Bloom filters, locality groups et tables en mémoire rachètent la lecture.** Ce sont les trois réponses au déséquilibre du LSM : sauter les SSTables sans la clé, ne balayer que les familles voulues, servir le chaud depuis la RAM.

4. **Le design de la clé de ligne est de l'architecture.** L'ordre des clés est la localité physique ; les clés séquentielles créent des hotspots. URL inversées, salting, timestamps inversés, doubles tables — le schéma se conçoit avant, pas après.

5. **Séparation des rôles.** Master pour la métadonnée (hors chemin critique), tablet servers pour la donnée, GFS pour la persistance, Chubby pour la coordination. Chaque composant fait une chose, bien — ce qui permet un master unique sans goulot.

6. **Bâtir sur de l'éprouvé plutôt que réinventer.** Bigtable dépend de GFS et de Chubby et l'assume : réimplémenter un service de verrous en interne aurait coûté plus de complexité et moins de fiabilité qu'un composant dédié. Le ~0,005 % d'indisponibilité de Chubby est un prix accepté lucidement.

7. **Bigtable a fondé le wide-column NoSQL.** Il a prouvé qu'un stockage structuré n'a pas besoin d'être relationnel pour être puissant — et sa lignée (HBase, Cassandra, RocksDB, Cloud Bigtable, Spanner) le montre encore.

---

## Pour aller plus loin

- **Bigtable: A Distributed Storage System for Structured Data** — Chang, Dean et al., OSDI 2006. L'article fondateur, celui qui a créé la catégorie. [research.google.com/archive/bigtable-osdi06.pdf](https://research.google.com/archive/bigtable-osdi06.pdf)
- **The Chubby Lock Service for Loosely-Coupled Distributed Systems** — Burrows, OSDI 2006. Le service de verrous dont Bigtable dépend ; ZooKeeper en est l'équivalent open source.
- **The Log-Structured Merge-Tree (LSM-tree)** — O'Neil et al., 1996. La structure de données au cœur de Bigtable, Cassandra et RocksDB.
- **LevelDB** — Ghemawat & Dean. Implémentation LSM minimale et limpide, idéale pour apprendre : [github.com/google/leveldb](https://github.com/google/leveldb).
- **Designing Data-Intensive Applications** — Kleppmann, chapitre 3 (« Storage and Retrieval »). Le meilleur exposé pédagogique du duel B-tree contre LSM-tree, avec amplification d'écriture, de lecture et d'espace.
- **Spanner: Google's Globally-Distributed Database** — Corbett et al., OSDI 2012. La suite : SQL et transactions ACID au-dessus d'un stockage à la Bigtable.
