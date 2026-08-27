# SRE & Observabilité — comprendre la fiabilité comme une ressource

Il y a une phrase du *Google SRE Book* qui résume tout le reste : **« Hope is not a strategy. »** L'espoir n'est pas une stratégie. C'est une remarque anodine en apparence, mais elle contient un renversement complet de la façon dont on pense l'exploitation des systèmes. Ce chapitre déplie ce renversement, puis en tire toutes les conséquences pratiques : comment on mesure la fiabilité, comment on l'observe, comment on décide, et comment on la met à l'épreuve.

L'objectif n'est pas de vous donner une checklist de plus, mais de vous faire *comprendre* pourquoi le SRE est construit comme il l'est. Une fois la logique interne saisie, les outils (Prometheus, OpenTelemetry, Grafana) deviennent des détails d'implémentation.

---

## 1. Pourquoi le SRE existe : la fiabilité est une feature qu'on budgète

### Le problème que le SRE résout

Avant le SRE, l'exploitation d'un système reposait sur un conflit structurel. D'un côté, les **développeurs** sont incités à livrer vite : leur valeur se mesure en fonctionnalités expédiées. De l'autre, les **opérations** sont incitées à ne rien casser : leur valeur se mesure en stabilité. Ces deux forces tirent dans des directions opposées, et le résultat est un affrontement permanent — le fameux *blame game*. Quand quelque chose casse, chaque camp a une raison légitime d'accuser l'autre.

Le problème profond, c'est que ce débat est **subjectif**. « On doit livrer ! » contre « C'est trop risqué ! » : qui a raison ? La question est indécidable, parce qu'il n'existe aucune métrique commune sur laquelle trancher. Chacun défend sa fonction, et l'arbitrage se fait à l'autorité, à la fatigue, ou au dernier incident en date.

### L'intuition : la fiabilité n'est pas gratuite, et 100 % n'est pas la cible

Voici le retournement fondamental. La mentalité traditionnelle dit : *« On espère que ça ne tombe pas. »* La mentalité SRE dit : *« On SAIT que ça va tomber, et on a un budget pour ça. »*

L'analogie utile est celle d'un **budget financier**. Une entreprise ne cherche pas à dépenser zéro — elle cherche à dépenser de manière optimale dans une enveloppe donnée. De la même façon, un système ne cherche pas une fiabilité de 100 %. Ce serait absurde : chaque « neuf » supplémentaire coûte de façon exponentielle, et au-delà d'un certain point, l'utilisateur ne perçoit même plus la différence — sa connexion réseau ou son propre téléphone sont moins fiables que votre service. Viser 100 % revient à brûler de l'argent pour une amélioration invisible, tout en s'interdisant de livrer quoi que ce soit de nouveau.

Donc la fiabilité devient une **ressource qu'on dépense volontairement**. Une certaine dose d'indisponibilité est *permise*, et cette permission a une valeur : elle achète de la vélocité, des expérimentations, des déploiements risqués.

### Le déblocage : une métrique objective remplace le conflit

Le conflit dev/ops disparaît dès qu'on introduit un chiffre partagé. Au lieu de « On veut livrer vite » contre « On veut de la stabilité », on obtient :

> On dispose d'un **budget d'erreur** de 0,1 %. Livrez tout ce que vous voulez tant que vous restez dans le budget.

Les deux camps poursuivent désormais le même objectif : **maximiser les fonctionnalités livrées à l'intérieur du budget**. Ce n'est plus une négociation d'egos, c'est une contrainte d'optimisation. Et une contrainte, ça se calcule.

**Le compromis à garder en tête :** cette approche ne fonctionne que si le budget est réellement mesuré et réellement respecté. Un budget d'erreur que personne ne track, ou qu'on ignore dès qu'une deadline commerciale approche, ne vaut rien — on retombe immédiatement dans le débat subjectif. La discipline de mesure est le prix d'entrée.

---

## 2. SLI, SLO, SLA : le vocabulaire de la fiabilité

Trois sigles reviennent sans cesse, on les confond souvent, et pourtant ils désignent trois niveaux bien distincts. Voici la pyramide, de la mesure brute jusqu'au contrat commercial :

```
                    ┌───────────────┐
                    │      SLA      │   Contrat business, avec pénalités
                    │     99,9 %    │   (« si on descend en dessous, on paie »)
                    └───────┬───────┘
                            │  on se garde une marge
                  ┌─────────▼─────────┐
                  │        SLO        │   Objectif interne, plus strict
                  │      99,95 %      │   (la cible qu'on s'impose)
                  └─────────┬─────────┘
                            │  on cherche à l'atteindre
              ┌─────────────▼─────────────┐
              │            SLI            │   Mesure réelle, en continu
              │   latence p99 < 200 ms    │
              │   taux d'erreur < 0,01 %  │
              │   disponibilité > 99,99 % │
              └───────────────────────────┘
```

### SLI — ce qu'on mesure

Le **SLI** (*Service Level Indicator*) est une mesure quantitative du comportement du service. C'est la donnée brute, factuelle : *quelle fraction des requêtes ont réussi ? quelle est la latence au 99e percentile ?* Un bon SLI est une fraction : `événements bons / événements totaux`. C'est le socle : sans mesure honnête, tout le reste s'écroule.

Le type de SLI pertinent dépend de la nature du service. Une API se juge sur sa disponibilité, sa latence et son taux d'erreur. Un pipeline de données se juge plutôt sur la **fraîcheur** (les données sont-elles à jour ?), la **justesse** et la **couverture**. Un système de stockage ajoute la **durabilité** (ne pas perdre les données). Un service de streaming regarde le **débit** et le **lag de partition**. Choisir le bon SLI, c'est déjà comprendre ce que « bien fonctionner » veut dire pour *ce* service précis.

### SLO — ce qu'on vise

Le **SLO** (*Service Level Objective*) est la cible qu'on assigne à un SLI sur une fenêtre de temps donnée. Par exemple : *« la disponibilité doit être ≥ 99,95 % sur 30 jours glissants »*. C'est un objectif interne, un engagement que l'équipe se donne à elle-même.

Le choix du SLO est **l'art du compromis** central de tout ce chapitre. Voici ce que coûte réellement chaque niveau de « neufs », en indisponibilité mensuelle autorisée :

```
99 %       (2 neufs)  →  7,3 heures/mois   →  services internes, MVP
99,9 %     (3 neufs)  →  43,8 min/mois     →  production standard
99,95 %               →  21,9 min/mois     →  services critiques
99,99 %    (4 neufs)  →  4,38 min/mois     →  infrastructure cœur
99,999 %   (5 neufs)  →  26,3 sec/mois     →  quasi impossible, très coûteux
```

Ce tableau est l'outil de décision le plus important du SRE. Chaque ligne franchie multiplie le coût — en ingénierie, en redondance, en astreinte — pour un gain d'indisponibilité de plus en plus mince. Passer de 99,9 % à 99,99 %, c'est diviser par dix le temps d'arrêt toléré (de 44 minutes à 4 minutes par mois), ce qui veut dire des mécanismes de bascule automatiques, du multi-région, une détection en secondes. On ne monte d'un cran que si l'utilisateur, ou le contrat, l'exige vraiment.

### SLA — ce qu'on promet (avec des pénalités)

Le **SLA** (*Service Level Agreement*) est le contrat commercial avec le client : *« si la disponibilité descend sous 99,9 %, vous êtes remboursé de X %. »* C'est du droit, de l'argent, du juridique.

**La règle d'or : le SLO interne est toujours plus strict que le SLA externe.**

```
SLO_interne  =  SLA_externe  +  marge de sécurité

Si SLA = 99,9 %,  alors SLO = 99,95 %  ou  99,99 %
```

La raison est simple et pédagogique : vous voulez que votre alerte interne se déclenche *avant* que le contrat ne soit rompu. Si SLA et SLO étaient identiques, le jour où vous violez votre objectif serait aussi le jour où vous devez de l'argent à vos clients. La marge est votre coussin — le moment où vous vous inquiétez en interne bien avant que le client ne s'en aperçoive.

### Error budget : le chiffre qui change les décisions

C'est ici que la théorie devient un levier opérationnel. Le **budget d'erreur** est simplement le complément du SLO :

```
Error Budget = 1 − SLO
```

Avec un SLO de 99,9 %, le budget d'erreur est de **0,1 %**, soit **43,8 minutes d'indisponibilité autorisées par mois**. Ce n'est pas un chiffre honteux à cacher — c'est une **enveloppe de dépense**. On peut la ventiler comme un budget :

```
Budget total du mois : 43,8 min
├── Incidents production   : −15 min
├── Déploiements risqués   : −10 min
├── Maintenance planifiée  :  −5 min
└── Marge restante         :  13,8 min
```

Chaque déploiement risqué, chaque migration, chaque expérimentation « dépense » une partie de ce budget. Tant qu'il en reste, on avance. Quand il est épuisé, on s'arrête.

### Le burn rate : à quelle vitesse on brûle

Le budget restant est une photo ; le **burn rate** (taux de consommation) est la vitesse. Il répond à la question : *est-ce qu'on dépense trop vite ?*

```
burn_rate = taux_d'erreur_observé / budget_d'erreur

burn_rate = 1  →  on consomme exactement au rythme prévu (le budget durera pile la fenêtre)
burn_rate > 1  →  on consomme plus vite que prévu (le budget s'épuisera avant la fin)
burn_rate = 14 →  on brûle 14 heures de budget en 1 heure
```

Prenons l'exemple concret du guide, et vérifions les chiffres. Un mois fait 43 200 minutes. Avec un SLO de 99,9 %, le budget autorisé est de **43,8 minutes**. Supposons qu'on ait réellement tenu **99,85 %** de disponibilité ce mois-ci. L'indisponibilité effective vaut :

```
downtime réel = 43 200 min × (1 − 0,9985) = 43 200 × 0,0015 = 64,8 min

budget restant = 43,8 − 64,8 = −21 minutes
```

Le résultat est **négatif** : on a consommé 21 minutes de plus que ce à quoi on avait droit. On est **hors budget**. Et un nombre négatif n'est pas une opinion — c'est un fait qui déclenche une politique.

### Comment le budget change vraiment les décisions

Voici le point que la plupart des équipes ratent : le budget d'erreur ne sert à rien s'il ne **pilote pas des décisions automatiques**. On y attache une **politique** (*error budget policy*), connue de tous à l'avance, qui retire l'arbitraire du moment :

```
Budget restant > 50 %       → Livraisons libres. Déploiements risqués OK.
                              Expérimentation encouragée.

Budget restant 25–50 %      → Livraisons avec prudence. Les déploiements
                              risqués demandent une validation.
                              On commence à investir en fiabilité.

Budget restant 0–25 %       → Gel des features. Seulement bug fixes et
                              travail de fiabilité. Postmortem obligatoire
                              pour chaque incident.

Budget épuisé (≤ 0 %)       → Gel complet. Toute l'équipe sur la fiabilité.
                              Escalade au leadership. Envisager un rollback
                              des changements récents.
```

C'est la mécanique qui **résout** le conflit dev/ops posé au début. Le système devient **auto-régulé** : une équipe qui livre du code instable brûle son budget et se retrouve gelée — la conséquence tombe automatiquement, sans qu'un chef ait à trancher. À l'inverse, une équipe qui investit en qualité garde son budget intact et peut livrer davantage. La fiabilité devient rentable pour ceux qui la produisent.

Et surtout, cette approche **retire le blâme**. « On a consommé notre budget » n'est pas « Tu as cassé la prod ». C'est une ressource qui s'épuise, comme un budget cloud ou des crédits d'API. On en parle en adultes.

Pour le CTO, cela redéfinit le rôle : négocier les SLO avec le business, faire respecter les politiques *sans exception* (une seule exception et le système perd toute crédibilité), et protéger le budget d'erreur comme une **ressource stratégique**. Le trade-off devient explicite au lieu d'être implicite : le product peut dire « on accepte tel niveau d'indisponibilité pour livrer telle feature », et c'est une décision assumée, pas un accident.

---

## 3. Observer un système : les trois piliers

Mesurer un SLO suppose qu'on sache ce qui se passe à l'intérieur du système. C'est le domaine de l'**observabilité**. Mais attention à ne pas confondre deux choses proches.

### Monitoring vs observabilité

Le **monitoring** vous dit *quand* quelque chose va mal. Il repose sur des métriques prédéfinies, des tableaux de bord et des alertes connues à l'avance. Il répond à une question fermée : *« Est-ce que X fonctionne ? »*

L'**observabilité** vous permet de comprendre *pourquoi*. Elle repose sur des données riches (haute cardinalité, on y revient) qui permettent d'explorer des problèmes qu'on n'avait pas anticipés. Elle répond à une question ouverte : *« Pourquoi X ne fonctionne pas pour cet utilisateur précis, sur ce navigateur, dans cette région ? »*

L'analogie est celle de la voiture. Le monitoring, c'est le **tableau de bord** : vitesse, température, niveau d'essence — des jauges connues d'avance qui vous alertent quand un seuil est franchi. L'observabilité, c'est la capacité à **ouvrir le capot et diagnostiquer n'importe quel problème**, y compris ceux dont vous n'aviez jamais entendu parler. Le premier vous prévient ; le second vous permet d'enquêter.

L'observabilité se construit classiquement sur **trois piliers** : les logs, les métriques et les traces. Chacun répond à une question différente.

```
   ┌──────────┐      ┌──────────┐      ┌──────────┐
   │   LOGS   │      │ METRICS  │      │  TRACES  │
   │          │      │          │      │          │
   │  « Que   │      │ « Combien│      │ « Où est │
   │  s'est-  │      │  y en    │      │  passé   │
   │  il      │      │  a-t-il  │      │  le      │
   │  passé » │      │  » ?     │      │  temps » │
   └────┬─────┘      └────┬─────┘      └────┬─────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
             ┌──────────────────────────┐
             │   COUCHE DE CORRÉLATION   │
             │  trace_id, span_id,       │
             │  request_id               │
             └────────────┬─────────────┘
                          ▼
             ┌──────────────────────────┐
             │      REQUÊTE UNIFIÉE      │
             │ « les logs de la trace X »│
             │ « les traces de l'erreur Y »│
             │ « les métriques du service Z »│
             └──────────────────────────┘
```

La magie n'opère que si les trois piliers partagent un identifiant commun (le `trace_id`), qui permet de passer de l'un à l'autre. On y revient à la fin de cette section.

### Pilier 1 — Les logs : « que s'est-il passé »

Un log raconte un événement précis. Le progrès majeur des dix dernières années tient en deux mots : **log structuré**. Comparez.

Un log non structuré, c'est une phrase pour humain :

```
2024-01-15 10:23:45 ERROR Payment failed for user 12345, amount $99.99
```

Elle se lit bien à l'œil, mais elle est illisible pour une machine : impossible de filtrer « toutes les erreurs de paiement au-dessus de 50 $ » sans écrire des expressions régulières fragiles. Un log structuré est un objet, typiquement du JSON :

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "ERROR",
  "service": "payment-service",
  "version": "1.2.3",
  "environment": "production",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "message": "Payment failed",
  "context": {
    "user_id": "12345",
    "amount": 99.99,
    "currency": "USD",
    "payment_method": "credit_card",
    "error_code": "INSUFFICIENT_FUNDS"
  },
  "error": {
    "type": "PaymentDeclinedException",
    "message": "Card declined by issuer"
  }
}
```

Chaque champ devient interrogeable. Remarquez le `trace_id` : c'est le fil qui reliera ce log à sa métrique et à sa trace. C'est ce qui transforme une pile de logs en un système observable.

Côté outillage, un pipeline de logs suit toujours la même forme : **collecte** (Fluent Bit, Vector, Filebeat qui ramassent les logs sur les machines), **transport** (Kafka ou NATS quand le volume l'exige, sinon envoi direct), **stockage et requête**, puis **visualisation** (Kibana, Grafana). Le choix du moteur de stockage est un arbitrage coût/puissance :

| Solution | Force | Faiblesse | Cas d'usage |
|---|---|---|---|
| **ELK / Elasticsearch** | Puissant, recherche riche | Gourmand en ressources | Entreprise, recherche complexe |
| **Loki** | Léger, économique | Moins de fonctionnalités | Cloud-native, Kubernetes |
| **ClickHouse** | Très rapide, analytique | Complexe à exploiter | Gros volumes, analytics |
| **CloudWatch** | Intégré à AWS | Verrouillage fournisseur | Stack 100 % AWS |

Le compromis structurant des logs : ils sont d'une **richesse maximale** (tout le contexte y est) mais aussi les **plus coûteux à stocker** à grande échelle. On garde tout, mais pas éternellement.

### Pilier 2 — Les métriques : « combien »

Une métrique est un nombre agrégé dans le temps. C'est le pilier le moins cher : au lieu de stocker chaque événement, on stocke des compteurs et des distributions. En Prometheus, il en existe quatre types, et bien les distinguer évite des erreurs classiques.

- **Counter** — une valeur qui ne fait que **monter** (nombre total de requêtes, d'erreurs). On ne lit jamais sa valeur brute, on lit son *taux de croissance*.
- **Gauge** — une valeur qui **monte et descend** (connexions actives, mémoire utilisée, température).
- **Histogram** — une **distribution**. Les valeurs sont réparties dans des tranches (*buckets*) prédéfinies, ce qui permet de calculer les percentiles côté serveur.
- **Summary** — proche de l'histogram, mais les quantiles sont calculés côté client. Moins flexible pour l'agrégation.

```python
from prometheus_client import Counter, Gauge, Histogram

http_requests_total = Counter(
    'http_requests_total', 'Total HTTP requests',
    ['method', 'endpoint', 'status'])
# http_requests_total.labels('GET', '/api/users', '200').inc()

active_connections = Gauge(
    'active_connections', 'Active connections', ['service'])
# active_connections.labels('api').set(42)

http_request_duration = Histogram(
    'http_request_duration_seconds', 'Request duration',
    ['method', 'endpoint'],
    buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10])
# http_request_duration.labels('GET', '/api').observe(0.042)
```

**Les quatre signaux d'or.** Google a distillé, à partir de milliers de services, quatre métriques qui suffisent à couvrir la santé de presque n'importe quel service en ligne. Ce sont **les quatre signaux d'or** :

1. **Latency** — le temps de réponse. Attention : on mesure les **percentiles** (p50, p95, p99), jamais la moyenne. La moyenne ment ; elle noie les utilisateurs les plus mal servis. Et on distingue la latence des requêtes réussies de celle des requêtes échouées (une erreur qui répond en 2 ms peut fausser une moyenne de latence si on la compte comme « rapide »).
2. **Traffic** — le volume de demande (requêtes/seconde, sessions/minute).
3. **Errors** — le taux d'échec. Erreurs explicites (HTTP 5xx) mais aussi implicites (une réponse trop lente *est* une erreur du point de vue de l'utilisateur).
4. **Saturation** — à quel point le système est « plein » : CPU, mémoire, disque, réseau. C'est votre marge restante.

Pourquoi exactement ces quatre ? Parce qu'ils reconstruisent toute l'expérience utilisateur : **Traffic** = la demande, **Latency + Errors** = la qualité de la réponse, **Saturation** = la capacité qu'il vous reste avant de tomber. Le trafic vous dit combien de gens frappent à la porte, la latence et les erreurs vous disent s'ils sont bien reçus, la saturation vous dit dans combien de temps la porte va céder.

```python
# Traduction des 4 signaux en requêtes PromQL
latency_p99 = histogram_quantile(0.99, http_request_duration_seconds)
traffic     = rate(http_requests_total[5m])
error_rate  = rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
saturation  = avg(rate(container_cpu_usage_seconds_total[5m]))
              / avg(kube_pod_container_resource_limits_cpu_cores)
```

**Deux recettes pour ne rien oublier : RED et USE.** Les signaux d'or se déclinent en deux mnémoniques selon qu'on regarde un *service* ou une *ressource*.

La méthode **RED** s'applique aux **services** (ce que voient vos utilisateurs) :

- **R**ate — requêtes par seconde
- **E**rrors — pourcentage de requêtes en échec
- **D**uration — distribution des latences (le p99)

```
rate     : rate(http_requests_total[5m])
errors   : rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
duration : histogram_quantile(0.99, rate(http_request_duration_bucket[5m]))
```

La méthode **USE** s'applique aux **ressources** d'infrastructure (CPU, mémoire, disque) :

- **U**tilization — le taux d'occupation
- **S**aturation — la file d'attente qui se forme quand la ressource est débordée
- **E**rrors — les erreurs matérielles ou système

```
CPU     utilization : avg(rate(node_cpu_seconds_total{mode!='idle'}[5m]))
        saturation  : avg(node_load1) / count(node_cpu_seconds_total{mode='idle'})
Mémoire utilization : 1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)
        saturation  : rate(node_vmstat_pgmajfault[5m])   # page faults
        errors      : node_memory_oom_kills
Disque  utilization : 1 - (node_filesystem_avail_bytes / node_filesystem_size_bytes)
        saturation  : rate(node_disk_io_time_weighted_seconds_total[5m])
```

La règle mnémotechnique : **RED pour ce que vivent les utilisateurs, USE pour ce que vivent les machines.** Les deux sont complémentaires — RED vous dit que le service souffre, USE vous dit souvent pourquoi.

Côté architecture, **Prometheus** fonctionne par *scraping* : chaque service expose un endpoint `/metrics`, et Prometheus vient les collecter à intervalle régulier, en découvrant dynamiquement les cibles via Kubernetes ou Consul. Il stocke localement dans une base temporelle (TSDB), évalue des règles d'alerte, et délègue le stockage longue durée à Thanos ou Mimir. Grafana lit tout ça, Alertmanager route les alertes.

```
  Service A       Service B       Service C
  /metrics        /metrics        /metrics
     │               │               │
     └───────┬───────┴───────┬───────┘
             │  service discovery (K8s, Consul)
             ▼
       ┌───────────────┐
       │  PROMETHEUS   │
       │  TSDB (local) │
       │  Rules        │
       └───────┬───────┘
       ┌───────┼───────────────┐
       ▼       ▼               ▼
   Grafana  Alertmanager   Thanos / Mimir
    (UI)     (alertes)     (long terme)
```

Le compromis des métriques : elles sont **bon marché et rapides**, mais **pauvres en contexte**. Une métrique vous dit que le taux d'erreur est à 3 % ; elle ne vous dit pas *quelle* requête, *quel* utilisateur, *quelle* cause. Pour ça, il faut descendre dans les logs et les traces.

### Pilier 3 — Les traces : « où est passé le temps »

Dans un système distribué, une seule requête utilisateur traverse une dizaine de services. Quand elle est lente, la question n'est pas « le système est-il lent ? » mais « **quel maillon** de la chaîne est lent ? ». C'est exactement ce que résout le **tracing distribué**.

Le vocabulaire est simple. Une **trace** représente le parcours complet d'une requête de bout en bout ; elle porte un `trace_id` unique. Elle se décompose en **spans**, chaque span étant une opération (un appel de service, une requête SQL) avec une durée, un `span_id`, et un `parent` — le span qui l'a déclenchée. Les spans forment donc un arbre.

```
TRACE  trace_id: abc123   (durée totale : 250 ms)
│
└── API Gateway              span001   parent: —        250 ms
    ├── Auth Service         span002   parent: span001   15 ms
    ├── User Service         span003   parent: span001   45 ms
    │   └── Database Query   span004   parent: span003   20 ms
    └── Payment Service      span005   parent: span001  180 ms
        └── External Payment API  span006  parent: span005  150 ms
```

Lisez cet arbre comme un diagnostic. La requête totale prend 250 ms. En un coup d'œil, on voit que **Payment Service (180 ms)** domine tout le reste, et qu'à l'intérieur, ce sont les **150 ms de l'API de paiement externe** qui sont le vrai goulot. L'authentification (15 ms) et la base de données (20 ms) sont négligeables. Sans trace, on aurait pu passer des heures à optimiser la mauvaise partie. Avec la trace, la cause saute aux yeux.

**OpenTelemetry (OTel), le standard.** Historiquement, chaque outil de tracing avait son propre format d'instrumentation, et changer d'outil signifiait ré-instrumenter tout son code. OpenTelemetry a mis fin à cette captivité : c'est un **standard ouvert et vendeur-neutre** pour produire traces, métriques et logs. Vous instrumentez votre code une fois avec OTel, puis vous exportez vers n'importe quel backend (Jaeger, Tempo, Datadog…) sans toucher au code applicatif. C'est le point le plus stratégique du tracing moderne : **l'instrumentation est découplée du stockage**.

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="otel-collector:4317")))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

@tracer.start_as_current_span("process_payment")
def process_payment(user_id: str, amount: float):
    span = trace.get_current_span()
    span.set_attribute("user.id", user_id)
    span.set_attribute("payment.amount", amount)
    span.add_event("payment_initiated", {"payment_method": "credit_card"})

    with tracer.start_as_current_span("validate_card") as v:
        v.set_attribute("card.type", "visa")
        # ... validation

    with tracer.start_as_current_span("charge_payment"):
        # ... charge
        pass
    return {"status": "success"}
```

Les backends de traces se choisissent, là encore, selon un arbitrage :

| Solution | Type | Force | Cas d'usage |
|---|---|---|---|
| **Jaeger** | Open source | Mature, CNCF | Standard entreprise |
| **Tempo** | Open source | Backend S3, économique | Gros volumes |
| **Zipkin** | Open source | Simple, léger | Pour démarrer |
| **Datadog APM** | Commercial | Tout-en-un | Entreprise avec budget |
| **Honeycomb** | Commercial | Haute cardinalité | Debug de problèmes complexes |

Le compromis du tracing : instrumenter chaque service a un **coût** (en dépendance, en développement, en volume de données), et on n'échantillonne généralement qu'une fraction des requêtes pour maîtriser ce volume. Mais c'est le seul pilier qui répond à la question *où* dans un système distribué.

### Corréler les trois piliers

Chaque pilier pris isolément est aveugle sur les autres. Leur valeur vient de la **corrélation** : un `trace_id` propagé partout permet de sauter d'une métrique anormale au log correspondant, puis à la trace complète.

Concrètement, un *middleware* extrait (ou génère) le `trace_id` à l'entrée de chaque requête, le stocke dans un contexte, et l'injecte automatiquement dans chaque log :

```python
trace_id_var: ContextVar[str] = ContextVar('trace_id', default='')

async def tracing_middleware(request, call_next):
    trace_id = request.headers.get('X-Trace-ID', str(uuid.uuid4()))
    trace_id_var.set(trace_id)              # dispo pour tous les logs de la requête
    response = await call_next(request)
    response.headers['X-Trace-ID'] = trace_id
    return response
```

Côté visualisation, Grafana relie ses sources de données entre elles. En configurant un *derived field* dans Loki, un `trace_id` trouvé dans un log devient un lien cliquable vers la trace correspondante dans Tempo, et inversement. C'est ce qui transforme trois silos en un seul système navigable : partir d'une alerte métrique, atterrir sur le log fautif, ouvrir la trace, identifier le span coupable — en quelques clics.

---

## 4. Alerter : sur les symptômes, jamais sur les causes

Avoir des métriques ne sert à rien si les alertes qu'on en tire sont mauvaises. Et la plupart des systèmes d'alerte sont mauvais pour une raison précise et corrigible.

### Le principe cardinal : alerter sur les symptômes

La faute classique est d'alerter sur des **causes** :

```
❌  « CPU > 90 % »
✅  « taux d'erreur > 1 %  OU  latence p99 > 500 ms »
```

Pourquoi le premier est mauvais ? Parce qu'**un CPU à 90 % n'est pas un problème si les utilisateurs ne sont pas impactés**. C'est peut-être exactement le comportement souhaité d'un système bien dimensionné qui utilise ce qu'on lui a payé. Réveiller quelqu'un à 3 h du matin pour un CPU élevé qui ne dégrade rien, c'est le meilleur moyen de créer de l'épuisement pour rien.

La règle : **on alerte sur ce que l'utilisateur ressent** (le symptôme — lenteur, erreurs), pas sur les mécanismes internes (les causes — CPU, mémoire, taille de file). Les causes ont leur place dans les tableaux de bord, pour *diagnostiquer* une fois l'alerte tombée. Mais ce qui *réveille* quelqu'un doit correspondre à une douleur réelle et présente.

### Trois qualités d'une bonne alerte

Une alerte doit être **hiérarchisée** selon l'urgence. *Critical* (page, réveille quelqu'un) : impact utilisateur immédiat, action requise maintenant. *Warning* (Slack) : dégradation, action requise bientôt. *Info* (log) : pour enquête, aucune action immédiate. Mélanger ces niveaux, c'est diluer le signal.

Une alerte doit être **actionnable**. Si une alerte ne demande aucune action, ce n'est pas une alerte, c'est du bruit. Corollaire pratique : **chaque alerte doit avoir un runbook associé** — un document qui dit quoi faire quand elle se déclenche. Une alerte sans runbook est une alerte qu'on ne saura pas traiter à 3 h du matin.

### La fatigue d'alerte : le vrai danger

Le pire ennemi d'un système d'alerte n'est pas l'absence d'alerte, c'est leur **excès**. Quand les alertes sont trop nombreuses ou trop bruyantes, les humains apprennent à les ignorer — et le jour où la vraie alerte tombe, elle se noie dans le bruit. C'est **l'alert fatigue**, et elle tue des systèmes.

La contre-mesure est disciplinaire : une **revue hebdomadaire** des alertes qui n'ont donné lieu à aucune action, avec suppression ou ajustement systématique des alertes bruyantes. Un objectif chiffré utile : **moins de 2 pages par semaine et par personne**. Au-delà, on ne dort plus, on ne réfléchit plus, on quitte l'entreprise.

### Alerter sur le budget : le multi-window burn rate

Voici la technique qui relie l'alerting à tout ce qu'on a construit sur les SLO. Plutôt que d'alerter sur un seuil d'erreur arbitraire, on alerte quand on **brûle le budget d'erreur trop vite**. Et on le fait sur **plusieurs fenêtres** simultanément, pour distinguer une catastrophe soudaine d'une lente dérive :

```
Alerter si burn rate > 14×  sur  1 h   → on consomme 14 h de budget en 1 h : urgence
Alerter si burn rate >  6×  sur  6 h   → dérive rapide
Alerter si burn rate >  3×  sur 24 h   → dérive lente mais réelle
```

La fenêtre courte attrape les incidents brutaux (une panne franche), la fenêtre longue attrape les fuites lentes (une dégradation de 2 % qui, sur une semaine, épuise tout le budget). En pratique, en Prometheus :

```yaml
groups:
  - name: slo-alerts
    rules:
      - alert: HighErrorBudgetBurn
        expr: |
          (
            sum(rate(http_requests_total{status=~"5.."}[1h]))
            / sum(rate(http_requests_total[1h]))
          ) > (14 * 0.001)          # 14× le budget d'un SLO à 99,9 %
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error budget burn rate"
          runbook: "https://wiki/runbooks/error-budget"
```

Notez le `14 * 0.001` : `0.001` est le budget d'erreur (1 − 0,999), et `14` est le facteur de burn. Cette alerte se déclenche quand on brûle 14 fois plus vite que le rythme soutenable — soit l'épuisement de tout le budget mensuel en quelques heures.

### Le compromis : cardinalité et coût

Il reste un piège technique qui a une conséquence financière directe : la **cardinalité**. La cardinalité d'une métrique, c'est le nombre de combinaisons de labels distinctes qu'elle génère. Chaque combinaison unique crée une série temporelle séparée à stocker.

L'exemple qui fait mal : ajouter un label `user_id` à une métrique. Avec un million d'utilisateurs, vous venez de créer un million de séries temporelles là où il y en avait une. Le coût de stockage et de calcul **explose**. C'est pour ça que le `user_id` a sa place dans un **log** (riche, cherché ponctuellement) mais surtout **pas** dans une **métrique** (agrégée, stockée en continu).

La règle d'arbitrage : les métriques doivent rester en **basse cardinalité** (des labels à faible nombre de valeurs : méthode HTTP, code de statut, endpoint). La haute cardinalité — l'identité fine de chaque événement — va dans les logs et les traces, où on la paie seulement à l'usage. Confondre les deux est la cause numéro un des factures d'observabilité qui dérapent. C'est d'ailleurs la spécialité d'outils comme Honeycomb : gérer nativement la haute cardinalité, précisément là où Prometheus s'effondrerait.

---

## 5. Éprouver la fiabilité : chaos engineering

On a mesuré, observé, alerté. Mais comment sait-on que le système résiste *vraiment* aux pannes qu'on a prévues ? La seule façon honnête de le savoir est de **provoquer la panne** — délibérément, sous contrôle. C'est le **chaos engineering**.

### L'intuition : le vaccin

L'analogie exacte est celle de la **vaccination**. On injecte une dose contrôlée de « maladie » (une panne délibérée) pour vérifier que le système a les anticorps (redondance, bascule, dégradation gracieuse) — et pour les renforcer avant que la vraie épidémie ne frappe. On préfère découvrir une faiblesse un mardi après-midi, avec toute l'équipe présente et le doigt sur le bouton d'annulation, plutôt qu'un dimanche à 3 h du matin en pleine panne réelle.

### Les cinq principes

```
1. HYPOTHÉTISER SUR L'ÉTAT STABLE
   « Notre système maintient un taux d'erreur < 0,1 %. »
   → on définit d'abord à quoi ressemble « normal ».

2. VARIER DES ÉVÉNEMENTS DU MONDE RÉEL
   « Que se passe-t-il si une zone AWS tombe ? »
   → on simule des pannes plausibles, pas fantaisistes.

3. EXPÉRIMENTER EN PRODUCTION
   « Les vrais bugs sont en prod, pas en staging. »
   → staging ment ; seul l'environnement réel dit la vérité.

4. AUTOMATISER POUR TOURNER EN CONTINU
   « Chaos régulier > chaos ponctuel. »
   → une résilience testée une fois se dégrade avec le temps.

5. MINIMISER LE RAYON DE SOUFFLE (blast radius)
   « Commencer petit, monter progressivement. »
   → un pod, puis un nœud, puis une zone.
```

Le troisième principe surprend souvent — **expérimenter en production ?** Oui, parce que c'est le seul endroit où les conditions sont réelles : le trafic réel, les données réelles, les dépendances réelles. Mais il est indissociable du cinquième : on **minimise le rayon de souffle**. On commence par tuer *un seul* pod, on observe, on élargit seulement si tout tient. Le chaos engineering n'est pas de l'imprudence, c'est de l'expérimentation *contrôlée* — avec des critères d'arrêt définis à l'avance.

### Les types d'expériences

On classe les injections de panne par couche :

- **Infrastructure** — tuer un pod (Chaos Monkey, Litmus), terminer un nœud (Kube-monkey), simuler la perte d'une zone de disponibilité entière (AWS Fault Injection).
- **Réseau** — injecter 500 ms de latence sur les appels inter-services (Toxiproxy, Istio), perdre 10 % des paquets (`tc`, Toxiproxy), rendre le DNS irrésolvable.
- **Application** — forcer une API externe à renvoyer des 500 (WireMock), épuiser le CPU ou la mémoire (`stress-ng`), décaler l'horloge système (`libfaketime`) pour débusquer les bugs de temps.

Chaque expérience déclare son **rayon de souffle** : un pod, un chemin réseau, une dépendance, une zone. C'est la variable qu'on augmente prudemment.

### Le Game Day

Un **Game Day** est une répétition d'incident planifiée, structurée en trois temps. **Une semaine avant** : on définit l'hypothèse à tester, on identifie les services et les équipes concernés, on prépare les runbooks, et surtout on définit les **critères d'abandon** (à quel seuil de dégradation on arrête tout) et on prévient le support client. **Le jour J** : war room, capture des métriques de référence, annonce, injection de la panne, observation de la réaction, documentation en temps réel — et restauration immédiate si un critère d'abandon est atteint. **Après (sous 24 h)** : débrief de toutes les équipes, documentation des enseignements, création d'actions correctives, et planification du prochain Game Day.

En pratique, avec un outil comme Litmus sur Kubernetes, un test de suppression de pod déclare une durée, un intervalle, et surtout une **sonde de santé continue** qui vérifie pendant toute la durée du chaos que le service reste disponible — c'est elle qui valide ou invalide l'hypothèse « le service survit à la perte d'un pod » :

```yaml
experiments:
  - name: pod-delete
    spec:
      components:
        env:
          - { name: TOTAL_CHAOS_DURATION, value: '30' }   # secondes
          - { name: CHAOS_INTERVAL,       value: '10' }   # tue toutes les 10 s
          - { name: FORCE,                value: 'false' }
      probe:
        - name: "check-payment-health"
          type: "httpProbe"
          httpProbe/inputs:
            url: "http://payment-service:8080/health"
            method: { get: { criteria: "==", responseCode: "200" } }
          mode: "Continuous"
```

Le compromis du chaos : il **coûte du temps** (préparation, coordination) et comporte un **risque résiduel** (on provoque de vraies pannes). Mais l'alternative — découvrir ses faiblesses en incident réel — coûte infiniment plus cher.

---

## 6. Se préparer à la production : la Production Readiness Review

Le pendant préventif du chaos, c'est la **PRR** (*Production Readiness Review*) : une revue systématique avant de mettre un service en production. Son rôle n'est pas bureaucratique ; c'est de rendre explicite, *avant* le lancement, tout ce qui coûtera cher *après* si on l'a oublié. On la parcourt par domaines.

**Architecture** — la conception est-elle documentée ? Les dépendances sont-elles identifiées ? Les *points uniques de défaillance* (SPOF) sont-ils éliminés ? La stratégie de scaling est-elle définie ?

**Fiabilité** — les SLI/SLO sont-ils définis, approuvés, avec une politique de budget d'erreur ? Le service **survit-il à la perte d'une instance, puis d'une zone entière** ? Les *circuit breakers*, les *timeouts* sur toutes les dépendances, la logique de *retry* avec backoff exponentiel, la **dégradation gracieuse** sont-ils en place ? (La dégradation gracieuse : quand une dépendance tombe, le service rend un résultat dégradé plutôt que de s'effondrer — par exemple servir un catalogue en cache plutôt qu'une page d'erreur.)

**Observabilité** — les métriques business *et* techniques sont-elles exposées ? Les logs structurés et corrélés ? Les traces configurées ? Les alertes sont-elles basées sur les SLO, chacune dotée d'un runbook, et **testées** ?

**Opérations** — la rotation d'astreinte est-elle définie, avec *au moins deux personnes formées* (jamais une seule : le facteur bus) ? Le pipeline CI/CD fonctionne-t-il ? Le déploiement est-il **canary ou blue-green**, avec un rollback automatisé *testé* et des feature flags ?

**Sécurité** — revue de sécurité faite, secrets gérés correctement (Vault, AWS Secrets Manager), TLS partout, auth/authz en place, scan des dépendances actif ?

**Capacité** — load tests effectués, capacity planning documenté, auto-scaling configuré, limites de ressources définies ?

Le déploiement lui-même suit une **montée progressive**, jamais un basculement brutal. On déploie en canary sur une fraction du trafic, on surveille les métriques clés 15 minutes, on étend à 10 % puis on surveille 30 minutes, à 50 % puis une heure, et seulement ensuite au trafic complet. À chaque palier, les signaux d'or servent de feu vert ou de feu rouge. C'est la même philosophie que le chaos et le budget d'erreur : **exposer le risque par petites doses contrôlées**, garder à tout instant la possibilité d'annuler, et laisser les métriques — pas les intuitions — décider.

Le compromis de la PRR : elle **ralentit le lancement**. C'est voulu. Elle échange quelques jours de préparation contre l'évitement d'un incident de production, dont le coût — en réputation, en budget d'erreur brûlé, en nuits blanches — dépasse de très loin celui de la revue.

---

## À retenir

1. **La fiabilité est une ressource qu'on budgète, pas un absolu qu'on maximise.** Viser 100 % est un contresens économique ; on choisit un SLO et on dépense volontairement le budget d'erreur qui en découle (`Error Budget = 1 − SLO`).

2. **Les métriques remplacent les opinions.** Le conflit « livrer vite » contre « rester stable » se dissout dès qu'une politique de budget d'erreur pilote les décisions automatiquement : budget plein, on livre ; budget épuisé, on gèle. Sans exception, sinon le système perd toute crédibilité.

3. **SLO interne toujours plus strict que SLA externe.** La marge est le coussin qui vous alerte avant que le contrat client ne soit rompu.

4. **Observabilité ≠ monitoring.** Le monitoring dit *quand* ça casse (tableau de bord) ; l'observabilité dit *pourquoi* (ouvrir le capot), grâce aux trois piliers corrélés par un `trace_id` : logs (« quoi »), métriques (« combien »), traces (« où »).

5. **Quatre signaux d'or, deux recettes.** Latency, Traffic, Errors, Saturation couvrent toute l'expérience utilisateur. RED pour les services, USE pour les ressources. Toujours les percentiles, jamais la moyenne.

6. **Alerter sur les symptômes, jamais sur les causes** — et surveiller la cardinalité. Un CPU à 90 % qui ne fait souffrir personne n'est pas une alerte. La haute cardinalité (`user_id`) va dans les logs, pas dans les métriques, sous peine de facture explosive.

7. **On casse pour renforcer, on revoit avant de lancer.** Chaos engineering et PRR appliquent le même principe : exposer le risque par petites doses contrôlées, garder le bouton d'annulation, laisser les métriques décider.

## Pour aller plus loin

- **Site Reliability Engineering** (Google) — l'ouvrage fondateur ; et son compagnon pratique, **The Site Reliability Workbook**, pour la mise en œuvre concrète des SLO et politiques de budget.
- **Observability Engineering** (Charity Majors, Liz Fong-Jones, George Miranda) — la référence sur la haute cardinalité et la distinction fine monitoring/observabilité.
- **Chaos Engineering** (Casey Rosenthal, Nora Jones) — principes et pratiques de l'ingénierie du chaos.
- Les articles fondateurs de Google : *« Monitoring Distributed Systems »* (d'où viennent les quatre signaux d'or) et *« Dapper »* (l'ancêtre du tracing distribué et donc d'OpenTelemetry).
- Outils à pratiquer, dans l'ordre : **Prometheus + Grafana** (métriques), **Loki** (logs), **Tempo** + **OpenTelemetry** (traces), **Alertmanager / PagerDuty** (astreinte), **Litmus** (chaos).
- **Prochaine étape concrète** : choisissez votre service le plus critique et définissez-lui *un* SLO cette semaine. Câblez les quatre signaux d'or dans un tableau de bord. Menez votre premier postmortem blameless au prochain incident. Le reste se construit à partir de là.
