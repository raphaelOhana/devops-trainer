# Prometheus & Grafana : comprendre les métriques avant de les instrumenter

On ne pilote bien que ce que l'on mesure. Cette phrase est devenue un cliché, mais elle cache une vérité opérationnelle : sans métriques, un incident se vit à l'aveugle, on redémarre des services au hasard, on argumente sur des impressions. Prometheus et Grafana forment aujourd'hui le socle *de facto* de la métrologie : Prometheus collecte et stocke les séries temporelles, Grafana les visualise et déclenche des alertes. Google, Meta, Spotify, Uber, Netflix construisent leur observabilité dessus.

Ce chapitre n'est pas un manuel d'installation. C'est une tentative d'expliquer *pourquoi* ces outils sont construits comme ils le sont, et surtout les endroits où l'intuition trompe : le modèle de données, le choix du type de métrique, et la manière dont PromQL raisonne. Ce sont ces trois points qui font la différence entre un dashboard qui ment et un dashboard sur lequel on peut fonder une décision à 3h du matin.

---

## Pourquoi un système *pull*, et pas *push*

La première décision d'architecture de Prometheus est contre-intuitive. La plupart des systèmes de métriques historiques (StatsD, Graphite) fonctionnent en **push** : chaque application *envoie* ses mesures vers un collecteur central. Prometheus fait l'inverse. Il fonctionne en **pull** : c'est le serveur Prometheus qui va *chercher* les métriques en interrogeant périodiquement chaque cible.

Concrètement, votre application expose un endpoint HTTP — par convention `/metrics` — qui renvoie, en texte brut, l'état courant de tous ses compteurs. Prometheus visite cet endpoint toutes les 15 secondes (le **scrape interval** par défaut), lit la page, et range les valeurs dans sa base de données temporelle. C'est tout. Cette opération s'appelle un **scrape**.

L'analogie utile : le modèle push, c'est chaque employé qui vous envoie un rapport quand il en a envie ; le modèle pull, c'est vous qui faites l'appel à heure fixe. Le second est plus ennuyeux mais infiniment plus fiable pour savoir qui manque.

Car c'est là tout l'intérêt. **Si un scrape échoue, Prometheus sait immédiatement que la cible est tombée** : l'absence de réponse *est* un signal (la métrique interne `up` passe à 0). Avec un modèle push, une application silencieuse est ambiguë — est-elle en panne, ou simplement calme ? Le pull résout ce doute par construction.

Le pull apporte trois autres bénéfices. La **configuration est centralisée** : la liste des cibles vit dans Prometheus, pas éparpillée dans cent applications. Le **débogage est trivial** : l'endpoint `/metrics` est une simple page web, vous l'ouvrez dans un navigateur et vous voyez exactement ce que Prometheus voit. Et surtout, il permet le **service discovery** : Prometheus interroge l'API Kubernetes (ou Consul, EC2, etc.) pour découvrir *automatiquement* les nouveaux pods à scraper. Vous déployez un service, il apparaît dans le monitoring sans toucher à aucune config. C'est le point qui change tout à l'échelle.

Le prix à payer est réel. Prometheus doit pouvoir **joindre le réseau** de chaque cible — ce qui pose des questions de pare-feu et de segmentation. Et le pull s'accommode mal des **jobs éphémères** : un batch qui vit trois secondes n'existera peut-être plus au moment du scrape suivant. Pour ce cas, on utilise une pièce annexe, le **Pushgateway**, vers laquelle les jobs courts poussent leurs métriques et que Prometheus scrape ensuite normalement. C'est une exception explicite, pas le mode nominal — et il faut résister à la tentation d'en faire un collecteur push universel.

En résumé, l'architecture interne tient en quatre organes : le **scraper** qui collecte, la **TSDB** (base de séries temporelles) qui stocke, le **query engine** qui répond aux requêtes PromQL, et à côté **Grafana** qui interroge ce moteur pour dessiner. Alertmanager, qu'on verra plus loin, se greffe pour router les alertes.

---

## Le modèle de données : c'est là que les gens se trompent

Avant toute requête, il faut intérioriser comment Prometheus range les données. C'est la partie qu'on croit comprendre et qu'on comprend mal, et toutes les erreurs de coût viennent de là.

Une **série temporelle** dans Prometheus est identifiée de façon unique par deux choses : un **nom de métrique** et un **ensemble de labels** (des paires clé-valeur). Prenons cet exemple exposé par une application :

```
http_requests_total{method="GET", endpoint="/api/users"} 1547
```

Le nom est `http_requests_total`. Les labels sont `method="GET"` et `endpoint="/api/users"`. La valeur au moment du scrape est `1547`. Point crucial : **chaque combinaison distincte de labels crée une série temporelle distincte**. `http_requests_total{method="GET"}` et `http_requests_total{method="POST"}` sont deux séries indépendantes, chacune stockée séparément, chacune consommant de la mémoire et du disque.

C'est exactement une table de base de données où la clé primaire serait le tuple (nom + tous les labels), et où l'on ajoute une ligne (timestamp, valeur) à chaque scrape. Retenez cette image : **chaque valeur de label unique multiplie le nombre de séries**. Nous y reviendrons quand nous parlerons de cardinalité — c'est le piège de coût numéro un, et il découle directement de ce modèle.

---

## Les quatre types de métriques, et quand utiliser chacun

Prometheus propose quatre types de métriques. Choisir le bon n'est pas cosmétique : cela détermine quelles requêtes seront possibles ensuite. C'est une décision qu'on prend au moment d'instrumenter, et qu'on paie longtemps si on se trompe.

### Le compteur (*counter*) : ce qui ne fait que monter

Un **counter** est une valeur qui **croît de manière monotone** — elle ne peut qu'augmenter, ou repartir de zéro lors d'un redémarrage du process. On l'utilise pour **compter des événements** : requêtes reçues, erreurs, jobs terminés. `http_requests_total`, `errors_total`, `jobs_completed` sont des compteurs.

L'analogie évidente est le compteur kilométrique d'une voiture. Sa valeur brute (« 148 320 km ») ne vous intéresse presque jamais. Ce qui vous intéresse, c'est la **vitesse** : combien de kilomètres par heure. En Prometheus, on ne regarde donc jamais la valeur brute d'un compteur — on lui applique `rate()` pour obtenir un débit par seconde. C'est la règle d'or des compteurs, et nous la détaillons dans la section PromQL.

### La jauge (*gauge*) : ce qui monte et descend

Une **gauge** est une valeur qui peut **augmenter ou diminuer** : elle représente un état instantané. Mémoire utilisée, profondeur d'une file d'attente, nombre de connexions actives, température. `memory_usage_bytes`, `queue_depth`, `active_connections` sont des jauges.

C'est le thermomètre, par opposition au compteur kilométrique. La valeur brute a un sens direct : `memory_usage_bytes` vous dit combien de mémoire est consommée *maintenant*. On peut la lire telle quelle, ou la lisser sur une fenêtre (« mémoire moyenne des 5 dernières minutes »).

La distinction counter/gauge est la plus importante à ne pas rater. Appliquer `rate()` à une gauge n'a aucun sens ; lire la valeur brute d'un counter non plus.

### L'histogramme (*histogram*) : pour les distributions

Un **histogram** capture la **distribution** d'une grandeur : typiquement des latences, des durées de requête, des tailles de réponse. Là où une gauge vous donnerait *une* valeur, l'histogramme vous dit combien d'observations sont tombées sous chaque seuil.

Mécaniquement, un histogramme n'est pas une série mais **trois familles de séries** générées automatiquement :

- les `_bucket` — des **compartiments cumulatifs**, un par seuil `le` (« less or equal ») ;
- le `_sum` — la somme de toutes les valeurs observées ;
- le `_count` — le nombre total d'observations.

Voici à quoi ressemblent les données d'un histogramme de latence :

```
http_request_duration_seconds_bucket{le="0.1"} 100
http_request_duration_seconds_bucket{le="0.5"} 450
http_request_duration_seconds_bucket{le="1.0"} 980
http_request_duration_seconds_bucket{le="+Inf"} 1000
http_request_duration_seconds_sum 245.3
http_request_duration_seconds_count 1000
```

Le point à bien lire : les buckets sont **cumulatifs**. Le bucket `le="0.5"` compte *toutes* les requêtes de 0,5 s ou moins — soit 450, ce qui inclut déjà les 100 requêtes du bucket `le="0.1"`. Le bucket `le="+Inf"` compte tout (1000). C'est cette structure cumulative qui rend possible le calcul de percentiles côté serveur, sans avoir stocké chaque mesure individuelle. C'est le type à privilégier pour toute question de latence.

### Le résumé (*summary*) : l'histogramme figé côté client

Un **summary** ressemble à un histogramme mais calcule les **percentiles directement dans l'application**, au moment de la mesure. L'histogramme, lui, ne stocke que des buckets et laisse Prometheus calculer les percentiles à la requête.

La conséquence pratique tranche le débat. Avec un **histogramme**, vous choisissez le percentile *au moment de la requête* — vous pouvez demander le P95 aujourd'hui, le P99 demain, agréger plusieurs instances ensemble. Avec un **summary**, les percentiles sont figés à l'instrumentation et, surtout, **ne s'agrègent pas** : on ne peut pas moyenner mathématiquement le P95 de trois serveurs pour obtenir le P95 global. C'est une erreur statistique.

La recommandation par défaut est donc simple : **préférez l'histogramme**. Le summary ne se justifie que pour une précision de percentile impossible à obtenir avec des buckets prédéfinis, et sur une seule instance.

---

## Instrumenter une application : l'exemple concret

La théorie devient limpide en la voyant dans du code. Voici l'instrumentation d'une application FastAPI avec la bibliothèque `prometheus_client`. On y retrouve les trois types courants.

```python
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from fastapi import FastAPI, Request, Response
import time

app = FastAPI()

# Un counter : total des requêtes, ventilé par méthode / endpoint / statut
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

# Un histogram : distribution des durées de requête
REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

# Une gauge : requêtes en cours à l'instant t
ACTIVE_REQUESTS = Gauge(
    'http_requests_active',
    'Currently active HTTP requests'
)
```

Le middleware qui remplit ces métriques suit une chorégraphie qu'il faut connaître : on **incrémente** la gauge à l'entrée, on **mesure** le temps, on **observe** la durée et on **incrémente** le compteur à la sortie, et on **décrémente** la gauge dans un `finally` pour qu'elle reste juste même si la requête échoue.

```python
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    ACTIVE_REQUESTS.inc()
    start_time = time.time()
    try:
        response = await call_next(request)
        duration = time.time() - start_time

        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=request.url.path,
            status=response.status_code
        ).inc()

        REQUEST_DURATION.labels(
            method=request.method,
            endpoint=request.url.path
        ).observe(duration)

        return response
    finally:
        ACTIVE_REQUESTS.dec()
```

L'endpoint que Prometheus viendra scraper ne fait que sérialiser l'état courant de toutes les métriques :

```python
@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type="text/plain")
```

Rien de magique : `generate_latest()` produit exactement le format texte qu'on a vu plus haut, et Prometheus le lit toutes les 15 secondes.

Le vrai levier de valeur, ce sont les **métriques métier**. Rien n'oblige à ne mesurer que la technique. On peut compter les commandes créées, mesurer la distribution des montants, cumuler le chiffre d'affaires :

```python
ORDERS_CREATED = Counter(
    'orders_created_total', 'Total orders created',
    ['restaurant_id', 'status']
)
ORDER_VALUE = Histogram(
    'order_value_euros', 'Order value in euros',
    buckets=[10, 20, 50, 100, 200, 500, 1000]
)
REVENUE_TOTAL = Counter(
    'revenue_total_euros', 'Total revenue',
    ['restaurant_id']
)
```

Notez deux détails de conception. L'histogramme `ORDER_VALUE` définit ses **buckets explicitement** (`[10, 20, 50, ...]`) : ils doivent correspondre aux montants réels de votre métier, sinon les percentiles seront inexploitables. Et `REVENUE_TOTAL` est un compteur qu'on incrémente *de la valeur de la commande* (`.inc(amount)`), pas de 1 — un compteur peut avancer par pas arbitraires tant qu'il ne recule pas. Nous verrons plus loin que le label `restaurant_id` est acceptable ici mais mérite prudence.

---

## PromQL, construit brique par brique

PromQL est un petit langage, mais sa logique est particulière. La meilleure façon de l'apprendre est de partir du compteur brut et d'ajouter une couche à la fois, en comprenant chaque requête plutôt qu'en la copiant.

### Sélectionner et filtrer

La requête la plus simple est le nom d'une métrique. Elle renvoie la valeur courante de toutes les séries portant ce nom :

```promql
http_requests_total
```

On restreint avec des labels entre accolades. Égalité stricte :

```promql
http_requests_total{method="GET"}
```

Filtre par expression régulière avec `=~` — ici toutes les routes sous `/api/` :

```promql
http_requests_total{endpoint=~"/api/.*"}
```

Et l'on combine plusieurs filtres, qui se cumulent en ET logique :

```promql
http_requests_total{method="GET", status="200"}
```

À ce stade, on lit encore des valeurs brutes de compteur — ce qui, on l'a dit, n'a presque jamais de sens en soi. La suite corrige cela.

### `rate()` : du compteur au débit

Le compteur brut monte sans fin ; ce qui nous intéresse est sa **pente**. `rate()` calcule l'**augmentation par seconde**, moyennée sur une fenêtre de temps. Cette requête donne le nombre de requêtes par seconde, lissé sur les 5 dernières minutes :

```promql
rate(http_requests_total[5m])
```

Le `[5m]` est un **range selector** : il indique à `rate()` de regarder tous les points des 5 dernières minutes pour estimer la pente. Une fenêtre plus large lisse davantage (utile pour les alertes, qu'on ne veut pas nerveuses) ; une fenêtre plus étroite réagit plus vite (utile pour le diagnostic en direct). Vertu cachée de `rate()` : il gère automatiquement les **remises à zéro** du compteur lors d'un redémarrage, sans produire de pente négative aberrante.

Il existe une variante, `irate()`, qui ne considère que les *deux derniers* points de la fenêtre. Elle est plus réactive mais bruitée ; on la réserve aux graphes de diagnostic à haute résolution, et on garde `rate()` pour tout le reste, notamment les alertes.

Quand on veut le **total** d'événements sur une période plutôt qu'un débit, on utilise `increase()`. Cette requête donne le nombre de requêtes survenues dans la dernière heure :

```promql
increase(http_requests_total[1h])
```

`increase()` n'est en réalité que `rate()` multiplié par la durée de la fenêtre — même robustesse aux redémarrages, mais exprimé en volume plutôt qu'en débit.

### Agréger : `sum`, `avg`, et la subtilité de `by`

Une application tourne en général sur plusieurs instances, chacune produisant sa propre série. Pour obtenir une vue d'ensemble, on **agrège**. La somme du débit total, toutes séries confondues :

```promql
sum(rate(http_requests_total[5m]))
```

Ici arrive un point de syntaxe qu'il faut absolument tenir droit. La clause **`by (label)` ne s'utilise jamais seule : elle qualifie toujours un opérateur d'agrégation** comme `sum`, `avg`, `max`. Elle indique selon quelle dimension regrouper. Cette requête ventile le débit par endpoint — un résultat par route :

```promql
sum(rate(http_requests_total[5m])) by (endpoint)
```

Lisez-la de l'intérieur vers l'extérieur : `rate()` calcule un débit par série ; `sum(...) by (endpoint)` additionne ces débits en les regroupant par valeur d'`endpoint`, en écrasant tous les autres labels. C'est l'idiome le plus courant de PromQL, et il faut le lire couramment.

`by` a un miroir, `without`, qui exprime le regroupement par la négative : « agrège en ignorant *ces* labels-là, garde tous les autres ». `sum(...) without (instance)` additionne à travers les instances tout en conservant méthode, endpoint et statut. Les deux sont utiles : `by` quand on sait ce qu'on veut garder, `without` quand on sait ce qu'on veut effacer.

Les autres agrégateurs suivent la même mécanique — moyenne, maximum, et le comptage du *nombre de séries* (précieux, on le verra, pour surveiller la cardinalité) :

```promql
avg(http_request_duration_seconds)
max(http_request_duration_seconds)
count(http_requests_total)
```

### Les percentiles : `histogram_quantile`

Voici le paiement du travail d'instrumentation par histogramme. `histogram_quantile()` reconstitue un percentile à partir des buckets cumulatifs. La latence P95 sur 5 minutes :

```promql
histogram_quantile(
  0.95,
  rate(http_request_duration_seconds_bucket[5m])
)
```

Décortiquons, car cette requête concentre plusieurs idées. On applique d'abord `rate()` aux séries `_bucket` — car les buckets sont des compteurs, il faut les convertir en débit avant tout traitement. Puis `histogram_quantile(0.95, ...)` lit la forme de la distribution à travers les buckets et interpole la valeur sous laquelle tombent 95 % des observations. Le `0.95` est le quantile ; `0.50` donnerait la médiane, `0.99` le P99.

Pour obtenir un percentile **par endpoint**, il y a un piège classique. `histogram_quantile` a besoin du label `le` pour lire les buckets. Si l'on agrège, on doit donc **conserver `le`** dans le `by`, en plus de la dimension voulue :

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
)
```

Oublier `le` dans ce `by` est l'une des erreurs PromQL les plus fréquentes : la requête ne renvoie rien ou des valeurs absurdes, parce que `histogram_quantile` ne retrouve plus la structure des buckets.

Pourquoi les percentiles plutôt qu'une moyenne ? Parce qu'une **latence moyenne ment**. Si 99 requêtes répondent en 10 ms et une en 10 s, la moyenne affiche ~110 ms — un chiffre que personne n'a vécu. Le P99, lui, dit la vérité : 1 % de vos utilisateurs attendent 10 secondes. On pilote une latence sur ses percentiles hauts, jamais sur sa moyenne.

### Le taux d'erreur : une division de deux `rate`

Le taux d'erreur est un ratio : débit des erreurs sur débit total. On sélectionne les statuts 5xx par regex `status=~"5.."` (deux caractères après le 5), et on divise :

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

Le même calcul ventilé par endpoint — utile pour repérer *quelle* route casse — se fait en ajoutant `by (endpoint)` des deux côtés. Prometheus apparie alors numérateur et dénominateur par endpoint :

```promql
sum(rate(http_requests_total{status=~"5.."}[5m])) by (endpoint)
/
sum(rate(http_requests_total[5m])) by (endpoint)
```

### Les quatre signaux d'or

Ces briques suffisent à couvrir les **Four Golden Signals** de la méthode SRE de Google — le socle de surveillance suffisant pour la plupart des services. La **latence** est le P95 vu plus haut. Le **trafic** est le débit total `sum(rate(http_requests_total[5m]))`. Les **erreurs**, le ratio ci-dessus, multiplié par 100 pour un pourcentage :

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
* 100
```

La **saturation** enfin — ici l'usage CPU. La subtilité : `node_cpu_seconds_total` avec `mode="idle"` mesure le temps *inactif* ; on calcule donc le débit d'inactivité et on le soustrait de 100 pour obtenir le pourcentage occupé :

```promql
100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

### Quelques requêtes avancées utiles

Compter les requêtes ayant dépassé **1 seconde** se fait par une soustraction de buckets — et c'est un endroit où l'intuition dérape souvent. Les buckets étant cumulatifs, le bucket `le="+Inf"` compte *toutes* les requêtes, et `le="1.0"` compte celles de 1 s ou moins. Leur **différence** est exactement le nombre de requêtes strictement au-dessus de 1 s :

```promql
sum(rate(http_request_duration_seconds_bucket{le="+Inf"}[5m]))
-
sum(rate(http_request_duration_seconds_bucket{le="1.0"}[5m]))
```

La bonne borne haute est `le="+Inf"` (le total), pas un autre seuil : c'est ce qui garantit qu'on capture *toutes* les requêtes lentes, quelle que soit leur durée.

Deux fonctions travaillent sur les jauges. `predict_linear` extrapole une tendance par régression linéaire — ici, la mémoire prévue dans 3600 secondes (une heure), pour alerter *avant* de saturer plutôt qu'après :

```promql
predict_linear(memory_usage_bytes[1h], 3600)
```

Et `deriv` donne la dérivée instantanée d'une jauge (sa vitesse de variation par seconde), là où `rate`/`increase` sont réservés aux compteurs :

```promql
deriv(memory_usage_bytes[5m])
```

Enfin, PromQL brille sur le métier. Chiffre d'affaires par seconde, panier moyen (CA divisé par nombre de commandes), top 10 des restaurants par volume avec `topk`, ou CA cumulé sur 24 h :

```promql
sum(rate(revenue_total_euros[5m]))

sum(rate(revenue_total_euros[5m])) / sum(rate(orders_created_total[5m]))

topk(10, sum(rate(orders_created_total[5m])) by (restaurant_id))

sum(increase(revenue_total_euros[1d]))
```

Le panier moyen mérite un mot : on divise deux compteurs *transformés en débit*. Diviser les compteurs bruts donnerait un cumul depuis le démarrage du process, dénué de sens ; passer par `rate()` des deux côtés donne bien le panier moyen *sur la fenêtre récente*.

---

## Recording rules, alerting rules et Alertmanager

Deux besoins émergent en production : accélérer les requêtes lourdes, et transformer des seuils en actions. Prometheus répond au premier avec les **recording rules**, au second avec les **alerting rules**, et délègue la distribution des alertes à **Alertmanager**.

### Recording rules : précalculer pour aller vite

Une requête comme un P95 par endpoint sur un gros volume est coûteuse à évaluer à chaque affichage. Une **recording rule** l'évalue à intervalle régulier et **stocke le résultat comme une nouvelle métrique**. Le dashboard interroge alors cette métrique pré-agrégée, instantanée à afficher. C'est du cache calculé : on paie le calcul une fois par intervalle au lieu d'une fois par consultation. À utiliser dès qu'une requête est à la fois lourde et souvent affichée.

### Alerting rules : du seuil à la notification

Une **alerting rule** est une requête PromQL assortie d'une condition et d'une temporisation. Voici une règle de taux d'erreur, dans le format YAML des `ConfigMap` Kubernetes :

```yaml
groups:
  - name: api_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))
          * 100
          > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}% (threshold: 5%)"
```

Le champ décisif est **`for: 5m`**. Il exige que la condition reste vraie **pendant 5 minutes continues** avant de déclencher. C'est l'anti-flapping : un pic d'erreurs de trois secondes n'a pas à réveiller quelqu'un. Les `labels` (comme `severity: critical`) serviront au routage ; les `annotations` composent le message, avec `{{ $value }}` interpolé à la valeur mesurée.

Le même schéma couvre les autres cas classiques. Latence P95 au-delà de 500 ms :

```yaml
      - alert: HighLatency
        expr: |
          histogram_quantile(
            0.95,
            rate(http_request_duration_seconds_bucket[5m])
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency is {{ $value }}s (threshold: 0.5s)"
```

Service tombé — la métrique `up` d'une cible passe à 0 dès qu'un scrape échoue, ce qui donne la sonde de disponibilité la plus directe :

```yaml
      - alert: ServiceDown
        expr: up{job="n8n-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
          description: "{{ $labels.instance }} has been down for > 1 minute"
```

On construit sur le même modèle les alertes d'infrastructure : CPU occupé au-dessus de 80 % (`100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80`), mémoire au-delà de 90 % (`(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90`), ou espace disque libre sous 10 % (`(node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 10`).

Un principe transcende ces exemples : **alertez sur les symptômes, pas sur les causes**. « CPU > 80 % » est une cause — un CPU chargé n'est pas un problème s'il sert vite. « P95 > 500 ms » est un symptôme — c'est ce que l'utilisateur subit. Une bonne alerte réveille quelqu'un parce que le service *fait mal son travail*, pas parce qu'une jauge interne franchit un seuil sans conséquence perceptible.

### Alertmanager : router, grouper, faire taire

Prometheus **déclenche** les alertes ; il ne les **distribue** pas. Ce rôle revient à **Alertmanager**, un composant séparé qui reçoit les alertes actives et décide qui prévenir, comment et quand. Sa configuration s'articule autour d'un **arbre de routage** :

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: pagerduty
      continue: true
    - match:
        severity: warning
      receiver: slack
```

Trois idées structurent ce fichier. Le **groupement** (`group_by`) fusionne les alertes liées en une seule notification : si vingt pods tombent d'un coup, on reçoit *un* message groupé, pas vingt bips. Le **routage par label** dirige selon la sévérité — les `critical` vers PagerDuty (astreinte), les `warning` vers Slack. Et la **répétition** (`repeat_interval: 12h`) évite de rappeler la même alerte non résolue toutes les cinq minutes.

Les `receivers` déclarent les canaux concrets — e-mail, PagerDuty, webhook Slack — avec les templates de message. Le `send_resolved: true` de Slack ajoute la courtoisie de notifier aussi la *résolution* d'une alerte, pas seulement son déclenchement. Alertmanager sait par ailleurs **inhiber** (taire une alerte quand une plus grave la subsume) et **mettre en silence** (couper temporairement le bruit pendant une maintenance planifiée) — deux soupapes essentielles pour que l'astreinte reste crédible.

---

## Cardinalité et coût : le piège numéro un

Revenons au modèle de données, car c'est là que se joue la facture. On l'a posé : **chaque combinaison unique de labels crée une série temporelle distincte**, et chaque série coûte de la mémoire et du disque en continu. Le nombre de séries d'une métrique est le **produit** du nombre de valeurs de chacun de ses labels. C'est ce produit qu'on appelle la **cardinalité**, et il explose vite.

Comparez deux choix de label. `http_requests_total{endpoint="/api/users"}` a une **cardinalité basse** : une application a quelques dizaines de routes, bornées et connues. Aucun problème. Mais `http_requests_total{user_id="12345"}` a une **cardinalité potentiellement illimitée** : un label par utilisateur, c'est autant de séries que d'utilisateurs — des millions. Multipliée par les autres labels (méthode, statut, endpoint), la combinatoire fait s'effondrer Prometheus sous la mémoire.

La règle est nette : **un label doit avoir un ensemble de valeurs petit et borné**. Bons candidats : méthode HTTP, code de statut, endpoint, nom de service, région. Mauvais candidats, à bannir : identifiant utilisateur, e-mail, ID de requête, URL complète avec paramètres, timestamp — tout ce qui est de haute ou d'infinie cardinalité. C'est ce qui justifie la prudence évoquée plus haut sur `restaurant_id` : acceptable avec quelques centaines de restaurants, dangereux avec des millions.

L'insidieux, c'est que **la cardinalité ne se voit pas venir** : la métrique fonctionne parfaitement en développement avec dix utilisateurs de test, puis fait tomber Prometheus en production. D'où l'utilité de surveiller `count(http_requests_total)` : une série qui grimpe sans raison métier signale une fuite de cardinalité en cours.

Deux autres coûts, plus prévisibles. La **rétention** : Prometheus conserve par défaut les données une durée bornée (souvent 15 ou 30 jours) car le stockage local n'est pas fait pour l'archivage longue durée — pour garder des mois ou des années, on adosse une solution comme **Thanos** ou **Cortex**. Et le **scrape interval** : 15 secondes est un bon compromis résolution/coût ; le descendre à 5 s triple le volume de données pour un gain rarement décisif. On l'ajuste sciemment, pas par réflexe.

---

## Grafana : visualiser avec intention

Prometheus stocke et calcule ; il ne dessine pas. **Grafana** se branche sur son moteur de requêtes et transforme les PromQL en panneaux. La tentation est de multiplier les graphiques ; la discipline est de choisir, pour chaque panneau, le *type* qui sert l'intention.

Un **graph** (courbe temporelle) sert à voir une **évolution** et à corréler. Sur un même panneau « Request Rate », superposer le trafic total et le débit d'erreurs 5xx (`sum(rate(http_requests_total[5m]))` et sa variante filtrée `status=~"5.."`) permet de lire d'un coup d'œil si un pic d'erreurs coïncide avec un pic de charge. La courbe est le bon choix quand la *forme dans le temps* porte l'information.

Un **stat** affiche un **chiffre unique** avec des seuils de couleur. Pour un taux d'erreur (`... / ... * 100`), on colore vert sous 1 %, jaune de 1 à 5 %, rouge au-delà. Le compromis assumé : on perd l'historique, on gagne une lecture instantanée « est-ce que ça va, oui ou non ». Idéal pour un mur d'écran d'astreinte.

Une **gauge** (cadran) convient à une valeur **bornée entre un minimum et un maximum**, comme les connexions actives (`http_requests_active`) sur une échelle de 0 à 300 avec des paliers de couleur. Elle répond à « où en suis-je par rapport au plafond ». Elle n'a de sens que si le maximum est réel et connu.

Une **table** sert à **classer et comparer** des entités discrètes. Un `topk(10, sum(rate(http_requests_total[5m])) by (endpoint))` liste les dix endpoints les plus sollicités, triés. Là où une courbe noierait dix séries dans un plat de spaghetti, la table donne un classement lisible.

Le trade-off transversal de Grafana tient en une phrase : **plus un dashboard est riche, moins il est lisible sous stress**. À 3h du matin, un tableau de bord de quarante panneaux est inutilisable. Les meilleurs dashboards tiennent sur un écran, s'ouvrent sur les quatre signaux d'or, et laissent les détails aux vues de forage secondaires.

Un dernier principe, souvent négligé : **un dashboard n'est pas une alerte**. Le dashboard sert à l'**exploration** — on le regarde quand on cherche. L'alerte sert à l'**action** — elle vient vous chercher. Grafana sait faire les deux (on peut attacher une condition d'alerte à un panneau), mais confondre les rôles mène soit à des dashboards qu'il faut fixer en permanence, soit à des alertes qu'on ne voit jamais. Séparez l'exploration de l'astreinte.

---

## À retenir

1. **Le modèle pull est un choix, pas un défaut.** Prometheus va chercher les métriques, ce qui donne la détection de panne (`up == 0`) et le service discovery gratuitement — au prix de l'accessibilité réseau des cibles et du Pushgateway pour les jobs courts.

2. **Une série = un nom + un jeu de labels.** Chaque combinaison unique de labels est une série distincte qui coûte de la mémoire. Toute l'économie de Prometheus découle de cette phrase.

3. **Choisir le bon type de métrique conditionne tout.** Counter pour ce qui monte (à lire via `rate()`), gauge pour un état instantané, histogram pour une distribution, summary presque jamais. Histogramme sur summary, par défaut.

4. **Ne lisez jamais un compteur brut ; appliquez `rate()`.** Et pour agréger, `by (label)` accompagne toujours un agrégateur (`sum(...) by (endpoint)`) — jamais seul.

5. **Pilotez la latence sur ses percentiles, pas sa moyenne.** `histogram_quantile(0.95, rate(..._bucket[5m]))`, en pensant à garder le label `le` dans tout `by`.

6. **La cardinalité est le piège de coût numéro un.** Des labels bornés (endpoint, statut, région) ; jamais d'identifiant utilisateur, d'URL complète ou d'ID de requête en label. Surveillez `count(...)`.

7. **Alertez sur les symptômes, avec un `for:`.** « P95 > 500 ms » plutôt que « CPU > 80 % », et une temporisation pour ne pas réveiller quelqu'un sur un pic de trois secondes. Le dashboard explore, l'alerte agit.

---

## Pour aller plus loin

- **Installation industrielle** : le chart Helm `kube-prometheus-stack` déploie d'un coup Prometheus, Grafana, Alertmanager, Node Exporter et l'operator ; c'est le point de départ recommandé sur Kubernetes, avant toute config manuelle.
- **Exporters** : pour les composants qu'on ne peut pas instrumenter soi-même (Postgres, Redis, la machine hôte), un **exporter** est un petit process qui expose leurs métriques au format Prometheus. `node_exporter` (métriques système) est le plus courant ; il en existe un pour presque tout.
- **Rétention longue durée** : **Thanos** et **Cortex** ajoutent le stockage objet, la haute disponibilité et la vue globale multi-cluster que la TSDB locale ne vise pas.
- **Méthodes de surveillance** : creuser les **Four Golden Signals** (Google SRE) et la méthode **USE** (Utilization, Saturation, Errors) de Brendan Gregg pour structurer *quoi* mesurer avant de se demander *comment*.
- **Fiabilité de l'astreinte** : approfondir l'inhibition et les silences d'Alertmanager, et tester régulièrement les alertes (les faire se déclencher volontairement) — une alerte jamais vérifiée est une alerte dont on ignore si elle fonctionne.
