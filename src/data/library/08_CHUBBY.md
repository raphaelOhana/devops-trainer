# Chubby : un service de verrous pour dompter le consensus

Chubby est le service de coordination interne de Google. On peut le résumer en une phrase, qui est aussi la thèse de l'article original de Mike Burrows (2006) :

> *« Un service de verrous est plus facile à adopter pour des développeurs qu'une bibliothèque Paxos — et il apporte plus de valeur. »*

Cette phrase est le cœur de tout ce qui suit. Chubby ne résout pas un problème que Paxos ne résolvait pas déjà ; il rend ce problème **utilisable** par des ingénieurs normaux, qui n'ont ni le temps ni l'envie de devenir experts en consensus. C'est un choix d'ingénierie sociale autant que technique — et c'est précisément pour ça qu'il a fini par tenir toute l'infrastructure de Google.

Ce chapitre est aussi ta porte d'entrée la plus propre vers le **consensus distribué**. On va donc prendre le temps d'expliquer *pourquoi* se mettre d'accord à plusieurs machines est étonnamment difficile, avant de voir comment Chubby cache cette difficulté derrière une API qui ressemble à un système de fichiers Unix.

---

## 1. Le problème : se mettre d'accord quand rien n'est fiable

### Ce qu'on essaie vraiment de faire

Imagine un système distribué typique de 2002 chez Google. GFS (le système de fichiers distribué) a besoin d'un **master** unique : une machine désignée qui tranche « qui écrit quoi, où ». Bigtable a besoin de savoir quel *tablet server* est responsable de quelle portion de données. MapReduce doit coordonner des milliers de workers.

Tous ces systèmes butent sur la même question, encore et encore :

> **Qui est le chef, et comment tout le monde peut-il être d'accord là-dessus ?**

C'est le problème de l'**élection de leader**, et c'est un cas particulier d'un problème plus général : le **consensus distribué**. Se mettre d'accord, à plusieurs machines, sur *une seule valeur* — même quand certaines machines tombent en panne, même quand le réseau perd des messages.

Avant Chubby, chaque équipe bricolait sa propre solution. GFS avait une élection primaire *ad hoc*, connue pour ses bugs. Bigtable demandait parfois une intervention manuelle d'un opérateur. Chacun réinventait, mal, la même roue fragile.

### Pourquoi c'est difficile : on ne distingue pas « mort » de « lent »

Voici l'intuition centrale, celle qu'il faut vraiment intérioriser. Sur une seule machine, si un thread plante, tu le sais : le système d'exploitation te le dit. En distribué, tu n'as qu'un seul outil pour observer une autre machine : **lui envoyer un message et attendre une réponse.**

Et là, tout se fissure. Tu envoies un message au chef présumé. Pas de réponse. Que s'est-il passé ?

- Le chef est peut-être **mort** (crash, coupure de courant).
- Ou il est **vivant mais lent** (GC pause, surcharge CPU, disque saturé).
- Ou il est vivant et a répondu, mais **la réponse s'est perdue** en route.
- Ou le **réseau est coupé** entre vous deux (une *partition réseau*), alors qu'il parle très bien à d'autres.

**Du point de vue de l'observateur, ces quatre cas sont rigoureusement indiscernables.** Un silence est un silence. Tu ne peux pas, par principe, savoir si l'absence de réponse signifie « mort » ou « juste lent ».

C'est de là que vient le danger du **split-brain** (cerveau divisé). Supposons qu'on décide, par prudence : « si le chef ne répond pas en 5 secondes, on en élit un nouveau ». Mais l'ancien chef n'était pas mort — juste ralenti par une pause GC de 6 secondes. Il revient, se croit toujours le chef, pendant qu'un nouveau chef a été élu. **Deux machines se croient maîtres en même temps.** Toutes deux acceptent des écritures. Les données divergent. C'est la corruption silencieuse, le pire cauchemar d'un système de stockage.

### L'impossibilité FLP : le mur théorique

Ce malaise a un nom formel. En 1985, Fischer, Lynch et Paterson démontrent le **résultat d'impossibilité FLP** :

> *Dans un système asynchrone, il est impossible de garantir qu'un algorithme de consensus se termine, dès lors qu'un seul processus peut tomber en panne.*

« Asynchrone » a ici un sens technique précis : **aucune borne sur le temps de transmission des messages ni sur la vitesse des processus.** C'est exactement le monde qu'on vient de décrire — celui où tu ne peux pas distinguer « lent » de « mort », parce qu'un message peut toujours mettre *un peu plus longtemps* à arriver.

FLP ne dit pas « le consensus est impossible ». Il dit quelque chose de plus subtil et plus profond : **aucun algorithme ne peut être à la fois toujours correct (safe) et toujours terminant (live) dans le pire cas.** Il y aura toujours un enchaînement pathologique de délais qui empêche de conclure. Tu dois sacrifier quelque chose.

En pratique, on sacrifie la garantie de terminaison *dans le pire cas absolu*, et on la remplace par une hypothèse de **timing** : « la plupart du temps, le réseau finit par se comporter raisonnablement ». Sous cette hypothèse, on progresse. Dans les rares fenêtres où le réseau devient franchement pathologique, on refuse de trancher plutôt que de trancher à tort. **On préfère bloquer que corrompre.** C'est le compromis fondamental, et tu vas le voir revenir partout dans Chubby.

C'est précisément ce que fait **Paxos**, l'algorithme de Leslie Lamport : il garantit qu'on ne décidera jamais deux valeurs contradictoires (la *sûreté* est absolue, toujours), et il progresse dès que le réseau redevient stable un moment. Paxos ne viole pas FLP — il joue dans ses règles, en abandonnant la terminaison garantie au profit de la sûreté garantie.

---

## 2. L'idée-clé : un service de verrous plutôt qu'une bibliothèque

Donc Paxos existe, il est correct, il résout le consensus. Problème réglé ? Non. Paxos, sous sa forme brute, est une **bibliothèque** que chaque équipe devrait intégrer dans son service. Et là commencent les vrais ennuis pratiques.

### Deux mondes : la bibliothèque contre le service

**Option A — chaque service embarque une bibliothèque Paxos.**

Pour utiliser Paxos, un service doit être réécrit comme une **machine à états répliquée** : toute son évolution doit passer par un journal d'opérations ordonné et validé par consensus. C'est un chantier de plusieurs semaines, difficile, et truffé de pièges subtils (Paxos est notoirement dur à implémenter correctement). Pire : chaque service a besoin de plusieurs répliques pour la haute disponibilité. GFS, Bigtable et MapReduce, avec 5 répliques chacun, ça fait **15 serveurs dédiés au consensus**, dupliquant trois fois la même mécanique.

**Option B — un service de verrous partagé : Chubby.**

À la place, on monte *une seule* cellule Chubby (5 serveurs au total). Elle expose une API triviale : des fichiers et des verrous. GFS, Bigtable, Borg partagent tous **la même** cellule Chubby. Les ingénieurs n'apprennent aucune sémantique de consensus : ils appellent `Acquire()` et `Release()`, comme des verrous classiques.

### L'exemple qui rend tout concret

Voici la promesse « ajouter l'élection de leader à un service existant ». Avec une bibliothèque Paxos, tu réécris le service en machine à états — des semaines. Avec Chubby, tu ajoutes littéralement deux lignes :

```python
# Avant : aucune élection de leader
def write_to_file_server(data):
    file_server.write(data)

# Après Chubby : deux lignes ajoutées
def write_to_file_server(data, lock_count):
    if lock_count < chubby.current_lock_count:
        raise StaleWrite("Je ne suis plus le master")
    file_server.write(data)

# Acquérir le verrou de master :
lock = chubby.acquire("/ls/gfs/master-lock")
lock_count = lock.count   # entier monotone croissant
```

Le `lock_count` est un compteur qui ne fait qu'augmenter à chaque nouvelle acquisition du verrou. On y reviendra en détail (les *sequencers*), mais l'idée saute déjà aux yeux : le service peut détecter qu'il n'est plus le chef en comparant un simple entier.

### Le compromis, énoncé franchement

Pourquoi préférer le service à la bibliothèque, alors que la bibliothèque est *techniquement* supérieure (pas de saut réseau supplémentaire, contrôle total) ? Parce que la bibliothèque **échoue socialement**. Elle demande trop aux équipes. Cinq raisons résument l'arbitrage :

1. **Adoption graduelle.** Deux lignes à ajouter, pas un service à réécrire.
2. **Mutualisation des ressources.** 5 répliques partagées par tous, au lieu de 5 par service. 15 serveurs → 5.
3. **Interface familière.** C'est « des fichiers Unix + des verrous », pas de la sémantique de consensus. L'adoption est bien plus rapide.
4. **Stockage en bonus.** Une bibliothèque Paxos ne fait que du consensus ; Chubby offre en prime un petit espace de stockage cohérent pour des métadonnées — d'où un service de nommage et un magasin de configuration quasiment gratuits.
5. **Protection par sequencer intégrée.** Chubby fournit d'office le mécanisme qui protège contre les détenteurs de verrou périmés (voir §6). Avec une bibliothèque, chaque équipe devrait le réimplémenter à la main.

Le coût de ce choix : un saut réseau à chaque opération, un point de dépendance centralisé, et une API plus riche (donc plus complexe) qu'un simple `get/put`. Google a jugé que ça valait très largement le coup. L'histoire lui a donné raison.

---

## 3. Le modèle mental : un minuscule système de fichiers ultra-fiable

Voici la façon la plus juste de se représenter Chubby :

> **Chubby est un tout petit système de fichiers, extrêmement fiable et parfaitement cohérent, dans lequel tu peux poser des verrous sur les fichiers.**

Tiny, parce qu'il ne stocke que de petites métadonnées (quelques Ko par fichier, jamais des données volumineuses). Ultra-fiable, parce que répliqué et coordonné par Paxos. Parfaitement cohérent, parce que chaque lecture reflète la dernière écriture validée — jamais de valeur périmée servie en douce.

### Le namespace ressemble à un chemin Unix

```
/ls/foo/gfs/master        → fichier contenant l'adresse du master GFS
/ls/foo/bt/tablet-map      → emplacement des tablets Bigtable
/ls/foo/borg/cell          → infos sur le cluster Borg
```

`/ls` signifie *lock service*. `foo` est le nom de la cellule. Le reste est une arborescence libre, exactement comme un système de fichiers. Cette familiarité n'est pas cosmétique : c'est **la** décision de design qui a rendu Chubby adoptable. Un ingénieur sait déjà ouvrir, lire, écrire un fichier et poser un verrou dessus. Il n'a rien de nouveau à apprendre.

### Deux types de nœuds

- **Permanents** : ils existent jusqu'à ce qu'on les supprime explicitement. Pour la config, les adresses stables.
- **Éphémères** : ils disparaissent automatiquement dès que la session du client qui les a créés expire. On verra que c'est l'astuce élégante qui répond à la question « qui est vivant en ce moment ? ».

### L'API, en prose

Tu **ouvres** un nœud pour obtenir un *handle* (une poignée). Avec ce handle, tu peux **lire** ou **écrire** un petit contenu, **acquérir** un verrou en mode exclusif (écriture) ou partagé (lecture), le **relâcher**, et surtout **t'abonner** à des événements sur ce nœud.

```python
handle = chubby.Open("/ls/foo/gfs/master")

content = chubby.Read(handle)                 # petits fichiers, ~quelques Ko max
chubby.Write(handle, "machine-123:9000")

chubby.Acquire(handle, EXCLUSIVE)             # verrou d'écriture
chubby.Acquire(handle, SHARED)                # verrou de lecture
chubby.Release(handle)

chubby.Subscribe(handle, [FILE_MODIFIED, LOCK_CONFLICT])
```

L'abonnement aux **événements** est ce qui remplace le *polling* (interroger en boucle « alors, ça a changé ? »). Le client est notifié par *callback* quand le fichier change, quand quelqu'un veut son verrou, quand un nœud est créé ou supprimé. On y revient au §7.

---

## 4. Sous le capot : 5 répliques, Paxos, et le quorum majoritaire

Passons de l'usage à la mécanique. Une **cellule** Chubby, c'est typiquement **5 serveurs** (les *répliques*).

```
                    CELLULE CHUBBY (5 serveurs)

CÔTÉ CLIENT :                        CÔTÉ SERVEUR :

┌────────────────┐                  ┌──────────┐  ┌──────────┐
│ Bibliothèque   │──── RPC ────────►│ MASTER   │  │ RÉPLIQUE │
│ cliente        │◄─── réponse ────│ (élu)     │  │ (suiveur │
│                │                  │          │  │  Paxos)  │
│ Cache local :  │                  │ Leader   │  └──────────┘
│  /ls/gfs/...   │                  │ Paxos    │  ┌──────────┐
│  /ls/bt/...    │                  │          │  │ RÉPLIQUE │
└────────────────┘                  │ Base de  │  └──────────┘
                                     │ données  │  ┌──────────┐
                                     └────┬─────┘  │ RÉPLIQUE │
                                          │        └──────────┘
                                    Réplication    ┌──────────┐
                                    (Paxos)         │ RÉPLIQUE │
                                                    └──────────┘

Quorum : 3 répliques sur 5 doivent être vivantes.
Bail du master : quelques secondes, renouvelé tant qu'il gagne les élections.
```

### Le journal répliqué, garanti par Paxos

Le vrai travail de Paxos ici, ce n'est pas juste « élire un chef ». C'est de maintenir un **journal d'opérations répliqué** (*replicated log*) : une séquence d'écritures, dans le **même ordre**, sur les 5 répliques. Chaque écriture dans la base Chubby est une entrée du journal, et Paxos garantit que les 5 machines s'accordent sur *quelle* opération occupe *quelle* position dans la séquence. C'est ça, la machine à états répliquée : même journal → même état sur chaque réplique.

Une écriture ne « compte » (n'est *committée*) que lorsqu'une **majorité** de répliques l'a acceptée. C'est le fameux **quorum**.

### Ce que t'achète le quorum majoritaire

C'est peut-être l'idée la plus élégante de tout le chapitre. Pourquoi exiger qu'une majorité (3 sur 5) valide chaque décision ?

**Parce que deux majorités d'un même ensemble se recoupent toujours forcément.** Trois plus trois font six, or il n'y a que cinq répliques : deux sous-ensembles de 3 partagent nécessairement au moins un membre. Cette **intersection garantie** est magique. Elle rend le split-brain *impossible au niveau de Chubby lui-même* :

Suppose une partition réseau qui coupe la cellule en deux morceaux, disons 3 répliques d'un côté et 2 de l'autre. Le côté à 3 peut former une majorité : il continue de fonctionner, élit ou conserve un master, valide des écritures. Le côté à 2 **ne peut pas atteindre la majorité** : il se bloque, refuse de prendre la moindre décision. Il est impossible que les deux côtés élisent chacun leur master, parce qu'il ne peut pas y avoir deux majorités disjointes. **Au pire, un côté avance et l'autre s'arrête — jamais les deux n'avancent en se contredisant.**

C'est exactement le compromis de FLP concrétisé : on sacrifie la *disponibilité* du côté minoritaire (il bloque) pour préserver la *cohérence* (on ne décide jamais deux choses contradictoires). On préfère bloquer que corrompre.

### Combien de pannes tolère-t-on ?

Avec 5 répliques et une majorité de 3, on tolère la perte de **2 répliques** et on continue à fonctionner. C'est le dimensionnement standard de Chubby. Pourquoi 5 et pas 3 ? Trois répliques ne tolèrent qu'une seule panne — trop juste quand on veut pouvoir perdre une machine *et* faire une maintenance sur une autre en même temps. Pourquoi pas 7 ? Parce que plus de répliques signifie des quorums plus gros, donc chaque écriture doit attendre plus d'acquittements : **la latence d'écriture augmente avec la taille du quorum.** Cinq est le point d'équilibre entre tolérance aux pannes et performance.

---

## 5. Le bail du master : lire vite sans trahir la cohérence

Il reste une tension. Si *chaque* opération, y compris les lectures, devait passer par un round Paxos avec quorum, Chubby serait lent. Or les lectures dominent largement les écritures (« qui est le master GFS ? » est demandé sans arrêt). D'où le mécanisme du **bail du master** (*master lease*).

### L'idée

Parmi les 5 répliques, une seule est élue **master** à un instant donné. Cette élection se fait, elle aussi, via Paxos — les répliques s'accordent sur qui est master. Une fois élu, le master obtient un **bail** : une promesse, de la part de la majorité des répliques, du type *« pendant les quelques prochaines secondes, on s'engage à ne pas élire de nouveau master »*.

Tant qu'il détient un bail valide, le master **sert les lectures tout seul, directement, sans consulter les autres.** C'est sûr : le bail lui garantit qu'aucun autre master ne peut exister pendant ce temps, donc ses données sont à jour. Pas de round réseau pour lire → lectures rapides.

Les **écritures**, elles, doivent toujours passer par Paxos et obtenir l'acquittement d'une majorité. On ne triche jamais sur les écritures.

### L'analogie

Le bail est un **bail de location à durée déterminée**. Le propriétaire (la majorité des répliques) loue le titre de « master » au locataire pour, disons, quelques secondes. Tant que le bail court, le locataire agit en pleine autorité sans redemander la permission à chaque geste. Avant l'échéance, il doit **renouveler** — sinon, à expiration, le titre redevient disponible et une nouvelle élection peut avoir lieu.

Le master renouvelle son bail en continu tant qu'il gagne les élections. S'il tombe en panne, son bail finit par expirer, et une nouvelle élection désigne un successeur.

### Comment le bail contourne FLP en pratique

Voilà le point théorique important. FLP dit qu'on ne peut pas atteindre le consensus de façon garantie dans un monde purement asynchrone. Le bail **réintroduit une hypothèse de timing** : on suppose que les horloges des machines ne dérivent pas de façon délirante sur l'échelle de quelques secondes. Sous cette hypothèse — raisonnable en pratique dans un datacenter — le master sait, en regardant sa propre horloge, s'il détient encore un bail valide.

C'est la manière concrète dont Chubby « sort » du piège FLP : non pas en le violant, mais en s'appuyant sur des délais physiques réels pour transformer un problème insoluble en théorie en un problème parfaitement gérable en pratique. Le prix : si le réseau ou les horloges deviennent vraiment pathologiques, le système ralentit ou se bloque — jamais il ne se corrompt.

### Combien de temps prend une élection ?

Quelques secondes en général. L'article rapporte deux élections récentes de **6 s et 4 s**, avec des valeurs observées « aussi hautes que 30 s » dans les cas défavorables. Pendant cette fenêtre, la cellule est indisponible pour les écritures. C'est le coût, assumé, d'un basculement de master.

---

## 6. Sessions, KeepAlive et le bail de ~12 secondes

On a vu le bail *du master* (côté serveur). Il existe un second bail, tout aussi crucial : celui de la **session** entre un client et le master.

### Pourquoi une session

Chaque client entretient une **session** avec le master Chubby. Cette session est le contrat qui dit « ce client est vivant et connecté ». Tous les verrous qu'il détient, tous les handles qu'il a ouverts, tous les nœuds éphémères qu'il a créés, sont attachés à cette session. **Si la session meurt, tout ça s'évanouit** — et c'est voulu, car c'est ce qui permet de nettoyer proprement après un client planté.

La session est maintenue vivante par des **KeepAlive** : des RPC périodiques que le client envoie au master. À chaque KeepAlive, le master **prolonge le bail** de la session et renvoie la nouvelle échéance.

```python
class ChubbySession:
    def __init__(self, master):
        self.master = master
        self.lease_timeout = 12                       # secondes
        self.lease_expiry = time.now() + self.lease_timeout

    def keepalive(self):
        while True:
            response = self.master.KeepAlive(
                session_id=self.id,
                current_lease_timeout=self.lease_timeout
            )
            # le master répond avec une nouvelle échéance de bail
            self.lease_expiry = response.new_lease_expiry
            # dormir jusqu'à ~la moitié du bail, puis renouveler
            sleep(self.lease_timeout / 2)
```

Le bail de session dure environ **12 secondes**. Le client renouvelle bien avant l'échéance (typiquement à mi-parcours) pour absorber les aléas réseau. Note l'astuce du KeepAlive : c'est un RPC *bloquant* côté master, qui ne répond qu'au moment de prolonger — ce qui sert à la fois de renouvellement de bail *et* de canal pour pousser des événements et des invalidations de cache au client. Une seule mécanique, plusieurs usages.

### La zone de danger : jeopardy et grace period

Que se passe-t-il si un KeepAlive échoue — pas de réponse du master ? On retombe exactement sur le dilemme du §1 : **le client ne peut pas savoir si le master le considère encore vivant.** Peut-être que le master est juste en train de basculer (nouvelle élection), peut-être que la session a réellement expiré.

Chubby gère ça par un état intermédiaire, prudent, appelé **jeopardy** (péril) :

```python
def handle_keepalive_failure(self):
    # État JEOPARDY : on ne sait plus si le master nous croit vivants.

    # Période de grâce : 45 secondes.
    # Pendant la grâce : BLOQUER tous les accès applicatifs au cache.

    if reconnects_within_grace_period():
        pass                          # récupéré ! on reprend normalement
    else:
        # Session EXPIRÉE :
        #  - tous les verrous détenus sont relâchés automatiquement
        #  - l'application doit gérer (redémarrer, réélire, etc.)
        application.session_expired_callback()
```

Pendant la **période de grâce** (~45 s), le client **se fige par prudence** : il bloque les accès au cache plutôt que de risquer de servir des données périmées ou d'agir alors qu'il n'en a plus le droit. Là encore : on préfère bloquer que se tromper.

- S'il **se reconnecte** à temps (au master existant ou à un nouveau), la session survit, on reprend comme si de rien n'était.
- Sinon, la session est déclarée **expirée**. Tous ses verrous sont libérés d'office, et l'application est prévenue par un *callback* pour réagir.

### Le point subtil pour un détenteur de verrou

Voici le piège qui a mordu de vrais systèmes. Un master GFS détient un verrou Chubby. Un souci réseau fait expirer sa session. Chubby libère son verrou et un *autre* master GFS s'élit. Mais **l'ancien master ne sait pas encore qu'il a perdu son verrou** — il continue de se croire maître et de servir des requêtes. Split-brain, à nouveau.

Le bail de session limite déjà la fenêtre (au bout de ~12 s sans KeepAlive, le détenteur *devrait* s'être mis en jeopardy et arrêté). Mais « devrait » n'est pas « garantit ». Il faut un filet plus solide. Ce filet, c'est le sequencer.

---

## 7. Le sequencer : la preuve monotone qu'on détient encore le verrou

### Le problème que rien de ce qui précède ne règle complètement

Répétons-le clairement, car c'est *le* point de correction le plus important de Chubby : **un détenteur de verrou ne peut pas savoir, de manière fiable et instantanée, l'instant précis où il perd son verrou.** Le temps qu'il s'en aperçoive, il a pu envoyer une écriture « au nom du master » à un serveur en aval qui, lui, n'a aucune idée du drame.

### La solution : un compteur monotone attaché au verrou

Quand un client acquiert un verrou, Chubby lui remet un **sequencer** : essentiellement un triplet `(nom du verrou, mode, numéro de génération)`. Le **numéro de génération** est un entier qui **augmente strictement à chaque nouvelle acquisition** du verrou. Il est décidé par Chubby, via l'accord distribué — donc impossible à falsifier sans réellement détenir le verrou.

Le client **joint ce sequencer à chaque opération critique** qu'il envoie en aval. Le serveur en aval (par exemple un *chunk server* GFS) **valide le sequencer** avant d'agir :

```python
# À l'acquisition :
lock = chubby.acquire("/ls/foo/my-lock", EXCLUSIVE)
sequencer = lock.sequencer          # (nom, mode, numéro_de_génération)

# Le serveur en aval valide avant d'exécuter :
def validate_sequencer(sequencer):
    current_gen = chubby.check_sequencer(sequencer)
    if sequencer.generation < current_gen:
        raise StaleSequencer("Le verrou a été réacquis par quelqu'un d'autre !")
    # sinon : sûr de continuer
```

### Le scénario complet, déroulé

1. Le client **A** acquiert le verrou → génération **5**.
2. Partition réseau : A est isolé 60 secondes.
3. Le master fait expirer la session de A → son verrou est libéré automatiquement.
4. Le client **B** acquiert le verrou → génération **6**.
5. A se reconnecte et tente d'écrire avec son sequencer de génération **5**.
6. Le serveur en aval compare : `5 < 6` → **écriture rejetée**. « Sequencer périmé, génération courante = 6. »
7. A apprend ainsi qu'il a perdu le verrou.

**Le split-brain est neutralisé non pas en empêchant A de croire qu'il est master, mais en empêchant ses écritures périmées d'avoir le moindre effet.** C'est une leçon générale de conception : on ne peut pas toujours empêcher un nœud de se tromper sur son propre état, mais on peut rendre ses actions erronées inoffensives.

Point crucial souligné par l'article : **l'usage des sequencers n'est pas optionnel.** Un service qui prend un verrou Chubby mais oublie de valider les sequencers en aval reste vulnérable au split-brain. La sûreté dépend de la coopération du serveur en aval.

---

## 8. Le cache cohérent : servir des dizaines de milliers de clients

### Le problème d'échelle

L'adresse du master GFS peut être lue par **10 000 clients**. Version naïve : chaque lecture est un RPC vers le master Chubby → le master s'écroule sous la charge. Chubby n'est pas taillé pour un débit de lecture énorme (de l'ordre du millier d'opérations par seconde, on y revient).

### La solution : cache côté client avec invalidation

Chaque client met en cache localement les données qu'il lit. Une lecture qui touche le cache est instantanée, zéro RPC. Le tour de force, c'est de garder ce cache **cohérent** sans jamais servir de valeur périmée.

```python
class ChubbyClientCache:
    def read(self, path):
        if path in self.cache and self.cache[path].valid:
            return self.cache[path].content        # hit local !
        content = chubby_master.read(path)          # miss → on va chercher
        self.cache[path] = CacheEntry(content, valid=True)
        return content

    def handle_invalidation(self, path):
        # le master pousse une invalidation quand le fichier change
        if path in self.cache:
            self.cache[path].valid = False           # la prochaine lecture ira rechercher
```

### Le protocole d'invalidation, et pourquoi il est cohérent

Voici la partie qui fait toute la différence avec un cache DNS classique. Quand une écriture arrive côté master :

```python
def write(path, new_content):
    # 1. diffuser une invalidation à TOUS les clients qui cachent ce chemin
    for client in clients_caching(path):
        client.invalidate(path)
    # 2. ATTENDRE l'acquittement de tous ces clients
    wait_for_all_acks()
    # 3. seulement maintenant, appliquer l'écriture
    database.write(path, new_content)
```

L'ordre est l'ingrédient secret. Le master **invalide d'abord tous les caches, attend leurs acquittements, et seulement ensuite applique l'écriture.** Conséquence : au moment où l'écriture devient visible, plus aucun client ne peut détenir l'ancienne valeur en cache. La prochaine lecture de chacun ira forcément rechercher la version fraîche.

Compare avec **DNS et son TTL** : là, un cache peut rester périmé pendant des secondes ou des minutes, jusqu'à expiration du TTL. C'est de la cohérence *éventuelle* — inacceptable pour coordonner un système distribué, où lire une adresse de master obsolète mène droit au split-brain. Chubby, lui, offre une cohérence **forte** : tu ne lis jamais autre chose que la dernière valeur committée.

Le compromis : les écritures deviennent plus lentes (il faut attendre les acquittements d'invalidation de tous les clients qui cachent la donnée) et un client lent peut freiner une écriture. Mais dans un service dominé par les lectures et où la cohérence est reine, c'est exactement le bon arbitrage.

---

## 9. Événements et nœuds éphémères : détecter les pannes sans sonder

### Les événements remplacent le polling

Plutôt que d'interroger Chubby en boucle (« a changé ? a changé ? »), un client **s'abonne** aux événements d'un nœud et reçoit un *callback* quand quelque chose se produit. Les types d'événements couvrent : contenu modifié, nœud créé, nœud supprimé, conflit de verrou (quelqu'un veut ton verrou), session expirée, basculement de master.

GFS s'en sert pour suivre son master : au lieu de relire l'adresse toutes les secondes, le client s'abonne à `FILE_MODIFIED` sur `/ls/foo/gfs/master` et n'est réveillé que lorsque l'adresse change réellement.

```python
class GFSClient:
    def __init__(self):
        self.handle = chubby.Open("/ls/foo/gfs/master")
        chubby.Subscribe(self.handle, events=[FILE_MODIFIED],
                         callback=self.on_master_changed)

    def on_master_changed(self, event):
        addr = chubby.Read(self.handle)
        self.current_master = parse_address(addr)   # toujours à jour
```

### Les nœuds éphémères répondent à « qui est vivant ? »

Voici l'usage le plus élégant. Un **nœud éphémère** est automatiquement supprimé quand la session de son créateur expire. Il *est* donc, littéralement, un témoin de vie.

Un *tablet server* Bigtable, au démarrage, crée un nœud éphémère à son nom sous `/ls/foo/bt/servers/` et y écrit son adresse. Tant qu'il vit, son KeepAlive maintient la session, donc le nœud existe. S'il plante, sa session expire (au bout du bail de ~12 s), le nœud éphémère **disparaît de lui-même**, et le master Bigtable — abonné à `NODE_DELETED` sur ce répertoire — reçoit immédiatement l'événement et réaffecte les tablets du serveur mort.

```python
# Le tablet server enregistre sa présence (éphémère !)
handle = chubby.Open(f"/ls/foo/bt/servers/{server_id}", flags=EPHEMERAL)
chubby.Write(handle, address)

# Le master Bigtable, à la mort d'un serveur :
#  1. la session Chubby expire (bail ~12 s)
#  2. le nœud éphémère est supprimé
#  3. le master reçoit NODE_DELETED
#  4. il réaffecte les tablets en quelques secondes
```

**Détection de panne rapide, sans aucun heartbeat applicatif à écrire.** La combinaison bail de session + nœud éphémère + événement fait tout le travail. Lister le répertoire, c'est lister exactement l'ensemble des serveurs vivants à cet instant. C'est le patron de *service discovery* et de *membership* réduit à sa plus simple expression.

---

## 10. Pourquoi des verrous à gros grain (et pas à grain fin)

Un point de conception qu'il faut comprendre pour ne pas mésuser Chubby : ses verrous sont **à gros grain** (*coarse-grained*). Ils sont pensés pour être détenus **longtemps** — des heures, des jours — et rarement acquis. « Qui est le master ? » se demande une fois et se garde. Ce n'est **pas** « qui possède la ligne 42 ? », question qui se pose des milliers de fois par seconde.

La raison est directe : chaque acquisition de verrou est une **écriture** dans Chubby, donc un round Paxos avec quorum. À gros grain (rare, longtemps tenu), le coût est négligeable. À grain fin, on écroule la cellule.

L'anti-patron classique, à ne jamais reproduire :

```python
for row in database.scan():
    lock = chubby.Acquire(f"/ls/foo/lock/{row.id}")   # FAUX !
    process(row)
    chubby.Release(lock)
# → des milliers d'opérations Chubby par seconde → cellule saturée
```

Pour du verrouillage fin (au niveau ligne, transaction courte), on utilise des **verrous applicatifs**, locaux au service, pas Chubby. Deux autres mésusages à éviter, dans le même esprit : **stocker de gros fichiers** dans Chubby (ce n'est pas une base de données — plafond de quelques Ko ; les grosses données vont dans GFS/Bigtable), et **poller** au lieu de s'abonner aux événements.

Quand Chubby *doit* absorber beaucoup de lectures malgré tout — typiquement quand il est détourné en service de nommage, ce qui fut son usage le plus populaire et le plus inattendu — on interpose des **serveurs proxy**. Un proxy agrège des milliers de clients derrière une seule connexion vers le master : 10 000 clients → 1 proxy → 1 connexion Chubby. La charge de lecture est ainsi déportée hors du cœur consensuel.

Sur les chiffres bruts : Chubby soutient de l'ordre de **1 000 opérations par seconde**. C'est modeste, et c'est assumé : Chubby n'est pas un système à haut débit, c'est un système à *haute fiabilité* et *forte cohérence*. On ne lui demande pas d'être rapide, on lui demande de ne jamais mentir.

---

## 11. Le ciment de l'infrastructure Google

Chubby n'est pas un produit visible ; c'est la fondation invisible sur laquelle repose presque tout le reste chez Google.

- **GFS** utilise Chubby pour élire son master et ancrer la racine de ses métadonnées.
- **Bigtable** l'utilise pour élire son master, découvrir ses *tablet servers* (via les nœuds éphémères), et stocker son schéma. L'article Bigtable rapporte que l'indisponibilité de Bigtable *imputable à Chubby* ne représente que **0,0047 %** des heures-serveur — un chiffre qui dit à quel point Chubby est fiable en pratique.
- **Borg** (l'orchestrateur de conteneurs, ancêtre de Kubernetes) l'utilise pour élire son *Borgmaster*.
- **Tout le reste** est bâti au-dessus de ces briques-là.

Le revers de cette centralité : **si Chubby tombe, les pannes cascadent.** Bigtable ne peut plus élire de master, GFS non plus, et tout ce qui en dépend vacille. D'où les précautions : 5 répliques (tolérance à 2 pannes), cellules réparties dans des domaines de défaillance distincts, applications conçues pour une **dégradation gracieuse**, et bibliothèques clientes qui continuent de servir les données en cache pendant une panne de la cellule. La dépendance est réelle ; elle est gérée par la redondance et par la capacité des clients à tenir sur leur cache.

---

## 12. L'héritage : ZooKeeper, etcd, et Kubernetes

Chubby a lancé toute une lignée. Comprendre la filiation, c'est comprendre d'où vient l'infrastructure moderne.

```
FLP (1985)         → « le consensus est impossible à garantir en async »
      ↓
PAXOS (Lamport)    → « solution pratique et sûre au consensus »
      ↓
CHUBBY (Google, 2006)   → « Paxos en service + verrous »
      ↓
ZOOKEEPER (Yahoo, 2010) → « un Chubby open source »
      ↓
ETCD (CoreOS, 2013)     → « ZooKeeper avec Raft + stockage K8s »
      ↓
KUBERNETES (2014)       → « stocke TOUT son état de cluster dans etcd »
```

**ZooKeeper** est en quelque sorte le Chubby open source. Il reprend l'interface système de fichiers (les *znodes*), les événements (appelés *watches*), les sessions. Il utilise **Zab** (*ZooKeeper Atomic Broadcast*), un protocole cousin de Paxos, pour son journal répliqué. Il ajoute des idées propres : les **nœuds séquentiels** (éphémères auto-numérotés, très pratiques pour l'élection et les files d'attente) et des *watches* qui se déclenchent **exactement une fois** (plus simples à raisonner que les événements Chubby). C'est ZooKeeper qui a coordonné toute une génération : Hadoop, Kafka, HBase.

**etcd** est la génération suivante. Il troque Paxos contre **Raft**, un algorithme de consensus conçu explicitement pour être *compréhensible* — même garanties de sûreté, mais beaucoup plus facile à implémenter correctement et à raisonner. Il abandonne l'interface fichier au profit d'une API **clé-valeur** minimale (`get`/`put`/`delete`/`watch`), en gRPC et HTTP, avec baux et authentification. Plus simple, plus performant sur les charges à débit soutenu.

Et c'est etcd qui stocke **tout l'état d'un cluster Kubernetes** : définitions de pods, endpoints de services, ConfigMaps, Secrets, ressources personnalisées. Quand tu déploies sur Kubernetes, tu n'appelles jamais etcd directement — le plan de contrôle l'abstrait entièrement. Mais chaque élection de leader du plan de contrôle, chaque écriture d'état, passe par le même mécanisme fondamental que Chubby a popularisé : **un journal répliqué, validé par quorum, protégé par des baux.** Comprendre Chubby, c'est comprendre pourquoi Kubernetes est fiable.

Pour un nouveau système aujourd'hui, le choix par défaut est **etcd** — c'est le standard de fait, précisément parce que c'est celui de Kubernetes.

---

## À retenir

1. **Le consensus est dur parce qu'on ne distingue pas « mort » de « lent ».** Un silence peut être un crash, une lenteur, un message perdu ou une partition. FLP formalise ce mur : on ne peut être à la fois toujours sûr et toujours terminant. Chubby choisit la sûreté et accepte de bloquer plutôt que de corrompre.

2. **Un service de verrous bat une bibliothèque Paxos — socialement.** Deux lignes de code au lieu d'une réécriture, 5 serveurs partagés au lieu de 5 par service, une API familière (fichiers + verrous) au lieu de sémantique de consensus. La supériorité technique de la bibliothèque ne sert à rien si personne ne l'adopte.

3. **Le quorum majoritaire achète l'anti-split-brain.** Deux majorités de 5 se recoupent toujours ; il ne peut donc jamais exister deux masters valides simultanément. 5 répliques tolèrent 2 pannes ; le côté minoritaire d'une partition se bloque au lieu de diverger.

4. **Deux baux structurent le temps.** Le *bail du master* (quelques secondes) l'autorise à servir les lectures seul, sans quorum, en réintroduisant une hypothèse de timing qui contourne FLP en pratique. Le *bail de session* (~12 s), maintenu par KeepAlive, décide de la vie et de la mort des verrous et des nœuds éphémères d'un client.

5. **Le sequencer rend les actions périmées inoffensives.** Un détenteur de verrou ne peut pas savoir l'instant exact où il le perd ; un compteur de génération monotone, validé en aval, fait rejeter ses écritures obsolètes. Ce n'est pas optionnel : la sûreté en dépend.

6. **Cache invalidé *avant* l'écriture = cohérence forte à grande échelle.** Contrairement au TTL de DNS (périmé pendant un temps), Chubby invalide tous les caches et attend leurs acquittements avant de committer, servant des dizaines de milliers de clients sans jamais leur mentir.

7. **Gros grain, pas grain fin.** Les verrous Chubby désignent « qui est le master », tenus des heures, rarement acquis. Chaque acquisition est une écriture Paxos : le grain fin écroule la cellule. Pour le reste, verrous applicatifs, GFS/Bigtable pour les données, événements plutôt que polling.

---

## Pour aller plus loin

- **Mike Burrows, *The Chubby Lock Service for Loosely-Coupled Distributed Systems* (OSDI 2006).** L'article source. Court, lisible, plein de retours de production honnêtes. À lire une fois qu'on a le modèle mental de ce chapitre.
- **Leslie Lamport, *Paxos Made Simple* (2001).** L'algorithme raconté par son auteur. Le titre est un brin optimiste, mais c'est la référence.
- **Fischer, Lynch, Paterson, *Impossibility of Distributed Consensus with One Faulty Process* (1985).** Le résultat FLP. Court et fondateur ; vaut au moins d'en lire l'énoncé et l'intuition.
- **Diego Ongaro & John Ousterhout, *In Search of an Understandable Consensus Algorithm* (Raft, 2014).** Le consensus repensé pour être enseignable. Le site raft.github.io propose une visualisation interactive qui vaut mille pages.
- **Hunt et al., *ZooKeeper: Wait-free coordination for Internet-scale systems* (2010).** Le Chubby ouvert, avec ses idées propres (nœuds séquentiels, watches).
- **Martin Kleppmann, *Designing Data-Intensive Applications*, chapitres 8 et 9.** La meilleure mise en perspective de tout ceci : modèles de défaillance, cohérence, consensus. Le prolongement naturel de ce chapitre.
