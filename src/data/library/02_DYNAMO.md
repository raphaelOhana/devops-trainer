# Dynamo — la base de données qui refuse de dire non

## Le problème : un panier qui ne tombe jamais

Commençons par une scène très concrète. Nous sommes chez Amazon, un jour de Black Friday. Des millions de clients cliquent sur « Ajouter au panier » en même temps. Et à cet instant, un câble réseau lâche quelque part dans un datacenter, coupant une partie des serveurs du reste du cluster.

La question qui décide de tout est : **que fait le système quand il ne peut plus garantir que tous les serveurs sont d'accord entre eux ?**

Une base de données relationnelle classique répond : *« Je ne peux pas confirmer que ton écriture sera vue partout de façon cohérente, donc je refuse l'écriture. »* Techniquement irréprochable. Commercialement catastrophique. Pour Amazon, chaque « Impossible d'ajouter au panier » est une vente perdue, multipliée par des millions de clients. Le coût du refus est direct et mesurable en dollars.

L'intuition fondatrice de Dynamo tient en une phrase : **pour un panier d'achat, « toujours accepter une écriture » vaut mieux que « toujours être cohérent »**. Un client qui voit un prix vieux de trois secondes, ou dont le panier doit être réconcilié après coup, est un problème mineur. Un client qui ne peut rien acheter est un problème majeur.

Dynamo est le système qu'Amazon a construit (papier fondateur de 2007, DeCandia et al.) pour tenir cette promesse : **un magasin clé-valeur toujours disponible en écriture** (*always writeable*), quitte à réparer les incohérences plus tard.

Si tu viens du bas niveau et de la sécurité, voici l'analogie qui va te parler : c'est le choix entre un système transactionnel qui bloque le pipeline pour garantir la cohérence, et un système à écritures optimistes qui laisse chacun avancer en spéculant, puis résout les conflits après coup. Dynamo, c'est l'exécution spéculative appliquée au stockage distribué — avec un mécanisme de rollback/réconciliation qui remplace le flush du pipeline.

## Le cadre théorique : le théorème CAP, et pourquoi il faut choisir

Avant d'entrer dans la mécanique, posons la contrainte qui gouverne tout. Le **théorème CAP** (formulé par Eric Brewer) dit qu'un système distribué ne peut garantir simultanément que deux des trois propriétés suivantes :

- **C**onsistency (cohérence) : tous les nœuds voient la même donnée au même instant.
- **A**vailability (disponibilité) : le système répond toujours à une requête.
- **P**artition tolerance (tolérance au partitionnement) : le système continue de fonctionner même quand le réseau se coupe en deux.

Le point crucial, souvent mal compris : **le partitionnement réseau n'est pas une option, c'est une fatalité**. Sur un vrai réseau, les câbles lâchent, les switches redémarrent, les liens saturent. Tu ne *choisis* pas P — tu dois le tolérer. Le vrai choix se réduit donc à : **quand une partition survient, sacrifies-tu C ou A ?**

Un système comme un cluster Paxos/Raft choisit **C** : en cas de partition, la minorité se tait, refuse les écritures, et attend. Cohérent, mais indisponible pour une partie des clients.

Dynamo choisit **A** : c'est un système **AP**. Il reste disponible en écriture des deux côtés de la partition, accepte que les données divergent temporairement, et se donne les moyens de **converger plus tard**. C'est ce qu'on appelle la **cohérence à terme** (*eventual consistency*).

Ce vocabulaire a un nom d'ensemble, en opposition à ACID : c'est **BASE** — *Basically Available, Soft-state, Eventually consistent*. Là où ACID promet qu'une transaction est atomique et cohérente immédiatement, BASE promet que le système reste debout et finit par se remettre d'accord.

Retiens bien : ce n'est pas un défaut d'ingénierie, c'est une **décision documentée et assumée**. Dynamo sait exactement ce qu'il sacrifie, et pourquoi ça vaut le coup pour son domaine.

## Le modèle mental : un anneau de pairs, sans chef

Maintenant, la forme du système. Deux idées structurantes.

**Première idée : il n'y a pas de maître.** Pas de nœud coordinateur central, pas de serveur « primaire ». Chaque nœud fait tourner exactement le même code et joue le même rôle. On dit que l'architecture est **symétrique** et **pair-à-pair** (*peer-to-peer*). C'est un choix profond : un maître, c'est un goulot d'étranglement et un point de défaillance unique. En le supprimant, on supprime la question « que fait-on quand le maître tombe ? » — il n'y a pas de maître à faire tomber.

**Deuxième idée : les données sont disposées sur un anneau.** Imagine un cercle qui représente tout l'espace des valeurs de hachage possibles — de 0 à 2¹²⁸−1, car Dynamo hache les clés en MD5, qui produit 128 bits. Chaque nœud occupe une (ou plusieurs) position sur ce cercle. Chaque clé, une fois hachée, tombe elle aussi quelque part sur le cercle.

La règle d'attribution est d'une simplicité désarmante : **pour trouver qui possède une clé, tu pars de sa position et tu marches dans le sens horaire jusqu'au premier nœud rencontré**. Ce nœud est le propriétaire. Les N−1 nœuds suivants sur l'anneau en gardent des copies.

```
        Nœud A (position 0)
              •
             ╱ ╲
            ╱   ╲
     Nœud D       Nœud B
        •           •
         ╲         ╱
          ╲       ╱
              •
           Nœud C

Clé "user:12345"
  → hash(user:12345) = position X sur l'anneau
  → on marche dans le sens horaire jusqu'au premier nœud ≥ X
  → disons Nœud B : il "possède" la clé
  → on réplique sur les N−1 nœuds suivants (B, C, D)
```

Chaque nœud embarque, à l'identique, la même pile de mécanismes : décider quels nœuds contacter pour une clé, exécuter lectures et écritures avec quorum, versionner les données, détecter les conflits, réparer les répliques en arrière-plan, et maintenir une vue de qui est vivant dans le cluster. On va dérouler ces mécanismes un par un. Chacun résout un problème précis, et chacun a un coût.

## Décision n°1 — Le hachage cohérent : distribuer sans tout casser

**Le problème.** Tu as N nœuds et des millions de clés. Il faut répartir les clés uniformément. La solution naïve saute aux yeux :

```python
noeud = hash(clé) % N     # N = nombre de nœuds
```

Ça marche parfaitement… jusqu'à ce que N change. Ajoute un nœud (passe de 10 à 11), et le modulo change pour **presque toutes les clés** :

```
hash(clé) % 10 = 7    →  nœud 7
hash(clé) % 11 = 5    →  nœud 5   ← la clé a déménagé !
```

Résultat : ajouter une seule machine oblige à déplacer la quasi-totalité des données. C'est ingérable à l'échelle d'Amazon — un enfer de rééquilibrage à chaque changement de topologie.

**La solution : le hachage cohérent** (*consistent hashing*), c'est-à-dire précisément l'anneau décrit plus haut. Sa vertu tient dans une propriété locale : **quand un nœud rejoint ou quitte l'anneau, seuls ses voisins immédiats sont affectés**. Le nouveau nœud s'insère à une position, et reprend uniquement les clés situées entre lui et son prédécesseur. Tout le reste ne bouge pas. On est passé de « déplacer O(toutes les clés) » à « déplacer O(1/N des clés) ».

**Le coût, première version.** Le hachage cohérent basique a un défaut : si tu places les nœuds au hasard sur l'anneau, les arcs entre eux sont inégaux. Un nœud peut hériter de 40 % de l'anneau pendant qu'un autre n'en couvre que 10 %. Tu obtiens des points chauds (*hot spots*).

**La parade : les nœuds virtuels** (*virtual nodes*, ou *tokens*). Au lieu de donner une seule position à chaque machine physique, on lui en donne beaucoup — typiquement des dizaines à quelques centaines de tokens répartis un peu partout sur l'anneau.

```
Nœud A (une seule machine physique) :
  token A1  → position 12345
  token A2  → position 67890
  token A3  → position 11111
  ...        (par ex. ~256 tokens)
```

En éparpillant chaque machine en de multiples petits fragments, la loi des grands nombres fait son œuvre : chaque machine finit responsable d'environ 1/N de l'anneau, avec une variance bien plus faible. La distribution devient nettement plus uniforme.

Cadeau bonus : ce mécanisme gère l'**hétérogénéité matérielle** gratuitement. Une grosse machine ? Donne-lui plus de tokens (disons 512), elle absorbera proportionnellement plus de charge. Une machine standard ? 256 tokens. Le nombre de tokens devient un simple curseur de capacité.

## Décision n°2 — Réplication et quorums N/R/W : le curseur cohérence/disponibilité

**Le problème.** Une seule copie d'une donnée, c'est une donnée perdue au premier disque mort. Il faut répliquer. Mais combien de copies faut-il lire et écrire pour être « sûr » de quelque chose ? C'est ici que Dynamo expose ses trois boutons.

- **N** = le nombre de répliques de chaque donnée. Typiquement **N = 3**.
- **W** = le nombre d'accusés de réception qu'une écriture doit obtenir avant d'être déclarée réussie. Typiquement **W = 2**.
- **R** = le nombre de réponses qu'une lecture doit collecter avant de répondre au client. Typiquement **R = 2**.

L'intuition d'un quorum est celle d'un **recouvrement forcé**. Si tu écris sur au moins W nœuds et que tu lis sur au moins R nœuds, et que **R + W > N**, alors l'ensemble des nœuds lus et l'ensemble des nœuds écrits se **chevauchent forcément** sur au moins un nœud (principe des tiroirs). Ce nœud commun détient la dernière écriture — donc ta lecture la verra.

```
N = 3, R = 2, W = 2   →   R + W = 4 > 3

écriture sur  {A, B}
lecture  sur  {B, C}
recouvrement : {B}   → au moins un nœud a la dernière version
```

C'est le mécanisme classique du quorum, et il donne un curseur continu :

- **R + W > N** te rapproche de la cohérence forte (recouvrement garanti).
- **W petit** (jusqu'à W = 1) rend les écritures ultra-rapides et ultra-disponibles, au prix de la cohérence.
- **R petit** (jusqu'à R = 1) rend les lectures ultra-rapides, idéal pour des données très lues.

Quelques configurations typiques pour fixer les idées. Un service de **catalogue produit**, écrasé de lectures, tournera en **N = 3, R = 1, W = 3** : lectures instantanées (n'importe quelle réplique suffit), écritures plus lourdes mais rares. Un service à l'équilibre prendra **N = 3, R = 2, W = 2**, ce qui tolère la panne d'un nœud tout en gardant un bon compromis.

**L'avertissement crucial — et c'est là que Dynamo diffère d'un manuel.** Il est tentant de croire que R + W > N garantit la **cohérence forte** (la linéarisabilité). C'est faux, pour deux raisons.

D'abord, même un quorum strict R + W > N n'est **pas linéarisable sous concurrence** : deux écritures simultanées peuvent chacune atteindre leur quorum sans se voir. Ensuite — et c'est spécifique à Dynamo — le système utilise un **quorum relâché** (on y vient tout de suite), où les nœuds lus et écrits peuvent former des ensembles **disjoints**. Dans ce cas, le beau raisonnement du recouvrement s'effondre : rien ne garantit qu'un nœud lu ait vu l'écriture.

Autrement dit : **Dynamo est cohérent à terme par construction, et peut retourner des versions conflictuelles**, qu'on réconciliera plus tard avec les horloges vectorielles. Le quorum R/W est un curseur de compromis, pas une garantie de linéarisabilité. Garde cette distinction en tête, elle sépare ceux qui récitent le CAP de ceux qui le comprennent.

## Décision n°3 — Quorum relâché et hinted handoff : rester disponible quand un nœud tombe

**Le problème.** Reprenons N = 3, W = 2. La clé X a pour propriétaires naturels les nœuds `[A, B, C]` (c'est ce qu'on appelle sa **preference list**, la liste ordonnée de ses répliques). Maintenant, C tombe. Un quorum **strict** dirait : il ne me reste que A et B de vivants dans le trio, j'ai juste W = 2, ça passe de justesse — mais si B tombe aussi, l'écriture échoue. Le quorum strict lie ta disponibilité à la santé de trois machines précises.

**La solution : le quorum relâché** (*sloppy quorum*). L'idée : ne pas s'entêter à écrire sur les « bons » nœuds, mais écrire sur les **N premiers nœuds sains** rencontrés en marchant sur l'anneau.

```
preference list de X : [A, B, C]     (C est en panne)

écriture relâchée → on prend les 3 premiers nœuds SAINS : [A, B, D]
                    (D n'est pas dans le trio d'origine, mais il est le
                     suivant disponible sur l'anneau)
```

Mais si D garde bêtement cette donnée, elle sera « mal rangée » : D n'est pas censé posséder X. D'où le **hinted handoff** (« transfert avec indice »). Quand D reçoit l'écriture, elle est estampillée d'un indice : *« cette donnée appartient en réalité à C »*. D la stocke à part, comme un colis en consigne.

```
D stocke : X → (valeur, horloge vectorielle, indice = "appartient à C")

plus tard, quand C revient (D l'apprend via le gossip) :
  D → C : "tiens, voici tes données"
  D supprime sa copie locale
```

**Ce que ça t'achète.** L'écriture est **toujours acceptée** tant qu'il reste au moins W nœuds vivants *n'importe où* dans le cluster — plus seulement dans le trio d'origine. La **durabilité** est préservée (il existe bien N copies physiques, même mal placées). Et la **cohérence à terme** est maintenue : la donnée en consigne migre automatiquement vers son propriétaire légitime dès qu'il réapparaît.

**Le coût.** C'est exactement ce quorum relâché qui casse la garantie de recouvrement du quorum strict. Puisque l'écriture est allée sur `[A, B, D]` et qu'une lecture ultérieure pourrait interroger `[A, B, C]` (avec C revenu mais pas encore réparé), les deux ensembles ne se chevauchent que partiellement, et C peut répondre une version périmée. La disponibilité est achetée avec de la cohérence. C'est cohérent avec toute la philosophie du système.

## Décision n°4 — Les horloges vectorielles : détecter les conflits sans se mentir

**Le problème.** Puisqu'on accepte des écritures un peu partout, on va se retrouver avec plusieurs versions d'une même clé. Question vitale : quand je vois deux versions, **l'une descend-elle de l'autre (auquel cas la plus récente gagne), ou sont-elles réellement concurrentes (auquel cas il y a conflit à résoudre) ?**

**La fausse bonne idée : les timestamps.** « Il suffit de comparer les horodatages, le plus récent gagne. » C'est le piège classique. Les horloges des machines dérivent (*clock skew*), et surtout **un timestamp ne capture pas la causalité**.

```
Nœud A (horloge = 100) : écrit X → version 1 (ts = 100)
Nœud B (horloge = 105) : écrit Y → version 2 (ts = 105)

La version 2 remplace-t-elle la version 1 parce que 105 > 100 ?
→ NON. Ce sont deux écritures concurrentes, sans lien causal.
   Choisir la 2 fait silencieusement disparaître la 1.
```

Le timestamp répond « laquelle est la plus récente ? » alors que la vraie question est « laquelle a *vu* l'autre avant de s'écrire ? ». Ce n'est pas la même chose.

**La solution : l'horloge vectorielle** (*vector clock*). L'idée est de ne pas faire confiance à une horloge murale, mais de **compter les événements par nœud coordinateur**. Une horloge vectorielle est une liste de paires `(nœud, compteur)`. Chaque fois qu'un nœud coordonne une écriture, il incrémente **son propre** compteur.

Déroulons un scénario complet — c'est le cœur du mécanisme, prends le temps de le suivre :

```
1. Un client écrit l'objet.
   Nœud A coordonne → version D1
   horloge : [(A,1)]

2. Le même client met à jour.
   Nœud A coordonne encore → version D2
   horloge : [(A,2)]
   → D2 vient causalement APRÈS D1 (le compteur de A a augmenté)

3. Un autre client met à jour D2.
   Nœud B coordonne → version D3
   horloge : [(A,2), (B,1)]
   → D3 vient APRÈS D2

4. Encore un autre client lit D2 et le modifie.
   Nœud C coordonne → version D4
   horloge : [(A,2), (C,1)]
   → D4 vient APRÈS D2

On a maintenant D3 et D4 :
   D3 : [(A,2), (B,1)]
   D4 : [(A,2), (C,1)]
```

Comment savoir si D3 et D4 sont en conflit ? La règle de comparaison est mécanique : **une horloge V1 est un ancêtre de V2 si tous les compteurs de V1 sont ≤ aux compteurs correspondants de V2** (les nœuds absents comptant pour 0).

```
D3 vs D4 :
  compteur A : 2 == 2   (égalité)
  compteur B : D3 a 1, D4 a 0   → D3 devance D4 sur B
  compteur C : D3 a 0, D4 a 1   → D4 devance D3 sur C

Aucune n'est ≤ l'autre sur tous les axes.
→ CONFLIT : ce sont des écritures concurrentes.
```

Quand Dynamo détecte ce cas, il ne tranche pas tout seul. Il **retourne les deux versions au client**, à charge pour lui de réconcilier. Et la réconciliation produit une version qui *domine* les deux ancêtres :

```
Le client fusionne D3 et D4 (ex. : union de deux paniers) → D5
horloge de D5 : [(A,2), (B,1), (C,1), (D,1)]
→ D5 succède à D3 ET à D4 : le conflit est résolu.
```

C'est exactement l'analogie du **merge Git**. Deux branches qui divergent, un ancêtre commun, et une fusion qui réunit les deux historiques. L'horloge vectorielle est le graphe de causalité ; le conflit, ce sont deux commits sans relation ancêtre/descendant.

**Le coût, et sa parade.** Une horloge vectorielle peut grossir : à chaque nouveau nœud coordinateur, une paire s'ajoute. Sans limite, elle enflerait indéfiniment. Dynamo applique donc un **schéma de troncature** : au-delà d'un seuil (typiquement ~10 entrées), on retire l'entrée la plus ancienne (par timestamp associé).

Cette troncature a un risque théorique : en oubliant une entrée, on peut perdre une information de causalité et prendre à tort un vrai conflit pour un ordre causal — une version en écraserait silencieusement une autre. En pratique, ce risque ne s'est jamais manifesté chez Amazon, pour une raison simple qu'on verra plus loin : la même clé est presque toujours coordonnée par le même nœud, donc l'horloge reste dominée par une ou deux entrées et ne grossit quasiment jamais. Le papier original le dit sans détour : *« ce problème n'est pas apparu en production et n'a donc pas été étudié en profondeur »*.

## Décision n°5 — Read repair et anti-entropie avec arbres de Merkle

Détecter les conflits, c'est bien. Encore faut-il **faire converger** les répliques qui ont divergé. Dynamo a trois mécanismes de convergence, du plus opportuniste au plus systématique.

**Read repair (réparation à la lecture).** C'est le mécanisme le plus élégant, car il ne coûte presque rien : il se greffe sur les lectures qu'on fait de toute façon. Lors d'un `get`, le coordinateur interroge les N répliques mais ne répond au client qu'après R réponses. Les réponses tardives continuent d'arriver en arrière-plan. Si l'une révèle une réplique en retard, le coordinateur lui pousse discrètement la version à jour.

```
lecture de "product:555", N=3, R=2

Nœud A → valeur1, horloge [(A,10),(B,5)]
Nœud B → valeur2, horloge [(A,10),(B,6),(C,1)]   ← plus récente
Nœud C → valeur1, horloge [(A,10),(B,5)]          (en retard)

R=2 atteint avec A et B → on répond valeur2 au client.
Puis, en arrière-plan :
  read repair → on met A et C à jour vers la dernière version.
```

Le coût est marginal (piggybacké sur une lecture existante), la latence de convergence de l'ordre de la milliseconde. Sa limite : il ne répare que les clés qu'on lit. Une clé jamais relue reste divergente.

**Hinted handoff (déjà vu).** Rappel : il rattrape les pannes temporaires. Quand le nœud en panne revient, sa donnée en consigne lui est transférée en une à deux secondes. C'est le second filet.

**Anti-entropie avec arbres de Merkle.** Reste le cas des répliques qui ont raté et la lecture et le handoff — corruption silencieuse, partition longue. Il faut un mécanisme de fond qui compare **l'intégralité** de deux répliques et répare les écarts. Mais comparer un million de clés une à une entre deux nœuds coûte un million de comparaisons. Inacceptable.

C'est là qu'intervient l'**arbre de Merkle** — une structure que tu connais probablement déjà des systèmes de fichiers vérifiés, de Git ou de la blockchain. Le principe : les feuilles sont les hachages des paires clé-valeur, et chaque nœud interne est le hachage de la concaténation de ses enfants. Le sommet est un **hachage racine** qui résume tout le sous-ensemble.

```
                 racine = h(h1 ∥ h2)
                /                    \
        h1 = h(h3 ∥ h4)        h2 = h(h5 ∥ h6)
        /          \            /          \
   h3=h(k1)    h4=h(k2)    h5=h(k3)    h6=h(k4)
      |           |           |           |
    clé1        clé2        clé3        clé4
```

La synchronisation devient un jeu de comparaison descendante :

```
1. A → B : "ma racine vaut X"
2. B compare avec sa racine Y.
3. Si X == Y  → les répliques sont identiques. FIN. Zéro clé transférée.
4. Si X != Y  → on descend comparer les hachages des enfants :
     - sous-arbre gauche identique ? on l'ignore entièrement.
     - sous-arbre droit différent ? on récurse dedans.
5. On continue jusqu'aux feuilles → on isole les clés divergentes.
6. On ne transfère QUE ces clés-là.
```

Le gain est spectaculaire. Là où l'approche naïve fait O(n) comparaisons, l'arbre de Merkle fait O(log n) comparaisons plus O(k) transferts, où k est le nombre de clés réellement divergentes :

```
1 000 000 de clés, dont 100 divergentes :
  naïf   : 1 000 000 de comparaisons
  Merkle : ~20 comparaisons (log₂ 1M) + 100 transferts
  → ordre de grandeur : ~50 000× moins de travail
```

Détail d'implémentation qui compte : chaque nœud maintient **un arbre de Merkle par plage de tokens** (par nœud virtuel), pas un seul arbre géant. Ainsi, quand un nœud rejoint ou quitte l'anneau, seules les plages affectées reconstruisent leur arbre — pas la totalité de l'espace de clés. Ce processus tourne en tâche de fond, à basse priorité (toutes les heures, voire tous les jours). C'est le filet de sécurité lent mais exhaustif.

## Décision n°6 — Le gossip : savoir qui est là, sans registre central

**Le problème.** Sans maître, comment chaque nœud sait-il quels nœuds composent l'anneau, lesquels viennent d'arriver, lesquels sont tombés ? Un annuaire central recréerait le point de défaillance unique qu'on a justement banni.

**La solution : le gossip** (protocole épidémique). Le nom dit tout : l'information se propage comme une rumeur. Chaque nœud, en boucle, choisit un pair au hasard et échange avec lui sa vision de l'appartenance au cluster ; les deux fusionnent leurs historiques.

```python
def boucle_gossip():
    while True:
        sleep(1)                          # toutes les secondes
        pair = random.choice(noeuds_connus)
        mon_histo   = get_historique()
        son_histo   = pair.get_historique()
        fusion      = reconcilier(mon_histo, son_histo)
        mettre_a_jour(fusion)
```

L'historique d'appartenance n'est qu'une liste d'événements horodatés : *« à t=1000, JOIN nœud D avec token 12345 »*, *« à t=2000, LEAVE nœud E »*, etc.

La beauté du gossip, c'est sa vitesse de propagation **exponentielle**. À chaque ronde, le nombre de nœuds au courant double environ. La propagation à tout le cluster prend donc O(log N) rondes :

```
N = 1000 nœuds, une ronde par seconde :
  ronde 1 :    1 nœud au courant
  ronde 2 :    2
  ronde 3 :    4
  ...
  ronde 10 : 1024  → tout le monde sait.
Total : ~10 secondes.
```

**Le point subtil : la détection de panne est locale, pas globale.** Chaque nœud a sa propre notion de qui est vivant, fondée sur les heartbeats qu'il reçoit. Il n'y a **aucun consensus global** sur l'état « vivant/mort » d'un nœud.

```
Le nœud A pense que C est mort.
Le nœud B pense que C est vivant.
→ les DEUX visions sont valides pour leurs opérations locales.
   Elles convergeront via le gossip.
```

Ça peut sembler bâclé, mais c'est un choix de conception majeur : **renoncer au consensus global sur les pannes simplifie énormément le système** et supprime une autre source de blocage. Chaque nœud agit sur sa meilleure information locale, filtre les nœuds qu'il croit morts au moment d'un quorum, et le tout converge. C'est la même philosophie que partout ailleurs dans Dynamo : préférer la disponibilité et la convergence à terme plutôt que l'accord instantané.

## La posture CAP, résumée : AP, et la balle est dans le camp de l'application

Rassemblons. Dynamo est un système **AP** : face à une partition, il choisit la disponibilité. Concrètement, dans le scénario du début — le cluster `[A, B, C, D, E]` se coupe en `[A, B]` d'un côté et `[C, D, E]` de l'autre — un système Paxos/Raft ferait taire la minorité `[A, B]` (pas de majorité, donc pas d'écriture) et laisserait ses clients dans le noir. Dynamo, lui, laisse **les deux côtés accepter les écritures** (chacun peut satisfaire W = 2 en interne), puis réconcilie via les horloges vectorielles quand la partition se referme.

Le prix de ce choix, c'est que **la cohérence devient un problème applicatif**. Dynamo ne fournit qu'une **primitive** : la détection de conflit. La **politique** de résolution, c'est à l'application de la définir — et c'est délibéré, car seule l'application connaît la sémantique de ses données.

Compare deux stratégies :

Le **last-write-wins** (LWW, « la dernière écriture gagne ») est simple mais **perd des mises à jour**. Sur un panier, c'est un désastre : si un client ajoute l'article Y d'un côté de la partition et un autre ajoute Z de l'autre côté, LWW garde un seul des deux et **fait disparaître un article que le client avait explicitement ajouté**.

La **fusion sémantique** fait bien mieux quand l'application sait quoi faire. Pour un panier, la règle métier est limpide : *un « ajouter au panier » ne doit jamais être perdu*. La réconciliation est donc une **union** :

```python
def reconcilier_paniers(versions):
    articles = {}
    for v in versions:
        for article in deserialiser(v.value).items:
            articles[article.id] = article   # union : on ne perd aucun ajout
    return Panier(articles.values())
```

Le compromis assumé : un article supprimé peut « ressusciter » après une fusion. Amazon juge ce défaut d'UX largement préférable à un article perdu. C'est un arbitrage produit, pas technique — et c'est précisément pour cela que Dynamo laisse l'application décider.

Le même système, pour un **état de session**, choisira au contraire LWW (l'état le plus récent suffit, la session est transitoire). Pour un **compte bancaire**, une logique sur mesure (sommer les dépôts, etc.). Une seule primitive, autant de politiques que de domaines. *One size does not fit all.*

## Ce que ça a donné en pratique

La théorie est belle ; les chiffres de production le sont davantage, car ils montrent que le compromis tient la route.

**Les conflits sont rarissimes.** Sur 24 heures de trafic réel du service panier, **99,94 %** des lectures ne voient qu'une seule version. Les cas à 2, 3 ou 4 versions concurrentes se comptent en fractions de millième de pour cent (0,00057 %, 0,00047 %, 0,00009 %). La divergence, qu'on craint tant en théorie, est un événement de coin en pratique — et provient surtout de clients automatisés, pas d'humains.

**Les latences tiennent le budget.** Au 99,9ᵉ percentile, écritures et lectures tournent autour de **68 ms**, avec des moyennes autour de **4 ms**. Détail contre-intuitif : les écritures sont *légèrement plus rapides* que les lectures. Pourquoi ? Une écriture attend W accusés et rend la main ; une lecture attend R réponses **puis** doit réconcilier les versions — cet overhead de comparaison la ralentit.

**La coordination côté client change tout.** Router les requêtes via un load balancer (le client tape un nœud au hasard, qui relaie éventuellement vers le bon coordinateur) donne ~68,9 ms au 99,9ᵉ percentile. Une bibliothèque cliente *consciente de la topologie de l'anneau*, qui tape directement le coordinateur, tombe à **30,4 ms** — un saut réseau économisé, **56 % de latence en moins**.

**Le tampon mémoire, un compromis durabilité/latence explicite.** Écrire directement sur disque à chaque fois donne ~200 ms au 99,9ᵉ percentile. Bufferiser en mémoire avec flush périodique fait tomber ce chiffre à ~40 ms — **5× plus rapide**. Le risque (perdre les écritures non encore flushées si le serveur crashe) est atténué par une astuce : sur les N répliques, **une seule** fait une écriture durable immédiate pendant que les autres bufferisent. Le quorum W = 2 reste satisfait, et il existe toujours une copie sur disque.

**L'évolution du partitionnement.** Dynamo a affiné sa stratégie de tokens en trois temps. La version initiale (tokens aléatoires, chaque nœud réclamant les partitions proches) souffrait d'un rééquilibrage coûteux et d'arbres de Merkle invalidés à chaque changement de topologie. La version finale découpe l'espace en **Q partitions fixes de taille égale** (avec Q ≫ N) et donne à chaque nœud exactement **Q/S tokens** (S = nombre de nœuds). Résultat : équilibrage quasi parfait, démarrage rapide (une partition = un fichier qu'on transfère tel quel), et arbre de Merkle par partition (un join/leave n'invalide plus tout). L'efficacité d'équilibrage passe d'environ 80 % (tokens aléatoires) à ~99,9 %.

**Et la perte totale de données ?** Si les N répliques d'une clé disparaissent simultanément avec perte disque, la donnée est perdue — Dynamo ne fait pas de miracle. Mais en combinant N = 3 réparti sur **plusieurs datacenters**, hinted handoff, réplication asynchrone cross-région pour la reprise après sinistre, et snapshots périodiques, Amazon rapporte **zéro cas de perte totale** sur plusieurs années de production. Pour les données critiques (paiement), on monte simplement N à 5.

## L'héritage

Dynamo n'est pas resté un système interne à Amazon : c'est le papier qui a **lancé la vague NoSQL**. Son ADN se retrouve dans toute une génération de bases distribuées.

**Apache Cassandra** (né chez Facebook) est le rejeton le plus célèbre. Il marie la moitié Dynamo — hachage cohérent avec nœuds virtuels, gossip, hinted handoff, cohérence ajustable via (N, R, W) — avec la moitié Bigtable de Google — modèle de données en familles de colonnes, format de stockage SSTable. Le meilleur des deux mondes.

**Riak** (de Basho) est l'implémentation la plus fidèle des principes Dynamo : horloges vectorielles, quorum relâché, anti-entropie par arbres de Merkle, le tout en open source. Il y a ajouté les **CRDT** (*Conflict-free Replicated Data Types*), une famille de types de données qui fusionnent automatiquement sans conflit — la suite logique de l'idée « laisser l'application réconcilier ».

**Voldemort** (LinkedIn) a repris l'inspiration Dynamo en Java pour ses couches de service à haut débit.

Un piège de vocabulaire à éviter absolument : **DynamoDB ≠ Dynamo**. DynamoDB (2012) est le service managé d'AWS, et sa philosophie est différente. Là où Dynamo (2007) visait les services internes d'Amazon avec la devise « toujours écrivable, cohérence à terme », DynamoDB cible des clients externes qui exigent des SLA (99,99 % de disponibilité contractuelle), des performances prévisibles et une exploitation simple. Il offre donc une **cohérence forte en option**, un vrai modèle de tables avec clés primaires, et des ajouts comme les Global Tables (réplication multi-région active-active) ou un support transactionnel limité. Même nom, même famille d'idées, mais des arbitrages recalibrés pour un produit commercial.

## À retenir

1. **La disponibilité peut primer sur la cohérence — c'est un choix, pas un défaut.** Pour un panier ou une session, « toujours écrivable » vaut mieux que « toujours cohérent ». Dynamo assume ce compromis explicitement, en connaissance de cause.

2. **Le hachage cohérent avec nœuds virtuels distribue les données sans tout casser.** Ajouter ou retirer une machine ne déplace qu'une fraction des clés, et les tokens multiples lissent la charge tout en gérant l'hétérogénéité matérielle.

3. **N/R/W est un curseur, pas une garantie de cohérence forte.** R + W > N donne un recouvrement *en apparence* — mais sous concurrence, et surtout avec le quorum relâché de Dynamo (où lectures et écritures touchent des ensembles disjoints), le système reste cohérent à terme et peut retourner des conflits.

4. **Le quorum relâché + hinted handoff, c'est la disponibilité achetée avec de la cohérence.** On écrit sur les N premiers nœuds *sains*, quitte à mettre la donnée « en consigne » chez un voisin qui la rendra au propriétaire légitime plus tard.

5. **Les horloges vectorielles détectent les vrais conflits là où les timestamps mentent.** En comptant les événements par nœud coordinateur, elles distinguent « B descend de A » de « A et B sont concurrents » — exactement comme un graphe de commits Git distingue fast-forward et merge.

6. **La convergence se fait à trois vitesses.** Read repair (immédiat, greffé sur les lectures), hinted handoff (secondes, pour les pannes temporaires), anti-entropie par arbres de Merkle (fond, exhaustif, en O(log n) au lieu de O(n)).

7. **Le système fournit une primitive, l'application fournit la politique.** Dynamo détecte les conflits ; c'est à l'application de choisir union, last-write-wins ou logique métier sur mesure — parce qu'elle seule connaît le sens de ses données.

## Pour aller plus loin

- **Le papier fondateur : *Dynamo: Amazon's Highly Available Key-value Store*** (DeCandia et al., SOSP 2007). Court, limpide, et la source de tous les chiffres cités ici. À lire absolument : [cs.cornell.edu/courses/cs5414/2017fa/papers/dynamo.pdf](https://www.cs.cornell.edu/courses/cs5414/2017fa/papers/dynamo.pdf)

- **Le papier Cassandra** (Lakshman & Malik, LADIS 2009) pour voir comment on greffe le modèle de données Bigtable sur le squelette Dynamo.

- **Les CRDT** (*Conflict-free Replicated Data Types*) : la suite intellectuelle de la réconciliation applicative, avec des structures qui fusionnent *sans jamais* produire de conflit. La lecture qui prolonge naturellement ce chapitre.

- **Le papier Spanner** (Google) pour le contre-pied : une base distribuée mondialement qui choisit, elle, la **cohérence forte** (à l'aide d'horloges atomiques et de l'API TrueTime). Lire les deux côte à côte, c'est comprendre le CAP dans la chair.

- **Expérimenter** : monte un cluster Cassandra à 3 nœuds en local, joue sur les configurations R/W, et observe de tes propres yeux le troc latence contre cohérence. Puis, pour vraiment ancrer les idées, implémente un mini-Dynamo — hachage cohérent, horloges vectorielles, quorum. Rien ne remplace le fait d'avoir écrit soi-même la comparaison de deux horloges vectorielles.

- **Le code à disséquer** : `apache/cassandra` (regarde `TokenMetadata.java` pour le hachage cohérent, `StorageService.java` pour le gossip) et `basho/riak` (`riak_core` pour les vnodes, `riak_kv` pour les horloges vectorielles).

---

*Eventual consistency n'est pas un bug, c'est une décision d'architecture. Dynamo a prouvé qu'on peut échanger de la cohérence forte contre de la disponibilité — et que pour un vaste pan des applications, c'est exactement le bon marché.*
