===LESSON===
KEY: interview
TOPIC: interview
TITLE: Coding interview
ICON: 💼
INTRO: L'entretien de code n'évalue pas seulement si tu connais les algorithmes, mais si tu sais décomposer un problème inconnu, raisonner à voix haute sur les compromis de temps et d'espace, partir d'une force brute correcte pour la raffiner vers l'optimal, et couvrir les cas limites — et ce cours te donne l'intuition, les structures, les patterns et la démarche pour y arriver avec méthode.
---SECTION---
HEADING: Ce que l'entretien évalue vraiment
BODY:
Beaucoup de candidats croient que l'entretien de code teste la mémorisation d'astuces. C'est faux, et cette croyance mène à un mauvais entraînement. Gayle Laakmann McDowell insiste dans *Cracking the Coding Interview* : l'examinateur observe un **processus de résolution**, pas seulement une réponse finale.

Les quatre axes évalués sont :

- **La compétence analytique** : comment tu décomposes un problème que tu n'as jamais vu, comment tu explores l'espace des solutions.
- **La connaissance technique** : maîtrise des structures de données et algorithmes fondamentaux.
- **La communication** : ta capacité à penser à voix haute, à clarifier les ambiguïtés, à expliquer un compromis.
- **La rigueur** : cas limites, tests, code propre et correct.

Conséquence pratique : un candidat qui atteint la solution optimale en silence marque souvent MOINS de points qu'un candidat qui verbalise sa démarche, part d'une force brute, l'améliore, et teste son code. **La démarche EST le produit.** Retiens ceci comme fil rouge de tout le cours : tu ne cherches pas seulement à résoudre, tu cherches à montrer COMMENT tu résous.
---SECTION---
HEADING: L'intuition de la complexité : big-O
BODY:
La notation **big-O** décrit comment le temps (ou l'espace) d'un algorithme croît quand la taille de l'entrée `n` grandit. Ce n'est pas une mesure de vitesse en secondes : c'est une mesure de **tendance asymptotique**. On ignore les constantes et les termes dominés parce qu'ils deviennent négligeables quand `n` est grand.

Ainsi `O(2n + 100)` s'écrit `O(n)`, et `O(n² + n)` s'écrit `O(n²)`.

Le classement mental à mémoriser, du meilleur au pire :

```
O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2^n) < O(n!)
```

Quelques repères concrets pour ancrer l'intuition :

- **O(1)** — accès à un index de tableau, lecture d'une table de hachage.
- **O(log n)** — recherche dichotomique : on divise l'espace par deux à chaque étape.
- **O(n)** — un seul parcours de tous les éléments.
- **O(n log n)** — les bons tris (merge sort, heap sort). C'est la borne des tris par comparaison.
- **O(n²)** — deux boucles imbriquées sur la même entrée.
- **O(2^n)** — explorer tous les sous-ensembles ; typique d'une récursion qui se dédouble.

Règle de lecture rapide : **chaque boucle imbriquée sur `n` multiplie**, chaque division par deux répétée donne un `log`. En entretien, annonce toujours la complexité de ta solution, et sépare bien complexité **temporelle** et **spatiale**.
---SECTION---
HEADING: Complexité amortie et pièges d'analyse
BODY:
La complexité **amortie** répond à une question subtile : que se passe-t-il quand une opération est parfois chère mais rarement ? On moyenne le coût sur une longue séquence d'opérations.

L'exemple canonique est le **tableau dynamique** (`ArrayList`, `vector`, `list` Python). Ajouter un élément est en général `O(1)`, mais quand le tableau est plein, il faut allouer un tableau deux fois plus grand et recopier tout : `O(n)`. Pourtant, comme ce doublement devient de plus en plus rare, le coût **amorti** d'un ajout reste `O(1)`. Aziz, Lee et Prakash (*Elements of Programming Interviews*) recommandent d'utiliser ce raisonnement pour justifier pourquoi une insertion « coûteuse » ne dégrade pas la complexité globale.

Pièges d'analyse fréquents à éviter :

- **Deux entrées différentes** : si tu as deux tableaux de tailles `a` et `b`, deux boucles séparées font `O(a + b)`, pas `O(n²). Nomme tes variables distinctement.
- **La récursion cache un coût** : `O(branches^profondeur)`. Un arbre binaire récursif de profondeur `n` donne souvent `O(2^n)`.
- **Les opérations invisibles** : concaténer une chaîne dans une boucle peut être `O(n²)` car chaque concaténation recopie. Slicing, copie de liste, `in` sur une liste : tous cachent un `O(n)`.

Sois précis : `O(a·b)` n'est pas `O(n²)` si `a` et `b` sont indépendants.
---SECTION---
HEADING: Tableaux et listes chaînées
BODY:
Ces deux structures stockent des séquences, mais leurs compromis sont opposés — les comprendre est la base de tout le reste.

Le **tableau** (array) occupe une zone mémoire contiguë. Cela donne un accès par index en `O(1)` (l'adresse se calcule directement), et une excellente localité de cache. En revanche, insérer ou supprimer au milieu force à décaler tous les éléments suivants : `O(n)`.

La **liste chaînée** (linked list) est faite de nœuds dispersés en mémoire, chacun pointant vers le suivant. Insérer ou supprimer un nœud dont on tient déjà la référence est `O(1)` (on rebranche les pointeurs). Mais accéder au i-ème élément exige de parcourir depuis la tête : `O(n)`, et pas de localité de cache.

| Opération | Tableau | Liste chaînée |
|---|---|---|
| Accès par index | O(1) | O(n) |
| Insertion en tête | O(n) | O(1) |
| Insertion en queue | O(1) amorti | O(1) avec pointeur de queue |
| Recherche | O(n) | O(n) |

Astuce d'entretien classique pour les listes chaînées : le **nœud sentinelle** (dummy head). En créant un faux nœud avant la vraie tête, tu évites de traiter séparément le cas « suppression du premier élément », ce qui élimine une source majeure de bugs.

```python
def remove_elements(head, val):
    dummy = ListNode(next=head)   # sentinelle
    prev = dummy
    while prev.next:
        if prev.next.val == val:
            prev.next = prev.next.next   # on saute le nœud
        else:
            prev = prev.next
    return dummy.next
```
---SECTION---
HEADING: Piles et files
BODY:
La **pile** (stack) suit le principe **LIFO** (Last In, First Out) : le dernier élément entré est le premier sorti, comme une pile d'assiettes. Ses opérations `push` et `pop` sont en `O(1)`. La pile est le bon outil dès qu'un problème a une structure de **retour en arrière** ou d'**imbrication** : parenthèses équilibrées, évaluation d'expressions, parcours en profondeur, historique d'annulation.

La **file** (queue) suit le principe **FIFO** (First In, First Out) : le premier entré est le premier sorti, comme une file d'attente. On `enqueue` à l'arrière et on `dequeue` à l'avant, en `O(1)`. La file est l'outil naturel du **parcours en largeur** (BFS) et de tout traitement « dans l'ordre d'arrivée ».

Exemple emblématique — vérifier des parenthèses équilibrées avec une pile :

```python
def is_valid(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in '([{':
            stack.append(c)
        elif c in pairs:
            if not stack or stack.pop() != pairs[c]:
                return False
    return not stack   # vide = tout est refermé
```

Point clé : chaque fois que tu vois « le plus récent élément non traité » ou « imbrication », pense pile. Chaque fois que tu vois « niveau par niveau » ou « ordre d'arrivée », pense file. En Python, `collections.deque` implémente efficacement les deux.
---SECTION---
HEADING: Tables de hachage : le couteau suisse
BODY:
La **table de hachage** (hash map / dictionnaire) associe des clés à des valeurs avec un accès moyen en `O(1)` pour l'insertion, la recherche et la suppression. C'est de loin la structure la plus rentable en entretien : elle transforme d'innombrables problèmes `O(n²)` en `O(n)`.

Le mécanisme : une **fonction de hachage** transforme la clé en un index de tableau. Les collisions (deux clés au même index) se gèrent par chaînage ou adressage ouvert. Le `O(1)` est **amorti et moyen** — dans le pire cas théorique (toutes les clés collisionnent), c'est `O(n)`, mais en pratique on raisonne en `O(1)`.

L'idée stratégique à retenir : **échanger de l'espace contre du temps**. Au lieu de re-parcourir les données pour retrouver une information, tu la stockes une fois pour un accès instantané.

L'exemple archétypal, *Two Sum* : trouver deux nombres dont la somme vaut `target`.

```python
def two_sum(nums, target):
    seen = {}                     # valeur -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:          # O(1) au lieu de re-parcourir
            return [seen[need], i]
        seen[x] = i
    return []
```

La force brute testerait toutes les paires en `O(n²)`. La table de hachage mémorise ce qu'on a déjà vu et cherche le complément en `O(1)`, ramenant le tout à `O(n)`. Dès que tu te demandes « ai-je déjà rencontré X ? » ou « combien de fois apparaît X ? », la table de hachage est ta réponse. Ses cousins, le **`set`** (appartenance) et le **compteur** (fréquences), suivent la même logique.
---SECTION---
HEADING: Arbres et parcours
BODY:
Un **arbre** est une structure hiérarchique de nœuds : une racine, et chaque nœud a des enfants, sans cycle. L'**arbre binaire** limite à deux enfants (gauche/droite). Les arbres modélisent naturellement tout ce qui est hiérarchique : système de fichiers, DOM, arbres de décision.

Deux familles de parcours, à connaître par cœur :

**Parcours en profondeur (DFS)** — on plonge aussi loin que possible avant de remonter. Trois ordres selon le moment où l'on « visite » le nœud :

- **Préfixe** (pre-order) : nœud, puis gauche, puis droite. Utile pour copier un arbre.
- **Infixe** (in-order) : gauche, nœud, droite. Sur un **BST**, il produit les valeurs **triées** — propriété d'or.
- **Suffixe** (post-order) : gauche, droite, puis nœud. Utile pour supprimer/évaluer de bas en haut.

**Parcours en largeur (BFS)** — niveau par niveau, avec une file.

```python
def inorder(root, out):
    if not root:
        return
    inorder(root.left, out)
    out.append(root.val)     # visite entre gauche et droite
    inorder(root.right, out)

def bfs_levels(root):
    from collections import deque
    q, res = deque([root] if root else []), []
    while q:
        level = []
        for _ in range(len(q)):     # fige la taille du niveau
            n = q.popleft()
            level.append(n.val)
            if n.left:  q.append(n.left)
            if n.right: q.append(n.right)
        res.append(level)
    return res
```

Réflexe : « le plus court chemin en nombre d'arêtes » ou « niveau par niveau » → BFS. « Explorer toutes les branches / chemins » → DFS.
---SECTION---
HEADING: Arbres binaires de recherche, tries et tas
BODY:
Ces trois arbres spécialisés reviennent constamment ; chacun exploite une propriété structurelle précise.

### Arbre binaire de recherche (BST)
Invariant : pour chaque nœud, **tout le sous-arbre gauche est inférieur, tout le sous-arbre droit est supérieur**. Cet ordre permet de rechercher, insérer et supprimer en `O(log n)`… **si l'arbre est équilibré**. Déséquilibré (inséré en ordre croissant), il dégénère en liste chaînée : `O(n)`. Les arbres auto-équilibrés (AVL, rouge-noir) garantissent le `O(log n)`. Souviens-toi : le parcours infixe d'un BST donne les éléments triés.

### Trie (arbre préfixe)
Arbre où chaque chemin de la racine épelle un mot, caractère par caractère. Recherche d'un mot de longueur `L` en `O(L)`, indépendamment du nombre de mots stockés. C'est LA structure pour l'autocomplétion, la vérification de préfixes, les dictionnaires.

### Tas (heap)
Arbre binaire complet respectant la **propriété de tas** : dans un min-heap, chaque parent est ≤ ses enfants, donc le minimum est toujours à la racine. Accès au min/max en `O(1)`, insertion et extraction en `O(log n)`. C'est l'implémentation d'une **file de priorité**.

Le tas brille pour les problèmes de type « **top K** » ou « k-ième plus grand ». Pour les `k` plus grands éléments, on maintient un min-heap de taille `k` : `O(n log k)`.

```python
import heapq
def k_largest(nums, k):
    h = nums[:k]
    heapq.heapify(h)              # min-heap de taille k
    for x in nums[k:]:
        if x > h[0]:              # plus grand que le plus petit gardé
            heapq.heapreplace(h, x)
    return h
```
---SECTION---
HEADING: Graphes et leurs parcours
BODY:
Un **graphe** généralise l'arbre : des **sommets** (nœuds) reliés par des **arêtes**, avec possibilité de cycles et de plusieurs chemins entre deux sommets. Il modélise réseaux sociaux, routes, dépendances, états d'un jeu.

Deux représentations :

- **Liste d'adjacence** : chaque sommet pointe vers ses voisins. Compacte pour les graphes creux (peu d'arêtes) — le choix par défaut. Espace `O(V + E)`.
- **Matrice d'adjacence** : une grille `V×V` où `[i][j]` indique une arête. Test d'arête en `O(1)` mais espace `O(V²)` ; réservée aux graphes denses.

Les parcours DFS et BFS s'appliquent, avec une différence cruciale par rapport aux arbres : **il faut marquer les sommets visités** pour éviter les boucles infinies dues aux cycles.

```python
def bfs(graph, start):
    from collections import deque
    visited = {start}             # indispensable : cycles !
    q = deque([start])
    order = []
    while q:
        node = q.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visited.add(nb)
                q.append(nb)
    return order
```

À connaître aussi : **BFS donne le plus court chemin** en nombre d'arêtes dans un graphe non pondéré. Le **tri topologique** ordonne les sommets d'un graphe orienté acyclique (DAG) selon leurs dépendances — indispensable pour l'ordonnancement de tâches. Beaucoup de grilles 2D (labyrinthes, îles) sont des graphes déguisés : chaque case est un sommet, ses voisins orthogonaux ses arêtes.
---SECTION---
HEADING: Récursion et backtracking
BODY:
La **récursion** résout un problème en le réduisant à des instances plus petites du même problème. Toute fonction récursive a deux composants indispensables :

- Un **cas de base** qui arrête la descente (sans lui : boucle infinie, débordement de pile).
- Un **cas récursif** qui se rapproche du cas de base.

L'intuition clé : fais **confiance à la récursion**. Suppose que l'appel sur le sous-problème renvoie la bonne réponse, et concentre-toi seulement sur la façon de combiner. C'est le raisonnement « à l'envers » que McDowell recommande : « si j'ai la solution pour `n-1`, comment en déduire celle pour `n` ? ».

Le **backtracking** est une récursion qui **construit une solution incrémentalement et défait ses choix** quand ils mènent à une impasse. Le patron mental : *choisir → explorer → défaire* (choose / explore / un-choose). C'est la méthode pour énumérer permutations, combinaisons, sous-ensembles, ou résoudre sudoku et N-reines.

```python
def permutations(nums):
    res, path, used = [], [], [False]*len(nums)
    def backtrack():
        if len(path) == len(nums):
            res.append(path[:])          # copie de la solution
            return
        for i, x in enumerate(nums):
            if used[i]:
                continue
            used[i] = True; path.append(x)     # choisir
            backtrack()                        # explorer
            used[i] = False; path.pop()        # défaire
    backtrack()
    return res
```

Le coût du backtracking est souvent exponentiel car il explore un arbre de possibilités ; on l'accélère par **élagage** (pruning) : couper une branche dès qu'on sait qu'elle ne peut aboutir.
---SECTION---
HEADING: Programmation dynamique
BODY:
La **programmation dynamique** (DP) s'applique quand un problème a deux propriétés :

- **Sous-problèmes qui se chevauchent** : les mêmes calculs reviennent plusieurs fois (contrairement à « diviser pour régner » où ils sont distincts).
- **Sous-structure optimale** : la solution optimale se compose de solutions optimales de sous-problèmes.

L'idée fondatrice : **calculer chaque sous-problème une seule fois et mémoriser le résultat**. On échange de l'espace contre du temps, transformant souvent un `O(2^n)` récursif en `O(n)` ou `O(n²)`.

Deux styles complémentaires :

- **Top-down (mémoïsation)** : on écrit la récursion naturelle, et on met en cache chaque résultat. Facile à dériver d'une solution brute récursive.
- **Bottom-up (tabulation)** : on remplit un tableau des petits sous-problèmes vers les grands, sans récursion.

Fibonacci illustre le passage de l'exponentiel au linéaire :

```python
def fib(n):
    memo = {0: 0, 1: 1}
    def f(k):
        if k in memo:              # déjà calculé ?
            return memo[k]
        memo[k] = f(k-1) + f(k-2)  # on mémorise
        return memo[k]
    return f(n)
```

La méthode pour aborder un problème de DP en entretien : (1) définis l'**état** (« que représente `dp[i]` ? »), (2) trouve la **récurrence** qui relie un état aux précédents, (3) fixe les **cas de base**, (4) détermine l'**ordre de remplissage**. Souvent on peut ensuite **optimiser l'espace** en ne gardant que les dernières lignes du tableau. Reconnaître un problème de DP est le vrai défi : cherche les mots « nombre de façons », « minimum/maximum sur des choix », « peut-on atteindre ».
---SECTION---
HEADING: Tri et recherche
BODY:
Tu implémenteras rarement un tri de zéro en entretien, mais tu dois en connaître les compromis et savoir quand trier est le bon premier geste.

Les tris `O(n log n)` à connaître :

- **Merge sort** : divise, trie récursivement, fusionne. Stable, `O(n log n)` garanti, mais `O(n)` d'espace supplémentaire. Idéal pour les listes chaînées et le tri externe.
- **Quick sort** : partitionne autour d'un pivot. `O(n log n)` en moyenne, en place, mais `O(n²)` dans le pire cas (pivot mal choisi). Souvent le plus rapide en pratique.
- **Heap sort** : `O(n log n)` garanti, en place, non stable.

Aucun tri par comparaison ne peut battre `O(n log n)` — c'est une **borne inférieure prouvée**. Mais si les données ont une structure (petits entiers bornés), les tris **non comparatifs** comme counting sort ou radix sort atteignent `O(n)`.

La **recherche dichotomique** (binary search) est le compagnon du tri : sur un tableau **trié**, elle trouve un élément en `O(log n)` en éliminant la moitié de l'espace à chaque étape.

```python
def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2         # évite le débordement dans d'autres langages
        if a[mid] == target:
            return mid
        elif a[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```

Idée puissante et sous-estimée : la recherche dichotomique ne sert pas qu'à chercher dans un tableau. On peut **binary-searcher sur une réponse** (« quelle est la plus petite capacité qui marche ? ») dès que la propriété testée est monotone. Réflexe général : si l'entrée est triée ou peut l'être utilement, `O(n log n)` de tri débloque souvent une solution simple.
---SECTION---
HEADING: Manipulation de bits
BODY:
Les opérations bit à bit traitent les entiers comme des suites de bits. Elles sont rapides, économes, et débloquent des solutions élégantes. Les opérateurs fondamentaux :

- **AND (`&`)** : 1 si les deux bits sont 1. Sert à **masquer** ou tester un bit.
- **OR (`|`)** : 1 si au moins un bit est 1. Sert à **activer** un bit.
- **XOR (`^`)** : 1 si les bits diffèrent. La star de l'entretien.
- **NOT (`~`)** : inverse tous les bits.
- **Décalages (`<<`, `>>`)** : `x << k` multiplie par `2^k`, `x >> k` divise par `2^k`.

Les propriétés du **XOR** en font un outil magique : `x ^ x = 0`, `x ^ 0 = x`, et il est commutatif. Conséquence : si tous les nombres d'un tableau apparaissent deux fois sauf un, XOR-er tout le tableau annule les paires et laisse le solitaire — en `O(n)` temps et `O(1)` espace, sans structure auxiliaire.

```python
def single_number(nums):
    result = 0
    for x in nums:
        result ^= x        # les paires s'annulent
    return result
```

Quelques idiomes utiles à reconnaître :

- `x & 1` teste la parité (bit de poids faible).
- `x & (x - 1)` **efface le bit à 1 le plus à droite** — compter les bits à 1 en boucle.
- `x & (-x)` **isole** ce même bit le plus à droite.
- `x & (1 << k)` teste si le k-ième bit est à 1.

N'abuse pas des bits : n'y recours que si le problème le suggère (ensembles compacts, parité, unicité), sinon la lisibilité prime.
---SECTION---
HEADING: Les patterns gagnants
BODY:
La plupart des problèmes d'entretien sont des variations sur une poignée de **patterns**. Les reconnaître, c'est passer de « je bloque » à « je sais quelle famille attaquer ». Voici les plus rentables.

- **Two pointers (deux pointeurs)** : deux indices parcourent le tableau, souvent en sens opposés (extrémités qui convergent) ou à vitesses différentes. Idéal sur tableau **trié** : paire de somme cible, palindrome, inversion en place. Transforme du `O(n²)` en `O(n)`.
- **Sliding window (fenêtre glissante)** : une fenêtre `[gauche, droite]` qui s'étend et se contracte pour maintenir une propriété. LE pattern pour « plus longue/plus courte sous-chaîne/sous-tableau vérifiant une condition ». `O(n)` là où la brute serait `O(n²)`.
- **Fast & slow pointers (lièvre et tortue)** : deux pointeurs à vitesses 1 et 2 sur une liste chaînée. Détecte un **cycle** (ils se rencontrent), trouve le **milieu**, ou le n-ième depuis la fin. `O(1)` d'espace.
- **Prefix sum (somme préfixe)** : pré-calcule les sommes cumulées pour répondre à « somme du sous-tableau `[i, j]` » en `O(1)`. Combiné à une table de hachage, il compte les sous-tableaux de somme donnée en `O(n)`.
- **Union-Find (ensembles disjoints)** : regroupe des éléments en composantes et teste « sont-ils connectés ? » en quasi-`O(1)`. Roi des problèmes de connectivité, de composantes connexes, de détection de cycle non orienté.
- **Monotonic stack (pile monotone)** : une pile qui garde ses éléments ordonnés. Résout « prochain élément plus grand/plus petit » en `O(n)`.
- **Intervalles** : trier par début, puis fusionner/balayer. Base des problèmes de réunions, de fusion de plages, de chevauchements.

Illustration de la fenêtre glissante — plus longue sous-chaîne sans caractère répété :

```python
def longest_unique(s):
    seen = {}
    left = best = 0
    for right, c in enumerate(s):
        if c in seen and seen[c] >= left:
            left = seen[c] + 1       # on rétracte la fenêtre
        seen[c] = right
        best = max(best, right - left + 1)
    return best
```
---SECTION---
HEADING: De la force brute à l'optimal
BODY:
La compétence centrale de l'entretien n'est pas de trouver l'optimal du premier coup, mais de **progresser méthodiquement**. McDowell et les auteurs d'*EPI* décrivent la même trajectoire.

**1. Comprendre et clarifier.** Reformule le problème avec tes mots. Pose des questions : taille de l'entrée ? doublons possibles ? entrée triée ? valeurs négatives ? Que renvoyer si vide ? Ces questions ne sont pas une faiblesse : elles montrent de la rigueur et cadrent le problème.

**2. Exemple à la main.** Déroule un cas concret et de taille raisonnable sur le tableau. Il révèle la structure du problème et te sert ensuite de test.

**3. Force brute d'abord.** Énonce une solution correcte même naïve, et annonce sa complexité. Avoir une solution correcte qui tourne bat une solution optimale imaginaire. Cela débloque aussi la réflexion.

**4. Optimiser en identifiant le goulot.** Où passe le temps ? Souvent un travail répété. Les leviers récurrents :
- **BUD** (*Bottlenecks, Unnecessary work, Duplicated work*), l'acronyme de McDowell.
- Échanger espace contre temps (table de hachage).
- Trier pour débloquer two pointers ou binary search.
- Pré-calculer (prefix sum).
- Reconnaître un pattern de la section précédente.

**5. Vérifier avant de coder.** Valide l'approche à voix haute, puis écris un code propre.

**6. Tester.** Déroule ton code sur ton exemple, puis sur les cas limites.

Ne saute jamais directement à l'optimal en silence : le chemin verbalisé est ce qui est noté.
---SECTION---
HEADING: Cas limites et validation
BODY:
Un code qui marche sur l'exemple nominal mais plante sur une entrée vide échoue à l'entretien. Le traitement des **cas limites** distingue le candidat rigoureux. Prends l'habitude de dérouler systématiquement cette liste avant de te déclarer satisfait :

- **Entrée vide** : tableau `[]`, chaîne `""`, liste chaînée `null`. Que renvoie ton code ?
- **Un seul élément** : beaucoup de logiques à deux pointeurs se comportent mal sur un singleton.
- **Doublons** : le problème les autorise-t-il ? les gères-tu correctement ?
- **Valeurs extrêmes** : négatifs, zéro, dépassement d'entier (overflow), très grandes entrées.
- **Déjà trié / trié à l'envers** : pire cas de quick sort, meilleur cas d'autres.
- **Tous identiques** : casse souvent les partitions et les fenêtres.
- **Frontières d'indices** : le premier et le dernier élément, les accès `i-1` et `i+1`.

Deux techniques défensives fiables :

- La **sentinelle** (dummy node vue plus tôt) supprime le cas spécial de la tête d'une liste.
- Les **assertions/invariants** : énonce ce qui doit rester vrai à chaque itération (« `left` pointe toujours sur un caractère non répété ») ; c'est un puissant détecteur de bugs.

Enfin, **teste à voix haute**. Reprends ton exemple initial, puis un cas limite, et exécute ton code ligne à ligne comme le ferait la machine. Trouver et corriger un bug toi-même, avant que l'examinateur ne le signale, est un signal extrêmement positif. La correction n'est pas un détail : c'est la moitié de l'évaluation.
===END===
