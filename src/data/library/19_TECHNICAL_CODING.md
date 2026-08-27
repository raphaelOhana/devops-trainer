# Rester technique en tant que CTO : raisonner sur le code, pas seulement l'écrire

Tu écris du code vite, souvent avec un LLM à tes côtés. Ce chapitre ne cherche pas à te réapprendre à taper des lignes — tu sais faire. Il cherche à **solidifier le raisonnement sous le code** : pourquoi une structure de données plutôt qu'une autre, où se cache le coût, ce qu'une API bien conçue promet vraiment, et ce qui se passe réellement quand tu appelles un modèle. L'objectif est que tu puisses lire une code review, un incident de prod ou une PR d'un junior et voir immédiatement *où est le risque*, sans avoir à dérouler l'exécution ligne à ligne.

---

## 1. Pourquoi un CTO doit encore raisonner sur le code

Un CTO ne code pas huit heures par jour. Mais il décide, arbitre et débogue — et ces trois activités reposent sur une capacité : **estimer le coût et la correction d'un bout de code sans l'exécuter**.

Concrètement, cette capacité sert dans quatre moments :

- **La code review.** Repérer le `O(N²)` caché — la double boucle innocente, la requête dans une boucle, le `array.insert(0, x)` répété — qui passe les tests sur 100 lignes et tue la prod sur 10 millions.
- **L'architecture.** Choisir la bonne structure. « HashMap ou tableau ici ? » n'est pas une question de goût : c'est un arbitrage entre temps de lookup et coût mémoire qui se paie tous les jours en prod.
- **Le recrutement.** Évaluer si une solution proposée est *optimale* ou juste *fonctionnelle*. Les deux marchent en démo ; une seule tient la charge.
- **Le debugging.** Quand l'API rame, savoir *où* regarder : l'algorithme, la base, le réseau, ou la concurrence ? Sans modèle mental du coût, on tâtonne.

Le fil rouge de tout ce qui suit : **chaque décision technique est un arbitrage** (*trade-off*). Il n'y a pas de « meilleure » structure ni de « meilleur » algorithme dans l'absolu — seulement des choix adaptés à une contrainte. Le travail du CTO est de nommer la contrainte, puis de choisir en connaissance de cause.

---

## 2. La complexité : Big-O comme boussole

### Pourquoi ça compte

La notation **Big-O** décrit comment le coût d'un algorithme grandit *quand la taille de l'entrée grandit*. Elle ignore les constantes et les détails de machine, volontairement : ce qui t'intéresse en tant que décideur, ce n'est pas « 3 ms sur mon laptop », c'est « qu'est-ce qui se passe quand `N` passe de 1 000 à 10 millions ». Un algorithme deux fois plus lent mais de meilleure classe de complexité gagnera toujours à l'échelle. La constante flatte en démo ; la classe décide en prod.

### L'intuition, par paliers

Voici les cinq classes que tu croiseras 95 % du temps, de la meilleure à la pire, chacune avec un exemple correct et vérifié.

**`O(1)` — temps constant.** Le coût ne dépend pas de la taille. L'accès par clé ou par index en est l'archétype.

```python
def get_first_element(arr):
    return arr[0]          # 1 opération, que arr ait 10 ou 10 millions d'éléments
```
Lookup dans un dictionnaire (`dict[key]`), accès indexé (`arr[5]`), `push`/`pop` sur une pile : tous `O(1)`. C'est le graal, mais il se paie souvent en mémoire (voir la HashMap plus bas).

**`O(log N)` — temps logarithmique.** À chaque étape, on élimine la moitié de l'espace de recherche. Doubler `N` n'ajoute qu'*une* opération. Un million d'éléments se résout en ~20 comparaisons.

```python
def binary_search(arr, target):
    """Le tableau doit être trié au préalable."""
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```
La condition d'entrée — **le tableau doit être trié** — est la clé. C'est exactement le mécanisme d'un index de base de données (B-Tree) : la DB maintient les données ordonnées pour pouvoir chercher en logarithmique plutôt que de scanner toute la table. Quand une requête est lente, la première question est souvent « y a-t-il un index sur cette colonne ? ».

**`O(N)` — temps linéaire.** On doit regarder chaque élément une fois. Inévitable quand la réponse dépend de *toutes* les données.

```python
def find_max(arr):
    max_val = arr[0]
    for num in arr:
        if num > max_val:
            max_val = num
    return max_val
```
Parcourir une liste, chercher dans une chaîne, agréger : c'est le coût de référence, parfaitement acceptable.

**`O(N log N)` — temps linéarithmique.** Le plafond pratique d'un bon tri par comparaison. C'est ce que fait `sorted()` en Python (Timsort). Le tri fusion (*merge sort*) l'illustre par « diviser pour régner » : on coupe en deux récursivement (`log N` niveaux), et à chaque niveau on fusionne en `O(N)`.

```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    """Fusionne deux listes déjà triées en une seule liste triée."""
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])     # reste de left (déjà trié)
    result.extend(right[j:])    # reste de right (déjà trié)
    return result
```
Le `merge` est le cœur : deux pointeurs qui avancent en parallèle sur deux listes triées, en prenant à chaque fois le plus petit. Une fois l'une des deux épuisée, on colle le reliquat de l'autre — d'où les deux `extend` finaux, indispensables à la correction.

**`O(N²)` — temps quadratique.** Le piège. Une boucle imbriquée : pour `N = 10 000`, c'est 100 millions d'opérations. À éviter dès que `N` dépasse quelques milliers.

```python
def has_duplicate_naive(arr):        # O(N²) — mauvais
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                return True
    return False

def has_duplicate_good(arr):         # O(N) — bon
    seen = set()
    for num in arr:
        if num in seen:
            return True
        seen.add(num)
    return False
```
Ces deux fonctions font *la même chose*. La seconde échange **du temps contre de la mémoire** : elle stocke un `set` pour transformer une recherche `O(N)` (« est-ce que je l'ai déjà vu ? ») en `O(1)`. C'est le trade-off le plus courant de tout le métier — et le réflexe à avoir en code review dès que tu vois deux boucles imbriquées.

### L'antisèche à garder en tête

En Python, certaines opérations trompent parce qu'elles ont l'air anodines :

| Opération | Coût | Piège |
|---|---|---|
| `dict[key]`, `key in dict` | `O(1)` moyen | — |
| `arr[i]`, `arr.append(x)`, `arr.pop()` | `O(1)` (append amorti) | — |
| `arr.insert(0, x)`, `arr.pop(0)` | **`O(N)`** | Décale tout le tableau ! |
| `x in set` | `O(1)` moyen | vs `x in list` qui est `O(N)` |
| `sorted(arr)` / `arr.sort()` | `O(N log N)` | — |

Les deux lignes à retenir : **insérer ou retirer en tête d'un tableau est linéaire** (chaque élément est décalé) — si tu as besoin de ça, utilise une `deque`. Et **tester l'appartenance dans une liste est linéaire**, dans un `set` c'est constant. Un `if x in ma_liste` au fond d'une boucle est un `O(N²)` déguisé.

### Le trade-off

Big-O est un guide, pas un dogme. Pour `N` petit et stable, un `O(N²)` lisible bat un `O(N log N)` alambiqué : moins de bugs, moins de coût de maintenance. La complexité gagne à l'échelle et sur les chemins chauds ; ailleurs, la clarté prime. Le réflexe n'est pas « optimiser partout », c'est « savoir *où* la complexité fera mal, et n'optimiser que là ».

---

## 3. Les structures de données qui reviennent

Cinq structures couvrent l'immense majorité des besoins. Les connaître, c'est surtout savoir *quand* les dégainer et *ce qu'elles coûtent*.

### La HashMap (dict) — la structure reine

**Pourquoi.** Le lookup par clé en `O(1)` est le fondement du caching, du comptage et de la déduplication. Si une seule structure devait rester, ce serait celle-là.

```python
class UserCache:
    def __init__(self):
        self.cache = {}                       # user_id -> user_data

    def get_user(self, user_id):
        return self.cache.get(user_id)        # O(1)

    def set_user(self, user_id, user_data):
        self.cache[user_id] = user_data       # O(1)

    def delete_user(self, user_id):
        self.cache.pop(user_id, None)         # O(1), sans lever d'erreur si absent
```

Le second usage massif, c'est **le comptage** — un motif qui revient sans cesse (fréquence de mots, d'événements, d'erreurs) :

```python
def count_words(text):
    word_count = {}
    for word in text.split():
        word_count[word] = word_count.get(word, 0) + 1
    return word_count

from collections import Counter
def count_words_better(text):
    return Counter(text.split())              # même résultat, plus idiomatique
```

**Trade-off.** Le `O(1)` est *moyen*, pas garanti : il suppose une bonne fonction de hachage. En cas de collisions pathologiques, on dégrade. Et la HashMap consomme plus de mémoire qu'un tableau, et ne conserve pas d'ordre trié. Tu paies de l'espace pour du temps — presque toujours un bon échange.

### Le Set — unicité et appartenance

Un `set` est une HashMap sans valeurs : appartenance et déduplication en `O(1)`.

```python
def deduplicate_emails(email_list):
    """Normalise (minuscules) puis déduplique en préservant l'ordre."""
    seen = set()
    unique = []
    for email in email_list:
        normalized = email.lower().strip()
        if normalized not in seen:
            seen.add(normalized)
            unique.append(email)
    return unique
```
`list(set(arr))` déduplique en une ligne mais *perd l'ordre* ; la version ci-dessus le préserve, ce qui compte souvent côté produit. L'intersection de deux ensembles (`set(a) & set(b)`) donne les éléments communs en temps linéaire plutôt que quadratique.

### Pile (LIFO) et File (FIFO)

**La pile** (*stack*, dernier entré / premier sorti) modélise tout ce qui « revient en arrière » : undo/redo, historique de navigation, parcours en profondeur, évaluation d'expressions. En Python, une simple liste avec `append`/`pop` suffit (les deux sont `O(1)`).

**La file** (*queue*, premier entré / premier sorti) modélise le traitement dans l'ordre d'arrivée : jobs, workflows n8n, parcours en largeur. Point crucial : **n'utilise pas une liste** pour une file, car `pop(0)` est `O(N)`. Utilise `collections.deque`, dont le `popleft` est `O(1)`.

```python
from collections import deque

class TaskQueue:
    def __init__(self):
        self.queue = deque()
    def enqueue(self, task):
        self.queue.append(task)               # O(1)
    def dequeue(self):
        return self.queue.popleft() if self.queue else None   # O(1)
```

La file est aussi le moteur du **parcours en largeur** (BFS) d'un arbre ou d'un graphe — on visite niveau par niveau :

```python
def bfs_tree(root):
    if not root:
        return []
    result = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        result.append(node.val)
        if node.left:
            queue.append(node.left)
        if node.right:
            queue.append(node.right)
    return result
```

### Le tas / file de priorité (heap)

**Pourquoi.** Quand tu veux toujours extraire le min (ou le max) efficacement — un ordonnanceur de jobs, du rate limiting, un « top K » — le tas donne insertion et extraction en `O(log N)`, sans jamais trier l'ensemble.

```python
import heapq

class PriorityTaskQueue:
    def __init__(self):
        self.heap = []
    def add_task(self, priority, task):
        heapq.heappush(self.heap, (priority, task))   # O(log N)
    def get_next_task(self):
        return heapq.heappop(self.heap)[1] if self.heap else None   # O(log N)
```
Le `heapq` de Python est un *min-heap* : il rend d'abord la plus petite priorité. Cas d'usage analytique classique, le **top K** — les K éléments les plus fréquents — se fait proprement avec `Counter` :

```python
from collections import Counter
def top_k_frequent(nums, k):
    return [num for num, _ in Counter(nums).most_common(k)]
```
L'intérêt du tas apparaît quand `N` est grand et `K` petit : trouver les 10 plus gros parmi 10 millions ne nécessite pas de trier les 10 millions (`O(N log N)`), un tas suffit en `O(N log K)`.

### Deux patterns d'algorithme à reconnaître

Au-delà des structures, deux *motifs* transforment régulièrement un `O(N²)` en `O(N)`.

**Deux pointeurs** (*two pointers*), sur une donnée triée : au lieu de tester toutes les paires, deux curseurs convergent depuis les extrémités.

```python
def two_sum_sorted(arr, target):
    """Tableau TRIÉ : trouve deux nombres dont la somme vaut target. O(N)."""
    left, right = 0, len(arr) - 1
    while left < right:
        current_sum = arr[left] + arr[right]
        if current_sum == target:
            return [left, right]
        elif current_sum < target:
            left += 1          # somme trop petite -> augmenter la borne basse
        else:
            right -= 1         # somme trop grande -> baisser la borne haute
    return None
```

**Fenêtre glissante** (*sliding window*), pour les problèmes de sous-chaîne / sous-tableau contigu. On maintient une fenêtre `[start, end]` qu'on étend et rétracte, en un seul passage.

```python
def longest_substring_no_repeat(s):
    """Plus longue sous-chaîne sans caractère répété. O(N)."""
    char_index = {}
    max_length = 0
    start = 0
    for end, char in enumerate(s):
        if char in char_index and char_index[char] >= start:
            start = char_index[char] + 1     # on saute juste après la précédente occurrence
        char_index[char] = end
        max_length = max(max_length, end - start + 1)
    return max_length
# "abcabcbb" -> 3 ("abc") ; "bbbbb" -> 1 ("b")
```
La subtilité correcte : la condition `char_index[char] >= start` évite de reculer `start` sur une occurrence *hors* de la fenêtre courante. C'est le genre de détail où une réécriture rapide par un LLM peut introduire un bug silencieux — d'où l'intérêt de comprendre l'invariant, pas seulement le résultat sur un exemple.

---

## 4. Concurrence : l'event loop, l'asynchrone et les courses

### Pourquoi ça compte pour toi

La plupart des bugs de prod *pénibles* ne sont pas algorithmiques : ce sont des bugs de **concurrence**. Ils ne se reproduisent pas en local, dépendent du timing, et survivent aux tests. En tant qu'ancien chercheur sécurité, tu connais la famille — TOCTOU, *race conditions*, réentrance : la même logique, transposée du kernel à l'API web.

### L'intuition : un seul thread, mais non bloquant

Node.js (comme le JavaScript du navigateur) tourne sur **un seul thread**, piloté par une **boucle d'événements** (*event loop*). La clé : les opérations d'entrée/sortie (réseau, disque, DB) sont *non bloquantes*. Quand tu fais un `await fetch(...)`, le thread ne reste pas planté à attendre la réponse — il rend la main à la boucle, qui exécute autre chose, et reprend ta fonction quand la réponse arrive.

C'est pourquoi un serveur Node à un seul thread encaisse des milliers de connexions simultanées : il ne passe presque pas de temps *à calculer*, il passe son temps *à attendre des I/O*, et pendant ces attentes il sert d'autres requêtes. Le corollaire, souvent oublié : **un calcul CPU lourd et synchrone bloque tout le monde**. Une boucle de tri sur un gros tableau au milieu d'un handler gèle toutes les autres requêtes le temps du calcul. Le CPU-bound se délègue (worker threads, autre service) ; l'event loop est fait pour l'I/O-bound.

### Séquentiel vs parallèle

Une erreur de perf très répandue : enchaîner des `await` indépendants en série alors qu'ils pourraient partir ensemble.

```javascript
// Lent : 3 allers-retours en série (~300 ms si chacun fait 100 ms)
const user    = await getUser(id);
const orders  = await getOrders(id);
const invoices = await getInvoices(id);

// Rapide : les 3 partent en même temps (~100 ms, le temps du plus lent)
const [user, orders, invoices] = await Promise.all([
  getUser(id),
  getOrders(id),
  getInvoices(id),
]);
```
`Promise.all` lance les trois promesses immédiatement puis attend qu'elles soient toutes résolues. Le gain est réel dès que les appels sont indépendants. Attention à la contrepartie : `Promise.all` **rejette dès la première erreur** (si un appel échoue, tu perds les autres résultats) et il ne borne pas le parallélisme — lancer 10 000 requêtes d'un coup peut noyer la base. Quand la tolérance aux erreurs partielles compte, `Promise.allSettled` renvoie le statut de chacune sans tout faire échouer.

### La course (race condition)

Même sur un seul thread, l'asynchrone crée des courses. Le motif dangereux est le **lire-modifier-écrire** entrecoupé d'un `await` :

```javascript
// BUGUÉ : deux requêtes concurrentes peuvent lire le même solde
async function withdraw(accountId, amount) {
  const account = await db.getAccount(accountId);   // (A) lecture
  if (account.balance >= amount) {
    account.balance -= amount;
    await db.saveAccount(account);                  // (B) écriture
  }
}
```
Si deux retraits arrivent en même temps, tous deux exécutent (A) avant que l'un ait écrit (B) : ils lisent le même solde, le valident, et écrivent chacun leur version. Un des deux retraits « disparaît » — le compte passe en négatif. Le trou est exactement entre la vérification et l'écriture (le classique *time-of-check to time-of-use*).

Le correctif n'est pas dans le code applicatif mais dans la **garantie d'atomicité** : déléguer l'invariant à la couche qui sait sérialiser. Soit une opération atomique en base :

```sql
UPDATE accounts SET balance = balance - $1
WHERE id = $2 AND balance >= $1;   -- 0 ligne modifiée = solde insuffisant
```
Soit une transaction avec le bon niveau d'isolation, soit un verrou. La leçon durable : **ne raisonne jamais sur la correction d'un lire-modifier-écrire concurrent au niveau applicatif** ; pousse l'invariant vers une primitive atomique (contrainte SQL, `UPDATE` conditionnel, `compare-and-swap`).

**Trade-off.** La sérialisation stricte (verrous, isolation forte) coûte du débit et peut créer des interblocages ; le parallélisme optimiste maximise le débit mais exige de détecter et rejouer les conflits. Le bon niveau dépend de la valeur de l'invariant : un solde bancaire mérite la sécurité, un compteur de vues tolère l'approximation.

---

## 5. Concevoir une API : HTTP, REST et leurs promesses

### Pourquoi ça compte

L'API est le contrat entre tes services et le monde. Un contrat mal posé se paie longtemps : clients qui retentent au mauvais moment, doublons, comportements imprévisibles sous erreur réseau. Les conventions HTTP/REST ne sont pas de la décoration — elles encodent des *promesses de comportement* que tout l'écosystème (proxies, caches, navigateurs, SDK) tient pour acquises.

### Les verbes et leurs garanties

La promesse centrale est l'**idempotence** : rejouer la même requête produit le même état final. Elle est vitale parce que le réseau *échoue* — un client qui n'a pas reçu la réponse va retenter, et le comportement du retry dépend du verbe.

- **GET** — lecture. *Sûr* (aucun effet de bord) et *idempotent*. Cacheable.
- **POST** — création. **Ni sûr, ni idempotent** : deux POST créent deux ressources. C'est le verbe où un retry naïf crée des doublons.
- **PUT** — remplacement complet. *Idempotent* : remplacer par la même valeur deux fois donne le même résultat.
- **PATCH** — mise à jour partielle. Idempotent selon le contenu du patch.
- **DELETE** — suppression. *Idempotent* : supprimer deux fois laisse la ressource supprimée.

Le design REST déroule ces verbes sur des ressources, avec des URL qui nomment des *choses* (noms), pas des *actions* (verbes) :

```
GET    /api/restaurants        -> liste
POST   /api/restaurants        -> crée
GET    /api/restaurants/:id    -> lit un
PUT    /api/restaurants/:id    -> remplace
PATCH  /api/restaurants/:id    -> modifie partiellement
DELETE /api/restaurants/:id    -> supprime
GET    /api/restaurants/:id/orders   -> ressources imbriquées
```

### Les codes de statut qui portent du sens

Le code de statut n'est pas cosmétique : c'est lui que lisent les clients, les monitors et les mécanismes de retry. Trois familles à distinguer nettement.

- **2xx — succès.** `200` OK, `201` Created (retour d'un POST), `204` No Content (succès sans corps, typique d'un DELETE).
- **4xx — erreur du client.** Rejouer à l'identique ne changera rien. `400` requête malformée, `401` non authentifié (*qui es-tu ?*), `403` authentifié mais non autorisé (*je sais qui tu es, tu n'as pas le droit*), `404` introuvable, `409` conflit (doublon), `422` validation échouée, `429` rate limit atteint.
- **5xx — erreur du serveur.** Le client n'y est pour rien ; retenter *peut* marcher. `500` bug serveur, `502`/`503`/`504` problèmes d'upstream ou de disponibilité.

Cette frontière **4xx / 5xx** est celle qui pilote la logique de retry : on retente les 5xx (transitoires), jamais les 4xx (rejouer une requête invalide reste invalide).

### Le serveur, proprement

Un handler CRUD correct fait trois choses au-delà de la logique métier : il **valide** l'entrée, il **paramètre** ses requêtes SQL (jamais de concaténation — c'est ta corde sensible : l'injection SQL vient toujours d'un paramètre interpolé dans la chaîne), et il **mappe les erreurs** sur le bon statut.

```javascript
// POST /api/restaurants — créer
app.post('/api/restaurants', async (req, res) => {
  const { name, cuisine, address } = req.body;

  // 1. Validation -> 400 si invalide
  if (!name || !cuisine) {
    return res.status(400).json({ error: 'Name and cuisine are required' });
  }

  try {
    // 2. Requête PARAMÉTRÉE ($1, $2...) : pas d'injection SQL
    const result = await pool.query(
      `INSERT INTO restaurants (name, cuisine, address, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [name, cuisine, address]
    );
    // 3. 201 + la ressource créée
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);                  // on logue le détail côté serveur...
    res.status(500).json({ error: 'Internal server error' });  // ...pas au client
  }
});
```
Note le dernier point, réflexe sécurité : **on logue le détail de l'erreur côté serveur, on ne le renvoie jamais au client**. Un message d'exception brut fuit des noms de tables, des chemins, parfois des secrets. Le client reçoit un `500` générique.

L'authentification se factorise en **middleware** — une fonction qui s'exécute avant le handler, vérifie le jeton, et attache l'identité à la requête (ou coupe court en `401`) :

```javascript
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];  // "Bearer <token>"
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);  // vérifie signature + expiration
    next();                                                 // route protégée : on continue
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/me', authMiddleware, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, name FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(result.rows[0]);
});
```

### Retenter sans se tirer une balle dans le pied

Puisque le réseau échoue et que seuls les 5xx méritent un retry, la logique de retry encode exactement cette frontière — avec un **backoff exponentiel** pour ne pas marteler un serveur déjà à genoux :

```javascript
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;                    // 2xx : succès
      if (response.status >= 400 && response.status < 500) // 4xx : inutile de retenter
        throw new Error(`Client error: ${response.status}`);
      // 5xx : on tombera dans le backoff ci-dessous
    } catch (error) {
      if (attempt === retries - 1) throw error;            // dernier essai : on propage
    }
    // Backoff exponentiel : 1s, 2s, 4s...
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error(`Failed after ${retries} retries`);
}
```
Un raffinement de prod qu'il vaut la peine de connaître : le *jitter*, un aléa ajouté au délai, pour éviter que mille clients qui ont échoué en même temps ne retentent tous *exactement* à la même seconde (le « troupeau tonitruant »).

### CORS, en un mot

Le navigateur bloque par défaut les requêtes vers une *origine* différente (schéma + domaine + port). Ce n'est pas ton serveur qui refuse : c'est le navigateur qui applique la **same-origin policy**. Le serveur *autorise* explicitement certaines origines via des en-têtes `Access-Control-Allow-*`. Point de vigilance sécurité : `Access-Control-Allow-Origin: *` combiné à `credentials: true` est une erreur classique — n'ouvre les origines qu'à une liste blanche quand des cookies sont en jeu.

### Trade-off

REST est un ensemble de *conventions*, pas une loi. Sa force est l'universalité : proxies, caches et SDK comprennent GET/POST/statuts sans configuration. Sa limite apparaît sur les besoins où il force du sur- ou sous-fetching (plusieurs allers-retours pour composer un écran) — c'est le terrain de GraphQL ou du RPC. Le bon défaut reste REST ; on en dévie quand le coût des allers-retours devient le goulot, pas par mode.

---

## 6. Intégrer un LLM proprement

Tu écris ce code vite. Cette section vise donc surtout le *pourquoi* : ce qui se passe sous l'appel, pour que tu saches où sont les coûts, les limites et les pièges.

### Ce qu'un LLM fait réellement

Un LLM de type GPT est un **Transformer decoder-only entraîné à prédire le prochain token**. Deux idées suffisent à raisonner juste sur son comportement.

D'abord, **il est autorégressif** : il génère un token à la fois, chaque token dépendant de tous les précédents, puis reboucle. C'est pourquoi la latence croît avec la longueur de la sortie (chaque token est une passe du modèle), et pourquoi le *streaming* existe — on t'envoie les tokens au fil de l'eau plutôt que d'attendre la fin.

Ensuite, **le mécanisme d'attention** : pour produire chaque token, le modèle « regarde » tous les tokens du contexte et pondère leur importance. Dans « *l'animal n'a pas traversé la rue parce qu'**il** était trop fatigué* », l'attention permet de rattacher « il » à « animal » plutôt qu'à « rue ». C'est ce qui a remplacé les RNN/LSTM séquentiels : l'attention se calcule en parallèle sur toute la séquence, d'où l'entraînement à grande échelle.

Deux conséquences pratiques directes. Le texte est d'abord découpé en **tokens** par un tokenizer sous-mots (BPE) — un compromis entre le niveau mot (vocabulaire ingérable, aucun mot nouveau) et le niveau caractère (séquences trop longues). Et surtout : **tu paies au token, en entrée comme en sortie**. Tout le raisonnement de coût qui suit découle de là. Sur les tailles de modèle, reste précis : GPT-3 est documenté à 175 milliards de paramètres ; pour **GPT-4, le nombre de paramètres n'a pas été divulgué officiellement par OpenAI** — méfie-toi des chiffres qui circulent.

Enfin, un mot sur l'entraînement, utile pour situer ce que tu peux et ne peux pas attendre du modèle. Le **pré-entraînement** (prédire le prochain token sur un corpus massif) donne le savoir et le raisonnement bruts, pour un coût de calcul énorme. Le **fine-tuning** supervisé apprend à suivre des instructions sur un jeu curé. Le **RLHF** (apprentissage par renforcement sur préférences humaines) aligne les réponses sur ce que des évaluateurs jugent utile et sûr — c'est l'étape qui transforme un modèle « qui complète du texte » en assistant conversationnel.

### L'appel de base (SDK moderne)

L'API se structure autour d'une liste de **messages** avec des rôles (`system` pour le cadrage, `user` pour la demande) :

```python
from openai import OpenAI

client = OpenAI(api_key="sk-...")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is the capital of France?"}
    ],
    temperature=0.7,   # 0 = déterministe, 1 = créatif
    max_tokens=100,
)

answer = response.choices[0].message.content   # "The capital of France is Paris."
```
Le paramètre **`temperature`** est le levier le plus mal compris : à 0, la sortie est quasi déterministe (utile pour de l'extraction structurée, où tu veux de la reproductibilité) ; plus haut, plus de variété (utile pour de la rédaction). `max_tokens` borne la sortie — donc le coût et la latence.

### Le function calling (outils)

Le modèle ne peut pas exécuter ton code ni interroger ta base. Le **function calling** résout ça élégamment : tu déclares des outils, et le modèle *décide* quand en appeler un et *avec quels arguments* — mais c'est **toi** qui exécutes, puis tu lui renvoies le résultat.

```python
import json

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_restaurant_revenue",
            "description": "Get revenue for a restaurant",
            "parameters": {
                "type": "object",
                "properties": {
                    "restaurant_id": {"type": "string"},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                },
                "required": ["restaurant_id", "start_date", "end_date"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user",
               "content": "What was revenue for restaurant ABC last month?"}],
    tools=tools,
    tool_choice="auto",     # le modèle décide s'il appelle un outil
)

# Le modèle renvoie un appel d'outil, pas une réponse finale :
tool_call = response.choices[0].message.tool_calls[0]
# tool_call.function.name      -> "get_restaurant_revenue"
# tool_call.function.arguments -> '{"restaurant_id": "ABC", "start_date": ...}'

# TU exécutes la fonction, puis renvoies le résultat au modèle :
args = json.loads(tool_call.function.arguments)
function_result = get_restaurant_revenue(**args)

second_response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user",
         "content": "What was revenue for restaurant ABC last month?"},
        response.choices[0].message,          # le message contenant l'appel d'outil
        {"role": "tool",
         "tool_call_id": tool_call.id,        # relie la réponse à l'appel
         "content": json.dumps(function_result)},
    ],
)
# Le modèle formule maintenant une réponse naturelle à partir de la donnée réelle
```
La boucle est le point à retenir : **déclarer → le modèle demande → tu exécutes → tu renvoies → le modèle rédige**. Le `tool_call_id` est ce qui relie ta réponse à la bonne demande. Réflexe sécurité : les arguments viennent du modèle, donc *d'une entrée non fiable* — valide-les et n'exécute jamais une action sensible sans contrôle, exactement comme une entrée utilisateur.

### RAG : brancher le modèle sur *tes* données

**Le problème.** Le modèle ne connaît pas tes données internes, et son savoir a une date de coupure. **La solution**, le RAG (*Retrieval-Augmented Generation*) : au lieu de ré-entraîner, tu *récupères* les documents pertinents et tu les *injectes dans le prompt*. Trois étapes.

D'abord, **l'indexation** (hors ligne) : chaque document est transformé en **embedding** — un vecteur qui capture son sens — et stocké dans une base vectorielle.

```python
from openai import OpenAI
from pinecone import Pinecone

client = OpenAI()
pc = Pinecone(api_key="...")
index = pc.Index("company-docs")

docs = [
    {"id": "doc1", "text": "n8n pricing: $20/month for Pro plan"},
    {"id": "doc2", "text": "n8n supports 400+ integrations"},
    # ... des milliers d'autres
]

for doc in docs:
    embedding = client.embeddings.create(
        model="text-embedding-3-small",
        input=doc["text"]
    ).data[0].embedding
    index.upsert([(doc["id"], embedding, {"text": doc["text"]})])
```

Ensuite, **la récupération** (à l'exécution) : on embed la question de l'utilisateur *avec le même modèle*, et on cherche les vecteurs les plus proches. La proximité vectorielle approxime la proximité de sens — c'est là toute l'astuce.

```python
def retrieve_relevant_docs(query, top_k=3):
    query_embedding = client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    ).data[0].embedding
    results = index.query(vector=query_embedding, top_k=top_k, include_metadata=True)
    return [match["metadata"]["text"] for match in results["matches"]]
```

Enfin, **la génération** : on assemble contexte + question, avec une consigne stricte de ne pas inventer.

```python
def answer_question(query):
    context = "\n\n".join(retrieve_relevant_docs(query))
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system",
             "content": f"""Answer questions using the following context.
If the answer is not in the context, say "I don't know."

Context:
{context}"""},
            {"role": "user", "content": query}
        ]
    )
    return response.choices[0].message.content
```
Le RAG réduit fortement les hallucinations *et* permet de citer des sources, mais il déplace le problème : **la qualité de la réponse devient la qualité de la récupération**. Si le bon document n'est pas dans le top K, le modèle répondra « je ne sais pas » — ou pire, comblera le vide. Le point de levier d'un système RAG n'est presque jamais le LLM, c'est le *retrieval* (découpage des documents, qualité des embeddings, `top_k`).

### Coût, latence, et comment les maîtriser

Puisque tu paies au token, le raisonnement de coût est arithmétique. Prends « résumer 1 000 factures par jour », 500 tokens d'entrée et 100 de sortie chacune : 500 000 tokens d'entrée et 100 000 de sortie par jour. Sur un petit modèle rapide, quelques dollars par jour ; sur le modèle haut de gamme, un ordre de grandeur au-dessus. La décision tombe d'elle-même : **le modèle premium ne se justifie que si la tâche l'exige** — ici, un modèle léger suffit.

*Ordres de grandeur, pas prix officiels* : les tarifs et vitesses évoluent vite, revérifie-les avant tout calcul engageant. La logique, elle, ne change pas :

- **Grand modèle** — meilleure qualité, plus cher, plus lent. Pour les tâches de raisonnement où l'erreur coûte cher.
- **Petit modèle** — beaucoup moins cher, plus rapide, largement suffisant pour du volume simple (classification, extraction, résumé court).
- **Long contexte** — certains modèles avalent des centaines de milliers de tokens, utile pour de gros documents, mais le contexte se paie au token lui aussi : un prompt énorme coûte à *chaque* appel.

Quatre leviers d'optimisation, par ordre de rendement :

- **Cacher les réponses.** `hash(prompt) -> réponse`. Sur un chatbot FAQ où les mêmes questions reviennent, le cache ramène le coût à zéro sur les *hits*.
- **Comprimer les prompts.** Le prompt part à *chaque* appel. Cinquante tokens de consigne claire valent mieux que mille de blabla. Les tokens sont de l'argent.
- **Cascader les modèles.** Essaie le petit modèle d'abord ; n'escalade vers le grand que si la confiance est basse ou si l'utilisateur le demande. On paie le premium uniquement sur les cas durs.
- **Regrouper (batch).** Un appel qui traite 1 000 éléments bat 1 000 appels, quand le cas d'usage le permet (traitement asynchrone, pas temps réel).

### Un mot sur l'évaluation

Le réflexe le plus important quand tu mets un modèle en prod n'est pas d'optimiser le prompt, c'est de **mesurer**. Deux notions issues de la classification s'appliquent directement, par exemple à un filtre (« cette réponse est-elle correcte ? », « ce contenu est-il toxique ? ») :

- **Précision** = `VP / (VP + FP)` — parmi ce que le système a signalé positif, quelle proportion l'était vraiment ? Elle compte quand un **faux positif coûte cher** (bloquer un e-mail légitime).
- **Rappel** = `VP / (VP + FN)` — parmi tous les vrais positifs, combien ont été attrapés ? Il compte quand un **faux négatif coûte cher** (rater une fraude, un cas médical).

Les deux s'opposent via un seuil : monter le seuil augmente la précision et baisse le rappel, et inversement. Le **F1** (moyenne harmonique des deux) résume l'équilibre. Ne te fie *jamais* à la seule **exactitude** (*accuracy*) sur des données déséquilibrées : sur « 99 % de non-spam », un modèle qui prédit toujours « non-spam » affiche 99 % d'exactitude et ne sert à rien. Le même piège guette toute éval de LLM sur des cas rares.

Enfin, le principe qui vaut du ML classique au LLM : **évalue toujours sur un jeu de test que le système n'a jamais vu**. Un prompt réglé à la main sur trois exemples est un modèle qui a « mémorisé » ces trois exemples — l'équivalent du **surapprentissage** (*overfitting*). La vraie mesure est la performance sur des cas nouveaux et représentatifs.

---

## À retenir

1. **Le rôle du CTO n'est pas de tout coder, c'est d'estimer coût et correction sans exécuter.** Big-O est ta boussole : ce qui compte n'est pas la vitesse en démo, c'est la classe de croissance quand `N` explose.
2. **Le trade-off temps/mémoire est partout.** Un `set` ou un `dict` transforme un `O(N²)` en `O(N)` en échangeant de la RAM contre du temps — c'est le premier réflexe en code review face à deux boucles imbriquées.
3. **Choisis la structure d'après l'opération chaude.** HashMap pour le lookup, `deque` pour une file (jamais `list.pop(0)`), tas pour un top-K, deux-pointeurs et fenêtre glissante pour tuer les quadratiques cachés.
4. **Les bugs les plus coûteux sont concurrents, pas algorithmiques.** L'event loop sert l'I/O, pas le CPU ; parallélise les `await` indépendants ; et ne raisonne jamais sur un lire-modifier-écrire concurrent au niveau applicatif — pousse l'invariant vers une primitive atomique.
5. **En API, la frontière 4xx/5xx encode qui doit retenter.** Idempotence, codes de statut justes, requêtes paramétrées, erreurs détaillées loguées mais jamais renvoyées : ce sont des promesses de comportement, pas de la décoration.
6. **Un LLM prédit le prochain token, et tu paies au token.** De là découle tout : latence proportionnelle à la sortie, coût maîtrisé par cache/compression/cascade/batch, et arguments d'outils traités comme une entrée non fiable.
7. **Sur un système à base de LLM, le levier est rarement le modèle.** C'est le retrieval (RAG), le prompt, et surtout l'évaluation — précision vs rappel selon le coût de l'erreur, mesurée sur des cas jamais vus.

## Pour aller plus loin

- **Cracking the Coding Interview** (McDowell) — pour retravailler à froid structures de données et patterns si les réflexes se sont émoussés.
- **Designing Data-Intensive Applications** (Kleppmann) — la référence sur concurrence, cohérence, transactions et systèmes distribués ; le prolongement naturel de la section concurrence.
- **« Attention Is All You Need »** (Vaswani et al., 2017) — l'article fondateur des Transformers, court et lisible une fois l'intuition de l'attention en tête.
- **Documentation officielle des fournisseurs de LLM** — pour les tarifs, limites de contexte et paramètres à jour : à revérifier avant tout dimensionnement, ils bougent vite.
- **Roy Fielding, thèse sur REST (chapitre 5)** — la source des contraintes REST, utile pour savoir *pourquoi* les conventions existent avant de décider quand s'en écarter.
- **The Twelve-Factor App** — les principes de conception d'applications déployables (config, statelessness, logs) qui complètent le raisonnement API/concurrence côté exploitation.
