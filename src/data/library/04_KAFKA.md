# Kafka : le log comme colonne vertébrale des données temps réel

Kafka est probablement le système distribué dont tu croiseras le nom le plus souvent sans vraiment comprendre *pourquoi* il est là. On te dira « c'est une file de messages », « c'est un bus d'événements », « c'est du streaming » — trois descriptions vaguement vraies et globalement trompeuses. Ce chapitre part de zéro et reconstruit l'idée centrale, qui est en réalité d'une simplicité désarmante : **Kafka n'est pas une file d'attente, c'est un journal (un *log*) répliqué, distribué, et persistant.** Une fois cette bascule mentale faite, tout le reste — partitions, offsets, groupes de consommateurs, réplication, sémantiques de livraison — se déduit presque naturellement.

Comme tu viens du bas niveau, je vais m'appuyer sur tes intuitions : accès séquentiel vs aléatoire sur disque, page cache de l'OS, `sendfile`, DMA. Kafka est en grande partie une exploitation très maligne de ces mécanismes système que tu connais déjà mieux que la plupart des gens qui l'utilisent.

---

## 1. Le problème : unifier les pipelines de données temps réel

Remontons à LinkedIn vers 2010, là où Kafka est né. L'entreprise produit deux grandes familles de données en flux continu.

D'un côté, l'**activité utilisateur** : pages vues, clics, « j'aime », partages, recherches. De l'autre, les **métriques opérationnelles** : latences, taux d'erreur, CPU, réseau. Ensemble, cela représente des **milliards d'événements par jour**. Et surtout, une exigence nouvelle : ces données ne doivent plus seulement finir dans un entrepôt le lendemain pour des rapports. Elles doivent alimenter des fonctionnalités **temps réel** — recommandations, pertinence de recherche, détection de fraude — avec une latence de l'ordre de la seconde.

À l'époque, deux familles d'outils existent, et **aucune** ne fait le travail.

Les **systèmes de messagerie d'entreprise** (ActiveMQ, RabbitMQ, tout ce qui parle JMS) sont riches en fonctionnalités : transactions, accusés de réception, redélivrance fine. Mais leur API est complexe, et surtout leur débit est faible — quelques milliers de messages par seconde. Pire, ils sont conçus autour de l'idée que les messages sont consommés puis effacés *rapidement* ; laisser des messages s'accumuler dégrade leurs performances, car leur modèle de stockage n'a pas été pensé pour ça.

Les **agrégateurs de logs** (Scribe, Flume) ont le problème inverse. Ils encaissent un gros débit, mais ils sont pensés pour le batch : on collecte, on pousse vers Hadoop, on traite plus tard. Pas de consommation temps réel, et un modèle *push* qui inonde les consommateurs sans leur laisser le contrôle.

L'insight de Kafka est de **refuser ce choix**. Il combine le haut débit de l'agrégateur de logs, la consommation temps réel du système de messagerie, un modèle *pull* piloté par le consommateur, et une architecture distribuée et scalable. Le tout derrière une abstraction unique, simple, et — c'est le point clé — **la même donnée sert à la fois les consommateurs temps réel et les consommateurs batch**.

> **Note historique.** Le papier fondateur de LinkedIn (NetDB 2011) annonçait 50 000 à 400 000 messages/seconde par broker. Ces chiffres sont aujourd'hui des repères historiques : le Kafka moderne encaisse **des millions de messages par seconde par broker**. Tout au long de ce chapitre je distinguerai le « Kafka du papier de 2011 » de la réalité actuelle, car l'écart est parfois considérable.

---

## 2. L'abstraction centrale : le log

Voici le renversement mental à faire, et c'est vraiment le cœur de tout.

Un système de messagerie classique traite un message comme une **entité mutable, avec un état**. Quand tu fais `enqueue(message)`, le broker génère un identifiant unique, stocke le message avec des métadonnées (`pending`, `delivered`, `acked`), l'insère dans une structure d'index (souvent un B-tree, à accès aléatoire), et à la consommation il change l'état puis, une fois acquitté, il **supprime** le message. Chaque message est une petite ligne dans une base de données avec un cycle de vie.

Kafka traite un message comme **une entrée immuable dans un fichier journal**. Tu fais `append(message)`, le message est écrit à la fin d'un fichier, on lui attribue un **offset** (sa position), et… c'est tout. Pas d'identifiant à générer, pas d'état à suivre, pas d'index à maintenir, pas de suppression à la consommation. Le message reste là jusqu'à ce qu'une politique de rétention le fasse expirer — pas parce qu'il a été lu, mais parce qu'il est *vieux*.

```
File d'attente classique          Log Kafka
--------------------              ------------------
enqueue → stocke + indexe         append → écrit en fin de fichier
dequeue → change l'état           read(offset) → lit depuis une position
ack     → SUPPRIME                (jamais supprimé avant expiration)
```

Cette différence paraît anodine. Elle est en réalité structurante, et pour une raison que ton instinct bas niveau va immédiatement apprécier : **un log ne s'écrit qu'en séquentiel**. Or, sur un disque, l'écart entre séquentiel et aléatoire est brutal. Sur un disque dur classique, une écriture séquentielle tourne autour de 600 Mo/s, une écriture aléatoire autour de 100 Ko/s — un facteur **6000**. Même sur SSD, où l'aléatoire est bien meilleur, le séquentiel garde un avantage d'un ordre de grandeur. En choisissant une structure qui *n'écrit et ne lit qu'en ordre*, Kafka fait travailler le disque dans son meilleur régime, celui où il se comporte presque comme de la mémoire.

Le message lui-même est volontairement idiot : c'est un **tableau d'octets**. Kafka ne sait pas ce qu'il y a dedans et ne veut pas le savoir. Cette absence de sémantique est ce qui lui permet de rester rapide et générique.

### Le modèle mental : topic, partition, offset

Trois mots à s'approprier une bonne fois.

Un **topic** est une catégorie nommée de messages : `user-activity`, `server-metrics`, `audit-log`. C'est l'unité logique à laquelle producteurs et consommateurs s'adressent.

Une **partition** est la subdivision physique d'un topic. Un topic n'est pas *un* log, c'est *plusieurs* logs indépendants — ses partitions. Un topic à 4 partitions, ce sont quatre fichiers-journaux, potentiellement sur quatre brokers différents, dans lesquels les messages sont répartis :

```
Topic "user-activity", 4 partitions :

Partition 0 : [ m0 ][ m4 ][ m8  ][ m12 ] ...   →  broker 1
Partition 1 : [ m1 ][ m5 ][ m9  ][ m13 ] ...   →  broker 2
Partition 2 : [ m2 ][ m6 ][ m10 ][ m14 ] ...   →  broker 1
Partition 3 : [ m3 ][ m7 ][ m11 ][ m15 ] ...   →  broker 2
```

Un **offset** est la position d'un message *dans sa partition*. C'est un simple entier croissant, local à la partition. Kafka n'a pas d'identifiant global de message ; il a des offsets. Lire, c'est dire au broker : « donne-moi ce qu'il y a à partir de l'offset 1000, dans la limite de 1 Mo ». Rien de plus. L'offset est donc à la fois l'adresse du message et le curseur de lecture.

Garde cette image : **un topic est un paquet de partitions, chaque partition est un log append-only, et un offset désigne une place précise dans une partition précise.** Tous les concepts qui suivent se raccrochent à ces trois mots.

---

## 3. Le partitionnement : parallélisme et ordre

### Pourquoi partitionner

Un seul log est un goulet d'étranglement : une seule fin de fichier où écrire, un seul flux à lire, une seule machine. Pour tenir des millions de messages par seconde, il faut **paralléliser**, et l'unité de parallélisme de Kafka, c'est la partition. Répartir les partitions d'un topic sur plusieurs brokers, c'est répartir la charge d'écriture, de stockage et de lecture. Ajouter des partitions, c'est augmenter le débit maximal du topic.

### Le compromis fondamental : ordre *ou* parallélisme

Voici le point que la plupart des gens comprennent mal, et qui est absolument central. Kafka offre une **garantie d'ordre total à l'intérieur d'une partition**, et **aucune garantie d'ordre entre partitions**.

À l'intérieur d'une partition, les messages sont lus exactement dans l'ordre où ils ont été écrits : `m1 → m2 → m3 → m4`, toujours. C'est direct : c'est un fichier append-only lu du début vers la fin.

Entre deux partitions, en revanche, il n'y a aucun ordre. Si `m1, m3, m5` sont sur la partition 0 et `m2, m4, m6` sur la partition 1, un consommateur qui lit les deux peut très bien voir `m2, m1, m4, m3, m6, m5`. Les partitions avancent indépendamment.

D'où le compromis : **plus tu as de partitions, plus tu as de parallélisme, mais plus le périmètre sur lequel tu garantis l'ordre est petit.** Un topic à une seule partition te donne un ordre total mais aucun parallélisme. Un topic à 100 partitions te donne un fort parallélisme mais l'ordre n'existe que par petits îlots.

### La clé de partition : le levier pour concilier les deux

La sortie de ce dilemme est élégante. Quand un producteur envoie un message, il peut fournir une **clé**. Kafka calcule alors `hash(clé) % nombre_de_partitions` pour choisir la partition. Conséquence : **tous les messages portant la même clé atterrissent dans la même partition, donc sont ordonnés entre eux.**

```
send("user-activity", key="user:123", ...)   → partition 0
send("user-activity", key="user:123", ...)   → partition 0   (même clé, même partition)
send("user-activity", key="user:456", ...)   → partition 2
```

Choisis `user:123` comme clé, et tous les événements de cet utilisateur sont traités dans l'ordre, tandis que les événements d'utilisateurs différents se répartissent sur toutes les partitions et se traitent en parallèle. Tu as l'ordre *là où il compte* (par utilisateur) et le parallélisme partout ailleurs. Si tu ne fournis pas de clé, Kafka répartit les messages de façon équilibrée entre partitions, et tu renonces à toute garantie d'ordre au profit d'un débit maximal.

Le prix à payer : le nombre de partitions est un choix quasi définitif. Comme le partitionnement dépend de `% nombre_de_partitions`, ajouter des partitions plus tard *change la partition cible* d'une clé donnée et casse l'ordre pour les messages futurs par rapport aux anciens. On surdimensionne donc généralement le nombre de partitions dès le départ.

---

## 4. Le modèle *pull* et le broker sans état

### Pourquoi le consommateur tire au lieu de se faire pousser

Les systèmes traditionnels **poussent** (*push*) les messages vers les consommateurs. Le broker prend un message et l'envoie. Ça paraît naturel, jusqu'à ce qu'un producteur rapide rencontre un consommateur lent :

```
Broker rapide (1 M msg/s)
Consommateur lent (10 K msg/s de capacité de traitement)

→ le broker pousse plus vite que le consommateur ne digère
→ le buffer du consommateur déborde
→ options :  (A) jeter des messages   (B) bloquer le broker   (C) protocole de backpressure complexe
```

Aucune de ces options n'est bonne. Le broker se retrouve à devoir gérer l'état et le rythme de chaque consommateur.

Kafka inverse le sens : **le consommateur tire** (*pull*). Il émet une requête « donne-moi à partir de l'offset X, au plus N octets », traite ce qu'il reçoit à son rythme, puis redemande. Le consommateur contrôle sa cadence et sa taille de lot. Il ne peut par construction pas être submergé, puisque rien ne lui arrive sans qu'il l'ait demandé.

```
def consommateur():
    while True:
        messages = broker.fetch(offset=offset_courant, max_bytes=1_000_000)
        for m in messages:
            traiter(m)                 # à son propre rythme
            offset_courant = m.offset + 1
```

L'objection immédiate — la tienne, sans doute — c'est que le *pull* implique du polling, donc de la latence ou du gaspillage CPU à interroger dans le vide. Kafka répond par le **long polling** : si aucune donnée n'est disponible, le broker **retient la requête** jusqu'à un délai configuré, et répond dès qu'un message arrive. Pas de boucle d'attente active, et une latence quasi nulle en pratique. Le consommateur arbitre lui-même entre latence et débit via ce délai.

### Le broker ne suit pas les consommateurs

Le corollaire du *pull* est ce qui fait vraiment la scalabilité de Kafka : **le broker ne mémorise pas quel consommateur a lu quoi.** Dans un système classique, le broker maintient, par consommateur et par file, la liste des messages en attente, livrés, acquittés. C'est de la mémoire, des écritures disque, et une source majeure de complexité en cas de panne.

Chez Kafka, le broker se contente de stocker des messages dans des fichiers. C'est le **consommateur** qui retient sa propre position :

```
état_du_consommateur = {
    "topic1-partition0": offset 1000,
    "topic1-partition1": offset 2500,
}
```

Le broker devient presque bête, donc rapide, donc facile à ajouter ou retirer. On peut brancher un nouveau consommateur sans rien déclarer côté broker.

> **Où est stockée cette position ?** Dans le Kafka de 2011, les offsets des consommateurs étaient écrits dans **ZooKeeper**. C'est de l'histoire ancienne. Depuis **Kafka 0.9 (2015)**, les offsets sont enregistrés dans un **topic interne spécial, `__consumer_offsets`** — c'est-à-dire dans Kafka lui-même. Committer un offset, c'est simplement écrire un message dans ce topic. On y reviendra à propos de ZooKeeper ; retiens pour l'instant que la position de lecture vit désormais dans un log Kafka comme le reste.

### Le rembobinage : la fonctionnalité qui découle de tout ça

Puisque les messages ne sont pas effacés à la lecture et que la position n'est qu'un entier détenu par le consommateur, **relire le passé est trivial** : il suffit de repositionner l'offset.

```
offset = 1000        # position normale
# bug découvert dans la logique applicative...
offset = 950         # on recule de 50 messages
# on reconsomme et on retraite
```

C'est ce qui distingue le plus nettement Kafka d'une file classique, où un message consommé est perdu. Ici tu peux rejouer un flux entier : pour corriger un bug de traitement, pour déployer un nouvel algorithme sur des données historiques, pour reconstruire un état après un incident. Le log n'est pas qu'un tuyau, c'est une **source de vérité rejouable** dans les limites de la rétention.

---

## 5. Les groupes de consommateurs et le rééquilibrage

### Concilier point-à-point et publication/abonnement

Deux besoins classiques s'opposent en apparence. Le **point-à-point** : chaque message n'est traité qu'une fois par un ensemble de travailleurs (une file de tâches). Le **publish/subscribe** : plusieurs systèmes indépendants reçoivent chacun *tout* le flux. Kafka satisfait les deux avec un seul mécanisme : le **groupe de consommateurs**.

La règle est simple : **une partition est attribuée à au plus un consommateur au sein d'un même groupe.** Les consommateurs d'un même groupe se **répartissent** donc les partitions et se partagent le travail — c'est le comportement point-à-point. Mais **deux groupes différents reçoivent chacun l'intégralité du flux**, indépendamment, avec leurs propres offsets — c'est le comportement pub/sub.

```
Groupe "A" (traitement des commandes)      Groupe "B" (analytics)
  Consommateur 1 : partitions 0, 1           Consommateur 1 : partitions 0,1,2,3
  Consommateur 2 : partitions 2, 3
  → chaque message traité 1 fois DANS A      → B relit TOUT le flux, indépendamment de A
```

### La relation entre consommateurs et partitions

Comme une partition ne va qu'à un seul consommateur du groupe, le **nombre de partitions plafonne le parallélisme** du groupe.

```
Groupe de M consommateurs, topic de N partitions :

M < N :  certains consommateurs prennent plusieurs partitions   (C1→[p0,p1], C2→[p2,p3])
M = N :  correspondance parfaite 1:1                              (C1→[p0], C2→[p1], ...)
M > N :  les consommateurs en trop restent INACTIFS              (on ne peut pas scinder une partition)
```

D'où la recommandation de prévoir **beaucoup plus de partitions que de consommateurs immédiats** : c'est la marge de manœuvre qui te permettra de scaler en ajoutant des consommateurs plus tard, jusqu'à concurrence du nombre de partitions.

### Le rééquilibrage (rebalancing)

Quand un consommateur rejoint ou quitte le groupe — nouveau déploiement, montée en charge, ou crash — les partitions doivent être **redistribuées** entre les survivants. C'est le **rééquilibrage**.

Le principe, dans sa version historique et toujours conceptuellement valide : chaque consommateur relâche ses partitions, l'état du groupe est relu, et les partitions disponibles sont réparties entre les membres, typiquement par tranches contiguës.

```
10 partitions, 3 consommateurs  →
  Consommateur 0 : [0, 1, 2]
  Consommateur 1 : [3, 4, 5]
  Consommateur 2 : [6, 7, 8, 9]
```

La détection de panne repose sur un mécanisme d'**inscription éphémère** : chaque consommateur maintient une présence qui disparaît s'il cesse d'émettre des signes de vie (heartbeats). Sa disparition libère ses partitions et déclenche le rééquilibrage, qui les réassigne aux consommateurs restants. À l'inverse, quand un nouveau consommateur arrive, il s'inscrit, ce qui déclenche aussi un rééquilibrage pour lui céder sa part.

> **Historique vs actuel.** En 2011, toute cette chorégraphie — inscription des consommateurs, propriété des partitions, déclenchement du rééquilibrage — passait par **ZooKeeper**, avec des nœuds éphémères et des *watches*. Le Kafka moderne a rapatrié cette coordination **dans les brokers eux-mêmes** : un broker joue le rôle de *group coordinator*, les consommateurs lui envoient leurs heartbeats, et c'est lui qui orchestre le rééquilibrage. Le concept est identique ; l'implémentation ne dépend plus d'un système externe.

Le coût du rééquilibrage est réel : pendant l'opération, la consommation du groupe **s'interrompt** brièvement (« stop-the-world » historique). Un groupe qui rééquilibre trop souvent — consommateurs instables, timeouts mal réglés — passe son temps à s'arrêter au lieu de consommer. Les versions récentes atténuent fortement ce coût (rééquilibrage coopératif et incrémental, qui ne relâche que les partitions strictement nécessaires), mais l'idée à retenir est qu'un rééquilibrage n'est pas gratuit et qu'on cherche à le rendre rare.

---

## 6. La durabilité : réplication, ISR et `acks`

Jusqu'ici, une partition vivait sur un broker. Mais un broker peut tomber. Sans réplication, sa panne rend ses partitions indisponibles et peut perdre des données. C'est ce que le Kafka de 2011 ne gérait pas encore vraiment, et que la **réplication** (introduite en 0.8, 2013) est venue résoudre. C'est aujourd'hui le socle de la fiabilité de Kafka.

### Leader et followers

Chaque partition est répliquée en plusieurs copies (le **facteur de réplication**, souvent 3). Parmi ces copies, une seule est le **leader**, les autres sont des **followers**.

Toutes les lectures et écritures d'une partition passent par son **leader**. Les followers ne servent pas les clients ; leur unique travail est de **répliquer** : ils tirent en continu les nouveaux messages depuis le leader, exactement comme le ferait un consommateur, et les écrivent dans leur propre copie du log. Si le leader tombe, l'un des followers est **promu leader** et le service continue.

```
Partition 0, facteur de réplication 3 :

  Broker 1 : [LEADER]    ← producteurs et consommateurs parlent ici
  Broker 2 : [follower]  ← réplique depuis le leader
  Broker 3 : [follower]  ← réplique depuis le leader

  Broker 1 tombe → un follower à jour devient leader → le service continue
```

### L'ISR : le cœur du compromis durabilité/disponibilité

Toute la subtilité tient dans une question : **quand considère-t-on qu'un message est en sécurité ?** Attendre que *toutes* les copies l'aient reçu est très sûr mais fragile — une seule réplique lente ou en panne bloquerait tout. Se contenter du leader est rapide mais risqué — s'il tombe juste après, le message est perdu.

Kafka tranche avec la notion d'**ISR** (*In-Sync Replicas*, répliques synchronisées). L'ISR est **l'ensemble des répliques suffisamment à jour** par rapport au leader. Une réplique qui prend trop de retard est **éjectée** de l'ISR ; quand elle rattrape, elle y est réintégrée. C'est un ensemble dynamique.

Un message est déclaré **committé** — donc durable et visible pour les consommateurs — lorsqu'il a été répliqué sur **toutes les répliques de l'ISR**. L'astuce est que l'ISR peut rétrécir : si un follower est lent, il sort de l'ISR et cesse de ralentir les commits, au lieu de bloquer la partition. Kafka trade ainsi, dynamiquement, entre durabilité et disponibilité, sans intervention.

### Le réglage `acks` côté producteur

Le producteur choisit son niveau d'exigence via le paramètre **`acks`**, qui détermine *quand* le broker lui confirme l'écriture. C'est le curseur le plus direct entre débit et sécurité.

- **`acks=0`** — le producteur n'attend rien. Il envoie et oublie (*fire-and-forget*). Débit maximal, mais si le broker n'a rien reçu, le message est perdu sans que personne ne le sache. C'est le mode « fire-and-forget » que décrivait le papier de 2011, adapté aux métriques où perdre un point de mesure est sans conséquence.
- **`acks=1`** — le producteur attend l'accusé du **leader** seulement. Compromis courant : si le leader tombe *avant* qu'un follower ait répliqué le message, il est perdu. Fenêtre de risque étroite, mais réelle.
- **`acks=all`** — le producteur attend que le message soit répliqué sur **toute l'ISR**. C'est le mode durable : tant qu'il reste une réplique de l'ISR vivante, le message survit.

`acks=all` se combine avec un réglage côté broker, `min.insync.replicas`, qui fixe la taille minimale de l'ISR pour accepter une écriture. Avec un facteur de réplication 3 et `min.insync.replicas=2`, tu tolères la panne d'un broker tout en garantissant qu'un message committé existe sur au moins deux copies. Si l'ISR tombe sous ce seuil, le broker **refuse les écritures** plutôt que de risquer une perte — un arbitrage explicite en faveur de la cohérence sur la disponibilité.

Le compromis est net : plus tu attends de répliques, plus tu es durable, plus ta latence d'écriture monte. Tu règles ce curseur par topic, selon la criticité de la donnée.

---

## 7. Rétention et compaction : combien de temps vit un message

Puisque le broker ne sait pas quand un message a été « traité par tout le monde », comment décide-t-il de libérer de la place ? Réponse : il ne raisonne pas en fonction de la consommation, mais selon des **politiques de rétention** indépendantes des consommateurs.

### Rétention par le temps (ou la taille)

La politique par défaut est temporelle : **on conserve les messages pendant une durée configurée** — 7 jours par exemple — puis on efface les plus vieux. On peut aussi plafonner par taille. C'est brutalement simple, et ça marche parce que la plupart des consommateurs sont à jour en quelques heures ou jours, que le disque est bon marché, et que Kafka gère des téraoctets sans peiner.

Concrètement, une partition n'est pas un fichier unique mais une suite de **segments** :

```
/kafka-logs/topic1-partition0/
  00000000000000000000.log      ← segment 1  (offsets 0 – 999999)
  00000000000000000000.index    ← index du segment 1
  00000000000001000000.log      ← segment 2  (offsets 1000000 – 1999999)
  00000000000002000000.log      ← segment 3  (actif, en cours d'écriture)
```

Seul le dernier segment est actif en écriture ; les autres sont fermés et immuables. La rétention agit à la granularité du **segment entier** : Kafka supprime des vieux segments d'un bloc, une opération triviale (un `unlink` de fichier), sans jamais avoir à retoucher au milieu d'un log. À côté de chaque segment, un petit fichier **`.index`** fait correspondre des offsets à des positions dans le fichier, ce qui permet, par une recherche dichotomique, de localiser rapidement l'endroit exact où lire pour un offset donné. La conséquence de ce que le message porte son SLA dans le temps, c'est qu'un consommateur qui prend plus de retard que la rétention **perd** les messages expirés : il devra reprendre depuis le plus vieil offset encore disponible.

### La compaction : garder la dernière valeur par clé

La rétention temporelle a un angle mort. Parfois, le log ne représente pas un flux d'événements éphémères mais l'**état courant** de quelque chose : la dernière adresse email de chaque utilisateur, la dernière configuration de chaque service. Effacer les vieux messages par le temps effacerait l'état de tout utilisateur inactif depuis 7 jours — inacceptable.

Pour ce cas, Kafka propose la **log compaction**. Au lieu de raisonner par âge, la compaction garantit de **conserver au moins la dernière valeur pour chaque clé**. Elle repasse en arrière-plan sur les segments et élimine les entrées obsolètes — les versions antérieures d'une même clé — tout en préservant la plus récente.

```
Avant compaction (par clé) :
  (user:1 → "a@x")  (user:2 → "b@x")  (user:1 → "a2@x")  (user:2 → "b2@x")

Après compaction :
  (user:1 → "a2@x")  (user:2 → "b2@x")      ← seule la dernière valeur de chaque clé survit
```

Le log compacté devient alors une **table** : rejoue-le du début, et tu reconstruis l'état courant complet, clé par clé. C'est le mécanisme qui sous-tend la « dualité flux/table » et des usages comme le *change data capture* ou le stockage d'état des applications de stream processing. (C'est d'ailleurs exactement ainsi que le topic interne `__consumer_offsets` fonctionne : compacté par clé `(groupe, topic, partition)`, il ne retient que le dernier offset committé.) Pour supprimer réellement une clé, on écrit un message spécial à valeur nulle, une *tombstone*, que la compaction propage puis efface.

Le coût : la compaction consomme de l'I/O et du CPU en tâche de fond, et elle ne convient qu'aux logs où la notion de « dernière valeur par clé » a un sens — pas à un flux de clics, où chaque événement est unique et doit être conservé tel quel.

---

## 8. Les sémantiques de livraison : at-most, at-least, exactly-once

C'est le sujet où circulent le plus d'idées fausses, en grande partie parce que la réponse a **changé** au fil des versions. Distinguons proprement les trois garanties, puis l'histoire.

### Les trois garanties

**At-most-once** (au plus une fois) : chaque message est livré zéro ou une fois, jamais deux. On accepte de perdre, on refuse de dupliquer. C'est ce que tu obtiens en committant ton offset *avant* d'avoir traité le message : si tu crashes entre les deux, tu ne le rejoueras pas — il est perdu.

**At-least-once** (au moins une fois) : chaque message est livré une ou plusieurs fois, jamais zéro. On refuse de perdre, on accepte de dupliquer. C'est le comportement naturel et le plus courant : tu traites le message *puis* tu committes son offset. Si tu crashes entre les deux, au redémarrage tu reprends depuis le dernier offset committé et tu **retraites** le message.

```
Producteur envoie un message
Le broker l'écrit et acquitte
Le consommateur lit, traite...
Le consommateur CRASHE avant de committer l'offset

→ au redémarrage, il relit depuis le dernier offset committé
→ le message est traité DEUX fois
```

At-least-once a une propriété appréciable pour l'audit : on peut détecter une perte de données en comptant les messages. LinkedIn faisait précisément ça — le producteur publie périodiquement, sur un topic dédié, le nombre de messages émis dans une fenêtre de temps ; un consommateur compte ce qu'il reçoit ; si les comptes divergent à la baisse, alerte. Ça marche parce qu'at-least-once garantit qu'il peut y avoir des doublons mais **jamais de trou**.

**Exactly-once** (exactement une fois) : chaque message produit un effet une et une seule fois. C'est la garantie que tout le monde veut et que, longtemps, on a dit « trop coûteuse pour valoir la peine ».

### Historique vs réalité actuelle — le point à corriger absolument

Le papier de 2011 ne fournissait que de l'**at-least-once**, et l'argument de l'époque était : l'exactly-once exigerait un commit à deux phases (2PC), coûteux, alors que pour de l'activité utilisateur, un clic compté deux fois sur un million est sans importance. « Donnez aux applications les primitives et laissez-les dédupliquer là où c'est nécessaire. »

**Ce n'est plus vrai depuis Kafka 0.11 (2017).** Kafka fournit nativement les **sémantiques exactly-once (EOS)**, et — c'est le point crucial — **sans commit à deux phases**, avec un surcoût quasi nul. Oublie l'idée d'un « exactly-once qui divise le débit par 50 » : c'est un mythe hérité de l'ancienne littérature. EOS repose sur deux mécanismes.

**1. Le producteur idempotent.** Chaque producteur reçoit un identifiant (PID) et numérote ses messages par un **numéro de séquence, par partition**. Le broker suit le dernier numéro reçu par partition et **rejette les doublons** issus des réémissions réseau. Résultat : même si le producteur, faute d'accusé, réémet un message, il n'est écrit qu'une fois dans la partition. Cela s'active par `enable.idempotence=true`, pour un surcoût négligeable — c'est d'ailleurs le comportement par défaut des versions récentes.

**2. Les transactions.** Elles permettent d'écrire de façon **atomique sur plusieurs partitions** — et d'y inclure le commit des offsets de consommation. Le producteur déclare un `transactional.id` ; les consommateurs lisent avec `isolation.level=read_committed`, ce qui leur fait ignorer les messages des transactions non validées. On obtient ainsi le pattern atomique **consommer → transformer → produire** : lire d'un topic, calculer, écrire sur un autre topic, et committer l'offset d'entrée, le tout comme une seule opération tout-ou-rien.

```
EOS = producteur idempotent  +  transactions        (PAS de 2PC)

Idempotence : PID + numéro de séquence par partition → le broker déduplique les réémissions
Transactions : écriture atomique multi-partitions + offsets, lues en read_committed
→ exactly-once à quasi pleine vitesse (millions de msg/s)
```

### Quand quelle garantie

Le choix reste applicatif. Pour du **suivi d'activité**, at-least-once suffit largement : un clic dupliqué fausse un compteur de 0,0001 %, impact nul, et on économise même la config d'EOS. Pour des **transactions financières**, un dépôt dupliqué est inacceptable : on veut exactly-once — soit via EOS de bout en bout, soit par une **déduplication applicative** (chaque événement porte un identifiant unique, on vérifie s'il a déjà été traité avant d'agir). Le message de fond a changé depuis 2011 : l'exactly-once n'est plus un luxe hors de prix qu'on évite, c'est une option qu'on **active là où la sémantique l'exige**, sans sacrifier le débit ailleurs.

---

## 9. Pourquoi c'est si rapide : page cache et zero-copy

Une objection revient sans cesse, et elle mérite une vraie réponse technique : « Kafka écrit sur *disque* ; comment peut-il rivaliser avec des systèmes de messagerie en mémoire ? » La réponse tient en trois mécanismes système que tu connais bien, et elle est contre-intuitive : Kafka est souvent **plus rapide** que les systèmes en mémoire, *précisément* parce qu'il délègue à l'OS.

### I/O séquentielle

On l'a vu au chapitre 2 : Kafka n'écrit qu'en append et ne lit (surtout) qu'en séquentiel. Le disque travaille donc dans son régime optimal, où même un disque dur soutient des centaines de Mo/s. Le « disque lent » n'existe qu'en accès aléatoire ; Kafka l'évite par conception.

### Le page cache plutôt qu'un cache applicatif

Quand Kafka écrit un message, il écrit en réalité dans le **page cache** de l'OS — de la RAM — et non directement sur le plateau. L'OS déverse sur disque plus tard, en arrière-plan. L'écriture « sur disque » a donc une latence de RAM. À la lecture, si la donnée est encore dans le page cache (ce qui est le cas des messages récents, justement ceux que lisent les consommateurs temps réel), aucun accès disque n'a lieu.

Le point malin est que Kafka **ne maintient pas son propre cache** en mémoire de processus. Compare :

```
Messagerie en mémoire (JVM), serveur 64 Go :        Kafka, serveur 64 Go :
  OS           : 2 Go                                   OS          : 2 Go
  Tas JVM      : 32 Go  (messages cachés ici)           Process Kafka : ~1 Go (quasi pas de tas)
  Page cache   : 30 Go  (le reste)                      Page cache  : ~61 Go (presque toute la RAM)

  → messages en double (tas + page cache)               → pas de double buffering
  → GC sur 32 Go = pauses                               → pas de pauses GC
```

En refusant de cacher lui-même, Kafka évite le **double buffering** (la donnée n'est pas stockée deux fois), laisse **toute la RAM** au page cache, et s'épargne les **pauses de garbage collector** d'un gros tas. Bonus : le page cache appartient à l'OS, pas au processus, donc il **survit à un redémarrage du broker** — le cache reste chaud.

### Le zero-copy avec `sendfile`

Enfin, l'envoi d'un message d'un fichier vers la socket d'un consommateur. La voie classique fait voyager la donnée quatre fois :

```
Transfert classique fichier → socket (4 copies, 2 appels système) :
  1. disque → page cache          (DMA)
  2. page cache → buffer applicatif   (copie, syscall read)
  3. buffer applicatif → buffer socket (copie, syscall write)
  4. buffer socket → carte réseau     (DMA)
```

Les étapes 2 et 3 sont des copies inutiles, avec des allers-retours noyau/espace utilisateur. Kafka court-circuite tout ça avec l'appel système **`sendfile`**, qui transfère directement du page cache vers la carte réseau :

```
Kafka avec sendfile (zero-copy) :
  1. disque → page cache      (DMA)
  2. sendfile(socket, fichier, offset, len) → page cache → carte réseau (DMA)
```

Deux copies au lieu de quatre, un seul appel système, aucune implication de l'espace utilisateur. La donnée ne « remonte » jamais dans le processus Kafka. Pour que ça fonctionne, le **format sur disque est identique au format sur le réseau** : Kafka n'a rien à retransformer, il pousse les octets tels quels. Ce couplage volontaire entre format de stockage et format de transfert est ce qui rend le zero-copy possible.

Les mesures du papier de 2011 illustrent l'effet cumulé : là où ActiveMQ et RabbitMQ plafonnaient autour de 5 000–5 500 messages/seconde en consommation, Kafka en soutenait ~22 000 — 4 fois plus, *en utilisant le disque*. (Encore une fois, chiffres historiques ; l'ordre de grandeur actuel est bien supérieur.) La leçon à emporter : « sur disque » n'est pas synonyme de « lent » dès lors qu'on respecte le séquentiel, qu'on délègue le cache à l'OS, et qu'on élimine les copies inutiles.

À cela s'ajoutent des détails de format économes : environ **9 octets de surcoût par message** (dont un **CRC** de 4 octets), contre ~144 octets pour une messagerie JMS chargée de métadonnées et d'index. Le CRC, calculé à l'écriture et vérifié à la lecture, protège contre la corruption disque, réseau ou logicielle : un message corrompu est détecté et le broker peut lancer une récupération plutôt que de servir des octets faux.

---

## 10. La coordination : de ZooKeeper à KRaft

Reste une question d'architecture : qui, dans le cluster, tient les métadonnées — quels brokers existent, quelles partitions existent, qui est leader de quoi, qui appartient à quel groupe ? Il faut un service de **coordination** cohérent. C'est le rôle qu'a longtemps tenu **ZooKeeper**, et que remplit désormais **KRaft**. C'est le point d'architecture qui a le plus changé, et il faut être clair sur ce qui est historique et ce qui est actuel.

### L'ère ZooKeeper (le modèle du papier)

ZooKeeper est un service de coordination distribué, lui-même **répliqué** sur un petit ensemble de nœuds (typiquement 3 ou 5). Il fonctionne par **quorum** : les écritures exigent une majorité. Un ensemble de 3 nœuds tolère la perte d'un nœud (2/3 forment quorum) mais pas de deux (plus de majorité).

Dans le Kafka historique, ZooKeeper servait à quatre choses : la **découverte des brokers** (ils s'y enregistrent), la **coordination des groupes de consommateurs** (inscription, propriété des partitions, rééquilibrage), le **stockage des offsets**, et les **métadonnées topics/partitions**. Il ne servait explicitement **pas** au chemin de données : les messages n'y transitent jamais, producteurs et consommateurs parlent directement aux brokers.

La question qui revenait en entretien — « ZooKeeper n'est-il pas un point de défaillance unique ? » — appelait une réponse nuancée. ZooKeeper est répliqué, donc pas un SPOF au sens strict, et surtout il est **hors du chemin de données**. Même en cas de perte de quorum, les producteurs et consommateurs *déjà connectés* continuaient d'écrire et de lire auprès des brokers ; ce qui cassait, c'était l'arrivée de nouveaux consommateurs, le rééquilibrage et le commit d'offsets. Panne de ZooKeeper égalait **dégradation temporaire, pas panne totale**.

### Pourquoi on l'a abandonné

Malgré ça, ZooKeeper avait des défauts structurels : un système de plus à déployer, exploiter et superviser ; et surtout un **goulet d'étranglement de scalabilité**. Sur les très gros clusters (des centaines de milliers de partitions), la gestion des métadonnées via ZooKeeper devenait le facteur limitant, notamment lors des élections de leaders en masse après une panne.

Deux évolutions ont progressivement vidé ZooKeeper de sa substance. D'abord, comme vu au chapitre 4, les **offsets ont migré vers `__consumer_offsets` dès 0.9 (2015)**. Ensuite, la **coordination des groupes** est passée dans les brokers. Il ne restait plus à ZooKeeper que les métadonnées du cluster et l'élection des leaders.

### KRaft, l'état actuel

**KRaft** (*Kafka Raft*) supprime entièrement la dépendance à ZooKeeper en gérant les métadonnées **avec Kafka lui-même**. L'idée est cohérente avec toute la philosophie du système : puisque Kafka excelle à répliquer un log, pourquoi ne pas stocker **les métadonnées du cluster dans un log Kafka interne**, répliqué via le protocole de consensus **Raft** entre quelques brokers désignés *controllers* ? Les métadonnées deviennent un log répliqué comme les autres, et les brokers en sont de simples consommateurs.

Les bénéfices : **un seul système** à exploiter au lieu de deux, un déploiement plus simple, et surtout une **bien meilleure scalabilité** — les métadonnées ne passent plus par un service tiers, et la propagation des changements (élections de leaders comprises) est nettement plus rapide sur les gros clusters.

La chronologie à retenir :

```
0.8  (2013)  Réplication (leader/followers, ISR)
0.9  (2015)  Offsets dans __consumer_offsets (fin des offsets dans ZooKeeper)
0.11 (2017)  Exactly-once (producteur idempotent + transactions)
2.8  (2021)  KRaft en préversion
—    (2022)  KRaft déclaré production-ready (GA)
3.6  (2023)  Tiered storage (archivage des vieux segments vers S3/GCS)
4.0  (2025)  ZooKeeper ENTIÈREMENT SUPPRIMÉ — KRaft est le seul mode
```

Autrement dit : si tu lis un texte qui présente ZooKeeper comme une pièce essentielle de Kafka, tu lis une description d'avant 2022. Le Kafka d'aujourd'hui ne l'utilise plus du tout.

---

## 11. Ce que le log a rendu possible : l'écosystème

Reste à comprendre pourquoi cette « simple » abstraction a essaimé bien au-delà d'une file de messages.

Chez LinkedIn, Kafka a d'emblée servi de **colonne vertébrale unique** entre deux mondes. Côté centre de données principal, les services frontaux émettent leurs événements dans Kafka, où des **consommateurs temps réel** (recommandations, pertinence de recherche, détection de fraude, fil d'actualité) puisent en continu. En parallèle, un cluster Kafka du **centre de données d'analyse** tire ces mêmes flux et les met à disposition de Hadoop et de l'entrepôt pour le batch. Un seul flux, deux régimes de consommation, sans duplication de pipeline — c'était toute la promesse initiale, et elle tenait avec des débits de près d'un milliard de messages par jour et une latence de bout en bout d'une dizaine de secondes.

Cette position de « log central » a fait naître un écosystème. **Kafka Connect** standardise l'ingestion et l'export vers des systèmes externes (bases, entrepôts, object stores) sans écrire de code. **Kafka Streams** est une bibliothèque de traitement de flux qui vit *dans ton application Java* — pas de cluster Hadoop ou Spark à côté : tu déclares des transformations (filtres, agrégations, jointures, fenêtres) sur des topics, et l'état intermédiaire est lui-même stocké dans des topics compactés. La **Schema Registry** (Confluent) fait respecter des schémas (Avro, Protobuf) pour que producteurs et consommateurs évoluent sans se casser mutuellement. **ksqlDB** pose du SQL par-dessus les flux. Et le **tiered storage** (3.6) déporte les vieux segments vers un stockage objet bon marché, ouvrant la voie à une rétention quasi infinie à coût maîtrisé — le log devient alors non seulement un tuyau temps réel mais une archive interrogeable.

Kafka a aussi inspiré toute une famille de systèmes. **Apache Pulsar** reprend l'idée avec multi-tenancy et géo-réplication natives, au prix d'une architecture plus complexe. **AWS Kinesis** en propose une version managée, au prix du *vendor lock-in*. **Apache Flink** se marie fréquemment à Kafka : Kafka fournit l'ingestion durable et rejouable, Flink le traitement de flux complexe (fenêtrage sophistiqué, *complex event processing*).

Le fil conducteur de tout cet écosystème est l'idée articulée par Jay Kreps dans *The Log* : **un log ordonné et rejouable est une primitive suffisante pour construire des bases de données, des caches, des index de recherche et des pipelines d'analyse**, en les traitant tous comme des consommateurs qui matérialisent une vue de ce même log. Kafka n'a pas seulement accéléré les files de messages ; il a proposé une façon différente de penser l'architecture des données, où le log est la source de vérité et où tout le reste en dérive.

---

## À retenir

1. **Kafka est un log, pas une file.** Les messages sont des entrées immuables ajoutées en fin de fichier et conservées selon une politique de rétention, pas effacées à la lecture. Cette seule décision débloque l'écriture séquentielle, la relecture (rewind) et un broker quasi sans état.

2. **Topic → partitions → offsets.** Un topic est un ensemble de partitions ; chaque partition est un log ordonné réparti sur les brokers ; un offset est une position dans une partition. L'**ordre n'est garanti qu'à l'intérieur d'une partition** ; une clé de partition permet d'y router les messages liés pour les ordonner tout en gardant du parallélisme ailleurs.

3. **Pull + broker sans état = scalabilité.** Les consommateurs tirent à leur rythme (avec long polling pour la latence) et retiennent eux-mêmes leur offset — aujourd'hui dans le topic `__consumer_offsets`. Un consommateur lent ou en retard n'affecte ni les producteurs ni les autres consommateurs ; il rattrape, ou perd les messages expirés au-delà de la rétention.

4. **Durabilité réglable : réplication, ISR, `acks`.** Chaque partition a un leader et des followers ; l'**ISR** est l'ensemble dynamique des répliques à jour. Le producteur arbitre débit/sécurité via `acks` (`0`/`1`/`all`), combiné à `min.insync.replicas`. `acks=all` garantit qu'un message committé survit tant qu'une réplique de l'ISR vit.

5. **Deux politiques de conservation.** La **rétention** temporelle (ou par taille) efface les vieux segments en bloc. La **compaction** garde la dernière valeur par clé, transformant le log en table — base du CDC, de l'état des applications de streaming et de `__consumer_offsets` lui-même.

6. **Exactly-once existe depuis 0.11 (2017), sans 2PC.** Producteur idempotent (PID + numéro de séquence par partition, déduplication côté broker) plus transactions (écritures atomiques multi-partitions + offsets, lues en `read_committed`). Le surcoût est quasi nul ; le « exactly-once qui divise le débit par 50 » est un mythe hérité de 2011. On l'active là où la sémantique l'exige ; at-least-once reste le défaut pragmatique.

7. **La vitesse vient de l'OS, et ZooKeeper appartient au passé.** I/O séquentielle, délégation du cache au page cache (pas de double buffering ni de pauses GC), et `sendfile` zero-copy expliquent que « sur disque » ne veut pas dire « lent ». Côté coordination, les offsets ont quitté ZooKeeper en 0.9, **KRaft** l'a remplacé (GA 2022), et ZooKeeper a été **entièrement supprimé en Kafka 4.0 (2025)**.

---

## Pour aller plus loin

- **Kafka: a Distributed Messaging System for Log Processing** — Kreps, Narkhede, Rao (NetDB 2011). Le papier fondateur. À lire en gardant en tête que réplication, EOS et KRaft sont *postérieurs* : c'est une photographie de 2011, pas l'état de l'art.
- **The Log: What every software engineer should know** — Jay Kreps (LinkedIn Engineering). Le texte philosophique qui explique pourquoi le log est une primitive universelle. Le plus important si tu ne dois en lire qu'un.
- **Building a Replicated Logging System with Apache Kafka** — Wang et al. (VLDB 2015). La réplication et le CDC en profondeur.
- **Kafka, Samza and the Unix Philosophy of Distributed Data** — Martin Kleppmann. Kafka comme brique de composition, dans l'esprit Unix.
- **Designing Data-Intensive Applications** — Kleppmann, chapitre 11 (*Stream Processing*). Le meilleur cadre général pour situer Kafka parmi les logs, les files et le traitement de flux.
- **Code source** — `apache/kafka` : `core/.../log/` (implémentation du log), `core/.../coordinator/` (coordination des groupes), `clients/.../clients/` (producteur et consommateur). Lire le code du log est particulièrement instructif pour toi : segments, index, et gestion du page cache y sont explicites.
- **À expérimenter** — monte un cluster local en mode KRaft (sans ZooKeeper), écris un producteur et un consommateur, puis joue avec le nombre de partitions, `acks`, la clé de partition et le rééquilibrage pour *sentir* les compromis décrits ici.
