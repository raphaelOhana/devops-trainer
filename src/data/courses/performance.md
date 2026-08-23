===LESSON===
KEY: performance
TOPIC: performance
TITLE: Optimisation
ICON: ⚡
INTRO: La performance n'est pas une intuition ni un art mystérieux : c'est une discipline expérimentale où l'on mesure un système réel, où l'on comprend le matériel sous le code, et où l'on refuse d'optimiser quoi que ce soit avant d'avoir prouvé, chiffres en main, que ça compte.
---SECTION---
HEADING: Le piège de l'optimisation prématurée
BODY:
Tout le monde cite Donald Knuth — « l'optimisation prématurée est la racine de tous les maux » — mais presque personne ne cite la phrase complète, et elle change tout :

> « We should forget about small efficiencies, say about 97% of the time: **premature optimization is the root of all evil**. Yet we should not pass up our opportunities in that critical 3%. »

Le message n'est pas « n'optimisez jamais ». Il est : **la plupart du code n'a aucune importance pour la performance**, et gaspiller de l'effort dessus coûte cher en lisibilité, en bugs et en temps, pour un gain nul. Le vrai travail consiste à identifier ce fameux 3% critique — ce qui exige une mesure, pas une devinette.

### Pourquoi le coût est réel

Optimiser prématurément n'est pas juste « inutile », c'est activement nuisible :

- **Complexité** : un code « rapide » tordu (déroulage de boucle manuel, caches maison, bit-twiddling) est plus dur à lire, à modifier et à déboguer.
- **Bugs** : chaque astuce est une occasion de se tromper. Un cache mal invalidé donne des résultats faux, pas juste lents.
- **Coût d'opportunité** : le temps passé à micro-optimiser une fonction appelée 3 fois par jour est du temps non passé sur le hot path réel.

### La bonne posture

D'abord **écrire du code correct et clair**. Ensuite, **si et seulement si** un besoin de performance se manifeste (SLA raté, coût cloud, latence perçue), mesurer pour localiser le goulot d'étranglement, puis optimiser ce point précis. Bentley, dans *Programming Pearls*, insiste : le plus gros gain vient souvent d'un changement d'algorithme ou de structure de données au bon endroit, pas d'un saupoudrage d'astuces partout.
---SECTION---
HEADING: Mesurer avant d'optimiser
BODY:
La règle d'or de toute la performance tient en une phrase : **on n'optimise jamais ce qu'on n'a pas mesuré**. L'intuition humaine sur « où le temps est passé » est notoirement mauvaise — même les experts se trompent régulièrement de plusieurs ordres de grandeur.

### Le raisonnement

Un programme passe typiquement l'essentiel de son temps dans une fraction minuscule de son code (loi empirique proche du 80/20, souvent bien plus déséquilibrée). Sans mesure, vous allez :

- optimiser une fonction qui représente 2% du temps total (gain maximal théorique : 2%) ;
- ignorer la vraie coupable parce qu'elle « a l'air simple ».

La **loi d'Amdahl** formalise le plafond : si une portion `p` du temps d'exécution est accélérée d'un facteur `s`, l'accélération globale est

```
speedup_global = 1 / ((1 - p) + p/s)
```

Si `p = 0.05` (la fonction ne pèse que 5% du temps), même en la rendant **infiniment rapide** (`s → ∞`), le gain global plafonne à `1/0.95 ≈ 1.05`, soit 5%. À l'inverse, accélérer d'un facteur 2 une portion qui pèse 90% donne `1/(0.1 + 0.45) ≈ 1.82`. La leçon : **cherchez d'abord le gros `p`.**

### Le workflow minimal

1. Reproduire le problème avec une charge représentative.
2. Profiler pour trouver le hot path.
3. Formuler une hypothèse (« c'est l'allocation dans cette boucle »).
4. Modifier une seule chose.
5. Re-mesurer et comparer. Garder si gain, jeter sinon.

Ce cycle est scientifique : hypothèse, expérience, contrôle. Sans l'étape 5, vous accumulez des « optimisations » dont vous ne savez même pas si elles aident.
---SECTION---
HEADING: Complexité algorithmique appliquée
BODY:
Avant toute micro-optimisation, la question qui rapporte le plus est : **mon algorithme est-il dans la bonne classe de complexité ?** Passer de O(n²) à O(n log n) bat n'importe quelle astuce de bas niveau dès que `n` grandit.

### Pourquoi ça domine tout le reste

Les constantes cachées derrière le O() sont réelles, mais la croissance asymptotique finit toujours par gagner. Prenons `n = 1 000 000` :

- O(n²) = 10¹² opérations → des minutes voire des heures.
- O(n log n) ≈ 2×10⁷ opérations → quelques millisecondes.

Aucun réglage de cache, aucun SIMD ne comblera cet écart de 50 000×. C'est pourquoi Bentley ouvre *Programming Pearls* sur un cas réel où remplacer un algorithme par un autre transforme un traitement de plusieurs jours en quelques secondes.

### Mais attention aux constantes pour les petits n

L'asymptotique ne dit rien sur les petites tailles. Pour `n` petit (disons < 32), un tri par insertion O(n²) bat souvent un quicksort O(n log n) parce que ses constantes sont minuscules et qu'il est cache-friendly. C'est exactement pourquoi les vraies implémentations (introsort) basculent sur insertion sort en dessous d'un seuil.

### Le piège du « c'est juste une boucle »

```python
# O(n²) caché : `in` sur une liste est O(n)
vus = []
for x in flux:
    if x not in vus:      # scan linéaire à chaque itération
        vus.append(x)

# O(n) : un set a un test d'appartenance O(1) amorti
vus = set()
for x in flux:
    vus.add(x)
```

Le premier code peut être 1000× plus lent sans qu'aucun profileur ne pointe une ligne « évidemment coûteuse » : le coût est diffus. **Connaître la complexité de vos structures de données** (liste vs set vs dict) est la première optimisation, et souvent la seule nécessaire.
---SECTION---
HEADING: Profiling : échantillonnage vs instrumentation
BODY:
Un profileur répond à « où va le temps ? ». Il existe deux grandes familles, et confondre leurs biais mène à des conclusions fausses.

### Profiling par instrumentation

On insère du code de mesure à l'entrée/sortie de chaque fonction (ou le profileur le fait pour vous, comme `cProfile` en Python). On obtient un **compte exact** des appels et un temps par fonction.

- **Avantages** : exact, déterministe, donne le nombre d'appels (crucial : une fonction appelée 10 millions de fois est un signal fort).
- **Inconvénients** : **overhead énorme** (souvent 2× à 10×), qui *déforme* le profil. Les petites fonctions appelées souvent voient leur coût gonflé par la mesure elle-même. Peut rendre inexploitable un code très granulaire.

### Profiling par échantillonnage

Le profileur interrompt le programme à intervalle régulier (ex. 1000 fois/seconde) et note la pile d'appels courante. Sur beaucoup d'échantillons, la fraction d'échantillons où une fonction apparaît approxime la fraction de temps qu'elle consomme.

- **Avantages** : **overhead faible et réglable**, utilisable en production, ne déforme pas le comportement (pas d'effet observateur). C'est l'approche de Brendan Gregg pour les systèmes réels (`perf`, profileurs de pile).
- **Inconvénients** : statistique (les fonctions très rares peuvent être manquées), ne donne pas de compte d'appels exact.

### Quand utiliser quoi

Pour un **microbenchmark ciblé** ou comprendre un chemin précis avec comptes d'appels : instrumentation. Pour **comprendre un système réel sous charge** sans le perturber : échantillonnage. Gregg va plus loin avec les **flame graphs**, une visualisation où la largeur de chaque barre = temps passé, empilée par profondeur de pile : on lit d'un coup d'œil le hot path.
---SECTION---
HEADING: Latency numbers every programmer should know
BODY:
Jeff Dean a popularisé une table d'ordres de grandeur que tout ingénieur devrait avoir en tête. Elle ne sert pas à réciter des nanosecondes, mais à **raisonner sur les bons ordres de grandeur** avant même d'écrire du code.

### La table (ordres de grandeur, ~2020)

| Opération | Latence approx. | Échelle humaine (×10⁹) |
|---|---|---|
| Référence cache L1 | ~1 ns | 1 s |
| Mauvaise prédiction de branche | ~3 ns | 3 s |
| Référence cache L2 | ~4 ns | 4 s |
| Mutex lock/unlock | ~17 ns | 17 s |
| Accès mémoire principale (RAM) | ~100 ns | 1,7 min |
| Compression 1 Ko (Zippy/Snappy) | ~2 µs | 33 min |
| Envoi 1 Ko sur réseau 1 Gbps | ~10 µs | 2,8 h |
| Lecture 1 Mo séquentiel en RAM | ~250 µs | 2,9 jours |
| Aller-retour dans un datacenter | ~500 µs | 5,8 jours |
| Lecture 1 Mo séquentiel sur SSD | ~1 ms | 11,6 jours |
| Seek disque dur | ~10 ms | 116 jours |
| Lecture 1 Mo sur disque dur | ~20 ms | 231 jours |
| Aller-retour réseau Californie↔Pays-Bas | ~150 ms | 4,8 ans |

### Ce qu'il faut en retirer

- **La RAM est ~100× plus lente que L1.** Un cache miss n'est pas gratuit ; c'est pour ça que la localité des données (section suivante) domine souvent.
- **Le réseau et le disque sont d'un autre monde.** Un aller-retour datacenter (500 µs) vaut ~5000 accès RAM. Un seek disque (10 ms) vaut ~100 000 accès RAM.
- **Séquentiel ≫ aléatoire.** Lire 1 Mo séquentiel en RAM (250 µs) est bien plus rapide que 1 Mo d'accès dispersés, car le préchargeur et les caches travaillent pour vous.

La colonne « échelle humaine » (multipliée par un milliard) transforme ces abstractions en intuitions : si L1 prend 1 seconde, aller chercher une donnée sur le disque dur prend **4 mois**. On ne conçoit pas la même architecture selon qu'une opération est « instantanée » ou « prend un trimestre ».
---SECTION---
HEADING: Données cache-friendly : localité, AoS vs SoA
BODY:
Sur le matériel moderne, **le processeur attend la mémoire** bien plus souvent qu'il ne calcule. Rendre les données « cache-friendly » est fréquemment le gain n°1, bien avant d'optimiser les instructions.

### Comment marche le cache

La mémoire est chargée par **lignes de cache** (typiquement 64 octets), pas octet par octet. Deux principes de localité en découlent :

- **Localité spatiale** : accéder à `a[i]` charge aussi `a[i+1]`, `a[i+2]`… gratuitement. Parcourir un tableau en ordre est idéal.
- **Localité temporelle** : une donnée récemment utilisée est probablement encore en cache.

### AoS vs SoA

Le choix de disposition mémoire est décisif. Comparez :

```c
// Array of Structs (AoS) : chaque particule est contiguë
struct Particule { float x, y, z; float vx, vy, vz; float masse; };
struct Particule particules[N];

// Structure of Arrays (SoA) : chaque champ dans son propre tableau
struct Particules {
    float x[N], y[N], z[N];
    float vx[N], vy[N], vz[N];
    float masse[N];
};
```

Si votre boucle ne lit **que** `x` (par exemple pour calculer une bounding box), l'AoS gaspille : chaque ligne de cache de 64 octets chargée contient `x` mais aussi `y, z, vx…` inutiles — vous n'utilisez que 4 octets sur 64. En **SoA**, `x[0..15]` tient dans une seule ligne de cache : 100% utile, et le pattern devient parfait pour la vectorisation (SIMD). À l'inverse, si vous traitez **toutes** les propriétés d'une particule à la fois, l'AoS est meilleur. **La bonne disposition dépend du pattern d'accès dominant.**

### Pointer chasing

Suivre une liste chaînée ou un arbre où chaque nœud est alloué séparément provoque un **cache miss par nœud** : les nœuds sont éparpillés en mémoire, aucune localité spatiale. C'est pourquoi un `std::vector` (contigu) écrase souvent une `std::list` en pratique, même quand la théorie donne la même complexité. Quand la performance compte, **préférez les structures contiguës**.
---SECTION---
HEADING: Prédiction de branchement
BODY:
Les CPU modernes sont **pipelinés** : ils commencent à exécuter les instructions suivantes avant d'avoir fini les précédentes. À chaque `if`, le processeur doit **parier** sur l'issue (pris/non pris) pour ne pas stopper le pipeline. S'il se trompe, il doit vider le pipeline et recommencer : c'est la **misprediction penalty** (~10-20 cycles, voir la table de latence).

### Pourquoi trier peut accélérer

L'exemple canonique : sommer les éléments d'un tableau supérieurs à un seuil.

```c
for (int i = 0; i < N; i++)
    if (data[i] >= 128)   // branche imprévisible si data aléatoire
        somme += data[i];
```

Sur des données **aléatoires**, le prédicteur a 50% de raison, donc ~50% de mispredictions : lent. Sur les **mêmes données triées**, la branche est d'abord toujours « non prise » puis toujours « prise » : le prédicteur apprend le pattern, quasi 0 misprediction. Le code identique tourne plusieurs fois plus vite sur des données triées — un résultat contre-intuitif célèbre.

### Comment aider le prédicteur

- **Rendre les branches prévisibles** : trier, regrouper les cas semblables.
- **Éliminer la branche** (branchless) : remplacer `if` par de l'arithmétique ou des instructions conditionnelles.

```c
// Branchless : pas de saut, donc rien à mal prédire
int mask = -(data[i] >= 128);   // 0xFFFFFFFF si vrai, 0 sinon
somme += data[i] & mask;
```

Mais **mesurez** : les compilateurs génèrent parfois déjà du code sans branche (cmov), et une branche bien prédite est gratuite. Le branchless n'aide que si la branche était réellement imprévisible.
---SECTION---
HEADING: False sharing
BODY:
Voici un bug de performance sournois en programmation concurrente : deux threads qui ne partagent **aucune** donnée logique se ralentissent quand même mutuellement. La cause est le **false sharing** (faux partage).

### Le mécanisme

La cohérence de cache travaille à la granularité de la **ligne de cache** (64 octets), pas de la variable. Si le compteur du thread A et le compteur du thread B tombent dans la **même ligne de cache**, alors chaque écriture de A **invalide** la copie de cette ligne dans le cache de B, et vice-versa. Les cœurs se renvoient la ligne en permanence (« ping-pong » via le protocole de cohérence), alors qu'ils ne touchent jamais réellement la même variable.

```c
// PROBLÈME : compteurs adjacents, même ligne de cache
struct { long a; long b; } compteurs;  // a et b à 8 octets d'écart
// thread 1 fait compteurs.a++, thread 2 fait compteurs.b++  → ping-pong

// SOLUTION : padding pour placer chaque compteur sur sa propre ligne
struct {
    long a;
    char pad[56];   // 8 + 56 = 64 octets
    long b;
} compteurs;        // a et b désormais sur des lignes différentes
```

### Comment le repérer et l'éviter

- **Symptôme** : un code parallèle qui **ralentit** en ajoutant des threads, sans contention de verrou visible. Les profileurs système (Gregg : compteurs matériels via `perf`) montrent un taux élevé de cache misses/invalidations.
- **Remèdes** : padding/alignement (`alignas(64)` en C++), donner à chaque thread ses propres variables locales et n'agréger qu'à la fin, éviter les tableaux `resultats[thread_id]` densément packés.
---SECTION---
HEADING: Amortissement et coût amorti
BODY:
Certaines opérations sont parfois chères, mais rarement. L'**analyse amortie** répond à : « quel est le coût *moyen* par opération sur une longue séquence ? » — et elle justifie des structures de données qui seraient effrayantes vues au pire cas isolé.

### L'exemple du tableau dynamique

Un `std::vector` / `ArrayList` / liste Python double sa capacité quand il est plein. Ajouter un élément (`push_back`) est :

- **généralement O(1)** : il reste de la place, on écrit et c'est fini ;
- **occasionnellement O(n)** : plein → on alloue un tableau 2× plus grand et on **recopie tout**.

Naïvement, on pourrait croire que `push_back` est O(n). Mais sur `n` insertions, le coût **total** des recopies est `1 + 2 + 4 + ... + n < 2n`, soit O(n) au total, donc **O(1) amorti par insertion**. C'est pourquoi doubler (facteur géométrique) est correct, alors qu'agrandir d'une taille fixe (+10 à chaque fois) donnerait un coût amorti O(n) catastrophique.

### Pourquoi ça guide vos choix

- **Ne jugez pas une structure sur son pire cas isolé** : un pire cas rare noyé dans des cas rapides peut être excellent en moyenne.
- **Réservez à l'avance quand vous connaissez la taille** : `vector.reserve(n)` élimine toutes les réallocations — une optimisation gratuite quand la taille finale est prévisible.
- **Méfiez-vous de la latence tail** : le coût amorti est bon *en moyenne*, mais l'insertion qui déclenche la recopie a une latence O(n) réelle. Pour un système temps réel sensible à la latence *p99*, cette bosse occasionnelle peut être inacceptable même si le débit moyen est excellent.
---SECTION---
HEADING: Memoization, caching et le problème de l'invalidation
BODY:
Mettre en cache, c'est **échanger de la mémoire contre du temps** : on stocke le résultat d'un calcul (ou d'un accès lent) pour ne pas le refaire. C'est l'une des optimisations au meilleur rapport gain/effort — quand le pattern d'accès s'y prête.

### Memoization

Cas particulier : cacher le résultat d'une **fonction pure** indexé par ses arguments. Le Fibonacci naïf récursif est O(2ⁿ) car il recalcule les mêmes valeurs des milliards de fois ; le mémoïser le rend O(n) trivialement.

```python
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2: return n
    return fib(n-1) + fib(n-2)   # chaque fib(k) calculé une seule fois
```

Condition de validité : la fonction doit être **déterministe et sans effet de bord** (mêmes arguments → même résultat). Cacher une fonction impure donne des résultats faux.

### Le vrai problème : l'invalidation

> « There are only two hard things in Computer Science: cache invalidation and naming things. » — Phil Karlton

Un cache stocke un instantané. Dès que la source change, l'entrée cachée devient **périmée** (stale). Les stratégies :

- **TTL (time-to-live)** : l'entrée expire après un délai. Simple, mais fenêtre de données périmées.
- **Invalidation explicite** : on supprime/rafraîchit l'entrée quand la source change. Correct, mais il faut connaître *toutes* les dépendances — c'est là que naissent les bugs.
- **Politique d'éviction** (mémoire bornée) : LRU (least recently used), LFU… pour décider quoi jeter quand le cache est plein.

Un cache mal invalidé ne rend pas le programme lent : il le rend **faux**. C'est un compromis correction/performance qu'il faut assumer consciemment, pas subir.
---SECTION---
HEADING: Lazy vs eager : quand payer le coût
BODY:
Une décision de conception récurrente : **calcule-t-on tout de suite (eager) ou seulement quand c'est nécessaire (lazy) ?** Le bon choix dépend de la probabilité que le résultat soit réellement utilisé.

### Évaluation paresseuse (lazy)

On diffère le calcul jusqu'au moment où le résultat est demandé — et on ne le fait pas du tout s'il ne l'est jamais.

- **Gain** : on évite le travail inutile. Idéal quand beaucoup de résultats potentiels ne seront jamais consommés (ex. un générateur qui produit à la demande, une colonne calculée rarement lue).
- **Coût** : complexité (état différé à gérer), et le calcul frappe **au moment de la lecture** — parfois un mauvais moment (latence surprise sur le chemin critique).

```python
# Eager : construit toute la liste en mémoire immédiatement
carres = [x*x for x in range(10_000_000)]   # alloue 10M d'éléments

# Lazy : ne calcule chaque carré qu'à l'itération, mémoire O(1)
carres = (x*x for x in range(10_000_000))   # générateur
for c in carres:
    if c > 100: break   # on n'a calculé que 11 valeurs, pas 10M
```

### Évaluation immédiate (eager)

On calcule tout d'avance.

- **Gain** : le résultat est prêt, latence prévisible à la lecture ; permet de faire le travail en batch (plus cache-friendly, vectorisable).
- **Coût** : on paie pour des résultats peut-être inutiles, et on consomme la mémoire tout de suite.

### La règle de décision

- Résultat **presque toujours utilisé** et lecture sur chemin critique → **eager** (payez d'avance, latence prévisible).
- Résultat **rarement utilisé** ou coûteux à produire tous → **lazy** (payez à la demande).

Le préchargement (prefetching) est l'inverse stratégique du lazy : deviner ce qui sera utile et le calculer *avant* la demande pour masquer la latence.
---SECTION---
HEADING: I/O-bound vs CPU-bound, et l'asynchrone
BODY:
Avant d'optimiser, posez **la** question de diagnostic : votre programme est-il limité par le **calcul** (CPU-bound) ou par **l'attente** (I/O-bound) ? La réponse détermine entièrement la stratégie — et une erreur ici fait perdre des jours.

### Le diagnostic

- **CPU-bound** : le processeur tourne à ~100%, il *calcule* sans arrêt (traitement d'image, crypto, simulation). Le levier : algorithme meilleur, parallélisme sur plusieurs cœurs, SIMD.
- **I/O-bound** : le processeur est souvent **inactif**, en attente d'une réponse réseau, disque ou base de données (voir les latences énormes de la section dédiée). Ajouter des cœurs ne sert à rien : ils attendraient tous. Le levier : concurrence pour **chevaucher les attentes**, batching, caching, réduire le nombre d'aller-retours.

Un CPU à 30% d'usage sur une tâche « lente » crie « I/O-bound » : inutile de vectoriser une boucle, le programme attend le réseau.

### Pourquoi l'async brille sur l'I/O

Pendant une attente d'I/O, un thread bloqué **gaspille** la capacité de la machine. Deux modèles pour récupérer ce temps :

- **Threads** : un thread par tâche, l'OS bascule quand l'un se bloque. Simple, mais chaque thread coûte de la mémoire (pile) et les changements de contexte s'accumulent à grande échelle (le fameux « problème des 10k connexions »).
- **Async / boucle d'événements** : un seul thread (ou peu) jongle avec des milliers d'opérations en cours. Quand une tâche attend l'I/O, la boucle passe à une autre tâche prête. Zéro thread gaspillé en attente.

```python
# Séquentiel : 100 requêtes × 50 ms d'attente = ~5 s, CPU quasi inactif
for url in urls:
    r = requests.get(url)   # bloque, le thread attend le réseau

# Async : les 100 attentes se chevauchent → ~50 ms au lieu de 5 s
import asyncio, aiohttp
async def fetch_all(urls):
    async with aiohttp.ClientSession() as s:
        return await asyncio.gather(*(s.get(u) for u in urls))
```

**Point clé** : l'async n'accélère pas le CPU. Il ne fait que **remplir les temps d'attente**. Pour du CPU-bound pur, l'async n'apporte rien (voire nuit) — il faut du vrai parallélisme multi-cœurs.
---SECTION---
HEADING: Concurrence : contention, verrous et lock-free
BODY:
Ajouter des threads promet d'aller plus vite, mais la **coordination** entre eux introduit ses propres coûts, souvent contre-intuitifs. Mal gérée, la concurrence *ralentit*.

### Contention et granularité des verrous

Un **verrou** (mutex) sérialise l'accès à une ressource partagée : un seul thread à la fois. La **contention** survient quand plusieurs threads se disputent le même verrou — ils font la queue, et le parallélisme s'évapore.

Le levier central est la **granularité** :

- **Verrou gros grain** (un seul gros verrou pour toute la structure) : simple et correct, mais fort taux de contention — tout le monde attend.
- **Verrou fin grain** (un verrou par bucket/segment) : moins de contention (deux threads sur deux buckets différents avancent en parallèle), mais **plus complexe** et risque de **deadlock** si l'ordre d'acquisition n'est pas maîtrisé.

Trop fin coûte aussi : chaque lock/unlock a un prix (~17 ns, table de latence) et complexifie le code. Il y a un optimum à trouver, empiriquement.

### Lock-free et le problème ABA

Les structures **lock-free** évitent les verrous via des instructions atomiques comme **CAS** (Compare-And-Swap) : « écris cette nouvelle valeur *seulement si* la valeur actuelle est toujours celle que j'ai lue ». En boucle, on réessaie jusqu'à réussir.

```
// Pseudo-CAS : boucle de retry classique
do {
    old = tete;
    nouveau->suivant = old;
} while (!CAS(&tete, old, nouveau));  // échoue si un autre thread a changé tete
```

Le piège célèbre est le **problème ABA** : un thread lit la valeur `A`, un autre la change en `B` puis **de nouveau en `A`**. Le CAS du premier réussit — la valeur *semble* inchangée — alors que l'état sous-jacent a été modifié (ex. le nœud A a été libéré puis réalloué). Solutions : **tag/compteur de version** accolé au pointeur (le CAS compare aussi le compteur), ou reclamation mémoire différée (hazard pointers, epoch-based). Le lock-free est puissant mais **notoirement difficile à écrire correctement** : réservez-le aux hot paths prouvés.

### Work-stealing

Pour équilibrer la charge, chaque thread possède sa propre file de tâches. Quand un thread vide la sienne, il **vole** une tâche à la queue d'un autre thread occupé. Ça minimise la contention (chacun travaille surtout sur sa file locale) tout en gardant tous les cœurs occupés. C'est le cœur des ordonnanceurs modernes (Fork/Join de Java, Tokio, Go, Cilk).
---SECTION---
HEADING: SIMD et vectorisation
BODY:
**SIMD** (Single Instruction, Multiple Data) exploite un parallélisme au niveau du CPU lui-même : une seule instruction opère sur **plusieurs données à la fois**, grâce à des registres larges (128, 256, 512 bits) contenant plusieurs valeurs.

### Le principe

Un registre AVX de 256 bits contient 8 `float` de 32 bits. Une instruction d'addition vectorielle additionne les 8 paires **en un seul cycle**, là où le code scalaire ferait 8 additions séquentielles. Gain théorique : ×8 (moins en pratique).

```c
// Scalaire : 1 addition par itération
for (int i = 0; i < N; i++) c[i] = a[i] + b[i];

// Vectorisé (conceptuel) : 8 additions par itération
// _mm256_add_ps additionne 8 floats d'un coup
for (int i = 0; i < N; i += 8) {
    __m256 va = _mm256_loadu_ps(&a[i]);
    __m256 vb = _mm256_loadu_ps(&b[i]);
    _mm256_storeu_ps(&c[i], _mm256_add_ps(va, vb));
}
```

### Ce qui permet (ou empêche) la vectorisation

Le compilateur **auto-vectorise** souvent, mais seulement si les conditions sont réunies :

- **Données contiguës et alignées** : c'est ici que **SoA** (section AoS/SoA) paie — les champs sont déjà côte à côte, prêts à charger dans un registre vectoriel.
- **Pas de dépendance entre itérations** : `c[i] = c[i-1] + a[i]` n'est pas vectorisable (chaque étape dépend de la précédente).
- **Pas de branche divergente** dans la boucle, ou branches converties en masques.
- **Boucle simple, bornes connues**, pas d'aliasing suspect entre pointeurs (`restrict` aide).

En résumé, SIMD est un multiplicateur qui **récompense les données bien disposées et les boucles régulières**. C'est l'aboutissement naturel d'un code déjà cache-friendly, pas un pansement à coller sur du code désorganisé.
---SECTION---
HEADING: Pression GC (garbage collection)
BODY:
Dans les langages à ramasse-miettes (Java, C#, Go, JavaScript, Python…), vous n'appelez pas `free`, mais vous **payez quand même** — sous forme de **pression GC** : plus vous allouez, plus le ramasse-miettes travaille, et son travail vole du temps CPU (voire fige le programme).

### Pourquoi ça compte pour la performance

- **Coût de collecte** : le GC doit périodiquement parcourir les objets vivants. Plus vous créez d'objets éphémères, plus il tourne souvent.
- **Pauses (stop-the-world)** : certains GC suspendent brièvement l'application pour collecter. Ces pauses tuent la latence *tail* (p99) — désastreux pour un service temps réel, même si le débit moyen reste bon.
- **Effet cache** : allouer sans cesse pollue le cache et disperse les données (retour à la localité).

### Réduire la pression : les leviers

- **Allouer moins** : réutiliser les objets, éviter les allocations dans les boucles chaudes.
- **Object pooling** : recycler un ensemble d'objets pré-alloués plutôt que d'en créer/détruire sans cesse.
- **Types valeur / structs** : en C#, Go, Java (bientôt Valhalla), préférer des types qui vivent sur la pile ou inline, sans passer par le tas.
- **Attention aux allocations cachées** : le boxing (int → Integer), la concaténation de chaînes en boucle, les closures qui capturent, les itérateurs qui allouent…

```java
// Pression GC : une nouvelle String à chaque tour → des milliers d'objets jetables
String s = "";
for (String p : morceaux) s += p;   // O(n²) ET pression GC massive

// StringBuilder : un seul buffer réutilisé, réalloué de façon amortie
StringBuilder sb = new StringBuilder();
for (String p : morceaux) sb.append(p);
String s = sb.toString();
```

**Nuance** : un GC générationnel moderne rend les allocations éphémères *très* bon marché (la « nursery »). N'allez pas contorsionner votre code sans mesure — la pression GC est un problème réel surtout sur les **hot paths** et les **systèmes sensibles à la latence**. Encore une fois : mesurez (les outils de Gregg et les profileurs d'allocation le montrent) avant d'agir.
---SECTION---
HEADING: La méthode USE pour diagnostiquer un système
BODY:
Face à un système lent, par où commencer ? Brendan Gregg propose la méthode **USE**, une checklist systématique pour éviter de tâtonner au hasard. Pour **chaque ressource** du système, on examine trois métriques.

### Les trois métriques

- **U — Utilization (utilisation)** : quel pourcentage du temps la ressource est-elle occupée ? (ex. CPU à 90%, disque à 100%).
- **S — Saturation** : y a-t-il du travail en **attente** parce que la ressource ne suit pas ? (ex. longueur de la file d'exécution, requêtes disque en queue). La saturation révèle un goulot même quand l'utilisation semble « seulement » élevée.
- **E — Errors (erreurs)** : y a-t-il des erreurs sur cette ressource ? (paquets réseau perdus, erreurs disque, retransmissions). Les erreurs se paient en performance et sont souvent négligées.

### Les ressources à passer en revue

CPU, mémoire, disques (I/O), interfaces réseau, bus/interconnexions, et les ressources logicielles (pools de threads, descripteurs de fichiers, verrous). Pour chacune, on remplit la grille U/S/E.

### Pourquoi c'est puissant

La méthode est **exhaustive et rapide** : au lieu de partir d'une hypothèse (« c'est sûrement le CPU ») et de chercher à la confirmer — biais classique —, on balaie toutes les ressources et on laisse les chiffres désigner le coupable. Un exemple typique : le CPU semble sous-utilisé (40%), mais la **saturation disque** est énorme (file d'attente pleine) → le vrai goulot est l'I/O, pas le calcul. Sans regarder la saturation, on aurait pu conclure « la machine n'est pas chargée » et chercher au mauvais endroit. USE structure l'enquête pour que ça n'arrive pas.
---SECTION---
HEADING: Benchmarking correct : warmup, JIT et dead-code elimination
BODY:
Un benchmark mal fait est pire qu'inutile : il donne des chiffres **faux** avec assurance, et vous optimisez dans le vide. Micro-mesurer correctement est étonnamment subtil.

### Les pièges qui faussent tout

**1. Absence de warmup (JIT et caches).** Sur une VM à compilation JIT (JVM, .NET, V8), le code démarre **interprété** puis se fait compiler en code natif après quelques milliers d'exécutions. Mesurer les premières itérations mesure l'interpréteur, pas le code optimisé. De même, les premiers accès remplissent les caches (mémoire, branch predictor). **Remède** : exécuter une phase de *warmup* non chronométrée avant de mesurer.

**2. Dead-code elimination.** Si vous calculez un résultat sans l'utiliser, le compilateur (à juste titre) **supprime tout le calcul**. Votre benchmark mesure alors une boucle vide.

```java
// FAUX : resultat n'est jamais utilisé → le JIT supprime tout le calcul
for (int i = 0; i < N; i++) {
    double resultat = Math.sqrt(i);   // éliminé, mesure ~0 ns
}

// CORRECT : "consommer" le résultat empêche l'élimination
// (JMH fournit Blackhole.consume() exactement pour ça)
double acc = 0;
for (int i = 0; i < N; i++) acc += Math.sqrt(i);
blackhole.consume(acc);   // le compilateur ne peut plus supposer le calcul inutile
```

**3. Repli sur constantes (constant folding).** Si les entrées sont des constantes connues à la compilation, le compilateur pré-calcule le résultat. Utilisez des entrées imprévisibles (lues à l'exécution).

### Autres règles d'hygiène

- **Mesurer plusieurs fois** et regarder la **distribution** (médiane, p99), pas juste la moyenne — le bruit et les pauses GC créent des valeurs aberrantes.
- **Isoler la variable** : ne changez qu'une chose entre deux mesures.
- **Représentativité** : mesurez avec des **données et une charge réalistes**. Un microbenchmark sur `n=10` ne dit rien sur `n=10⁶` (caches, branch prediction, complexité changent de régime).
- **Utilisez un harnais éprouvé** (JMH pour Java, `google/benchmark` pour C++, `criterion` pour Rust) : ils gèrent warmup, anti-élimination et statistiques pour vous.

La conclusion boucle avec l'ouverture : mesurez, mais **mesurez bien**. Un mauvais benchmark est une intuition déguisée en chiffre — plus dangereuse que l'intuition assumée, parce qu'on lui fait confiance.
===END===
