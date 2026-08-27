# Lire les sources : les grands papiers et les grands post-mortems

## Pourquoi lire l'original plutôt qu'un résumé

Vous avez déjà lu des dizaines de résumés. Des résumés de résumés, même. C'est précisément le problème.

Un résumé vous livre l'interprétation d'un auteur. Le papier original, lui, vous donne autre chose : **les phrases exactes** que les concepteurs ont employées pour justifier leurs compromis, **les chiffres qu'ils ont mesurés** avant de conclure, **les alternatives qu'ils ont rejetées** et pourquoi, et surtout les **caveats subtils** que tout résumé finit par gommer.

Prenez Dynamo. Le résumé vous apprend que « Dynamo utilise la cohérence à terme ». Le papier vous fait comprendre les conditions précises dans lesquelles la cohérence est violée, comment le client doit gérer les conflits, et pourquoi les ingénieurs d'Amazon écrivent noir sur blanc qu'ils ont fait *le choix délibéré d'exposer cette complexité au développeur*. Cette phrase-là, à elle seule, change la façon dont vous concevez une API.

L'objectif de ce chapitre n'est pas de vous faire réviser. C'est un **guide de lecture** : pour chaque papier et chaque incident, il vous dit pourquoi il compte, la seule idée à en retenir, la substance technique précise à garder en mémoire, et la leçon à emporter. Le but final reste d'aller lire les originaux vous-même. Ce texte est là pour vous en donner l'envie et la carte.

Un dernier mot avant de commencer. La différence entre un ingénieur senior et un CTO qui fait vraiment autorité, ce n'est pas le nombre de systèmes qu'il connaît. C'est sa capacité à raisonner comme les gens qui les ont conçus. Un papier ne vous apprend pas « ce qu'Amazon a construit ». Il vous apprend à vous poser la bonne question : *compte tenu des contraintes d'Amazon à ce moment précis, qu'aurais-je construit, et comment cela se compare-t-il à leur choix ?* Si vous savez lire à ce niveau, vous avez extrait toute la valeur du texte.

---

## Comment lire un papier de systèmes (la méthode courte)

La mauvaise manière est universelle : ouvrir le PDF, lire l'abstract, survoler les titres de section, lire la conclusion, refermer en se disant « j'ai compris Dynamo ». Cela produit l'illusion du savoir. Vous retenez trois bullet points et vous oubliez pourquoi quoi que ce soit a été conçu ainsi.

La bonne manière tient en quatre gestes.

**Avant d'ouvrir**, écrivez une phrase répondant à : *quel problème ce système résout-il que les systèmes existants ne savaient pas résoudre ?* Si vous n'y arrivez pas à partir des premiers principes, vous n'êtes pas prêt : vous lirez sans contexte et ne retiendrez rien.

**Première passe (20 min)** : abstract, introduction, titres de section, conclusion. Objectif : cerner le problème résolu et les prétentions du papier. Notez trois questions.

**Deuxième passe (60-90 min)** : lecture complète. À chaque décision de conception, arrêtez-vous et demandez : quelles étaient les alternatives ? Pourquoi les ont-ils rejetées ? Qu'est-ce que ce choix leur a coûté ? Écrivez vos réponses **avant** de lire les leurs.

**Troisième passe (30 min)** : la section évaluation, lentement. Les chiffres ne sont pas de la décoration. Quand un papier annonce une latence au 99e percentile de X sous charge Y, il vous dit où le système casse.

Puis, en une page : quelle est la décision qui m'a le plus surpris ? Que ferais-je différemment aujourd'hui, avec vingt ans de recul ? Où ce design échouerait-il dans mon système actuel ?

Gardez cette grille en tête pendant toute la visite qui suit.

---

## Consensus et coordination

Tout système distribué finit par se heurter à la même question : comment plusieurs machines se mettent-elles d'accord sur un fait unique — qui est le leader, quelle est la dernière valeur écrite — malgré les pannes et le réseau ? C'est le problème du consensus. Trois papiers en dessinent le paysage.

### Raft — le consensus qu'on peut enfin comprendre

**Ongaro & Ousterhout, Stanford, 2014.**

Raft mérite d'ouvrir la marche parce qu'il alimente etcd (donc Kubernetes), CockroachDB, TiKV et une bonne partie des bases distribuées modernes. Mais sa vraie singularité tient dans son intention affichée : l'abstract dit littéralement que **Raft est un algorithme de consensus conçu pour être compréhensible**. C'est rarissime dans la littérature. Paxos est correct depuis des décennies ; il est aussi notoirement pénible à implémenter juste. Raft part du postulat inverse : si les ingénieurs ne comprennent pas l'algorithme, ils l'implémenteront mal, et un consensus mal implémenté est pire que pas de consensus du tout.

**L'idée clé.** Décomposer le consensus en trois sous-problèmes qu'on peut traiter presque séparément : élection d'un leader, réplication du journal, et sécurité (garantir qu'aucune donnée validée n'est perdue).

**La substance à retenir.** L'élection repose sur un **timeout aléatoire compris entre 150 et 300 ms**. Chaque nœud attend un délai tiré au hasard dans cette fenêtre ; le premier à expirer se déclare candidat et sollicite des votes. Le hasard casse la symétrie et évite les votes partagés où deux candidats se bloqueraient mutuellement — et cette fourchette n'est pas arbitraire, elle se cale sur les bornes de latence des messages. La réplication passe par un unique RPC, **AppendEntries**, qui sert à la fois de battement de cœur et de transport du journal : c'est exactement ce qu'etcd fait circuler dans votre cluster à intervalle régulier. La sécurité tient à une restriction d'élection : **un candidat ne peut gagner que si son journal est au moins aussi à jour** que celui de la majorité. Comprenez la définition précise de « à jour » et vous comprenez pourquoi Kubernetes recommande des clusters etcd en nombre impair (3 ou 5) et ce qui se passe le jour où vous perdez la majorité. Enfin, le **consensus conjoint** (joint consensus) explique pourquoi ajouter ou retirer un nœud exige une transition en deux phases plutôt qu'un simple redémarrage.

**La leçon.** La compréhensibilité est une propriété d'ingénierie de premier ordre, pas un luxe. Un système que votre équipe comprend vraiment est un système qu'elle exploite correctement sous pression.

### Chubby — le service de verrous qui a tout influencé

**Burrows, Google, 2006.**

Chubby a inspiré ZooKeeper, qui a inspiré etcd, qui tourne aujourd'hui dans chaque cluster Kubernetes. Lire Chubby, c'est remonter à la source d'une lignée entière.

**L'idée clé — et c'est une décision stratégique, pas technique.** Google avait la compétence pour livrer aux ingénieurs une simple bibliothèque Paxos. Ils ont refusé. La section *Rationale* explique pourquoi : la plupart des développeurs ne veulent pas raisonner sur le consensus, ils veulent un service de verrouillage et un petit magasin de fichiers cohérent. Offrir une primitive de haut niveau plutôt qu'une bibliothèque bas niveau, c'est reconnaître que la culture d'ingénierie d'une organisation fait partie de l'architecture.

**La substance à retenir.** Une cellule Chubby, c'est **cinq réplicas, un maître, Paxos** pour le consensus. Les clients mettent en cache le contenu des fichiers localement, et le maître envoie des **invalidations** : ce hybride pull-push est ce qui rend Chubby scalable, et ZooKeeper reprend le même mécanisme. Les clients s'abonnent à des **événements** (contenu modifié, nœud enfant ajouté, verrou acquis) : c'est l'ancêtre direct des *watches* ZooKeeper et des *watches* etcd sur lesquelles s'appuie la boucle de contrôle de Kubernetes. Ne manquez pas la section 4, où Google admet ses erreurs de conception — notamment la confusion entre verrouillage à gros grain et à grain fin, et les usages que les clients ont détournés.

**La leçon.** Une bonne primitive d'infrastructure encapsule une difficulté que 90 % de vos utilisateurs ne devraient jamais avoir à affronter.

### Spanner — quand le temps devient un problème de physique

**Corbett et al., Google, 2012.**

Spanner est la première base à distribuer les données à l'échelle globale tout en offrant des **transactions distribuées externement cohérentes**. C'est un papier difficile ; il faut y revenir. Mais il contient une idée qui, une fois comprise, ne vous quitte plus.

**L'idée clé : TrueTime.** L'horloge d'un ordinateur ne connaît jamais l'heure exacte — seulement une approximation. L'insight de Spanner est de cesser de faire semblant. TrueTime ne renvoie pas un instant, il renvoie un **intervalle `[earliest, latest]`** qui borne explicitement l'incertitude. L'API tient en trois appels : `TT.now()` donne l'intervalle courant, `TT.after(t)` dit si `t` est définitivement passé, `TT.before(t)` s'il n'est définitivement pas encore arrivé.

**La substance à retenir.** Google garantit une incertitude typiquement **inférieure à 10 ms, souvent inférieure à 1 ms**, au prix de récepteurs GPS et d'horloges atomiques dans chaque datacenter. Le raisonnement en découle mécaniquement : si les intervalles TrueTime de deux transactions ne se chevauchent pas, leur ordre est certain. S'ils se chevauchent, Spanner **attend** que l'incertitude se dissipe avant de valider — c'est le **commit wait**, et il ajoute une latence proportionnelle à l'incertitude de l'horloge. Les lectures seules, elles, se servent sans verrou grâce à la notion de **safe time** : TrueTime fournit un instant sûr auquel lire, ce qui rend Spanner lisible globalement sans coût de verrouillage. La réplication intra-zone passe par Paxos, avec des baux de leader dont TrueTime rend le renouvellement sûr.

**La leçon.** La cohérence externe n'est pas gratuite : elle exige des horloges physiques synchronisées à la milliseconde. Les transactions distribuées globales sont, au fond, un problème de physique autant que de logiciel — et c'est ce que le prix du commit wait vous rappelle.

---

## Stockage et réplication

Voici le cœur historique du domaine : comment ranger, répliquer et servir des données à une échelle où le matériel tombe en panne en permanence.

### GFS — accepter le point unique de défaillance, exprès

**Ghemawat, Gobioff, Leung, Google, 2003.**

Tous les résumés vous disent que GFS a **un seul maître**. Aucun n'explique le raisonnement d'ingénierie derrière l'acceptation délibérée de ce point unique de défaillance à l'échelle de Google.

**L'idée clé.** GFS ne résout pas le problème générique du système de fichiers distribué. Il résout la charge de travail *spécifique* de Google : de gros fichiers (100 Mo à plusieurs Go), des lectures séquentielles massives, des ajouts en flux par des milliers de producteurs concurrents, presque aucune petite écriture aléatoire, et une priorité à la bande passante soutenue sur la latence. La section 2.1 (Assumptions), que tout le monde saute, est en réalité la plus importante : elle vous dit **quand ne pas utiliser** une architecture à la GFS. Si votre charge diffère, ce design est mauvais pour vous.

**La substance à retenir.** Des **chunks de 64 Mo** — le papier explique le compromis exact, ce qui vous fait comprendre du même coup pourquoi HDFS a choisi 128 Mo et pourquoi les deux se défendent. Une **récupération d'espace paresseuse** (lazy garbage collection), non évidente, qui influence votre façon de penser la sémantique de suppression. Et surtout le **record append atomique en « au moins une fois »**, pas « exactement une fois » : votre application *doit* être idempotente. Tout résumé le mentionne ; seul le papier vous en fait sentir le poids.

La phrase à mémoriser : *« GFS a montré qu'il est possible d'assurer la tolérance aux pannes au niveau applicatif avec du matériel modeste. »* Pas dans la couche de stockage — poussée jusqu'à l'application. C'est la philosophie de toute une génération d'infrastructure Google, et la raison pour laquelle MapReduce, Bigtable et Spanner ont tous des mécanismes de reprise et de réconciliation applicatifs.

**La leçon.** Un point unique de défaillance peut être un choix d'ingénierie valide — à condition de connaître exactement les modes de défaillance qu'il crée et de concevoir autour.

### Bigtable — l'ancêtre des LSM-trees

**Chang et al., Google, 2006.**

Bigtable est l'aïeul de HBase, en partie de Cassandra, et de presque tout wide-column store. Il introduit la **SSTable** (sorted string table), abstraction encore fondamentale dans LevelDB, RocksDB et Cassandra.

**L'idée clé.** Le modèle de données est une carte tridimensionnelle indexée par `(row:string, column:string, time:int64) → string`. Cette précision — un octet indexé par ligne, colonne et horodatage — est le modèle mental exact que les résumés ne donnent jamais.

**La substance à retenir.** Bigtable repose sur GFS (pour les SSTables) et Chubby (pour l'élection du maître et le stockage du schéma) : si GFS tombe, Bigtable tombe ; si Chubby tombe, Bigtable ne peut plus servir de nouvelles tablettes. Le maître **ne stocke pas les données** des tablettes, il suit seulement quel serveur est responsable de quelle tablette — étudiez la séquence exacte quand un serveur de tablettes meurt, c'est une leçon propre sur le passage de responsabilité pendant une panne. Enfin, les trois **compactions** (mineure, de fusion, majeure) expliquent d'où vient l'**amplification d'écriture** dans les systèmes à LSM-tree — un concept qui pèse sur chaque décision autour d'une base bâtie sur RocksDB. Les benchmarks de la section 7 vous montrent pourquoi les lectures aléatoires sont des ordres de grandeur plus lentes que les séquentielles : comprenez cela et vous comprenez pourquoi la conception de votre schéma compte énormément.

**La leçon.** Le choix de la clé de ligne détermine la localité des données. C'est la décision de design la plus concrète, et elle se prend au niveau applicatif.

### Dynamo — quelqu'un doit résoudre les conflits

**DeCandia et al., Amazon, 2007.**

Dynamo a introduit ou popularisé un arsenal complet : hachage cohérent, horloges vectorielles, quorums « lâches », anti-entropie par arbres de Merkle, appartenance par gossip. Toute base NoSQL postérieure à 2007 en descend.

**L'idée clé.** Le panier d'achat d'Amazon *doit* toujours être accessible en écriture, même pendant une panne partielle. Cette unique contrainte — « toujours écrivable » — dicte toutes les décisions suivantes. Pour l'obtenir, Amazon a fait un choix radical pour l'époque : **la base ne réconcilie pas les conflits, c'est l'application qui le fait.** *« Le magasin de données ne vise pas la réconciliation ; celle-ci est laissée à l'application. »* Chaque ingénieur ayant construit une base NoSQL après ce papier a dû affronter la même question : qui résout les conflits ?

**La substance à retenir.** Les SLA sont définis au **99,9e percentile**, pas en latence moyenne — l'une des premières formulations publiques de l'idée que la moyenne ment et que la queue de distribution est la réalité. Le **hachage cohérent avec nœuds virtuels** résout l'hétérogénéité des machines (capacités différentes) ; relisez cette section trois fois, tout anneau de hachage distribué en descend. La **preference list** est plus subtile que « répliquer sur N nœuds » : elle saute les nœuds virtuels appartenant à la même machine physique. Les **horloges vectorielles** peuvent croître sans borne, d'où une stratégie d'élagage pilotée par le client — la partie que la plupart des implémentations ratent, et la raison pour laquelle Riak s'en est éloigné. Les paramètres **W, R, N** définissent un **quorum « lâche » (sloppy quorum)**, pas un quorum classique : la distinction est capitale. Détail souvent omis : Amazon a placé le **coordinateur de requêtes côté client**, pas dans la couche de stockage.

**La leçon.** « Toujours écrivable » a un prix, et ce prix est la complexité de réconciliation exportée vers le développeur. Rendez ce compromis explicite dans vos propres API.

### Aurora — le journal *est* la base

**Verbitski et al., Amazon, 2017.**

Aurora est une architecture réellement neuve. Elle sépare la couche SQL de la couche de stockage, distribue les données en six copies sur trois zones de disponibilité, et déplace le traitement du journal redo dans la couche de stockage.

**L'idée clé — « the log is the database ».** Dans un MySQL classique, une écriture engendre un enregistrement de journal redo, un journal undo, une écriture de page, un enregistrement de binlog, et davantage. Aurora n'envoie sur le réseau **que le journal redo**. Le stockage reconstruit les pages à la demande. On cesse d'expédier des pages entières : on n'expédie que la description du changement. C'est ce qui libère le débit en écriture.

**La substance à retenir.** Le modèle de quorum est précis : **6 copies sur 3 AZ, quorum de 4 sur 6 en écriture, de 3 sur 6 en lecture**. Faites le calcul des pannes tolérées : vous pouvez perdre **une AZ entière plus un nœud supplémentaire** et continuer à écrire — une garantie de durabilité qu'aucune base mono-région n'égale. La section 4 (« The Log Marches Forward ») définit le **point de cohérence** : comment Aurora suit, à travers les six nœuds de stockage, quels enregistrements de journal sont durables, et à partir de quand un enregistrement est considéré comme tel.

**La leçon.** Quand on repense ce qui doit vraiment traverser le réseau, on redessine la frontière entre calcul et stockage. C'est le patron de la génération suivante de bases cloud-natives.

### Kafka — un log, pas une file

**Kreps, Narkhede, Rao, LinkedIn, 2011.**

Papier court (6 pages), très lisible. Son intérêt est de révéler le problème *spécifique* de LinkedIn — l'agrégation de logs à grande échelle — qui a dicté chaque choix. Kafka n'a jamais été conçu comme une file de messages généraliste.

**L'idée clé — l'offset.** Kafka stocke les messages comme un **journal en append-only ordonné**. Ce n'est pas le broker qui suit l'état par consommateur : c'est **chaque consommateur qui suit son propre offset**. Conséquence directe : un consommateur peut relire les messages en réinitialisant son offset. C'est ce qui fait de Kafka un *log* et non une *queue*.

**La substance à retenir.** Kafka renonce délibérément aux acquittements par message à la manière traditionnelle (JMS, RabbitMQ) — un compromis assumé en faveur du débit. Il stocke les messages en fichiers de segments et **s'appuie sur le page cache de l'OS**, laissant le système d'exploitation vider les données sur disque plutôt que de le gérer lui-même : brillant ou imprudent selon vos exigences de durabilité, et le papier est explicite sur ce compromis. Enfin, l'appel système **`sendfile` (zero-copy)** transfère les données du disque au réseau sans les recopier dans l'espace applicatif : c'est le mécanisme kernel précis derrière le débit de Kafka, que les résumés évoquent sans jamais l'expliquer.

**La leçon.** En rendant le consommateur responsable de sa position, Kafka transforme un problème de coordination du broker en une simple lecture de journal. Souvent, la bonne architecture consiste à déplacer l'état là où il coûte le moins.

### TAO — servir le graphe social

**Bronson et al., Facebook, 2013.**

Le graphe social de Facebook est un problème de base de données graphe à échelle colossale. TAO décrit la couche de cache conçue spécifiquement pour les traversées de graphe, avec de vrais chiffres sur l'invalidation en système distribué.

**L'idée clé.** Tout, dans le graphe, est soit un **objet** (utilisateur, post, photo), soit une **association** (amitié, like, commentaire). L'API est d'une simplicité remarquable — et c'est cette simplicité au niveau du modèle de données qui a permis l'échelle massive au niveau de l'infrastructure.

**La substance à retenir.** Le cache est **à deux étages, leaders et followers**. Les leaders reçoivent les écritures et invalident les followers ; les followers n'ont donc jamais besoin de parler à la base pour s'invalider. Ce choix à deux niveaux, plutôt qu'une couche de cache unique, est entièrement motivé par l'invalidation.

**La leçon.** La simplicité du modèle de données n'est pas de la naïveté : c'est le levier qui rend le passage à l'échelle possible.

---

## Calcul distribué

### MapReduce — le papier le plus lisible, le plus mal compris

**Dean & Ghemawat, Google, 2004.**

Tout le monde connaît *map* et *reduce*. Presque personne ne lit ce qui se passe quand une tâche échoue en cours d'exécution, pourquoi le maître peut la ré-exécuter sans danger, et pourquoi cette sûreté ne tient qu'à des effets de bord soigneusement contrôlés.

**L'idée clé — la localité.** Google place les workers *map* sur les mêmes machines que les chunks GFS qu'ils lisent, éliminant le transfert réseau des données d'entrée. Posez-vous la question que ce papier vous force à poser : dans votre architecture cloud, calcul et stockage sont-ils colocalisés ou séparés ? La localité des données est une préoccupation de conception de premier ordre.

**La substance à retenir.** Les **backup tasks** répondent au problème des *stragglers* : vers la fin d'un job, on lance des copies redondantes des tâches encore en cours et on garde la première qui finit. C'est l'une des premières descriptions d'exécution spéculative en production, et sa prémisse est limpide : **faire tourner du calcul en trop coûte moins cher qu'attendre une machine lente**. Les raffinements (fonction combiner, types d'entrée/sortie, garanties d'ordre, gestion des effets de bord) sont ce qui a rendu MapReduce réellement praticable.

**La leçon.** La redondance calculée est parfois moins chère que l'attente. Concevez pour le cas lent, pas seulement pour le cas défaillant.

### Borg — l'ancêtre direct de Kubernetes

**Verma et al., Google, 2015.**

Kubernetes descend directement de Borg. Comprendre pourquoi Borg a pris ses décisions explique pourquoi Kubernetes se comporte comme il le fait.

**L'idée clé.** Faire cohabiter sur les mêmes machines des **jobs batch** (basse priorité) et des **services longue durée** (haute priorité), en les ordonnançant différemment. Cette distinction se retrouve trait pour trait dans les priority classes de Kubernetes.

**La substance à retenir.** Borg distingue **ressources compressibles et non compressibles**. Le CPU est compressible : on peut le brider (throttling). La mémoire ne l'est pas : quand on dépasse la limite, il faut expulser. C'est exactement pourquoi l'**OOMKill** existe dans Kubernetes. Le **Borgmaster** est répliqué via Paxos ; étudiez ses temps de bascule et surtout la reconstruction de l'état du cluster au redémarrage — l'une des meilleures descriptions de reprise d'une machine à états en production. Et ne sautez pas la section 8, où Google énumère franchement ce qu'ils ont raté dans Borg et ce que Kubernetes corrige : à lire *avant* n'importe quel aperçu d'architecture Kubernetes.

**La leçon.** Le comportement de vos outils sous contrainte de ressources n'est pas un détail d'exploitation : c'est une décision d'architecture qui remonte jusqu'à la nature physique de chaque ressource.

---

## Autorisation à l'échelle

### Zanzibar — l'autorisation comme problème de données

**Pang et al., Google, 2019.**

Zanzibar est le système d'autorisation de Google : Calendar, Cloud, Drive, Maps, Photos, YouTube. Il traite **plus de 10 millions de vérifications d'autorisation par seconde**. Il a fondé le modèle de contrôle d'accès par relations (ReBAC) qui sous-tend aujourd'hui OpenFGA, AuthZed/SpiceDB et la plupart des systèmes d'autorisation modernes.

**L'idée clé — le tuple.** Toute autorisation devient une donnée : un **tuple `(objet, relation, utilisateur)`**. « A est éditeur du document D » s'écrit comme un tuple ; un groupe s'exprime par des tuples récursifs. C'est le modèle de données qu'ont adopté tous les systèmes d'autorisation modernes.

**La substance à retenir — les zookies.** Le vrai raffinement est de cohérence. Quand vous modifiez une permission, Zanzibar renvoie un jeton, le **zookie** (Zanzibar cookie). Vous le présentez lors des lectures suivantes pour garantir que vous lisez des données **au moins aussi fraîches que votre écriture**. Ce modèle évite la linéarisabilité totale tout en écartant le **« new enemy problem »** : le scénario où vous retirez à quelqu'un l'accès à un document, ajoutez ensuite un contenu sensible, et où une lecture obsolète laisserait « l'ancien ennemi » voir le nouveau contenu. Pour de l'autorisation, ce défaut n'est pas cosmétique, c'est une faille de sécurité — d'où l'importance de comprendre précisément pourquoi les zookies existent. L'**API Watch** permet enfin d'observer les changements de permission pour bâtir des caches côté client conscients des droits.

**La leçon.** Modéliser l'autorisation comme des données relationnelles versionnées, plutôt que comme du code dispersé, permet à la fois l'échelle massive et une garantie de cohérence adaptée à la sécurité. Pour un ancien chercheur en sécurité devenu CTO, c'est probablement le papier le plus directement actionnable de la liste.

---

## Comment lire un post-mortem

Un post-mortem n'est pas un récit. C'est un outil de diagnostic. Le lire pour l'histoire, c'est le lire à l'envers.

On dit « root cause », mais dans un système complexe il n'y en a presque jamais une seule. Il y a une **chaîne de décisions**, chacune raisonnable isolément, qui ensemble créent une condition fragile. L'incident est l'instant où cette condition est activée. Cherchez donc les **facteurs contributifs**, pas la cause unique : quelle condition latente a rendu la panne possible ? Quel monitoring manquait qui l'aurait détectée plus tôt ? Quelle hypothèse s'est révélée fausse ? Combien de temps entre le premier signal et l'impact client ?

Deux autres lectures paient particulièrement. **Ce qu'ils ont choisi de ne pas corriger** : toute liste d'actions post-incident est un jeu de choix ; les items dépriorisés représentent un risque technique consciemment accepté — c'est de l'information organisationnelle. Et **la timeline** : la plupart des incidents comportent un long délai entre premier signal et impact ; le post-mortem révèle si ce délai a été bien employé ou gaspillé.

Quatre questions à répondre pour chacun : qu'est-ce qui a échoué (cause immédiate) ? Pourquoi le système *pouvait-il* échouer ainsi (condition latente) ? Pourquoi ne l'a-t-on pas vu venir (angle mort de détection) ? Qu'a-t-on décidé de ne pas réparer (risque accepté) ?

Passons maintenant aux grands incidents. Je les regroupe non par entreprise mais **par la leçon qu'ils enseignent** — car la vraie découverte, quand on lit assez de post-mortems, c'est que les mêmes patrons se répètent, d'une entreprise à l'autre, d'une année à l'autre, d'une technologie à l'autre.

---

## Les grands post-mortems, par leçon

### « La configuration n'est pas moins risquée que le code »

C'est le patron le plus coûteux de l'histoire récente de l'exploitation.

**Cloudflare, 2019 — une regex met à genoux un réseau mondial.** Cloudflare déploie une règle WAF contenant une expression régulière au **backtracking catastrophique**. Le CPU grimpe à **100 % sur tout le réseau**. Le trafic HTTP chute de **82 %**. Le point crucial : le déploiement n'était pas graduel, *parce que c'était une règle WAF, pas du code* — l'hypothèse de déploiement n'était pas la même. Or cette règle était évaluée sur le chemin critique. La distinction « config » vs « code » devient dangereuse dès que la config est exécutée sur le hot path. Correctif adopté : le trafic est désormais « fantômisé » (shadow) lors des mises à jour de règles.

**Facebook/Meta, 4 octobre 2021 — six heures de noir total.** Un changement de configuration sur les routeurs de backbone **retire les routes BGP** qui annonçaient les serveurs DNS de Facebook au reste d'Internet. Sans ces routes, la résolution DNS de facebook.com échoue partout — Facebook, Instagram, WhatsApp disparaissent. L'effet secondaire est le plus instructif : les ingénieurs ne peuvent pas accéder à distance aux systèmes à réparer, car le VPN qui les authentifie repose sur l'infrastructure Facebook, elle aussi tombée. C'est le **problème d'amorçage (bootstrapping)** : comment restaurer l'accès quand votre système de gestion d'accès est hébergé sur les systèmes mêmes qui sont en panne ? Il a fallu envoyer des ingénieurs physiquement au datacenter, avec des accréditations matérielles.

**La leçon commune.** Un changement de configuration exige la même rigueur qu'un changement de code — et parfois davantage, parce qu'il court-circuite les garde-fous de déploiement. Corollaire, gravé par Facebook : votre **accès d'urgence (out-of-band) doit être indépendant** du système auquel il donne accès. Non négociable.

### « Le split-brain n'est pas hypothétique »

**GitHub, octobre 2018 — 24 heures de réparation manuelle.** Une coupure de fibre entre le datacenter US East Coast et son secours West Coast crée une **partition réseau**. L'outil d'orchestration promeut un réplica en primaire. Le réseau revient — et deux primaires coexistent brièvement. Les systèmes de GitHub empêchent (heureusement) la fusion automatique de bases divergentes, et les ingénieurs réparent les données à la main pendant vingt-quatre heures.

Étudiez pourquoi Orchestrator a fait *ce que sa spécification prévoyait* mais *pas ce que les ingénieurs attendaient*. Étudiez pourquoi la réparation a pris 24 heures et non quelques minutes : des bases primaires divergentes n'ont **pas de solution automatisée**, la réconciliation est manuelle par nature.

**La leçon.** L'automatisation de bascule et l'opérateur humain peuvent, ensemble, créer une situation pire que l'un ou l'autre seul. Le split-brain arrive vraiment en production ; concevez en supposant qu'il arrivera.

### « Une opération jamais répétée prend dix fois plus de temps »

**AWS, S3 US-EAST-1, 2017.** Un ingénieur lance une commande pour retirer quelques serveurs du sous-système de facturation de S3. La commande contient une **faute de frappe**. Beaucoup plus de serveurs que prévu sont retirés. Quand S3 tente de les redémarrer, il trouve le sous-système d'index et le sous-système de placement hors ligne. S3 est indisponible dans US-EAST-1 pendant **quatre heures**. Pourquoi si long ? Parce que ces sous-systèmes **n'avaient pas été redémarrés depuis si longtemps** que le redémarrage a duré bien plus que quiconque ne l'imaginait.

**La leçon.** Les procédures de maintenance et de reprise qui n'ont jamais été *pratiquées* prennent, en situation d'urgence, un ordre de grandeur de plus que prévu. C'est la raison d'être exacte des *game days* et des exercices de reprise après sinistre. Et le risque systémique majeur se loge souvent dans l'**outillage d'opération**, pas dans le service lui-même. Correctifs AWS : validation des entrées de l'outil d'administration, et amélioration délibérée du temps de reprise des sous-systèmes critiques.

### « Une seule dépendance dégradée en entraîne dix autres »

**AWS, Kinesis US-EAST-1, 2020.** Une **expansion de capacité** — l'ajout de nœuds — déclenche une opération de métadonnées qui submerge Kinesis. Les services qui en dépendent (Cognito, CloudWatch, et d'autres) se dégradent, et la panne se propage à tout ce qui dépendait *de ces* services, notamment via l'authentification IAM. Étudiez le paradoxe : **ajouter de la capacité peut provoquer une panne**, et suivez le chemin de cascade de Kinesis vers Cognito vers l'ensemble.

**Slack, janvier 2019.** Une nouvelle fonctionnalité introduit un workflow déclenché par l'utilisateur, capable de provoquer de nombreuses écritures simultanées en base. Sous charge, c'est un **thundering herd** contre la couche de données. Étudiez le lien direct entre lancement de fonctionnalité et charge d'infrastructure — un couplage que les équipes produit sous-estiment presque toujours.

**La leçon commune.** Les défaillances en cascade, où un service dégradé épuise les ressources de ses appelants, sont un patron récurrent. Toute nouvelle charge — même une expansion de capacité, même une fonctionnalité anodine — doit être pensée pour sa pression sur les dépendances en aval.

### « La résilience se prouve, elle ne se déclare pas »

Netflix a la particularité de publier sur la **défaillance provoquée**, pas seulement subie.

**Chaos Monkey.** Netflix tue délibérément des instances de production, en pleine journée ouvrée. Le raisonnement est contre-intuitif mais imparable : puisque les pannes *auront* lieu, autant les découvrir dans des conditions contrôlées plutôt qu'à 3 h du matin un jour férié. Première leçon en tuant des instances : leur système était **bien moins résilient qu'ils ne le croyaient**. L'outil a ensuite grandi, de Chaos Monkey (une instance) à **Chaos Kong** (une zone de disponibilité entière). Le vrai défi fut culturel : accepter d'injecter du chaos en production.

**Hystrix, le circuit breaker.** Avant Hystrix, un service aval lent pouvait épuiser tous les threads du service appelant et provoquer une cascade. Hystrix isole chaque dépendance dans son propre pool de threads et fait **échouer vite** (fail fast) dès qu'un aval ralentit. Retenez la machine à états du disjoncteur : **fermé → ouvert → demi-ouvert**.

**La leçon.** La résilience n'est pas une propriété qu'on déclare, c'est une propriété qu'on prouve par un test adverse. Concevez chaque état pour qu'il soit reconstructible ou stocké ailleurs, en supposant que n'importe quelle instance peut mourir à tout instant.

### Deux cas plus ciblés, mais précieux

**Stripe — l'idempotence.** Le billet de référence sur les **clés d'idempotence**, directement pertinent pour tout système de paiement ou de réservation, ou toute opération dont la double exécution nuit. Comprenez le mécanisme exact (des opérations atomiques en base), ce qui se passe lors d'une panne réseau en milieu de requête, comment le client doit rejouer sa requête avec la même clé, et les cas limites (clés en conflit, clés expirées). Pour un CTO, c'est la brique la plus réutilisable de toute cette liste.

**Discord — Go vers Rust.** Le service *Read States* subissait des pics de latence réguliers. En cause : le **ramasse-miettes (GC) de Go**, qui doit parcourir la mémoire pour trouver les objets à collecter. Réécrit en Rust — sans GC — le service voit les pics disparaître. À lire non pour le débat Go/Rust, mais pour la **méthode** : quelle métrique a révélé le problème (des histogrammes de latence montrant des pics *réguliers*), comment ils ont diagnostiqué une cause spécifiquement liée au GC, et comment se prend la décision de réécrire un service dans un autre langage.

---

## Comment lire un papier, pour de bon

Vous avez la carte ; voici la discipline. Un papier vous donne le cadre de décision des ingénieurs qui ont bâti les systèmes que vous exploitez. Sa valeur ne se libère que si vous cessez de le lire passivement.

À chaque décision de conception, couvrez leur réponse et écrivez la vôtre d'abord. Quelles étaient les alternatives ? Qu'est-ce que ce choix a coûté ? Puis confrontez. L'écart entre votre raisonnement et le leur est exactement là où vous apprenez quelque chose.

Ne sautez jamais la section des hypothèses (comme la 2.1 de GFS) ni celle de l'évaluation. La première vous dit *quand le design ne s'applique pas à vous* — l'information la plus précieuse et la plus systématiquement ignorée. La seconde traduit les compromis en chiffres, et les chiffres disent où le système casse.

Enfin, ni les papiers ni les post-mortems ne remplacent l'expérience de la salle de crise à 3 h du matin, à décider si l'on bloque toutes les écritures ou si l'on risque de perdre des données. Cette expérience-là forge le jugement. Les papiers et les post-mortems, eux, vous donnent le **vocabulaire et la bibliothèque de patrons**. Le jugement naît de l'usage de ce vocabulaire sous pression.

---

## À retenir

1. **Lisez l'original, pas le résumé.** Le résumé donne la conclusion ; le papier donne le raisonnement, les alternatives rejetées et les caveats — c'est le raisonnement qui se transpose à *vos* problèmes.

2. **Les hypothèses avant l'architecture.** GFS, Dynamo, Kafka : chaque design découle d'une charge de travail précise. Connaître les hypothèses, c'est savoir *quand ne pas* copier le design.

3. **Le consensus se paie, la cohérence externe encore plus.** Raft rend le consensus compréhensible (timeouts aléatoires 150-300 ms, journal à jour pour être élu) ; Spanner rend la cohérence globale possible au prix d'horloges atomiques et du commit wait. Le compromis ne disparaît jamais, il se déplace.

4. **Repensez ce qui doit traverser le réseau.** Aurora (« le journal est la base », quorum 4/6 en écriture et 3/6 en lecture) et Kafka (zero-copy, offset côté consommateur) gagnent en déplaçant l'état ou en réduisant ce qu'on transmet.

5. **L'autorisation est un problème de données versionnées.** Zanzibar : tuples `(objet, relation, utilisateur)`, zookies contre le *new-enemy problem*, à plus de 10 millions de checks/s. Le modèle ReBAC est aujourd'hui le standard de fait.

6. **Les post-mortems répètent cinq patrons.** Config traitée comme moins risquée que le code ; bascule correcte selon sa spec mais fausse selon l'opérateur ; monitoring qui alerte sur les symptômes et non sur la condition latente ; procédures de reprise jamais répétées (donc 10× plus lentes) ; cascades où un service dégradé épuise ses appelants. La seule variable, c'est de savoir les reconnaître à temps.

7. **L'accès d'urgence doit être indépendant du système qu'il sauve.** La leçon de Facebook 2021 vaut audit dès cette semaine : votre out-of-band ne doit dépendre d'aucun composant qu'il sert.

---

## Pour aller plus loin

Un ordre de lecture priorisé, du plus rentable au plus exigeant.

**Commencez par le plus lisible et le plus actionnable.** *Raft* (le consensus enfin clair, et c'est etcd sous votre Kubernetes), puis *Dynamo* (les compromis de cohérence exposés au développeur), puis le billet *Stripe sur l'idempotence* (immédiatement applicable à toute API sensible aux doubles exécutions).

**Enchaînez sur les fondations du stockage.** *GFS* et *Bigtable* ensemble — ils se répondent — pour comprendre la localité, les SSTables et l'amplification d'écriture. Puis *Aurora*, pour la génération cloud-native.

**Attaquez ensuite le plus difficile, en y revenant.** *Spanner* et TrueTime : la cohérence externe comme problème de physique. À lire quatre fois, sans se presser.

**Traitez l'autorisation à part, car c'est votre terrain.** *Zanzibar* : le papier le plus directement transposable pour un CTO issu de la sécurité.

**Pour les post-mortems, suivez les leçons plutôt que les entreprises.** Dans l'ordre : *AWS S3 2017* (l'outillage d'opération est le vrai risque), *GitHub octobre 2018* (split-brain et réparation manuelle), *Cloudflare WAF 2019* et *Facebook BGP 2021* (config = code, accès out-of-band), *AWS Kinesis 2020* et *Slack 2019* (cascades), enfin les billets *Netflix* sur le chaos engineering (prouver la résilience).

**Où trouver les papiers, gratuitement.** Tous les papiers USENIX (ATC, NSDI, OSDI) sont libres ; la plupart des papiers SOSP le sont aussi ou existent en version hébergée par les auteurs. Cherchez `usenix.org/publications`, `research.google`, `research.facebook.com`, et `dbdb.io` (Database of Databases) pour les liens par système. Ne payez jamais un papier : cherchez le nom de l'auteur et le titre, la plupart des chercheurs hébergent leur propre PDF.

Lire les papiers est le but. Comprendre *pourquoi* les décisions ont été prises est le résultat. Les appliquer à vos propres systèmes est l'épreuve.
