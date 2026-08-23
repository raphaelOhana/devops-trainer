===LESSON===
KEY: cloud-arch
TOPIC: cloud-arch
TITLE: Architecture cloud
ICON: ☁️
INTRO: Concevoir dans le cloud, ce n'est pas louer des serveurs ailleurs : c'est accepter que tout composant peut tomber à tout moment et construire des systèmes qui restent fiables, sûrs, élastiques et abordables malgré cette réalité — ce cours pose les principes durables qui gouvernent ces choix.
---SECTION---
HEADING: Le changement de mentalité : concevoir pour la panne
BODY:
La rupture fondamentale entre l'architecture « on-premise » traditionnelle et l'architecture cloud tient en une phrase : **dans le cloud, on suppose que tout tombe en panne, tout le temps**. Un serveur physique choyé qu'on maintient en vie à tout prix (le modèle « animal de compagnie ») cède la place à des instances jetables et interchangeables (le modèle « bétail »). On ne répare plus une instance malade : on la détruit et on en recrée une.

Ce renversement a des conséquences profondes :

- On ne peut plus compter sur la **fiabilité d'un composant individuel**. La fiabilité émerge de l'**architecture d'ensemble** : redondance, réplication, bascule automatique.
- Le matériel devient une **abstraction programmable** (Infrastructure as Code). On décrit l'infrastructure voulue, on la recrée à l'identique, on la versionne.
- Le modèle économique change : on paie à l'usage, ce qui rend le **gaspillage visible** et l'élasticité rentable.

Le Google SRE Book formalise cette idée : au-delà d'un certain seuil, viser 100 % de disponibilité est contre-productif. On définit un **objectif de fiabilité** (SLO) et un **budget d'erreur** (la marge de panne tolérée). Ce budget devient une monnaie : tant qu'il n'est pas épuisé, on peut prendre des risques (déployer vite) ; s'il est épuisé, on gèle les changements et on stabilise. La fiabilité cesse d'être un absolu moral pour devenir un **arbitrage explicite**.
---SECTION---
HEADING: Les six piliers du Well-Architected Framework
BODY:
Le **AWS Well-Architected Framework** structure toute décision d'architecture autour de six piliers. Ce ne sont pas des cases à cocher mais des **tensions à équilibrer** : optimiser aveuglément un pilier dégrade souvent les autres.

- **Excellence opérationnelle** — exécuter et surveiller les systèmes pour en tirer de la valeur ; automatiser, observer, apprendre de chaque incident (post-mortems sans blâme).
- **Sécurité** — protéger données, systèmes et actifs : identité, traçabilité, chiffrement, défense en profondeur.
- **Fiabilité** — la capacité à exécuter la fonction attendue correctement et de façon constante, et à **récupérer** des pannes.
- **Efficacité des performances** — utiliser les ressources informatiques efficacement et le rester quand la demande et les technologies évoluent.
- **Optimisation des coûts** — éviter les dépenses inutiles, payer le juste nécessaire.
- **Durabilité** (pilier ajouté en 2021) — minimiser l'impact environnemental des charges de travail.

### Pourquoi ce cadre importe

Aucune architecture n'est parfaite : elle est **adaptée à un contexte**. Un prototype interne et un système de paiement bancaire n'arbitrent pas de la même façon entre coût et fiabilité. Le Framework donne un **vocabulaire commun** et une méthode de revue (poser les « bonnes questions ») pour rendre ces arbitrages **conscients et documentés**, plutôt que subis. La règle d'or : **rendre les compromis explicites**.
---SECTION---
HEADING: Disponibilité, les « neuf » et le budget d'erreur
BODY:
La **disponibilité** se mesure en pourcentage de temps où le service rend correctement son service. On la compte en « neuf » :

- **99 %** (« deux neuf ») ≈ 3,65 jours d'indisponibilité par an.
- **99,9 %** (« trois neuf ») ≈ 8,76 heures par an.
- **99,99 %** (« quatre neuf ») ≈ 52,6 minutes par an.
- **99,999 %** (« cinq neuf ») ≈ 5,26 minutes par an.

Chaque neuf supplémentaire coûte typiquement **un ordre de grandeur plus cher** (redondance accrue, tests, astreinte). D'où l'importance de viser le **juste niveau**, pas le maximum.

Point crucial souvent oublié : la disponibilité d'une chaîne de dépendances **se multiplie**. Si votre service dépend en série de trois composants à 99,9 % chacun, votre plafond théorique est :

```
0,999 × 0,999 × 0,999 ≈ 0,997 → 99,7 %
```

Chaque dépendance synchrone ajoutée **abaisse** le plafond de disponibilité. C'est un argument architectural fort en faveur du **découplage** (rendre une dépendance asynchrone ou optionnelle) et de la **dégradation gracieuse** (fonctionner en mode réduit quand une dépendance est absente).
---SECTION---
HEADING: RTO et RPO : mesurer ce qu'on peut perdre
BODY:
Avant de choisir une stratégie de reprise, il faut chiffrer deux objectifs. Ils répondent à deux questions différentes et sont souvent confondus.

- **RTO — Recovery Time Objective** : *combien de temps* peut-on rester en panne ? C'est le délai maximal acceptable entre l'incident et le rétablissement du service. Un RTO de 1 heure signifie « on doit être de nouveau debout en moins d'une heure ».
- **RPO — Recovery Point Objective** : *combien de données* peut-on se permettre de perdre ? C'est l'écart maximal acceptable entre le dernier point récupérable et l'instant du sinistre. Un RPO de 5 minutes signifie « on tolère de perdre au plus 5 minutes de données ».

### Comment les distinguer concrètement

Imaginez une sauvegarde toutes les nuits à 2 h. Un sinistre à 16 h :

- **RPO réel** = 14 heures de données perdues (tout ce qui s'est passé depuis 2 h).
- **RTO réel** = le temps qu'il faut pour restaurer cette sauvegarde et remettre le service en ligne.

Ces deux chiffres, dictés par le **métier** (pas par la technique), déterminent directement le coût. Un RPO proche de zéro impose une réplication continue ; un RTO proche de zéro impose une infrastructure déjà chaude et prête à prendre le relais. C'est le point de départ de toute stratégie de reprise après sinistre (Disaster Recovery).
---SECTION---
HEADING: Les quatre stratégies de reprise après sinistre
BODY:
AWS décrit un continuum de quatre stratégies de **Disaster Recovery**, du moins cher/plus lent au plus cher/plus rapide. Le choix découle directement du RTO/RPO visé.

- **Backup & Restore** — on sauvegarde données et configuration ; en cas de sinistre, on **recrée** l'infrastructure et on restaure. RTO/RPO de l'ordre de **heures**. Coût minimal (on ne paie que le stockage des sauvegardes). Idéal quand on peut tolérer une longue interruption.
- **Pilot Light** (veilleuse) — le cœur critique tourne en permanence à minima (bases répliquées, images prêtes), mais les serveurs applicatifs sont **éteints**. En cas de sinistre, on « allume » et on met à l'échelle. RTO de l'ordre de **dizaines de minutes**.
- **Warm Standby** (secours tiède) — une **copie complète mais sous-dimensionnée** de l'environnement tourne en continu. Elle peut absorber du trafic immédiatement, puis on la met à l'échelle. RTO de l'ordre de **minutes**.
- **Multi-site actif-actif** (hot standby) — deux régions (ou plus) servent le trafic **simultanément**. En cas de perte d'une région, l'autre absorbe tout. RTO/RPO proches de **zéro**, mais coût et complexité maximaux (gestion des conflits de données, cohérence).

### La règle de décision

On ne choisit pas la stratégie la plus robuste par principe : on choisit **la moins chère qui satisfait le RTO/RPO exigé par le métier**. Payer pour de l'actif-actif quand le métier tolère 4 heures d'interruption est un gaspillage ; l'inverse est une faute.
---SECTION---
HEADING: Régions, zones de disponibilité et haute disponibilité
BODY:
La topologie physique du cloud est le socle de la haute disponibilité. Il faut en maîtriser la hiérarchie :

- Une **région** est une zone géographique (ex. Europe-Ouest). Les régions sont éloignées de centaines de kilomètres : une catastrophe naturelle ou une panne électrique majeure n'en touche qu'une.
- Une **zone de disponibilité (AZ)** est un ou plusieurs centres de données **isolés** au sein d'une région, avec alimentation, refroidissement et réseau indépendants, mais reliés aux autres AZ par un réseau à **faible latence**.

### Le principe multi-AZ

Déployer sur **plusieurs AZ** dans une même région est la brique de base de la haute disponibilité. Comme les AZ ont des défaillances **indépendantes** (pas de point commun électrique ou réseau), la perte d'une AZ n'emporte pas les autres. La latence inter-AZ étant faible (ordre de la milliseconde), on peut y faire de la **réplication synchrone** — donc sans perte de données.

Le **multi-région**, lui, protège contre la perte d'une région entière et rapproche les données des utilisateurs, mais la latence élevée impose souvent une réplication **asynchrone** (donc un RPO non nul) et fait resurgir les problèmes de cohérence. Règle pratique : **multi-AZ pour la haute disponibilité courante, multi-région pour la reprise après sinistre et la proximité géographique**.
---SECTION---
HEADING: Répartition de charge : L4 contre L7
BODY:
Un **répartiteur de charge** (load balancer) distribue le trafic entrant sur plusieurs instances saines. C'est lui qui rend la redondance utile : sans lui, avoir dix serveurs ne sert à rien si les clients ne savent pas lesquels sont vivants. Il y a deux grandes familles, selon la couche du modèle OSI où ils opèrent.

- **Répartiteur L4 (transport, TCP/UDP)** — il route selon l'IP et le port, sans lire le contenu. Très **rapide**, très **scalable**, agnostique au protocole applicatif. Mais aveugle : il ne peut pas router selon une URL ou un en-tête HTTP.
- **Répartiteur L7 (application, HTTP/HTTPS)** — il lit la requête applicative. Il peut donc router selon le **chemin** (`/api` vers un groupe, `/images` vers un autre), l'en-tête ou le cookie, terminer le TLS, réécrire des en-têtes, gérer l'affinité de session. Plus riche, un peu plus coûteux en traitement.

### Le rôle du health check

Le mécanisme vital d'un répartiteur est la **vérification de santé** (health check) : il sonde régulièrement chaque instance (par ex. `GET /health`) et **retire automatiquement** du pool celles qui ne répondent pas. C'est ce qui transforme une panne d'instance en non-événement pour l'utilisateur. Un bon endpoint de santé vérifie les dépendances critiques sans être si strict qu'une broutille sort tout le parc du service.
---SECTION---
HEADING: Conception stateless : la clé de l'élasticité
BODY:
Un service est **stateless** (sans état) quand il ne conserve **aucune donnée de session en mémoire locale** entre deux requêtes : chaque requête porte (ou récupère depuis un magasin partagé) tout le contexte nécessaire. À l'inverse, un service **stateful** garde en local des informations dont dépendent les requêtes suivantes.

### Pourquoi c'est décisif

L'élasticité (ajouter/retirer des instances) et la reprise sur panne **exigent** le stateless :

- Si l'état vit dans la mémoire de l'instance A, une requête routée vers l'instance B **échoue** ou perd le contexte. On est obligé de coller chaque client à « son » serveur (sticky sessions), ce qui déséquilibre la charge et casse la bascule.
- Détruire une instance (le modèle « bétail ») devient sûr : rien d'irremplaçable ne meurt avec elle.

La technique consiste à **externaliser l'état** vers un magasin partagé et durable :

```
Session utilisateur  → magasin clé-valeur (Redis, DynamoDB…)
Fichiers uploadés    → stockage objet (S3…)
Données métier       → base de données managée
Cache               → cache distribué partagé
```

L'instance elle-même redevient une **fonction pure et jetable** : mêmes entrées, mêmes sorties, aucune mémoire cachée. C'est la condition sine qua non de l'auto-scaling et du déploiement sans interruption.
---SECTION---
HEADING: Auto-scaling : élasticité et robustesse
BODY:
L'**auto-scaling** ajuste automatiquement le nombre d'instances à la charge réelle. Il sert deux objectifs qu'on confond souvent :

- **L'élasticité économique** — suivre la demande pour ne payer que le nécessaire : monter à la charge de pointe, redescendre la nuit.
- **La robustesse** — si une instance meurt, le groupe la remplace pour maintenir l'effectif désiré (self-healing). L'auto-scaling est donc aussi un mécanisme de **guérison automatique**.

### Deux dimensions de scaling

- **Horizontal (scale out/in)** — ajouter/retirer des *instances*. Quasi illimité, sans interruption, et c'est le mode natif du cloud. Nécessite le stateless.
- **Vertical (scale up/down)** — grossir/réduire une *instance* (plus de CPU/RAM). Simple mais borné par la plus grosse machine, et impose souvent un redémarrage.

### Le piège de la réactivité

Deux réglages sont critiques. **Réagir trop tard** (seuils trop hauts, démarrage d'instance lent) fait subir la surcharge aux utilisateurs pendant le temps de démarrage. **Réagir trop nerveusement** provoque le *flapping* : on ajoute et retire des instances en boucle. On l'évite avec des **périodes de stabilisation** (cooldown) et de l'hystérésis (seuils d'entrée et de sortie différents). Prévoir aussi la charge en amont (scaling prédictif) quand les pics sont prévisibles, car démarrer une instance prend des minutes.
---SECTION---
HEADING: Découplage par files et par événements
BODY:
Le **couplage synchrone** — le service A appelle directement B et attend sa réponse — propage les pannes : si B est lent ou mort, A l'est aussi. Le **découplage asynchrone** casse cette chaîne en insérant un intermédiaire durable entre producteur et consommateur.

- **File de messages (queue)** — modèle point-à-point. Le producteur dépose un message, un consommateur le traite plus tard. La file **absorbe les pics** (elle sert de tampon), **lisse la charge**, et **survit** à l'indisponibilité du consommateur (les messages attendent). C'est le patron de nivellement de charge (*queue-based load leveling*).
- **Bus/flux d'événements (pub/sub)** — modèle un-à-plusieurs. Un producteur publie un **fait** (« commande passée ») ; plusieurs consommateurs indépendants y réagissent sans que le producteur les connaisse. C'est le fondement de l'architecture **événementielle**.

### Ce que le découplage achète et coûte

Il achète : **résilience** (une panne aval ne remonte pas), **élasticité** (chaque côté monte à son rythme), **évolutivité** (ajouter un consommateur ne touche pas le producteur). Il coûte : la **cohérence à terme** (le traitement n'est plus immédiat), la nécessité de gérer les **doublons** (d'où l'idempotence) et l'**ordre**, et une complexité de suivi accrue (traçage distribué). *Cloud Native Patterns* insiste : le découplage est le prix à payer — et l'outil — pour bâtir des systèmes qui résistent aux défaillances partielles.
---SECTION---
HEADING: CAP et PACELC : les lois des systèmes distribués
BODY:
Dès qu'une donnée est **répliquée** sur plusieurs nœuds, un théorème gouverne vos choix. Le **théorème CAP** énonce qu'en présence d'une **partition réseau** (P) — des nœuds qui ne peuvent plus communiquer — un système distribué doit sacrifier soit la **cohérence** (C : tout le monde voit la même donnée), soit la **disponibilité** (A : chaque requête reçoit une réponse).

- **Système CP** — face à une partition, il **refuse de répondre** plutôt que de servir une donnée potentiellement périmée. On privilégie la justesse (ex. solde bancaire).
- **Système AP** — face à une partition, il **répond quand même**, quitte à servir une donnée légèrement obsolète, réconciliée plus tard. On privilégie la disponibilité (ex. panier, fil d'actualité).

Attention au contresens : la partition n'est **pas un choix**, c'est une fatalité du réseau. Le choix, c'est C ou A **quand** la partition survient.

### PACELC va plus loin

CAP est muet sur le fonctionnement **normal** (sans partition). **PACELC** complète : *si Partition, alors A ou C ; sinon (Else), arbitrer entre **Latence** et **Cohérence***. Autrement dit, même quand tout va bien, garantir une cohérence forte coûte de la **latence** (attendre l'accord des réplicas). Beaucoup de bases « AP » sont en réalité **PA/EL** : elles sacrifient la cohérence pour la disponibilité *et* pour la latence. C'est la grille de lecture honnête pour choisir un magasin de données.
---SECTION---
HEADING: Patrons de résilience : circuit breaker et bulkhead
BODY:
La résilience n'est pas l'absence de panne mais la capacité à **contenir** une panne. Deux patrons structurels, popularisés par *Cloud Native Patterns*, empêchent une défaillance locale de devenir globale.

### Le disjoncteur (circuit breaker)

Il protège un appelant contre un service aval défaillant. Comme un disjoncteur électrique, il a trois états :

- **Fermé** — les appels passent normalement ; on compte les échecs.
- **Ouvert** — au-delà d'un seuil d'échecs, on **arrête d'appeler** et on échoue immédiatement (fail-fast), sans attendre un timeout à chaque fois. On laisse le service aval respirer.
- **Semi-ouvert** — après un délai, on laisse passer **quelques** appels de test. S'ils réussissent, on referme ; sinon, on rouvre.

Sans disjoncteur, un service lent provoque un **effet domino** : les threads de l'appelant s'accumulent en attente, l'épuisent, et la panne remonte toute la chaîne (*cascading failure*).

### Le cloisonnement (bulkhead)

Inspiré des compartiments étanches d'un navire : on **isole les ressources** (pools de threads, de connexions) par dépendance. Ainsi, si l'appel au service X sature son pool, il n'engloutit pas les threads réservés au service Y. Une inondation reste **confinée à un compartiment** au lieu de couler tout le navire.
---SECTION---
HEADING: Retry, backoff, back-pressure et idempotence
BODY:
Dans un système distribué, les erreurs **transitoires** (un pic momentané, un paquet perdu) sont la norme. Les gérer sans aggraver la situation demande quatre notions liées.

- **Retry (réessai)** — retenter une opération échouée. Mais réessayer *immédiatement* et *toujours* est dangereux : sur un service déjà surchargé, une vague de réessais synchronisés l'achève (*retry storm*).
- **Backoff exponentiel + jitter** — espacer les réessais de façon croissante (1 s, 2 s, 4 s…) pour laisser le temps de récupérer, et ajouter un **jitter** (aléa) pour **désynchroniser** les clients qui, sinon, réessaieraient tous en même temps.

```
délai = min(plafond, base × 2^tentative) + aléa(0, marge)
```

- **Back-pressure (contre-pression)** — quand un consommateur est débordé, il doit **signaler** au producteur de ralentir plutôt que d'accumuler silencieusement jusqu'à l'effondrement. Refuser proprement (rejeter avec un code « réessaie plus tard ») vaut mieux que crouler puis mourir. C'est l'application du principe de **délestage** (load shedding) : sacrifier un peu de trafic pour sauver le service.
- **Idempotence** — condition *sine qua non* du retry sûr. Une opération est **idempotente** si l'exécuter N fois produit le même effet qu'une fois. Comme un réessai peut dupliquer une requête (le premier appel a peut-être réussi mais la réponse s'est perdue), chaque opération mutante doit porter une **clé d'idempotence** que le serveur mémorise pour ignorer les doublons. Sans idempotence, « réessayer » peut débiter un client deux fois.
---SECTION---
HEADING: Rayon d'impact et architecture cellulaire
BODY:
Le **rayon d'impact** (blast radius) est l'étendue des dégâts qu'une panne unique peut causer. Tout l'art de l'architecture résiliente consiste à le **réduire par conception** : faire en sorte qu'aucune défaillance ne puisse tout emporter.

### Le piège du composant partagé

Une base de données unique servant *tous* les clients, un cache global, un plan de contrôle central : chacun est un **point de défaillance unique** dont le rayon d'impact est **total**. Le multi-AZ réduit déjà ce rayon au niveau matériel, mais pas les défaillances **logiques** (un bug, une config empoisonnée, un client toxique qui sature une ressource).

### L'architecture cellulaire

La parade est de découper le système en **cellules** : des copies complètes et **indépendantes** de la pile, chacune servant un **sous-ensemble** de clients. Les cellules ne partagent rien (shared-nothing). Ainsi :

- Une panne dans une cellule n'affecte que **sa** fraction de clients (par ex. 1 cellule sur 10 → 10 % d'impact maximum).
- On peut **déployer cellule par cellule** : une mauvaise version n'empoisonne qu'une cellule avant qu'on l'arrête.
- Un **routeur** (mince et ultra-fiable) associe chaque client à sa cellule.

C'est l'application à l'échelle système du principe de cloisonnement : au lieu d'un grand système qui tombe entièrement, une **flotte de petits systèmes** dont un seul tombe à la fois.
---SECTION---
HEADING: Sécurité : défense en profondeur, moindre privilège, chiffrement
BODY:
La sécurité cloud repose sur trois principes structurants du pilier Sécurité, applicables à toute architecture.

### Défense en profondeur

On ne mise **jamais sur une seule barrière**. On empile des couches indépendantes : périmètre réseau (WAF, groupes de sécurité), segmentation (sous-réseaux, VPC), identité et autorisation, chiffrement, journalisation. Si une couche cède, les suivantes tiennent. Corollaire moderne : le **Zero Trust** — ne jamais faire confiance implicitement à cause de la seule position réseau ; **vérifier chaque requête** (identité, contexte, posture), y compris à l'intérieur du périmètre.

### Moindre privilège

Chaque identité (utilisateur, service, machine) ne reçoit **que** les permissions strictement nécessaires, **et rien de plus** — ni pour d'autres ressources, ni « au cas où ». On préfère des **rôles temporaires** à des clés permanentes, et on **révise** régulièrement les droits accordés. Cela **réduit le rayon d'impact** d'une identité compromise : un secret volé qui ne peut lire qu'un seul compartiment fait bien moins de dégâts qu'un secret « admin ».

### Chiffrement au repos et en transit

- **En transit** — toute donnée qui circule sur le réseau est chiffrée (TLS), y compris **entre services internes** (le réseau interne n'est pas un lieu de confiance).
- **Au repos** — toute donnée stockée (disques, bases, sauvegardes, objets) est chiffrée, avec des clés gérées par un service dédié (KMS) et **régulièrement renouvelées** (rotation). Ainsi, un disque ou une sauvegarde dérobés restent illisibles.
---SECTION---
HEADING: CDN, edge et proximité géographique
BODY:
La vitesse de la lumière est une **contrainte physique** incontournable : un aller-retour Paris–Sydney prend structurellement plus de 200 ms, quoi qu'on fasse. La parade est de **rapprocher le contenu et le calcul de l'utilisateur**.

### Le réseau de diffusion de contenu (CDN)

Un **CDN** est une flotte de serveurs cache répartis mondialement (les points de présence, PoP). Il met en cache les contenus près des utilisateurs :

- **Latence réduite** — le contenu est servi depuis le PoP le plus proche, pas depuis l'origine lointaine.
- **Origine déchargée** — la majorité des requêtes sont absorbées par le cache, ce qui protège et allège le serveur d'origine (y compris contre certaines attaques volumétriques).
- **Résilience** — le CDN peut continuer à servir du contenu caché même si l'origine est momentanément indisponible.

Historiquement pour le **statique** (images, CSS, vidéos), les CDN servent aujourd'hui aussi du contenu dynamique et de l'API via des optimisations de transport.

### Le calcul à la périphérie (edge computing)

On pousse plus loin en exécutant du **code** dans les PoP : authentification, personnalisation, redirection, tests A/B au plus près de l'utilisateur, sans aller-retour vers la région d'origine. L'edge convient au traitement **léger et localisable** ; les traitements lourds ou fortement cohérents restent en région. La règle : **mettre en cache et calculer aussi près que possible de l'utilisateur, aussi loin que nécessaire pour la cohérence**.
---SECTION---
HEADING: Optimisation des coûts : modèles d'achat et right-sizing
BODY:
Dans le cloud, le coût est une **variable d'architecture** au même titre que la latence. Le payer à l'usage rend chaque décision de conception directement chiffrable — et le gaspillage visible.

### Les trois grands modèles d'achat de calcul

- **On-demand** — on paie à la seconde/heure sans engagement. **Flexible** mais le plus cher. Idéal pour les charges imprévisibles ou de courte durée.
- **Réservé / plan d'engagement (savings plans)** — on s'engage sur une capacité ou un montant pour 1 à 3 ans, en échange d'une **forte remise** (souvent 40–70 %). Idéal pour la charge de base, stable et prévisible.
- **Spot** — on loue la capacité **inutilisée** du fournisseur à prix cassé (jusqu'à −90 %), mais elle peut être **reprise à tout moment** avec un bref préavis. Réservé aux charges **tolérantes à l'interruption** : traitement par lots, calcul distribué, workers stateless.

Le patron gagnant combine les trois : **réservé** pour le socle permanent, **on-demand** pour la variation normale, **spot** pour les pics et les traitements interruptibles.

### Right-sizing et FinOps

Le **right-sizing** consiste à ajuster en continu les ressources à l'usage **réel** observé, plutôt qu'à une estimation gonflée « par sécurité ». On identifie les instances sur-dimensionnées, les volumes orphelins, les environnements de test oubliés allumés la nuit. Combiné à l'auto-scaling (payer l'élasticité) et à l'architecture serverless (payer l'exécution, pas l'attente), le right-sizing est le cœur de la démarche **FinOps** : faire de l'efficience des coûts une responsabilité **continue et partagée** entre ingénierie et finance, et non un nettoyage ponctuel.
===END===
