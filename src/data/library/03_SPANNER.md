# Spanner : une base SQL répartie sur la planète, avec cohérence forte

Pendant des années, une base de données SQL transactionnelle, répartie sur plusieurs continents et **fortement cohérente**, était considérée comme un fantasme d'ingénieur. On vous expliquait, preuves à l'appui, qu'il fallait choisir. Google a construit cette base, l'a mise en production en 2011 pour son backend publicitaire, et a publié le papier en 2012. Le nom : **Spanner**.

Ce chapitre explique *comment* c'est possible, et surtout *pourquoi* les mécanismes sont ce qu'ils sont. Vous avez un solide instinct bas niveau ; je vais m'appuyer dessus. L'astuce centrale — vous allez le voir — n'est pas un tour de magie algorithmique mais une décision presque physique : **exposer l'incertitude d'horloge au lieu de la cacher**, puis attendre qu'elle se dissipe.

Une phrase à garder en tête tout du long, c'est la thèse de Spanner résumée par ses auteurs :

> *"If the uncertainty is large, Spanner slows down to wait out that uncertainty."*

Quand l'incertitude est grande, Spanner ralentit pour la laisser passer. Tout le reste en découle.

---

## Le problème : pourquoi on croyait ça impossible

Posons le dilemme tel qu'on l'enseignait avant Spanner. Vous voulez une base de données distribuée. Deux familles s'offrent à vous, et elles semblaient mutuellement exclusives.

**Option A — cohérence forte (Paxos, Raft).** Chaque écriture est coordonnée de façon synchrone entre les répliques. Résultat : des garanties propres (vous lisez toujours la dernière valeur écrite), mais une latence élevée à cause des allers-retours réseau, et en pratique une portée limitée à un datacenter ou une région. Étendre ça à l'échelle mondiale, avec des allers-retours transcontinentaux sur chaque transaction, paraissait rédhibitoire.

**Option B — cohérence à terme (le modèle Dynamo).** On abandonne la coordination synchrone. On gagne une disponibilité énorme et une échelle planétaire, mais on hérite des conflits, de l'absence de transactions ACID, et d'un modèle où deux lecteurs peuvent voir deux vérités différentes pendant un moment.

La conclusion tenait en une ligne : **choisissez-en une, vous ne pouvez pas avoir les deux.** SQL global *et* transactions ACID *et* cohérence forte, c'était la case interdite.

### La faille dans le raisonnement

Le raisonnement reposait sur une hypothèse tacite : dans un système réparti, on ne peut pas se fier au temps physique. Et c'est vrai — naïvement. Prenez deux machines :

```
Nœud A : son horloge dit 100 ms
Nœud B : son horloge dit 105 ms

Question : laquelle a raison ?
Réponse : impossible à savoir (dérive et décalage d'horloge)
```

La parade classique consiste à renoncer au temps réel et à utiliser des **horloges logiques** (timestamps de Lamport, vector clocks). Ça donne un ordre *causal* cohérent, mais ça coupe tout lien avec le temps du monde réel. Or c'est précisément ce lien qui permettrait de dire « la transaction T1 s'est terminée *avant* que T2 ne commence, donc T1 doit être ordonnée avant T2 ». Sans temps réel fiable, cette garantie — appelée **external consistency** — est hors de portée.

L'insight de Spanner est de refuser ce renoncement. Plutôt que de cacher l'imprécision des horloges, on va la **mesurer**, la borner, et la rendre visible dans l'API. Si je ne connais pas l'heure exacte mais que je sais qu'elle est comprise entre 988 et 1000 ms, je peux quand même raisonner rigoureusement — il me suffit d'attendre que *même la borne la plus pessimiste* soit passée.

C'est tout le programme. On y arrive avec du matériel (horloges atomiques, GPS) et une discipline logicielle (le *commit-wait*). Voyons d'abord le modèle mental, puis chaque pièce.

---

## Le modèle mental

Avant les détails, plantons l'architecture d'ensemble, parce qu'elle donne le vocabulaire.

Un déploiement Spanner s'appelle un **universe**. Il est découpé en **zones** (grossièrement, des datacenters : US-East, US-West, EU-West…). Une zone contient des centaines à un millier de **spanservers**, les machines qui détiennent réellement les données.

```
              UNIVERSE (déploiement mondial)
                       │
        ┌──────────────┴──────────────┐
    ZONE 1 (US-East)             ZONE 2 (US-West)     ... autres zones
        │                             │
   [ spanservers ]              [ spanservers ]
   100 à 1000 par zone
```

Deux singletons pilotent l'ensemble, hors du chemin critique des requêtes : l'**universe master** (console de monitoring) et le **placement driver** (déplacement automatique des données entre zones, équilibrage de charge, respect des contraintes de réplication). Retenez qu'ils orchestrent, mais qu'aucune transaction ne dépend d'eux en direct.

### Le cœur : le spanserver et sa pile logicielle

C'est ici que tout se joue. Chaque spanserver héberge de 100 à 1000 **tablets** — des tranches de la base. La pile empilée au-dessus de chaque tablet, du haut vers le bas :

```
┌──────────────────────────────────────────────┐
│ TRANSACTION MANAGER                            │
│  coordonne les transactions distribuées        │
│  → two-phase commit entre groupes Paxos        │
├──────────────────────────────────────────────┤
│ LOCK TABLE (sur les répliques leader)          │
│  two-phase locking, contrôle pessimiste        │
│  mappe des plages de clés → états de verrou     │
├──────────────────────────────────────────────┤
│ PAXOS STATE MACHINE (une par tablet)           │
│  réplication cohérente                         │
│  leader longue durée (bail ~10 s)              │
│  pipeliné pour la performance WAN              │
├──────────────────────────────────────────────┤
│ TABLET                                         │
│  modèle : (key:string, timestamp:int64) → val   │
│  base MULTI-VERSION : chaque écriture datée      │
├──────────────────────────────────────────────┤
│ STORAGE : Colossus (le successeur de GFS)      │
│  fichiers en B-tree + write-ahead log (WAL)     │
└──────────────────────────────────────────────┘
```

Trois choses à absorber ici.

**D'abord, chaque tablet est une machine à états Paxos.** La réplication ne se fait pas tablet par tablet de façon ad hoc : un groupe de répliques d'un même tablet forme un **groupe Paxos**, avec un leader élu qui détient un bail. C'est l'unité de cohérence.

**Ensuite, la base est multi-version.** La clé de stockage n'est pas `key` mais `(key, timestamp)`. Chaque écriture reçoit un timestamp et ne détruit pas l'ancienne valeur ; les vieilles versions sont ramassées plus tard par un garbage collector. Conséquence directe et puissante : on peut **lire dans le passé**, à n'importe quel timestamp encore conservé. Gardez cette idée, elle explique pourquoi les lectures peuvent se passer de verrous.

**Enfin, le verrouillage vit sur le leader.** La lock table (verrouillage à deux phases, pessimiste) est tenue par la réplique leader du groupe Paxos. Les transactions en lecture-écriture prennent des verrous ; les lectures seules, on le verra, n'en prennent aucun.

Une dernière brique organise les données à un niveau au-dessus du tablet : le **directory**.

### Directories : l'unité de placement

Un **directory** est un ensemble de clés contiguës partageant un préfixe commun — pensez à « tout ce qui concerne l'utilisateur alice » :

```
Directory "user/alice" :
  user/alice/profile
  user/alice/photos/1
  user/alice/photos/2
  user/alice/settings
```

Le directory est l'unité de **réplication** (toutes ses clés partagent la même configuration de répliques) et de **déplacement** (il migre d'un bloc). C'est le levier par lequel l'application contrôle la géographie de ses données :

```
Directory "user/alice"  → 3 répliques  → [EU-West, EU-Central, EU-North]
Directory "user/bob"    → 5 répliques  → [US-East, US-Central, US-West, US-South, US-North]
```

Alice est européenne : ses données vivent en Europe, près d'elle. Bob est américain : les siennes aux États-Unis. Le déplacement d'un directory (`movedir`) est une tâche de fond non bloquante : on copie le gros des données en arrière-plan pendant que lectures et écritures continuent, puis, quand il ne reste qu'un petit delta, une transaction bascule atomiquement le reliquat et les métadonnées vers la nouvelle localisation. Aucune interruption de service.

### Le modèle de données : semi-relationnel, avec localité explicite

Spanner n'est pas un pur key-value, et ce choix est une réaction directe aux plaintes des équipes Google contre Bigtable : schémas complexes ingérables, pas de transactions inter-lignes, pas de SQL, cohérence à terme seulement.

Spanner offre du vrai SQL et un schéma, avec un mot-clé décisif pour la performance : **`INTERLEAVE IN PARENT`**.

```sql
CREATE TABLE Users {
    uid INT64 NOT NULL,
    email STRING
} PRIMARY KEY (uid), DIRECTORY;

CREATE TABLE Albums {
    uid INT64 NOT NULL,      -- la clé du parent
    aid INT64 NOT NULL,
    name STRING
} PRIMARY KEY (uid, aid),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;
```

`INTERLEAVE IN PARENT` demande une **co-localisation physique** : les albums d'un utilisateur sont stockés sur le disque *juste à côté* de la ligne de cet utilisateur. Sur le disque, ça donne :

```
[User 1][Album 1,1][Album 1,2][User 2][Album 2,1]
 ↑ même groupe Paxos               ↑ groupe Paxos différent
```

L'intérêt est brutalement concret : lire un utilisateur et tous ses albums, c'est lire une plage contiguë servie par **un seul groupe Paxos**. Pas de transaction distribuée, pas d'aller-retour entre machines. La localité *est* la performance. On y reviendra dans l'exercice de conception de schéma, car c'est là qu'un ingénieur gagne ou perd un ordre de grandeur de latence.

---

## Idée n°1 — TrueTime : borner l'incertitude au lieu de la nier

On arrive à l'innovation qui débloque tout le reste.

### Le problème, reformulé précisément

Une horloge murale classique vous donne un instant : « il est 100 ms ». Le problème est qu'elle ment, d'une quantité inconnue. Le décalage entre deux machines peut atteindre des dizaines de millisecondes, et vous ne savez pas de combien. Toute décision d'ordonnancement fondée sur cet instant unique est donc bancale.

### L'intuition

Changez la question. N'exigez pas de l'horloge un *instant* ; exigez un **intervalle** garanti contenir l'heure réelle. Au lieu de « il est 100 ms », l'API répond « il est entre 994 et 1006 ms, et je vous *garantis* que l'heure réelle est là-dedans ».

Analogie : une montre bon marché vous donne l'heure avec un aplomb injustifié. Un bon métrologue, lui, vous donne une mesure *avec sa barre d'erreur*. Spanner remplace la montre menteuse par le métrologue honnête. Et une barre d'erreur, ça se manipule mathématiquement.

### L'API TrueTime

Trois primitives, c'est tout :

```cpp
TTinterval TT.now();      // renvoie [earliest, latest]
                          // garantie : earliest ≤ heure_réelle ≤ latest

bool TT.after(t);         // vrai si t est DÉFINITIVEMENT passé
                          //   return t < TT.now().earliest;

bool TT.before(t);        // vrai si t n'est DÉFINITIVEMENT PAS encore arrivé
                          //   return t > TT.now().latest;
```

`TT.now()` ne renvoie pas un nombre mais un intervalle `[earliest, latest]`. La largeur de cet intervalle, c'est l'**incertitude**, notée **ε (epsilon)**. `TT.after(t)` ne dit « oui » que lorsque *même la borne la plus optimiste* (`earliest`) a dépassé `t` : à ce moment, aucun doute possible, `t` appartient au passé. C'est cette prudence qui rendra les preuves rigoureuses.

### Comment on obtient ε petit : le matériel

Un intervalle garanti ne vaut que s'il est *étroit*. Un ε de plusieurs secondes serait inutilisable. Google atteint quelques millisecondes grâce à une redondance matérielle à diversité de pannes :

```
GPS receivers (plusieurs par datacenter)
  → référence : temps atomique des satellites (incertitude ~0)
  → modes de panne : panne d'antenne, brouillage, coupure GPS

Horloges atomiques ("Armageddon masters")
  → référence : oscillateurs césium/rubidium
  → mode de panne : dérive lente dans le temps
  → coût : ~10 k$ par horloge (dérisoire à l'échelle Google)
```

Le point subtil est la **diversité des modes de panne**. Le GPS peut être brouillé mais ne dérive pas ; l'horloge atomique dérive mais est immunisée au brouillage. Les deux mentent différemment, donc ils ne mentent jamais ensemble de la même façon. Chaque machine interroge plusieurs *time masters*, et l'**algorithme de Marzullo** détecte et rejette les « menteurs » (les valeurs aberrantes), puis se synchronise sur les honnêtes avec une borne d'incertitude conservatrice.

### D'où vient exactement ε, et sa forme en dents de scie

Voici la décomposition en production :

```
Incertitude du time master : ~0 ms   (le GPS est précis)
Délai de communication      : ~1 ms
Dérive de l'horloge locale  : 0 à 6 ms (entre deux synchros)
Intervalle de synchro       : 30 secondes
Taux de dérive appliqué     : 200 μs/s

Résultat :
  ε typique      : 1 à 7 ms  (motif en dents de scie)
  ε moyen        : ~4 ms
  99e centile    : 7 ms
```

Le **motif en dents de scie** mérite qu'on s'y arrête, parce qu'il est très « bas niveau » et parfaitement intuitif quand on l'a vu. Juste après une synchronisation, la machine connaît l'heure avec une excellente précision : ε est petit. Mais entre deux synchros (toutes les 30 s), l'horloge locale dérive. Spanner ne fait pas confiance à cette horloge : il applique conservativement le pire taux de dérive possible (200 μs/s). Donc ε *grandit* linéairement pendant 30 secondes — jusqu'à ~6 ms de dérive accumulée — puis la synchro suivante le fait retomber. Monte, retombe, monte, retombe : dents de scie. Spanner ne prétend jamais être plus précis qu'il ne l'est réellement.

### Le compromis

Le coût de TrueTime est double. Un **coût matériel** (GPS + horloges atomiques dans chaque datacenter, ~10 k$ par horloge) — négligeable pour Google, mais réel, et c'est précisément ce que les clones open-source refusent de payer, on y reviendra. Et un **coût de latence**, que nous allons rencontrer maintenant : puisque tout repose sur l'attente que ε passe, plus ε est grand, plus on attend.

---

## Idée n°2 — External consistency et le commit-wait

TrueTime est le moyen. La fin, c'est l'**external consistency**. C'est la garantie que Spanner offre à ses utilisateurs, et c'est le graal.

### Ce que ça veut dire, précisément

> Si la transaction T1 se termine (commit) **avant** que T2 ne commence, dans le temps réel absolu, alors le timestamp de commit de T1 est inférieur à celui de T2.

En notation :

```
tabs(e) = instant absolu réel de l'événement e
si       = timestamp de commit de la transaction Ti

Invariant :   tabs(commit_T1) < tabs(start_T2)  ⇒  s1 < s2
```

C'est la **linéarisabilité** appliquée aux transactions : le système se comporte *comme s'il existait un ordre total unique* des transactions, cohérent avec l'ordre réel observable de l'extérieur. Si votre collègue valide un virement puis vous téléphone « c'est fait, regarde », et que vous lancez alors votre lecture, vous *verrez* le virement. Pas de « cohérence à terme », pas de « rafraîchis dans deux secondes ». C'est vu, tout de suite, garanti.

### Pourquoi c'est dur

Le piège vient du décalage d'horloge. Imaginez qu'on assigne les timestamps naïvement, chacun avec son horloge locale :

```
T1 sur le nœud A :
  écrit X = 1
  commit à l'heure murale réelle 100 ms
  timestamp assigné s1 = 95 ms   (l'horloge de A retarde !)

T2 sur le nœud B :
  démarre à l'heure murale réelle 105 ms (donc APRÈS le commit de T1)
  lit X
  timestamp assigné s2 = 100 ms

Problème : s2 (100) > s1 (95), l'ordre des timestamps semble correct...
  mais si T2 lit AU timestamp 100 et que la propagation joue contre nous,
  T2 pourrait rater l'écriture de T1.
  External consistency VIOLÉE.
```

Le nœud A a assigné un timestamp *dans le passé* par rapport à l'instant réel de son commit, parce que son horloge retardait. Tant que les timestamps peuvent ainsi « mentir » vers le passé, l'ordre des timestamps ne reflète plus l'ordre réel. Il faut une discipline qui garantisse : *un timestamp de commit est toujours situé dans le passé réel au moment où le client reçoit la confirmation*.

### La solution en deux règles

**Règle 1 — Start (assignation).** Le coordinateur assigne au commit un timestamp au moins égal à la borne haute de TrueTime au moment où la requête de commit arrive :

```python
commit_timestamp = max(
    TT.now().latest,        # au moins la borne haute actuelle
    previous_timestamp + 1  # monotonie : strictement croissant
)
```

En prenant `TT.now().latest` (la borne *haute*), on garantit que le timestamp choisi est au moins aussi grand que l'heure réelle — jamais en retard sur elle.

**Règle 2 — Commit-wait (le cœur du mécanisme).** Après avoir choisi `s`, le coordinateur **ne rend pas la main au client tout de suite**. Il attend activement que `s` soit *définitivement* passé selon TrueTime :

```python
def commit_wait(s):
    while not TT.after(s):   # tant que s n'est pas certainement dans le passé
        sleep(1ms)
    # maintenant seulement : on confirme au client
    # garantie obtenue : s < tabs(instant réel de confirmation)
```

Rappelez-vous que `TT.after(s)` n'est vrai que quand `s < TT.now().earliest`. On attend donc que la borne *basse* de l'intervalle dépasse `s`. À cet instant, il est absolument certain que l'heure réelle a dépassé `s`. Le commit est « ancré » dans le passé réel avant même que le client n'apprenne qu'il a réussi.

### La preuve, en cinq lignes

Assemblons. On suppose T1 commit avant que T2 démarre, et on veut `s1 < s2` :

```
s1 < tabs(commit_T1)          (commit-wait : T1 a attendu que s1 soit passé)
   < tabs(start_T2)           (hypothèse : T1 finit avant que T2 démarre)
   ≤ tabs(serveur reçoit T2)  (causalité)
   ≤ s2                       (règle Start : s2 ≥ TT.now().latest à la réception)

Donc s1 < s2.  ∎
```

Chaque inégalité est soit une définition, soit la causalité, soit l'une des deux règles. C'est ça, la beauté de TrueTime : la correction devient un théorème, pas un espoir.

### Le compromis : combien coûte l'attente ?

Le commit-wait ajoute une latence. Combien ? Il faut attendre que `earliest` dépasse `s`, or au moment de l'assignation `s = latest`, et l'intervalle a une largeur d'environ `2ε`. Le temps s'écoule à raison de 1 ms par ms, donc :

**Commit-wait ≈ 2ε ≈ 8 ms en moyenne** (avec ε ≈ 4 ms).

Huit millisecondes par transaction en écriture. C'est le prix de l'external consistency mondiale. Et c'est un *bon* prix, pour deux raisons. D'abord parce que ces 8 ms **se recouvrent** souvent avec la communication Paxos qui a lieu de toute façon : pendant que le commit-wait s'écoule, on peut faire avancer d'autres étapes. Ensuite, comparez à l'alternative NTP.

### Pourquoi pas NTP ? (la question qu'on vous posera)

NTP synchronise les horloges via le réseau, gratuitement, sans matériel dédié. Pourquoi payer des horloges atomiques ? Parce que l'incertitude de NTP se compte en **dizaines de millisecondes, souvent 100 ms et plus**, et sans borne garantie : lors d'une congestion réseau, elle peut grimper à des secondes sans que vous le sachiez.

Or le commit-wait dure `2ε`. Faites le calcul :

```
Avec NTP (ε ≈ 100 ms)  → commit-wait ≈ 200 ms par transaction. Inacceptable.
Avec TrueTime (ε ≈ 4 ms) → commit-wait ≈ 8 ms. Absorbable.
```

Et si l'on renonçait au commit-wait pour aller vite avec NTP ? On retomberait exactement dans la violation d'external consistency vue plus haut. La différence n'est donc pas cosmétique : la *petitesse garantie* de ε est ce qui rend la discipline commit-wait praticable. NTP fait « au mieux » sans garantie ; TrueTime borne explicitement, en temps réel, avec le pire cas de dérive déjà intégré. C'est la différence entre un espoir et un contrat.

---

## Idée n°3 — Paxos : répliquer sans mentir

On a le temps et la cohérence des timestamps. Reste à *répliquer* les données de façon cohérente et tolérante aux pannes. C'est le rôle de Paxos.

### Ce que Paxos apporte

Chaque tablet est répliqué sur plusieurs machines (typiquement 3 à 5, davantage pour les données chaudes). Ces répliques forment un **groupe Paxos** qui élit un **leader**. Toute écriture passe par le leader, est ordonnée, puis répliquée par consensus sur une majorité (un quorum). Tant qu'une majorité survit, le groupe reste cohérent et disponible en écriture. C'est la réplication synchrone qui élimine la perte de données : quand F1 est passé de MySQL shardé à Spanner, c'est cette propriété qui a supprimé le risque de perte lors des basculements.

### L'optimisation clé : des leaders à bail longue durée

Le détail qui compte pour la performance est le **bail de leader (leader lease) d'environ 10 secondes**. Plutôt que de renégocier qui est leader à chaque décision, un leader obtient un bail temporel : pendant ~10 s, il *est* le leader, point. Cela réduit énormément le surcoût d'élection et — surtout — permet au leader de servir certaines lectures et de tenir la lock table sans re-coordonner à chaque fois.

Mais un bail temporel soulève un danger classique : **deux leaders simultanés** (l'ancien qui se croit encore leader, le nouveau fraîchement élu). Si les deux acceptent des écritures, adieu la cohérence. Spanner évite ça avec TrueTime, via un **invariant de disjonction** : le bail du leader *i* se termine strictement avant que le bail du leader *i+1* ne commence.

Le mécanisme, esquissé :

```python
# Le leader calcule son intervalle de bail à partir des votes des répliques
lease_start = TT.now().latest
lease_end   = min(v_leader[r] for r in répliques) + 10_secondes

# Chaque réplique, en votant, s'engage :
t_end = TT.now().latest + 10_secondes
# règle du vote unique : elle ne votera pas pour un autre leader
# tant que TT.after(t_end) n'est pas vrai
while not TT.after(t_end):
    wait()
```

La preuve mathématique (que je ne déroule pas ici) montre, en s'appuyant sur une réplique commune aux deux quorums et sur les bornes TrueTime, que `lease_i.end < lease_{i+1}.start`. Autrement dit, les fenêtres de règne ne se chevauchent jamais. Encore une fois, c'est TrueTime qui transforme une propriété fragile (« ne pas avoir deux leaders ») en garantie prouvée.

### Le compromis : le bail est aussi votre temps d'indisponibilité

Ce bail de 10 s a un revers que l'on mesure très concrètement en cas de panne brutale, on le verra dans la section CAP : si un leader meurt sans prévenir, il faut attendre l'expiration de son bail (jusqu'à ~10 s) avant qu'un nouveau leader puisse être élu et que le service reprenne. Bail plus court = reprise plus rapide, mais trafic de heartbeat plus intense. C'est un curseur, pas une vérité.

Spanner utilise en réalité une variante **Multi-Paxos** pipelinée : plusieurs écritures en vol simultanément, du batching, des quorums adaptatifs — autant d'optimisations pensées pour le WAN, où chaque aller-retour coûte cher.

### Une astuce : faire avancer le « temps sûr » sans écrire

Un problème subtil mérite mention, parce qu'il révèle la finesse du système. Une réplique ne peut servir une lecture au timestamp `t` que si elle est certaine qu'aucune écriture d'un timestamp `≤ t` n'arrivera plus. Ce seuil s'appelle le **safe time (tsafe)**. S'il n'y a aucune écriture, `tsafe` risque de stagner, et les lectures récentes devraient attendre inutilement.

Solution : le leader **promet le futur**. Toutes les 8 secondes environ, il annonce « ma prochaine écriture Paxos aura un timestamp ≥ X ». Les répliques peuvent alors avancer leur `tsafe` jusqu'à `X − 1` même sans nouvelle écriture. Résultat : on peut servir des lectures fraîches en continu, y compris sur des données qui ne changent pas.

---

## Idée n°4 — Le two-phase commit pour les transactions inter-shards

Paxos réplique *un* groupe. Mais une transaction peut toucher des clés réparties sur *plusieurs* groupes Paxos (plusieurs shards, potentiellement plusieurs continents). Comment garantir l'atomicité — tout ou rien — à travers eux ? Avec le vénérable **two-phase commit (2PC)**, mais posé *au-dessus* de Paxos, ce qui en corrige la faiblesse historique.

### L'intuition, et pourquoi 2PC sur Paxos

Le 2PC classique a mauvaise réputation : si le coordinateur meurt au mauvais moment, les participants restent bloqués, verrous en main. Le coup de génie de Spanner est que **chaque participant est lui-même un groupe Paxos répliqué**. Le coordinateur, les participants, leurs décisions : tout est journalisé via Paxos, donc survit aux pannes de machine. Le 2PC apporte l'atomicité inter-shards ; Paxos apporte la durabilité et la disponibilité de chaque acteur du 2PC. Les deux faiblesses s'annulent.

### Le déroulé d'une transaction lecture-écriture

```
CLIENT
  1. Lectures → prises de verrous de lecture sur les leaders concernés
  2. Écritures bufferisées côté client (pas encore appliquées)
  3. Au commit : choisit un groupe COORDINATEUR parmi les participants
  4. Envoie le commit à tous les leaders participants

PHASE 1 — PREPARE (participants non-coordinateurs)
  - acquièrent les verrous d'écriture
  - choisissent un prepare_timestamp
  - journalisent l'enregistrement "prepare" via Paxos
  - renvoient leur prepare_timestamp au coordinateur

PHASE 2 — COMMIT (coordinateur)
  - acquiert ses propres verrous d'écriture
  - collecte les prepare_timestamps de tous les participants
  - choisit le commit timestamp :
        commit_ts = max( max(prepare_timestamps),   # ≥ tous les prepare
                         TT.now().latest,            # règle Start
                         last_assigned_ts + 1 )      # monotonie
  - COMMIT-WAIT : attend TT.after(commit_ts)         # ← le fameux ~8 ms
  - journalise l'enregistrement "commit" via Paxos
  - confirme au client + notifie les participants
```

Notez où se loge le commit-wait : **une seule fois, chez le coordinateur, après avoir choisi le timestamp de commit**. C'est là que l'external consistency de l'idée n°2 se raccorde au 2PC de l'idée n°4. Le timestamp de commit est choisi supérieur à tous les prepare timestamps (pour respecter l'ordre interne) *et* supérieur à `TT.now().latest` (règle Start), puis ancré dans le passé par le commit-wait.

### Les latences réelles

Décomposition d'une transaction inter-datacenter :

```
Commit-wait          : ~2ε ≈ 8 ms (moyenne)
Paxos (WAN)          : ~10 à 50 ms (selon la distance)
Acquisition verrous  : ~1 à 5 ms
────────────────────────────────
Total                : ~20 à 60 ms
```

Et les mesures de production sur F1, le backend publicitaire de Google (depuis des serveurs F1 en US-East) :

```
Toutes lectures                 : moyenne  8,7 ms   (écart-type 376 ms)
Commit mono-site (1 groupe Paxos) : moyenne 72,3 ms
Commit multi-site (N groupes)   : moyenne 103 ms
```

Le fort écart-type sur les lectures reflète un mélange de répliques locales (SSD rapides) et distantes (HDD lents), leaders Paxos répartis sur deux datacenters. L'écart entre mono-site (72 ms) et multi-site (103 ms) mesure exactement le surcoût de coordination du 2PC.

### Le compromis : le 2PC ne passe pas à l'échelle indéfiniment

Combien de participants le 2PC supporte-t-il avant de s'effondrer ? Les mesures :

```
Participants   Latence moyenne   99e centile
     1            17,0 ms          75,0 ms
     2            24,5 ms          87,6 ms
    10            30,0 ms          95,6 ms
    50            42,7 ms          93,7 ms
   100            71,4 ms         131,2 ms
   200           150,5 ms         320,3 ms
```

Lecture claire : **jusqu'à ~50 participants, ça tient très bien** ; à 100 et au-delà, la latence se dégrade nettement, et à 200 elle explose. Le message de conception qui en découle est fondamental, et il justifie tout ce qu'on a dit sur les directories et l'`INTERLEAVE` : **arrangez-vous pour que vos transactions tiennent dans un seul groupe Paxos**. La distribution des directories chez F1 le confirme de façon spectaculaire :

```
# fragments   # directories
    1          > 100 millions   ← l'immense majorité : lecture/écriture mono-serveur
   2–4          341
   5–9          5 336
  10–14          232
 100–500           7            ← index secondaires (chargements en masse)
```

Plus de 100 millions de directories tiennent sur **un seul fragment**. Le 2PC existe pour les cas qui débordent, mais le design pousse à ce qu'ils soient rares. Le 2PC n'est pas la voie normale : c'est le filet de sécurité pour les transactions vraiment réparties.

---

## Les lectures : là où Spanner devient rapide

Tout ce qui précède concerne surtout les écritures, qui paient le commit-wait et éventuellement le 2PC. Les **lectures**, elles, sont le domaine où Spanner brille, parce qu'elles peuvent souvent **se passer de verrous** et **fuir le leader**.

### Transactions en lecture seule : sans verrou

Une transaction en lecture seule n'a pas besoin de verrous si l'on sait lui assigner un timestamp de lecture sûr, puis lire *à ce timestamp* dans la base multi-version. Le principe :

- **Cas d'un seul groupe Paxos.** On peut prendre comme timestamp `LastTS()`, celui de la dernière écriture validée (au lieu de `TT.now().latest`), s'il n'y a pas de transaction en préparation. On lit à ce timestamp, sans aucun verrou.
- **Cas de plusieurs groupes.** On prend `sread = TT.now().latest`, et les lectures peuvent aller vers **n'importe quelle réplique suffisamment à jour** — pas seulement le leader.

Le gain est double : pas de contention de verrous entre lecteurs, et surtout la possibilité de servir la lecture depuis une réplique proche du client. Un lecteur européen peut lire depuis une réplique EU (quelques ms) même si le leader Paxos est aux États-Unis (100 ms), du moment que la réplique EU est à jour pour le timestamp demandé. C'est le rôle du `tsafe` vu plus haut : une réplique sert la lecture au timestamp `t` seulement si `t ≤ tsafe`, sinon elle attend qu'une écriture assez récente arrive.

### Snapshot reads : lire dans le passé

Puisque la base est multi-version, on peut carrément **lire à un instant passé**, sans coordination avec le leader :

```python
snapshot_read(key, timestamp=100)              # instant exact fourni
snapshot_read(key, staleness_bound=10_seconds) # "pas plus vieux que 10 s"
```

C'est idéal pour les sauvegardes cohérentes, l'analytique de longue durée, l'audit historique. Aucun verrou, lecture depuis la réplique la plus proche, latence minimale. Le tableau des types d'opérations résume les quatre modes :

| Opération | Contrôle de concurrence | Réplique requise | Timestamp |
|---|---|---|---|
| **Lecture-écriture** | Pessimiste (2PL) | Leader | Au commit (écriture Paxos) |
| **Lecture seule** | Sans verrou | Leader pour le timestamp ; n'importe laquelle pour lire | Choisi par le système |
| **Snapshot read** (timestamp client) | Sans verrou | Toute réplique assez à jour | Fourni par le client |
| **Snapshot read** (borne de fraîcheur) | Sans verrou | Toute réplique assez à jour | Choisi par le système |

### L'application au problème des hot spots

Ce modèle de lecture est l'arme de Spanner contre les **hot spots** — ces clés hyper-sollicitées (100 000 lectures/s sur un même produit populaire). Comme la clé vit dans un seul groupe Paxos avec un seul leader, ce leader devient un goulot. Les parades tiennent presque toutes dans les lectures :

- **Lectures seules et snapshot reads** répartissent la charge sur les 3 à 5 répliques au lieu du seul leader — soit un débit multiplié d'autant, sans blocage mutuel.
- **Augmenter le facteur de réplication** des données chaudes (7 à 10 répliques au lieu de 3 à 5) multiplie encore le débit de lecture et rapproche les données des utilisateurs.
- **Splitter le directory trop chaud** en plusieurs (par exemple `products/A-M` et `products/N-Z`) répartit sur plusieurs groupes Paxos.

Une honnêteté s'impose : **les hot spots en écriture restent un problème dur**. Une clé très écrite doit passer par son leader unique, et la cohérence forte interdit de distribuer ces écritures sans coordination. Là, il faut remonter au niveau applicatif : batcher, traiter en asynchrone, ou accepter une cohérence à terme pour les écritures non critiques. Comme le ramasse-miettes en programmation : tout le monde a des hot spots, l'art est dans l'atténuation.

---

## La réalité CAP : Spanner est CP, et l'assume

Il faut être parfaitement clair sur ce point, car c'est le plus mal compris — et c'est là que le mythe « Spanner bat le théorème CAP » se dissout.

### Spanner ne bat pas CAP. Spanner est CP.

Le théorème CAP dit qu'en cas de **partition réseau (P)**, un système doit choisir entre la **cohérence (C)** et la **disponibilité (A)**. Spanner choisit **C**. C'est un système **CP**, et Brewer lui-même — l'auteur du théorème — l'a écrit noir sur blanc dans son texte « Spanner, TrueTime & CAP ». Pendant une partition, Spanner **sacrifie la disponibilité** : le côté minoritaire d'un groupe Paxos ne peut plus servir d'écritures (il n'a pas le quorum), et il refuse plutôt que de risquer une incohérence.

**TrueTime n'est pas une faille dans CAP.** TrueTime fournit l'**external consistency (la linéarisabilité)** — c'est-à-dire un ordonnancement correct des transactions. C'est une propriété de *cohérence*, orthogonale au dilemme C-vs-A. TrueTime rend le « C » propre et prouvable ; il ne fait rien pour esquiver le sacrifice du « A ». Confondre les deux, c'est confondre « je range mes transactions dans le bon ordre » avec « je reste debout pendant une coupure réseau ». Ce sont deux questions distinctes.

### Alors d'où viennent les ~5 nines de disponibilité ?

Si Spanner sacrifie la disponibilité sous partition, comment affiche-t-il ~99,999 % de disponibilité ? La réponse est aussi peu magique que possible :

> Spanner atteint ~5 nines **uniquement parce que le réseau privé de Google partitionne très rarement.**

Ce n'est pas une propriété du protocole, c'est une propriété de l'**infrastructure**. Google possède ses fibres, ses routeurs, ses liens transcontinentaux redondants. Les partitions qui feraient chuter le « A » d'un système CP se produisent si peu souvent, et sont réparées si vite, que le sacrifice théorique de disponibilité ne se matérialise presque jamais dans les chiffres. Spanner est CP « sur le papier » et hautement disponible « en pratique » — parce que la pratique tourne sur un réseau exceptionnel. Déployez le même protocole sur un réseau médiocre, et vous *verrez* le « A » s'effondrer à chaque partition.

### Ce qu'on observe quand un leader meurt brutalement

L'expérience de panne menée par Google rend tout cela tangible. Montage : 5 zones, la zone Z1 contient tous les leaders Paxos, 1250 groupes Paxos, 100 clients, 50 000 lectures/s.

```
Test 1 — tuer Z2 (zone sans leader)
  → aucun impact : les lectures continuent normalement.

Test 2 — tuer Z1 en laissant le temps aux leaders de passer la main
  → impact mineur : 3–4 % de débit en moins, à peine visible.

Test 3 — tuer Z1 sans prévenir (hard kill)
  → impact sévère : le débit tombe à ~0.
  → temps de reprise : ~10 secondes (expiration des baux de leader Paxos)
  → après 10 s : de nouveaux leaders sont élus, le débit revient à la normale.
```

Le test 3 est la démonstration nue du compromis CP + bail de leader. La mort brutale du leader crée une fenêtre où le système **préfère être indisponible plutôt qu'incohérent** : il attend l'expiration du bail (~10 s) avant d'élire un remplaçant. Personne ne sert d'écriture pendant ces secondes — c'est le « A » sacrifié, dans la vraie vie, chronométré. Bail plus court = reprise plus rapide, au prix de plus de heartbeats. Il n'y a pas de repas gratuit, seulement des curseurs bien réglés.

### La philosophie de conception, en une ligne

Toutes les décisions découlent d'un axiome unique :

> **Ralentir quand on est incertain. Ne JAMAIS sacrifier la correction.**

Quand ε explose (panne de time master, ε qui monte à 1 seconde), Spanner ne ment pas : le commit-wait passe à ~2 secondes, les transactions rampent, mais l'external consistency tient toujours. Le système est *lent*, pas *faux*. Comparez : une base traditionnelle serait *tombée* (incapable de garantir la cohérence), un système Dynamo serait devenu *incohérent*. Spanner, lui, se dégrade en douceur. En production Google depuis 2011, ε reste sous les 10 ms 99,9 % du temps ; on n'a jamais vu ε dépasser 100 ms. Le pari « slow down gracefully » a tenu.

---

## Deux mécanismes que seul TrueTime rend possibles

Avant de conclure, deux applications élégantes qui montrent que TrueTime n'est pas qu'un truc à commit-wait — c'est un outil général « un timestamp futur veut dire quelque chose ».

**Changements de schéma non bloquants.** Modifier le schéma sur des millions de serveurs sans downtime : cauchemar classique (l'approche Bigtable verrouille toute la base pendant la migration). Spanner assigne au changement de schéma un **timestamp dans le futur**, disons `TT.now().latest + 60 secondes`, et l'enregistre via Paxos dans tous les groupes. Ensuite, chaque opération se synchronise avec ce timestamp : si son timestamp est inférieur, elle utilise l'ancien schéma sans blocage ; s'il est supérieur, elle attend que l'instant futur arrive et applique le nouveau. À la seconde 60, le basculement est effectif partout, atomiquement, sans jamais avoir bloqué le trafic. Cela n'a de sens que parce qu'un timestamp futur *signifie réellement* quelque chose — ce que seul TrueTime garantit.

**Pourquoi TrueTime n'est pas exposé aux applications.** Question fréquente : ce serait pratique pour coordonner mes propres systèmes. La réponse est non, par conception, pour deux raisons. **Correction** : les garanties de Spanner dépendent d'un usage discipliné de TrueTime (règle Start, commit-wait, monotonie) ; une appli qui lirait `TT.now()` et assignerait ses propres timestamps *sans* faire de commit-wait casserait l'external consistency. **Abstraction** : cacher TrueTime permet à Spanner d'en changer l'implémentation sans casser les applications. Ce que Spanner expose à la place, ce sont des abstractions sûres construites *au-dessus* de TrueTime : les **commit timestamps** (utilisables pour tracer la causalité entre systèmes) et les **snapshot reads** à un timestamp donné. Besoin de coordonner deux systèmes ? Le système A commit, transmet son `commit_timestamp` au système B, et B fait un snapshot read à ce timestamp — il verra la transaction de A, external consistency garantie, sans jamais toucher TrueTime directement.

---

## Ce que Spanner a rendu possible, et son héritage

Spanner a prouvé, papier OSDI 2012 à l'appui (Best Paper Award), qu'une base SQL transactionnelle, fortement cohérente et répartie sur la planète, **n'était pas un fantasme**. Le cas F1 l'a démontré en production : Google a migré son backend publicitaire d'un MySQL shardé manuellement — dont le re-sharding avait pris *deux ans* d'efforts et des dizaines d'équipes — vers Spanner, gagnant réplication synchrone (plus de perte de données), basculement automatique, transactions ACID complètes et requêtes SQL sur toutes les données.

L'idée a essaimé, et les descendants révèlent en creux le rôle du matériel :

- **Cloud Spanner (2017)** expose le système Google interne comme service GCP public : multi-tenant, scaling automatique, facturation à l'usage, disponible dans toute région GCP — tout en conservant TrueTime, l'external consistency, ACID et SQL. Les améliorations post-2012 y ont ajouté un optimiseur de requêtes bien plus rapide, l'exécution distribuée des requêtes, les index secondaires natifs, les clés étrangères, le backup/restore.

- **CockroachDB** est le « clone Spanner » open-source : SQL distribué global, ACID, external consistency. Différence cruciale : **pas de TrueTime**. Faute d'horloges atomiques et de GPS dans le datacenter de n'importe quel client, il approxime avec des **Hybrid Logical Clocks (HLC)**, purement logicielles. Le compromis est exactement celui qu'on attend : garanties plus faibles que TrueTime, mais déployable *partout*, sans matériel spécial. C'est la rançon de renoncer aux 10 k$ par horloge.

- **YugabyteDB** vise la compatibilité PostgreSQL, multi-région, ACID, mais s'appuie sur **Raft** plutôt que Paxos pour le consensus — même inspiration, choix d'implémentation différent.

- **TiDB** (compatible MySQL) suit la même veine : Raft plutôt que Paxos, HLC plutôt que TrueTime.

Un mot sur le fameux débat **Paxos vs Raft**, puisqu'on vous le posera. Spanner utilise Paxos pour une raison largement historique et pragmatique : le développement a commencé en 2011, Raft n'est publié qu'en 2013. En 2011, Paxos avait treize ans de recherche et un durcissement en production (Chubby) ; Raft, conçu pour l'enseignabilité, n'était pas encore éprouvé. Spanner disposait déjà d'un Multi-Paxos hautement optimisé pour le WAN (pipeline, batching, baux temporels intégrés à TrueTime). En pratique, les deux protocoles ont des performances comparables ; réécrire des millions de lignes pour passer à Raft n'aurait aucun retour sur investissement. Le débat est surtout académique : en production, les deux marchent, et « on ne répare pas ce qui n'est pas cassé ».

---

## À retenir

1. **L'idée maîtresse est d'exposer l'incertitude d'horloge, pas de la cacher.** `TT.now()` renvoie un intervalle `[earliest, latest]` garanti contenir l'heure réelle, avec une largeur ε de 1 à 7 ms (moyenne ~4 ms, 99e centile 7 ms), obtenue via GPS + horloges atomiques à diversité de pannes. C'est ce qui transforme la correction en théorème.

2. **L'external consistency (linéarisabilité) vient de deux règles : Start + commit-wait.** On assigne un timestamp ≥ `TT.now().latest`, puis on *attend* qu'il soit définitivement passé (`TT.after`) avant de confirmer au client. Coût : ~2ε ≈ 8 ms par écriture. C'est ce qui rend impossible qu'une transaction terminée avant une autre reçoive un timestamp plus grand.

3. **Spanner est un système CP, pas une exception à CAP.** Sous partition réseau, il sacrifie la disponibilité pour préserver la cohérence. TrueTime fournit la cohérence (external consistency), pas une échappatoire au théorème. Les ~5 nines viennent du réseau privé de Google qui partitionne très rarement — c'est de l'infrastructure, pas de la théorie.

4. **Paxos réplique chaque tablet ; le 2PC couvre les transactions inter-shards.** Les leaders Paxos tiennent un bail temporel d'environ 10 s (disjonction garantie par TrueTime), ce qui accélère le régime permanent mais impose ~10 s d'indisponibilité après une mort brutale de leader. Le 2PC posé au-dessus de Paxos hérite de la durabilité de Paxos et tient bien jusqu'à ~50 participants.

5. **Concevez pour la localité.** L'`INTERLEAVE IN PARENT` co-localise physiquement les données liées dans un même groupe Paxos, transformant une transaction distribuée coûteuse en lecture mono-serveur. Chez F1, plus de 100 millions de directories tiennent sur un seul fragment. Le 2PC est le filet de sécurité, pas la voie normale.

6. **Les lectures sont l'atout vitesse.** Grâce à la base multi-version, lectures seules et snapshot reads se passent de verrous et peuvent viser la réplique la plus proche plutôt que le leader — d'où latence basse et débit multiplié, et la principale parade aux hot spots (en lecture ; les hot spots en écriture restent un problème dur).

7. **La philosophie : ralentir plutôt que mentir.** Quand ε explose, le commit-wait s'allonge, les transactions ralentissent, mais l'external consistency ne cède jamais. Lent et correct vaut mieux que rapide et faux.

## Pour aller plus loin

- **Spanner: Google's Globally-Distributed Database** (Corbett et al., OSDI 2012) — le papier fondateur, celui qui prouve que l'external consistency à l'échelle mondiale est possible. https://research.google.com/archive/spanner-osdi2012.pdf
- **Spanner, TrueTime & the CAP Theorem** (Eric Brewer, Google) — l'auteur du théorème CAP explique pourquoi Spanner est CP. À lire pour dissiper définitivement le mythe.
- **F1: A Distributed SQL Database That Scales** (SIGMOD 2013) — le backend publicitaire construit sur Spanner ; c'est de là que viennent les chiffres de latence et la distribution des directories.
- **Paxos Made Live** (Chandra et al., 2007) — les leçons de la construction de Chubby, le service de verrous Paxos de Google. Indispensable pour comprendre Paxos « en vrai ».
- **Time, Clocks, and the Ordering of Events in a Distributed System** (Lamport, 1978) — le papier fondateur sur les horloges logiques ; comprendre ce que TrueTime dépasse.
- **CockroachDB** — l'alternative open-source à étudier, notamment `pkg/util/hlc/` (Hybrid Logical Clocks, l'alternative logicielle à TrueTime) et `pkg/kv/kvserver/concurrency/` (contrôle de concurrence). Déployer un cluster 3 nœuds en local et tester des transactions multi-régions est le meilleur moyen de sentir le compromis HLC vs TrueTime.
- **Percolator** et **Calvin** — deux autres approches des transactions à grande échelle (traitement incrémental sur Bigtable ; ordonnancement déterministe), utiles pour situer Spanner dans le paysage.
