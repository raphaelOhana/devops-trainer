# Le Log : l'abstraction qui unifie tout

*D'après « The Log: What every software engineer should know about real-time data's unifying abstraction », Jay Kreps, 2013.*

Il existe une poignée d'idées en informatique qui, une fois comprises, réorganisent tout ce que vous saviez déjà. Vous ne voyez pas une nouvelle brique : vous voyez soudain que dix briques que vous croyiez distinctes étaient la même, vue sous des angles différents. Le **log** est l'une de ces idées.

Ce chapitre est le pivot du dossier. Les autres textes vous ont présenté GFS, Bigtable, Kafka, Spanner, Paxos comme des systèmes séparés, chacun avec ses astuces. Jay Kreps, l'un des créateurs de Kafka chez LinkedIn, affirme quelque chose de plus fort : ce sont tous des manifestations d'une seule structure de données. Sa phrase d'ouverture donne le ton :

> « Vous ne pouvez pas vraiment comprendre les bases de données, les stores NoSQL, Paxos, Hadoop, le contrôle de version, ou presque n'importe quel système logiciel, sans comprendre les logs. »

L'objet dont il parle est d'une simplicité déconcertante. C'est le genre d'objet qu'on regarde en se disant « et alors ? ». Puis on réalise qu'il est partout, et qu'il n'y est pas par hasard.

---

## L'objet, dans toute sa banalité

Un **log** est une **séquence d'enregistrements, ajoutés uniquement à la fin, et totalement ordonnés dans le temps**. C'est tout. Trois propriétés, pas une de plus.

```
Offset :    0          1        2          3          4
   ─────────────────────────────────────────────────────►
Record :  [Put A=1]  [Del B]  [Put C=5]  [Put A=7]  [ ... ]

          lecture : gauche → droite (du plus ancien au plus récent)
          écriture : append à droite, toujours
```

Détaillons ces trois propriétés, parce que chacune porte une conséquence lourde.

**Append-only.** On n'écrit qu'à la fin. On ne modifie jamais une entrée existante, on ne l'insère jamais au milieu. Un fait, une fois consigné, est immuable. Cette contrainte, qui semble limitante, est en réalité la source de tout le pouvoir de la structure : elle transforme le log en un enregistrement fidèle de l'histoire, et non en un état mutable dont on aurait perdu la trace.

**Totalement ordonné.** Chaque entrée reçoit un numéro séquentiel unique et croissant : son **offset**. L'offset 42 vient après le 41 et avant le 43, sans ambiguïté, pour tout le monde. Ce numéro n'est pas décoratif — nous verrons qu'il joue le rôle d'une **horloge logique**, bien plus fiable que l'heure murale de n'importe quelle machine.

**Ordonné par le temps.** L'ordre dans le log *est* le temps. Pas le temps physique (les nanosecondes d'une horloge quartz), mais le temps logique : « ce qui est arrivé avant » signifie littéralement « ce qui a un offset plus petit ». C'est une définition du temps interne au système, et donc indépendante des dérives d'horloge entre machines.

### Ne pas confondre avec les logs applicatifs

Le mot « log » traîne un malentendu. Quand un développeur écrit :

```python
logger.info("User 123 logged in at 2024-01-15 14:32:11")
```

il produit un **log applicatif** : du texte non structuré, destiné à un humain qui débogue, sans garantie d'ordre strict, souvent transitoire (on peut le perdre sans drame).

Le log dont parle Kreps est un tout autre objet — un **log de données** :

```python
log.append(LogEntry(
    offset=42,
    key="user:123",
    value=b"{'action': 'login', 'ts': 1705328331}",
))
```

Ici tout est structuré, binaire, destiné à des machines. La séquence est strictement garantie (l'append est atomique), l'entrée est durable (persistée sur disque, répliquée), et surtout **rejouable** : on peut relire à partir de n'importe quel offset. Kreps résume : *« les logs applicatifs sont une forme dégénérée du concept de log »*. Même famille, mais l'un est un journal de bord jetable, l'autre une source de vérité.

---

## Pourquoi il ressurgit partout

Voici le fait troublant : cette structure apparaît indépendamment dans des systèmes qui n'ont rien à voir les uns avec les autres, conçus par des équipes différentes, pour des besoins différents. Ce n'est pas une mode. C'est une convergence — le signe qu'on touche à quelque chose de fondamental.

### D'abord dans les bases de données

Historiquement, le log naît dans les bases de données sous le nom de **Write-Ahead Log** (WAL), avec une règle en trois mots : *log before you apply* — écris ce que tu vas faire avant de le faire.

Suivons une transaction dans PostgreSQL :

```
1. BEGIN
2. WAL : « Début T42 »
3. WAL : « T42 : row id=5, balance 1000 → 900 »
4. WAL : « T42 : row id=7, balance 2000 → 2100 »
5. Appliquer aux pages en mémoire
6. WAL : « Commit T42 »
7. fsync du WAL sur disque   ← c'est maintenant committé
```

Le point crucial est à l'étape 7. La transaction est considérée comme validée **quand le log est sur le disque**, pas quand les pages de données le sont. Pourquoi cette inversion ? Parce que si la machine crashe juste après, il suffit de **rejouer le WAL** depuis le dernier point de contrôle pour reconstruire un état cohérent. Le log *est* la vérité ; les pages de données ne sont qu'une matérialisation qu'on peut toujours reconstruire.

Gardez cette phrase en tête, car c'est exactement le mécanisme du commit log de Bigtable (son memtable en mémoire + son commit log durable). Et c'est exactement ce qu'est Kafka, à un détail près : un WAL, mais **distribué et partagé** entre plusieurs systèmes au lieu d'être privé à une seule base.

### Le même objet, dix noms

| Système | Le log s'y appelle… | Son rôle |
|---|---|---|
| GFS | Commit log | Durabilité des mutations du namespace |
| Bigtable | WAL (commit log) | Durabilité des mutations d'une tablet |
| Kafka | Topic | Log partagé entre microservices |
| MySQL | Binlog | Réplication entre serveurs |
| PostgreSQL | WAL | Réplication + restauration à un instant T |
| Paxos / Raft | Replicated log | Consensus distribué sur l'ordre |
| Git | Historique de commits | Log versionné des changements de code |
| Spanner | Paxos log | Cohérence externe globale |
| etcd (Kubernetes) | Raft log | État complet du cluster |

Neuf systèmes, une seule structure. La question n'est plus « pourquoi le log apparaît-il ici ? » mais « pourquoi apparaît-il *partout* ? ». La réponse tient dans l'idée suivante.

---

## L'idée centrale : la réplication est la distribution d'un log

Voici le théorème qui explique l'omniprésence du log. On l'appelle la **réplication par machine à états** (*state machine replication*), et il s'énonce simplement :

> Si deux processus **identiques** et **déterministes** partent du **même état** et reçoivent les **mêmes entrées dans le même ordre**, alors ils produisent la même sortie et terminent dans le même état.

Lisez-le deux fois, car chaque mot est une condition. *Déterministes* : pas d'aléa, pas d'horloge lue en douce, pas d'appel réseau au résultat variable. *Mêmes entrées, même ordre* : c'est précisément ce qu'un log garantit.

La conséquence est spectaculaire. **Répliquer un système, c'est distribuer son log.** Vous n'avez pas besoin de copier l'état ; il suffit de faire consommer le même log, dans le même ordre, à chaque réplica :

```
Réplica A : [input1, input2, input3]  →  État A
Réplica B : [input1, input2, input3]  →  État B

Même ordre du log  ⇒  État A = État B   (garanti)
```

C'est une analogie déterministe avec le jeu d'échecs : donnez à deux joueurs parfaitement obéissants la même liste de coups dans le même ordre, et ils reconstruisent le même échiquier, sans jamais avoir à se transmettre une photo du plateau. Le log, c'est la liste de coups.

### Deux façons de remplir le log

Il y a deux stratégies pour décider *ce qu'on écrit* dans le log, et le choix a des conséquences concrètes.

Le **logging physique** consigne les *résultats* — l'état après application. Un service arithmétique qui part de 0 et reçoit les opérations `+1`, `×2`, `+3` écrit dans son log les états successifs :

```
Log physique :  [1]  [2]  [5]      ← les résultats
```

Les réplicas n'ont qu'à recopier ces valeurs. C'est l'approche du modèle **primaire-secondaire** : un leader calcule, les autres appliquent le résultat. GFS et le binlog MySQL en mode *row-based* fonctionnent ainsi.

Le **logging logique** consigne les *commandes* — les opérations elles-mêmes :

```
Log logique :  [+1]  [×2]  [+3]    ← les commandes
```

Chaque réplica **rejoue** les commandes pour recalculer l'état. C'est l'approche **active-active** : tous les nœuds font le même travail. Kafka, la réplication logique de PostgreSQL et Paxos suivent cette voie.

Le compromis est net. Le log physique est robuste (pas de recalcul, donc pas de risque de divergence si le code diffère légèrement) mais volumineux et rigide. Le log logique est compact et portable (une commande décrit beaucoup de travail en peu d'octets) mais **exige un déterminisme strict** : si le rejeu d'une commande peut donner deux résultats — parce qu'il lit `NOW()`, un compteur aléatoire ou l'ordre d'un `HashMap` — les réplicas divergent silencieusement, et c'est la catastrophe.

### L'ordre est tout

Une remarque qui a l'air anodine et qui ne l'est pas : **l'ordre dans le log détermine le résultat**.

```
Log [+1, ×2]  →  (0+1)×2 = 2
Log [×2, +1]  →  (0×2)+1 = 1
```

Mêmes opérations, ordre inversé, état final différent. C'est trivial en arithmétique, mais c'est exactement pour cette raison que **Paxos et Raft existent**. Leur travail n'est pas de « stocker des données » — c'est de faire en sorte qu'un groupe de machines, dont certaines peuvent crasher ou être lentes, se mettent **d'accord sur l'ordre** des entrées du log. Une fois l'ordre acté, la réplication par machine à états fait le reste toute seule.

Voici à quoi ressemble le cœur d'un nœud Raft, dépouillé :

```python
class RaftNode:
    def __init__(self):
        self.log = []      # le log partagé
        self.state = {}    # l'état dérivé

    def append_entry(self, command):
        entry = LogEntry(command=command)
        self.log.append(entry)
        acks = self.replicate_to_followers(entry)
        if acks >= majority(self.cluster_size):   # une majorité a confirmé
            self.apply_to_state_machine(entry)     # alors seulement, on applique
            return "SUCCESS"

    def apply_to_state_machine(self, entry):
        # tous les nœuds appliquent dans le MÊME ordre → MÊME état
        if entry.command.type == "PUT":
            self.state[entry.command.key] = entry.command.value
```

Deux idées à retenir de ce squelette. D'abord, on n'applique une entrée qu'après confirmation d'une **majorité** de nœuds — c'est ce qui rend l'ordre résistant aux pannes. Ensuite, l'**état est dérivé du log**, jamais l'inverse : `self.state` n'est qu'une vue matérialisée de `self.log`. On pourrait le jeter et le reconstruire entièrement en rejouant le log.

C'est littéralement ce que font **etcd** (qui stocke tout l'état de Kubernetes), **Chubby** (la coordination chez Google) et **ZooKeeper**. Trois produits, une même phrase de description : « un log distribué avec réplication par consensus ».

---

## Le grand saut : le log comme colonne vertébrale d'une entreprise

Jusqu'ici, le log vit *à l'intérieur* d'un système : le WAL d'une base, le journal Raft d'un cluster. La contribution propre de Kreps est de le sortir de là et d'en faire l'ossature du flux de données **entre** tous les systèmes d'une entreprise. Et c'est là que l'idée devient une architecture.

### Le problème du plat de spaghettis

En 2013, LinkedIn a plus de 30 systèmes de données qui ont tous besoin de se parler : la base MySQL principale, Hadoop pour l'analytique, un moteur de recherche, un moteur de recommandation, du monitoring, des caches, des pipelines de machine learning… Chacun veut les données des autres.

L'approche naïve consiste à câbler chaque source à chaque destination avec un pipeline sur mesure :

```
MySQL   → Hadoop  : ETL maison
MySQL   → Search  : indexeur maison
MySQL   → Reco    : feed maison
Events  → Hadoop  : shipper maison
Events  → Monito  : agrégateur maison
   ...
```

Faites le calcul. Avec **N** sources et **M** destinations, vous tendez vers **N × M** pipelines. À LinkedIn, ordre de grandeur : 30 × 30 ≈ **900 tuyaux sur mesure**. Et le pire n'est pas le nombre initial, c'est la maintenance : un simple changement de schéma dans MySQL oblige à mettre à jour les dizaines de pipelines qui en dépendent. Le système se fige. Ajouter un nouveau consommateur devient un projet de plusieurs semaines.

### La solution : intercaler un log

L'idée est d'une élégance mathématique. Au lieu de connecter tout le monde à tout le monde, on intercale **un log central** (Kafka, en l'occurrence). Chaque source publie ses changements dans un topic ; chaque destination s'abonne aux topics qui l'intéressent :

```
MySQL (changements)  →  topic "mysql-changes"
User events          →  topic "user-events"

topic "mysql-changes"  →  Hadoop
                       →  Elasticsearch
                       →  moteur de reco
```

Le nombre de connexions s'effondre de **N × M** à **N + M**. À LinkedIn : de ~900 à ~60. Le changement n'est pas quantitatif, il est topologique — on est passé d'un graphe complet à une étoile.

Les bénéfices en cascade sont plus importants que le simple décompte :

- **Un changement de schéma** ne touche plus qu'**un seul producteur**, pas trente pipelines.
- **Un nouveau consommateur** n'a qu'à s'abonner à un topic existant. Le délai passe de semaines à heures, parce qu'il n'y a rien à construire : la donnée est déjà là, il suffit de la lire.
- Le producteur **ignore** qui le consomme. Il publie dans le vide ; qui écoute, combien écoutent, à quelle vitesse — cela ne le regarde pas. C'est le **découplage** poussé à sa forme la plus pure.

C'est le problème d'intégration de données résolu par une abstraction unique, et cette abstraction est le log.

### L'offset comme horloge canonique

Un problème sournois se cache dans toute intégration multi-systèmes : **dans quel ordre les choses se sont-elles réellement produites ?** Si MySQL enregistre une écriture à t=1000 ms et que Kafka reçoit un événement à t=999 ms, l'événement est-il vraiment antérieur à l'écriture ? Non — parce que les deux horloges appartiennent à des machines différentes, et que la **dérive d'horloge** entre machines peut atteindre des dizaines de millisecondes. Se fier à l'heure murale, c'est risquer d'inverser la cause et l'effet.

Le log résout ça sans effort, parce que l'ordre y est intrinsèque :

```
Offset 500 : « user 123 a cliqué sur signup »
Offset 501 : « user 123 s'est enregistré »
```

Tous les consommateurs voient ces deux événements dans l'ordre des offsets. L'offset est un **timestamp logique**, découplé de toute horloge physique, et donc immunisé contre la dérive. C'est précisément pour cette raison que, pour ordonner des événements, un offset Kafka vaut mieux qu'un timestamp. Et c'est le même problème que **TrueTime** de Spanner résout, mais à l'échelle planétaire et avec du matériel (horloges atomiques + GPS) pour reconstituer un ordre global fiable là où un simple offset ne suffit plus.

---

## La dualité tables / événements

Nous arrivons à l'insight le plus profond du texte, celui qui recâble définitivement l'intuition. **Une table et un log sont deux représentations de la même vérité.**

```
   LOG (les événements)          TABLE (l'état)
   ┌────────────────┐            ┌──────────────┐
   │ PUT A=1        │            │ A : 1        │
   │ PUT B=5        │    ───►     │ B : 7        │
   │ DELETE A       │            │ C : 3        │
   │ PUT C=3        │            └──────────────┘
   │ PUT B=7        │
   └────────────────┘
```

Le passage se fait dans les deux sens. **Log → table** : on applique les événements dans l'ordre, et l'état final se reconstruit (c'est la reconstruction après crash, exactement le rejeu du WAL). **Table → log** : on enregistre chaque modification comme un événement — c'est le **Change Data Capture** (CDC).

Mais les deux ne sont pas symétriques, et c'est là tout le sel :

> Le log est plus fondamental. À partir du log, on peut toujours recréer la table. À partir de la table seule, on a perdu l'histoire.

La table ne connaît que le présent : `A` vaut 1. Le log sait que `A` a valu 1, puis a été supprimé — il connaît le *chemin*, pas seulement la destination. Cette asymétrie est la raison d'être de l'audit, du voyage dans le temps, et du débogage par rejeu. Une table est un log dont on aurait jeté l'histoire pour ne garder que le résumé.

### Git est un log distribué

Si cette dualité vous semble abstraite, vous l'utilisez tous les jours. **Git est un log distribué**, et l'analogie tient trait pour trait :

```
git log --oneline
  a1b2c3d (HEAD→main) Add user authentication
  e4f5g6h Fix database connection pooling
  i7j8k9l Implement payment processing
```

Chaque commit est une entrée de log. Le hash du commit joue le rôle d'un offset (adressé par contenu). Le diff est l'événement. Le pointeur vers le parent encode l'ordre. L'arbre des fichiers que vous voyez dans votre éditeur — l'**état** — n'est que la matérialisation obtenue en rejouant les commits.

Les opérations suivent la même grammaire : `git pull` réplique le log depuis un dépôt distant ; `git merge` réconcilie deux logs divergents (dans le même esprit que les *vector clocks* de Dynamo) ; `git rebase` réécrit l'histoire du log. GitHub est un log partagé pour le code ; Kafka est un log partagé pour les données. Même concept, domaines différents.

### Event Sourcing et CDC : deux portes vers la même pièce

Cette dualité a donné naissance à deux patterns d'architecture qu'on présente souvent comme rivaux alors qu'ils sont les deux faces d'une même idée.

L'**Event Sourcing** part du log : les événements sont **primaires**, l'état est dérivé. On conçoit le système pour ça dès le premier jour.

```python
class BankAccount:
    def deposit(self, amount):
        event = {"type": "DEPOSIT", "amount": amount}
        event_store.append(event)     # le log est la source de vérité
        # le solde n'est jamais qu'un dérivé des événements

    def get_balance_at(self, timestamp):
        # voyage dans le temps par rejeu du log
        balance = 0
        for event in self.events:
            if event["ts"] > timestamp:
                break
            # appliquer l'événement...
        return balance
```

Remarquez `get_balance_at` : parce que l'histoire complète est conservée, on peut demander le solde *à n'importe quelle date passée*. C'est impossible avec une table qui ne stocke que le solde courant.

Le **CDC** part de la table : on a déjà une base classique, et on **capture** son WAL pour en extraire des événements, sans toucher au code applicatif. Debezium, par exemple, lit le WAL de PostgreSQL :

```
postgres_WAL  →  Debezium  →  topic "postgres.public.users"
```

Chaque INSERT / UPDATE / DELETE devient un événement Kafka, que consomment ensuite Elasticsearch, un cache Redis, un pipeline ML — tous synchronisés depuis une **source de vérité unique** : le WAL.

Quand choisir l'un ou l'autre ? **Nouveau système** : Event Sourcing, on conçoit pour les événements dès le départ. **Système existant** : CDC, on capture le WAL sans réécrire l'application. Mais l'observation qui compte est la destination commune : dans les deux cas, on aboutit à **des événements dans un log, alimentant plusieurs consommateurs en aval**. Deux portes, la même pièce.

---

## Le traitement de flux : transformer un log en un autre log

Si l'état n'est qu'un log matérialisé, alors **traiter des données, c'est transformer un log en un autre log**. Un job de stream processing lit un topic, applique une fonction, et écrit dans un nouveau topic — qui à son tour peut nourrir d'autres jobs. Le traitement de flux n'est pas une catégorie de système à part : c'est de la composition de logs.

Cette lentille résout un vieux débat d'architecture.

L'**architecture Lambda** (Nathan Marz, 2011) partait d'un constat pratique : le batch est exact mais lent, le temps réel est rapide mais approximatif. Donc, faisons les deux en parallèle et fusionnons.

```python
# Couche batch : traite TOUT, exact mais lent (heures)
batch_view = spark.read(hdfs_all_data).groupBy("user").agg(count("*"))

# Couche vitesse : traite le RÉCENT, rapide mais approximatif
real_time_view = flink.stream(kafka_topic).window("1hour").count()

# Couche service : fusionne pour répondre
def query_views(user_id):
    return batch_layer.get(user_id) + speed_layer.get(user_id)
```

Le défaut saute aux yeux quand on l'écrit : **la même logique métier existe en double**, une fois en batch et une fois en streaming, dans deux bases de code et souvent deux langages. Le jour où elles divergent — et elles divergent — vous avez un bug qui ne se manifeste que sur la couture entre les deux couches.

L'**architecture Kappa** (Kreps, 2014) tranche le nœud grâce à la propriété de rejeu. Puisqu'un log est rejouable, on n'a plus besoin d'une couche batch séparée : le « batch », c'est simplement **rejouer le log depuis le début** avec le même code de streaming.

```python
# Besoin d'un traitement batch ? Rejoue l'ancien log.
kafka_topic.replay_from(offset=0) | flink_streaming_job
```

Un seul code, un seul système, aucun problème de synchronisation. On échange la sophistication de Lambda contre la simplicité de Kappa — au prix, il faut le dire, d'une rétention du log suffisamment longue pour rejouer tout l'historique dont on a besoin.

---

## La compaction : garder l'histoire sans garder tout l'historique

Un log append-only pose une question évidente : il grossit sans fin. Faut-il vraiment conserver `PUT A=1` pour l'éternité alors que `A` a été réécrit dix fois depuis ?

Cela dépend de ce qu'on veut. Si on veut l'**audit complet** (toute la suite d'événements, y compris les valeurs périmées), oui, on garde tout — c'est la rétention par durée classique. Mais si on veut seulement pouvoir **reconstruire l'état courant**, on n'a besoin que de la **dernière valeur de chaque clé**. Tout le reste est du poids mort.

C'est la **compaction de log** (*log compaction*). Le système parcourt le log et, pour chaque clé, ne conserve que l'entrée la plus récente ; les versions antérieures sont éliminées.

```
Avant compaction :          Après compaction :
  PUT A=1                      DELETE A   (marqueur tombstone)
  PUT B=5              ───►     PUT C=3
  DELETE A                      PUT B=7
  PUT C=3
  PUT B=7
```

Le compromis est explicite : on **perd l'historique** (on ne sait plus que `B` a valu 5 avant 7) mais on **garantit de pouvoir reconstruire l'état courant** avec un log de taille bornée par le nombre de clés, et non par le nombre d'écritures. C'est exactement le mécanisme qui permet à un topic Kafka compacté de servir de source de vérité durable pour un état, plutôt que de simple tampon d'événements — et c'est aussi, structurellement, ce que fait la compaction d'un LSM-tree dans Bigtable quand elle fusionne ses SSTables.

---

## La base de données « débundlée »

Prenez du recul et regardez une base de données classique. Que fait-elle, au fond ? Elle enchaîne quatre services : un **log** (le WAL, pour la durabilité et la reprise), un **moteur de stockage** (les tables matérialisées), des **index** (des projections du log pour lire vite), et un **cache**. Tout ça, empaqueté dans un seul processus, derrière une seule interface SQL.

L'architecture centrée sur le log **débundle** ce paquet. Le log n'est plus enfermé dans la base : il devient un service de première classe, partagé, autour duquel on branche des composants spécialisés. Un moteur de recherche (Elasticsearch) devient « un index externe alimenté par le log ». Un cache Redis devient « une vue matérialisée du log ». Hadoop devient « un consommateur batch du log ». Chacun est le meilleur outil pour son travail, et le log les tient tous cohérents parce qu'ils lisent la même source de vérité, dans le même ordre.

C'est un renversement conceptuel : au lieu d'une base de données monolithique qui exporte des données vers des systèmes satellites, on a **un log central dont la base de données elle-même n'est qu'un consommateur parmi d'autres**. La base de données, dépliée à l'échelle de l'entreprise.

---

## Deux garde-fous : quand le log, et quand pas

L'enthousiasme pour une idée aussi unificatrice a un revers : la tentation de tout y faire passer. Deux questions d'ingénieur pour garder les pieds sur terre.

**Kafka contre une file de messages classique.** Une file traditionnelle (RabbitMQ, ActiveMQ) **supprime** le message une fois consommé — ce n'est donc *pas* un log. Le broker suit l'état de chaque message, pousse les messages vers les consommateurs (au risque de les noyer), et une fois le message acquitté, il n'existe plus : pas de rejeu. Kafka, à l'inverse, **conserve** les messages pour une durée configurable (c'est un log), laisse le **consommateur tirer** à son rythme, et permet de **rembobiner l'offset** pour rejouer à volonté ; le broker reste sans état, c'est le consommateur qui suit sa propre position. Conséquences concrètes : un nouveau consommateur peut rejouer depuis le début ; un incident survenu il y a deux jours peut être reproduit à l'identique ; et plusieurs consommateurs lisent le même log indépendamment, sans routage complexe.

**Quand ne PAS adopter une architecture centrée log.** C'est un surdimensionnement si :

- vous avez **peu de services** (moins de cinq) — un appel d'API direct est plus simple ;
- vous avez un besoin **synchrone** et de faible latence — Kafka a un *lag* de consommation, à proscrire pour lire un solde bancaire à l'instant présent ;
- votre interaction est une simple **requête-réponse** attendant une confirmation immédiate (soumission de formulaire) ;
- vous avez besoin d'un **historique infini** — les logs ont des limites de rétention.

Et c'est le bon choix si plusieurs consommateurs veulent la même donnée, si le traitement asynchrone est acceptable (email, analytique, ML), si vous avez besoin d'une piste d'audit ou de rejeu, ou si vous voulez découpler la fiabilité du producteur de celle des consommateurs. La règle du pouce : un seul consommateur et de la latence critique → appel direct ; deux consommateurs ou plus, ou de l'asynchrone, ou du rejeu → log.

---

## Pourquoi ce modèle mental vaut la peine d'être intériorisé

Revenons au dossier dans son ensemble, parce que c'est ici que les fils se rejoignent. Chacun des grands systèmes que vous avez étudiés est, à sa racine, le même geste :

- **GFS (2003)** : les mutations de chunks sont un log appliqué dans l'ordre.
- **MapReduce (2004)** : fonctions déterministes + log d'entrée = tolérance aux pannes par rejeu.
- **Bigtable (2006)** : WAL + SSTables = un LSM-tree, c'est-à-dire un log plus ses vues matérialisées.
- **Chubby (2006)** : Paxos = consensus sur l'ordre d'un log.
- **Dynamo (2007)** : le *hinted handoff* bufferise des entrées de log pour les nœuds absents.
- **Kafka (2011)** : le log promu au rang de service distribué de première classe.
- **Spanner (2012)** : le log Paxos + TrueTime = cohérence externe globale.
- **Borg (2015)** : un log Paxos réplique l'état d'orchestration du cluster.

Le motif universel, une fois qu'on le voit, ne se laisse plus oublier :

> Un producteur écrit dans un log append-only et ordonné. Un consommateur applique les entrées à son rythme. L'état dérivé est une vue matérialisée du log. La réplication est la distribution du log. La cohérence est l'accord sur l'ordre du log.

Ce n'est pas une jolie métaphore. C'est un outil de pensée. Face à un nouveau système distribué, vous disposez désormais d'une grille de lecture qui coupe à travers le marketing : *où est le log ? qui l'écrit ? qui le lit ? comment s'accorde-t-on sur son ordre ? l'état est-il dérivé ou primaire ?* Ces cinq questions dévoilent l'architecture réelle plus vite que n'importe quelle documentation.

---

## À retenir

1. **Un log est un objet à trois propriétés : append-only, totalement ordonné, rejouable.** Cette banalité apparente est la structure de données fondamentale des systèmes distribués fiables.

2. **La réplication est la distribution d'un log.** Deux processus déterministes qui consomment le même log dans le même ordre finissent dans le même état — c'est la réplication par machine à états, et c'est pourquoi le log est partout.

3. **L'ordre est tout.** Le rôle de Paxos et Raft n'est pas de stocker des données, mais de faire s'accorder des machines faillibles sur l'ordre du log. L'offset est une horloge logique, plus fiable que l'heure murale.

4. **Tables et événements sont duaux, mais le log est plus fondamental.** On reconstruit toujours la table depuis le log ; la table seule a perdu l'histoire. C'est le socle de l'Event Sourcing, du CDC, de l'audit et du voyage dans le temps.

5. **Un log central transforme N × M pipelines en N + M.** C'est la solution au problème d'intégration de données, et le mécanisme du découplage : le producteur ignore qui le consomme.

6. **Le traitement de flux transforme un log en un autre log** ; la compaction borne sa taille en ne gardant que la dernière valeur par clé ; la base de données « débundlée » n'est qu'un log central entouré de consommateurs spécialisés (index, cache, moteur de recherche).

7. **Un log n'est pas toujours la réponse.** Peu de services, besoin synchrone à faible latence, simple requête-réponse : l'appel direct reste le bon choix. Le log gagne dès qu'il y a plusieurs consommateurs, de l'asynchrone, ou un besoin de rejeu.

---

## Pour aller plus loin

- **Jay Kreps — *The Log: What every software engineer should know about real-time data's unifying abstraction*** (LinkedIn Engineering, 2013). Le texte source, essai fondateur ; à lire d'un bout à l'autre au moins une fois.
- **Martin Kleppmann — *Designing Data-Intensive Applications*** (O'Reilly, 2017), chapitres 5 (réplication), 7 (transactions) et surtout 11 (traitement de flux), qui déroulent la dualité log/table avec une rigueur superbe.
- **Nathan Marz — *Big Data*** pour la source de l'architecture Lambda, à confronter à la critique Kappa de Kreps.
- **La documentation de Kafka sur la log compaction et le CDC via Debezium**, pour passer de la théorie à l'implémentation concrète.
- **Le papier Raft (Ongaro & Ousterhout, 2014), *In Search of an Understandable Consensus Algorithm***, pour voir « l'accord sur l'ordre du log » décrit avec un souci pédagogique rare parmi les articles de consensus.
