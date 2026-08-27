# MapReduce : calculer sur mille machines sans devenir expert en systèmes distribués

En 2004, deux ingénieurs de Google — Jeff Dean et Sanjay Ghemawat — publient un article qui va littéralement fonder l'industrie du Big Data. Leur idée n'est pas un algorithme brillant ni une structure de données astucieuse. C'est une **abstraction**. Ils ont trouvé le bon niveau auquel couper le problème pour que des milliers de programmes différents partagent la même plomberie. Ce chapitre explique pourquoi cette coupe était la bonne, et ce qu'elle coûte.

La promesse tient en une phrase : *« Écris un programme simple. Exécute-le efficacement sur mille machines en une demi-heure. »*

---

## Le problème : traiter des pétaoctets sur du matériel qui tombe en panne

Mettons-nous à la place d'un ingénieur de Google en 2003. Vous devez construire l'index inversé du moteur de recherche, calculer le PageRank sur le graphe du web, compter la fréquence des mots dans 20 To de documents, analyser des téraoctets de logs. Chacune de ces tâches est, sur le fond, un calcul simple. Le problème, c'est l'**échelle** : les données ne tiennent pas sur une machine, et le calcul non plus.

Vous n'avez donc pas d'autre choix que de distribuer. Et là, chaque programme, quel que soit son objectif métier, se retrouve à réécrire **le même code d'infrastructure** :

- découper les données et les répartir sur les machines ;
- lancer le travail en parallèle et coordonner les workers ;
- gérer les pannes — parce que sur mille machines de commodité, il y en a *toujours* une qui meurt pendant le job ;
- faire circuler les résultats intermédiaires entre les machines ;
- surveiller la progression et déboguer quand ça coince.

Le résultat est catastrophique en termes de productivité : **90 % du code sert l'infrastructure, 10 % sert la logique métier.** Le compteur de mots « intéressant » fait quinze lignes ; sa version distribuée artisanale en fait cinq mille, truffées de bugs de concurrence difficiles à reproduire. Chaque équipe réinvente la même roue, avec ses propres défauts, et rien n'est réutilisable.

Le vrai problème n'est donc pas technique au sens algorithmique. Il est **organisationnel** : comment faire pour qu'un ingénieur qui n'a jamais étudié les systèmes distribués puisse lancer un calcul sur 1 800 machines sans devenir, en chemin, un spécialiste de la tolérance aux pannes et du load balancing ?

---

## Le modèle mental : deux fonctions pures, et le runtime fait le reste

L'intuition de MapReduce vient de la programmation fonctionnelle. Beaucoup de traitements de données massives se décomposent naturellement en deux temps : **transformer** chaque enregistrement indépendamment, puis **agréger** les résultats qui vont ensemble. C'est exactement `map` et `reduce` de Lisp, mais appliqués à des téraoctets répartis sur un cluster.

Le programmeur n'écrit que deux fonctions :

```python
def map(key, value) -> list[(key, value)]:
    """Traite UN enregistrement d'entrée, émet des paires clé/valeur intermédiaires."""

def reduce(key, values: list) -> list[value]:
    """Agrège TOUTES les valeurs d'une même clé, émet le résultat final."""
```

C'est tout. Le programmeur ne voit jamais une machine, un socket réseau, ni une panne. Entre les deux fonctions, le **runtime** MapReduce fournit gratuitement — et une fois pour toutes — la parallélisation (M workers de map, R workers de reduce), la tolérance aux pannes, la localité des données, l'équilibrage de charge, la communication réseau et le monitoring.

Entre `map` et `reduce` s'intercale une troisième phase que le programmeur ne code pas mais qu'il doit comprendre : le **shuffle**. C'est elle qui regroupe, à travers le réseau, toutes les valeurs d'une même clé pour les livrer au même reducer. Le modèle complet est donc **map → shuffle → reduce**.

### L'exemple canonique : compter les mots

Tout le monde apprend MapReduce avec le comptage de mots, parce qu'il rend le modèle limpide. Objectif : compter la fréquence de chaque mot dans 20 To de pages web.

```python
def map(document_name, document_content):
    # Appelée une fois par document
    for word in document_content.split():
        emit_intermediate(word, "1")

def reduce(word, counts):
    # Appelée une fois par mot distinct
    total = sum(int(c) for c in counts)
    emit(word, str(total))
```

`map` reçoit un document, et pour chaque mot émet la paire `(mot, "1")` — « j'ai vu ce mot une fois ». Le shuffle rassemble ensuite tous les `"1"` d'un même mot. `reduce` reçoit alors `("the", ["1", "1", "1", ...])` et fait la somme. Fin. Le même programme de quinze lignes tourne sur 1 800 machines et termine en un quart d'heure là où une version séquentielle demanderait des semaines de CPU.

L'entrée vient de fichiers **GFS** (le système de fichiers distribué de Google, cf. chapitre précédent), la sortie repart dans GFS. Ce détail — l'entrée et la sortie vivent dans un système de fichiers répliqué — sera crucial pour la tolérance aux pannes.

---

## Idée-clé n°1 : la pureté des fonctions autorise la ré-exécution

Voici le point le plus profond du design, et celui qu'un ingénieur bas-niveau appréciera le plus. **Pourquoi imposer que `map` et `reduce` soient des fonctions pures et déterministes ?** Parce que c'est ce qui rend la tolérance aux pannes *triviale*.

Une fonction pure ne dépend que de son entrée et ne produit pas d'effet de bord observable. Conséquence : si une tâche échoue à mi-parcours, il suffit de la **relancer depuis le début** sur une autre machine. Elle relira la même entrée et produira le même résultat. Aucun protocole de récupération sophistiqué, aucun journal de transactions à rejouer, aucun état partiel à réconcilier. La tâche est **idempotente** : l'exécuter une fois ou dix fois donne le même résultat.

C'est un renversement conceptuel important. Dans un système distribué classique, la panne est traitée par des protocoles de consensus et de reprise coûteux. MapReduce dit : ne rejoue rien, **recalcule**. C'est possible uniquement parce que le modèle de programmation interdit l'état caché. La contrainte que le runtime impose au programmeur (« tes fonctions doivent être pures ») est exactement ce qui permet au runtime de tenir sa promesse (« je gère les pannes pour toi »). Contrainte et garantie sont les deux faces d'une même pièce.

**Le compromis** : cette pureté interdit tout état persistant entre les tâches. Pas de compteur global mutable, pas de communication directe entre workers. On verra plus loin que cette même contrainte, si libératrice pour la tolérance aux pannes, devient le talon d'Achille de MapReduce pour les algorithmes itératifs.

---

## L'architecture : un master, des workers, et un shuffle au milieu

Concrètement, un job MapReduce s'articule autour d'un **master** (l'orchestrateur, unique) et d'une multitude de **workers** (les exécutants, interchangeables).

Le flot d'exécution :

```
ENTRÉE (fichiers GFS, ex. 1 To de documents)
   │  découpée en M morceaux de ~64 Mo
   ▼
PHASE MAP (parallèle)
   Worker 1        Worker 2        Worker 3
   split 1         split 2         split 3
   → map()         → map()         → map()
   → émet (k,v)    → émet (k,v)    → émet (k,v)
   → écrit sur     → écrit sur     → écrit sur
     disque LOCAL    disque LOCAL    disque LOCAL
     (R fichiers)    (R fichiers)    (R fichiers)
   │
   │  SHUFFLE — transfert réseau, regroupement par clé
   ▼
PHASE REDUCE (parallèle)
   Worker A         Worker B         Worker C
   partition 1      partition 2      partition 3
   trié par clé     trié par clé     trié par clé
   → reduce()       → reduce()       → reduce()
   → écrit sortie   → écrit sortie   → écrit sortie
     dans GFS         dans GFS         dans GFS
   ▼
SORTIE (R fichiers dans GFS)
```

Notez une asymétrie qui reviendra plusieurs fois : la sortie des workers de **map** atterrit sur leur **disque local** (c'est de l'intermédiaire), tandis que la sortie des workers de **reduce** part dans **GFS** (c'est le résultat final, répliqué). Retenez-la, elle explique presque toute la logique de tolérance aux pannes.

### Ce que fait le master

Le master est le cerveau. Il tient l'état de chaque tâche — `idle`, `in-progress` ou `completed` — et de chaque worker. Sa boucle de scheduling est simple : tant que tout n'est pas terminé, trouver un worker inactif et lui donner du travail, en préférant d'abord les tâches de map, puis les tâches de reduce une fois tous les maps finis.

```python
def assign_tasks(self):
    while not self.all_completed():
        worker = self.find_idle_worker()
        if not worker:
            continue
        task = self.find_idle_map_task()
        if task:
            # Localité des données : préférer un worker proche de la donnée
            locations = gfs.get_replica_locations(task.input_split)
            preferred = self.find_worker_near(locations)
            self.assign_map_task(task, preferred or worker)
        elif self.all_maps_completed():
            reduce_task = self.find_idle_reduce_task()
            if reduce_task:
                self.assign_reduce_task(reduce_task, worker)
```

Le master **pingue** périodiquement les workers. Sans réponse pendant 60 secondes, le worker est déclaré mort et ses tâches sont réaffectées. Le master est aussi le point de rendez-vous de l'information : il connaît, pour chaque tâche de map terminée, l'emplacement des fichiers intermédiaires, qu'il communique aux reducers.

### Ce que fait un worker de map

Un worker de map lit son morceau d'entrée depuis GFS, applique la fonction `map` de l'utilisateur, et **répartit** immédiatement les résultats en R paquets sur son disque local. La répartition suit une fonction de partitionnement, typiquement `hash(clé) % R` :

```python
def execute_map_task(self, task):
    input_split = gfs.read(task.input_file, task.start, task.bytes)
    intermediate = defaultdict(list)
    for key, value in parse_input(input_split):
        for out_key, out_val in user_map(key, value):
            intermediate[out_key].append(out_val)

    # R fichiers locaux, un par partition de reduce
    files = [open(f"intermediate_{task.id}_{r}", "w") for r in range(R)]
    for key, values in intermediate.items():
        bucket = partition_function(key, R)   # ex. hash(key) % R
        for value in values:
            files[bucket].write(f"{key}\t{value}\n")
    for f in files: f.close()

    # Le worker signale au master l'emplacement de ses R fichiers
    locations = [f"worker-{self.id}/intermediate_{task.id}_{r}" for r in range(R)]
    master.report_map_complete(task.id, locations)
```

Le partitionnement est la clé du shuffle : il garantit que **toutes** les occurrences d'une clé donnée, quel que soit le worker de map qui les a produites, iront dans le même paquet numéro `r`, donc au même reducer.

### Ce que fait un worker de reduce

Le reducer numéro `r` va chercher, par RPC, le paquet `r` sur **chaque** worker de map. Il concatène ces fragments, les **trie par clé** pour regrouper les valeurs identiques (avec un tri externe sur disque si ça déborde de la mémoire), puis appelle `reduce` une fois par clé distincte, dans l'ordre des clés :

```python
def execute_reduce_task(self, task):
    # 1. Récupérer mon paquet chez tous les map workers
    data = []
    for loc in task.intermediate_locations[task.partition]:
        data.extend(parse(rpc.read(loc)))

    # 2. Trier par clé (regroupe les valeurs d'une même clé)
    data.sort(key=lambda kv: kv[0])   # tri externe si trop gros

    # 3. Appliquer reduce() par groupe de clé
    temp = f"/tmp/reduce_{task.id}.tmp"
    with open(temp, "w") as out:
        for key, group in group_by_key(data):
            for result in user_reduce(key, group):
                out.write(f"{key}\t{result}\n")

    # 4. Rename atomique vers la sortie finale dans GFS
    gfs.atomic_rename(temp, task.output_path)
    master.report_reduce_complete(task.id, task.output_path)
```

Ce tri offre au passage une **garantie d'ordre** utile : à l'intérieur de chaque partition, les clés arrivent triées. Un `reduce` peut donc supposer que ses clés lui parviennent dans l'ordre, produire des fichiers de sortie triés, et une simple fusion des R fichiers donne une sortie **globalement triée**. Pour de l'analyse de séries temporelles (« traite les événements de type A dans l'ordre du temps »), c'est directement exploitable.

---

## Idée-clé n°2 : la localité des données, ou optimiser le vrai goulot d'étranglement

Un réflexe d'ingénieur bas-niveau : avant d'optimiser, identifier le goulot. En 2004, dans un datacenter Google, le goulot n'est ni le CPU ni le disque, c'est le **réseau**. La bande passante de bissection par machine est bien inférieure à 1 Gb/s, car des dizaines de machines se partagent les mêmes switches. Déplacer 64 Mo d'un rack à l'autre coûte cher.

D'où le principe fondateur : **on déplace le calcul vers la donnée, pas la donnée vers le calcul.**

MapReduce s'appuie ici sur une propriété de GFS : chaque bloc de 64 Mo est **répliqué** sur trois machines. Le master connaît ces trois emplacements. Quand il planifie une tâche de map, il essaie donc de la placer *sur une des machines qui détient déjà une réplique* de l'entrée. À défaut, sur une machine du même switch réseau. En dernier recours seulement, sur n'importe quel worker inactif.

```python
def schedule_map_task(task):
    replicas = gfs.get_replicas(task.input_split)   # ex. 3 machines
    for machine in replicas:                          # 1er choix : lecture locale
        if machine.has_idle_worker():
            return assign_to(machine)
    for machine in replicas:                          # 2e choix : même switch
        for neighbor in network.get_same_switch(machine):
            if neighbor.has_idle_worker():
                return assign_to(neighbor)
    return assign_to(any_idle_worker())               # dernier recours
```

Le résultat rapporté par Google est spectaculaire : sur les gros jobs, **la quasi-totalité des lectures d'entrée sont locales**, et le trafic réseau en phase de map tombe pratiquement à zéro. On a fait disparaître le goulot en réordonnant simplement *où* le travail s'exécute.

**Le compromis** est faible mais réel : la localité contraint le scheduling. Le master ne peut pas toujours donner la tâche idéale au premier worker libre ; il accepte parfois d'attendre ou de faire un choix sous-optimal pour préserver la localité. C'est un échange presque toujours gagnant, mais qui rend le master dépendant des métadonnées d'emplacement de GFS.

---

## Idée-clé n°3 : la tolérance aux pannes, réduite à « réinitialiser et recommencer »

Sur 1 800 machines de commodité, les pannes ne sont pas un cas exceptionnel, c'est le **régime nominal**. Le génie de MapReduce est de rendre la reprise si mécanique qu'elle en devient invisible. Tout repose sur l'idempotence des tâches (idée-clé n°1) et sur l'asymétrie map local / reduce dans GFS.

Quand un worker cesse de répondre aux pings, le master traite quatre cas :

**Tâche de map en cours.** On la remet à `idle`, on la réaffecte. Le nouveau worker relit le même split depuis GFS (répliqué : aucune perte de donnée). Coût quasi nul.

**Tâche de map déjà terminée.** Cas subtil et instructif. La sortie d'un map vit sur le **disque local** du worker. Si ce worker meurt, cette sortie devient **inaccessible** — même si la tâche était marquée « completed ». Il faut donc **la ré-exécuter** malgré tout, et prévenir les reducers qui lisaient chez ce worker de basculer vers la nouvelle copie. C'est le prix de l'optimisation « écrire l'intermédiaire en local ».

**Tâche de reduce en cours.** Remise à `idle`, ré-exécutée ailleurs.

**Tâche de reduce déjà terminée.** Rien à faire. Sa sortie est dans **GFS**, répliquée et sûre. Inutile de recommencer.

```
                  En cours              Terminée
   Map      →  reset + réassigner   reset (sortie sur disque local, perdue)
   Reduce   →  reset + réassigner   rien (sortie dans GFS, sûre)
```

Toute l'asymétrie du tableau se lit dans une seule question : *où vit la sortie ?* Sur disque local, elle meurt avec la machine et il faut recalculer. Dans GFS, elle survit.

Cette mécanique encaisse même les **pannes massives**. L'article raconte une maintenance réseau qui a rendu 80 machines injoignables d'un coup, plusieurs minutes durant. MapReduce a simplement remis à `idle` les tâches de ces 80 machines, les a redistribuées sur les 1 720 survivantes, et le job a continué à progresser jusqu'à terminer — avec un léger retard. C'est *cela* qui a rendu MapReduce révolutionnaire : la tolérance aux pannes vit dans le **logiciel**, ce qui permet d'utiliser du matériel bon marché et faillible plutôt que du matériel « fiable » hors de prix. On échange du coût matériel contre de la logique de reprise.

### La brique de sûreté : l'écriture atomique

Reste une question que se pose immédiatement un esprit rigoureux : si une tâche crashe **en plein milieu d'une écriture**, elle laisse un fichier de sortie partiel — donc des résultats faux. Et si une tâche est ré-exécutée (elle l'est, par design), ne risque-t-on pas d'agréger deux fois la même sortie ?

La réponse tient dans l'**atomicité du commit**. Une tâche écrit toujours dans un fichier **temporaire**, puis effectue un **rename atomique** vers son emplacement final au moment où elle réussit. Pour un reduce, GFS fournit ce rename atomique. Pour un map, le worker n'annonce ses fichiers au master **qu'une fois l'écriture terminée**, et le master ne marque la tâche « completed » qu'à réception de cette annonce.

```python
def reduce_task_execute(task):
    temp = f"/tmp/reduce_{task.id}.tmp"
    with open(temp, "w") as f:
        for key, values in sorted_intermediate:
            for result in user_reduce(key, values):
                f.write(f"{key}\t{result}\n")
    gfs.atomic_rename(temp, task.final_output_path)   # tout ou rien
    master.report_complete(task.id, task.final_output_path)
```

Pourquoi est-ce correct même si la tâche tourne deux fois ? Parce que les fonctions sont **déterministes** : les deux exécutions produisent exactement la même sortie. Le second rename écrase le premier sans changer le résultat. Un fichier temporaire jamais commité est simplement ignoré et sera nettoyé. Aucune corruption possible. On retrouve ici, appliquée au stockage, la même idée qu'à l'idée-clé n°1 : le déterminisme transforme la ré-exécution en opération sûre.

### Et si le master meurt ?

Le master est unique, donc c'est le point de défaillance unique. Le pari de 2004 est pragmatique : une seule machine, les pannes de master sont rares. Le design prévoit un **checkpoint périodique** de l'état du master dans GFS ; un nouveau master peut repartir du dernier point de contrôle. En pratique, comme les jobs sont courts, on relance souvent le job de zéro. C'est un compromis assumé : investir peu dans un cas rare, plutôt que de complexifier tout le système pour une haute disponibilité du master.

---

## Idée-clé n°4 : le combiner, pré-agréger avant de traverser le réseau

Reprenons le comptage de mots. Un worker de map traite un document de 64 Mo et émet `("the", "1")` peut-être **cinquante mille fois**. Ces cinquante mille paires vont ensuite traverser le réseau jusqu'au reducer responsable de « the ». Pour les mots fréquents, le trafic de shuffle explose — alors qu'il est parfaitement inutile de transmettre cinquante mille « 1 » qu'on va de toute façon additionner.

L'idée du **combiner** : effectuer une **pré-agrégation locale**, sur le worker de map, *avant* le shuffle. Le combiner a souvent le même code que le reduce, mais il tourne sur la sortie d'un seul map :

```python
def combiner(key, values):
    # Même logique que reduce, exécutée sur le map worker avant le shuffle
    emit(key, str(sum(int(v) for v in values)))
```

Le worker de map émet alors `("the", "50000")` — une seule paire au lieu de cinquante mille. Pour un mot très fréquent, c'est une réduction du trafic réseau d'un facteur des dizaines de milliers.

**Le compromis, et sa condition de validité :** le combiner n'est correct que si l'opération de reduce est **commutative et associative**. Additionner par morceaux puis additionner les sommes partielles donne le bon total : la somme le permet, le max et le min aussi. Mais la **moyenne** ne le permet pas — la moyenne des moyennes n'est pas la moyenne globale. La **médiane** non plus. Le combiner est donc une optimisation puissante mais conditionnelle ; l'appliquer à une opération non associative produit des résultats faux. C'est au programmeur de savoir si sa fonction se qualifie.

---

## Idée-clé n°5 : les backup tasks, ou combattre la latence de queue

Voici le problème le plus contre-intuitif, et la solution la plus élégante. Sur un job de grep sur 1 To réparti sur 1 800 workers : 1 799 terminent en 80 secondes, mais **un** worker, coincé sur un disque défectueux qui lit à 1 Mo/s au lieu de 30, traîne encore à 180 secondes. Ce **traînard** (*straggler*) retarde le job entier. La durée d'un calcul parallèle est celle de son maillon le plus lent.

Les causes sont pernicieuses parce qu'elles n'ont rien d'une panne franche : un disque qui se dégrade, un autre job qui se dispute le CPU ou la mémoire sur la même machine, un défaut matériel — l'article cite le cas mémorable d'une machine dont le **cache processeur était désactivé**, la rendant dix fois plus lente sans jamais tomber en panne. Impossible à détecter par un ping : la machine répond, elle est juste lente.

La solution est la **ré-exécution spéculative**. Quand le job approche de sa fin (~95 % des tâches terminées), le master lance des **copies de secours** des tâches encore en cours. Deux machines calculent alors la même chose ; **la première qui termine gagne**, l'autre copie est tuée.

```python
def handle_stragglers():
    if job_is_near_completion():          # ~95 % terminé
        for task in in_progress_tasks:
            if task.running_slow():
                launch_duplicate(task, different_worker)
                # La première terminée gagne, l'autre est tuée
```

C'est le déterminisme (encore lui) qui rend cela légal : peu importe laquelle des deux copies finit, le résultat est identique. L'effet est massif : le benchmark de tri est **44 % plus rapide** avec les backup tasks activées ; le grep termine en ~150 s au lieu de 250 s et plus.

**Le compromis** est explicitement un échange latence contre ressources. Faire tourner des doublons consomme quelques pour cent de capacité en plus. Pourquoi ne pas dupliquer *toutes* les tâches, tout le temps ? Parce que ce serait doubler le coût pour un gain nul sur les tâches déjà rapides. On ne duplique que près de la fin, et seulement les tâches lentes : quelques pour cent de coût pour supprimer la queue de latence. Le calcul est vite fait.

---

## Régler M et R : pourquoi beaucoup plus de tâches que de machines

Une question pratique récurrente : combien de tâches de map (**M**) et de reduce (**R**) faut-il ? Les recommandations issues des benchmarks Google éclairent plusieurs des mécanismes précédents.

La taille d'un split se situe entre **16 et 64 Mo** — assez grand pour amortir le coût de démarrage d'une tâche, assez petit pour laisser du grain à l'équilibrage. On en déduit `M = taille_entrée / taille_split`. Pour R, on vise un petit multiple du nombre de workers (2 à 5×). Chaque tâche de reduce produit un fichier de sortie.

Le point de fond : **M doit être très supérieur au nombre de workers.** Pourquoi ? Pour deux raisons déjà rencontrées.

D'abord l'**équilibrage dynamique**. Avec 10 workers et 100 tâches, un worker rapide en enchaîne plusieurs pendant qu'un lent en fait une seule : la charge s'ajuste toute seule. Avec 10 workers et 10 tâches, un worker lent devient un straggler qui bloque tout — on n'a aucune granularité pour compenser.

Ensuite la **reprise sur panne**. Si un worker meurt avec beaucoup de petites tâches, celles-ci se redistribuent en fines miettes sur les survivants. De grosses tâches, elles, coûteraient cher à recommencer. Beaucoup de petites tâches, c'est de la reprise fluide.

En pratique : partir sur `split = 64 Mo`, `R = 2-3 × workers`, profiler, puis ajuster — augmenter R en cas de skew, le diminuer si le shuffle sature, augmenter la taille de split si le coût de démarrage des maps domine.

### Le data skew : le vrai problème qu'on découvre en production

Le partitionnement `hash(clé) % R` répartit uniformément les *clés*, pas les *volumes*. Or dans la vraie vie, « the » apparaît des milliards de fois et « zyxwvut » trois fois. Toutes les occurrences de « the » vont au même reducer, qui se retrouve avec dix fois plus de travail que la moyenne : c'est un straggler d'origine applicative, pas matérielle.

```
Reducer 0 : "aardvark".."apple"  →  5 minutes
Reducer 1 : "the".."them"        →  47 minutes   ← le skew
Reducer 2 : "zebra".."zymurgy"   →  6 minutes
Durée du job : 47 minutes, dominée par un seul reducer.
```

Les backup tasks n'aident pas ici : la copie sera aussi lente que l'originale, puisque la lenteur vient du **volume**, pas de la machine. Les vraies parades combinent plusieurs des idées vues : le **combiner** écrase l'essentiel du volume de « the » dès le map ; un **partitionnement en deux phases** ajoute un « sel » aléatoire à la clé chaude (`the_0`, `the_1`, …, `the_99`) pour l'éclater sur cent reducers, avant une seconde passe qui recombine ; un **partitionneur sur mesure** traite spécialement les clés connues comme chaudes ; et un **échantillonnage** préalable (0,1 % des données) permet de détecter les clés chaudes avant de lancer le job. En production, 80 % du temps d'un job peut venir de 0,1 % des clés — d'où l'importance de la détection précoce et de la pré-agrégation.

### Contrôler la distribution : le partitionnement sur mesure

Le partitionnement par défaut est aléatoire mais uniforme. On peut le remplacer pour obtenir un regroupement **sémantique** ou **ordonné**. Regrouper les URL par domaine de premier niveau, par exemple, ou — cas du benchmark de tri — produire une sortie **globalement triée**. Pour ce dernier, on échantillonne les clés pour calculer R−1 points de coupure qui découpent l'espace des clés en plages équilibrées : la partition 0 reçoit les plus petites clés, la partition R−1 les plus grandes. Chaque partition étant triée en interne, la concaténation des fichiers est triée de bout en bout.

---

## MapReduce à l'échelle de Google

Quelques chiffres pour ancrer l'ampleur du phénomène. En août 2004, Google exécutait déjà près de 29 000 jobs MapReduce distincts par jour ; en mars 2006, plus de 171 000, sur en moyenne 395 machines chacun. En 2008, la barre des **100 000 jobs par jour** et **20+ pétaoctets traités quotidiennement** était franchie, avec plus de 10 000 programmes MapReduce distincts dans la base de code — la meilleure preuve qu'une bonne abstraction démultiplie une organisation entière.

Les benchmarks de l'article restent parlants. Le **tri de 1 To** (M = 15 000 maps, R = 4 000 reduces) se décompose en trois temps : lecture en map (~200 s, jusqu'à 13 Go/s en pointe), shuffle (~100 s, ~1 To transféré), puis reduce et écriture de 2 To répliqués dans GFS (~50 s, ~40 Go/s en écriture). Total : **environ 350 secondes**, soit un peu moins de six minutes pour trier un téraoctet. Sans les backup tasks, comptez +44 %, autour de 500 secondes — la mesure directe du coût des stragglers.

L'usage le plus emblématique fut la **réécriture du système d'indexation** de la recherche. L'ancien pipeline d'indexation (20 To de documents bruts à transformer en index inversé) reposait sur du code distribué artisanal de plusieurs milliers de lignes, difficile à déboguer et à faire évoluer. Réécrit en une **chaîne d'une dizaine de jobs MapReduce séquentiels** (segmentation, tri par URL, graphe de liens, extraction du texte d'ancre, PageRank, index inversé, optimisation…), il devint radicalement plus simple : chaque étape testable isolément, tolérance aux pannes automatique, ajout d'une fonctionnalité = ajout d'une étape, et scaling par simple ajout de machines.

---

## Les limites : le batch, le disque, et l'absence d'itération

Aucune abstraction n'est gratuite. Les contraintes qui rendent MapReduce si robuste dessinent aussi précisément son domaine d'incompétence.

**MapReduce est fondamentalement du batch.** Toutes les données d'entrée doivent être disponibles *avant* que le job démarre ; le traitement se fait par phases séquentielles sur un ensemble borné. C'est un excellent modèle mental — pas d'état à traîner d'un batch à l'autre, I/O optimales en lecture séquentielle par gros blocs, agrégations et tris globaux possibles. Mais la latence est élevée (il faut attendre la fin du batch entier) et le modèle est incapable de traiter un **flux non borné** (streaming). Traiter 24 heures de logs chaque nuit : parfait. Réagir à un événement en quelques millisecondes : hors sujet. Les frameworks de streaming ultérieurs (Storm, Flink, Spark Streaming, Kafka Streams) sont nés pour ce second besoin — au prix d'une gestion d'état bien plus complexe. Une règle simple : donnée **bornée** → batch/MapReduce ; donnée **non bornée** → streaming.

**MapReduce ne gère pas nativement les itérations, et c'est sa faiblesse majeure.** Or beaucoup d'algorithmes précieux sont itératifs : le PageRank converge en ~50 passes, l'entraînement de modèles de ML en des dizaines d'époques. En MapReduce, chaque itération est un job complet qui **relit toutes les données depuis GFS et les réécrit sur GFS**. Cinquante itérations = cinquante allers-retours disque sur l'intégralité du graphe. L'I/O disque, gratuite pour une passe unique, devient ruineuse répétée cinquante fois. Un PageRank sur 20 To pouvait ainsi demander des heures, dominé par les lectures/écritures intermédiaires.

Cette limite découle en droite ligne de l'idée-clé n°1 : la pureté et l'absence d'état persistant, qui rendaient la ré-exécution triviale, interdisent précisément de **garder les données en mémoire d'une itération à l'autre**. La force et la faiblesse ont la même racine.

---

## L'héritage : Hadoop, puis Spark et Flink

L'histoire de MapReduce est celle d'un paradigme qui a survécu à son implémentation.

En 2006, Yahoo publie **Hadoop**, un clone open-source de MapReduce (avec HDFS comme équivalent de GFS). Hadoop démocratise le Big Data : à partir de 2008, tout le monde en fait, porté par des offres cloud comme AWS EMR.

En 2012, l'AMPLab de Berkeley publie **Spark** et son abstraction centrale, les **RDD** (*Resilient Distributed Datasets*). L'idée résout exactement le point faible de MapReduce : garder les données **en mémoire** d'une itération à l'autre, et ne relire le disque que si un nœud tombe. Sur un PageRank, l'effet est brutal — l'I/O disque entre itérations disparaît, et l'on passe d'un ordre de grandeur de la centaine de secondes par itération à la fraction de seconde. Spark conserve le modèle map/reduce mais l'étend (transformations chaînables, SQL, ML, graphes, streaming en micro-batch) et le rend tolérant aux pannes autrement : au lieu de recalculer une tâche isolée, il rejoue le **graphe de lignage** des transformations qui a produit un RDD perdu.

En 2011 émerge **Flink**, taillé pour le **vrai streaming** : latence de l'ordre de la milliseconde, traitement à l'heure de l'événement (gestion des données en retard), état persistant avec garantie *exactly-once* via des snapshots à la Chandy-Lamport. Là où Spark excelle en batch et en analytique itérative, Flink domine le traitement de flux stateful à faible latence.

Le verdict de 2026 est net. **MapReduce comme runtime est de facto obsolète** : Spark a pris sa place pour le batch, Flink pour le streaming, et Hadoop est « mort » pour les nouveaux projets (même s'il fait encore tourner des data lakes en production). Mais **le paradigme Map/Reduce/Shuffle, lui, est immortel.** On le retrouve tel quel dans Spark, dans Flink, et dans le `GROUP BY` de n'importe quel moteur SQL distribué. Choisir son outil se résume souvent à quatre dimensions : latence exigée, besoin d'état, présence d'itérations, garanties d'ordre. Au-delà de 5 minutes de latence acceptable → batch (Spark) ; en dessous de la seconde → Flink.

MapReduce s'inscrit enfin dans une trinité qui a fondé l'infrastructure de données moderne, chacun ayant inspiré son équivalent open-source : **GFS** (2003, stocker des pétaoctets → HDFS), **MapReduce** (2004, les traiter en parallèle → Hadoop puis Spark), **Bigtable** (2006, stocker du structuré → HBase, Cassandra). Trois systèmes bâtis sur du matériel de commodité, tolérants aux pannes par conception.

---

## À retenir

1. **La vraie invention est l'abstraction, pas l'algorithme.** En n'exposant que deux fonctions pures — `map` et `reduce` — MapReduce a permis à des milliers d'ingénieurs sans culture des systèmes distribués de calculer sur des milliers de machines. 10 000 programmes en quatre ans mesurent la puissance d'une bonne coupe.

2. **La contrainte imposée est ce qui rend la garantie possible.** Exiger des fonctions pures et déterministes est exactement ce qui rend la ré-exécution sûre. Contrainte au programmeur et service rendu par le runtime sont les deux faces d'une même pièce.

3. **Tolérance aux pannes = réinitialiser et recalculer.** Pas de protocole de reprise sophistiqué : une tâche qui échoue est relancée depuis zéro. Toute la logique tient dans une question — *où vit la sortie ?* En local elle meurt avec la machine (donc on recalcule), dans GFS elle survit (donc on ne touche à rien).

4. **Optimiser le goulot réel.** En 2004 le goulot était le réseau ; la localité des données (déplacer le calcul vers la donnée grâce aux réplicas GFS) l'a fait quasi disparaître. Identifier le bon goulot avant d'optimiser reste la leçon d'ingénierie transposable.

5. **Combattre la queue de latence coûte peu et rapporte gros.** Un traînard sur mille machines retarde tout le job. Les backup tasks spéculatives, lancées près de la fin, échangent quelques pour cent de ressources contre 44 % de temps gagné au tri.

6. **Le combiner et le partitionnement sont des optimisations conditionnelles.** Le combiner ne vaut que pour des opérations commutatives et associatives (somme oui, moyenne non). Le partitionnement par défaut équilibre les clés, pas les volumes — d'où le data skew, qu'on combat par pré-agrégation, salage et échantillonnage.

7. **Le runtime est mort, le paradigme est immortel.** Spark (itératif, en mémoire) et Flink (vrai streaming) ont supplanté MapReduce parce que la pureté sans état interdisait de garder les données en mémoire entre itérations. Mais map → shuffle → reduce vit encore dans Spark, Flink et tout `GROUP BY` SQL.

---

## Pour aller plus loin

- **Dean & Ghemawat, *MapReduce: Simplified Data Processing on Large Clusters*** (OSDI 2004) — l'article fondateur, remarquablement lisible. La version CACM 2008 ajoute les statistiques de production. [research.google.com/archive/mapreduce-osdi04.pdf](https://research.google.com/archive/mapreduce-osdi04.pdf)
- **Zaharia et al., *Resilient Distributed Datasets*** (NSDI 2012) — l'article Spark. Se lit comme la critique argumentée des limites de MapReduce et leur solution par les RDD en mémoire.
- **Ghemawat, Gobioff & Leung, *The Google File System*** (SOSP 2003) — le socle sur lequel repose la localité des données de MapReduce ; à lire en amont.
- **Kleppmann, *Designing Data-Intensive Applications***, chapitre 10 — la meilleure mise en perspective de MapReduce dans le paysage batch/streaming, avec ses forces et ses successeurs.
- **Code à étudier :** Apache Hadoop (`hadoop-mapreduce-client/`) pour une implémentation fidèle du modèle ; Apache Spark (`core/.../rdd/`) pour voir comment le lignage remplace la ré-exécution de tâches. Le même compteur de mots fait 15 lignes en MapReduce et 3 en Spark — une bonne façon de sentir ce que l'abstraction a gagné en expressivité.
