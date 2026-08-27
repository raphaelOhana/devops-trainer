# Redis, de l'intérieur

*Comprendre un serveur de structures de données en mémoire — la boucle événementielle, le modèle de données, la durabilité, la mémoire et le passage à l'échelle.*

---

## Pourquoi un « serveur de structures de données » ?

La plupart des ingénieurs rangent Redis dans une case étroite : « c'est un cache ». C'est vrai, mais c'est comme dire qu'un couteau suisse est un tournevis. Redis est en réalité un **serveur de structures de données en mémoire** : il expose une douzaine de types natifs — chaînes, hachages, listes, ensembles, ensembles triés, streams — et chacun est une structure de données classique, mais accessible par le réseau, partagée entre tous vos processus, et manipulée par des commandes atomiques.

La différence est profonde. Une base relationnelle vous donne des tables et vous laisse le soin de modéliser. Redis vous donne directement les briques algorithmiques : un compteur atomique, une file, un classement trié, un test d'appartenance en O(1). Le travail de conception ne consiste donc pas à « ranger des données », mais à **choisir la bonne structure pour chaque problème**. Un compteur de vues n'est pas une chaîne JSON qu'on relit et réécrit ; c'est un `INCR`. Un classement n'est pas une requête `ORDER BY` ; c'est un ensemble trié qui reste ordonné en permanence.

Retenez cette idée directrice, car tout le reste en découle : **Redis n'est pas un cache, c'est un serveur de structures de données** — le cache n'est qu'un de ses usages.

Et pourquoi en mémoire ? Parce que la RAM est environ cent mille fois plus rapide que le disque en latence d'accès. En gardant tout le jeu de données en mémoire vive, Redis répond en **dizaines de microsecondes** là où une base sur disque répond en millisecondes. C'est le pari fondateur : sacrifier la capacité (la RAM est chère et limitée) pour gagner un ordre de grandeur en latence.

---

## Le modèle mono-thread : pourquoi c'est rapide, justement

Voici le fait qui surprend toujours les ingénieurs venus du bas niveau : **Redis exécute vos commandes sur un seul thread**. Un cœur. Pas de pool de workers qui se disputent les données. Pour quelqu'un qui a passé des années à raisonner sur le parallélisme et les caches CPU, l'intuition première est que c'est un handicap. C'est l'inverse.

### L'intuition

Imaginez un guichet unique tenu par un employé extrêmement rapide. Les clients font la queue, il traite chaque demande en quelques microsecondes, puis passe au suivant. Comme il n'y a qu'un employé, il n'y a **jamais de conflit** : personne ne modifie la même fiche en même temps, aucun verrou à poser, aucune transaction à arbitrer. Chaque commande est intrinsèquement atomique parce qu'elle s'exécute seule, du début à la fin, sans interruption.

Le multi-threading, dans un magasin de données en mémoire, coûte cher : verrous, sections critiques, invalidations de cache entre cœurs, contention. Ces coûts peuvent dépasser le travail utile. En restant mono-thread, Redis **supprime toute cette classe de problèmes**. Le goulet d'étranglement d'un magasin en mémoire n'est de toute façon presque jamais le CPU — c'est le réseau et la mémoire.

### Le détail technique

Le cœur de Redis est une **boucle événementielle** bâtie sur les primitives du noyau (`epoll` sous Linux, `kqueue` sous BSD/macOS). Le principe est celui de la programmation réseau non bloquante :

```
Boucle événementielle (schématique)

  répéter indéfiniment :
    events = attendre_descripteurs_prêts()     // epoll_wait, ~1 ms max

    pour chaque event dans events :
        si le socket est LISIBLE :
            commande = lire(event.fd)           // la requête d'un client
            résultat = exécuter(commande)        // < 1 ms si O(1) ou O(log N)
            mettre_en_file_de_sortie(event.fd, résultat)
        si le socket est INSCRIPTIBLE :
            vider_les_réponses(event.fd)         // renvoyer aux clients

    traiter_les_timers()                         // expirations TTL, sauvegardes
```

Le thread ne dort jamais sur une opération réseau : il demande au noyau « quels sockets ont des données prêtes ? », traite ce qui est prêt, renvoie les réponses, puis recommence. Un seul thread peut ainsi multiplexer des dizaines de milliers de connexions.

À noter — une précision qui compte depuis Redis 6 : les **entrées/sorties réseau** (lire les octets du socket, écrire la réponse) peuvent être déléguées à plusieurs threads (*I/O threading*). Mais **l'exécution des commandes elles-mêmes reste strictement mono-thread**. Le modèle mental « une commande à la fois » demeure exact et c'est celui sur lequel raisonner.

### Le coût : une commande lente bloque tout le monde

Ce modèle a une contrepartie qu'il faut avoir gravée en tête. Puisqu'il n'y a qu'un thread, **une seule commande lente gèle l'ensemble des clients**. Pendant que l'employé du guichet traite une demande interminable, toute la file attend.

Les coupables classiques sont les commandes en O(N) sur de grosses collections :

- `KEYS *` — parcourt *toutes* les clés de l'instance. À proscrire en production.
- `HGETALL` sur un hachage d'un million de champs.
- `SMEMBERS` sur un ensemble énorme.
- `SORT`, `LRANGE 0 -1` sur des listes gigantesques.

La parade est systématique : pour tout parcours d'une grande collection, utilisez les variantes **incrémentales** — `SCAN`, `HSCAN`, `SSCAN`, `ZSCAN`. Elles renvoient les données par petits lots via un curseur, en rendant la main entre chaque lot. La boucle continue de servir les autres clients pendant que vous itérez.

### L'ordre de grandeur

Sur du matériel banal, une instance Redis traite **100 000 à 200 000 commandes par seconde**. Avec le *pipelining* (que nous verrons plus loin), on dépasse **le million de commandes par seconde** sur une seule instance. Ces chiffres viennent précisément du fait que chaque commande est courte, sans verrou, sans changement de contexte.

---

## Les structures de données et l'art de modéliser

Le vrai savoir-faire Redis tient dans une question, posée à chaque fois : *quelle structure ce problème réclame-t-il ?* Passons-les en revue avec, pour chacune, le problème qu'elle résout et le coût algorithmique.

### String — la brique universelle

La **chaîne** (*string*) est le type de base, mais ne vous fiez pas au nom : une chaîne Redis peut contenir jusqu'à 512 Mo, du texte, du JSON sérialisé, un entier, ou des bits bruts. C'est le couteau de base.

Son usage le plus évident est le **cache** avec expiration :

```python
redis.set("user:1:profile", json.dumps(user_data), ex=3600)  # TTL : 1 h
cached = redis.get("user:1:profile")
```

Mais son usage le plus *intéressant* est le **compteur atomique**. Comme tout est mono-thread, `INCR` lit, incrémente et écrit sans qu'aucune autre commande ne s'intercale — aucun risque de perte de mise à jour, ce fléau des compteurs concurrents :

```python
redis.incr("page_views:home")           # +1 atomique
redis.incrby("user:1:credits", 100)     # +100
redis.decr("inventory:product:123")     # -1 sur le stock
```

Les chaînes servent aussi de **verrou distribué** simple, grâce à deux options de `SET` : `NX` (n'écrire que si la clé n'existe pas) et `EX` (expiration). Le `NX` garantit qu'un seul client obtient le verrou ; le `EX` évite le blocage définitif si le détenteur meurt sans le libérer :

```python
acquired = redis.set("lock:order:456", "my-worker-id",
                     nx=True,    # seulement si la clé n'existe pas encore
                     ex=30)      # expire dans 30 s → pas d'interblocage
if acquired:
    try:
        process_order(456)
    finally:
        # Ne libérer QUE si l'on est toujours propriétaire du verrou
        lua = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        else
            return 0
        end
        """
        redis.eval(lua, 1, "lock:order:456", "my-worker-id")
```

Le petit script Lua à la libération n'est pas décoratif. Sans lui, vous risquez de supprimer le verrou *de quelqu'un d'autre* : si votre traitement a dépassé les 30 secondes, le verrou a expiré, un autre worker l'a repris — et un `DEL` aveugle effacerait le sien. Le script vérifie « est-ce bien mon jeton ? » puis supprime, le tout atomiquement. Gardez cette subtilité en tête, elle revient avec Redlock.

Enfin, un premier **limiteur de débit** en fenêtre fixe (*fixed-window counter*), le plus simple qui soit :

```python
def is_rate_limited(user_id, limit=100, window=60):
    key = f"rate:{user_id}:{int(time.time() / window)}"   # une clé par fenêtre
    count = redis.incr(key)
    if count == 1:
        redis.expire(key, window)      # armer le TTL au premier hit
    return count > limit
```

L'astuce est de faire figurer le **numéro de fenêtre** dans la clé : `int(time.time() / 60)` change de valeur à chaque minute, donc chaque minute a son propre compteur, qui s'auto-détruit par TTL. Simple et robuste. Son défaut — les rafales à cheval sur la frontière de deux fenêtres — sera corrigé plus loin par la version en fenêtre glissante.

### Hash — objets et sessions

Le **hachage** (*hash*) est une table de champs → valeurs *à l'intérieur* d'une seule clé. C'est la structure naturelle pour représenter un objet : une session, une fiche utilisateur, une configuration.

```python
session_key = f"session:{session_id}"
redis.hset(session_key, mapping={
    "user_id": "123",
    "name": "Alice",
    "role": "admin",
    "login_at": "2024-01-15T10:30:00Z",
})
redis.expire(session_key, 86400)  # 24 h
```

L'avantage décisif sur une chaîne JSON est l'**accès par champ**. Avec du JSON, pour lire le seul `user_id` il faut rapatrier tout le blob et le désérialiser. Avec un hachage, on lit ou modifie un champ isolé :

```python
user_id = redis.hget(session_key, "user_id")              # un seul champ
redis.hset(session_key, "last_activity", now_iso())        # écriture ciblée
user_id, role = redis.hmget(session_key, ["user_id", "role"])
```

Le hachage est aussi plus compact. Pour de petits objets, Redis emploie un **encodage interne optimisé** (historiquement *ziplist*, aujourd'hui *listpack*) qui range les champs de façon très dense. À titre indicatif, une session tourne autour de **~100 octets en hachage contre ~150 octets en JSON**. À l'échelle d'**un million de sessions, on parle donc d'environ 100 Mo (hachage) contre 150 Mo (JSON)** — des ordres de grandeur tout à fait modestes, à mille lieues des chiffres alarmistes qu'on lit parfois. Un million de sessions tient sans peine dans la RAM d'une petite instance.

Le hachage brille aussi pour des **compteurs groupés**, par exemple des statistiques temps réel par entité, chaque champ incrémenté atomiquement :

```python
stats_key = f"restaurant:{id}:stats:today"
redis.hincrby(stats_key, "orders", 1)
redis.hincrbyfloat(stats_key, "revenue", order_total)
redis.expire(stats_key, 86400)   # remis à zéro le lendemain
```

### List — files et fils d'activité

La **liste** (*list*) est une séquence ordonnée qui accepte les doublons, avec insertion et retrait en **O(1) aux deux extrémités**. C'est une file (ou une pile) prête à l'emploi.

Son usage canonique est la **file de tâches**. Le producteur pousse à gauche (`LPUSH`), le consommateur retire à droite — et surtout, il le fait en **bloquant** (`BRPOP`), c'est-à-dire qu'il s'endort jusqu'à ce qu'un travail arrive, sans consommer de CPU à interroger en boucle :

```python
# Producteur :
redis.lpush("jobs:email", json.dumps({"to": "alice@x.com", "subject": "Commande confirmée"}))

# Consommateur :
job = redis.brpop("jobs:email", timeout=30)   # attente bloquante, zéro CPU
if job:
    process_email(json.loads(job[1]))
```

Une file simple a un défaut : si le consommateur récupère un job puis meurt avant de le traiter, le job est **perdu**. La parade est la **file fiable à deux listes** : on déplace atomiquement le job vers une liste « en cours » au moment où on le prend, avec `BRPOPLPUSH`. Si le traitement réussit, on le retire de « en cours » ; s'il échoue, on le remet dans la file principale :

```python
job = redis.brpoplpush("jobs:email", "jobs:email:processing", timeout=30)
try:
    process_email(job)
    redis.lrem("jobs:email:processing", 1, job)   # succès → sortir de "en cours"
except Exception:
    redis.rpush("jobs:email", job)                # échec → remettre en file
```

La liste sert aussi de **fil d'activité** borné. On pousse en tête, puis on tronque avec `LTRIM` pour ne garder que les N derniers éléments — la structure ne grossit jamais indéfiniment :

```python
def add_activity(user_id, activity):
    key = f"feed:{user_id}"
    redis.lpush(key, json.dumps(activity))
    redis.ltrim(key, 0, 999)          # garder les 1000 plus récents
    redis.expire(key, 7 * 86400)
```

### Set — unicité et appartenance

L'**ensemble** (*set*) contient des membres **uniques**, non ordonnés, avec ajout, retrait et test d'appartenance en **O(1)**. Dès qu'il s'agit de dédupliquer ou de répondre à « X est-il présent ? », c'est lui.

Un cas typique : compter les **visiteurs uniques**. On ajoute chaque identifiant ; les doublons sont ignorés d'office ; `SCARD` donne le cardinal :

```python
def track_visitor(page, user_id):
    key = f"visitors:{page}:{datetime.date.today()}"
    redis.sadd(key, user_id)          # doublon → ignoré automatiquement
    redis.expire(key, 86400)

def unique_visitors(page):
    return redis.scard(f"visitors:{page}:{datetime.date.today()}")
```

Mais la vraie puissance des ensembles est **l'algèbre ensembliste native** : intersection, union, différence, calculées côté serveur. Cela permet d'exprimer des requêtes qui, ailleurs, demanderaient des jointures :

```python
redis.sadd("product:123:tags", "electronics", "smartphone", "apple")
redis.sadd("product:456:tags", "electronics", "tablet", "apple")

# Tags communs aux deux produits :
common = redis.sinter("product:123:tags", "product:456:tags")   # {"electronics", "apple"}
```

Le même mécanisme modélise un **graphe social** — amis communs par intersection, suggestions par différence :

```python
redis.sadd("user:1:following", 2, 3, 4)
redis.sadd("user:2:following", 1, 3, 5)

mutual   = redis.sinter("user:1:following", "user:2:following")  # {3} : suivis en commun
suggest  = redis.sdiff("user:2:following", "user:1:following")   # {5} : que 2 suit, pas 1
```

Attention toutefois : `SINTER`/`SUNION` sur des ensembles massifs sont en O(N) et rejoignent la catégorie des commandes lentes à surveiller.

### Sorted Set — la structure la plus puissante

L'**ensemble trié** (*sorted set*, ou ZSet) est un ensemble où chaque membre porte un **score flottant**, et la collection reste **triée par score en permanence**. Les opérations sont en **O(log N)**, grâce à une *skip list* doublée d'une table de hachage en interne. C'est, de loin, la structure la plus polyvalente de Redis.

Le **classement** (*leaderboard*) en est l'illustration parfaite. On insère avec un score, on lit le top N déjà trié, on connaît le rang de n'importe quel membre, et on met à jour le score atomiquement :

```python
redis.zadd("leaderboard:2024", mapping={"alice": 9500, "bob": 8200, "carol": 9800})

top10 = redis.zrevrange("leaderboard:2024", 0, 9, withscores=True)
# [("carol", 9800.0), ("alice", 9500.0), ("bob", 8200.0)]

rank = redis.zrevrank("leaderboard:2024", "alice")   # 1 (rang 0-indexé → 2ᵉ)
redis.zincrby("leaderboard:2024", 300, "alice")       # +300, reclassé instantanément
```

En utilisant un **timestamp comme score**, le même type devient une **file différée** (tâches planifiées) : on interroge par plage de scores pour récupérer ce qui est arrivé à échéance.

```python
def schedule_task(task_data, execute_at):
    redis.zadd("delayed:tasks", {json.dumps(task_data): execute_at})

def poll_due_tasks():
    now = time.time()
    for task in redis.zrangebyscore("delayed:tasks", 0, now):   # échéance atteinte
        redis.zrem("delayed:tasks", task)
        execute(json.loads(task))
```

C'est aussi le ZSet qui permet le **limiteur de débit en fenêtre glissante** (*sliding window*), plus précis que la fenêtre fixe vue plus haut. On stocke chaque requête avec son horodatage comme score ; à chaque appel on purge les entrées trop vieilles, on ajoute la requête courante, et on compte ce qui reste dans la fenêtre. Le tout est enveloppé dans un *pipeline* pour n'exiger qu'un seul aller-retour :

```python
def is_rate_limited_accurate(user_id, limit=100, window_ms=60000):
    now = int(time.time() * 1000)
    key = f"rate2:{user_id}"

    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_ms)   # purge des entrées hors fenêtre
    pipe.zadd(key, {str(now): now})                  # ajoute la requête courante
    pipe.zcard(key)                                  # combien dans la fenêtre ?
    pipe.expire(key, window_ms // 1000 + 1)
    results = pipe.execute()

    return results[2] > limit
```

Contrairement à la fenêtre fixe, cette version raisonne sur les **60 dernières secondes réelles** à tout instant, et non sur un découpage en tranches horaires figées — donc pas de faille aux frontières.

### Stream — le journal en append-only (Kafka léger)

Apparu en Redis 5, le **stream** est un journal ordonné et persistant, en écriture par ajout (*append-only*), avec la notion de **groupes de consommateurs**. C'est un « Kafka léger », taillé pour l'event sourcing, les journaux d'audit et les événements inter-services.

Ce qui distingue le stream d'une simple liste, c'est précisément le **groupe de consommateurs** : plusieurs workers d'un même groupe se **répartissent** les messages (chacun en traite une part différente), chaque message doit être **acquitté** (`XACK`), et un message non acquitté peut être **réclamé** par un autre worker si le premier tombe. On obtient une sémantique « au moins une fois » là où la liste ne garantit rien après un crash.

```python
# Produire un événement :
redis.xadd("orders:events", {"type": "ORDER_CREATED", "order_id": "12345", "total": "45.99"})

# Créer un groupe qui lit à partir de maintenant ("$"), en créant le stream au besoin :
redis.xgroup_create("orders:events", "invoice-processor", "$", mkstream=True)

# Un worker lit les messages non encore distribués à ce groupe (">") :
messages = redis.xreadgroup(
    groupname="invoice-processor", consumername="worker-1",
    streams={"orders:events": ">"}, count=10, block=5000,   # bloque 5 s si vide
)
for stream, msgs in messages:
    for msg_id, fields in msgs:
        process_invoice(fields)
        redis.xack("orders:events", "invoice-processor", msg_id)   # accusé de réception

# Récupérer les messages orphelins d'un worker mort (inactifs > 60 s) :
stale = redis.xautoclaim("orders:events", "invoice-processor", "worker-2",
                         min_idle_time=60000, start_id="0-0")
```

### Le tableau de choix

| Structure | Complexité | À utiliser quand… |
|---|---|---|
| **String** | O(1) | cache, compteur atomique, verrou simple, bits |
| **Hash** | O(1) par champ | objet/session à champs accessibles séparément |
| **List** | O(1) aux extrémités | file de tâches, fil d'activité borné |
| **Set** | O(1) | unicité, appartenance, algèbre ensembliste |
| **Sorted Set** | O(log N) | classement, file différée, fenêtre glissante |
| **Stream** | O(1) ajout | journal d'événements, groupes de consommateurs |

---

## Persistance et durabilité : le compromis fondateur

Redis vit en mémoire. La question qui hante tout ingénieur système est donc : *que se passe-t-il quand le processus redémarre ?* La réponse dépend de la stratégie de persistance choisie, et chaque stratégie est un point sur le curseur **durabilité ↔ performance**.

### Zéro persistance — le cache pur

Configuration : `save ""` et `appendonly no`. Rien n'est écrit sur disque ; au redémarrage, tout est perdu. C'est parfaitement acceptable pour un cache ou des sessions reconstructibles depuis la source de vérité. C'est aussi le plus rapide. Le choix est légitime tant qu'on l'assume.

### RDB — les instantanés

Le **RDB** (*Redis Database*) prend des **instantanés ponctuels** de tout le jeu de données, selon des règles de déclenchement :

```
save 3600 1       # sauver si ≥ 1 clé a changé en 1 h
save 300 100      # sauver si ≥ 100 clés ont changé en 5 min
save 60 10000     # sauver si ≥ 10000 clés ont changé en 1 min
```

Le mécanisme est élégant et repose sur une primitive Unix bien connue de tout ancien du bas niveau : `fork()`. Redis fork un processus enfant ; l'**enfant écrit l'instantané** pendant que le **parent continue de servir** les clients. Grâce au *copy-on-write* du noyau, parent et enfant partagent physiquement les mêmes pages mémoire, et seules les pages *modifiées* pendant la sauvegarde sont dupliquées. Le fork est donc généralement peu coûteux — sauf sur un très gros jeu de données très écrit, où la copie des pages peut faire grimper l'usage mémoire et provoquer une latence.

L'avantage du RDB : un fichier compact, un **redémarrage rapide** (on recharge un instantané dense). L'inconvénient : entre deux instantanés, on peut **perdre plusieurs minutes** d'écritures si le processus meurt juste avant la sauvegarde suivante.

### AOF — le journal d'opérations

L'**AOF** (*Append-Only File*) adopte la philosophie inverse : au lieu de photographier l'état, il **journalise chaque opération d'écriture**. Rejouer le journal depuis le début reconstruit l'état exact. La durabilité se règle finement via `appendfsync` :

```
appendonly yes
appendfsync everysec    # fsync chaque seconde → au pire 1 s perdue (défaut recommandé)
# appendfsync always    # fsync à chaque écriture → le plus sûr, le plus lent
# appendfsync no        # l'OS décide → le plus rapide, perte possible
```

Tout se joue sur `fsync`, l'appel qui force réellement l'écriture du cache de l'OS vers le disque. `always` ne rend la main qu'une fois l'octet sur le plateau : sûreté maximale, mais chaque écriture paie la latence du disque. `everysec` regroupe les `fsync` à la seconde : on risque au pire une seconde de données, pour un coût négligeable — c'est le réglage de production par défaut. `no` laisse l'OS choisir : rapide, mais fenêtre de perte imprévisible.

Comme le journal ne cesse de croître, Redis le **compacte** périodiquement (*AOF rewrite*) : il réécrit un journal minimal produisant le même état, en éliminant les opérations rendues obsolètes (mille `INCR` deviennent un seul `SET` à la valeur finale).

### Hybride RDB + AOF — le choix de production

La combinaison recommandée en production réunit le meilleur des deux mondes :

```
appendonly yes
aof-use-rdb-preamble yes    # base RDB compacte + delta AOF récent
```

Le fichier commence par une **base RDB dense** (chargement rapide), suivie d'un **delta AOF** couvrant les écritures les plus récentes (perte minimale). Au redémarrage : on charge l'instantané, puis on rejoue le journal récent. Démarrage rapide *et* fenêtre de perte réduite à la seconde.

### La durabilité vient aussi de la réplication

Dernier point, essentiel : même avec l'AOF le plus strict, un disque unique reste un point de défaillance unique. La vraie durabilité en production vient de la **réplication** — copier les écritures vers d'autres machines — que nous abordons plus bas. Notez seulement ici que la réplication est **asynchrone** : lors d'une bascule, on peut perdre les commandes non encore propagées, soit typiquement **10 à 100 ms** d'écritures. C'est le prix de la performance ; aucune configuration Redis n'offre gratuitement à la fois latence microseconde et durabilité parfaite.

---

## Gestion de la mémoire : `maxmemory` et l'éviction

Voici le réglage le plus important, et le plus souvent oublié, d'un Redis de production. Redis vit en RAM, une ressource **finie**. Que se passe-t-il quand on continue d'écrire dans une instance pleine ?

### Le problème : sans plafond, l'OOM kill

Par défaut, **Redis n'a aucune limite mémoire**. Il grossit, grossit, jusqu'à saturer la RAM de la machine — et alors le noyau invoque l'*OOM killer*, qui abat le processus sans ménagement. Un cache qui accumule des clés sans plan de rétention finira ainsi, un jour, par tuer sa propre instance. C'est un incident de production classique et parfaitement évitable.

La parade tient en deux directives : un **plafond dur** et une **politique d'éviction** décrivant quoi supprimer une fois le plafond atteint.

```
maxmemory 4gb                   # plafond dur sur la mémoire
maxmemory-policy allkeys-lru    # quoi évincer quand c'est plein
```

### Les politiques d'éviction

Le choix de la politique dépend radicalement de la nature de votre instance — **datastore** (source de vérité) ou **cache pur** :

- **`noeviction`** — refuse les nouvelles écritures (renvoie une erreur) une fois pleine. **C'est le défaut.** Correct pour un datastore où perdre une donnée est inacceptable ; **dangereux pour un pur cache**, car votre application se met soudain à recevoir des erreurs d'écriture.

- **`allkeys-lru`** — évince la clé **la moins récemment utilisée** (*Least Recently Used*), parmi *toutes* les clés. C'est le comportement de cache classique : les données froides dégagent pour les chaudes.

- **`volatile-lru`** — même logique LRU, mais uniquement parmi les clés **munies d'un TTL**. Utile quand on mélange, dans une même instance, des données permanentes (sans TTL, jamais évincées) et des données de cache (avec TTL, évinçables).

- **`allkeys-lfu`** — évince la clé **la moins fréquemment utilisée** (*Least Frequently Used*, depuis Redis 4.0). Souvent **meilleur que LRU** pour protéger les *hot keys* : une clé rarement lue mais lue à l'instant ne devrait pas déloger une clé lue des milliers de fois par heure. LFU raisonne sur la fréquence, pas sur la récence.

- **`volatile-ttl`** — évince en priorité les clés dont le **TTL est le plus proche** de l'expiration. Une manière de « laisser partir d'abord ce qui allait mourir de toute façon ».

Le compromis à retenir : **`noeviction` protège les données au prix d'erreurs d'écriture ; les politiques LRU/LFU garantissent la disponibilité en écriture au prix de la perte silencieuse de données froides**. Pour un cache, choisissez explicitement `allkeys-lru` ou `allkeys-lfu` — ne restez jamais sur le défaut `noeviction` par inadvertance.

---

## Passer à l'échelle : réplication, Sentinel, Cluster

Une instance Redis a deux limites physiques : la **RAM d'une machine** (le jeu de données doit y tenir) et le **débit d'un cœur** (rappelons le mono-thread). Trois mécanismes, de complexité croissante, repoussent ces limites — chacun pour un besoin distinct.

### Réplication — lecture scalable et copies de secours

Le mécanisme de base est la **réplication primaire → réplicas**. Une instance **primaire** accepte les écritures ; une ou plusieurs **réplicas** en reçoivent une copie asynchrone et peuvent servir les lectures. On obtient deux bénéfices : une **montée en charge des lectures** (on répartit les `GET` sur les réplicas) et des **copies de secours** prêtes à prendre le relais.

Le mot important est **asynchrone** : le primaire confirme l'écriture au client *sans attendre* que les réplicas l'aient reçue. C'est ce qui préserve la latence, mais c'est aussi ce qui crée la fenêtre de perte de 10–100 ms évoquée plus haut lors d'une bascule.

### Sentinel — la haute disponibilité sans partitionnement

La réplication seule ne suffit pas : si le primaire meurt, il faut **promouvoir un réplica** automatiquement, et prévenir les clients du changement d'adresse. C'est le rôle de **Redis Sentinel**.

Sentinel est un ensemble de processus de surveillance. On déploie typiquement **1 primaire, N réplicas, et M sentinelles**. Les sentinelles surveillent le primaire ; quand un **quorum** d'entre elles le déclare mort, elles élisent un réplica, le promeuvent primaire, et reconfigurent les autres. Le quorum (majorité) évite qu'une seule sentinelle, victime d'une coupure réseau, ne déclenche à tort une bascule.

Quand l'utiliser ? Quand vous avez besoin de **haute disponibilité** mais que **le jeu de données tient sur une seule machine**. C'est plus simple que Cluster et couvre la grande majorité des besoins en dessous de ~25 Go.

### Redis Cluster — le partitionnement horizontal

Quand le jeu de données **ne tient plus dans une seule machine**, il faut le **partitionner** (*sharding*) : le répartir sur plusieurs primaires. C'est le rôle de **Redis Cluster**.

Le mécanisme central est celui des **16 384 slots de hachage**. Chaque clé est affectée à un slot par une formule déterministe :

```
slot = CRC16(clé) % 16384
```

Chaque primaire du cluster **possède une plage de slots**. Pour trouver le nœud d'une clé, n'importe quel acteur calcule son slot et sait immédiatement où aller — pas d'annuaire central, pas de recherche. Un déploiement minimal pour la haute disponibilité est **3 primaires × 1 réplica = 6 nœuds** : le cluster tolère alors la perte d'un primaire, dont le réplica prend le relais.

```python
# Chaque clé → slot = CRC16(clé) % 16384
# Chaque primaire possède une plage de slots.
# 3 primaires × 1 réplica = 6 nœuds (minimum pour un cluster HA).
```

**MOVED et ASK.** Comme les clients peuvent contacter n'importe quel nœud, le protocole doit gérer le cas où l'on frappe à la mauvaise porte. Si un nœud reçoit une commande pour un slot qu'il ne possède pas, il répond `-MOVED <slot> <ip:port>` : « ce slot est là-bas, va lui parler ». Le client suit la redirection et, en bon citoyen, **met à jour sa table locale** slot → nœud pour ne plus se tromper. La redirection `-ASK` est sa cousine temporaire : pendant une **migration de slot** en cours, elle signifie « pour cette requête précise, va voir l'autre nœud, mais ne mets pas à jour ta table » — car le slot n'a pas fini de déménager.

**Le hash tag, ou comment co-localiser des clés.** Le partitionnement crée une contrainte : une transaction `MULTI/EXEC` ou un script Lua ne peut toucher que des clés vivant sur **le même nœud**. Or deux clés liées (`user:123:profile` et `user:123:orders`) tomberont, en général, sur des slots différents. La solution est le **hash tag** : si la clé contient une sous-chaîne entre accolades `{...}`, Redis ne hache **que cette portion**. Toutes les clés partageant le même tag atterrissent donc dans le même slot, donc sur le même nœud :

```python
# Ces deux clés tomberont sur le MÊME nœud, car seul "user:123" est haché :
redis.set(f"{{user:{user_id}}}:profile", profile)
redis.set(f"{{user:{user_id}}}:orders",  orders)
# → transactions MULTI/EXEC et scripts Lua multi-clés redeviennent possibles.
```

**Quand basculer sur Cluster ?** Les seuils pratiques :

- Jeu de données **> ~25 Go** : une seule machine ne peut plus tout garder en RAM.
- **> ~200 000 opérations/seconde** : le cœur unique d'un nœud sature.
- Besoin de **scalabilité horizontale des écritures**, pas seulement des lectures (que Sentinel + réplicas couvre déjà).

Le compromis : Cluster apporte la scalabilité horizontale, mais **au prix de la complexité** — reconfiguration cliente, contrainte du même-nœud pour l'atomicité, opérations de rééquilibrage de slots. En dessous de ~25 Go, **Sentinel est presque toujours le bon choix**.

---

## Patterns avancés et pièges

### Pipelining — amortir l'aller-retour réseau

Quand une commande s'exécute en microsecondes mais que l'aller-retour réseau prend une milliseconde, c'est **le réseau qui domine**. Envoyer cent commandes séquentiellement, c'est payer cent fois cette milliseconde. Le **pipeline** règle le problème : on empile les commandes côté client et on les envoie **d'un coup**, en un seul aller-retour, pour recevoir toutes les réponses ensemble.

```python
pipe = redis.pipeline()
pipe.hset("user:1", "name", "Alice")
pipe.sadd("active_users", "1")
pipe.incr("user_count")
pipe.expire("user:1", 3600)
results = pipe.execute()      # UN seul aller-retour pour les 4 commandes
```

C'est ce qui fait passer une instance de ~100 000 à **plus d'un million de commandes/seconde**. Attention : un pipeline **n'est pas** une transaction atomique — les commandes d'autres clients peuvent s'intercaler entre les vôtres. Le pipeline optimise le réseau ; il ne garantit pas l'isolation.

### Scripts Lua — l'atomicité multi-étapes

Quand vous avez besoin d'une vraie **opération atomique en plusieurs étapes** — lire une valeur, décider, écrire selon la décision — le pipeline ne suffit pas. Il faut un **script Lua**. Redis exécute un script Lua **atomiquement** : pendant toute sa durée, **aucune autre commande ne s'exécute** (souvenez-vous du mono-thread — le script monopolise le guichet). Le motif « lire → tester → écrire » devient sûr, sans condition de course.

```lua
-- Décrémenter seulement si la valeur reste positive :
local current = tonumber(redis.call('get', KEYS[1]))
if current and current > 0 then
    return redis.call('decrby', KEYS[1], ARGV[1])
else
    return false
end
```

```python
result = redis.eval(decrement_if_positive, 1, "inventory:product:123", 1)
# Atomiquement : GET → tester > 0 → DECRBY. Parfait pour un stock.
```

Ici, `DECRBY` retranche la quantité passée en argument. Sans le script, deux clients pourraient lire le stock à `1` en même temps, tous deux se croire autorisés, et décrémenter en dessous de zéro — le fameux *oversell*. Le script ferme la fenêtre. Le coût, en contrepartie : un script long **bloque toute l'instance**, exactement comme n'importe quelle commande lente. Gardez-les courts.

### Cache-aside — le pattern de cache par défaut

Le **cache-aside** (chargement paresseux) est de loin la stratégie de cache la plus répandue. La logique : chercher d'abord dans le cache ; en cas de manque, aller chercher à la source, puis peupler le cache pour la prochaine fois.

```python
def get_user(user_id):
    cached = redis.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)              # hit
    user = postgres.query("SELECT * FROM users WHERE id = ?", user_id)
    redis.set(f"user:{user_id}", json.dumps(user), ex=3600)   # miss → peupler
    return user

def update_user(user_id, data):
    postgres.execute("UPDATE users SET ... WHERE id = ?", user_id)
    redis.delete(f"user:{user_id}")            # invalider ! (pas réécrire)
    # La prochaine lecture re-peuplera depuis la base.
```

Le point subtil est l'**invalidation en écriture** : après une mise à jour, on **supprime** l'entrée de cache plutôt que de la réécrire. On évite ainsi d'y placer une valeur intermédiaire potentiellement fausse (en cas d'écritures concurrentes) ; la prochaine lecture reconstruira proprement depuis la source de vérité.

Deux variantes existent, avec leurs compromis. Le **write-through** écrit *simultanément* dans la base et dans le cache : le cache est toujours à jour, mais chaque écriture est plus lente. Le **write-behind** écrit d'abord dans le cache et met la persistance en base dans une file asynchrone : réponse ultra-rapide, mais une panne de la file signifie **perte de données**. À réserver aux cas où l'on peut tolérer cette perte.

### Cache stampede — la ruée sur le cache expiré

Un piège classique : une clé très demandée expire, et **toutes les requêtes en cours ratent le cache simultanément**, se ruant en même temps sur la base — qui s'écroule sous la charge. C'est le *cache stampede* (ou *thundering herd*).

La parade est de **sérialiser la reconstruction** : le premier à constater le manque prend un verrou et va chercher la donnée ; les autres attendent brièvement, puis retrouvent la valeur fraîchement mise en cache. On note le **double contrôle** — on revérifie le cache *après* avoir obtenu le verrou, car un autre a pu le peupler entretemps :

```python
def get_user_safe(user_id):
    cached = redis.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)

    with lock_for(user_id):                    # un seul reconstruit à la fois
        cached = redis.get(f"user:{user_id}")  # double contrôle
        if cached:
            return json.loads(cached)
        user = postgres.query("SELECT * FROM users WHERE id = ?", user_id)
        redis.set(f"user:{user_id}", json.dumps(user), ex=3600)
        return user
```

### Verrous distribués et la mise en garde Redlock

Nous avons vu le verrou simple (`SET ... NX EX`). Il a une faille dans un contexte répliqué. Le primaire accorde le verrou, confirme au client — puis **meurt avant** d'avoir propagé l'écriture à ses réplicas. Un réplica **sans le verrou** est promu primaire. Un second client demande le verrou au nouveau primaire : il est libre. **Deux clients détiennent désormais le même verrou.** La réplication asynchrone, qui nous servait si bien pour la performance, se retourne contre nous.

**Redlock** est l'algorithme proposé pour y remédier. L'idée : au lieu d'un seul Redis, on déploie **N instances indépendantes** (typiquement 5, sans réplication entre elles), et on n'accorde le verrou que si le client parvient à le poser sur une **majorité** — `N/2 + 1` :

```python
class RedLock:
    def __init__(self, redis_instances):
        self.instances = redis_instances
        self.quorum = len(redis_instances) // 2 + 1

    def acquire(self, resource, ttl_ms=30000):
        token = generate_random_token()
        start = current_time_ms()

        acquired = 0
        for r in self.instances:
            try:
                if r.set(f"lock:{resource}", token, nx=True, px=ttl_ms):
                    acquired += 1
            except ConnectionError:
                pass   # instance injoignable → on l'ignore

        validity = ttl_ms - (current_time_ms() - start)   # temps de verrou restant
        if acquired >= self.quorum and validity > 0:
            return Lock(token=token, validity=validity)

        self.release(resource, token)   # échec → tout relâcher
        return None
```

On retrouve deux idées déjà croisées : la **majorité** (comme le quorum de Sentinel) rend l'algorithme robuste à la perte de quelques instances, et le **jeton unique** vérifié à la libération (via le même petit script Lua que le verrou simple) empêche d'effacer le verrou d'autrui.

**La mise en garde, néanmoins.** Redlock est controversé — Martin Kleppmann en a fait une critique célèbre. Le point est fondamental : **aucun verrou distribué fondé sur des expirations temporelles n'est parfaitement sûr** en présence de pauses GC, de dérive d'horloge ou de délais réseau. Un client peut se croire encore détenteur d'un verrou déjà expiré (une longue pause GC a dépassé le TTL), et corrompre une ressource partagée. Si la correction *absolue* est en jeu (débiter un compte, par exemple), un verrou Redis **ne suffit pas** : il faut une garde côté ressource, typiquement un **jeton monotone croissant** (*fencing token*) que le stockage cible vérifie et qui rejette toute écriture porteuse d'un jeton périmé. Utilisez les verrous Redis pour l'**efficacité** (éviter un travail redondant), jamais comme unique rempart de **correction**.

---

## À retenir

1. **Redis est un serveur de structures de données, pas seulement un cache.** Le vrai levier de conception, c'est de choisir la bonne structure — String, Hash, List, Set, Sorted Set, Stream — au lieu de tout empiler en JSON dans des chaînes.

2. **Le mono-thread est une force, mais une commande lente gèle tout le monde.** Bannissez `KEYS *`, `SMEMBERS`/`HGETALL` sur de grosses collections ; itérez avec `SCAN`, `HSCAN`, `SSCAN`, `ZSCAN`.

3. **Mettez un TTL sur tout ce qui peut en avoir.** Sans plan de rétention, la mémoire se remplit. Chaque clé devrait avoir une politique d'expiration.

4. **`maxmemory` + politique d'éviction sont non négociables en production.** Sans plafond, l'OOM kill vous attend. Pour un cache, choisissez explicitement `allkeys-lru` ou `allkeys-lfu` — ne laissez pas traîner le défaut `noeviction`.

5. **La durabilité est un curseur, pas un interrupteur.** RDB = redémarrage rapide, perte de minutes possible. AOF `everysec` = au pire 1 s perdue. L'hybride RDB+AOF est le défaut de production. La réplication étant asynchrone, une bascule coûte 10–100 ms d'écritures.

6. **Choisissez le bon outil d'échelle.** Sentinel pour la haute disponibilité tant que les données tiennent sur une machine (< ~25 Go) ; Cluster (16 384 slots, `MOVED`/`ASK`, hash tags) seulement quand le jeu de données ou le débit d'écriture dépasse une seule instance.

7. **Redis reste un cache, pas la source de vérité.** Gardez PostgreSQL (ou équivalent) comme référence. Et les verrous Redis servent l'efficacité, pas la correction absolue : pour cette dernière, il faut un *fencing token* côté ressource.

---

## Pour aller plus loin

- **Pipeline vs Lua** : le pipeline optimise le réseau (un aller-retour pour N commandes) mais n'est pas atomique ; le script Lua garantit l'atomicité multi-étapes (« lire → tester → écrire »), au prix d'un blocage de l'instance s'il est long. Choisissez selon que vous cherchez le débit ou l'atomicité.
- **LRU vs LFU** : LRU raisonne sur la récence, LFU sur la fréquence. Pour protéger des *hot keys* lues massivement mais irrégulièrement, LFU est souvent supérieur.
- **La critique de Redlock par Kleppmann** : à lire pour comprendre pourquoi tout verrou distribué à base de TTL est faillible, et ce qu'est un *fencing token*. Le chapitre 8 de *Designing Data-Intensive Applications* pose le cadre théorique (horloges, pauses de processus, garanties de consensus).
- **Streams et groupes de consommateurs** : la sémantique « au moins une fois », les messages en attente (*PEL*), `XCLAIM`/`XAUTOCLAIM` — à approfondir dès qu'on remplace une file de tâches par un vrai bus d'événements.
- **Redis Cluster en pratique** : rééquilibrage de slots, resharding en ligne, et les limites des opérations multi-clés — le point le plus délicat d'une migration vers Cluster.
