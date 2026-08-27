# Résoudre des problèmes de code, à nouveau par toi-même

Ce chapitre n'est pas une collection de solutions à mémoriser. C'est un chapitre sur **la méthode**. Tu as passé des années à raisonner sur du silicium, des chaînes d'attaque, des invariants de sécurité — tu sais penser rigoureusement. L'objectif ici est de réactiver ce réflexe sur les problèmes d'algorithmique et de code applicatif, sans t'appuyer sur un modèle qui te souffle la réponse.

La bonne nouvelle : la quasi-totalité des exercices « type entretien » se ramènent à une dizaine de **patterns** réutilisables. Une fois que tu reconnais le pattern, le problème s'effondre. Le vrai skill n'est donc pas de connaître le code — c'est de **reconnaître la structure** d'un problème et de savoir vers quel outil tendre la main. C'est ce que ce chapitre construit : un catalogue mental.

---

## Une méthode générale pour attaquer n'importe quel problème

Avant les exercices, fixons un protocole. Quand tu bloques, ce n'est presque jamais par manque d'intelligence — c'est parce que tu as sauté une étape. Voici les cinq temps, dans l'ordre, à respecter même (surtout) quand ça paraît évident.

**1. Reformuler et poser des exemples concrets.** Réécris le problème avec tes mots, puis fabrique un petit exemple à la main et calcule la sortie attendue. Ce n'est pas de la perte de temps : c'est ce qui révèle les cas limites (tableau vide, doublons, un seul élément) et les hypothèses implicites (« il y a exactement une solution »).

**2. Écrire la solution brute-force.** La solution naïve — celle qui essaie toutes les combinaisons — est presque toujours triviale à trouver. **Écris-la mentalement d'abord**, même si elle est en O(N²) ou pire. Elle a deux vertus : elle prouve que tu as compris le problème, et elle sert de point de comparaison pour mesurer ton optimisation.

**3. Chercher le travail redondant.** C'est le cœur du métier. Regarde ta brute-force et demande : *qu'est-ce que je recalcule inutilement ?* La plupart des optimisations consistent à **échanger du temps contre de la mémoire** — on stocke un résultat déjà vu au lieu de le recalculer. C'est de là que sortent la table de hachage, la fenêtre glissante, le cache.

**4. Nommer le pattern.** Une fois l'insight trouvé, rattache-le à un pattern connu : *table de hachage*, *deux pointeurs*, *fenêtre glissante*, *pile*, *tri puis balayage*, *programmation dynamique*. Nommer, c'est déjà avoir la moitié de la solution — et c'est ce qui rend le savoir transférable au problème suivant.

**5. Coder, puis vérifier la complexité et les cas limites.** Écris le code, repasse ton exemple de l'étape 1 dedans ligne à ligne, et énonce explicitement la complexité en temps et en espace. Si tu ne sais pas dire ta complexité, tu ne comprends pas encore ta solution.

Gardons ce protocole en tête. Chaque exercice ci-dessous le suit : problème → raisonnement → solution → variantes.

---

## Pattern 1 — La table de hachage : échanger la mémoire contre le temps

### Le problème : Two Sum

Étant donné un tableau d'entiers `nums` et une cible `target`, renvoyer les **indices** des deux nombres dont la somme vaut `target`. On garantit qu'il existe exactement une solution, et on ne peut pas réutiliser deux fois le même élément.

```
nums = [2, 7, 11, 15], target = 9  →  [0, 1]   (car 2 + 7 = 9)
```

C'est *le* problème d'introduction, et il mérite qu'on s'y attarde parce qu'il enseigne le réflexe le plus rentable de toute l'algorithmique.

### Raisonner

La brute-force est immédiate : pour chaque paire d'indices `(i, j)`, tester si `nums[i] + nums[j] == target`. Deux boucles imbriquées, O(N²) en temps. Pour N = 10 000, ça fait 100 millions d'opérations — lent, mais surtout **inutilement lent**.

Applique l'étape 3 : où est le travail redondant ? Quand je suis sur `nums[i]`, je sais exactement ce qu'il me faut : le nombre `target - nums[i]`, appelons-le le **complément**. Le problème n'est donc pas « tester toutes les paires », c'est « ai-je déjà croisé le complément ? ». Or « ai-je déjà vu cette valeur ? » est précisément la question à laquelle une **table de hachage** répond en O(1).

L'insight : au lieu de chercher en avant dans le reste du tableau (coûteux), je **mémorise ce que j'ai déjà vu** derrière moi, et j'interroge cette mémoire à chaque pas.

### La solution — O(N) temps, O(N) espace

```python
def two_sum(nums, target):
    seen = {}  # valeur -> indice

    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i

    return []
```

Déroulons sur l'exemple. À `num = 2`, le complément est 7, absent de `seen` : on enregistre `seen[2] = 0`. À `num = 7`, le complément est 2, **présent** dans `seen` : on renvoie `[seen[2], 1] = [0, 1]`. Un seul passage, chaque test en temps constant : O(N) au total.

Note le prix : on est passé de O(1) à O(N) en espace. C'est le marché fondamental — **on paie de la mémoire pour effacer une boucle**. Dans 90 % des optimisations d'entretien, c'est cet échange qui est à l'œuvre.

### Variante côté produit : composer une équipe

Le même pattern « ai-je déjà vu le complément ? » s'applique dès que tu cherches une **paire complémentaire**. Cas concret : trouver deux ingénieurs dont les compétences réunies couvrent le besoin d'un projet.

```python
def find_complementary_engineers(engineers, required_skills):
    seen = {}  # id ingénieur -> ses compétences

    for engineer in engineers:
        needed = required_skills - engineer['skills']  # ce qu'il manque
        for prev_id, prev_skills in seen.items():
            if needed.issubset(prev_skills):
                return [prev_id, engineer['id']]
        seen[engineer['id']] = engineer['skills']

    return None
```

La structure est identique à Two Sum : pour chaque ingénieur, je calcule ce qu'il *manque* (le « complément » en compétences), et je regarde si quelqu'un déjà vu le fournit. La différence : le complément n'est plus une valeur exacte mais un **sous-ensemble** (`issubset`), donc la vérification interne coûte plus qu'un O(1) parfait. Le squelette mental, lui, ne bouge pas. C'est ça, transférer un pattern.

---

## Pattern 2 — La pile : quand l'ordre d'ouverture dicte l'ordre de fermeture

### Le problème : Valid Parentheses

Une chaîne ne contient que les caractères `()[]{}`. Déterminer si elle est bien parenthésée : chaque fermeture correspond à la dernière ouverture encore ouverte.

```
"()[]{}"  → True
"([)]"    → False   (mauvais ordre de fermeture)
"{[]}"    → True
```

### Raisonner

L'insight tient dans une observation : **le dernier crochet ouvert doit être le premier fermé**. « Dernier entré, premier sorti » — c'est la définition exacte d'une **pile** (LIFO). Dès que tu vois cette structure « imbrication » ou « appariement le plus récent », la pile doit être ton premier réflexe.

L'algorithme s'écrit alors tout seul : on parcourt la chaîne, on **empile** chaque ouverture, et à chaque fermeture on vérifie que le sommet de la pile est l'ouverture correspondante — puis on **dépile**. Si à la fin la pile est vide, tout était apparié.

### La solution — O(N) temps, O(N) espace

```python
def is_valid_parentheses(s):
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}  # fermeture -> ouverture attendue

    for char in s:
        if char in pairs:                      # une fermeture
            if not stack or stack[-1] != pairs[char]:
                return False
            stack.pop()
        else:                                  # une ouverture
            stack.append(char)

    return len(stack) == 0
```

Deux cas d'échec à bien voir, car ils recouvrent tous les tests piège. Une fermeture arrive alors que la pile est **vide** (`not stack`) → rien à apparier, c'est faux. Ou le sommet ne correspond pas (`stack[-1] != pairs[char]`) → mauvais imbriquement, c'est faux. Et le cas final : la boucle finit mais **la pile n'est pas vide** → des ouvertures sont restées orphelines. Sur `"{[()]}"`, la pile grandit `{`, `{[`, `{[(`, puis se vide symétriquement à chaque fermeture correcte : on termine à vide, donc `True`.

### Variante : mesurer la profondeur d'imbrication

Le même mécanisme de pile mesure la **profondeur** d'une structure — utile pour refuser une configuration trop imbriquée (donc illisible et fragile).

```python
def validate_config_depth(config_str, max_depth=5):
    stack = []
    max_seen = 0

    for char in config_str:
        if char in '{[(':
            stack.append(char)
            max_seen = max(max_seen, len(stack))
        elif char in '}])':
            if stack:
                stack.pop()

    if max_seen > max_depth:
        raise ValueError(f"Config trop imbriquée : {max_seen} niveaux (max {max_depth})")
    return True
```

La hauteur de la pile *est* la profondeur d'imbrication courante ; on en retient le maximum. Note qu'ici on ne valide plus l'appariement, juste la profondeur — d'où le `if stack` défensif qui ignore une fermeture de trop au lieu de planter. Choisis toujours **ce que la pile mesure** en fonction de la question posée.

---

## Pattern 3 — Trier d'abord, balayer ensuite

### Le problème : Merge Intervals

Étant donné un tableau d'intervalles, fusionner tous ceux qui se chevauchent.

```
[[1,3],[2,6],[8,10],[15,18]]  →  [[1,6],[8,10],[15,18]]
```

`[1,3]` et `[2,6]` se chevauchent → ils fusionnent en `[1,6]`.

### Raisonner

Naïvement, on comparerait chaque intervalle à tous les autres : O(N²), et pénible à écrire correctement à cause des chevauchements en cascade. L'insight vient d'un changement d'angle : **si les intervalles sont triés par début, alors tout chevauchement est forcément avec le voisin immédiat de gauche**. Le désordre était la seule difficulté ; une fois trié, un simple balayage suffit.

C'est un pattern à part entière : **trier pour rendre la structure locale**. Le tri coûte O(N log N), mais il transforme un problème « chacun contre tous » en un problème « chacun contre son prédécesseur », linéaire.

### La solution — O(N log N) temps

```python
def merge_intervals(intervals):
    if not intervals:
        return []

    intervals.sort(key=lambda x: x[0])   # tri par début
    merged = [intervals[0]]

    for current in intervals[1:]:
        last = merged[-1]
        if current[0] <= last[1]:        # chevauchement : current commence avant la fin de last
            last[1] = max(last[1], current[1])   # on étend
        else:
            merged.append(current)       # pas de chevauchement : nouvel intervalle

    return merged
```

Le test de chevauchement est la seule subtilité : `current[0] <= last[1]` signifie « le nouveau démarre avant (ou quand) le précédent finit ». Le `max` lors de la fusion est essentiel — un intervalle englobé (`[2,6]` puis `[3,4]`) ne doit pas *rétrécir* la fin. Le coût est dominé par le tri : O(N log N).

### Variantes : agendas et sessions

Deux applications produit du même moteur, à quelques lignes de conversion près.

**Fusionner des créneaux d'agenda** pour trouver les plages occupées : on convertit chaque réunion `HH:MM` en minutes depuis minuit, on fusionne, on reconvertit.

```python
def merge_meeting_times(meetings):
    intervals = [[time_to_minutes(m['start']), time_to_minutes(m['end'])]
                 for m in meetings]
    merged = merge_intervals(intervals)
    return [(minutes_to_time(s), minutes_to_time(e)) for s, e in merged]

def time_to_minutes(t):
    h, m = map(int, t.split(':'))
    return h * 60 + m

def minutes_to_time(minutes):
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
```

**Consolider des sessions utilisateur** pour mesurer le temps réellement actif — deux sessions qui se recouvrent ne doivent pas être comptées deux fois :

```python
def consolidate_active_sessions(sessions):
    intervals = [[s['start'], s['end']] for s in sessions]
    merged = merge_intervals(intervals)
    total = sum(end - start for start, end in merged)
    return {
        'merged_sessions': merged,
        'total_active_seconds': total,
        'num_distinct_sessions': len(merged),
    }
```

Le point à retenir : la vraie valeur d'un algorithme d'entretien, c'est le **noyau réutilisable** (`merge_intervals`) qu'on habille ensuite selon le domaine. Reconnaître qu'un problème d'analytics est un problème de fusion d'intervalles déguisé, voilà le skill de CTO.

---

## Pattern 4 — Concevoir une structure de données : le LRU Cache

### Le problème : LRU Cache

Concevoir un cache **à éviction du moins récemment utilisé** (Least Recently Used) :

- `get(key)` renvoie la valeur si présente ;
- `put(key, value)` insère, et si la capacité est dépassée, évince l'entrée la moins récemment utilisée.

La contrainte qui fait tout l'intérêt : **les deux opérations doivent être en O(1)**.

### Raisonner

Ici il n'y a pas d'astuce cachée dans les données mais un **choix de structure**. Décompose l'exigence : il faut d'un côté un accès par clé en O(1) (une table de hachage), de l'autre un ordre d'usage maintenu en O(1) aux deux bouts (une liste doublement chaînée : on retire le plus ancien en tête, on ajoute le plus récent en queue). Le pattern classique **combine les deux** — c'est un exercice de *conception*, pas d'algorithme.

En Python, `OrderedDict` encapsule exactement cette combinaison (hachage + ordre d'insertion mutable), ce qui rend la solution limpide. L'idée clé : **à chaque accès, on remet la clé en queue** (« vue récemment ») ; l'entrée à évincer est donc toujours en tête.

### La solution — get et put en O(1)

```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key):
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)      # marquer comme récemment utilisée
        return self.cache[key]

    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            oldest = next(iter(self.cache))   # la tête = la plus ancienne
            del self.cache[oldest]
```

`move_to_end` et l'accès par clé sont O(1) sur un `OrderedDict` ; `next(iter(...))` donne l'entrée la plus ancienne sans parcourir le dictionnaire. Sur une capacité 2, la séquence `put(1,1)`, `put(2,2)`, `get(1)` (qui remet 1 en queue), puis `put(3,3)` évince bien **2** — devenu le plus ancien — et non 1.

### Variante : cache avec expiration (TTL)

En production, on ajoute souvent une dimension : la fraîcheur. On combine alors l'ordre LRU avec un horodatage par clé, et on invalide ce qui a dépassé son **TTL**.

```python
from collections import OrderedDict
import time

class APICache:
    def __init__(self, max_size=100):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.timestamps = {}

    def get(self, key, ttl_seconds=60):
        if key not in self.cache:
            return None
        if time.time() - self.timestamps[key] > ttl_seconds:  # expiré
            del self.cache[key]
            del self.timestamps[key]
            return None
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key, value):
        self.cache[key] = value
        self.timestamps[key] = time.time()
        if len(self.cache) > self.max_size:
            oldest = next(iter(self.cache))
            del self.cache[oldest]
            del self.timestamps[oldest]
```

L'impact est très concret. Un dashboard qui appelle `/api/stats` toutes les 5 secondes, avec une requête à 200 ms qui joint plusieurs tables : sans cache, c'est la base qui encaisse tout. Avec un TTL de 60 s et un taux de hit de ~90 %, la charge base chute d'un ordre de grandeur, et la latence perçue passe de 200 ms (base) à ~20 ms (cache). Le **cache est le premier levier de performance** d'un backend, et le LRU en est la brique canonique.

---

## Des exercices aux systèmes : deux cas ML

Les problèmes suivants sont moins « algorithmiques » et plus « ingénierie de système ». La méthode ne change pas : commencer par la solution la plus simple qui marche, mesurer ce qui coince, puis complexifier **seulement si le gain le justifie**.

### Analyse de sentiment : trois niveaux de sophistication

Le réflexe précieux ici n'est pas de sauter au modèle le plus avancé, c'est de choisir le niveau adapté à la contrainte. Il y a trois étages.

**Étage 1 — règles.** Compter les mots positifs et négatifs. Bête et rapide.

```python
def sentiment_rule_based(text):
    positive = {'amazing', 'great', 'excellent', 'love', 'delicious', 'perfect', 'best'}
    negative = {'terrible', 'awful', 'bad', 'slow', 'worst', 'horrible', 'disappointing'}
    words = text.lower().split()
    pos = sum(1 for w in words if w in positive)
    neg = sum(1 for w in words if w in negative)
    if pos > neg:  return 'positive'
    if neg > pos:  return 'negative'
    return 'neutral'
```

Parfait pour un MVP ou pour dégrossir un volume. Aveugle à l'ironie, à la négation (« pas mauvais ») et au contexte. Mais tu le livres en une heure — et parfois c'est exactement ce qu'il faut.

**Étage 2 — modèle entraîné.** Quand les règles plafonnent, on entraîne un classifieur. Le pipeline canonique : transformer le texte en vecteurs numériques par **TF-IDF**, puis une régression logistique.

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import pickle

class SentimentClassifier:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=1000)
        self.model = LogisticRegression()

    def train(self, texts, labels):        # labels : 1 = positif, 0 = négatif
        X = self.vectorizer.fit_transform(texts)
        self.model.fit(X, labels)

    def predict(self, text):
        X = self.vectorizer.transform([text])
        pred = self.model.predict(X)[0]
        prob = self.model.predict_proba(X)[0]
        return {
            'sentiment': 'positive' if pred == 1 else 'negative',
            'confidence': max(prob),
        }

    def save(self, filepath):
        with open(filepath, 'wb') as f:
            pickle.dump((self.vectorizer, self.model), f)

    @classmethod
    def load(cls, filepath):
        with open(filepath, 'rb') as f:
            vectorizer, model = pickle.load(f)
        clf = cls()
        clf.vectorizer, clf.model = vectorizer, model
        return clf
```

Le point d'architecture à retenir : le `vectorizer` **doit** être sauvegardé avec le modèle. C'est lui qui fige le vocabulaire appris à l'entraînement ; le charger séparément (ou le ré-`fit`) casserait silencieusement les prédictions. On `fit_transform` à l'entraînement, mais seulement `transform` en prédiction.

**Étage 3 — modèle pré-entraîné.** Précision état de l'art, zéro entraînement, au prix de plus de latence et d'un besoin de GPU à l'échelle.

```python
from transformers import pipeline

class SentimentAnalyzer:
    def __init__(self):
        self.model = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
        )

    def analyze(self, text):
        result = self.model(text)[0]
        return {'sentiment': result['label'].lower(), 'confidence': result['score']}
```

Le **trade-off** est la vraie leçon : règles (rapide, imprécis, gratuit) → modèle entraîné (bon compromis, demande des données étiquetées) → transformer pré-entraîné (précis, coûteux en calcul). En prod, on **charge le modèle une fois au démarrage**, jamais à chaque requête :

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
sentiment_model = SentimentClassifier.load('sentiment_model.pkl')  # au boot, pas par requête

class ReviewRequest(BaseModel):
    text: str

@app.post("/api/sentiment")
async def analyze_sentiment(request: ReviewRequest):
    return sentiment_model.predict(request.text)
```

### Recommandation : le filtrage collaboratif

« Les utilisateurs qui te ressemblent ont aussi aimé… ». L'idée : représenter chaque utilisateur par son vecteur de notes, mesurer la **similarité cosinus** entre utilisateurs, puis recommander ce qu'ont aimé les plus proches — pondéré par leur proximité.

```python
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

class RestaurantRecommender:
    def __init__(self):
        self.user_ratings = {}      # user_id -> {restaurant_id: note}
        self.restaurant_ids = set()

    def add_rating(self, user_id, restaurant_id, rating):
        self.user_ratings.setdefault(user_id, {})[restaurant_id] = rating
        self.restaurant_ids.add(restaurant_id)

    def get_recommendations(self, user_id, n=5):
        if user_id not in self.user_ratings:
            return self._get_popular_restaurants(n)   # cold start

        user_ids = list(self.user_ratings.keys())
        restaurant_list = sorted(self.restaurant_ids)

        # Matrice utilisateurs x restaurants (0 = non noté)
        matrix = np.array([
            [self.user_ratings[uid].get(rid, 0) for rid in restaurant_list]
            for uid in user_ids
        ])

        similarities = cosine_similarity(matrix)
        target_idx = user_ids.index(user_id)
        similar_users = np.argsort(similarities[target_idx])[::-1][1:11]  # top 10, self exclu

        recommendations = {}
        for similar_idx in similar_users:
            similar_user = user_ids[similar_idx]
            score = similarities[target_idx][similar_idx]
            for rid, rating in self.user_ratings[similar_user].items():
                if rid in self.user_ratings[user_id]:
                    continue                       # déjà noté par la cible
                recommendations[rid] = recommendations.get(rid, 0) + rating * score

        ranked = sorted(recommendations.items(), key=lambda x: x[1], reverse=True)
        return [rid for rid, _ in ranked[:n]]

    def _get_popular_restaurants(self, n):
        totals = {}
        for ratings in self.user_ratings.values():
            for rid, rating in ratings.items():
                totals.setdefault(rid, []).append(rating)
        avg = {rid: np.mean(rs) for rid, rs in totals.items()}
        ranked = sorted(avg.items(), key=lambda x: x[1], reverse=True)
        return [rid for rid, _ in ranked[:n]]
```

Deux détails d'ingénierie valent plus que l'algèbre. Le premier : `np.argsort(...)[::-1][1:11]` trie les similarités par ordre décroissant et **retire le premier élément** — car un utilisateur est toujours à similarité 1 avec lui-même. Le second : le **cold start**. Un nouvel utilisateur n'a aucune note, donc aucun voisin ; le repli sur « les restaurants les plus populaires » (`_get_popular_restaurants`) est la réponse standard. Un système de reco sans stratégie de cold start est un système cassé pour tout nouvel inscrit — et un nouveau produit n'a *que* des nouveaux inscrits.

En production, la matrice se reconstruit depuis la base (une table `user_ratings` avec clé primaire `(user_id, restaurant_id)` et un index sur chaque colonne). Le calcul dense montré ici tient tant que la matrice reste petite ; au-delà, on passe à des factorisations creuses ou à un service dédié — mais le **modèle mental** reste celui-ci.

---

## Patterns React : partager la logique proprement

Le fil rouge côté front est identique à celui du back : **isoler la logique réutilisable** pour ne pas la dupliquer. React offre trois outils pour ça, du plus moderne au plus historique.

### Custom Hooks : la brique de réutilisation

Un **hook personnalisé** extrait une logique à état (fetch, debounce, persistance) hors des composants, pour la partager. `useFetch` encapsule le cycle *chargement → succès / erreur* une fois pour toutes :

```javascript
import { useState, useEffect } from 'react';

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (!cancelled) { setData(json); setError(null); }
      } catch (err) {
        if (!cancelled) { setError(err.message); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };   // annulation au démontage
  }, [url]);

  return { data, loading, error };
}
```

Le détail qui sépare le code jouet du code de prod : le drapeau `cancelled`. Si le composant se démonte (ou si `url` change) avant que la requête réponde, on ne veut **pas** appeler `setData` sur un composant disparu — d'où la fonction de nettoyage retournée par `useEffect` qui bascule `cancelled` à `true`. C'est le pattern **cleanup**, à avoir en réflexe dès qu'un effet lance une opération asynchrone.

Deux autres hooks illustrent la même philosophie. `useDebounce` retarde une valeur — indispensable pour ne pas déclencher une requête à chaque frappe clavier :

```javascript
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);   // on annule le timer précédent à chaque frappe
  }, [value, delay]);
  return debounced;
}
```

Le mécanisme est subtil et élégant : à chaque changement de `value`, le cleanup **annule le timer précédent** avant d'en armer un nouveau. Résultat, `setDebounced` ne s'exécute que si l'utilisateur s'arrête `delay` millisecondes — exactement l'effet « attends qu'il ait fini de taper ». Couplé à `useFetch`, on ne requête l'API qu'après la pause de frappe.

Et `useLocalStorage`, qui synchronise un état React avec le stockage du navigateur pour mémoriser les préférences entre visites :

```javascript
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setStoredValue = (newValue) => {
    try {
      setValue(newValue);
      window.localStorage.setItem(key, JSON.stringify(newValue));
    } catch (error) {
      console.error('Erreur d\'écriture localStorage :', error);
    }
  };

  return [value, setStoredValue];
}
```

L'initialiseur paresseux (`useState(() => ...)`) ne lit le stockage **qu'une fois** au montage, pas à chaque rendu. Les trois hooks partagent la même vertu : une responsabilité, testable et réutilisable, extraite du composant.

### Compound Components : une API flexible via le contexte

Quand un composant a plusieurs sous-parties qui doivent partager un état (des onglets : la liste, chaque onglet, chaque panneau), le pattern **compound components** expose une API composable où le parent partage l'état par **contexte**.

```javascript
import { createContext, useContext, useState } from 'react';

const TabsContext = createContext();

function Tabs({ children, defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab || 0);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

Tabs.List = ({ children }) => <div className="tab-list">{children}</div>;

Tabs.Tab = ({ index, children }) => {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  return (
    <button
      className={`tab ${activeTab === index ? 'active' : ''}`}
      onClick={() => setActiveTab(index)}
    >
      {children}
    </button>
  );
};

Tabs.Panel = ({ index, children }) => {
  const { activeTab } = useContext(TabsContext);
  return activeTab === index ? <div className="tab-panel">{children}</div> : null;
};
```

Le gain est côté *appelant* : l'utilisateur du composant écrit un balisage déclaratif et lisible, sans jamais manipuler l'état actif à la main.

```javascript
<Tabs defaultTab={0}>
  <Tabs.List>
    <Tabs.Tab index={0}>Vue d'ensemble</Tabs.Tab>
    <Tabs.Tab index={1}>Revenus</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel index={0}><h2>Vue d'ensemble</h2></Tabs.Panel>
  <Tabs.Panel index={1}><h2>Revenus</h2></Tabs.Panel>
</Tabs>
```

L'état vit dans le contexte ; les sous-composants le consomment. C'est le pattern des bibliothèques UI sérieuses (Radix, Reach) parce qu'il offre la flexibilité sans exposer la plomberie.

### Render props : l'ancêtre, et pourquoi les hooks l'ont remplacé

Avant les hooks, partager une logique à état passait par les **render props** : un composant gère l'état et délègue l'affichage à une fonction passée en `children`.

```javascript
class MouseTracker extends React.Component {
  state = { x: 0, y: 0 };
  handleMouseMove = (e) => this.setState({ x: e.clientX, y: e.clientY });
  render() {
    return (
      <div onMouseMove={this.handleMouseMove}>
        {this.props.children(this.state)}
      </div>
    );
  }
}

// Usage : <MouseTracker>{({ x, y }) => <p>({x}, {y})</p>}</MouseTracker>
```

Ça fonctionne, mais l'imbrication de fonctions devient vite illisible (le fameux « wrapper hell »). La version moderne — un hook — fait la même chose en deux fois moins de lignes et sans imbrication :

```javascript
function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handle = (e) => setPosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handle);
    return () => window.removeEventListener('mousemove', handle);
  }, []);
  return position;
}

// Usage : const { x, y } = useMousePosition();
```

La leçon transférable dépasse React : **le même besoin — partager de la logique — a plusieurs solutions selon l'époque et le langage**. Sache reconnaître le render props dans du code existant, mais écris des hooks.

---

## Patterns Node.js de production

Les trois patterns suivants sont ce qui sépare un serveur de démo d'un serveur qui tient en production. Aucun n'est un algorithme ; ce sont des **disciplines**.

### Gestion d'erreurs centralisée

Le principe : au lieu d'un `try/catch` dupliqué dans chaque route, on canalise **toutes** les erreurs vers un middleware unique. Trois pièces s'emboîtent.

Une classe d'erreur qui distingue les erreurs **opérationnelles** (attendues : « restaurant introuvable ») des bugs de programmation :

```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

Un wrapper `catchAsync` qui capte les rejets de promesse d'un handler asynchrone et les redirige vers `next` — c'est lui qui élimine les `try/catch` répétitifs :

```javascript
const catchAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get('/api/restaurants/:id', catchAsync(async (req, res, next) => {
  const restaurant = await db.query('SELECT * FROM restaurants WHERE id = $1', [req.params.id]);
  if (restaurant.rows.length === 0) {
    throw new AppError('Restaurant introuvable', 404);   // capté, routé vers le handler global
  }
  res.json(restaurant.rows[0]);
}));
```

Et le **middleware global**, dernier de la chaîne, qui décide quoi renvoyer selon l'environnement et la nature de l'erreur :

```javascript
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode).json({
      status: err.status, message: err.message, stack: err.stack,
    });
  }
  if (err.isOperational) {                    // erreur attendue : message sûr pour le client
    return res.status(err.statusCode).json({ status: err.status, message: err.message });
  }
  return res.status(500).json({               // bug : ne pas fuiter les détails
    status: 'error', message: 'Something went wrong',
  });
});
```

La distinction `isOperational` est un réflexe de sécurité que tu connais bien : **ne jamais fuiter de stack trace ou de détail interne au client** en production. Une erreur opérationnelle a un message sûr et pensé pour l'utilisateur ; un bug renvoie un message générique et reste dans les logs. On complète par un filet de sécurité sur les rejets non gérés (`process.on('unhandledRejection', ...)`) qui referme proprement le serveur plutôt que de le laisser dans un état indéfini.

### Validation des entrées

Toute donnée venant du client est **hostile jusqu'à preuve du contraire** — un principe que tu n'as pas besoin qu'on t'explique. On valide à la frontière, avant que la donnée touche la logique métier ou la base. Un middleware générique paramétré par un schéma :

```javascript
const Joi = require('joi');

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,   // renvoyer TOUTES les erreurs, pas juste la première
    stripUnknown: true,  // supprimer les champs non déclarés
  });
  if (error) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: error.details.map((d) => ({ field: d.path[0], message: d.message })),
    });
  }
  req.body = value;      // on remplace par la donnée validée et nettoyée
  next();
};
```

Deux options portent toute la valeur. `abortEarly: false` collecte **toutes** les erreurs d'un coup — un formulaire qui ne signale qu'une erreur à la fois est une torture UX. `stripUnknown: true` **retire les champs non prévus** : une défense directe contre l'injection de paramètres (mass assignment). Enfin, `req.body = value` remplace l'entrée brute par la version validée et coercée, si bien que le reste de la route travaille sur une donnée propre :

```javascript
const createRestaurantSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  cuisine: Joi.string().valid('italian', 'chinese', 'french', 'japanese', 'mexican').required(),
  address: Joi.string().min(10).max(200).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),   // format E.164
  email: Joi.string().email().optional(),
});

app.post('/api/restaurants', validate(createRestaurantSchema), catchAsync(async (req, res) => {
  const { name, cuisine, address, phone, email } = req.body;   // déjà validé
  const result = await db.query(
    `INSERT INTO restaurants (name, cuisine, address, phone, email)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, cuisine, address, phone, email],
  );
  res.status(201).json(result.rows[0]);
}));
```

Note aussi les requêtes **paramétrées** (`$1, $2, …`) : jamais de concaténation de chaîne dans du SQL. Validation à la frontière plus requêtes paramétrées, ce sont les deux barrières de base.

### Rate limiting

Limiter le débit protège des abus, du bruteforce d'authentification et de la simple surcharge. Pour un service **distribué** (plusieurs instances derrière un load balancer), le compteur doit être partagé — d'où Redis comme back-end. On utilise ici l'API moderne de **node-redis v4** :

```javascript
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');

const redisClient = createClient({ socket: { host: 'localhost', port: 6379 } });
redisClient.connect().catch(console.error);

const apiLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 15 * 60 * 1000,   // fenêtre de 15 min
  max: 100,                   // 100 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 60 * 60 * 1000,   // 1 heure
  max: 5,                     // 5 tentatives de login par heure
  skipSuccessfulRequests: true,   // ne compter que les échecs
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

L'insight de conception : **des limites différentes selon la sensibilité de la route**. L'API générale tolère 100 requêtes / 15 min ; le login, cible du bruteforce, tombe à 5 tentatives / heure — et `skipSuccessfulRequests` ne pénalise que les échecs, pour ne pas bloquer un utilisateur légitime qui se connecte souvent.

Pour un contrôle plus fin, on écrit un limiteur maison par **clé d'API**, en s'appuyant sur l'atomicité d'`INCR` dans Redis :

```javascript
async function apiKeyRateLimiter(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const key = `rate_limit:${apiKey}`;
  const requests = await redisClient.incr(key);
  if (requests === 1) {
    await redisClient.expire(key, 60);   // première requête : armer la fenêtre de 60 s
  }

  const limit = 1000;
  if (requests > limit) {
    return res.status(429).json({ error: 'Rate limit exceeded', limit, reset_in: await redisClient.ttl(key) });
  }

  res.set({
    'X-RateLimit-Limit': limit,
    'X-RateLimit-Remaining': Math.max(0, limit - requests),
    'X-RateLimit-Reset': Date.now() + (await redisClient.ttl(key)) * 1000,
  });
  next();
}

app.use('/api/premium/', apiKeyRateLimiter);
```

Le point délicat est la **condition de course** : `INCR` est atomique, donc deux requêtes simultanées ne se marchent pas dessus sur le compteur. On ne pose l'expiration qu'à la **première** requête (`requests === 1`), ce qui définit une fenêtre glissante d'une minute par clé. Renvoyer les en-têtes `X-RateLimit-*` est une politesse d'API qui permet au client de s'auto-réguler avant de se faire jeter (429).

---

## Construire ton catalogue mental

Reprends du recul sur ce qu'on vient de traverser. Chaque problème « difficile » s'est dissous dès qu'on a nommé sa structure : *ai-je déjà vu le complément ?* → table de hachage ; *le dernier ouvert se ferme en premier* → pile ; *le désordre est le seul obstacle* → trier puis balayer ; *j'ai besoin de deux propriétés O(1) à la fois* → combiner deux structures.

C'est ça, la compétence que tu reconstruis : non pas retenir des solutions, mais **entraîner la reconnaissance de patterns**. Un problème inconnu devient tractable dès que tu peux dire « c'est une fenêtre glissante déguisée » ou « c'est une fusion d'intervalles ». Le reste est de la mise en œuvre.

Trois habitudes accélèrent cette construction. **Code chaque exercice à la main** — lire une solution donne l'illusion de comprendre ; l'écrire révèle les trous. **Énonce la complexité à voix haute** à chaque fois : c'est le test qui prouve que tu as compris, pas juste recopié. Et **cherche le pattern derrière le cas produit** : quand tu vois un problème d'analytics, demande-toi de quel exercice canonique il est le déguisement. C'est exactement le mouvement de pensée d'un CTO qui reconnaît, dans une demande métier floue, la structure algorithmique sous-jacente.

Tu n'as pas besoin d'un LLM pour ça. Tu as besoin d'un catalogue mental bien rangé et du réflexe d'y piocher. Ce chapitre en a posé les premières fiches.

---

## À retenir

- **Méthode en 5 temps** : reformuler + exemple concret → brute-force → traquer le travail redondant → nommer le pattern → coder et énoncer la complexité.
- **Table de hachage** : « ai-je déjà vu X ? » en O(1). On paie de la mémoire pour effacer une boucle. (Two Sum, paires complémentaires.)
- **Pile (LIFO)** : dès qu'un appariement ou une imbrication suit l'ordre « dernier entré, premier sorti ». (Parenthèses, profondeur.)
- **Trier puis balayer** : quand le désordre est la seule difficulté, O(N log N) pour le tri rend le reste linéaire. (Fusion d'intervalles.)
- **Combiner des structures** : un besoin de plusieurs propriétés O(1) simultanées se conçoit, il ne se devine pas. (LRU = hachage + ordre.)
- **Cache + TTL** : premier levier de performance backend, éviction LRU en brique de base.
- **Escalade de complexité** : commence par la solution la plus simple qui marche (règles), ne complexifie que si le gain le justifie (modèle entraîné, puis pré-entraîné). Prévois toujours le **cold start**.
- **Réutilisation de logique** : hooks (React), noyau réutilisable habillé par domaine (algorithmes), middleware paramétré (Node).
- **Disciplines de prod** : erreurs centralisées sans fuite d'info, validation hostile à la frontière + requêtes paramétrées, rate limiting différencié par sensibilité de route.

## Pour aller plus loin

- **Patterns non couverts ici, à ajouter à ton catalogue** : *deux pointeurs* (tableaux triés, palindromes), *fenêtre glissante* (sous-tableau/sous-chaîne optimal), *recherche binaire* (espace de réponses monotone), *BFS/DFS* et *union-find* (graphes), *programmation dynamique* (sous-problèmes qui se chevauchent), *tas / file de priorité* (top-K, médiane glissante).
- **S'entraîner** : NeetCode 150 et « Grokking the Coding Interview » organisent justement les exercices *par pattern* — c'est la bonne façon de bâtir la reconnaissance, plutôt que de brasser des problèmes au hasard.
- **Approfondir les fondations** : *Designing Data-Intensive Applications* (Kleppmann) pour le cache, la cohérence et les systèmes distribués sous-jacents au rate limiting et au recommender ; *The Algorithm Design Manual* (Skiena) pour le catalogue algorithmique complet.
- **Discipline** : un pattern par semaine, implémenté pour de vrai dans un de tes projets. Le savoir se fixe par la main, pas par la lecture.
