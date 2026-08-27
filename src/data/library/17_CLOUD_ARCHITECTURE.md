# Architecture cloud : penser en décisions, pas en services

Il existe une phrase qui résume bien le changement mental qu'impose le cloud : *« Le cloud, ce n'est pas l'ordinateur de quelqu'un d'autre. C'est l'infrastructure de quelqu'un d'autre — bien architecturée, distribuée mondialement, et tolérante aux pannes. »* Toute la difficulté, quand on arrive du monde des serveurs physiques, est de comprendre que le cloud n'est pas un datacenter loué à distance. C'est un modèle de raisonnement différent.

L'ancienne mentalité disait : *on achète des serveurs, on les configure, et on espère qu'ils tiennent.* La mentalité cloud dit : *on conçoit en supposant que tout va tomber, on dimensionne à la demande, et on paie à l'usage.* Ce n'est pas un détail de vocabulaire. C'est ce qui décide si votre facture explose ou non, si un incident vous réveille à 3 h du matin ou se résout tout seul, et si votre équipe passe son temps à créer de la valeur ou à recâbler des serveurs.

Ce chapitre s'adresse à un décideur technique. L'objectif n'est pas de mémoriser des noms de services — ils changent — mais d'acquérir une **grille de décision** : pour chaque choix d'architecture, comprendre le compromis, le coût, la charge opérationnelle et le risque d'enfermement (*lock-in*). Nous verrons comment penser l'architecture (le Well-Architected comme lentille de décision), le spectre du calcul (du « tout gérer soi-même » au serverless), les fondations réseau et sécurité, la résilience, l'automatisation par le code, et enfin le coût. Chaque fois, on partira du *pourquoi*.

---

## Trois bascules mentales

Avant les détails, trois idées structurent tout le reste. Elles paraissent abstraites ; elles sont en réalité la source de la plupart des décisions concrètes.

**Du bétail, pas des animaux de compagnie.** Autrefois, un serveur avait un nom, une histoire, une configuration unique patiemment ajustée à la main. On en prenait soin ; s'il tombait, c'était un drame, parce qu'il était irremplaçable. Le cloud renverse cette logique : les instances sont *identiques, interchangeables, jetables*. Si l'une tombe, on n'essaie pas de la réparer — on en recrée une automatiquement à partir de la même définition. Cette bascule est le socle de tout : elle rend possible l'autoscaling, le self-healing et les déploiements sans interruption. Mais elle a un prix d'entrée : vos serveurs ne doivent plus contenir d'état précieux et local, sinon ils redeviennent des animaux de compagnie qu'on n'ose plus tuer.

**Payer à l'usage.** Le modèle financier bascule du **CapEx** (un gros investissement initial, un plan de capacité sur trois ans, du matériel qu'on amortit) vers l'**OpEx** (une dépense variable, ajustée à la seconde). On ne paie que ce qu'on consomme, et on peut monter ou descendre en capacité en quelques minutes. C'est une libération pour une jeune entreprise — pas de mur d'investissement — mais un piège pour qui ne surveille rien : la même élasticité qui vous laisse doubler la capacité en un clic vous laisse aussi doubler la facture sans vous en rendre compte.

**Global par défaut.** Autrefois, avoir un datacenter dans une région était déjà un bon résultat. Le cloud rend le multi-région, le multi-zone et les points de présence en périphérie (*edge*) accessibles à tous. Vos utilisateurs sont partout ; votre infrastructure peut l'être aussi. Reste que « peut » n'est pas « doit » : chaque région supplémentaire multiplie le coût et la complexité, et nous verrons qu'il faut de bonnes raisons pour franchir ce pas.

---

## Le Well-Architected comme grille de décision

AWS a formalisé, sous le nom de **Well-Architected Framework**, une liste de six *piliers* qui sont autant de dimensions à équilibrer. GCP et Azure ont leurs équivalents ; les noms diffèrent, l'esprit est identique. Ne voyez pas ces piliers comme une checklist de conformité, mais comme **six questions que toute décision d'architecture doit affronter simultanément** — et qui, presque toujours, se contredisent. Optimiser aveuglément l'un dégrade les autres. Le métier d'architecte, c'est arbitrer entre eux en connaissance de cause.

**Excellence opérationnelle** répond à la question *« comment fait-on tourner et surveille-t-on les systèmes ? »*. Concrètement : tout en infrastructure-as-code, des déploiements automatisés, de l'observabilité (métriques, traces, logs), des *runbooks* pour les incidents, et une culture d'apprentissage par les post-mortems plutôt que de recherche de coupable. C'est le pilier qui décide si votre équipe dort la nuit.

**Sécurité** — *« comment protège-t-on données et systèmes ? »*. Le principe directeur est le **moindre privilège** en IAM, l'**chiffrement au repos et en transit**, la **segmentation réseau** (VPC, groupes de sécurité), des contrôles de détection (journalisation d'audit, détection de menaces) et une réponse aux incidents automatisée. Nous y reviendrons longuement, car c'est le pilier qu'un CTO ne peut pas déléguer aveuglément.

**Fiabilité** — *« comment récupère-t-on d'une panne ? »*. Déploiements multi-zones, autoscaling, health checks et auto-réparation, sauvegardes et plan de reprise (*disaster recovery*), et, à maturité, du *chaos engineering* — injecter volontairement des pannes pour vérifier qu'on y survit.

**Efficacité de performance** — *« utilise-t-on les ressources intelligemment ? »*. Dimensionnement juste (*right-sizing*), mise en cache, optimisation des bases de données, serverless là où c'est pertinent, exploitation de l'infrastructure mondiale pour rapprocher le calcul des utilisateurs.

**Optimisation des coûts** — *« comment élimine-t-on le gaspillage ? »*. Instances réservées et Savings Plans, instances Spot pour les charges tolérantes aux interruptions, right-sizing continu, *tags* d'allocation de coûts, et plus largement une pratique **FinOps**. Nous lui consacrons la dernière section.

**Durabilité** — *« comment minimise-t-on l'impact environnemental ? »*. Usage efficace des ressources, préférence pour les services managés (mieux mutualisés, donc mieux utilisés), choix de régions alimentées en énergie renouvelable, gestion du cycle de vie des données.

La leçon de méthode est celle-ci : **avant de choisir un service, demandez-vous quels piliers vous privilégiez et lesquels vous sacrifiez.** Un système ultra-fiable en multi-région coûte cher et complique l'opérationnel. Un système au coût minimal accepte souvent un risque de panne plus élevé. Il n'y a pas de bonne réponse dans l'absolu — il y a une bonne réponse *pour votre contexte*, vos revenus, votre tolérance au risque.

### Trois fournisseurs, un vocabulaire

Une bonne partie de la complexité apparente du cloud tient au fait que chaque fournisseur rebaptise les mêmes concepts. Voici la correspondance des services principaux ; retenez les catégories, pas les noms.

| Catégorie | AWS | GCP | Azure |
|---|---|---|---|
| Calcul (VM) | EC2 | Compute Engine | Virtual Machines |
| Conteneurs | EKS, ECS | GKE | AKS |
| Serverless | Lambda | Cloud Functions | Functions |
| Stockage objet | S3 | Cloud Storage | Blob Storage |
| Stockage bloc | EBS | Persistent Disk | Managed Disks |
| Base relationnelle | RDS, Aurora | Cloud SQL | SQL Database |
| NoSQL | DynamoDB | Firestore | CosmosDB |
| Cache | ElastiCache | Memorystore | Azure Cache |
| File de messages | SQS | Pub/Sub | Service Bus |
| Streaming | Kinesis | Dataflow | Event Hubs |
| CDN | CloudFront | Cloud CDN | Azure CDN |
| DNS | Route 53 | Cloud DNS | Azure DNS |
| Répartiteur de charge | ALB/NLB/ELB | Cloud LB | Load Balancer |
| Réseau privé | VPC | VPC | VNet |
| Identité & accès | IAM | IAM | Azure AD |
| Secrets | Secrets Manager | Secret Manager | Key Vault |
| Supervision | CloudWatch | Cloud Monitoring | Azure Monitor |
| Machine learning | SageMaker | Vertex AI | Azure ML |
| Entrepôt de données | Redshift | BigQuery | Synapse |

Quant au choix du fournisseur, il se résume assez bien à leurs forces respectives. **AWS** est le leader du marché : le catalogue de services le plus large, l'écosystème le plus mature, le meilleur choix pour une entreprise qui veut de la diversité — au prix d'une complexité réelle et d'une tarification parfois opaque. **GCP** brille sur Kubernetes (GKE en est la référence), l'analytique (BigQuery) et le ML, avec un réseau très performant ; il offre moins de services et des fonctionnalités « entreprise » moins fournies. **Azure** est le choix naturel d'une organisation déjà Microsoft (Active Directory, Office 365) et pour l'hybride cloud/on-premise ; son expérience utilisateur déroute parfois. Pour un CTO, la vraie question derrière ce choix n'est pas technique mais stratégique : **quel écosystème maîtrise mon équipe, et quel niveau d'enfermement suis-je prêt à accepter ?**

---

## Le calcul : un spectre entre contrôle et délégation

La première grande décision d'architecture concerne le *calcul* : où et comment votre code s'exécute. Trois familles existent — machines virtuelles, conteneurs, serverless — et le meilleur moyen de les comprendre est de les voir non comme trois options rivales mais comme **trois points sur un même axe : le curseur entre le contrôle que vous gardez et le travail que vous déléguez.** Plus vous déléguez, moins vous portez de charge opérationnelle, mais plus vous acceptez des contraintes et un risque d'enfermement.

### L'arbre de décision

Deux questions suffisent à orienter la plupart des cas.

```
                 La charge est-elle stateless
                    et event-driven ?
                          │
              ┌───────────┴───────────┐
             OUI                     NON
              │                       │
              ▼                       ▼
        ┌───────────┐      Besoin de contrôler l'OS
        │ SERVERLESS│      ou un matériel spécifique ?
        │  Lambda   │              │
        │ Functions │      ┌───────┴───────┐
        │ Cloud Run │     OUI             NON
        └───────────┘      │               │
                           ▼               ▼
                     ┌──────────┐    ┌───────────┐
                     │   VMs    │    │CONTENEURS │
                     │ EC2/GCE  │    │ EKS/GKE   │
                     │ Azure VM │    │   AKS     │
                     └──────────┘    └───────────┘
```

La logique est la suivante. Si la charge est **sans état et déclenchée par des événements** — une API à trafic irrégulier, un traitement à la réception d'un fichier, une tâche planifiée — le **serverless** est presque toujours le bon départ : vous n'avez aucun serveur à gérer. Sinon, la question devient : avez-vous besoin de contrôler le système d'exploitation, d'accéder à un matériel particulier (GPU spécifique, pilotes, licences), ou de faire tourner une application ancienne qui suppose une machine entière ? Si oui, prenez des **machines virtuelles**. Sinon, les **conteneurs** offrent le meilleur compromis pour la plupart des applications modernes.

Détaillons chaque option par ses forces et ses coûts.

**Serverless (Lambda, Cloud Functions, Azure Functions, Cloud Run).** Le fournisseur exécute votre code à la demande et facture à l'exécution. L'atout maître est le *scale to zero* : quand personne n'appelle votre fonction, vous ne payez rien ; quand mille requêtes arrivent d'un coup, la plateforme crée mille instances. Aucun serveur à administrer. En contrepartie, deux limites structurent son usage. Le **cold start** — la latence du premier appel, le temps que la plateforme démarre une instance — pénalise les usages sensibles à la latence. Et des **plafonds d'exécution** (Lambda coupe à 15 minutes) interdisent les traitements longs. Domaine d'élection : les API, le traitement d'événements, les tâches planifiées.

**Conteneurs (EKS, GKE, AKS — c'est-à-dire Kubernetes managé).** Vous empaquetez votre application avec ses dépendances dans une image portable qui tourne à l'identique partout. Avantages : la **portabilité** (le conteneur se comporte pareil en local, en test, en production) et la **densité** (on empile beaucoup de conteneurs sur peu de machines, d'où une meilleure efficacité). Le coût est la **complexité d'orchestration** : Kubernetes est puissant mais possède une courbe d'apprentissage sévère, et sa maîtrise devient une compétence à part entière dans l'équipe. Domaine d'élection : les architectures en microservices et les applications complexes qui doivent évoluer indépendamment.

**Machines virtuelles (EC2, Compute Engine, Azure VMs).** Vous obtenez une machine complète, contrôle total du système. Avantages : le **contrôle intégral** et le support des **applications héritées** ou des besoins particuliers (Windows, licences, matériel spécifique). Coûts : toute la **charge d'administration** (correctifs, mises à jour, surveillance du système) vous revient, et le rendement est moindre puisqu'une VM réserve ses ressources qu'elle les utilise ou non. Domaine d'élection : le *legacy*, les exigences spéciales, Windows.

La leçon pour un CTO : **le curseur par défaut devrait pencher vers la délégation** (serverless puis conteneurs), et ne revenir vers les VMs que lorsqu'une contrainte réelle l'impose. Chaque cran vers le contrôle est un cran de charge opérationnelle en plus — c'est-à-dire du temps d'ingénieur détourné de la création de valeur.

### En pratique : une fonction serverless soignée

Le code serverless a ses propres bonnes pratiques, et deux d'entre elles méritent une explication car elles reviennent constamment. Voici une fonction Lambda de référence en Python.

```python
import json
import boto3
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver()

# Point clé n°1 : les connexions sont créées HORS du handler.
# Elles sont ainsi réutilisées d'une invocation à l'autre sur une même instance.
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('users')

@logger.inject_lambda_context
@tracer.capture_lambda_handler
@metrics.log_metrics
def lambda_handler(event, context):
    return app.resolve(event, context)

@app.get("/users/<user_id>")
@tracer.capture_method
def get_user(user_id: str):
    logger.info("Fetching user", extra={"user_id": user_id})
    try:
        response = table.get_item(Key={'id': user_id})
        user = response.get('Item')
        if not user:
            return {"statusCode": 404, "body": "User not found"}
        metrics.add_metric(name="UserFetched", unit="Count", value=1)
        return {"statusCode": 200, "body": json.dumps(user)}
    except Exception as e:
        logger.exception("Failed to fetch user")
        return {"statusCode": 500, "body": "Internal error"}
```

Le premier point clé est **l'initialisation des connexions en dehors du handler**. Une instance serverless, une fois démarrée, sert souvent plusieurs requêtes successives avant d'être recyclée. Le code placé au niveau du module ne s'exécute qu'une fois par instance, pas à chaque appel : y déclarer le client de base de données évite de rouvrir une connexion à chaque requête. Le second point est l'usage d'un outillage d'**observabilité structurée** (ici la bibliothèque *Powertools*) qui émet logs, traces et métriques dans un format exploitable — indispensable quand votre application se disperse en centaines de petites fonctions dont vous ne pouvez plus suivre l'exécution à l'œil.

Reste le cold start, l'inconvénient signature du serverless. Trois leviers l'atténuent. La **Provisioned Concurrency** garde en permanence un nombre d'instances « chaudes », prêtes à répondre sans délai de démarrage — utile pour les chemins critiques en latence, mais on repaie alors une part de ce que le scale-to-zero faisait économiser :

```yaml
functions:
  api:
    handler: handler.lambda_handler
    provisionedConcurrency: 5   # 5 instances toujours prêtes
```

Le **chargement paresseux** des dépendances lourdes — n'initialiser un SDK coûteux que lors de son premier usage réel — évite de payer son démarrage quand il ne sert pas. Enfin, **réduire la taille du paquet** (via des couches partagées, en excluant l'inutile, voire en choisissant un langage compilé comme Go ou Rust pour un cold start minimal) accélère le démarrage.

### En pratique : un déploiement Kubernetes de production

Côté conteneurs, un déploiement digne de la production ne se résume pas à « lancer trois copies ». Le manifeste ci-dessous condense les pratiques qui font la différence entre une démo et un service fiable ; il est suivi de son explication.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
  labels: { app: api }
spec:
  replicas: 3
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      # Anti-affinité : éviter que deux copies atterrissent dans la même zone
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels: { app: api }
                topologyKey: topology.kubernetes.io/zone
      # Répartition topologique : équilibrer les copies entre zones
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: { app: api }
      containers:
        - name: api
          image: myregistry/api:v1.2.3
          ports:
            - containerPort: 8080
          # Demandes et limites de ressources
          resources:
            requests: { cpu: "250m", memory: "512Mi" }
            limits:   { cpu: "1000m", memory: "1Gi" }
          # Sondes de disponibilité et de vivacité
          readinessProbe:
            httpGet: { path: /health/ready, port: 8080 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health/live, port: 8080 }
            initialDelaySeconds: 15
            periodSeconds: 20
          # Durcissement sécurité du conteneur
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
          envFrom:
            - secretRef:    { name: api-secrets }
            - configMapRef: { name: api-config }
      serviceAccountName: api-service-account   # pour l'IRSA (rôles IAM par pod)
```

Quatre idées portent ce manifeste. **L'anti-affinité et la répartition topologique** demandent à Kubernetes de ne pas placer toutes les copies dans la même zone de disponibilité : si une zone tombe, il en reste ailleurs — c'est la fiabilité inscrite dans le placement lui-même. Les **requests et limits** déclarent ce dont chaque conteneur a besoin et ce qu'il ne doit pas dépasser : les *requests* servent à l'ordonnanceur pour placer les pods, les *limits* empêchent un conteneur emballé d'affamer ses voisins. Les **sondes** distinguent deux questions différentes : la *readiness* (« ce pod est-il prêt à recevoir du trafic ? ») décide s'il entre dans la rotation du répartiteur de charge, la *liveness* (« ce pod est-il encore vivant ? ») décide s'il faut le redémarrer. Enfin le **securityContext** applique le moindre privilège au conteneur : pas de root, système de fichiers en lecture seule, pas d'escalade de privilèges.

Deux ressources complètent le tableau. L'autoscaler horizontal ajuste le nombre de copies selon la charge observée :

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
    - type: Resource
      resource:
        name: memory
        target: { type: Utilization, averageUtilization: 80 }
```

Ici, le service oscille entre 3 et 50 copies pour maintenir le CPU autour de 70 % et la mémoire autour de 80 %. Le *Pod Disruption Budget*, lui, garantit qu'au moins deux copies restent disponibles pendant les opérations de maintenance (mise à jour de nœuds, par exemple) — pour que la fiabilité ne soit pas sacrifiée aux opérations de routine :

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels: { app: api }
```

### Managé ou auto-hébergé : le vrai arbitrage

Une décision transversale au calcul mérite d'être nommée pour elle-même, car elle revient à chaque brique : **service managé ou auto-hébergé ?** Faut-il utiliser la base de données managée du fournisseur (RDS, Cloud SQL) ou installer et opérer PostgreSQL vous-même sur des VMs ? La règle de conduite la plus saine tient en une phrase : **utilisez des services managés par défaut, et n'auto-hébergez que si vous avez une raison précise.**

Le raisonnement est économique. Un service managé prend en charge les correctifs, les sauvegardes, la réplication, la bascule automatique — tout le travail invisible mais chronophage. Vous payez une prime au fournisseur, mais vous récupérez du temps d'ingénieur et vous réduisez le risque d'erreur humaine. L'auto-hébergement ne se justifie que quand vous avez un besoin de configuration que le managé ne couvre pas, une contrainte de coût à très grande échelle où la prime managée devient significative, ou une exigence de portabilité forte pour éviter l'enfermement. Pour la plupart des organisations, le temps d'ingénieur coûte plus cher que la prime managée — d'où le penchant par défaut. Ce que vous cédez en contrepartie, c'est du contrôle et, souvent, un pas de plus vers le lock-in.

---

## Réseau et sécurité : les fondations qu'on ne voit pas

Le réseau est la couche qu'on remarque seulement quand elle est mal faite — par une faille ou une panne. Bien conçue, elle est le premier rempart de sécurité *et* la première brique de résilience. Deux concepts la structurent : la découpe en sous-réseaux (le **VPC**) et le filtrage du trafic (les **groupes de sécurité**).

### Anatomie d'un VPC de production

Un **VPC** (Virtual Private Cloud) est votre réseau privé isolé dans le cloud. On lui donne une plage d'adresses (par exemple `10.0.0.0/16`, soit 65 536 adresses) qu'on découpe en **sous-réseaux**, chacun rattaché à une zone de disponibilité. Le schéma qui suit illustre le patron le plus répandu : trois étages superposés, chacun réparti sur trois zones.

```
Région : us-east-1     VPC CIDR : 10.0.0.0/16

┌─ SOUS-RÉSEAUX PUBLICS ─ (répartiteurs de charge, passerelles NAT) ─┐
│   AZ-1a               AZ-1b               AZ-1c                     │
│   10.0.1.0/24         10.0.2.0/24         10.0.3.0/24              │
│   NAT GW + ALB        NAT GW + ALB        NAT GW + ALB             │
└────────────────────────────────────────────────────────────────────┘
                              │
┌─ SOUS-RÉSEAUX PRIVÉS ─ (couche applicative : EKS, ECS, EC2) ───────┐
│   AZ-1a               AZ-1b               AZ-1c                     │
│   10.0.11.0/24        10.0.12.0/24        10.0.13.0/24             │
│   nœuds EKS / EC2     nœuds EKS / EC2     nœuds EKS / EC2          │
└────────────────────────────────────────────────────────────────────┘
                              │
┌─ SOUS-RÉSEAUX DATA ─ (bases, cache, stockage) ────────────────────┐
│   AZ-1a               AZ-1b               AZ-1c                     │
│   10.0.21.0/24        10.0.22.0/24        10.0.23.0/24             │
│   RDS primary         RDS replica         RDS replica              │
│   ElastiCache         ElastiCache         ElastiCache              │
└────────────────────────────────────────────────────────────────────┘
```

L'idée directrice est la **défense en profondeur par étages**. Les sous-réseaux **publics** sont les seuls exposés à Internet ; on n'y place que ce qui doit l'être : les répartiteurs de charge qui reçoivent le trafic entrant, et les passerelles NAT qui permettent aux couches internes de sortir vers Internet sans être joignables depuis l'extérieur. Les sous-réseaux **privés** hébergent l'application ; ils ne sont pas directement accessibles depuis Internet — le trafic passe obligatoirement par le répartiteur. Les sous-réseaux **data** hébergent les bases et le cache, encore plus enfouis : seule l'application peut les joindre. Un attaquant qui percerait la couche publique se heurterait ainsi à deux barrières supplémentaires avant d'atteindre les données.

Cette barrière, ce sont les **groupes de sécurité** : des pare-feux attachés aux ressources, qui définissent qui peut parler à qui. Le point remarquable est qu'ils se référencent *l'un l'autre* plutôt que des plages d'adresses :

```
sg-alb : autorise le port 443 depuis 0.0.0.0/0      (Internet → répartiteur)
sg-app : autorise le port 8080 depuis sg-alb seul   (répartiteur → application)
sg-db  : autorise le port 5432 depuis sg-app seul   (application → base)
```

Chaque étage n'accepte de connexions que de l'étage juste au-dessus. La base de données n'est joignable que par l'application, qui n'est joignable que par le répartiteur, seul exposé au monde. C'est le **moindre privilège appliqué au réseau** — et l'un des réflexes les plus rentables d'un architecte cloud, car il transforme une éventuelle intrusion en impasse.

### IAM : le moindre privilège comme discipline

Si le réseau contrôle *quelle machine* parle à quelle machine, l'**IAM** (Identity and Access Management) contrôle *quelle identité* a le droit de faire *quelle action* sur *quelle ressource*. C'est probablement le pilier de sécurité le plus important du cloud, et le plus souvent bâclé. La tentation, sous la pression, est d'accorder large « pour que ça marche ». C'est exactement ce qu'il ne faut pas faire.

Comparez ces deux politiques IAM. La première dit « tout le monde peut tout faire partout » :

```json
// À proscrire : bien trop permissif
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }]
}
```

La seconde applique le **moindre privilège** : elle n'accorde que les actions précises, sur les ressources précises, avec en prime une condition qui restreint l'accès aux seules données appartenant à l'utilisateur courant.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadSpecificBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-specific-bucket",
        "arn:aws:s3:::my-specific-bucket/*"
      ]
    },
    {
      "Sid": "WriteToSpecificDynamo",
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789:table/my-table",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${aws:userid}"]
        }
      }
    }
  ]
}
```

Le principe est simple à énoncer, exigeant à tenir : **on part de zéro permission et on n'ajoute que le strict nécessaire.** L'inverse — partir de permissions larges et retirer ensuite — ne fonctionne jamais, parce que personne n'ose retirer un droit de peur de casser quelque chose. Pour un CTO, la valeur de ce principe est de réduire le *rayon d'explosion* d'une compromission : si un identifiant fuit, il ne donne accès qu'à ce que cette identité pouvait légitimement toucher. Le lien avec Kubernetes vu plus haut (l'IRSA, qui attache un rôle IAM à un pod précis) prolonge exactement cette idée jusqu'à l'échelle du conteneur.

### Le chiffrement, partout et par défaut

Le troisième réflexe de sécurité est de **chiffrer au repos et en transit, par défaut**. « Au repos » signifie sur le disque ; « en transit », sur le réseau. Le coût en performance est aujourd'hui négligeable, et l'activer dès le départ évite d'avoir à migrer des données en clair plus tard. En infrastructure-as-code, cela se déclare une fois pour toutes. Voici une base de données et un bucket correctement durcis :

```hcl
# Base RDS chiffrée, TLS imposé
resource "aws_db_instance" "main" {
  storage_encrypted    = true
  kms_key_id           = aws_kms_key.rds.arn
  parameter_group_name = aws_db_parameter_group.require_ssl.name
}

resource "aws_db_parameter_group" "require_ssl" {
  family = "postgres14"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

# Bucket S3 chiffré et fermé à tout accès public
resource "aws_s3_bucket" "data" {
  bucket = "my-secure-bucket"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

Le `public_access_block` mérite une mention spéciale : la fuite de données cloud la plus banale est le bucket de stockage laissé ouvert par mégarde. Ce bloc de quatre lignes rend l'erreur impossible. C'est le genre de garde-fou qu'on inscrit une fois dans son modèle standard et qu'on n'a plus jamais à reconsidérer.

---

## Résilience : concevoir pour la panne

Le principe fondateur du cloud, on l'a dit, est de **concevoir en supposant que tout va tomber**. La question n'est donc jamais « comment empêcher la panne ? » mais « quel niveau de panne dois-je survivre, et à quel coût ? ». La réponse se décline sur deux échelles : la zone de disponibilité et la région.

### Multi-zone : le minimum vital

Une **zone de disponibilité** (AZ) est un datacenter physiquement isolé au sein d'une région — sa propre alimentation, son propre refroidissement, son propre réseau. Une région en contient typiquement trois ou plus. Le **déploiement multi-zone** consiste à répartir ses ressources sur plusieurs AZ d'une même région, de sorte que la perte d'un datacenter entier ne coupe pas le service. C'est ce qu'illustraient déjà le VPC à trois étages et l'anti-affinité Kubernetes : chaque couche existe en trois exemplaires, un par zone.

Le multi-zone est le **standard de fait** pour toute charge de production sérieuse. Il protège contre l'incident le plus courant — la défaillance d'un datacenter — et son surcoût est modeste : les zones d'une même région sont reliées par un réseau à faible latence, la réplication entre elles est quasi instantanée, et le trafic inter-zones est peu ou pas facturé. Pour un CTO, c'est le compromis le plus évident du cloud : un gain de fiabilité majeur pour un coût marginal.

### Multi-région : puissant, coûteux, à justifier

Le **multi-région** protège contre une catastrophe qui frapperait une région entière — un événement rare mais pas impossible. Le schéma ci-dessous montre une architecture *active-active* : plusieurs régions servent le trafic simultanément, un service DNS routant chaque utilisateur vers la région la plus proche.

```
                      ┌───────────────┐
                      │   Route 53    │   routage par latence
                      │  + health     │   ou géolocalisation
                      └───────┬───────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        US-EAST-1        EU-WEST-1        AP-SOUTH-1
        ┌───────┐        ┌───────┐        ┌───────┐
        │  ALB  │        │  ALB  │        │  ALB  │
        │   ↓   │        │   ↓   │        │   ↓   │
        │  EKS  │        │  EKS  │        │  EKS  │
        │   ↓   │        │   ↓   │        │   ↓   │
        │Aurora │        │Aurora │        │Aurora │
        │Primary│        │Replica│        │Replica│
        └───┬───┘        └───┬───┘        └───┬───┘
            └────────────────┼────────────────┘
                  Aurora Global Database
                  (réplication asynchrone < 1 s)
```

Ce qui rend le multi-région difficile n'est pas de dupliquer les serveurs — ils sont *stateless*, donc n'importe quelle région peut traiter n'importe quelle requête. La difficulté est la **cohérence des données**. On ne peut pas faire tenir une base de données à jour instantanément sur trois continents sans compromis ; la physique impose une latence. D'où les arbitrages du schéma :

- **Les lectures** se font dans la région locale, pour une latence minimale.
- **Les écritures** sont routées vers la région primaire (via *write forwarding* ou une logique applicative), ou gérées par une résolution de conflits si l'on veut écrire partout.
- **Le cache** est local à chaque région (un ElastiCache par région).

La technologie sous-jacente — ici **Aurora Global Database** — réplique de façon asynchrone les écritures de la région primaire vers les répliques des autres régions, avec un retard inférieur à la seconde. Cela donne un **RPO** (*Recovery Point Objective*, la quantité de données qu'on accepte de perdre en cas de sinistre) inférieur à une seconde, et une **bascule** de la base en moins d'une minute. Combiné aux health checks du DNS et à des applications sans état capables de reprendre le trafic partout, on obtient un service qui survit à la perte d'une région entière.

Le compromis, pour un CTO, est franc : **le multi-région multiplie le coût et la complexité opérationnelle**. On paie l'infrastructure en plusieurs exemplaires, le transfert de données inter-région (facturé, lui), et surtout une complexité de raisonnement (cohérence, conflits, tests de bascule) qui pèse durablement sur l'équipe. La règle de décision : rester en **multi-zone** tant que la disponibilité visée ne l'exige pas, et ne passer au **multi-région** que lorsqu'une contrainte réelle le commande — utilisateurs véritablement mondiaux à qui la latence importe, ou exigence réglementaire ou contractuelle de survie au sinistre régional. Le multi-région est une décision d'affaires autant que technique.

---

## Infrastructure-as-code : l'infrastructure comme un logiciel

Nous avons multiplié les extraits de configuration. Ce n'est pas un hasard : dans le cloud, **l'infrastructure se décrit par du code**, versionné, relu et déployé comme n'importe quel logiciel. C'est le sens du premier pilier (excellence opérationnelle) et de la règle « automatisez tout : si c'est manuel, c'est une dette ».

Le problème que résout l'**infrastructure-as-code** (IaC) est celui de la reproductibilité. Une infrastructure montée à la main dans une console web n'est ni documentée, ni reproductible, ni auditable : personne ne sait exactement ce qui tourne ni pourquoi, et recréer l'environnement de production à l'identique relève de l'archéologie. En la décrivant dans des fichiers, on obtient une **source de vérité unique** : le code *est* l'infrastructure, on peut le relire en revue, le tester, revenir en arrière, et recréer un environnement complet d'une commande. **Terraform** est l'outil de référence, parce qu'il parle à AWS, GCP et Azure avec le même langage — un rempart contre l'enfermement.

### Structurer un projet Terraform

La bonne structure sépare deux choses : les **modules** (des briques réutilisables — un VPC, un cluster, une base) et les **environnements** (dev, staging, prod) qui assemblent ces briques avec des paramètres différents.

```
project/
├── modules/          # briques réutilisables
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── eks/
│   └── rds/
└── environments/     # assemblages paramétrés
    ├── dev/
    ├── staging/
    └── prod/
        ├── main.tf
        ├── backend.tf
        └── terraform.tfvars
```

Un module encapsule une intention. Voici un module VPC qui s'appuie lui-même sur un module communautaire éprouvé — car réécrire un VPC de zéro est une perte de temps et une source de bugs :

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# Valeurs dynamiques via data source plutôt qu'en dur
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
  # Étiquetage cohérent sur toutes les ressources
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Owner       = var.owner
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"

  name = "${var.project_name}-${var.environment}"
  cidr = var.vpc_cidr

  azs              = local.azs
  private_subnets  = var.private_subnet_cidrs
  public_subnets   = var.public_subnet_cidrs
  database_subnets = var.database_subnet_cidrs

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "prod"  # une seule NAT hors prod : économie
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags  = { "kubernetes.io/role/elb"          = 1 }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }

  tags = local.common_tags
}
```

Deux détails révèlent la maturité de ce code. La ligne `single_nat_gateway = var.environment != "prod"` illustre l'optimisation de coût conditionnelle : en production on veut une passerelle NAT par zone (redondance), mais en dev une seule suffit — inutile de payer la haute disponibilité d'un environnement de test. Et l'étiquetage cohérent (`common_tags`) prépare le terrain du FinOps que nous verrons juste après : sans tags, impossible de savoir qui dépense quoi.

L'environnement de production, lui, ne fait qu'assembler le module avec ses valeurs :

```hcl
module "vpc" {
  source = "../../modules/vpc"

  environment  = "prod"
  project_name = "myapp"
  owner        = "platform-team"

  vpc_cidr              = "10.0.0.0/16"
  private_subnet_cidrs  = ["10.0.1.0/24",   "10.0.2.0/24",   "10.0.3.0/24"]
  public_subnet_cidrs   = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  database_subnet_cidrs = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}
```

### L'état partagé : le détail qui sauve

Terraform garde un **fichier d'état** qui mémorise ce qu'il a créé. Ce fichier ne doit jamais vivre sur le poste d'un ingénieur : il doit être **centralisé et verrouillé**, sous peine de corruption si deux personnes l'appliquent en même temps. La configuration de *backend* ci-dessous stocke l'état dans un bucket S3 chiffré et utilise une table pour le verrouillage — de sorte qu'un seul `apply` puisse s'exécuter à la fois :

```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "prod/vpc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"   # verrou d'état : un seul apply à la fois
  }
}
```

C'est le genre de détail invisible qui, négligé, provoque un incident majeur le jour où deux déploiements se croisent. Un CTO n'a pas à écrire ce code, mais il doit s'assurer que son équipe l'a mis en place.

### GitOps : le dépôt Git comme source de vérité

Pour les charges Kubernetes, l'IaC se prolonge en **GitOps** : l'état désiré du cluster est décrit dans un dépôt Git, et un agent (ici **ArgoCD**) veille en permanence à ce que le cluster réel corresponde à ce que dit Git. Toute modification passe par un commit ; toute dérive manuelle est automatiquement corrigée.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/k8s-manifests
    targetRevision: main
    path: apps/myapp/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: myapp-prod
  syncPolicy:
    automated:
      prune: true      # supprime ce qui n'est plus dans Git
      selfHeal: true   # annule les modifications manuelles
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff: { duration: 5s, factor: 2, maxDuration: 3m }
```

Les deux options qui font la valeur du GitOps sont `prune` et `selfHeal`. La première supprime du cluster ce qui a disparu de Git ; la seconde annule toute modification faite à la main directement sur le cluster. Ensemble, elles garantissent que **Git est la seule vérité** : plus de dérive silencieuse, plus de « pourquoi ça marche en prod mais pas en staging ? ». Le prix à payer est une discipline stricte — on ne touche plus jamais au cluster à la main — mais c'est précisément ce qu'on veut.

---

## Coût et FinOps : le coût comme fonctionnalité

Nous arrivons au pilier qu'un CTO ne peut pas déléguer : le **coût**. Dans le cloud, dépenser est trop facile ; la même élasticité qui vous sert vous dessert. La discipline qui consiste à traiter le coût comme une préoccupation d'ingénierie de premier ordre — et non comme une note de bas de page qu'on découvre à la fin du mois — s'appelle le **FinOps**. Sa maxime tient en une phrase : *le coût est une fonctionnalité, à optimiser dès la conception.*

Le bon ordre d'attaque suit une pyramide, du geste immédiat au choix structurel.

```
              ┌─────────┐
              │ Quick   │  gains immédiats
              │  Wins   │
              └────┬────┘
         ┌─────────▼─────────┐
         │   Right-Sizing    │  30–40 % d'économies
         └─────────┬─────────┘
    ┌──────────────▼──────────────┐
    │      Modèles tarifaires      │  40–70 % d'économies
    │ (Reserved / Spot / Savings)  │
    └──────────────┬──────────────┘
┌──────────────────▼──────────────────┐
│    Optimisation d'architecture       │
│ (serverless, managé, bon stockage)   │
└──────────────────────────────────────┘
```

### Les gains immédiats : traquer le gaspillage

Le premier niveau ne demande aucune décision d'architecture : il s'agit de **débrancher ce qui coûte sans servir**. Le cloud accumule des ressources orphelines — des disques détachés qu'on paie toujours, des adresses IP réservées mais inutilisées, de vieux instantanés. Quelques requêtes suffisent à les débusquer :

```bash
# Disques EBS détachés (payés dans le vide)
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[*].{ID:VolumeId,Size:Size,Created:CreateTime}'

# Adresses IP élastiques non associées
aws ec2 describe-addresses \
  --query 'Addresses[?AssociationId==`null`]'

# Instantanés anciens
aws ec2 describe-snapshots --owner-ids self \
  --query 'Snapshots[?StartTime<=`2023-01-01`]'
```

Dans la même veine, les **politiques de cycle de vie** sur le stockage objet déplacent automatiquement les données vers des classes moins chères à mesure qu'elles vieillissent — un objet rarement consulté n'a pas besoin de résider sur le stockage le plus rapide et le plus cher :

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "Move to IA after 30 days",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [
        {"Days": 30,  "StorageClass": "STANDARD_IA"},
        {"Days": 90,  "StorageClass": "GLACIER"},
        {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
      ],
      "Expiration": {"Days": 730}
    }]
  }'
```

Après 30 jours les données passent en accès peu fréquent, après 90 en archive, après un an en archive profonde, et sont supprimées à deux ans — chaque palier divisant le coût de stockage.

### Le right-sizing : payer pour ce qu'on utilise

Le deuxième niveau, qui rapporte typiquement 30 à 40 %, consiste à **ajuster la taille des machines à leur usage réel**. Par prudence ou par habitude, on surdimensionne : une instance tourne à 10 % de CPU alors qu'on paie pour 100 %. Le repérer est mécanique — il suffit de croiser l'inventaire des instances avec leur utilisation CPU moyenne sur deux semaines :

```python
import boto3
from datetime import datetime, timedelta

cloudwatch = boto3.client('cloudwatch')
ec2 = boto3.client('ec2')

def get_cpu_utilization(instance_id, days=14):
    """Utilisation CPU moyenne sur les N derniers jours."""
    response = cloudwatch.get_metric_statistics(
        Namespace='AWS/EC2',
        MetricName='CPUUtilization',
        Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
        StartTime=datetime.utcnow() - timedelta(days=days),
        EndTime=datetime.utcnow(),
        Period=86400,
        Statistics=['Average']
    )
    if response['Datapoints']:
        return sum(d['Average'] for d in response['Datapoints']) / len(response['Datapoints'])
    return None

def find_oversized_instances():
    """Instances à faible utilisation CPU — candidates au redimensionnement."""
    instances = ec2.describe_instances(
        Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
    )
    oversized = []
    for reservation in instances['Reservations']:
        for instance in reservation['Instances']:
            cpu_avg = get_cpu_utilization(instance['InstanceId'])
            if cpu_avg and cpu_avg < 20:   # moins de 20 % de CPU
                oversized.append({
                    'InstanceId': instance['InstanceId'],
                    'InstanceType': instance['InstanceType'],
                    'AvgCPU': round(cpu_avg, 2),
                    'Recommendation': 'Réduire la taille ou passer en Spot'
                })
    return oversized
```

En pratique, les fournisseurs proposent des recommandations automatiques (AWS Compute Optimizer, par exemple) qui font ce travail à votre place. L'essentiel est d'en faire une **routine**, pas un ménage de printemps : les usages dérivent, et le right-sizing est un exercice continu.

### Les modèles tarifaires : payer moins pour le même service

Le troisième niveau, le plus rentable (40 à 70 %), ne change rien à votre architecture : il change *comment vous payez la même chose*. Trois modèles coexistent, à combiner selon la nature de la charge.

| | Instances réservées | Savings Plans | Instances Spot |
|---|---|---|---|
| **Économie** | jusqu'à 72 % | jusqu'à 72 % | jusqu'à 90 % |
| **Engagement** | 1 ou 3 ans | 1 ou 3 ans | aucun |
| **Souplesse** | type d'instance figé | tout type / région | tout type |
| **Interruption** | non | non | oui (préavis 2 min) |
| **Idéal pour** | charge stable | charge variable mais prévisible | tolérant aux pannes (batch, dev) |

La logique est celle d'un **engagement en échange d'une remise**. Les **instances réservées** et les **Savings Plans** vous font vous engager sur un ou trois ans en échange d'une forte réduction : parfaits pour la charge de fond, celle qui tourne 24 h/24 et qu'on connaît d'avance. Les **Savings Plans** sont plus souples (ils s'appliquent à n'importe quel type d'instance), les réservées plus rigides mais parfois moins chères. Les **instances Spot**, elles, exploitent la capacité inutilisée du fournisseur à prix cassé (jusqu'à −90 %), au prix d'une contrainte forte : elles peuvent être **reprises à tout moment avec deux minutes de préavis**. Elles ne conviennent donc qu'aux charges qui tolèrent l'interruption — traitements par lots, environnements de dev, tâches redémarrables.

D'où une stratégie de portefeuille équilibrée : couvrir la charge de fond par des engagements, absorber la variabilité en tarif à la demande, et confier l'accessoire au Spot.

```
60–70 % Réservé / Savings Plans   (socle stable)
20–30 % On-Demand                 (charge variable)
10–20 % Spot                      (batch, dev)
```

### Voir la dépense : le rôle des tags

Rien de tout cela n'est pilotable si l'on ne sait pas *qui* dépense *quoi*. C'est le rôle des **tags d'allocation de coûts** : en étiquetant chaque ressource par environnement, équipe, projet et centre de coût, on rend la facture lisible et on peut la refacturer aux équipes. Le point critique est de **rendre l'étiquetage obligatoire** — une ressource sans tags est une dépense invisible.

```yaml
required_tags:
  - Key: Environment
    Values: [dev, staging, prod]
  - Key: Team
    Values: [platform, backend, frontend, data]
  - Key: Project
    Values: [main-app, data-pipeline, ml-platform]
  - Key: CostCenter
    Values: [eng-001, eng-002, data-001]
```

On peut même faire respecter cette règle automatiquement, en refusant ou en signalant toute ressource non conforme :

```json
{
  "ConfigRuleName": "required-tags",
  "Source": { "Owner": "AWS", "SourceIdentifier": "REQUIRED_TAGS" },
  "InputParameters": {
    "tag1Key": "Environment",
    "tag2Key": "Team",
    "tag3Key": "Project"
  },
  "Scope": {
    "ComplianceResourceTypes": [
      "AWS::EC2::Instance",
      "AWS::RDS::DBInstance",
      "AWS::S3::Bucket"
    ]
  }
}
```

Le quatrième et dernier niveau de la pyramide — l'**optimisation d'architecture** — boucle avec tout ce chapitre : préférer le serverless quand la charge est intermittente (on ne paie pas les temps morts), les services managés (mieux mutualisés), et la bonne classe de stockage. Les plus grosses économies ne viennent pas d'une remise, mais d'un meilleur choix de conception. C'est pourquoi le coût doit s'inviter dès le premier schéma d'architecture, pas au moment de la facture.

---

## Deux cas concrets, pensés en trade-offs

Deux situations reviennent sans cesse dans la vie d'un CTO. Les traiter explicitement montre comment tous les principes précédents s'articulent en décisions.

### Concevoir une architecture e-commerce multi-région

Avant tout schéma, la bonne démarche est de **poser les questions** : les utilisateurs sont-ils réellement mondiaux ? Les écritures peuvent-elles se faire dans une seule région, ou faut-il écrire partout ? Quelles exigences de cohérence — le catalogue produits tolère la cohérence éventuelle, les paiements exigent la cohérence forte ? Et quels objectifs de reprise (RTO/RPO) ? Ce sont ces réponses qui dictent l'architecture, pas l'inverse.

Une fois ce cadrage fait, l'architecture ressemble à celle-ci : un DNS à routage par latence (Route 53) répartit les utilisateurs vers trois régions, chacune servie par un CDN (CloudFront), un répartiteur (ALB), un cluster (EKS), une base Aurora et un cache local.

```
                 ┌─────────────────────┐
                 │      Route 53       │
                 │ routage par latence │
                 │  + health checks    │
                 └──────────┬──────────┘
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   US-EAST-1           EU-WEST-1           AP-SOUTHEAST
   CloudFront          CloudFront          CloudFront
      ↓                   ↓                   ↓
    ALB                 ALB                 ALB
      ↓                   ↓                   ↓
    EKS                 EKS                 EKS
      ↓                   ↓                   ↓
  Aurora Global ←──── Aurora ────────────► Aurora
  Primary            Replica              Replica
      +                  +                   +
  ElastiCache        ElastiCache         ElastiCache
   (local)            (local)             (local)
```

Les décisions clés découlent des questions de départ. **La base** : une Aurora Global Database avec sa primaire en US-EAST-1 ; les écritures routées vers la primaire (par *write forwarding* ou logique applicative), les lectures servies localement pour la latence, un RPO sous la seconde. **Le cache** : un ElastiCache local par région, en *cache-aside* avec un TTL adapté — le catalogue produits se contente d'une cohérence éventuelle. **La cohérence**, justement, se traite par type de donnée : recherche produit en lecture locale éventuellement cohérente ; panier et session via DynamoDB Global Tables ou affinité de session ; paiements routés vers une région unique ou traités en transactions distribuées, car ils exigent la cohérence forte. **La bascule** : health checks DNS, bascule Aurora automatique en moins d'une minute, promotion manuelle pour la région de secours. **La synchronisation des données** enfin : réplication Aurora pour les données utilisateur, Global Tables pour les sessions, réplication inter-région de S3 plus CloudFront pour les fichiers statiques.

Le fil conducteur : **on ne réplique pas tout de la même façon**. Chaque donnée reçoit le niveau de cohérence que son usage justifie — et pas davantage, car chaque cran de cohérence supplémentaire se paie en latence, en coût et en complexité.

### Migrer un monolithe on-premise vers le cloud

La tentation du *big bang* — tout basculer d'un coup — est la meilleure façon d'échouer. La stratégie éprouvée est le **« lift and shift » puis « modernize »** : on déménage d'abord, on modernise ensuite, par vagues, avec un retour arrière toujours possible.

La **phase d'évaluation** (4 à 6 semaines) cartographie l'existant : dépendances (bases, API, fichiers), intégrations, profils de trafic, références de performance, besoins en calcul, stockage et réseau. Elle chiffre aussi le coût total de possession (TCO) on-premise contre cloud, le coût de la migration elle-même et le coût récurrent à venir — car migrer sans modèle de coût, c'est se préparer une mauvaise surprise.

La **phase pilote** (4 à 8 semaines) choisit un composant *non critique*, le déplace tel quel, et valide : la performance est-elle acceptable, la connectivité fonctionne-t-elle, la sécurité est-elle conforme ? On en tire des enseignements documentés avant d'aller plus loin.

La **migration par vagues** suit un ordre de risque croissant. Vague 1 : les composants sans état (serveurs web, serveurs d'API), faciles à déplacer. Vague 2 : les composants avec état (bases de données via un service de migration comme DMS, couches de cache). Vague 3 : les services cœur, les plus critiques et les plus risqués, qui demandent le plus de tests. Enfin, l'**optimisation** est continue : right-sizing, instances réservées, bascule vers des services managés, conteneurisation, puis ré-architecture éventuelle.

Deux patrons rendent tout cela sûr. Le **Strangler Fig** (« figuier étrangleur ») fait cohabiter l'ancien et le nouveau derrière un répartiteur qui déplace le trafic progressivement, jamais d'un bloc :

```
              Répartiteur de charge
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
      ┌────────┐            ┌───────────┐
      │ Legacy │            │  Nouveau  │
      │ On-Prem│            │   Cloud   │
      └────────┘            └───────────┘

  Jour 1   : 100 % Legacy
  Semaine 2:  90 % Legacy / 10 % Cloud   (canary)
  Semaine 4:  50 / 50
  Semaine 8:  10 % Legacy                 (filet de sécurité)
  Semaine 12: 100 % Cloud
```

À chaque palier, on observe : si le nouveau se comporte mal, on renvoie le trafic vers l'ancien sans drame. Pour les bases, la **migration de données** s'appuie sur un service comme DMS avec capture des changements (CDC) : on synchronise en continu l'ancienne base vers la nouvelle, et on bascule (*cutover*) seulement quand l'écart résiduel est minime — ce qui réduit la fenêtre d'indisponibilité à presque rien.

Les risques à garder en tête sont concrets : la latence réseau entre on-premise et cloud pendant la phase hybride ; la cohérence des données en cours de migration ; l'existence d'un plan de retour arrière (essentiel, jamais optionnel) ; et la formation de l'équipe, sans laquelle la plus belle architecture cloud reste mal exploitée.

---

## À retenir

1. **Concevoir pour la panne.** Tout finit par tomber ; l'architecture cloud consiste à décider *quel niveau de panne* on survit — zone, région — et à quel coût. Le multi-zone est le minimum de production ; le multi-région se justifie, il ne se subit pas.

2. **Le Well-Architected est une grille d'arbitrage, pas une checklist.** Ses six piliers (excellence opérationnelle, sécurité, fiabilité, performance, coût, durabilité) se contredisent ; le métier consiste à choisir lesquels privilégier pour *votre* contexte.

3. **Le calcul est un curseur entre contrôle et délégation.** Serverless quand la charge est intermittente et sans état, conteneurs pour les applications modernes, VMs seulement quand une contrainte réelle l'impose. Par défaut, pencher vers la délégation : chaque cran de contrôle est un cran de charge opérationnelle.

4. **Managé par défaut.** Le temps d'ingénieur coûte plus cher que la prime d'un service managé. N'auto-hébergez que pour une raison précise — configuration, coût à très grande échelle, ou lutte contre l'enfermement.

5. **Le moindre privilège, sur le réseau comme en IAM.** Partir de zéro permission et n'ajouter que le nécessaire ; segmenter en sous-réseaux avec des groupes de sécurité qui se référencent. C'est ce qui transforme une intrusion en impasse.

6. **Automatiser tout par le code.** L'infrastructure-as-code (Terraform) et le GitOps font de l'infrastructure un logiciel : reproductible, relisible, réversible. Ce qui est manuel est une dette et une source d'incident.

7. **Le coût est une fonctionnalité.** À optimiser dès la conception, dans l'ordre : gains immédiats, right-sizing, modèles tarifaires (réservé / Spot / à la demande), puis architecture. Sans tags obligatoires, la dépense est invisible et donc impilotable.

---

## Pour aller plus loin

**Certifications** — pour structurer une montée en compétence d'équipe : *AWS Solutions Architect Professional*, *GCP Professional Cloud Architect*, *Azure Solutions Architect Expert*.

**Lectures** — *Cloud Native Patterns* (Cornelia Davis) pour les patrons d'architecture cloud ; *Terraform: Up & Running* (Yevgeniy Brikman) pour l'IaC en profondeur ; *Kubernetes in Action* (Marko Lukša) pour l'orchestration de conteneurs. Et, sur la pensée des systèmes de données distribués qui sous-tend les choix de cohérence multi-région, *Designing Data-Intensive Applications* (Martin Kleppmann).

**Documentation officielle** — [docs.aws.amazon.com](https://docs.aws.amazon.com/), [cloud.google.com/docs](https://cloud.google.com/docs), [docs.microsoft.com/azure](https://learn.microsoft.com/azure/) — à consulter pour les détails de services, qui évoluent vite.
