# System Design : une méthode pour raisonner, pas un catalogue à réciter

Il existe une intuition libératrice quand on a lu assez de papiers d'infrastructure — GFS, Dynamo, Spanner, Kafka, Bigtable, Borg, sans oublier PostgreSQL et Redis :

> **Tout grand système est fait des mêmes dix patterns, assemblés différemment.**

Ce n'est pas une formule marketing. C'est une observation qui change la façon d'aborder un problème de design. Quand on comprend cela, on cesse de mémoriser des architectures et on commence à **raisonner** : on reconnaît le problème sous-jacent, on sait quel pattern il appelle, et surtout on sait ce qu'il coûte. La différence entre un bon ingénieur et un excellent CTO n'est pas de connaître le *comment* de chaque pattern — c'est de savoir *quand* le sortir, et quand s'en abstenir.

Ce chapitre a deux objectifs. D'abord vous donner une **méthode reproductible** pour attaquer n'importe quelle question de design, celle qu'on attend en entretien chez Google, Meta ou Stripe, et celle qui sert vraiment en production. Ensuite passer en revue les briques de base — une par une, avec à chaque fois le problème qu'elles résolvent, l'intuition, le détail technique précis, et le prix à payer. On terminera par des designs complets déroulés avec la méthode, puis par les erreurs qui reviennent le plus souvent.

---

## La méthode : cinq mouvements, toujours les mêmes

Face à « Design Slack » ou « Design un raccourcisseur d'URL », la panique vient de l'impression qu'il faut tout inventer. En réalité on suit toujours la même partition. Cinq mouvements, dans l'ordre, chacun nourrissant le suivant.

**1. Clarifier (≈ 5 min).** Avant de dessiner quoi que ce soit, on cadre. Deux familles de questions. Les **exigences fonctionnelles** : quelles sont les features vraiment centrales ? Le système est-il *read-heavy* ou *write-heavy* ? Faut-il privilégier la cohérence ou la disponibilité ? Les **exigences non-fonctionnelles**, plus quantitatives : combien d'utilisateurs, combien de requêtes par seconde ? Quelle latence acceptable au P99 ? Quelle disponibilité vise-t-on — 99,9 % (soit 8,7 h d'indisponibilité par an) ou 99,99 % (52 min) ? Ce cadrage n'est pas une politesse : il élimine 80 % de l'espace des solutions.

**2. Estimer (≈ 3 min).** Le calcul en coin de nappe. On chiffre le trafic (RPS), le stockage, la bande passante. **Ce sont ces chiffres qui pilotent toutes les décisions suivantes** : ils disent si un seul PostgreSQL suffit ou s'il faut sharder, si les données tiennent en cache ou non. On y revient en détail plus bas, car c'est le mouvement le plus sous-estimé.

**3. Design haut-niveau (≈ 10 min).** On dessine le squelette : `Clients → Load Balancer → Serveurs applicatifs → Base de données → Cache`. On nomme les composants clés, sans encore plonger dans aucun. L'interlocuteur doit voir la forme générale du système.

**4. Modèle de données et API (≈ 10 min).** On définit les entités principales et leurs relations — un schéma relationnel si les données sont structurées, une forme documentaire sinon. Puis les endpoints ou RPC clés, avec la structure des requêtes/réponses. C'est souvent là que les vrais choix se cristallisent.

**5. Deep-dive et goulots (≈ 15 min).** Le cœur de l'exercice. On choisit **la partie difficile** du système et on l'attaque à fond : le goulot de scalabilité, le défi de cohérence, les scénarios de panne. C'est ici qu'on montre qu'on sait raisonner, pas seulement empiler des boîtes. On finit par les préoccupations opérationnelles : quelles métriques surveiller, comment déployer sans coupure, comment récupérer après une perte de données.

Une règle transversale, valable pour les cinq mouvements : **le goulot se déplace**. On corrige une chose, la suivante apparaît. C'est normal, il faut l'accepter et même l'anticiper — un bon deep-dive nomme le prochain goulot avant qu'il ne morde.

---

## L'estimation en coin de nappe : le calcul mental du CTO

C'est le mouvement qui sépare ceux qui devinent de ceux qui savent. Pas besoin de précision à trois décimales — un ordre de grandeur juste suffit à trancher une architecture. Pour cela il faut avoir quelques nombres en tête, une bonne fois pour toutes.

**Tailles de données (octets).** Un caractère : 1. Un `int` : 4. Un `bigint` ou un `timestamp` : 8. Un UUID : 16. Une ligne relationnelle typique : ~100. Un document typique (JSON) : ~500.

**Débits (par seconde).** Un PostgreSQL sur serveur standard encaisse ~5 000 écritures/s et ~50 000 lectures/s (avec cache). Redis : ~100 000 opérations/s sur un thread. Kafka : jusqu'à ~1 000 000 messages/s sur un gros cluster. Un serveur HTTP bien réglé (Go, nginx) : ~10 000 requêtes/s.

**Latences.** Redis : 0,5 ms. PostgreSQL en cache : 5 ms. PostgreSQL sur disque : 50 ms. Lecture S3 : 100 ms. Aller-retour inter-datacenter : ~30 ms.

Voyons la mécanique sur un énoncé banal : *« conçois un système pour 1 million d'utilisateurs par jour »*. Le chiffre impressionne ; le calcul le dégonfle.

On pose 10 requêtes par utilisateur, soit **10 millions de requêtes/jour**. Réparties sur 86 400 secondes, cela fait ~**115 RPS en moyenne**. On suppose un pic à 10× la moyenne — hypothèse standard —, soit ~**1 150 RPS en pointe**.

Combien de serveurs applicatifs ? À 10 000 req/s par serveur, 1 150 RPS tiennent sur **un seul serveur**. On en prendra 2 ou 3 pour la haute disponibilité, pas pour la charge.

Côté base : disons 5 opérations DB par requête, soit 1 150 × 5 ≈ **5 750 ops/s en pointe**. On frôle le plafond d'écriture d'un PostgreSQL (~5 000/s) : il faudra du *connection pooling* et des *read replicas*, mais pas encore de sharding.

Le stockage sur un an : 10 M req/jour × 500 octets ≈ **5 Go/jour**, soit ~**1,8 To/an**. Et le cache : si 20 % des données concentrent 80 % des accès (loi classique), les données « chaudes » pèsent 1,8 To × 0,2 ≈ **360 Go**. Trop pour tout mettre en Redis : on s'appuiera plutôt sur le *buffer pool* de PostgreSQL et un cache sélectif.

La leçon est presque toujours la même : **1 million d'utilisateurs/jour, ce n'est pas si exigeant**. Un PostgreSQL bien réglé et deux ou trois serveurs applicatifs encaissent la charge sans transpirer. Le calcul en coin de nappe sert d'abord à **s'interdire de sur-architecturer**.

---

## Les briques : dix patterns, leur raison d'être et leur prix

### 1. Le leader unique — coordonner sans chaos

**Le problème.** Dès qu'un système distribué doit prendre une **décision unique et faisant autorité** — qui détient la dernière version d'une donnée, qui exécute telle tâche — il faut un point de référence. Sans lui, deux nœuds peuvent décider des choses contradictoires, et c'est le chaos.

**L'intuition.** Un seul chef prend les décisions structurantes ; les autres exécutent. GFS : un master pour les métadonnées, N chunkservers pour les données. Kafka : un leader par partition. PostgreSQL : un primary, N replicas. Bigtable : un master pour l'assignation des tablets, N tablet servers. Kubernetes : un API server adossé à un etcd élu. Toujours le même motif. Le leader accepte les écritures (source unique de vérité), assigne le travail, détecte les pannes, maintient l'état global. Les workers exécutent, servent souvent les lectures, et signalent leur santé au leader. Propriété importante : **le leader peut être sans état**, à condition que l'état vive dans un magasin durable — ce qui rend son remplacement bien plus simple.

**Le détail technique.** Les modes de panne sont prévisibles. Le leader tombe → **élection** (Paxos ou Raft, typiquement 5 à 30 secondes de bascule). Un worker tombe → le leader réassigne son travail. Partition réseau → **risque de split-brain**, deux leaders qui se croient légitimes. La parade classique est le **fencing token** : un numéro de bail monotone que les ressources vérifient, si bien qu'un ancien leader « zombie » se fait rejeter. Côté implémentation : Paxos (Chubby, etcd) est éprouvé mais ardu ; Raft (etcd, CockroachDB) offre les mêmes garanties en étant plus facile à raisonner ; ZooKeeper (Kafka, HBase) est le choix pragmatique très répandu.

Concrètement, pour une plateforme comme n8n, l'élection peut être aussi simple qu'un verrou Redis : un `SET n8n:leader <id> NX EX 30` (bail de 30 s) que le gagnant renouvelle par heartbeat. Un `advisory lock` PostgreSQL joue le même rôle.

**Le prix.** Le leader est un point de contention et un point de défaillance : sa capacité borne les écritures, et sa bascule impose une fenêtre d'indisponibilité. On l'accepte parce que l'alternative — coordonner sans autorité — est bien pire.

### 2. Le log comme source de vérité

**Le problème.** Comment être sûr de pouvoir reconstruire l'état après un crash, rejouer l'histoire pour corriger un bug, ou alimenter plusieurs consommateurs qui ont chacun leur vue des mêmes faits ?

**L'intuition.** On arrête de stocker *l'état courant* et on stocke *la suite des événements qui y ont mené*. L'état devient une fonction du log : `état = fold(log, état_initial)`. Le journal est **append-only** : on ajoute, jamais on ne modifie. C'est la structure de données fondamentale qu'on retrouve partout : le WAL de PostgreSQL (recovery, réplication), Kafka (le log *est* le produit), le commit log de Bigtable (recovery des tablet servers), les checkpoints de Borg, et jusqu'à Git, qui n'est rien d'autre qu'un log de versions.

**Le détail technique.** Sur le chemin d'écriture, on ne fait qu'ajouter : chaque opération devient un événement horodaté et numéroté (`ORDER_CREATED`, version *n*). Sur le chemin de lecture, on **dérive** l'état en repliant les événements d'une entité. Corollaire puissant : le **Change Data Capture (CDC)** transforme une base existante en flux d'événements. `PostgreSQL → Debezium → Kafka` : chaque INSERT/UPDATE/DELETE devient un événement, et tous les consommateurs — moteur de recherche, cache, entrepôt analytique — restent synchronisés depuis cette source unique, sans double écriture applicative.

**Le prix.** Les bénéfices sont réels : piste d'audit gratuite, capacité de *replay*, consommateurs multiples et indépendants, « voyage dans le temps » (l'état à n'importe quel instant). Mais deux coûts : les **lectures deviennent complexes** — il faut maintenir des projections pour interroger vite — et **le stockage croît sans fin**, ce qui oblige à une politique de **compaction**. Un log n'est jamais gratuit ; c'est un pari sur le fait que l'historique vaut son poids en octets.

### 3. La hiérarchie de caches — la pyramide de latence

**Le problème.** Les données lentes à obtenir (disque, réseau, autre région) tuent la latence perçue. Or les ordres de grandeur sont brutaux, et il faut les avoir en tête.

**La pyramide de latence**, du plus rapide au plus lent :

```
Cache L1 CPU     0,5 ns    ← matériel, automatique
Cache L2 CPU       7 ns    ← matériel, automatique
Cache L3 CPU      20 ns    ← matériel, automatique
RAM              100 ns    ← mémoire du process (dict Python local)
Redis            0,5 ms    ← réseau + en mémoire
PostgreSQL      5–50 ms    ← disque (avec buffer pool)
S3 / GCS      50–200 ms    ← object storage
Inter-région    100 ms+    ← latence réseau
```

Entre la RAM (100 ns) et Redis (0,5 ms) il y a un facteur ~5 000 ; entre Redis et un disque, encore un facteur ~10 à 100. Chaque étage qu'on évite fait gagner un ordre de grandeur.

**L'intuition.** On empile les caches comme des étages, du plus proche au plus lointain. **Étage 1** : cache local en process (un dict + LRU, TTL court de ~30 s) — aucun réseau. **Étage 2** : Redis, partagé entre toutes les instances. **Étage 3** : la base, source de vérité. **Étage 4** (optionnel) : un CDN pour le statique et le public. Sur une lecture, on descend les étages jusqu'au premier qui répond, et **on remonte la valeur** dans les étages plus rapides au passage (on « peuple » le local depuis Redis, et Redis depuis la base). C'est le pattern **cache-aside** : l'application lit le cache, et en cas de *miss*, va chercher en base puis écrit dans le cache.

**L'invalidation — le vrai sujet.** « Il n'y a que deux problèmes difficiles en informatique : l'invalidation de cache et nommer les choses. » Quand la donnée change, il faut évincer les copies périmées. Dans le modèle cache-aside, l'écriture invalide explicitement les étages cache (`local.delete`, `redis.delete`) ; la base n'a pas besoin d'invalidation puisqu'elle est la vérité. Le TTL sert de filet de sécurité : même si une invalidation est ratée, la donnée périmée disparaît d'elle-même au bout du délai. Choisir le TTL, c'est arbitrer entre fraîcheur et taux de hit.

**Le démarrage à froid.** Piège classique : juste après un déploiement, le cache est vide, **toutes les requêtes frappent la base** d'un coup, qui s'effondre. La parade est le **cache warming** : pré-charger les clés chaudes (les plus consultées) *avant* de basculer le trafic sur la nouvelle instance.

**Le prix.** Le cache est une drogue : puissant, mais il introduit un second exemplaire de la vérité, donc des **problèmes de cohérence**. On l'utilise délibérément, jamais par réflexe. Chaque cache ajouté est une source potentielle de données périmées servies à l'utilisateur.

### 4. Sharding et réplication — grandir horizontalement

**Le problème.** Une seule base finit par ne plus suffire. Trois symptômes déclenchent la réflexion : la base dépasse ~1 To (backups lents, requêtes lentes) ; le débit d'écriture dépasse la capacité d'une instance (> ~10 000 écritures/s) ; ou des contraintes géographiques imposent de localiser les données (lois de résidence).

**Deux leviers distincts, à ne pas confondre.** La **réplication** copie les *mêmes* données sur plusieurs nœuds — elle sert la disponibilité et la montée en charge des **lectures** (un primary, N read replicas). Le **sharding** partitionne des données *différentes* sur plusieurs nœuds — il sert la montée en charge des **écritures** et du volume. On combine souvent les deux : chaque shard est lui-même répliqué.

**Les stratégies de sharding.** Le **hash sharding** (`hash(clé) % N`) donne une distribution uniforme, sans point chaud — mais interdit les *range scans* efficaces, puisque des clés voisines atterrissent n'importe où. Le **range sharding** (clés A–M sur le shard 0, N–Z sur le 1) rend les *range scans* efficaces à l'intérieur d'un shard, mais crée des points chauds : les données récentes se concentrent souvent sur un seul shard. Le **consistent hashing** place nœuds et clés sur un anneau : ajouter ou retirer un nœud ne déplace qu'une fraction des clés (au lieu de presque tout avec un simple modulo), et les **nœuds virtuels** lissent la distribution — c'est le choix de Dynamo et Cassandra. Enfin le **tenant sharding** (un client = un shard) convient au SaaS multi-tenant : isolation claire, migration d'un tenant facile.

**La trajectoire pragmatique.** Ne shardez pas d'emblée. Pour un SaaS restaurant, par exemple : **Phase 1** (< 100 restaurants) un seul PostgreSQL ; **Phase 2** (100–10 000) *connection pooling* + read replicas ; **Phase 3** (> 10 000) sharding par plage de `restaurant_id` ; **Phase 4** une extension comme Citus qui gère le sharding pour vous. La plupart des projets restent en Phase 1 ou 2 toute leur vie.

**Le prix.** Sharder, c'est renoncer aux requêtes qui traversent les shards (jointures, transactions distribuées, agrégats globaux) — elles deviennent lentes ou impossibles sans machinerie coûteuse. Le re-sharding est une opération délicate. On paie en complexité opérationnelle ce qu'on gagne en capacité. D'où la règle : sharder au dernier moment responsable, pas avant.

### 5. Le choix de cohérence — le spectre, et son coût en latence

**Le problème.** Tout système distribué doit trancher : veut-on que **tous les nœuds voient exactement la même donnée au même instant** (cohérence forte, latence élevée, disponibilité moindre) ou qu'ils **convergent avec le temps** (cohérence à terme, faible latence, forte disponibilité) ? Il n'y a pas de réponse universelle — il y a une réponse *par type de donnée*.

**Le spectre**, du plus strict au plus lâche :

- **Strict serializable** — toutes les opérations apparaissent dans l'ordre temps-réel. Coût : latence élevée (allers-retours Paxos/Raft). Usage : transactions financières, inventaire. Exemples : Spanner, FoundationDB.
- **Linéarisable** — illusion d'une copie unique. Coût : coordination inter-répliques. Usage : élection de leader, configuration. Exemples : etcd, ZooKeeper.
- **Causal** — la cause précède l'effet. Coût : horloges vectorielles, surcoût modéré. Usage : fils sociaux, commentaires. Exemple : MongoDB (sessions causales).
- **À terme (eventual)** — convergera... un jour. Coût : le plus faible (réplication asynchrone). Usage : DNS, préférences utilisateur, compteurs analytiques. Exemples : Cassandra, DynamoDB.

**Le cadre de décision, par type de donnée.** Argent, inventaire, réservations → transactions **serializable** (PostgreSQL fait très bien l'affaire). Préférences ou réglages de profil → **eventual** suffit, l'utilisateur ne remarquera pas 100 ms de délai. Classements, compteurs de vues → **eventual avec correction périodique**. Élection de leader, verrou distribué → **strict**, via etcd/ZooKeeper. Données de session → **eventual**, ou bien des *sticky sessions*.

**CAP, et pourquoi PACELC est plus utile.** Le théorème **CAP** dit qu'en cas de **partition** réseau, il faut choisir entre cohérence et disponibilité. Vrai, mais incomplet : il ne dit rien du fonctionnement normal, sans panne. **PACELC** complète : *si Partition, alors C vs A ; sinon (Else), Latence vs Cohérence*. Autrement dit, même quand tout va bien, exiger la cohérence forte se paie en latence à chaque écriture. C'est ce second terme qui guide le plus de décisions réelles.

**Le prix.** La cohérence coûte de la latence — toujours. La bonne nouvelle : **la plupart des données n'ont pas besoin de cohérence forte**. Le travail du concepteur est de choisir explicitement, donnée par donnée, plutôt que de subir un défaut imposé par un outil.

### 6. Tout en asynchrone — découpler pour survivre

**Le problème.** En **synchrone**, l'appelant attend le résultat. Si le service B est lent, A devient lent, et l'utilisateur aussi. Si B tombe, A renvoie une erreur, et l'utilisateur la voit. Un pic de trafic sur B, et c'est la **panne en cascade** : le couplage serré propage les défaillances comme des dominos.

**L'intuition.** On **découple** : l'appelant dépose une demande et poursuit ; le résultat arrive plus tard. La file de messages est le tampon qui absorbe les à-coups et confine le rayon d'explosion d'une panne.

**Trois patterns asynchrones à connaître.**

*La file de messages (fire and forget).* Un `OrderService` crée la commande en base (rapide), publie un événement `order.created` dans la file (rapide, non bloquant), et **répond immédiatement** sans attendre. Des consommateurs indépendants traitent ensuite : l'`EmailService` envoie la confirmation, l'`InventoryService` décrémente le stock, l'`AnalyticsService` enregistre l'événement, l'`InvoiceService` génère la facture. Chacun avance à son rythme ; si l'un est en panne, les autres continuent, et le travail en retard sera rattrapé.

*Le pattern Saga — transactions distribuées sans 2PC.* Quand une opération traverse plusieurs services, on ne peut pas s'offrir un *two-phase commit* global (lent, fragile). On enchaîne donc des étapes locales, chacune avec son **action compensatoire** en cas d'échec. Réserver l'inventaire (compensation : le relâcher) → débiter le paiement (compensation : rembourser) → confirmer la commande. Si la confirmation échoue, on rembourse ; si le paiement échoue, on relâche l'inventaire. Deux styles : la **chorégraphie**, où chaque événement déclenche l'étape suivante (à base de Kafka), et l'**orchestration**, où un chef d'orchestre central appelle les services dans l'ordre. La saga troque l'atomicité stricte contre la disponibilité, en assumant des états intermédiaires transitoires.

*Le circuit breaker — cesser d'appeler un service qui souffre.* Inspiré du disjoncteur électrique. Trois états. **Fermé** : les appels passent. Après un seuil d'échecs consécutifs (disons 5), il s'**ouvre** : les appels échouent immédiatement, sans même tenter le service défaillant — ce qui lui laisse le temps de récupérer et évite d'aggraver sa surcharge. Après un délai (60 s), il passe en **demi-ouvert** : un appel test est autorisé ; s'il réussit, le circuit se referme, sinon il se rouvre. Le disjoncteur transforme une panne lente et contagieuse en échec rapide et contenu.

**Le prix.** L'asynchrone augmente la résilience mais complexifie le raisonnement : plus de garantie de résultat immédiat, gestion des échecs partiels, débogage plus difficile (le flux n'est plus linéaire). On l'applique là où le découplage vaut cette complexité : traitement de factures, notifications, génération de rapports — asynchrones. Un dashboard temps-réel où l'utilisateur attend — synchrone, avec un cache Redis pour tenir la latence.

### 7. L'idempotence — la clé des systèmes fiables

**Le problème.** Dans un système distribué, **les choses sont réessayées**. Un timeout réseau, une livraison *at-least-once*, un client nerveux qui reclique : la même opération part deux fois. Si « débiter 50 € » s'exécute deux fois, le client est furieux. Il faut que rejouer une opération ne change rien au résultat.

**L'intuition.** Une opération est **idempotente** si `f(f(x)) = f(x)` : l'appeler une fois ou dix fois donne le même état final. Ce n'est pas un luxe, c'est **non négociable** dès qu'il y a des retries.

**Les techniques.**

*Clés d'idempotence.* Le client génère une clé unique (UUID) par intention et l'envoie avec la requête. Le serveur vérifie s'il a déjà traité cette clé : si oui, il renvoie le **résultat mémorisé** ; sinon, il exécute et stocke le résultat associé à la clé (par exemple dans Redis, avec une rétention de 7 jours). Deux envois de la même requête produisent une seule commande.

*Idempotence naturelle.* Certaines opérations le sont déjà. Un `UPDATE orders SET status = 'shipped' WHERE id = 42` donne le même résultat qu'on l'exécute une ou trois fois — on peut le réessayer sans crainte.

*Upsert.* `INSERT ... ON CONFLICT (id) DO NOTHING` : enregistrer deux fois le même événement ne crée pas de doublon. La contrainte d'unicité fait le travail.

**Le pattern outbox — livraison garantie sans 2PC.** Voici le piège subtil : on veut, en créant une commande, publier un événement dans Kafka. Si on écrit en base *puis* on publie, et que le process meurt entre les deux, l'événement est perdu — la base et Kafka divergent. Un *two-phase commit* entre la base et Kafka résoudrait ça, mais il est lent et fragile. La solution élégante : dans **une seule transaction**, écrire la commande *et* insérer l'événement dans une table `outbox` (statut `PENDING`). C'est atomique — les deux sont commitées ou aucune. Un **process séparé** lit ensuite l'outbox, publie vers Kafka, et marque l'événement `SENT`. On obtient une livraison **at-least-once** garantie : si la publication échoue, on la retente depuis l'outbox. (Et comme la livraison est at-least-once, les consommateurs doivent être idempotents — la boucle est bouclée.)

**Le prix.** L'idempotence demande de stocker un état (clés vues, table outbox) et de le nettoyer. C'est un coût modeste au regard de ce qu'il évite : les doubles débits, les doubles emails, les stocks faux. À concevoir **dès le départ**, jamais après coup.

### 8. Le contrôle de flux — load balancing, rate limiting, CDN

Trois briques de « plomberie » qui se placent en amont des serveurs applicatifs et déterminent une grande part de la robustesse perçue.

**Le load balancer** répartit le trafic entrant sur les serveurs applicatifs. Il fait plus que distribuer : il **détecte les serveurs morts** (health checks) et cesse de leur envoyer du trafic, permet le déploiement sans coupure (on retire un serveur du pool, on le met à jour, on le remet), et termine souvent le TLS. Deux subtilités. Les algorithmes : *round-robin* (au tour par tour), *least-connections* (vers le moins chargé), ou *hash* sur une clé. Et les **sticky sessions** : quand un serveur détient un état lié à la connexion — typiquement une WebSocket — le LB doit renvoyer le même client vers le même serveur. C'est pratique mais cela nuit à l'équilibrage et complique les redéploiements ; on préfère quand c'est possible garder les serveurs *stateless* et externaliser l'état (Redis).

**Le rate limiting** protège le système de l'abus et de lui-même. Sans limite, un client (ou un bug, ou une attaque) sature les ressources et prive tous les autres. L'algorithme de référence est le **token bucket** : un seau se remplit de jetons à débit constant ; chaque requête consomme un jeton ; seau vide → requête rejetée (HTTP 429). Il autorise des rafales courtes (le seau plein) tout en bornant le débit moyen. On l'implémente typiquement dans Redis, partagé entre toutes les instances de la passerelle. À décider : limite par utilisateur, par IP, ou par endpoint — souvent les trois.

**Le CDN** (Content Delivery Network) rapproche le contenu de l'utilisateur. Pour tout ce qui est statique ou public — images, JS/CSS, vidéos, fichiers — servir depuis un datacenter unique impose la latence de la distance (rappel : inter-région, 100 ms+). Le CDN met en cache ces objets sur des **points de présence** géographiquement proches : l'utilisateur télécharge depuis le nœud le plus proche, et l'origine est déchargée d'autant. C'est le cache de l'étage 4 de la pyramide, appliqué à l'échelle planétaire. Le prix : l'invalidation à froid (purger un objet mondialement prend du temps) et le versionnement des assets (on ajoute un hash au nom de fichier pour forcer le rafraîchissement).

### 9. Le design d'API — REST, GraphQL ou gRPC

**Le problème.** Le choix du style d'API contamine tout l'aval : le cache, le couplage client/serveur, la performance, l'outillage. Ce n'est pas un détail cosmétique.

**REST** — orienté ressources, natif HTTP. `GET /restaurants/{id}`, `POST /restaurants/{id}/orders`, `PUT /orders/{id}/status`. Ses forces : **cache-friendly** (le cache HTTP fonctionne nativement sur les GET), outillage trivial (curl, navigateur), *stateless* donc facile à scaler, et universel — tout ingénieur le connaît. Ses faiblesses : l'**over-fetching** (on récupère l'objet entier pour deux champs), l'**under-fetching** (il faut trois appels pour peupler un écran), et le versionnement pénible (`/v1/`, `/v2/`).

**GraphQL** — piloté par le client. Une seule requête décrit exactement les champs voulus, sur plusieurs entités liées, en un seul aller-retour. Ses forces : **ni over- ni under-fetching**, auto-documenté (introspection), un endpoint unique, typage fort. Ses faiblesses : le **cache complexe** (chaque requête est unique, le cache HTTP ne mord plus), le **problème N+1** (qui exige un DataLoader pour regrouper les accès), une performance imprévisible (le client peut demander une requête coûteuse), et un outillage plus lourd.

**gRPC** — protocole binaire, serveur à serveur. On définit le service en protobuf ; les clients sont générés dans tous les langages. Ses forces : **~2 à 5× plus rapide que REST** (protobuf binaire, HTTP/2, streaming — le gain varie selon la taille du payload et la sérialisation), typage fort, streaming bidirectionnel. Ses faiblesses : pas natif navigateur (il faut une passerelle gRPC-Web), débogage plus difficile (c'est binaire), et l'évolution des schémas protobuf demande de la rigueur.

**La décision, en pratique.** API publique web/mobile → **REST**. Microservices internes → **gRPC**. Besoins clients riches et variables → **GraphQL**. Streaming temps-réel → **gRPC ou WebSocket**. Et par défaut, en l'absence de raison spécifique : **REST**. La simplicité et l'ubiquité l'emportent tant qu'un besoin précis ne justifie pas de payer la complexité des alternatives.

### 10. Le framework d'entretien — la méthode, condensée

On a ouvert le chapitre avec les cinq mouvements ; c'est exactement le framework attendu en entretien, avec un minutage indicatif : clarifier les exigences (5 min) → estimation coin de nappe (3 min) → design haut-niveau (10 min) → modèle de données (5 min) → design d'API (5 min) → deep-dive sur la partie difficile (15 min) → préoccupations opérationnelles (5 min). Le seul secret est de ne pas sauter d'étape et de **passer le plus de temps sur le deep-dive** — c'est là que se juge la capacité à raisonner. Les deux designs qui suivent montrent la méthode en action.

---

## Design déroulé n° 1 : le raccourcisseur d'URL

Un classique, parfait pour montrer que la méthode marche même quand le problème paraît trivial — et qu'il cache un vrai choix.

**Clarifier.** Deux fonctions : créer un code court depuis une URL longue, et rediriger un code vers l'URL d'origine. Une constatation décisive : le système est **massivement read-heavy** — on lit (redirige) bien plus qu'on écrit (crée). Disons un ratio de 100:1. Les codes doivent être courts, uniques, et les redirections rapides (< 50 ms au P99).

**Estimer.** Supposons 100 M de créations/mois, soit ~40 écritures/s en moyenne. À 100:1, cela fait ~4 000 lectures/s, ~40 000 en pointe. Stockage par entrée : le code (~8 octets), l'URL longue (~500 octets), quelques métadonnées — arrondissons à ~600 octets, disons 1 Ko avec l'index. 100 M/mois × 12 × 5 ans ≈ 6 milliards d'entrées ≈ **~6 To sur 5 ans**. Gros mais gérable ; les 40 000 lectures/s en pointe, elles, exigent du cache.

**Design haut-niveau.** `Clients → CDN/LB → Serveurs applicatifs (stateless) → Cache Redis → Base`. Les redirections chaudes sont servies depuis Redis ; la base est la source de vérité.

**Modèle et API.** Une table `urls(code PRIMARY KEY, long_url, created_at, owner_id)`. Deux endpoints REST : `POST /urls` (corps : l'URL longue → renvoie le code) et `GET /{code}` (renvoie un `301`/`302` vers l'URL longue).

**Deep-dive : comment générer le code ?** C'est *la* partie difficile. Trois options. (a) **Hash de l'URL** (MD5 tronqué) : simple, mais collisions à gérer, et deux utilisateurs raccourcissant la même URL obtiennent le même code — parfois indésirable. (b) **Compteur auto-incrémenté encodé en base62** ([0-9a-zA-Z], 62 symboles) : `bigint` → 7 caractères suffisent pour 62⁷ ≈ 3 500 milliards de codes. Élégant, pas de collision, mais le compteur global est un point de contention et rend les codes devinables (énumérables). (c) **Plages pré-allouées** : un service central distribue des blocs de compteur (p. ex. 1 000 ids) à chaque serveur applicatif, qui les consomme localement. On garde l'unicité sans contention sur chaque écriture — c'est l'approche qui scale. Pour la lecture, tout repose sur le **cache** : les codes populaires vivent en Redis (règle 20/80 oblige), et un *miss* retombe sur la base. On peut même se permettre un `302` plutôt qu'un `301` si l'on veut compter les clics (le `301` serait mis en cache par le navigateur et court-circuiterait le comptage) — un exemple typique de trade-off que le deep-dive doit expliciter.

**Opérations.** Métriques clés : taux de hit du cache, latence P99 des redirections, taux de collision si option (a). La base peut être shardée par `code` (hash sharding) le jour où le volume l'exige — mais pas avant.

---

## Design déroulé n° 2 : le fil d'actualité (feed)

Le feed introduit *le* grand arbitrage du design de systèmes sociaux : **fan-out on write** contre **fan-out on read**. C'est le même dilemme qu'on retrouvera avec Slack.

**Clarifier.** Fonction centrale : afficher à chaque utilisateur un fil des publications des comptes qu'il suit, en ordre à peu près chronologique. Read-heavy, tolérant à une cohérence à terme (voir un post avec quelques secondes de retard n'est pas grave — donnée « eventual »).

**Le cœur du problème.** Quand Alice publie, il faut que ses abonnés voient le post dans leur feed. Deux stratégies opposées.

Le **fan-out on write** (push) : à la publication, on **écrit le post dans le feed pré-calculé de chaque abonné**. Lecture ultérieure ultra-rapide (le feed est déjà prêt, une simple lecture). Mais l'écriture explose pour les comptes à des millions d'abonnés — une célébrité qui poste déclenche des millions d'écritures. C'est le problème du *celebrity fan-out*.

Le **fan-out on read** (pull) : on ne pré-calcule rien ; à la lecture, on **agrège à la volée** les posts récents de tous les comptes suivis. Écriture triviale (un seul insert), mais lecture coûteuse, surtout pour qui suit des milliers de comptes.

**La solution réelle : l'hybride.** Les grandes plateformes combinent les deux. Fan-out on write pour l'utilisateur normal (lecture rapide, écriture raisonnable). Fan-out on read pour les célébrités : leurs posts ne sont *pas* poussés ; on les **mélange à la lecture** dans le feed de leurs abonnés. On obtient le meilleur des deux mondes au prix d'une logique de fusion à la lecture. C'est l'archétype de la réponse de niveau senior : « ça dépend du volume, et voici la ligne de partage ».

**Détail technique.** Les feeds pré-calculés vivent en cache (Redis, listes triées par timestamp), bornés aux N derniers posts. La source de vérité reste la base des posts. La cohérence à terme autorise le CDC : un post publié devient un événement qui alimente asynchronement les feeds. Le prix de l'hybride : de la complexité — deux chemins de code, une frontière « célébrité » à définir et à maintenir.

---

## Design déroulé n° 3 : Slack (messagerie temps-réel)

Question réellement posée en entretien Google. Elle rassemble presque tous les patterns précédents.

**Clarifier.** Features centrales : messagerie temps-réel (livraison < 100 ms), canaux (messagerie de groupe), messages directs, partage de fichiers, recherche, présence en ligne.

**Estimer.** Échelle annoncée : 10 M d'utilisateurs, 100 000 connectés simultanément, 10 M de messages/jour. Le débit : 10 M / 86 400 ≈ **115 messages/s en moyenne, ~1 150 en pointe**. Taille moyenne d'un message : 500 octets. Stockage : 10 M × 500 o ≈ **5 Go/jour** (cohérent avec le calcul générique). Rien d'extrême en volume ; **la difficulté est le temps-réel et le fan-out**, pas la charge brute.

**Design haut-niveau.** Une constellation de services : une **API Gateway** (rate limiting, auth, routage) ; un **Message Service** stateless (créer/livrer les messages) ; un **WebSocket Service** pour la livraison temps-réel (avec *sticky sessions*, puisque la connexion est stateful) ; un **Notification Service** pour les push aux utilisateurs hors-ligne ; un **Search Service** sur Elasticsearch ; un **File Service** sur S3 ; un **Presence Service** sur Redis.

**Modèle de données.**

```
workspaces:      id, name, created_at
channels:        id, workspace_id, name, is_private
users:           id, workspace_id, name, email
messages:        id, channel_id, user_id, content, created_at
channel_members: channel_id, user_id
```

**Décisions clés.** Livraison : **WebSocket + fan-out Kafka**. Stockage des messages : **PostgreSQL partitionné par mois** (les données récentes concentrent les accès). Recherche : **Elasticsearch, alimenté par CDC asynchrone** depuis Postgres. Présence : **Redis avec TTL**, rafraîchi par un heartbeat toutes les 30 s (une clé qui expire = utilisateur hors-ligne). Fichiers : **S3 + CDN** pour le service.

**Deep-dive : le fan-out à grande échelle.** Voici la partie difficile. Un canal peut compter 10 000 membres ; à chaque message, il faut le livrer à tous.

L'**option A — fan-out on write** écrirait le message dans la file de chaque membre : 10 000 écritures par message. Rédhibitoire pour les grands canaux — on retrouve exactement le dilemme du feed.

L'**option B — fan-out on read**, celle de Slack, stocke le message **une seule fois** et s'appuie sur le push temps-réel. Concrètement : le message est publié dans un **topic Kafka par canal** ; le WebSocket Service est abonné à ce topic ; **tous les clients connectés au canal reçoivent le push** en direct ; et les membres **hors-ligne récupèrent les messages non lus à la reconnexion** (fan-out on read). On écrit une fois, on lit à la demande. La présence (Redis) permet de savoir qui est en ligne pour arbitrer entre push immédiat et notification différée. C'est l'application directe des patterns log/async/cache combinés.

**Opérations.** Métriques : latence de livraison P99, profondeur des files Kafka, taux de reconnexion WebSocket. Les *sticky sessions* du WebSocket Service compliquent les déploiements — on draine les connexions progressivement plutôt que de couper net.

---

## Les erreurs qui reviennent

Au fil des designs, les mêmes fautes reviennent. Les nommer, c'est déjà à moitié les éviter.

**Sur-architecturer pour une échelle qu'on n'a pas.** Chaque composant ajouté multiplie la complexité par deux. On sharde une base de 10 Go, on déploie Kafka pour 100 messages/jour, on met du GraphQL là où trois endpoints REST suffisaient. Le calcul en coin de nappe est le meilleur antidote : il montre presque toujours qu'un PostgreSQL et deux serveurs suffisent. **Vous n'êtes pas Google.** Construisez pour votre échelle réelle.

**Optimiser sans mesurer.** « C'est lent » n'est pas un diagnostic. Où ? P50 ou P99 ? Quelle opération ? On ne touche à rien avant d'avoir mesuré ; sinon on optimise le mauvais étage et on déplace le problème sans le résoudre.

**Traiter le cache comme gratuit.** Un cache introduit un second exemplaire de la vérité, donc un risque permanent de servir du périmé. Sans stratégie d'invalidation ni TTL réfléchi, on échange de la latence contre des bugs de fraîcheur difficiles à reproduire. Et sans *cache warming*, le premier déploiement à froid fait tomber la base.

**Oublier l'idempotence.** Concevoir des API qui ne tolèrent pas le retry, c'est signer pour des doubles débits et des doublons le jour — inévitable — où le réseau hoquette. L'idempotence se conçoit en amont, pas en correctif.

**Choisir la cohérence forte par défaut.** Beaucoup imposent des transactions strictes partout « par sécurité », et paient une latence inutile sur des données qui s'accommodent très bien de l'*eventual*. Le défaut devrait être l'inverse : cohérence à terme, sauf raison explicite (argent, inventaire, verrous).

**Coupler les services en synchrone.** Un appel synchrone en chaîne transforme la panne d'un service en panne de tous. Files et circuit breakers ne sont pas du luxe : ils contrôlent le rayon d'explosion.

**Négliger l'exploitation.** Un système difficile à opérer finit par tomber, aussi élégant soit-il. Le monitoring, les alertes, les runbooks, le déploiement sans coupure comptent autant que les features. **Les opérations priment sur les fonctionnalités.**

---

## À retenir

1. **La simplicité gagne.** Chaque composant ajouté double la complexité. Commencez simple, ajoutez quand la douleur est réelle et mesurée — vous n'êtes pas Google.
2. **L'estimation pilote le design.** Trois minutes de calcul en coin de nappe éliminent 80 % des mauvaises architectures et disent si un seul PostgreSQL suffit (souvent : oui).
3. **Le log unifie tout.** WAL, Kafka, Git : tous des journaux append-only d'où l'on dérive l'état. En cas de doute, ajoutez un log — au prix d'un stockage à compacter.
4. **Le cache et l'async sont des leviers à double tranchant.** Le cache achète de la latence contre des problèmes de cohérence (invalidation, warming) ; l'async achète de la résilience contre de la complexité de raisonnement. Les deux, délibérément.
5. **L'idempotence n'est pas négociable.** Toute API qui peut être réessayée doit l'être sans dommage. Clés d'idempotence, upsert, et le pattern outbox pour une livraison at-least-once sans 2PC.
6. **La cohérence se paie en latence — choisissez par donnée.** PACELC est plus utile que CAP : même sans panne, la cohérence forte coûte à chaque écriture. La plupart des données n'en ont pas besoin.
7. **Le goulot se déplace, les opérations priment.** Corrigez-en un, le suivant apparaît — anticipez-le. Et un système qu'on ne sait pas opérer échoue, quelle que soit son élégance.

---

## Pour aller plus loin

- **Fondations conceptuelles** : *Designing Data-Intensive Applications* (Martin Kleppmann) — la référence pour la réplication, le partitionnement, les transactions et la cohérence, en profondeur et sans hype.
- **Les papiers sources** qui sous-tendent ces patterns : GFS et MapReduce (le leader unique et le batch), Dynamo (consistent hashing, eventual consistency), Spanner (cohérence forte distribuée), *The Log* de Jay Kreps (le log comme abstraction unificatrice), Bigtable et Borg.
- **Pratique du design** : *System Design Interview* (Alex Xu) pour dérouler des dizaines de designs avec la même méthode ; le blog *High Scalability* pour des études de cas réelles.
- **Approfondir les briques** : la documentation de Kafka (fan-out, partitions, exactly-once), les patterns de résilience de Netflix (Hystrix pour le circuit breaker), et l'extension Citus pour le sharding PostgreSQL le jour où la Phase 3 arrive.
- **Le fil rouge** : ces patterns s'assemblent différemment selon les besoins, mais ils sont toujours là. Savoir *quand* sortir chacun — et quand s'en abstenir — vaut mieux que de tous les connaître par cœur.
