# Borg : faire tourner tout Google sur des machines partagées

Kubernetes n'est pas né dans le vide. Il descend en ligne directe d'un système interne que Google a construit vers 2003-2004 et qui a fait tourner **l'intégralité de ses charges de production pendant une décennie** avant que le monde n'en entende parler. Ce système s'appelle **Borg**, et sa promesse tient en une phrase, celle qui ouvre le papier de recherche publié en 2015 :

> *« Cacher les détails de la gestion des ressources et de la gestion des pannes, pour que les utilisateurs se concentrent sur le développement applicatif. »*

Tout le reste — l'architecture, le scheduler, les priorités, l'over-commitment — n'est que de l'ingénierie au service de cette idée. Ce chapitre l'explique de fond en comble. Vous venez du bas niveau, de la sécurité et du silicium ; vous allez retrouver ici des raisonnements familiers (compressible vs non-compressible, isolation imparfaite, sur-allocation contrôlée), simplement déplacés à l'échelle de dizaines de milliers de machines.

---

## Le problème : la fragmentation par équipe

Remontons à Google en 2003. Chaque équipe gère ses propres serveurs, alloués statiquement. Gmail possède ses 500 machines, la Recherche ses 2000, une pipeline MapReduce ses 300. Chaque flotte est dimensionnée pour son **pic** — sinon le service tombe au pire moment — et reste donc sous-utilisée le reste du temps.

Le résultat est un gâchis structurel. Gmail a trop de capacité la nuit ; la Recherche en manque pendant les pics ; MapReduce laisse ses machines tourner à vide entre deux jobs. À l'échelle de la flotte, l'utilisation moyenne plafonne autour de **40 à 50 %**. Autrement dit, plus de la moitié d'un parc matériel valant des milliards de dollars ne sert à rien à un instant donné.

Et ce n'est pas seulement une question d'argent. Chaque équipe **réimplémente les mêmes plomberies** : redémarrer un process qui a crashé, détecter une machine morte, faire un rolling update sans coupure. L'isolation entre applications est faible — une appli qui part en vrille peut saturer la machine et emporter ses voisines. Il n'existe aucune notion de priorité : rien ne dit qu'un job de Recherche user-facing doit passer avant un batch de test.

Le nœud du problème est là : **des ressources cloisonnées par équipe ne peuvent pas absorber les pics les unes des autres.** Le creux de Gmail ne peut pas financer le pic de la Recherche, parce qu'ils vivent sur des machines physiquement séparées. Casser ce cloisonnement, c'est tout l'enjeu de Borg.

---

## Le modèle mental : déclarer l'état voulu, laisser le système converger

Avant l'architecture, il faut saisir le **changement de paradigme** qui rend Borg possible. C'est le concept le plus important du chapitre ; le reste en découle.

Dans le monde d'avant, on administre de façon **impérative** : *« lance le binaire gmail-web sur le serveur 42 »*. On donne des ordres, machine par machine, et on est responsable de leur exécution — donc aussi de tout ce qui casse ensuite.

Borg renverse la logique. On lui décrit un **état désiré** : *« je veux 500 exemplaires de gmail-web qui tournent, chacun avec 2 CPU et 4 Go de RAM, dans un datacenter américain. »* On ne dit jamais *où*. On dit *quoi*, *combien*, et *sous quelles contraintes*. Le système se charge du placement.

La différence est plus profonde qu'un simple confort d'API. Une fois l'état désiré enregistré, Borg entre dans une **boucle de réconciliation** permanente : il compare en continu la réalité observée (quelles tâches tournent, où, en bonne santé ?) à l'état voulu (500 tâches saines), et il agit pour combler l'écart. Une tâche crashe ? L'écart apparaît, Borg la relance ailleurs. Une machine meurt et emporte 10 tâches ? Elles sont replanifiées. On pousse une nouvelle version ? Borg fait converger progressivement l'ancien état vers le nouveau.

L'analogie utile est celle d'un **thermostat**. Vous ne commandez pas « ouvre la vanne de 30 % pendant 12 minutes ». Vous déclarez « je veux 20 °C », et le régulateur mesure, compare, corrige, en boucle, indéfiniment. Borg est le thermostat de vos 10 000 machines. C'est ce modèle déclaratif-réconciliant que Kubernetes héritera trait pour trait — retenez-le, on y reviendra à la fin.

---

## L'architecture : cellule, BorgMaster, Borglet

Passons à la mécanique. L'unité de déploiement de Borg est la **cellule** (*cell*) : un pool d'environ **10 000 machines** gérées comme un tout, généralement à l'échelle d'un datacenter. Toutes les équipes partagent la même cellule — c'est précisément ce partage qui casse le cloisonnement décrit plus haut. Une cellule a un cerveau (le BorgMaster) et, sur chaque machine, un agent (le Borglet).

```
                     CELLULE  (~10 000 machines)

  ┌──────────────────────────────────────────────────────┐
  │   BORGMASTER   —  logiquement 1 process,             │
  │                   physiquement 5 réplicas (Paxos)     │
  │                                                        │
  │   Process principal          Scheduler                │
  │   • RPC des clients          • Feasibility            │
  │   • machine à états          • Scoring                │
  │   • dialogue Borglets        • Preemption             │
  │   • UI web                   (process séparé,         │
  │                               état potentiellement    │
  │   ┌───────────────────────┐   un peu périmé)          │
  │   │  Store répliqué Paxos │                           │
  │   │  snapshot + change log│                           │
  │   └───────────────────────┘                           │
  └──────────────────────────────────────────────────────┘
                          ▲
              les Borglets rapportent leur état
              complet toutes les quelques secondes
                          │
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │ Machine 1 │   │ Machine 2 │   │ Machine N │
  │ Borglet   │   │ Borglet   │   │ Borglet   │
  │  Gmail-1  │   │  Search   │   │  MapR-5   │
  │  Maps-3   │   │  BigTable │   │  YouTube  │
  └───────────┘   └───────────┘   └───────────┘
```

### Le BorgMaster : un cerveau, cinq cœurs

Le **BorgMaster** est le point de contrôle de la cellule. C'est lui qui reçoit les requêtes des clients (soumettre un job, tuer une tâche, modifier une spec), qui tient l'état de toute la cellule en mémoire, et qui dialogue avec les Borglets.

Ce cerveau centralisé pose évidemment une question : *et s'il tombe ?* La réponse tient dans la manière dont il est construit. Logiquement, le BorgMaster est un process unique ; physiquement, c'est un ensemble de **5 réplicas** coordonnés par **Paxos**, l'algorithme de consensus. Un seul réplica est élu *leader* à un instant donné, et c'est lui qui traite toutes les mutations. Chaque écriture (un nouveau job, un changement d'état) n'est validée qu'une fois qu'un **quorum de 3 réplicas sur 5** l'a acquittée, puis persistée localement sous forme de snapshots périodiques et d'un journal des changements.

Cette réplication n'est pas un luxe, c'est ce qui rend le point de contrôle survivable :

```
Scénario : le master élu meurt

Avant la mort :
  • toute mutation a été committée via Paxos (quorum 3/5)
  • les 5 réplicas ont un état à jour

Après la mort :
  1. élection Paxos d'un nouveau leader     ~10 s
  2. le nouveau master relit l'état du store Paxos
  3. il se resynchronise avec les Borglets
  4. indisponibilité totale                 10 à 60 s
  5. tâches en cours d'exécution : ELLES CONTINUENT
```

Le point cinq est le plus important, et le moins intuitif. **Une panne du BorgMaster n'est pas une panne des tâches.** Pendant que le control plane est aveugle et muet pendant une minute, Gmail continue de servir des emails, parce que les process tournent sur leurs machines sous la garde de leur Borglet local, totalement indépendant du master. Le BorgMaster gère le *changement* d'état ; il n'est pas dans le chemin d'exécution des tâches. Le prix à payer : pendant la bascule, aucune nouvelle décision de placement ni de réparation ne se prend. On accepte une fenêtre de « pas de pilote » en échange d'un control plane simple à raisonner et robuste.

### Le Borglet : le contremaître de chaque machine

Sur **chaque** machine de la cellule tourne un **Borglet**, l'agent local. C'est l'ouvrier qui exécute concrètement ce que le master décide. Quand une tâche lui est assignée, le Borglet télécharge le binaire depuis un serveur de packages, crée un **conteneur Linux** (via *cgroups* pour le plafonnement des ressources et *namespaces* pour l'isolation, réseau compris), y installe le package, lance le process, puis met en place la surveillance de santé.

Ensuite, en boucle, toutes les quelques secondes, il **rapporte son état complet** au BorgMaster : usage CPU et mémoire de la machine, état de chaque tâche qu'elle héberge. Détail d'ingénierie qui compte à cette échelle : le Borglet envoie l'état complet aux réplicas, mais ceux-ci ne transmettent au master que les **diffs** — sinon la bande passante de contrôle exploserait avec 10 000 agents bavards.

Le Borglet ne se contente pas de rapporter ; il prend des décisions locales, et c'est ici que votre instinct bas-niveau va parler. Quand une machine est en surcharge, sa réaction dépend de la **nature de la ressource épuisée** :

```python
def handle_resource_overload(self):
    if out_of_compressible_resource():      # CPU
        # ressource COMPRESSIBLE → on étrangle, on ne tue pas
        for task in low_priority_tasks:
            task.throttle_cpu()

    elif out_of_noncompressible_resource(): # Mémoire
        # ressource NON compressible → on n'a pas le choix, on tue
        for task in sorted(all_tasks, key=lambda t: t.priority):
            task.kill()
            if resources_sufficient():
                break
```

Le **CPU est compressible** : on peut réduire la part d'une tâche sans la tuer. Elle ralentit — sa latence monte, son débit baisse — mais elle survit. Face à un manque de CPU, le Borglet **étrangle** (*throttle*) les tâches tolérantes à la latence. La **mémoire est non compressible** : on ne peut pas « réduire » les octets alloués à un process vivant. Face à une pression mémoire (le classique OOM), il n'y a pas d'alternative élégante : le Borglet **tue** des tâches, en commençant par les moins prioritaires, jusqu'à ce que la machine respire. Cette asymétrie compressible/non-compressible traverse tout Borg ; gardez-la en tête, elle réapparaîtra sur les priorités et l'isolation.

Enfin, le Borglet fait la **surveillance de santé** : chaque tâche expose un endpoint HTTP `/healthz`, que le Borglet interroge périodiquement. Trois échecs consécutifs, et la tâche est déclarée malade et redémarrée. C'est l'auto-guérison de base — celle que chaque équipe réécrivait avant Borg, désormais offerte par la plateforme.

### Le Scheduler : décider où poser chaque tâche

Le placement des tâches est confié à un **scheduler**, un process **séparé** du master. Séparé, parce que le calcul de placement est coûteux et qu'on ne veut pas qu'il bloque le traitement des RPC. Détail important : le scheduler travaille sur une **copie potentiellement un peu périmée** de l'état de la cellule. On accepte cette légère obsolescence en échange de débit ; les rares conflits (deux décisions basées sur une vue dépassée) sont rattrapés à l'assignation.

Le scheduler procède en **deux phases**, et comprendre *pourquoi* deux phases éclaire tout son design. Imaginez qu'on veuille noter finement les 10 000 machines pour chacune des centaines de milliers de tâches placées chaque jour : le produit est astronomique, impossible à calculer. Mais choisir un sous-ensemble aléatoire risquerait de manquer la meilleure machine. La solution de Borg : **filtrer d'abord (pas cher), noter ensuite (plus riche) sur le petit sous-ensemble survivant.**

**Phase 1 — Feasibility (faisabilité).** *« Quelles machines peuvent, en principe, accueillir cette tâche ? »* Ce sont des tests bon marché, en O(1) : reste-t-il assez de CPU, de mémoire, de disque ? Les contraintes dures sont-elles respectées (datacenter imposé, présence d'un SSD…) ? Selon la complexité des contraintes, il reste ensuite de 10 % à 100 % des machines.

**Phase 2 — Scoring (notation).** *« Parmi les machines faisables, laquelle est la meilleure ? »* Ici on peut se permettre un calcul plus riche, puisqu'il ne s'applique qu'au sous-ensemble faisable, souvent bien plus petit que 10 000. Le score combine plusieurs objectifs parfois contradictoires (on y revient en détail avec le bin-packing) : minimiser les ressources gâchées, répartir sur plusieurs domaines de panne (racks, alimentations), honorer les préférences de localité des données, éviter les points chauds.

```python
def schedule_task(self, task):
    # PHASE 1 — faisabilité : filtre bon marché
    feasible = [m for m in self.cell_state.machines
                if self.is_feasible(m, task)]

    if not feasible:
        # aucune machine libre : la tâche reste PENDING…
        # …sauf si elle est prioritaire, auquel cas on préempte
        if task.priority >= PROD_PRIORITY:
            self.try_preempt_for(task)
        return

    # PHASE 2 — scoring : calcul riche sur le petit sous-ensemble
    best = max(feasible, key=lambda m: self.score(m, task))
    self.assign(task, best)
```

Notez la branche du milieu : si aucune machine n'est faisable et que la tâche est prioritaire, Borg ne renonce pas — il envisage de **préempter** des tâches moins importantes pour faire de la place. Ce mécanisme mérite sa propre section.

---

## Jobs, tâches et allocs : le vocabulaire du déploiement

Trois objets structurent tout ce qui tourne sur Borg.

Une **tâche** (*task*) est l'unité d'exécution : un process dans son conteneur, sur une machine. C'est le grain le plus fin.

Un **job** est un ensemble de **N tâches identiques**. Quand on déclare « 500 exemplaires de gmail-web », on crée un job de 500 tâches, toutes issues de la même spec. C'est l'unité naturelle pour un service répliqué : on demande un nombre d'exemplaires, Borg les maintient. La spec elle-même s'écrit en **BCL** (*Borg Configuration Language*), une variante du langage de configuration maison qui génère des configs protobuf. On y déclare le nombre de tâches, les ressources demandées par tâche, le health check, les contraintes dures (« doit tourner sur us-east ou us-west, avec SSD ») et les préférences douces (« de préférence un CPU Skylake »), le package à exécuter et sa commande.

La soumission d'un job n'est pas automatique : elle passe par un **contrôle d'admission**. Le master vérifie d'abord que le **quota** du propriétaire couvre les ressources demandées. Sinon, rejet immédiat.

```python
def submit_job(self, job_spec):
    # 1. Admission : le quota du propriétaire couvre-t-il la demande ?
    quota = self.get_user_quota(job_spec.owner)
    if not quota.can_accommodate(job_spec.resources):
        raise QuotaExceeded(...)

    # 2. Créer le job et ses N tâches
    job   = Job(job_spec)
    tasks = [Task(job, i) for i in range(job_spec.num_tasks)]

    # 3. Écrire dans le store Paxos (durable)
    self.paxos_store.write(job)

    # 4. Mettre les tâches en file pour le scheduler
    self.scheduler.add_pending(tasks)
    return job.id
```

Le quota est une notion **comptable et administrative**, à ne pas confondre avec la priorité. Le quota, décidé à l'avance, dit combien de ressources une équipe *a le droit* de demander à un certain niveau de priorité ; la priorité, on va le voir, arbitre qui gagne quand les ressources manquent *à l'instant t*. Le quota est un budget négocié ; la priorité est la règle du ring.

Reste le troisième objet, le plus subtil et le plus riche d'avenir : l'**alloc**.

### L'alloc : réserver une place, puis la remplir

Un job est fait de tâches *identiques*. Mais que faire quand on veut coller ensemble des tâches **différentes** — un serveur web et son collecteur de logs, par exemple — sur la **même** machine, pour qu'ils partagent un disque local ? Un job ne sait pas exprimer ça.

L'**alloc** (*allocation*) résout le problème en deux temps. On **réserve d'abord** un bloc de ressources sur une machine choisie, puis on y **place ensuite** une ou plusieurs tâches, éventuellement issues de jobs différents.

```python
alloc = Alloc(machine=chosen_machine,
              resources={"cpu": 3.0, "mem": 6.0})

web_server    = Task(alloc=alloc, cmd="/web-server", cpu=2.5, mem=5.0)
log_collector = Task(alloc=alloc, cmd="/log-col",    cpu=0.5, mem=1.0)

# → les deux tâches sont GARANTIES sur la même machine
# → le collecteur écrit sur le disque local, le serveur y lit : efficace
```

L'alloc garantit la **colocation** : ses tâches vivent ensemble, partagent la localité, et le scheduler le sait (son score accorde d'ailleurs un bonus à placer une tâche sur une machine qui héberge déjà son alloc). Ce patron — réserver un espace partagé, y faire cohabiter un process principal et ses acolytes — est exactement ce que Kubernetes formalisera sous le nom de **Pod**. Retenez le mot « alloc » ; c'est le brouillon du Pod.

---

## Priorités et préemption : mélanger deux mondes pour remplir les machines

On arrive au mécanisme qui, avec l'over-commitment, fait toute la différence d'utilisation. L'idée : mettre sur les **mêmes** machines deux natures de charges profondément opposées, et arbitrer entre elles par la priorité.

### Deux populations, deux contrats

Les charges de Google se rangent en deux grandes familles. Les **services de production**, longue durée, user-facing — Gmail, Search, Maps, YouTube — dont le contrat est la **disponibilité** : ils ne doivent « jamais » tomber, la latence est sacrée. Et les **jobs batch** — MapReduce, indexation, entraînement de modèles — dont le contrat est le **débit** : peu importe qu'une tâche soit tuée et relancée plus tard, ce qui compte c'est le travail total accompli sur la journée.

Ces deux familles ont des besoins contradictoires, et c'est justement ce qui les rend **complémentaires** sur une même machine. Le batch peut occuper les creux laissés par la prod, quitte à céder la place instantanément quand la prod se réveille. Encore faut-il un arbitre.

### Les quatre bandes de priorité

Cet arbitre, c'est la **priorité**, organisée en quatre **bandes** décroissantes :

```
1. MONITORING  (la plus haute)
   → tâches de supervision de Borg lui-même — jamais tuées

2. PRODUCTION
   → Gmail, Search, Maps, YouTube (user-facing)
   → SLA : ne « jamais » tomber
   → ne peuvent PAS se préempter entre elles (anti-cascade)
   → ~70 % de l'allocation CPU

3. BATCH
   → MapReduce, indexation, entraînement ML
   → préemptables par la prod
   → le CPU restant (~30 %)

4. BEST EFFORT / FREE  (la plus basse)
   → tests, expériences
   → uniquement les ressources oisives, premières tuées
   → « gratuit » : ne consomme pas de quota
```

La bande la plus basse mérite un mot : elle est **gratuite** au sens où elle ne coûte pas de quota. Les ingénieurs y lancent leurs expériences, en sachant qu'elles seront les premières sacrifiées. C'est un exutoire pour la capacité qui, sinon, dormirait.

### La préemption en action

Voici le scénario canonique. Un pic de trafic — disons un Black Friday. En temps normal, 500 tâches Gmail (prod) et 300 tâches MapReduce (batch) cohabitent sur 800 machines. Soudain, Gmail réclame 200 tâches de plus.

```
1. le scheduler cherche 200 tâches batch à préempter
2. il tue 200 tâches MapReduce → ressources libérées
3. il démarre 200 tâches Gmail sur ces ressources
4. les tâches MapReduce seront replanifiées plus tard

La mise à mort est POLIE :
   • le Borglet envoie SIGTERM à la tâche MapReduce
   • celle-ci sauvegarde son checkpoint, finit son input courant
   • ~80 % du temps : arrêt gracieux
   • passé un délai : SIGKILL

Résultat : Gmail scale en < 30 s, MapReduce reprend plus tard.
```

Le **SIGTERM avant SIGKILL** n'est pas un détail : il donne au batch une chance de sauvegarder son état, ce qui rend la préemption presque indolore pour lui. C'est possible précisément parce que le batch a été *conçu* pour tolérer d'être tué. La prod, elle, ne le tolérerait pas — d'où le fait qu'on ne préempte jamais de la prod pour de la prod.

### Éviter les cascades de préemption

Ce dernier point cache un piège que votre instinct de concepteur de systèmes va reconnaître. Supposons qu'on autorise n'importe quelle tâche à en préempter une autre de priorité inférieure. Une tâche prod A préempte une batch B ; mais B tenait des ressources dont une autre prod C avait besoin ; C préempte alors D… et l'on déclenche une **cascade** de préemptions qui se propage dans la cellule, chaque victime en engendrant une nouvelle. À l'échelle de la production de Google, c'est un risque d'effondrement.

La parade de Borg est une règle simple et catégorique : **les tâches de production (bandes monitoring et production) ne peuvent pas se préempter entre elles.**

```python
def can_preempt(preemptor, victim):
    # deux tâches prod ne se préemptent jamais → aucune cascade possible
    if preemptor.priority_band == PROD and victim.priority_band == PROD:
        return False
    # sinon, préemption autorisée si priorité strictement supérieure
    return preemptor.priority > victim.priority
```

En interdisant la préemption prod→prod, on **borne** les cascades au monde du batch, où une tâche tuée n'est qu'un léger retard, jamais une panne. La prod, elle, ne cascade jamais. C'est un choix de conception qui sacrifie un peu de flexibilité théorique contre une garantie forte de stabilité — exactement le genre d'arbitrage qui distingue un système de production d'un prototype.

---

## L'over-commitment : le vrai secret des 60-70 %

Priorités et préemption permettent de *mélanger* les charges. Mais le levier qui fait basculer l'utilisation de 40 % à 60-70 % est ailleurs, dans une observation empirique presque gênante de simplicité.

**Les tâches de production demandent environ trois fois plus de ressources qu'elles n'en consomment réellement.** Pourquoi ? Parce que les ingénieurs ajoutent des marges de sécurité « au cas où ». Une tâche Gmail réserve 4 CPU mais n'en utilise que 1,5 en régime courant : un facteur de sur-provisionnement de 2,67.

Le scheduler naïf prend la réservation au pied de la lettre :

```
Naïf — planifie sur les ressources DEMANDÉES
  demande de la tâche : 4 CPU
  machine de 10 CPU   → 2 tâches (4+4)
  usage réel          : 2 × 1,5 = 3 CPU sur 10
  UTILISATION         : 30 %
```

Borg, pour le batch, planifie plutôt sur une **estimation de l'usage réel** :

```
Borg — planifie sur l'usage RÉEL estimé
  demande            : 4 CPU (marge de sécurité)
  usage observé      : 1,5 CPU (historique)
  machine de 10 CPU  → ~6 tâches (10 / 1,5 ≈ 6)
  usage réel         : 6 × 1,5 = 9 CPU sur 10
  UTILISATION        : 90 %
```

En sur-souscrivant délibérément la machine, on la remplit près de sa capacité *réelle* plutôt que de sa capacité *réservée*. C'est de la sur-allocation contrôlée, cousine directe du memory overcommit d'un noyau qui accorde plus de pages virtuelles qu'il n'a de RAM physique, en pariant que tout le monde ne s'en servira pas en même temps.

### Estimer sans faire tomber la production

Le pari n'est évidemment tenable que si l'estimation est prudente là où l'enjeu est grave. D'où une politique à deux vitesses, encore une fois indexée sur prod vs batch :

```python
def estimate_task_resources(self, task):
    # PROD : on reste conservateur, on prend la réservation
    if task.priority >= PROD_PRIORITY:
        return task.requested

    # NON-PROD : estimation glissante sur l'historique récent
    history   = self.usage_history[task.job_name]
    estimated = percentile(history, 95) * 1.1     # p95 + 10 % de marge
    return min(task.requested, max(estimated, task.actual_usage))
```

Pour la prod, on ne joue pas : on réserve la demande complète. Pour le batch, on estime à partir du **95e percentile** de l'usage récent, plus une petite marge. Que se passe-t-il si l'estimation est prise en défaut, si une tâche batch dépasse et provoque un OOM ? Elle est tuée et relancée. **C'est acceptable pour du batch, ce ne le serait pas pour de la prod** — et c'est tout l'art de Borg d'avoir su où placer la frontière du risque.

### La reclamation : rendre l'oisiveté de la prod au batch

Un corollaire élégant complète le tableau. Une tâche prod qui réserve 4 CPU mais n'en utilise que 1,2 à un instant donné laisse 2,8 CPU **réclamables**. Borg les prête au batch — à condition que celui-ci accepte de les **rendre instantanément** quand la prod se réveille.

```python
reclaimable = prod_task.requested_cpu - prod_task.actual_cpu   # 4.0 - 1.2 = 2.8
# prêté au batch, mais reprenable à tout instant (faible latence exigée)
```

Le résultat est une forme de troc temporel : on paie la **capacité de pic** de la prod (indispensable), mais on **partage son oisiveté** avec le batch le reste du temps. Du calcul batch quasi gratuit pendant les heures creuses de la prod.

### La complémentarité des profils

Dernier ingrédient, plus discret : les tâches ont des **profils de ressources différents**, et Borg les fait se compléter. Gmail est gourmand en CPU, modéré en mémoire ; BigTable, l'inverse ; MapReduce consomme le CPU par rafales, avec peu de mémoire. Empilées naïvement selon une seule dimension, elles laissent l'autre dimension vide. Empilées intelligemment, elles se complètent :

```
Machine (16 CPU, 64 Go)
  Gmail      :  4 CPU,  4 Go   (CPU-lourd)
  BigTable   :  2 CPU, 20 Go   (mémoire-lourde)
  MapReduce  :  8 CPU,  8 Go   (rafales CPU)
  ─────────────────────────────
  Total      : 14 CPU, 32 Go   → 87 % CPU, 50 % mémoire
```

Ranger côte à côte un gros consommateur de CPU et un gros consommateur de mémoire remplit *les deux* dimensions. C'est ce que le scheduler cherche en notant simultanément CPU **et** mémoire — et c'est là que le bin-packing devient délicat.

---

## Le bin-packing : ranger dans plusieurs dimensions à la fois

Placer des tâches sur des machines, c'est un problème de **rangement** (*bin-packing*) : caser des objets de tailles variées dans des boîtes de capacité fixe, en utilisant le moins de boîtes possible. Sauf qu'ici chaque objet a **plusieurs dimensions** (CPU, mémoire, disque), ce qui change tout.

Deux stratégies opposées s'affrontent. Le **best-fit** (« bin-packing » au sens strict) tasse les tâches pour remplir chaque machine à ras bord : peu de machines utilisées, grande compacité — mais aucune marge pour absorber un pic, et une fragmentation possible. Le **worst-fit** (l'algorithme *E-PVM* de Borg) fait l'inverse : il **étale** la charge, laissant partout de la marge pour les pointes — mais gaspille des ressources en petits trous éparpillés.

Google a essayé les deux extrêmes et constaté que chacun échoue à sa manière : le bin-packing pur fragmente, l'étalement pur gâche. La solution retenue est **hybride** :

```python
def score(self, machine, task):
    spread_score = self.compute_e_pvm_score(machine, task)   # étaler
    pack_score   = self.compute_bin_pack_score(machine, task) # tasser

    # équilibre entre tasser et étaler
    score = 0.6 * pack_score + 0.4 * spread_score

    # bonus : même machine que les autres tâches de l'alloc
    if task.alloc and machine.runs_alloc(task.alloc):
        score += ALLOC_COLOCATION_BONUS
    # bonus : localité des données (jobs batch)
    if task.has_preferred_location(machine):
        score += LOCALITY_BONUS
    return score
```

Le curseur (ici 60 % tasser / 40 % étaler) mélange les deux objectifs et y ajoute les bonus de colocation d'alloc et de localité de données. Il n'existe pas de réglage universellement optimal — c'est un compromis, ajusté empiriquement.

### Un exemple qui pique : la contrainte cachée

Un cas concret vaut mille théories. Prenons trois machines (10 CPU, 32 Go chacune) et un lot de tâches : 4 tâches A (3 CPU, 8 Go), 6 tâches B (2 CPU, 4 Go), 2 tâches C (1 CPU, **16 Go**). Tiennent-elles sur 3 machines ?

Le calcul agrégé rassure : il faut 26 CPU et 88 Go au total ; trois machines offrent 30 CPU et 96 Go. Les deux sommes passent. Et pourtant, **c'est impossible.**

Le coupable est la tâche C et ses 16 Go. Après avoir bien tassé A et B, chaque machine ne laisse que ~8 Go de libre — moitié moins que ce qu'exige une seule tâche C. Les deux tâches C, qui pèsent peu en CPU mais énormément en mémoire, ne trouvent **aucune** machine capable de les loger. Il faut une quatrième machine, alors que le total des ressources semblait tenir sur trois.

La leçon est fondamentale : **avec plusieurs dimensions de ressources, la somme ne suffit jamais à conclure.** Une seule dimension peut être « contraignante » (ici la mémoire) et faire capoter un placement que les totaux déclaraient possible. C'est pour cette raison exacte que le scoring de Borg considère CPU et mémoire *simultanément*, et non l'une après l'autre.

### Mesurer la qualité : la compaction de cellule

Comment sait-on qu'un scheduler range bien ? Google utilise une métrique nommée **compaction de cellule** : *combien de machines faut-il, au minimum, pour faire tenir toutes les charges actuelles ?* On le calcule par recherche dichotomique — peut-on tout caser dans X machines ? — jusqu'à trouver le plancher.

```python
def measure_cell_compaction(cell_jobs):
    lo, hi = 0, cell.num_machines
    while lo < hi:                      # recherche dichotomique
        mid = (lo + hi) // 2
        if can_fit_all_jobs(cell_jobs, num_machines=mid):
            hi = mid
        else:
            lo = mid + 1
    return lo                            # nb minimal de machines nécessaires
```

Le verdict mesuré chez Google est éloquent : un scheduler standard exige environ **80 %** des machines ; Borg avec over-commitment tombe à **60 %**. Ces 20 points, c'est 20 % de machines en moins pour la même charge — et à l'échelle des datacenters de Google, des milliards de dollars. C'est le chiffre qui justifie à lui seul toute cette complexité : les 20 à 30 % de CPU récupérés sur un parc valant plusieurs milliards se comptent en **centaines de millions de dollars économisés**.

---

## La filiation vers Kubernetes : ce qui a été gardé, ce qui a changé

Borg a fait tourner toute la production de Google de 2004 à 2014. Puis, en 2014, Google a annoncé **Kubernetes** : un système open-source, inspiré de Borg, mais réécrit à la lumière de dix ans de leçons. Le papier Borg est publié en 2015 (EuroSys), Kubernetes 1.0 sort en 2016 avec la fondation de la CNCF, et le reste est de l'histoire moderne.

La correspondance des concepts est presque un dictionnaire :

| Borg | Kubernetes |
|------|------------|
| Cellule | Cluster |
| BorgMaster | Control Plane (API Server + etcd) |
| Borglet | kubelet |
| Alloc | **Pod** |
| Job (N tâches identiques) | Deployment, StatefulSet, DaemonSet, Job |
| BCL | manifestes YAML |
| BNS + Chubby | DNS + Services (CoreDNS) |
| Contraintes dures/douces | nodeSelector / affinity |

Mais la vraie histoire est dans les **corrections**. Kubernetes n'a pas copié Borg ; il a réparé quatre points de douleur identifiés après dix ans d'usage.

**Premièrement, le Pod formalise l'alloc.** Borg avait bricolé l'alloc pour coloc­aliser des tâches hétérogènes ; Kubernetes en fait son unité de déploiement de premier rang. Un Pod, c'est une alloc rendue explicite : plusieurs conteneurs partageant réseau et volumes, garantis sur la même machine.

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: web-server        # conteneur principal (≈ tâche principale Borg)
      image: nginx:1.21
      resources:
        requests: {cpu: "500m", memory: "512Mi"}
    - name: log-shipper       # sidecar (≈ tâche secondaire de l'alloc)
      image: fluentd:v1.14
      volumeMounts:
        - {mountPath: /var/log, name: shared-logs}
  volumes:
    - name: shared-logs
      emptyDir: {}            # partagé entre les deux conteneurs
```

**Deuxièmement, le job unique était trop rigide.** Chez Borg, tout est « N tâches identiques » ; pour une application avec un front web, une base et un cache, il fallait empiler plusieurs jobs, ce qui devenait vite brouillon. Kubernetes éclate cette unité en **contrôleurs spécialisés** : `Deployment` pour les services sans état (l'équivalent direct du job Borg), `StatefulSet` pour les bases à identité stable, `DaemonSet` pour « un pod par nœud » (le collecteur de logs de tout à l'heure), `Job` pour le batch. À chaque patron son contrôleur.

**Troisièmement, une IP par machine était douloureux.** Chez Borg, une machine a une seule IP, et toutes ses tâches se partagent des **ports** distincts — d'où des conflits de ports, un débogage pénible (« quelle tâche sur le 8080 ? »), et des load balancers qui doivent jongler avec des paires IP:port. Kubernetes donne **une IP par Pod** : plus de conflits, un modèle réseau propre, le routage délégué à iptables ou eBPF.

**Quatrièmement, un BorgMaster omniscient est ingérable.** Le master connaissait chaque détail de chaque job ; il grossissait sans fin et devenait impossible à étendre. Kubernetes découpe : un **API Server minimal** (du CRUD sur des objets, adossé à etcd) et une nuée de **contrôleurs** séparés qui *observent* les changements et *réconcilient*. Cette architecture ouvre l'extensibilité par **CRD** (*Custom Resource Definitions*) — on ajoute ses propres types d'objets et ses propres contrôleurs sans toucher au cœur.

### La boucle de réconciliation, héritée telle quelle

Ce dernier point boucle avec le modèle mental du début. Le fameux **controller pattern** de Kubernetes — *observe, compare à l'état désiré, réconcilie, recommence* — n'est rien d'autre que la boucle de Borg, généralisée et rendue pluggable. Le scheduler de Kubernetes conserve d'ailleurs fidèlement les deux phases de Borg, rebaptisées : le **filtering** (les *predicates* : `PodFitsResources`, `MatchNodeSelector`, `TaintToleration`…) est la feasibility ; le **scoring** (les plugins : `least_requested`, `balanced_allocation`, `node_affinity`, `image_locality`…) est le scoring. La grande différence est l'**extensibilité** : là où Borg avait un scheduler monolithique, Kubernetes offre un framework à plugins, des schedulers multiples (GPU, FPGA), et des contraintes de topologie explicites pour étaler à travers zones et racks.

L'isolation, enfin, hérite des mêmes limites — et il faut les connaître. Les cgroups isolent bien le CPU (compressible : on étrangle via le *Completely Fair Scheduler*) et plafonnent la mémoire (non compressible : dépassement soutenu = OOM kill, `requests` pour planifier et `limits` comme plafond dur). Mais certaines ressources partagées **échappent à toute isolation matérielle** : le cache de dernier niveau (LLC), la bande passante mémoire, la bande passante réseau. Une tâche qui *thrashe* le LLC dégrade ses voisines sans qu'aucune barrière logicielle n'y puisse rien — un « noisy neighbor » que votre passé Intel reconnaîtra immédiatement. Les seules parades sont d'évitement : ne pas colocaliser une tâche sensible à la latence avec une pollueuse de cache, dédier des nœuds via *taints*/labels, épingler les CPU (*cpuset*), planifier en tenant compte du NUMA. Borg comme Kubernetes **acceptent explicitement** cette isolation imparfaite comme le prix du partage.

---

## À retenir

1. **Un pool partagé bat des serveurs dédiés.** En mutualisant ~10 000 machines par cellule, Borg fait passer l'utilisation de 40 % à 60-70 %. Les creux des uns financent les pics des autres — impossible tant que les flottes restent cloisonnées par équipe.

2. **Déclaratif plutôt qu'impératif.** On déclare *quoi* (« 500 tâches de Gmail »), jamais *où*. Le système boucle en permanence pour réconcilier la réalité avec l'état désiré. C'est ce qui rend l'auto-guérison, la replanification et les rolling updates automatiques.

3. **Séparer allocation et usage.** Les tâches prod réservent ~3× ce qu'elles consomment. Sur-souscrire les machines pour le batch, sur l'usage réel estimé (p95 + marge), double l'utilisation — au prix de quelques redémarrages, tolérables pour du batch, jamais pour de la prod.

4. **Priorité + préemption = simplicité.** Un seul pool arbitré par quatre bandes de priorité remplace un enchevêtrement de quotas par équipe. La prod préempte le batch avec un SIGTERM courtois avant le SIGKILL ; la prod ne se préempte jamais elle-même, pour borner les cascades.

5. **Deux natures de charges, deux politiques.** Services longue durée : disponibilité d'abord, on ne tue pas. Jobs batch : débit d'abord, on tue et on relance sans état d'âme. Même scheduler, contrats opposés — et c'est leur opposition qui les rend complémentaires sur une même machine.

6. **Scheduling en deux phases.** Filtrer (feasibility, O(1)) avant de noter (scoring, riche) rend tractable le placement de centaines de milliers de tâches sur des milliers de machines. Le score équilibre tasser et étaler, car les deux extrêmes échouent.

7. **Kubernetes est Borg corrigé.** Pod = alloc formalisée ; contrôleurs spécialisés au lieu d'un job unique ; une IP par Pod au lieu d'une par machine ; API Server + contrôleurs extensibles (CRD) au lieu d'un master monolithique. La boucle de réconciliation, elle, est reprise à l'identique.

---

## Pour aller plus loin

- **Le papier fondateur** : Verma et al., *« Large-scale cluster management at Google with Borg »*, EuroSys 2015. La source primaire, lisible, avec les vrais chiffres de la trace 2011.
- **La trace publique** : Google a publié une trace d'une cellule de ~12 500 machines sur un mois. Idéale pour rejouer soi-même des scénarios de scheduling et d'over-commitment.
- **Omega**, le successeur expérimental de Borg (scheduling à état partagé et transactions optimistes), qui a nourri le design de Kubernetes — Schwarzkopf et al., EuroSys 2013.
- **Côté Kubernetes** : la documentation du *kube-scheduler* (predicates/priorities devenus le *scheduling framework*) et du *controller pattern* montre concrètement la filiation. Comparer la spec d'un Pod avec l'alloc de ce chapitre est l'exercice le plus instructif.
- **Le retour d'expérience** : Burns et al., *« Borg, Omega, and Kubernetes »*, ACM Queue 2016 — les mêmes auteurs racontent, avec le recul, ce qu'ils garderaient et ce qu'ils referaient autrement.
