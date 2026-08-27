# Google File System : concevoir pour la panne

En 2003, trois ingénieurs de Google — Ghemawat, Gobioff et Leung — publient un article qui décrit le système de fichiers sur lequel tourne déjà, en production, l'essentiel de l'infrastructure de la société. Ce document est devenu l'un des textes fondateurs du cloud moderne. Non parce qu'il introduit une idée mathématiquement profonde, mais parce qu'il inverse un postulat que toute l'industrie tenait pour acquis. Ce chapitre explique cette inversion, puis reconstruit patiemment l'architecture qui en découle. L'objectif n'est pas que vous reteniez des chiffres, mais que chaque décision de design vous paraisse, à la fin, presque inévitable.

---

## 1. Le problème : quand la panne devient la règle

Commençons par la situation concrète de Google au début des années 2000. L'entreprise veut indexer le web entier. Cela signifie stocker et parcourir des téraoctets — bientôt des pétaoctets — de données. Deux chemins existent.

Le premier, classique, consiste à acheter quelques très grosses machines fiables : du matériel d'entreprise, redondant, cher, conçu pour ne (presque) jamais tomber. Le second consiste à acheter des **milliers de machines bon marché** (du *commodity hardware* : des PC ordinaires, avec des disques ordinaires qui meurent). Google choisit le second, pour une raison économique simple : à budget égal, on obtient bien plus de capacité et de débit total.

Mais ce choix a une conséquence qu'il faut regarder en face. Prenez une machine dont le disque a une probabilité de tomber en panne de, disons, 4 % sur une année. C'est un excellent disque. Isolé, il vous inquiète à peine. Maintenant mettez-en **dix mille côte à côte**. La question n'est plus « est-ce qu'un disque va tomber cette année ? » mais « combien vont tomber *aujourd'hui* ? ». Statistiquement, à tout instant, il y a presque toujours une machine morte, une mémoire qui se corrompt, un câble réseau qui lâche quelque part dans le cluster.

C'est l'invariant central de GFS, la phrase à retenir de tout l'article :

> **« Component failures are the norm rather than the exception. »**
> Les pannes de composants sont la norme, pas l'exception.

L'ancienne mentalité optimisait pour le cas normal — le système fonctionne, les pannes sont des accidents rares qu'on traite à part. La mentalité GFS pose l'inverse : **le système fonctionne en permanence en mode dégradé**, et un fonctionnement « sans aucune panne en cours » est le cas exceptionnel qu'on ne verra jamais. On ne cherche pas à empêcher les pannes — c'est impossible à cette échelle — on cherche à ce qu'elles n'aient aucune importance. La détection d'erreur, la tolérance aux fautes et la récupération automatique ne sont pas des fonctionnalités ajoutées après coup : elles sont le point de départ du design.

Gardez ce renversement en tête. Chaque décision étrange de GFS — chunks énormes, cohérence relâchée, un seul serveur maître — est une réponse rationnelle à ce postulat. Une fois qu'on l'accepte, le reste se déduit.

Un dernier élément de contexte, tout aussi structurant : **la charge de travail de Google**. Les fichiers sont gros (des centaines de Mo, souvent des Go et plus). On les lit surtout de façon **séquentielle** (on balaie un gros dataset du début à la fin) et on les modifie surtout en **ajoutant à la fin** (*append*), rarement en réécrivant au milieu. Beaucoup de processus écrivent en même temps dans le même fichier — pensez à mille machines qui déversent leurs logs dans un journal commun. Et, de façon écrasante, **on lit bien plus qu'on n'écrit** : « écris une fois, lis mille fois ». GFS n'est pas un système de fichiers généraliste. C'est un système taillé pour *cette* charge, et il assume ce choix.

---

## 2. Le modèle mental : maître, chunkservers, chunks

Avant les détails, installons l'image d'ensemble. Elle tient en trois acteurs.

Imaginez une **immense bibliothèque** répartie sur des centaines d'entrepôts. Les livres (les données) sont physiquement rangés dans les entrepôts. Mais il y a un seul **bureau du catalogue** qui sait, pour chaque ouvrage, dans quels entrepôts se trouvent ses exemplaires. Un lecteur ne demande jamais un livre *au* bureau du catalogue : il lui demande *où* le trouver, puis va chercher le livre directement à l'entrepôt. Le bureau ne manipule que des fiches ; les entrepôts manipulent la matière.

Traduisons :

- Un fichier GFS est découpé en morceaux de taille fixe appelés **chunks** (64 Mo chacun — on y reviendra longuement). Chaque chunk reçoit à sa création un identifiant unique et immuable de 64 bits, le **chunk handle**.
- Les **chunkservers** sont les centaines de machines qui stockent physiquement les chunks, sous forme de simples fichiers Linux sur leurs disques locaux. Chaque chunk est répliqué (par défaut **3 fois**) sur des chunkservers différents.
- Le **master** est l'unique serveur qui détient toutes les **métadonnées** : l'arborescence des fichiers, la correspondance fichier → liste de chunks, et la localisation des réplicas de chaque chunk. Il ne stocke aucune donnée utilisateur.

Voici la vue à 10 000 mètres. Suivez les numéros ① ② ③ : ils racontent le déroulé d'un accès.

```
┌──────────────────────────────────────────────────────────────┐
│                    CLIENTS (applications)                     │
│      MapReduce, BigTable, indexeur, analytics, ...           │
└───────────┬──────────────────────────────────────────────────┘
            │  ① « quel chunk ? sur quels serveurs ? »  (MÉTADONNÉES)
            ▼
┌──────────────────────────────────────────────────────────────┐
│                    MASTER  (un seul)                          │
│   • namespace (arborescence des fichiers)                    │
│   • fichier → liste de chunks                                │
│   • chunk → localisation des réplicas                        │
│   • gestion des leases, garbage collection, rééquilibrage    │
│                                                              │
│   État entièrement EN MÉMOIRE (48 Mo pour 735k fichiers)     │
│   Journalisé et répliqué sur disque (Operation Log)          │
└───────────┬──────────────────────────────────────────────────┘
            │  ② renvoie les localisations
            ▼
    Le client MET EN CACHE ces localisations (soulage le master)
            │
            │  ③ échange DIRECT des DONNÉES, master hors du chemin
            ▼
┌──────────────────────────────────────────────────────────────┐
│              CHUNKSERVERS (des centaines/milliers)           │
│                                                              │
│  ChunkServer 1     ChunkServer 2    ...    ChunkServer N     │
│  ┌───────────┐    ┌───────────┐           ┌───────────┐     │
│  │ Chunk A   │    │ Chunk A   │           │ Chunk C   │     │
│  │ Chunk B   │    │ Chunk B   │           │ Chunk D   │     │
│  │ Chunk C   │    │ Chunk D   │           │ Chunk A   │     │
│  └───────────┘    └───────────┘           └───────────┘     │
│                                                              │
│  Chunks de 64 Mo, répliqués 3× par défaut                   │
│  Stockés comme de simples fichiers Linux                    │
└──────────────────────────────────────────────────────────────┘
```

Retenez surtout une chose de ce schéma, car c'est le pivot de tout le design : **le master n'est jamais sur le chemin des données**. Il répond à une question de localisation, puis s'efface. Les octets circulent en flux direct entre le client et les chunkservers. Nous allons voir que c'est précisément ce qui permet à un système avec *un seul* master de tenir à l'échelle planétaire.

---

## 3. Pourquoi des chunks de 64 Mo ?

La première décision qui surprend, c'est la taille des chunks. Un système de fichiers classique manipule des blocs de 4 Ko. GFS choisit **64 Mo** — soit **16 000 fois plus gros**. Ce n'est pas un détail de réglage, c'est un choix structurant. Comprenons pourquoi.

### L'intuition

Reprenons la bibliothèque. Si vous rangez chaque livre en le déchirant en fiches de 4 Ko, votre catalogue explose : il faut une entrée par fiche, et un lecteur qui veut lire un ouvrage entier doit demander des milliers de localisations. Si au contraire vous rangez les livres par gros volumes reliés, le catalogue reste maigre et une poignée de demandes suffit. Le gros chunk, c'est le gros volume relié : il déplace le coût du côté qui peut l'absorber.

### Le détail technique — trois gains

**Moins d'interactions avec le master.** C'est le gain principal, et il découle directement du fait que le master doit rester léger. Prenez la lecture séquentielle d'un fichier de 1 Go :

```
Fichier 1 Go, lecture séquentielle :
  blocs de 4 Ko  →  1 Go / 4 Ko  = 262 144 demandes de localisation
  chunks de 64 Mo →  1 Go / 64 Mo =      16 demandes de localisation
```

On passe de deux cent mille interrogations à seize. Comme le client met en cache la localisation d'un chunk et l'exploite pour toutes les lectures qui tombent dedans, un gros chunk signifie qu'une seule réponse du master couvre 64 Mo d'accès.

**Moins d'overhead réseau.** Sur un chunk de 64 Mo, le client garde une **connexion TCP persistante** au chunkserver et enchaîne les opérations dessus. Le coût d'établissement de la connexion, les en-têtes, les allers-retours : tout cela s'amortit sur une grande quantité de données au lieu d'être payé à chaque petit bloc.

**Moins de métadonnées à garder en mémoire.** Le master conserve *tout* son état en RAM (nous verrons pourquoi c'est vital pour sa vitesse). La quantité de métadonnées est donc un plafond dur. Faisons le calcul pour 1 Po (un million de Go) :

```
1 Po avec des chunks de 64 Mo :
  → 16 millions de chunks
  → ~64 octets de métadonnées par chunk
  → ~1 Go de RAM au master.   Parfaitement tenable.

Le même Po avec des blocs de 4 Ko demanderait des centaines de To
de métadonnées : impossible à garder en mémoire.
```

C'est ce calcul qui rend viable l'idée, à première vue folle, d'un maître unique qui garde tout en tête.

### Le coût : les hot spots

Aucun choix n'est gratuit, et GFS l'assume. Le revers du gros chunk apparaît sur les **petits fichiers**. Un fichier qui tient dans un seul chunk n'existe que sur 3 chunkservers. Si ce fichier devient soudain très demandé — typiquement un exécutable qu'un batch lance simultanément sur des centaines de machines — ces 3 serveurs deviennent des **points chauds** (*hot spots*) saturés, pendant que le reste du cluster reste oisif. La parade de Google fut pragmatique : augmenter le facteur de réplication pour ces fichiers-là, et **décaler dans le temps** (*stagger*) les démarrages des clients pour lisser la ruée. Le vrai enseignement est ailleurs : GFS est optimisé pour les gros fichiers, et les petits fichiers sont un anti-pattern qu'on gère en les regroupant plutôt qu'en les multipliant.

---

## 4. Un seul master : le pari, et pourquoi ce n'est pas le SPOF que vous craignez

Voici la décision la plus controversée, celle qui fait tiquer tout ingénieur ayant des réflexes systèmes : **un seul master pour tout le cluster**. L'instinct crie *single point of failure* — un point unique dont la panne fait tout tomber. Cet instinct n'est pas idiot ; il est simplement incomplet. Prenons le temps de le dépasser, car c'est ici que se joue la beauté du design.

### Pourquoi un seul, d'abord ?

Parce qu'un master unique **simplifie énormément le système**. Il a une vue globale et cohérente de tout : il peut donc prendre des décisions de placement et de réplication intelligentes avec une information complète, sans avoir à se coordonner avec des pairs. Coordonner plusieurs masters demanderait un protocole de consensus distribué (Paxos, Raft) — puissant, mais complexe, difficile à déboguer, et coûteux en latence. GFS fait le pari inverse : on garde un design simple et compréhensible, et on paie ce choix ailleurs, de façon maîtrisée.

### Pourquoi ce n'est pas un goulot d'étranglement

L'objection naturelle : « un seul serveur pour tout le cluster, il va s'effondrer sous la charge. » Il ne s'effondre pas, pour deux raisons qui se combinent.

D'abord, ses opérations sont **ultra-rapides**, parce que **toutes les métadonnées tiennent en mémoire**. Répondre à « où est le chunk n° 7 ? » se fait en moins d'une milliseconde, sans toucher un disque.

Ensuite et surtout, le master **ne voit jamais passer les données**. Relisez le schéma de la section 2 : le client demande une localisation (petit message de métadonnées), la met en cache, puis échange les octets **directement** avec les chunkservers. Le master est sur le chemin froid (rare, léger), jamais sur le chemin chaud (les téraoctets qui circulent). En production, sur un cluster réel de 342 chunkservers, le master traitait de l'ordre de **200 à 500 opérations par seconde** — très en dessous de sa capacité de plusieurs milliers d'ops/s. Il était **largement sous-utilisé**. Le fantasme du goulot d'étranglement ne se matérialise pas, parce que le design a soigneusement retiré le master de la boucle coûteuse.

Le client, d'ailleurs, aide activement : quand il demande une localisation, il en profite souvent pour récupérer celles des chunks voisins d'un coup, et il conserve tout en cache pendant une durée limitée. Le master est donc sollicité le moins possible.

### Pourquoi ce n'est pas un SPOF

Reste la peur légitime : et si le master meurt ? Trois mécanismes transforment ce « point unique » en « point unique **résilient** ».

**L'état est persistant et répliqué.** Toute modification de métadonnée est d'abord écrite dans un journal, l'*Operation Log*, lui-même répliqué sur plusieurs machines (nous le détaillons en section 8). Un master qui redémarre reconstruit son état exact en rejouant ce journal, en **quelques secondes** grâce au checkpointing.

**Des shadow masters** — des réplicas en lecture seule — continuent de servir les requêtes de lecture même quand le master principal est indisponible. Ils accusent un léger retard sur l'état, mais suffisent à maintenir la disponibilité.

**Et le point décisif** : parce que le master est hors du chemin des données, une panne du master de, disons, 60 secondes **ne bloque pas** les lectures et écritures en cours. Un client qui possède déjà un *lease* valide (section 6) et les localisations en cache continue de travailler normalement avec les chunkservers. Seules les opérations qui *ont besoin* du master — créer un nouveau fichier, obtenir un nouveau lease — sont mises en attente le temps de la reprise. La disponibilité des données ne dépend donc pas de la disponibilité instantanée du master.

Autrement dit : le master est un *single point*, mais pas un *single point of failure*, car sa défaillance temporaire dégrade le système au lieu de l'arrêter. En production, son temps d'indisponibilité restait sous 0,01 %, sans perte de données observée. Le mot juste pour ce choix n'est pas « risqué » mais **assumé** : GFS accepte une brève fenêtre de latence sur les opérations de contrôle en échange d'une simplicité de conception radicale.

---

## 5. Écrire sur trois réplicas sans passer par le master

Nous savons lire. Écrire est plus délicat, parce qu'il faut modifier **les trois réplicas** d'un chunk et qu'elles doivent rester cohérentes entre elles — le tout sans faire du master un chef d'orchestre qui verrait passer chaque octet. Comment coordonner trois copies sans coordinateur central sur le chemin des données ?

La réponse de GFS repose sur deux idées qu'il faut bien distinguer : **découpler le flux de données du flux de contrôle**, et **déléguer l'ordonnancement à un réplica primaire**.

### D'abord pousser les données, ensuite décider de l'ordre

L'idée maligne est de séparer *transporter les octets* de *décider quand et dans quel ordre les appliquer*.

**Phase 1 — pousser les données (flux de données).** Le client envoie les octets à écrire aux trois réplicas, mais **pas** en parallèle depuis lui-même. Il les envoie au réplica le plus proche, qui les **relaie** au suivant pendant qu'il les reçoit encore, lequel relaie au troisième. C'est un **pipeline** :

```
Client ──▶ ChunkServer A ──▶ ChunkServer B ──▶ ChunkServer C
           (dès que A reçoit les premiers octets,
            il les fait suivre à B sans attendre la fin ;
            B fait de même vers C)
```

À ce stade, les données ne sont qu'en tampon dans les chunkservers ; rien n'est encore « écrit » dans le chunk. L'intérêt du pipeline est que la latence totale tend vers *le maximum* des latences de chaque saut, et non vers *leur somme* : on utilise pleinement la bande passante de chaque lien, et on exploite la topologie réseau (chaque machine transmet à la plus proche non encore servie).

**Phase 2 — appliquer, dans un ordre décidé par le primaire (flux de contrôle).** Parmi les trois réplicas, l'un détient le **lease** : c'est le **primaire** (voir section 6). Les octets une fois en tampon partout, le client envoie une requête d'écriture au primaire. Le primaire fait alors le travail d'ordonnancement :

```
1. Client → PRIMAIRE : « applique l'écriture »
2. Le PRIMAIRE attribue un numéro de série (un ordre total des mutations)
   et applique l'écriture localement dans cet ordre
3. PRIMAIRE → SECONDAIRES : « applique, numéro de série = 42 »
4. Les SECONDAIRES appliquent dans le même ordre imposé par le numéro
5. SECONDAIRES → PRIMAIRE : « fait »
6. PRIMAIRE → Client : « succès »   (ou erreur si un secondaire a échoué)
```

Le **numéro de série** est la clé de la cohérence : c'est lui qui garantit que, si plusieurs écritures concurrentes arrivent, **toutes les réplicas les appliquent dans exactement le même ordre**. Le master n'a rien eu à arbitrer ; c'est le primaire, un simple chunkserver, qui joue ce rôle localement pour son chunk.

### Ce que cela garantit, et ce que cela coûte

En cas de succès, les trois réplicas sont identiques. En cas d'échec partiel — un secondaire qui plante en pleine opération — le primaire renvoie une **erreur** au client, qui **réessaie**. La donnée n'est jamais perdue, mais le retry peut laisser des traces : une écriture qui traverse la frontière entre deux chunks, ou qui se répète après erreur, peut produire des régions dupliquées ou incohérentes entre réplicas. C'est le prix à payer pour ne pas avoir mis un coordinateur lourd sur le chemin des écritures — et ce prix nous amène directement à deux sujets liés : le *record append* et le modèle de cohérence.

---

## 6. Les leases : élire un primaire sans conflit

Reculons d'un pas pour comprendre d'où vient ce « primaire ». Trois chunkservers détiennent le même chunk. Si chacun acceptait des écritures dans son coin, les réplicas divergeraient aussitôt. Il faut donc un chef *par chunk* — mais un chef qu'on puisse remplacer proprement si sa machine meurt, sans jamais se retrouver avec deux chefs en même temps (le redouté *split-brain*).

Le mécanisme est le **lease** (bail). Le master accorde un lease sur un chunk à l'un de ses réplicas, qui devient **primaire** pour ce chunk. Le lease a une durée limitée : **60 secondes** par défaut.

```
1. Le master accorde un lease sur le chunk X au ChunkServer A (60 s)
2. A devient PRIMAIRE pour X : toutes les écritures passent par lui,
   qui leur donne leur ordre (les numéros de série de la section 5)
3. Avant l'expiration (vers 55 s), si A est toujours actif et sollicité :
   A demande une prolongation, le master l'accorde (+60 s).
   Cet échange passe par les messages HeartBeat déjà existants,
   donc sans RPC supplémentaire.
4. Si A plante ou devient injoignable :
   le master ATTEND que le lease expire (60 s max),
   PUIS il accorde un nouveau lease à un autre réplica.
```

L'élégance tient dans le rôle du **délai d'expiration**. Le master n'a pas besoin de « tuer » proprement l'ancien primaire, ni même de savoir s'il est réellement mort ou juste temporairement injoignable — cas impossible à distinguer avec certitude sur un réseau. Il lui suffit d'**attendre**. Tant que le lease de A n'a pas expiré, le master s'interdit d'en donner un autre ; une fois le délai passé, il est certain que A ne se considère plus comme primaire. À aucun instant il n'existe deux primaires pour le même chunk. Le temps, ici, remplace un protocole de coordination complexe.

Ce mécanisme sert aussi de levier de contrôle : le master peut **révoquer** un lease quand il a besoin de figer un chunk — par exemple juste avant un snapshot, comme nous allons le voir.

---

## 7. Record append et le modèle de cohérence

Nous arrivons à ce qui rend GFS singulier, et à ce qui déroute le plus les ingénieurs venus des systèmes de fichiers classiques. Deux sujets indissociables : l'opération d'ajout atomique, et le contrat de cohérence relâché qu'elle suppose.

### Le besoin réel : mille producteurs, un fichier

Rappelez-vous la charge de travail : des centaines de clients veulent **ajouter** au même fichier simultanément — mille serveurs qui écrivent dans un journal commun, une file producteur-consommateur, la sortie fusionnée d'un job MapReduce. Avec une écriture classique à position imposée, deux clients qui visent tous deux l'offset 1000 entrent en collision. Les faire coexister demanderait un verrouillage distribué : chacun réserve une plage, attend son tour... une usine à gaz, coûteuse et fragile.

### La solution : atomic record append

GFS propose une opération différente : `record_append(fichier, données)`. La bascule mentale à opérer est celle-ci : **ce n'est pas le client qui choisit où écrire, c'est GFS.** Le client dit « ajoute ce bloc quelque part à la fin », et GFS lui renvoie l'offset où il a effectivement été écrit. Puisque personne ne réclame une position précise, il n'y a plus de collision à arbitrer : le primaire sérialise les demandes concurrentes et les pose les unes après les autres.

Le primaire ajoute un raffinement pour garder les chunks propres :

```
1. Le client envoie les données au PRIMAIRE.
2. Le PRIMAIRE regarde si le record tient dans le chunk courant :
   • s'il tient : il l'ajoute à la fin, fixe l'offset,
     et fait répliquer aux secondaires ;
   • s'il ne tient pas (chunk presque plein) :
     il COMPLÈTE le chunk par du padding jusqu'à 64 Mo,
     répond au client « recommence sur le chunk suivant »,
     et le client réessaie automatiquement.
3. Le PRIMAIRE renvoie au client l'offset du record.
```

Le padding évite qu'un record soit coupé en deux à la frontière d'un chunk : un record vit toujours entièrement dans un seul chunk. GFS borne d'ailleurs la taille d'un record au quart d'un chunk (16 Mo) pour que ce padding reste marginal.

### Le contrat : cohérence relâchée, et pourquoi c'est acceptable

Voici le cœur du sujet, la partie qu'il ne faut surtout pas édulcorer. Que garantit GFS après une série d'appends concurrents ?

- ✅ Chaque donnée est écrite **au moins une fois**, de façon **atomique** (un record n'est jamais coupé).
- ✅ **Tous les réplicas contiennent le record**, au même offset logique.
- ❌ Les réplicas ne sont **pas identiques octet pour octet** : le padding et l'ordre peuvent différer d'une région à l'autre.
- ❌ Il peut y avoir des **duplicatas** : si un append échoue puis est réessayé, la première tentative peut avoir laissé une copie sur certains réplicas.

Pour nommer ces états, GFS introduit un petit vocabulaire précis, qu'il vaut la peine d'installer clairement :

- **Consistent (cohérent)** : tous les clients voient la même donnée, quel que soit le réplica lu.
- **Defined (défini)** : cohérent **et** les clients voient exactement ce qu'une mutation a écrit, en entier, sans mélange.
- **Undefined (indéfini)** : cohérent (tout le monde voit la même chose) mais le contenu est un mélange de plusieurs mutations, dont on ne peut pas prédire l'entrelacement.
- **Inconsistent (incohérent)** : les clients voient des données différentes selon le réplica. C'est l'état à éviter, celui qui survient après un échec.

Le tableau des résultats possibles se lit alors ainsi :

| Type de mutation | Succès en série | Succès concurrent | Échec |
|---|---|---|---|
| **Write** (position imposée) | Defined | Consistent mais Undefined | Inconsistent |
| **Record append** | Defined | Defined mais entrecoupé | Inconsistent |

Rendons « consistent but undefined » concret. Trois clients ajoutent en même temps :

```
Client A ajoute "AAAA"
Client B ajoute "BBBB"
Client C ajoute "CCCC"

Fichier obtenu (identique pour tous les lecteurs) :
[AAAA][BBBB][padding][CCCC][BBBB en double][AAAA]
       ▲
   cohérent (tout le monde lit exactement ça)
   mais l'ordre, le padding et les doublons n'étaient pas prévisibles
```

À première vue, c'est déroutant : un système de fichiers qui vous rend un fichier avec des trous et des doublons ! Mais souvenez-vous du postulat de départ. Fournir une cohérence stricte (ordre total garanti, zéro doublon, réplicas identiques au bit près) exigerait exactement la coordination lourde que GFS refuse — au prix de la disponibilité et du débit. GFS fait le choix inverse et **remonte une partie de la responsabilité vers les applications**, qui, elles, savent quoi faire de leurs propres données.

### Comment les applications s'en accommodent

Le pattern est simple et robuste, et il n'a pas changé en vingt ans. Chaque record écrit embarque deux choses : un **identifiant unique** et un **checksum**. À la lecture, l'application :

```python
for record in read_file():
    if not verify_checksum(record):
        continue          # padding ou corruption → on saute
    if record['id'] in seen_ids:
        continue          # doublon → on saute
    process(record)
```

Le checksum permet de reconnaître et d'ignorer le padding et les régions corrompues ; l'identifiant unique permet de dédupliquer. L'application obtient ainsi la sémantique exactement-une-fois dont elle a besoin, **par-dessus** un stockage qui, lui, ne promet qu'au-moins-une-fois. C'est le principe directeur de GFS : le système reste simple et rapide, et il expose ses compromis pour que chaque application choisisse le niveau de garantie qui la concerne, au lieu de payer pour la garantie la plus forte dont la plupart n'ont pas besoin.

---

## 8. Le master en interne : métadonnées et journal

Revenons au master pour regarder comment il tient sa promesse de rapidité et de résilience. Tout tourne autour de deux objets : les métadonnées en mémoire, et le journal des opérations sur disque.

### Trois types de métadonnées, tout en RAM

Le master conserve trois choses, toutes en mémoire vive :

1. **Les namespaces de fichiers et de chunks** — l'arborescence. Stockés de façon compacte (compression par préfixe des noms de fichiers), pour environ **64 octets par fichier**.
2. **La correspondance fichier → chunks** — quels chunks composent quel fichier, avec pour chaque chunk un **numéro de version** (incrémenté à chaque nouveau lease, ce qui permet de repérer les réplicas périmés).
3. **La localisation des réplicas** — sur quels chunkservers se trouve chaque chunk.

Les deux premiers sont **persistants** (journalisés). Le troisième, non — et cette asymétrie mérite qu'on s'y arrête, car elle illustre parfaitement l'état d'esprit GFS.

### Pourquoi ne pas persister la localisation des chunks ?

L'instinct dirait : « la localisation des réplicas est une information précieuse, sauvegardons-la sur disque. » GFS fait délibérément l'inverse : le master **ne stocke pas** durablement où sont les chunks. Au démarrage, et en continu via les messages **HeartBeat**, il **demande** simplement à chaque chunkserver quels chunks il détient.

La raison est profonde et découle, encore, du postulat de la panne permanente : **le chunkserver est le seul à détenir la vérité** sur ce qu'il a réellement sur ses disques. À tout instant, des chunkservers rejoignent le cluster, redémarrent, tombent, changent de disque. Vouloir maintenir sur le master une copie persistante et cohérente de cette réalité mouvante serait un cauchemar de synchronisation — et cette copie serait de toute façon fausse à la milliseconde suivante. Plutôt que de courir après la vérité, le master la **redemande à la source**. C'est plus simple, et c'est correct par construction.

### L'Operation Log : le journal sacré

Si le master perd son état, il faut pouvoir le reconstruire à l'identique. C'est le rôle de l'**Operation Log**, le seul enregistrement persistant des changements de métadonnées. Son importance est telle qu'on peut la résumer d'une phrase : **perdre le journal, c'est perdre le système de fichiers** — même si tous les chunks physiques sont intacts sur les disques, car plus rien ne dit comment ils s'assemblent en fichiers.

Deux règles gouvernent le journal.

**On journalise avant de répondre.** Toute mutation de métadonnée est écrite dans le journal — localement **et** sur plusieurs machines distantes — *avant* que le master ne réponde au client. La conséquence est forte : une opération n'est « arrivée » que si elle a survécu à l'écriture répliquée du journal. Comme cette écriture est sur le chemin critique, GFS la **regroupe par lots** (*batching*) : au lieu d'un coûteux `fsync()` par entrée, il accumule plusieurs entrées et les force sur disque en une fois.

**On checkpointe pour ne pas rejouer un journal infini.** Rejouer un journal qui grandit sans fin rendrait la reprise interminable. Périodiquement, le master écrit un **checkpoint** : un instantané compact de tout son état en mémoire, dans un format directement rechargeable (une structure en B-arbre). La reprise devient alors immédiate : charger le dernier checkpoint, puis rejouer **seulement** les quelques entrées du journal postérieures. C'est ce qui ramène le temps de redémarrage du master à quelques secondes, et c'est ce qui fait tenir la promesse de la section 4 sur sa résilience.

---

## 9. Le chunkserver en interne : stockage et détection de corruption

Côté chunkserver, la philosophie est la même : rester simple, faire confiance au système de fichiers Linux sous-jacent, et supposer que le matériel ment.

### Un chunk est un simple fichier

Un chunk n'a rien d'exotique : c'est un fichier Linux ordinaire sur un disque local.

```
/mnt/disk0/gfs/chunk_ABC123.dat   (64 Mo)
/mnt/disk0/gfs/chunk_DEF456.dat   (23 Mo — dernier chunk d'un fichier)
/mnt/disk1/gfs/chunk_GHI789.dat   (64 Mo)
```

Deux détails valent d'être notés. L'espace est **alloué paresseusement** : un chunk qui ne contient que 5 Mo occupe 5 Mo sur le disque, pas 64. Cela évite de gaspiller de l'espace en fragmentation interne, ce qui atténue au passage l'un des inconvénients des gros chunks. Et le numéro de version du chunk est stocké à côté, ce qui permet au master de repérer un réplica qui aurait manqué des mises à jour (par exemple parce que sa machine était morte pendant une écriture).

### Le checksumming : supposer que les bits mentent

Reprenons le postulat de départ, appliqué au stockage : à l'échelle de milliers de disques, la **corruption silencieuse** est inévitable. Un disque vieillit, un bit se retourne (rayon cosmique, bug matériel, secteur défaillant), et il rend une donnée fausse *sans signaler d'erreur*. Un système qui fait aveuglément confiance à ses disques finit par servir des données corrompues à ses applications sans même le savoir. GFS refuse cette confiance.

La parade est le **checksum par bloc de 64 Ko**. Chaque chunk de 64 Mo est découpé en 1024 blocs de 64 Ko, et chaque bloc possède un checksum de 32 bits, rangé dans les métadonnées du chunk — soit environ 4 Ko de checksums par chunk.

```
Chunk de 64 Mo :
  bloc 0 (64 Ko)    → checksum_0 (32 bits)
  bloc 1 (64 Ko)    → checksum_1 (32 bits)
  ...
  bloc 1023 (64 Ko) → checksum_1023 (32 bits)
```

**À chaque lecture**, le chunkserver recalcule le checksum des blocs concernés et le compare à la valeur stockée. En cas de désaccord, il ne renvoie **jamais** la donnée suspecte : il signale une erreur au client (qui ira lire un autre réplica) et **prévient le master**, qui déclenchera une re-réplication du chunk à partir d'une copie saine. Cette discipline — *fail-fast* plutôt que servir du faux — est ce qui permet à GFS de garantir qu'une corruption détectée n'atteint pas l'application.

Le calcul est optimisé pour le cas dominant, l'append : ajouter à la fin ne demande que de mettre à jour le checksum du dernier bloc partiel et d'en calculer pour les nouveaux blocs, sans relire le reste. Une réécriture au milieu, plus rare, coûte davantage (il faut relire et vérifier les blocs de bordure).

Enfin, GFS ne se contente pas d'attendre les lectures pour découvrir les corruptions. Pendant les **périodes d'inactivité**, chaque chunkserver **balaie** ses chunks en arrière-plan et vérifie leurs checksums. C'est essentiel pour les chunks rarement lus : sans ce balayage, une corruption pourrait dormir sur les trois réplicas avant qu'un client ne tombe dessus, et le système perdrait sa dernière copie saine sans avoir eu l'occasion de re-répliquer à temps.

---

## 10. Snapshot et garbage collection : deux applications du copy-on-write et de la paresse

Deux opérations du master illustrent bien la manière GFS de résoudre des problèmes coûteux par la ruse plutôt que par la force.

### Snapshot : copier 10 To en quelques millisecondes

Le besoin : dupliquer instantanément un fichier ou un répertoire — pour brancher une expérience sur un dataset, prendre un checkpoint. Copier physiquement 10 To prendrait des heures et saturerait les disques. GFS s'y prend autrement, par **copy-on-write** (copie à l'écriture).

```
Phase 1 — révoquer les leases
  Le master révoque tous les leases sur les chunks concernés.
  Plus personne ne peut écrire : l'état est figé le temps de l'opération.

Phase 2 — dupliquer les métadonnées (instantané)
  Le master crée une nouvelle entrée dans le namespace
  qui pointe vers LES MÊMES chunks que l'original.
  Coût : quelques millisecondes (on n'a touché que de la RAM).
  Les chunks voient leur compteur de références passer à 2.

Phase 3 — copier réellement, mais seulement quand on écrit
  Quand un client veut ensuite modifier un chunk C partagé (références = 2),
  le master demande au chunkserver de cloner C en C' LOCALEMENT
  (sur le même disque, sans transfert réseau),
  accorde le lease sur C', et laisse le client écrire sur C'.
  L'original C reste intact : c'est lui que « voit » le snapshot.
```

Le snapshot est donc quasi gratuit à la prise, et le coût réel de copie n'est payé **que pour les chunks effectivement modifiés après coup**, et seulement au moment où on les modifie. On ne paie que ce qu'on change.

### Garbage collection : supprimer paresseusement

La suppression suit la même philosophie de paresse assumée. L'approche naïve — quand l'utilisateur supprime un fichier, contacter immédiatement tous les chunkservers concernés pour effacer les chunks — est fragile : un chunkserver en panne ou une partition réseau fait échouer l'effacement, et il faut alors gérer des retries, des erreurs, des états incohérents. GFS refuse cette complexité.

```
Suppression logique (immédiate)
  Le master renomme simplement le fichier en un nom caché horodaté
  (par ex. /.trash/old_file.txt.<timestamp>), journalise, et rend la main.
  Le fichier est « supprimé » mais reste lisible sous ce nom caché.

Nettoyage du namespace (en arrière-plan, régulier)
  Le master balaie le namespace ; tout fichier caché depuis plus de 3 jours
  est réellement retiré, et ses chunks deviennent orphelins.

Nettoyage des chunks (en arrière-plan, via HeartBeat)
  Le master repère les chunks qu'aucun fichier ne référence plus.
  Aux prochains HeartBeats, il dit aux chunkservers :
  « supprimez ces chunks », et ceux-ci effacent les fichiers locaux.
```

Trois bénéfices tombent de cette approche. Elle est **simple et fiable** : le nettoyage n'est plus une opération synchrone qui peut échouer, mais un balayage régulier qui réessaie naturellement à chaque tour. Elle **unifie** au passage le nettoyage des chunks devenus orphelins pour d'autres raisons (un réplica créé lors d'une écriture qui a partiellement échoué, par exemple) : tout ce qui n'est plus référencé finit ramassé, sans code spécial. Et le délai de trois jours offre un **filet de sécurité** : une suppression accidentelle est récupérable pendant ce laps de temps. Le coût est ce même délai avant que l'espace ne soit rendu — atténué par une option de suppression forcée quand on a besoin de récupérer l'espace tout de suite.

---

## 11. Tolérance aux pannes : ce que ça donne en vrai

Toutes ces décisions ne valent que par leur comportement réel sous panne. Les chiffres de production de 2003 sont éloquents, et surtout ils *confirment* le raisonnement des sections précédentes.

Le master, on l'a vu, redémarre en quelques secondes grâce au checkpointing, et les shadow masters maintiennent les lectures pendant une bascule.

Côté données, la réplication à 3 fait son travail. Un chunk est placé sur des réplicas répartis sur **des racks différents**, voire des datacenters différents. Ce placement n'est pas cosmétique : il protège non seulement contre la mort d'une machine, mais contre celle d'un rack entier (une alimentation, un switch top-of-rack qui lâche) et contre la panne d'un site. Pourquoi trois et pas deux ? Avec deux réplicas, la mort de l'un vous laisse sans marge : pendant toute la re-réplication, une seconde panne signifie une perte de données. Trois réplicas tolèrent **deux pannes simultanées** et donnent le temps de reconstruire tranquillement. Au-delà, le gain de fiabilité devient marginal au regard du coût de stockage — d'où le choix de 3 comme point d'équilibre par défaut, ajustable à la hausse pour les données critiques.

La vitesse de récupération est le vrai juge de paix, car pendant une reconstruction le système est plus vulnérable. Quand un chunkserver meurt en emportant 15 000 chunks (environ 600 Go), le master orchestre la re-réplication depuis les copies survivantes en **environ 23 minutes**, à un débit de l'ordre de 440 Mo/s. La clé est que la reconstruction est **massivement parallèle** : les 15 000 chunks se recopient depuis et vers des centaines de machines à la fois, si bien que le débit agrégé est énorme. Et GFS **priorise** : quand un chunk se retrouve avec une seule copie restante (deux pannes coup sur coup), il est restauré en priorité — en quelques minutes — parce que c'est lui qui est à un cheveu de la perte définitive.

Quant à la corruption silencieuse, le taux observé était de l'ordre de 0,0006 % des lectures rencontrant une erreur de checksum — chaque cas étant automatiquement récupéré depuis un réplica sain. Le scénario catastrophe des trois réplicas simultanément corrompues reste, lui, du domaine théorique : GFS répond alors par un échec franc et clair (jamais de donnée corrompue rendue silencieusement), mais en pratique, sur une année de production, ce cas n'a pas été observé.

---

## À retenir

Si vous ne deviez garder que quelques idées de ce chapitre, prenez celles-ci — ce sont elles qui ont essaimé bien au-delà de GFS.

1. **Concevoir pour la panne, pas contre elle.** À l'échelle de milliers de machines, les pannes sont l'état normal. Le bon objectif n'est pas de les éviter mais de les rendre insignifiantes : détection, tolérance et récupération automatique font partie du design dès la première ligne.

2. **Séparer le contrôle des données.** Le master gère les métadonnées (petites, rapides, en mémoire) ; les chunkservers gèrent les données (volumineuses, en parallèle). En gardant le master **hors du chemin des octets**, GFS rend viable un maître unique et transforme un apparent SPOF en point unique résilient.

3. **Choisir la simplicité, quitte à en payer le prix ailleurs.** Un seul master, sans consensus distribué, au prix d'une brève fenêtre de latence sur les opérations de contrôle en cas de panne. Un design qu'on comprend et qu'on débogue vaut souvent mieux qu'un design parfait qu'on ne maîtrise pas.

4. **Adapter la granularité à la charge.** Des chunks de 64 Mo pour des gros fichiers lus séquentiellement : moins d'interactions master, moins d'overhead réseau, des métadonnées qui tiennent en RAM. Le revers (hot spots sur les petits fichiers) est assumé, parce que ce n'est pas la charge visée.

5. **Remonter les compromis vers les applications.** Le *record append* atomique et la cohérence relâchée (defined / undefined / inconsistent) évitent une coordination lourde. Les applications récupèrent la sémantique exactement-une-fois avec des identifiants uniques et des checksums, et ne paient que pour les garanties dont elles ont besoin.

6. **Remplacer la coordination par le temps quand c'est possible.** Le lease et son délai d'expiration évitent le split-brain sans protocole complexe : il suffit d'attendre. Le master n'a pas à distinguer « mort » de « injoignable » — deux problèmes en général indécidables.

7. **Ne jamais faire confiance au matériel.** Checksums par bloc de 64 Ko, vérifiés à chaque lecture et balayés en arrière-plan : la corruption silencieuse est traitée comme une certitude, pas comme un risque.

---

## Pour aller plus loin

GFS n'est pas resté un objet isolé ; il a fondé une lignée.

**L'article original** (Ghemawat, Gobioff, Leung, SOSP 2003) reste d'une clarté remarquable et se lit en une soirée. C'est la source à laquelle il faut revenir.

**HDFS** (Hadoop Distributed File System) en est la réimplémentation open source la plus connue, cœur de l'écosystème Hadoop. Les concepts sont les mêmes — un *NameNode* pour les métadonnées, des *DataNodes* pour les blocs — avec quelques choix différents : blocs de 128 Mo, réplication par flux TCP plutôt qu'en pipeline, et une fédération de NameNodes pour repousser le plafond du maître unique. Si vous voulez lire du vrai code, c'est là qu'il faut aller.

**Colossus**, le successeur de GFS chez Google (sans article public), répond précisément aux limites que ce chapitre a nommées. La plus structurante : le master unique finit par plafonner. Colossus **distribue les métadonnées** (elles sont elles-mêmes stockées dans BigTable, qui tourne sur Colossus — une jolie récursion) au lieu de tout garder sur une seule machine, gère automatiquement le cluster, supporte mieux les petits fichiers, et remplace souvent la réplication 3× par de l'**erasure coding**, plus économe en stockage. La transition de GFS vers Colossus a pris plus de cinq ans : la leçon de management y est aussi importante que la leçon technique. On prouve un concept avec un design simple, on le met en production, on apprend de la réalité, et on prépare la migration vers l'architecture suivante — sans exiger la perfection dès le premier jour.

Enfin, GFS a fait des petits directs : **MapReduce** et **BigTable** sont construits par-dessus lui et exploitent exactement ses propriétés (gros fichiers, append, lectures séquentielles massives). Les lire ensuite est la suite naturelle, et l'on y retrouvera, réutilisés, tous les compromis exposés ici. Plus largement, tout le stockage objet du cloud d'aujourd'hui — S3, Google Cloud Storage, Azure Blob — descend de cette même intuition : des milliers de machines ordinaires, la panne comme norme, et le refus obstiné de la faire porter à l'utilisateur.
