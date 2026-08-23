===LESSON===
KEY: hardware
TOPIC: hardware
TITLE: Hardware
ICON: 🔩
INTRO: Le processeur que vous programmez n'est pas la machine simple et séquentielle du modèle mental habituel : c'est un système parallèle, spéculatif et hiérarchisé où la mémoire est lente, les caches gouvernent la performance, et comprendre le matériel transforme un code correct en un code rapide.
---SECTION---
HEADING: Le mur de la mémoire : pourquoi le matériel compte
BODY:
Le programmeur idéalise souvent l'ordinateur comme un CPU qui lit et écrit dans une mémoire uniforme à vitesse constante. Cette abstraction est **fausse en performance**, et c'est le point de départ de tout le reste.

Depuis les années 1980, la vitesse des CPU a crû bien plus vite que celle de la mémoire principale (DRAM). Résultat : aujourd'hui, un accès à la RAM coûte des **centaines de cycles** pendant lesquels le CPU pourrait exécuter des centaines d'instructions. C'est le **memory wall** (mur de la mémoire).

Tout le sous-système mémoire moderne — caches, pipeline, exécution out-of-order, préchargement — existe pour **masquer cette latence**. Drepper le résume ainsi dans *What Every Programmer Should Know About Memory* : le matériel travaille dur pour donner l'illusion d'une mémoire rapide, mais cette illusion se brise dès que votre code ignore la façon dont les données sont réellement organisées.

Les deux leviers que vous contrôlez sont :

- **La localité** : accéder à des données proches dans le temps (localité temporelle) et dans l'espace (localité spatiale).
- **La prédictibilité** : des accès et des branchements réguliers que le matériel peut anticiper.

Le reste de ce cours explique *comment* le matériel fonctionne pour que ces deux leviers deviennent des réflexes concrets.
---SECTION---
HEADING: La hiérarchie mémoire : registres, caches, RAM, disque
BODY:
Le matériel organise le stockage en une **hiérarchie** (CS:APP, chapitre 6). Plus on monte, plus c'est rapide, petit et cher ; plus on descend, plus c'est lent, grand et bon marché.

De haut en bas :

- **Registres** : quelques dizaines, accès en 0 cycle (dans l'instruction elle-même).
- **Cache L1** : ~32 Ko données + 32 Ko instructions par cœur, ~4 cycles.
- **Cache L2** : ~256 Ko à 1 Mo par cœur, ~10-12 cycles.
- **Cache L3** : ~8 à 32 Mo partagé entre cœurs, ~40 cycles.
- **DRAM (mémoire principale)** : plusieurs Go, ~200-300 cycles.
- **SSD/Disque** : To, des dizaines de milliers à des millions de cycles.

Le principe fondateur : chaque niveau sert de **cache** pour le niveau juste en dessous. Le matériel déplace automatiquement les données vers le haut quand vous y accédez, en pariant que vous y reviendrez (localité temporelle) et que vous accéderez aux données voisines (localité spatiale).

Ce pari est **implicite** : vous n'écrivez jamais « charge cette ligne en L1 ». Mais la structure de vos données et l'ordre de vos accès décident si le pari est gagné (données déjà en cache = *hit*) ou perdu (*miss* = on paie la latence du niveau inférieur).
---SECTION---
HEADING: Latences chiffrées : le tableau à connaître par cœur
BODY:
Les chiffres exacts varient selon les microarchitectures, mais les **ordres de grandeur** sont stables et doivent devenir une intuition. Voici des valeurs représentatives pour un CPU x86 serveur moderne (~3 GHz, donc 1 cycle ≈ 0,3 ns) :

| Niveau | Latence (cycles) | Latence (ns) |
|---|---|---|
| Registre | 0 | 0 |
| Cache L1 | ~4 | ~1 ns |
| Cache L2 | ~12 | ~4 ns |
| Cache L3 | ~40 | ~13 ns |
| DRAM | ~200-300 | ~60-100 ns |
| SSD NVMe | — | ~10-100 µs |
| Disque dur | — | ~1-10 ms |

Pour donner l'échelle humaine : si un accès L1 prenait **1 seconde**, un accès DRAM prendrait environ **1 minute**, et un accès disque dur des **mois**.

La conséquence pratique est brutale : un algorithme avec plus d'opérations mais un meilleur schéma d'accès mémoire peut battre un algorithme « théoriquement optimal » qui rate le cache. Le nombre d'instructions ne prédit plus la vitesse — **le nombre de cache miss, si**.
---SECTION---
HEADING: La ligne de cache de 64 octets : l'unité réelle des transferts
BODY:
Le matériel ne transfère **jamais** un seul octet entre la RAM et le cache. Il transfère toujours une **ligne de cache** (*cache line*), typiquement de **64 octets** sur x86 et ARM modernes.

Conséquence directe : quand vous lisez un `int` (4 octets), le CPU charge les 64 octets qui l'entourent, alignés sur une frontière de 64. Les 60 octets voisins sont désormais « gratuits » en cache. C'est le mécanisme physique qui donne sa valeur à la **localité spatiale**.

Exemple concret — parcourir un tableau dans l'ordre est rapide, car chaque ligne chargée sert pour ~16 `int` consécutifs :

```c
// RAPIDE : 1 miss toutes les 16 lectures (16 int = 64 octets)
long somme = 0;
for (int i = 0; i < N; i++) somme += tab[i];

// LENT : saute de ligne en ligne, ~1 miss par lecture
for (int i = 0; i < N; i += 16) somme += tab[i];
```

C'est aussi pourquoi parcourir une matrice **ligne par ligne** (row-major, comme en C) est bien plus rapide que colonne par colonne : le C stocke les lignes de façon contiguë, donc le parcours ligne suit l'ordre mémoire et exploite chaque ligne de cache complètement.

Pensez toujours vos structures de données en **lignes de 64 octets** : regrouper les champs utilisés ensemble, aligner les structures critiques, éviter de disperser des données chaudes dans de vastes zones froides.
---SECTION---
HEADING: Anatomie d'un cache : associativité, sets, tags
BODY:
Un cache doit décider **où** ranger une ligne venue de la RAM. Trois organisations existent (CS:APP, §6.4) :

- **Direct-mapped** : chaque adresse mémoire ne peut aller que dans **une seule** case du cache. Simple et rapide, mais deux adresses qui « tombent » sur la même case s'évincent mutuellement en boucle.
- **Fully associative** : une ligne peut aller **n'importe où**. Flexible mais coûteux à interroger (il faut comparer tous les tags). Réservé aux petits caches comme la TLB.
- **Set-associative (le compromis réel)** : le cache est divisé en *sets*, chacun contenant *N* « voies » (*ways*). Une adresse est mappée sur un set précis mais peut occuper n'importe laquelle des *N* voies de ce set. On parle de cache **N-way** (ex. L1 souvent 8-way).

Le décodage d'une adresse se fait en trois champs :

```
| tag (identité) | set index (quel set) | offset (octet dans la ligne, 6 bits pour 64o) |
```

- L'**offset** (6 bits) sélectionne l'octet dans la ligne de 64.
- Le **set index** sélectionne le set.
- Le **tag** est comparé aux tags des voies du set pour savoir si c'est un hit.

L'associativité importe car elle limite les **conflits**. Un cache 8-way tolère 8 adresses actives partageant le même set ; la 9ᵉ en évince une. Comprendre ça explique des chutes de performance mystérieuses quand des données chaudes se disputent le même set (voir les conflict miss).
---SECTION---
HEADING: Les trois types de cache miss (les « 3 C »)
BODY:
Tout défaut de cache se classe en trois catégories (Hennessy & Patterson) — un cadre puissant pour diagnostiquer *pourquoi* votre code rate le cache :

- **Compulsory miss (miss obligatoire / à froid)** : la première fois qu'une ligne est touchée, elle n'est jamais en cache. Inévitable, mais le **prefetching** (préchargement) peut le masquer en anticipant l'accès.
- **Capacity miss (miss de capacité)** : le jeu de données actif (*working set*) est plus grand que le cache. Les lignes anciennes sont évincées avant d'être réutilisées. Solution : réduire le working set, découper le travail en **blocs** qui tiennent en cache (*cache blocking* / tiling).
- **Conflict miss (miss de conflit)** : le working set tiendrait dans le cache, mais trop de lignes se disputent le **même set** (associativité insuffisante). Symptôme classique : une boucle qui accède à des adresses espacées d'une puissance de 2, toutes mappées sur les mêmes sets.

Diagnostic mental : « Est-ce la première fois ? » → compulsory. « Mes données sont-elles trop grosses ? » → capacity. « Mes données tiennent mais collisionnent ? » → conflict.

Le *cache blocking* illustre la lutte contre les capacity miss. Au lieu de multiplier deux grandes matrices d'un coup (chaque ligne évincée avant réutilisation), on travaille par sous-blocs :

```c
// Multiplication par blocs : chaque bloc B×B tient en cache
for (int ii = 0; ii < N; ii += B)
  for (int jj = 0; jj < N; jj += B)
    for (int kk = 0; kk < N; kk += B)
      for (int i = ii; i < ii+B; i++)
        for (int j = jj; j < jj+B; j++)
          for (int k = kk; k < kk+B; k++)
            C[i][j] += A[i][k] * B_mat[k][j];
```

Chaque donnée chargée est **réutilisée** avant éviction : les misses de capacité s'effondrent.
---SECTION---
HEADING: Le pipeline CPU et les hazards
BODY:
Un CPU n'exécute pas une instruction du début à la fin avant de commencer la suivante. Il découpe chaque instruction en **étages** et les fait défiler comme sur une chaîne de montage — le **pipeline** (Patterson & Hennessy). Un pipeline classique à 5 étages :

1. **Fetch** : lire l'instruction.
2. **Decode** : la décoder, lire les registres.
3. **Execute** : calculer (ALU).
4. **Memory** : accéder à la mémoire si besoin.
5. **Write-back** : écrire le résultat.

Pendant que l'instruction A est en *Execute*, B est en *Decode* et C en *Fetch*. Idéalement, une instruction **termine à chaque cycle** même si chacune prend 5 cycles de bout en bout. Les CPU modernes vont plus loin : pipelines de 15-20 étages, **superscalaires** (plusieurs instructions par cycle).

Mais trois **hazards** (aléas) cassent ce flux idéal :

- **Data hazard** : une instruction a besoin du résultat d'une précédente pas encore terminée. Ex. `b = a + 1; c = b + 2;` — `c` doit attendre `b`.
- **Control hazard** : un branchement (`if`, boucle, appel) rend incertaine la prochaine instruction à charger.
- **Structural hazard** : deux instructions veulent la même ressource matérielle au même moment.

Le matériel combat ces aléas avec le **forwarding** (court-circuiter un résultat directement d'un étage à l'autre sans attendre le write-back) et, pour les branchements, la **prédiction**. Quand rien ne marche, il insère des **bulles** (stalls) : des cycles perdus. Votre objectif de programmeur : écrire du code qui crée peu de dépendances longues et peu de branchements imprévisibles.
---SECTION---
HEADING: La prédiction de branchement
BODY:
Un pipeline profond a un problème avec les `if` : au moment où le CPU rencontre un branchement, il ne sait pas encore quelle direction prendre (la condition n'est pas encore calculée), mais il doit **continuer à charger des instructions** pour ne pas vider le pipeline.

Solution : le **prédicteur de branchement** (*branch predictor*). Le CPU **parie** sur la direction la plus probable et exécute spéculativement cette voie. S'il a raison, aucun temps perdu. S'il a tort — **misprediction** — il doit **vider le pipeline** (flush) de toutes les instructions spéculatives et repartir de la bonne adresse. Coût typique : **15 à 20 cycles** perdus.

Les prédicteurs modernes sont très sophistiqués : historiques par branchement, corrélations entre branchements, tables à deux niveaux. Ils atteignent souvent >95 % de réussite sur du code régulier.

La conséquence pratique est spectaculaire — un branchement **prévisible** (presque toujours pris, ou suivant un motif) est quasi gratuit ; un branchement **imprévisible** (aléatoire, 50/50) coûte cher. D'où l'astuce classique : trier un tableau avant de le filtrer peut **accélérer** la boucle, car la condition devient prévisible :

```c
// Sur données ALÉATOIRES, ce if est imprévisible → nombreux flushes
for (int i = 0; i < N; i++)
    if (data[i] >= 128) somme += data[i];
// Trier data[] avant rend le branchement prévisible → 5-6× plus rapide
```

Quand c'est possible, préférez du code **sans branche** (*branchless*) : opérations arithmétiques, masques, ou instructions de déplacement conditionnel (`cmov`) que le compilateur génère.
---SECTION---
HEADING: Exécution out-of-order et spéculative
BODY:
Les CPU haut de gamme n'exécutent pas les instructions dans l'ordre du programme. Ils font de l'**exécution dans le désordre** (*out-of-order*, OoO) pour ne jamais rester bloqués.

Le principe : quand une instruction attend (par exemple un cache miss de 200 cycles), le CPU **cherche plus loin** dans le flot d'instructions et exécute celles qui sont **prêtes** (dont les opérandes sont disponibles) et indépendantes. Il maintient une fenêtre d'instructions « en vol » (le *reorder buffer*, ROB, qui peut contenir des centaines d'instructions).

Deux garanties importantes :

- **Exécution désordonnée, retrait ordonné** : les instructions s'exécutent quand elles peuvent, mais leurs résultats sont **validés** (*retire/commit*) dans l'ordre du programme. Vu de l'extérieur, le programme respecte son ordre.
- **Spéculation** : combiné à la prédiction de branchement, le CPU exécute en avance des instructions dont il n'est même pas sûr qu'elles seront nécessaires. Si le pari échoue, il les annule.

Ce mécanisme explique pourquoi le CPU peut **masquer** partiellement un cache miss : pendant les 200 cycles d'attente, il abat du travail utile en aval. Mais cette capacité a une limite — la taille du ROB. Si toutes les instructions en vol dépendent de la donnée manquante (longue **chaîne de dépendances**), le CPU cale malgré tout.

Leçon de programmeur : exposer du **parallélisme d'instructions** (ILP). Plusieurs accumulateurs indépendants dans une boucle, par exemple, donnent au CPU du travail indépendant à faire pendant les attentes.
---SECTION---
HEADING: Le renommage de registres
BODY:
Le jeu d'instructions x86 n'a que 16 registres généraux nommés (`rax`, `rbx`…). Cette pénurie crée de **fausses dépendances** : deux instructions indépendantes qui réutilisent le même nom de registre semblent liées alors qu'elles ne le sont pas.

Deux types de fausses dépendances :

- **WAR** (write-after-read) : B écrit dans un registre que A vient de lire.
- **WAW** (write-after-write) : B et A écrivent dans le même registre.

Ces dépendances ne sont pas de vraies dépendances de données (**RAW**, read-after-write, la seule vraie) : elles n'existent qu'à cause du **manque de noms**.

Le **renommage de registres** (*register renaming*) résout ça. Le CPU dispose en réalité de **bien plus** de registres physiques (souvent 150-200) que de registres architecturaux. À l'exécution, il fait correspondre dynamiquement chaque écriture de registre nommé à un **registre physique frais**. Ainsi, deux instructions qui écrivent `rax` reçoivent deux registres physiques différents et deviennent réellement indépendantes.

C'est ce qui rend l'out-of-order efficace : sans renommage, les fausses dépendances brideraient tout le parallélisme. Concrètement, cela signifie que réutiliser une variable temporaire dans une boucle ne crée pas de goulot — le matériel « démultiplie » ces noms. La vraie limite reste les dépendances **RAW**, celles où un calcul a réellement besoin du résultat d'un autre.
---SECTION---
HEADING: La mémoire virtuelle : pages, traduction, page faults
BODY:
Chaque processus croit disposer d'un espace mémoire immense et privé qui lui est propre. C'est une illusion créée par la **mémoire virtuelle** (CS:APP, chapitre 9). Les adresses que manipule votre programme sont **virtuelles** ; le matériel les traduit en adresses **physiques** en RAM.

La mémoire est découpée en **pages** de taille fixe, typiquement **4 Ko**. La traduction se fait par page via une **table des pages** (*page table*), gérée par l'OS et parcourue par la MMU (unité de gestion mémoire) du CPU.

Cette indirection offre trois choses essentielles :

- **Isolation** : un processus ne peut pas lire la mémoire d'un autre (chacun sa table).
- **Illusion d'abondance** : on peut adresser plus que la RAM physique ; les pages inutilisées vivent sur le disque (*swap*).
- **Flexibilité** : une page virtuelle contiguë peut correspondre à des pages physiques éparpillées.

Quand un programme accède à une page qui n'est **pas** en RAM (jamais chargée, ou évincée sur disque), la MMU déclenche un **page fault** : une interruption qui rend la main à l'OS. Celui-ci charge la page depuis le disque (des milliers à millions de cycles), met à jour la table, et reprend l'exécution. Un page fault occasionnel est normal ; un programme qui en génère en masse (**thrashing**, quand le working set dépasse la RAM) s'effondre en performance, car il passe son temps à faire des allers-retours avec le disque.
---SECTION---
HEADING: La TLB : le cache de la traduction d'adresses
BODY:
Il y a un problème caché dans la mémoire virtuelle : **chaque** accès mémoire de votre programme nécessite d'abord une traduction virtuel→physique. Or parcourir la table des pages coûte plusieurs accès mémoire (les tables sont hiérarchiques, souvent 4 niveaux sur x86-64). Traduire avant chaque accès doublerait ou triplerait le coût de la mémoire.

La solution est un cache spécialisé : la **TLB** (*Translation Lookaside Buffer*). C'est un petit cache, entièrement associatif, qui mémorise les traductions récentes page virtuelle → page physique. La MMU consulte d'abord la TLB :

- **TLB hit** : traduction trouvée en ~1 cycle, l'accès continue.
- **TLB miss** : il faut parcourir la table des pages (*page walk*), coûteux (dizaines à centaines de cycles), puis on met la traduction en cache dans la TLB.

La TLB est petite (souvent 64 à 1500 entrées). Avec des pages de 4 Ko, une TLB de 512 entrées ne couvre que ~2 Mo de mémoire « traduite instantanément ». Un programme qui accède à la mémoire de façon très **dispersée** sur beaucoup de pages génère des **TLB miss** en masse — un coût invisible dans le code source mais bien réel.

C'est un argument majeur en faveur de la **localité** au niveau des pages, et la raison d'être des *huge pages* (section dédiée) qui étendent radicalement la couverture de la TLB.
---SECTION---
HEADING: DRAM contre SRAM : pourquoi la RAM est lente
BODY:
Deux technologies de mémoire coexistent, et leurs différences physiques expliquent toute la hiérarchie (Drepper, section 2) :

- **SRAM** (*Static RAM*) : chaque bit est stocké dans une bascule à **6 transistors**. Rapide (accès en quelques cycles), stable tant qu'elle est alimentée, mais **chère et volumineuse**. C'est la technologie des **caches** (L1/L2/L3).
- **DRAM** (*Dynamic RAM*) : chaque bit est un **condensateur + 1 transistor**. Dense et bon marché (d'où les gigaoctets de RAM), mais lente et **volatile au sens propre** : le condensateur fuit et doit être **rafraîchi** périodiquement (toutes les quelques millisecondes), d'où le « dynamic ».

La lenteur de la DRAM ne vient pas que de la cellule. L'accès passe par une chorégraphie : sélectionner une **ligne** (row) du banc, la copier dans un tampon (*row buffer*), puis lire les colonnes. Ouvrir une nouvelle ligne coûte cher (*RAS-to-CAS delay*, précharge). Mais lire plusieurs colonnes d'une **même ligne déjà ouverte** est rapide — c'est le *burst*.

Conséquence pratique : les accès mémoire **séquentiels** exploitent le row buffer et le mode burst (haut débit), tandis que les accès **aléatoires** paient sans cesse l'ouverture de nouvelles lignes. Encore une fois, la localité spatiale gagne — non seulement au niveau du cache, mais jusque dans la puce DRAM elle-même.
---SECTION---
HEADING: NUMA : quand la RAM n'est plus uniforme
BODY:
Sur une machine à plusieurs processeurs (sockets), la mémoire n'est plus un bloc uniforme. Chaque socket possède **sa propre** DRAM locale, reliée directement à lui ; pour accéder à la mémoire d'un **autre** socket, la requête traverse une interconnexion (QPI/UPI chez Intel, Infinity Fabric chez AMD). C'est l'architecture **NUMA** (*Non-Uniform Memory Access*).

Conséquence : le coût d'un accès mémoire **dépend de l'endroit** où vit la donnée.

- **Accès local** (mémoire de mon socket) : rapide.
- **Accès distant** (mémoire d'un autre socket) : **1,5 à 2× plus lent**, plus une bande passante partagée sur l'interconnexion.

Ce qui rend NUMA piégeux, c'est la politique d'allocation par défaut de l'OS : **first-touch**. Une page n'est physiquement allouée que lors de son **premier accès en écriture**, sur le nœud NUMA du thread qui y touche en premier. D'où un anti-pattern fréquent : un thread initialise tout un tableau (tout est alloué sur *son* nœud), puis on distribue le travail sur tous les cœurs — la moitié des threads accède désormais à de la mémoire distante.

Règle d'or : **initialiser les données depuis le thread qui les utilisera** (« touche par celui qui calcule »), et épingler les threads (*affinity*) sur des cœurs stables. Sur un gros serveur, ignorer NUMA peut coûter un facteur 2 sur des charges mémoire-intensives.
---SECTION---
HEADING: SIMD, GPU et le modèle SIMT
BODY:
Jusqu'ici on a considéré une instruction agissant sur une donnée. Mais le matériel offre du **parallélisme de données** : une seule instruction traitant **plusieurs** valeurs d'un coup — le **SIMD** (*Single Instruction, Multiple Data*).

Sur CPU, ce sont les extensions vectorielles : SSE (128 bits), AVX2 (256 bits), AVX-512 (512 bits). Un registre AVX-512 contient **16 floats** ; une seule addition vectorielle les additionne tous en parallèle. Bien exploité (par le compilateur en *auto-vectorisation*, ou via des *intrinsics*), c'est un gain théorique de 4× à 16×.

Conditions pour que ça marche : données **contiguës et alignées**, boucles sans dépendances entre itérations, peu de branchements. C'est encore la localité et la régularité qui commandent.

Le **GPU** pousse cette logique à l'extrême avec le modèle **SIMT** (*Single Instruction, Multiple Threads*). Des milliers de threads légers sont regroupés par paquets (**warps** de 32 chez NVIDIA) qui exécutent **la même instruction** en parallèle sur des données différentes. Le GPU masque la latence mémoire non par des caches géants, mais par un **surabonnement massif** de threads : dès qu'un warp attend la mémoire, un autre prend sa place, gardant les unités de calcul occupées.

Le piège du SIMT est la **divergence** : si les threads d'un même warp prennent des branches différentes (`if`/`else`), le matériel exécute **séquentiellement** les deux chemins en masquant les threads inactifs. Un `if` divergent dans un warp peut diviser le débit par deux. D'où la même leçon, transposée : régularité et accès mémoire coalescés (threads voisins lisant des adresses voisines).
---SECTION---
HEADING: Cohérence de cache et protocole MESI
BODY:
Avec plusieurs cœurs ayant chacun leur cache L1/L2, un problème surgit : si le cœur 0 et le cœur 1 ont tous deux copié la même ligne mémoire, et que le cœur 0 la modifie, comment le cœur 1 évite-t-il de lire une valeur **périmée** ? C'est le problème de la **cohérence de cache** (*cache coherence*).

Le matériel le résout de façon transparente avec un protocole, le plus connu étant **MESI**. Chaque ligne de cache porte l'un de quatre états :

- **M**odified : cette ligne est modifiée, cette copie est la seule valide, la RAM est périmée.
- **E**xclusive : cette ligne est propre (identique à la RAM) et présente **uniquement** dans ce cache.
- **S**hared : cette ligne est propre et peut être présente dans **plusieurs** caches.
- **I**nvalid : cette ligne ne contient pas de donnée valide.

Le mécanisme : quand un cœur veut **écrire** dans une ligne, il doit d'abord obtenir la **propriété exclusive**. Il envoie une demande d'invalidation sur le bus (*Request For Ownership*) ; tous les autres caches passent leur copie de cette ligne en **Invalid**. L'écriture passe l'état à Modified. Si un autre cœur relit ensuite cette ligne, le cœur propriétaire lui fournit la version à jour et repasse en Shared.

Ce protocole garantit la correction **automatiquement**. Mais il a un **coût** : chaque écriture sur une ligne partagée déclenche un trafic de cohérence entre cœurs (dizaines à centaines de cycles). Comprendre MESI est la clé pour comprendre le fléau du **false sharing**.
---SECTION---
HEADING: Le false sharing : le tueur silencieux du multithread
BODY:
Le **false sharing** (fausse ligne partagée) est l'une des pathologies de performance les plus insidieuses en programmation concurrente, et elle découle directement de MESI + ligne de 64 octets.

Le scénario : deux threads modifient deux variables **différentes et indépendantes**, mais qui se trouvent physiquement **sur la même ligne de cache** de 64 octets. Logiquement, aucun partage. Mais le matériel raisonne par **ligne entière**, pas par variable. Chaque écriture d'un thread invalide la ligne dans le cache de l'autre. Les deux cœurs se **volent la ligne** en boucle (*cache line ping-pong*), chaque accès repayant le prix de la cohérence.

Exemple classique — un tableau de compteurs, un par thread :

```c
// PIÈGE : les 8 compteurs tiennent sur 1-2 lignes de cache
long compteurs[8];               // thread i incrémente compteurs[i]

// CORRECTIF : espacer chaque compteur sur sa propre ligne
struct { long val; char pad[56]; } compteurs[8]; // aligné 64o
```

Dans la version piégée, incrémenter `compteurs[0]` et `compteurs[1]` depuis deux cœurs crée un ping-pong permanent, alors que les variables sont indépendantes. Le correctif — le **padding** pour aligner chaque donnée chaude sur sa propre ligne — peut multiplier les performances par 5 ou 10.

Signes révélateurs : un code multithread qui **ralentit** quand on ajoute des threads, ou dont la performance dépend mystérieusement du placement de champs dans une structure. Le remède : identifier les données chaudes écrites par des threads distincts et les séparer (padding, alignement `alignas(64)`, variables locales par thread).
---SECTION---
HEADING: Ordering mémoire, store buffer et barrières
BODY:
Dernier niveau de subtilité, et le plus contre-intuitif : dans un programme multithread, **l'ordre dans lequel les écritures d'un cœur deviennent visibles pour les autres** n'est pas garanti d'être l'ordre du code source. C'est le **modèle mémoire** (*memory ordering*).

La cause matérielle principale est le **store buffer**. Quand un cœur écrit en mémoire, il ne bloque pas en attendant que l'écriture atteigne le cache/la RAM ; il dépose l'écriture dans un tampon (*store buffer*) et **continue**. Ce cœur peut relire immédiatement sa propre valeur (*store-to-load forwarding* : la lecture court-circuite le buffer), mais les **autres cœurs** ne verront l'écriture que plus tard, quand elle « drainera » vers le cache.

Résultat : un cœur peut voir ses propres lectures/écritures réordonnées vis-à-vis de ce que voient les autres. Les architectures définissent des règles :

- **x86-TSO** (*Total Store Order*, le modèle x86) : relativement fort. Les écritures ne sont réordonnées qu'à cause du store buffer (une lecture peut « dépasser » une écriture antérieure vers une adresse différente : réordonnancement StoreLoad). Les autres réordonnancements sont interdits.
- **ARM/POWER** : modèles **faibles**, presque tout peut être réordonné sauf les vraies dépendances. Bien plus permissif — donc bien plus piégeux.

Pour reprendre le contrôle, on utilise des **barrières mémoire** (*fences*) et la sémantique **acquire/release** :

- **release** (sur une écriture) : garantit que toutes les écritures **précédentes** sont visibles avant celle-ci. On « publie ».
- **acquire** (sur une lecture) : garantit que les lectures/écritures **suivantes** ne remontent pas avant. On « consomme ».
- Une paire **release → acquire** établit une relation *happens-before* fiable entre deux threads.

En pratique, vous n'écrivez presque jamais de barrières à la main : vous utilisez des **atomiques** (`std::atomic` en C++, avec `memory_order_acquire`/`release`) ou des mutex, qui insèrent les bonnes barrières. Mais comprendre le store buffer explique *pourquoi* un code lock-free « évident » est faux sans ces annotations : sans barrière, les autres cœurs voient vos écritures dans le désordre.
---SECTION---
HEADING: Huge pages : étendre la portée de la TLB
BODY:
On a vu que la TLB est petite et qu'avec des pages de 4 Ko, elle ne couvre que quelques mégaoctets. Pour les programmes à grande empreinte mémoire (bases de données, calcul scientifique, JVM à gros tas), les **TLB miss** deviennent un goulot majeur.

La solution matérielle : les **huge pages** (grandes pages). Au lieu de 4 Ko, le CPU sait gérer des pages de **2 Mo** (voire **1 Go**). Une seule entrée de TLB couvre alors 2 Mo au lieu de 4 Ko — soit **512×** plus de mémoire traduite par entrée.

Bénéfices :

- **Couverture TLB démultipliée** : une TLB de 512 entrées couvre 1 Go avec des pages de 2 Mo, contre 2 Mo avec des pages de 4 Ko.
- **Table des pages plus courte** : moins de niveaux à parcourir en cas de miss (le *page walk* est plus rapide).
- **Moins de page faults** au démarrage (une faute charge 2 Mo d'un coup).

Coûts et pièges :

- **Gaspillage mémoire** (fragmentation interne) : une page de 2 Mo partiellement utilisée gâche de la RAM.
- **Allocation plus difficile** : il faut 2 Mo **physiquement contigus**, ce qui devient rare quand la RAM est fragmentée.

Sous Linux, on y accède via `hugetlbfs`, `mmap(MAP_HUGETLB)`, ou les *Transparent Huge Pages* (THP) qui les activent automatiquement. Le gain sur des charges à accès mémoire vaste et aléatoire peut atteindre 10-30 %.
---SECTION---
HEADING: Side-channels : quand la performance fuit des secrets
BODY:
Les mécanismes qui rendent le CPU rapide — spéculation, caches — créent des **canaux auxiliaires** (*side-channels*) par lesquels de l'information secrète peut fuir. Les vulnérabilités **Spectre** et **Meltdown** (2018) l'ont démontré de façon retentissante.

Le principe commun repose sur un fait crucial : l'exécution **spéculative** est censée être invisible (annulée si le pari échoue), mais elle laisse une **trace** — l'état du cache. Une donnée chargée spéculativement reste en cache même après l'annulation de la spéculation. Un attaquant peut alors **mesurer les temps d'accès** (une ligne en cache répond vite, une ligne évincée répond lentement) pour déduire quelle adresse a été touchée spéculativement, et donc reconstruire un secret.

- **Meltdown** : exploite le fait que, lors d'un accès illégal (mémoire noyau depuis l'espace utilisateur), le CPU charge quand même spéculativement la donnée avant de lever l'exception. Un accès spéculatif dépendant de cette valeur laisse une empreinte cache mesurable. Correctif : **KPTI** (isolation des tables de pages noyau/utilisateur), avec un coût en performance.
- **Spectre** : plus fondamental, abuse la **prédiction de branchement**. L'attaquant « entraîne » le prédicteur à prendre un chemin, puis fournit une entrée hors limites ; le CPU exécute spéculativement un accès hors limites et laisse la trace cache avant de corriger.

La leçon conceptuelle est profonde : une **abstraction** (« la spéculation est invisible ») fuit à travers un **canal temporel**. La sécurité et la microarchitecture ne sont pas séparables. Les atténuations (barrières de spéculation comme `lfence`, isolation, `retpoline`) ont un **coût en performance** réel — un rappel que vitesse et sûreté sont parfois antagonistes au niveau matériel.
---SECTION---
HEADING: Les dénormaux : le piège des très petits flottants
BODY:
Un dernier piège matériel, discret mais capable de diviser les performances par 100 : les nombres **dénormaux** (ou *subnormaux*).

En virgule flottante IEEE 754, les nombres normalisés ont un bit implicite de tête à 1, ce qui laisse un « trou » autour de zéro : le plus petit normal positif n'est pas si proche de zéro. Pour combler ce trou (*gradual underflow*), la norme définit les **dénormaux** : des nombres extrêmement petits, plus près de zéro que le plus petit normal, encodés avec un exposant spécial et sans le bit implicite.

Le problème est matériel : beaucoup de CPU ne gèrent **pas** les dénormaux dans leur circuit rapide. Quand une opération produit ou consomme un dénormal, le CPU bascule sur un traitement **microcodé** bien plus lent — un ralentissement pouvant atteindre **10× à 100×** sur les opérations concernées.

Où ça mord : des calculs qui **décroissent vers zéro** — filtres audio à réverbération, systèmes physiques amortis, réseaux de neurones. Les valeurs s'approchent de zéro, entrent dans le domaine dénormal, et la boucle chaude s'effondre soudainement sans raison apparente dans le code.

Le correctif est simple une fois le phénomène connu : activer les modes **FTZ** (*Flush To Zero*) et **DAZ** (*Denormals Are Zero*), qui remplacent tout dénormal par zéro. On perd un peu de précision près de zéro — sans conséquence pour la plupart des applications — et on retrouve la vitesse.

```c
// Activer FTZ + DAZ sur x86 (SSE)
#include <xmmintrin.h>
#include <pmmintrin.h>
_MM_SET_FLUSH_ZERO_MODE(_MM_FLUSH_ZERO_ON);        // FTZ
_MM_SET_DENORMALS_ZERO_MODE(_MM_DENORMALS_ZERO_ON); // DAZ
```

C'est l'illustration finale du thème du cours : une notion mathématique (les dénormaux) a un **coût matériel caché** que seul un programmeur conscient du hardware sait diagnostiquer et corriger.
===END===
