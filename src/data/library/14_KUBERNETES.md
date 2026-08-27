# Kubernetes, le vrai modèle mental

## De Borg à la production, sans magie

Kubernetes souffre d'une mauvaise réputation : celle d'une boîte noire monstrueusement complexe qu'on subit plus qu'on ne comprend. C'est faux. Sous le bruit des manifestes YAML se cache une idée unique, presque triviale, dont tout le reste découle mécaniquement. Une fois cette idée en tête, chaque objet Kubernetes cesse d'être une incantation et devient une conséquence logique.

Ce chapitre vise à installer ce modèle mental. On part de l'idée-mère, on descend dans le plan de contrôle qui l'incarne, puis on remonte à travers les objets que vous manipulez au quotidien — du Pod jusqu'à l'Ingress — avant d'aborder l'ordonnancement, la santé des applications, le stockage et la sécurité. À chaque étape : pourquoi ça existe, l'intuition, le détail technique réel, et le coût.

---

## 1. L'idée-mère : déclarer l'état voulu, laisser des boucles le réaliser

### Le problème que Kubernetes résout vraiment

Avant l'orchestration, déployer une application était une **suite d'ordres impératifs** : « copie ce binaire sur ce serveur, lance-le, ouvre ce port, si la machine tombe, réveille-toi à 3 h du matin et relance tout à la main ». Chaque action était un pas dans une procédure fragile, et le moindre écart entre ce que vous croyiez avoir et ce que vous aviez réellement se payait en incidents.

Google a rencontré ce mur à une échelle où aucune équipe humaine ne pouvait suivre, et a construit **Borg** pour y répondre. Kubernetes est l'implémentation open-source des idées de Borg. Sa contribution centrale n'est pas « lancer des conteneurs » — Docker le faisait déjà — mais un **renversement de paradigme** : on cesse de donner des ordres, on décrit un résultat.

### L'intuition : le thermostat, pas l'interrupteur

Un interrupteur est impératif : vous l'actionnez, la lumière change, point. Si quelqu'un rééteint, vous devez ré-agir.

Un **thermostat** est déclaratif : vous annoncez « je veux 21 °C ». Vous ne dites jamais « allume le chauffage 4 minutes ». Le thermostat mesure en continu la température réelle, la compare à la cible, et agit pour combler l'écart. Ouvrez une fenêtre : il compense, sans nouvelle instruction. La cible est un fait stable ; l'atteindre est un travail permanent.

Kubernetes est un thermostat pour votre infrastructure. Vous écrivez un objet qui dit « je veux 3 exemplaires de cette application » — c'est l'**état désiré** (*desired state*). Le système observe l'**état réel** (*current state*), et une **boucle de réconciliation** (*reconciliation loop*) travaille sans relâche à faire converger le réel vers le désiré.

### Le détail technique : la boucle de réconciliation

Tout Kubernetes est bâti sur ce motif, répété partout :

```
boucle infinie :
    désiré = lire l'objet dans etcd        # ce que vous avez déclaré
    réel   = observer le monde              # ce qui tourne vraiment
    si réel ≠ désiré :
        agir pour combler l'écart           # créer, supprimer, ajuster
    attendre un peu
```

Cette boucle n'est pas un artefact d'implémentation : c'est le cœur conceptuel. Elle explique pourquoi Kubernetes est **auto-réparateur** (*self-healing*). Un Pod meurt ? Le réel passe sous le désiré, la boucle recrée. Un nœud disparaît ? Ses Pods sont replanifiés ailleurs. Vous n'avez rien scripté pour cela ; c'est la conséquence directe du fait qu'une boucle compare en permanence.

Cela explique aussi la propriété la plus importante en pratique : les manifestes sont **idempotents**. Appliquer deux fois le même fichier ne casse rien — le second `apply` ne trouve aucun écart, donc n'agit pas. Votre configuration devient une **source de vérité versionnable** (c'est tout le fondement du GitOps), et non un journal d'actions passées.

**Le coût.** Ce modèle a un prix bien réel. D'abord, une **latence** et une consommation de ressources : des dizaines de boucles tournent en permanence, observent, comparent. Ensuite, un **découplage déroutant** entre l'action et l'effet : vous n'ordonnez jamais « redémarre ce Pod », vous modifiez un état désiré et *attendez* que le système réagisse. Le débogage devient une enquête — « pourquoi le réel ne rejoint-il pas le désiré ? » — plutôt qu'une lecture de logs d'exécution. C'est le déplacement mental le plus difficile, et le plus payant.

---

## 2. Le plan de contrôle : le cerveau qui fait tourner les boucles

L'idée-mère a besoin d'organes. L'ensemble s'appelle le **plan de contrôle** (*control plane*), historiquement hébergé sur des nœuds « maîtres ». Il comprend quatre composants, plus un agent présent sur chaque machine de travail.

```
┌──────────────────── PLAN DE CONTRÔLE ────────────────────┐
│                                                          │
│   API Server ◄──── seul point d'entrée de TOUT           │
│      │                                                   │
│      ├──► etcd            (la mémoire : état désiré+réel) │
│      ├──► Scheduler       (où placer les Pods)           │
│      └──► Controller Mgr  (les boucles de réconciliation)│
└──────────────────────────┬───────────────────────────────┘
                           │ (l'API Server, jamais en direct)
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │ NŒUD 1  │        │ NŒUD 2  │        │ NŒUD N  │
   │ kubelet │        │ kubelet │        │ kubelet │
   │ runtime │        │ runtime │        │ runtime │  (containerd / CRI-O)
   │  Pods   │        │  Pods   │        │  Pods   │
   └─────────┘        └─────────┘        └─────────┘
```

Le principe d'architecture à retenir : **tout passe par l'API Server, et tous les composants communiquent via etcd, jamais directement entre eux**. Le Scheduler ne « parle » pas au kubelet. Il écrit une décision dans etcd (via l'API Server) ; le kubelet, qui observe etcd, la découvre et agit. C'est un bus d'événements central où chacun *observe* et *réagit*, exactement comme dans l'idée-mère. Cette absence de couplage direct est ce qui rend le système extensible et robuste.

### etcd — la mémoire

`etcd` est une base clé-valeur distribuée, cohérente, fondée sur le protocole de consensus **Raft**. C'est la **seule source de vérité** du cluster : tout — vos objets désirés comme l'état réel observé — y vit. Le reste du plan de contrôle est, en un sens, sans état : détruisez et relancez le Scheduler, il reconstruit sa vue depuis etcd.

Conséquence directe et souvent négligée : **votre cluster ne vaut pas plus que vos sauvegardes d'etcd**. Perdre etcd sans backup, c'est perdre le cluster entier. Et parce que Raft exige un quorum (majorité stricte), etcd se déploie en **nombre impair** de membres (3, 5) pour tolérer des pannes.

### API Server — la porte unique

L'**API Server** (`kube-apiserver`, en HTTPS sur le port 6443) est l'unique passerelle vers tout. `kubectl`, les contrôleurs, le kubelet, vos outils : personne n'écrit dans etcd directement. Toute requête traverse un pipeline strict et ordonné :

1. **Authentification** — qui êtes-vous ? (certificats x509, jetons JWT, OIDC…)
2. **Autorisation** — avez-vous le droit de faire cette action sur cette ressource ? (c'est RBAC, § 7)
3. **Admission control** — cette requête est-elle acceptable ? Des webhooks peuvent la **valider** (refuser un Pod sans limites de ressources, par exemple) ou la **muter** (injecter automatiquement un sidecar, une étiquette).
4. **Persistance** — seulement alors, l'objet est écrit dans etcd.

Ce pipeline est le vrai point de contrôle de la sécurité et de la gouvernance d'un cluster. Tout ce que vous voudrez imposer — politiques, quotas, conformité — s'y branche.

### Scheduler — où placer les Pods

Quand vous créez un Pod, il naît sans affectation à une machine (`nodeName` vide). Le **Scheduler** observe ces Pods orphelins et leur choisit un nœud, en **deux phases — exactement comme Borg** :

- **Filtrage (*filtering*)** : élimine tous les nœuds infaisables. Pas assez de CPU/mémoire disponible ? Un *taint* non toléré ? Un `nodeSelector` qui ne matche pas ? Le nœud est écarté. S'il ne reste aucun nœud, le Pod demeure **Pending** — et l'événement associé vous dit *pourquoi*.
- **Scoring (*priorities*)** : parmi les nœuds faisables, chacun reçoit une note. On favorise l'équilibrage de charge (préférer les nœuds les moins chargés), on tient compte des affinités et anti-affinités. Le meilleur score gagne, le Pod y est affecté.

Le Scheduler ne fait que **décider** puis écrire la décision. Il ne lance rien lui-même — cohérent avec le principe « tout passe par etcd ».

### Controller Manager — là où vivent les boucles

Le **Controller Manager** héberge les boucles de réconciliation, une par type d'objet. Deux exemples suffisent à saisir le motif.

Le **contrôleur de ReplicaSet** : désiré = 3 réplicas, réel = 2 Pods vivants ? Il en crée un. Réel = 4 ? Il en supprime un. Rien d'autre, en boucle.

Le **contrôleur de nœuds** : le kubelet envoie un battement de cœur (*heartbeat*) régulièrement. Passé un délai sans nouvelles (de l'ordre de quelques dizaines de secondes), le nœud est marqué `NotReady`, et ses Pods sont évincés pour être recréés ailleurs. C'est l'auto-réparation face à une panne machine, et ce n'est, encore, qu'une boucle qui compare.

### kubelet — l'agent sur chaque nœud

Sur chaque machine de travail tourne le **kubelet**. Il observe l'API Server pour les Pods qui lui sont assignés, demande au **container runtime** (containerd ou CRI-O) de les lancer, surveille leur santé (les *probes*, § 5), et **remonte l'état réel** vers le plan de contrôle. C'est le pont entre l'abstraction déclarative et les conteneurs concrets qui consomment vraiment du CPU.

**Le coût du plan de contrôle.** Cette centralisation a une contrepartie : l'API Server et etcd sont un **point de contention** critique. Sous forte charge (des milliers d'objets, des contrôleurs bavards), c'est etcd qui sature en premier. Faire fonctionner le plan de contrôle en haute disponibilité — plusieurs API Servers, un etcd à quorum — est un travail d'exploitation sérieux ; c'est précisément ce que les clusters managés (EKS, GKE, AKS) vous vendent en vous l'épargnant.

---

## 3. Les objets de charge : du Pod à l'Ingress

On remonte maintenant vers ce que vous écrivez. Les objets s'empilent en couches, chacune résolvant une limite de la précédente : **Pod → Deployment → Service → Ingress**. Comprendre la chaîne, c'est comprendre *pourquoi* chaque couche existe.

### Le Pod — l'unité atomique (l'*alloc* de Borg)

Le **Pod** est la plus petite unité déployable. Contre-intuitivement, ce n'est **pas un conteneur** mais **un ou plusieurs conteneurs qui partagent un contexte** : le même *namespace* réseau (donc la **même IP**, ils se joignent via `localhost`), les mêmes volumes, et un cycle de vie commun. C'est exactement l'**alloc** de Borg : une réservation de ressources sur une machine, dans laquelle cohabitent des processus solidaires.

Pourquoi grouper ? Parce que certains conteneurs sont si couplés qu'ils doivent vivre et mourir ensemble, sur la même machine. Deux motifs classiques :

- Le **sidecar** : un conteneur d'accompagnement — expéditeur de logs, proxy réseau — qui partage un volume ou le réseau du conteneur principal.
- L'**init container** : un conteneur qui s'exécute *avant* les conteneurs principaux et doit terminer avec succès. Idéal pour attendre qu'une dépendance soit prête (« boucle jusqu'à ce que Postgres réponde sur 5432 »).

Voici un Pod illustrant ces pièces, allégé à l'essentiel :

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: n8n-pod
  namespace: automation
  labels:
    app: n8n            # les étiquettes : la clé du couplage faible (voir Services)
spec:
  initContainers:
  - name: wait-for-postgres         # s'exécute d'abord, jusqu'à réussite
    image: busybox:1.35
    command: ["sh", "-c", "until nc -z postgres-service 5432; do sleep 2; done"]
  containers:
  - name: n8n                        # conteneur principal
    image: n8nio/n8n:1.0.0           # tag figé, jamais 'latest' (voir plus bas)
    ports:
    - containerPort: 5678
    env:
    - name: DB_POSTGRESDB_HOST
      value: postgres-service        # un nom DNS, pas une IP ! (voir Services)
    resources:
      requests: { cpu: "500m", memory: "512Mi" }   # le garanti
      limits:   { cpu: "2000m", memory: "2Gi" }    # le plafond dur
    volumeMounts:
    - name: n8n-data
      mountPath: /home/node/.n8n
  - name: log-shipper                # sidecar : partage le volume de logs
    image: fluentd:v1.14
    volumeMounts:
    - name: n8n-data
      mountPath: /logs
      subPath: logs
      readOnly: true
  volumes:
  - name: n8n-data
    persistentVolumeClaim:
      claimName: n8n-pvc
```

Deux détails méritent qu'on s'y arrête, car on y reviendra : les **étiquettes** (`labels`) — de simples paires clé-valeur qui deviendront le ciment reliant les objets entre eux — et le fait qu'on référence les dépendances par un **nom DNS** (`postgres-service`) et jamais par une IP.

**La règle d'or, et son coût.** En pratique, **vous ne créez presque jamais un Pod directement**. Un Pod nu est mortel : s'il meurt, personne ne le recrée — il n'y a pas de boucle qui veille sur *lui*. Le Pod est la brique ; ce sont les couches supérieures qui lui donnent la résilience.

### Le Deployment — des Pods qui survivent et se mettent à jour

Le **Deployment** est la réponse à la mortalité du Pod. C'est l'objet que vous manipulez pour une application sans état (*stateless*). Vous n'y déclarez pas des Pods, vous déclarez une **intention** : « je veux `replicas: 3` copies de ce gabarit de Pod ».

Le mécanisme est en deux étages, et c'est là que l'idée-mère paie. Le Deployment ne gère pas les Pods directement : il crée et pilote un **ReplicaSet**, dont l'unique métier est de maintenir *N* Pods vivants (la boucle vue au § 2). Le Deployment, lui, orchestre les **ReplicaSets dans le temps** — c'est ce qui rend possibles les mises à jour et les retours en arrière.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n
  namespace: automation
spec:
  replicas: 3
  selector:                   # comment le Deployment reconnaît SES Pods :
    matchLabels:
      app: n8n                 # « tout Pod portant app=n8n est à moi »
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1        # au plus 1 Pod manquant pendant la bascule
      maxSurge: 1              # au plus 1 Pod en surplus pendant la bascule
  template:                    # le gabarit de Pod (les Pods produits en série)
    metadata:
      labels:
        app: n8n               # DOIT correspondre au selector ci-dessus
    spec:
      containers:
      - name: n8n
        image: n8nio/n8n:1.0.0
        ports:
        - containerPort: 5678
```

Le **selector** révèle un principe profond de Kubernetes : les objets ne se tiennent pas par des pointeurs, mais par des **étiquettes**. Le Deployment ne « contient » pas ses Pods ; il déclare « je gère les Pods qui portent `app=n8n` ». Ce couplage par étiquettes, souple et indirect, est le même mécanisme qui reliera les Services aux Pods.

La **mise à jour progressive** (*rolling update*) découle mécaniquement de la double couche. Quand vous changez l'image :

```bash
kubectl set image deployment/n8n n8n=n8nio/n8n:1.1.0
```

le Deployment crée un **nouveau ReplicaSet** (nouvelle image), puis, pas à pas, monte le nouveau d'un Pod et descend l'ancien d'un Pod, en attendant à chaque étape que le nouveau Pod soit *Ready* (§ 5). `maxUnavailable` et `maxSurge` bornent l'ampleur de la bascule pour ne jamais couper le service. L'ancien ReplicaSet n'est pas détruit mais **conservé, à zéro réplica** — d'où le retour arrière quasi instantané : `kubectl rollout undo deployment/n8n` rallume simplement l'ancien.

**Le gotcha.** L'image `:latest` est un piège précisément à cause du modèle déclaratif. Si votre gabarit dit `:latest`, deux `apply` identiques décrivent le même état désiré — Kubernetes ne voit *aucun changement* et ne redéploie rien, même si l'image derrière `latest` a bougé. Pire, deux Pods du même Deployment peuvent tourner sur des versions différentes selon le moment où ils ont tiré l'image. **Épinglez toujours une version** (`:1.1.0`, ou mieux, un digest). Le désiré doit être sans ambiguïté.

### Le Service — une adresse stable pour une cible mouvante

Nouveau problème, né du précédent. Les Pods sont **éphémères et mobiles** : la mise à jour progressive en détruit et en recrée sans cesse, chacun avec une **IP nouvelle**. Comment un client trouve-t-il l'application si l'adresse change à chaque redéploiement ? On ne peut pas coder une IP en dur.

Le **Service** est l'indirection qui résout cela. Il fournit une **IP virtuelle stable et un nom DNS permanent** devant un ensemble de Pods — sélectionnés, encore une fois, **par étiquettes**. Les Pods vont et viennent derrière ; le Service, lui, ne bouge pas. C'est le pendant du DNS interne de Borg.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: n8n-service
  namespace: automation
spec:
  type: ClusterIP           # défaut : accessible seulement DANS le cluster
  selector:
    app: n8n                 # cible tout Pod portant app=n8n
  ports:
  - port: 80                 # le port du Service
    targetPort: 5678         # le port du conteneur
```

Le nom DNS obéit à une hiérarchie lisible, servie par **CoreDNS** :

- `n8n-service` — dans le même namespace ;
- `n8n-service.automation` — depuis un autre namespace ;
- `n8n-service.automation.svc.cluster.local` — le nom pleinement qualifié.

C'est pourquoi, dans le Pod plus haut, on écrivait `DB_POSTGRESDB_HOST: postgres-service` : un nom, jamais une IP.

Comment ça marche réellement ? Le Service reçoit une **ClusterIP** (par exemple `10.96.0.100`). Sur **chaque nœud**, l'agent **kube-proxy** programme des règles (iptables, ou IPVS à plus grande échelle) qui interceptent le trafic vers cette IP et le **répartissent** vers les IP réelles des Pods sains. La répartition de charge est donc distribuée, sans passer par un point central. Et un Pod n'est ajouté à la liste des destinations que lorsqu'il est *Ready* — c'est le lien avec la readiness probe (§ 5).

Il existe trois **types** de Service, en couches d'exposition croissante :

- **ClusterIP** (défaut) : interne au cluster. La communication service-à-service.
- **NodePort** : ouvre un port fixe (30000–32767) sur *chaque* nœud. `<ip-de-n-importe-quel-nœud>:30080` atteint le service. Brut, mais fonctionnel hors cloud.
- **LoadBalancer** : sur un cloud, demande au provider de provisionner un vrai load-balancer externe (AWS ELB, GCP LB…) avec une IP publique. Le chemin devient : Internet → LB cloud → NodePort → Pod.

**Le coût.** Le Service opère au **niveau 4** (TCP/UDP) : il ignore tout du HTTP. Il ne sait pas router selon un chemin d'URL ni un nom d'hôte, ne termine pas le TLS, ne fait pas de virtual-hosting. Et un `LoadBalancer` par application, sur le cloud, signifie **un load-balancer facturé par application** — vite ruineux si vous exposez dix services. D'où la couche suivante.

### L'Ingress — le routage HTTP, mutualisé

Exposer chaque service par son propre `LoadBalancer` ne passe pas à l'échelle, ni en coût ni en gestion (dix IP, dix certificats TLS à part). L'**Ingress** mutualise : **un seul point d'entrée HTTP(S)** qui, au **niveau 7**, aiguille le trafic vers le bon Service selon le **nom d'hôte** et le **chemin d'URL**.

Point crucial souvent mal compris : l'objet Ingress n'est qu'une **table de routage déclarative, inerte en soi**. Rien ne se passe tant qu'un **Ingress Controller** (nginx, Traefik, HAProxy…) ne tourne pas dans le cluster. C'est *lui*, le vrai reverse-proxy : il observe les objets Ingress et se reconfigure pour appliquer leurs règles. L'Ingress est la déclaration ; le Controller est la boucle qui la réalise — encore l'idée-mère.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: n8n-ingress
  namespace: automation
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod   # TLS automatique
spec:
  ingressClassName: nginx
  tls:
  - hosts: ["n8n.example.com"]
    secretName: n8n-tls                    # cert-manager remplira ce Secret
  rules:
  - host: n8n.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: n8n-service              # renvoie vers le Service (§ 3)
            port:
              number: 80
```

Le chemin complet du paquet se lit maintenant de bout en bout : **Internet → Ingress Controller (exposé par un LoadBalancer/NodePort) → Service ClusterIP → Pods**. Un seul point d'entrée sert tout le cluster :

```
n8n.example.com/       → n8n-service
api.example.com/v1/    → api-service
grafana.example.com/   → grafana-service
```

L'Ingress termine aussi le **TLS** : associé à **cert-manager**, il obtient et renouvelle automatiquement les certificats Let's Encrypt, écrits dans le Secret référencé. Un seul endroit gère le chiffrement pour tout le cluster.

**Le coût.** L'Ingress Controller devient un **point de passage critique** : tout le trafic HTTP entrant transite par lui, il faut donc le rendre lui-même hautement disponible. Par ailleurs, l'API Ingress standard est volontairement pauvre, et une part importante de la configuration réelle (réécritures, timeouts, tailles de corps) se fait par des **annotations propriétaires** au controller choisi — ce qui vous y couple. C'est ce vide que la **Gateway API**, plus riche et portable, vise à combler (§ Pour aller plus loin).

---

## 4. L'ordonnancement et les ressources : le partage équitable des machines

On a vu *quoi* déployer. Reste *où*, et avec *quelles garanties*. C'est le domaine du Scheduler (§ 2), et il repose entièrement sur ce que vous déclarez comme besoins.

### requests et limits — deux nombres, deux rôles distincts

La confusion la plus fréquente, et la plus coûteuse, est de croire que `requests` et `limits` disent la même chose. Ce sont deux mécanismes indépendants.

- Les **requests** sont ce que le **Scheduler** utilise pour *placer* le Pod. « Ce Pod demande 500m de CPU et 512Mi de RAM » signifie « réserve-lui cette part sur un nœud qui l'a encore ». La somme des requests d'un nœud ne peut dépasser sa capacité allouable. C'est une **réservation garantie**.
- Les **limits** sont ce que le **kubelet et les cgroups** *font respecter à l'exécution*, comme un plafond dur. Elles ne jouent aucun rôle dans le placement.

La distinction CPU/mémoire est essentielle car les deux ressources se comportent de façons opposées face au dépassement :

- Le **CPU est compressible**. Dépasser sa limite CPU ne tue pas le conteneur ; il est simplement **ralenti** (*throttled*) — on lui accorde moins de tranches de temps. Douloureux pour la latence, jamais fatal.
- La **mémoire est incompressible**. On ne peut pas « ralentir » de la RAM. Dépasser la limite mémoire déclenche un **OOMKill** : le conteneur est tué net, puis redémarré. Un OOMKill n'est pas un bug fantôme ; c'est votre limite qui s'applique.

### Les classes de QoS — qui meurt en premier quand le nœud manque de RAM

Le rapport entre requests et limits détermine automatiquement la **classe de qualité de service** (*QoS class*) du Pod, et donc sa **priorité d'éviction** quand un nœud est sous pression mémoire :

- **Guaranteed** : requests == limits pour *toutes* les ressources de *tous* les conteneurs. La classe la plus protégée — évincée en dernier.
- **Burstable** : au moins une request est fixée, mais on n'atteint pas l'égalité stricte. Le cas le plus courant : un socle garanti, une capacité à « déborder » jusqu'à la limite.
- **BestEffort** : aucune request ni limit. Aucune garantie — **la première victime** quand le nœud manque de mémoire.

D'où une règle pratique : les charges critiques (bases, composants de contrôle) visent **Guaranteed** ; le reste, **Burstable** avec des requests honnêtes.

**Le gotcha classique.** Fixer des requests « au doigt mouillé » — trop haut « par sécurité » — gaspille : le Scheduler réserve de la capacité fantôme, le cluster paraît plein alors qu'il est vide, vous payez des nœuds pour rien. Trop bas, et vos Pods se battent pour des ressources, subissent throttling et OOMKills. **Réglez les requests sur la consommation réelle mesurée**, pas sur des espoirs — c'est la discipline la plus rentable de l'exploitation Kubernetes.

### Diriger le placement : nodeSelector, affinités, taints et tolérations

Par défaut, le Scheduler place où il veut parmi les nœuds faisables. Trois mécanismes permettent de le contraindre, du plus brutal au plus fin.

Le **nodeSelector** est l'attraction la plus simple : « ce Pod ne va que sur un nœud portant l'étiquette `disktype=ssd` ». Binaire.

L'**affinité** (`nodeAffinity`, `podAffinity`, `podAntiAffinity`) est la version expressive. Elle distingue le **strict** (`required…` : condition obligatoire, sinon Pending) du **souple** (`preferred…` : préférence pondérée, sinon on se rabat). L'**anti-affinité entre Pods** est l'outil clé de la haute disponibilité : « n'place jamais deux réplicas de cette application sur le même nœud », pour qu'une panne machine n'en emporte pas plusieurs d'un coup.

Les **taints et tolérations** fonctionnent en logique **inverse**, et c'est ce qui prête à confusion. Un **taint** posé sur un nœud le rend **répulsif** : par défaut, aucun Pod ne peut s'y poser. Seul un Pod portant la **tolération** correspondante y est admis. C'est un mécanisme d'exclusion, pas de sélection : on **réserve** des nœuds à certaines charges. Les GPU coûteux reçoivent un taint pour rester libres, et seules les charges qui les tolèrent y accèdent. Les nœuds du plan de contrôle sont taintés par défaut, pour que vos applications n'y atterrissent pas.

La bonne intuition : l'affinité est une **attirance** décidée côté Pod ; le taint est une **répulsion** décidée côté nœud, levée par une tolération côté Pod. On les combine souvent (un taint réserve le nœud ; une affinité y attire les bons Pods).

---

## 5. La santé et l'autoscaling : rester vivant, s'adapter à la charge

### Les probes — comment Kubernetes sait qu'un Pod va bien

L'auto-réparation du § 1 suppose une définition de « en bonne santé ». « Le processus tourne » ne suffit pas : une application peut tourner tout en étant bloquée (deadlock), ou tourner sans être *encore* prête à servir. Kubernetes délègue ce jugement à trois **sondes** (*probes*) — HTTP, TCP ou commande — aux rôles distincts et complémentaires.

- La **liveness probe** répond à : « ce conteneur est-il vivant ou faut-il le **redémarrer** ? » En cas d'échecs répétés, le kubelet **tue et relance** le conteneur. C'est l'antidote au processus figé.
- La **readiness probe** répond à : « ce conteneur est-il prêt à **recevoir du trafic** ? » En cas d'échec, le Pod est **retiré des endpoints du Service** (§ 3) — il ne meurt pas, on cesse simplement de lui envoyer des requêtes. Indispensable pendant un démarrage lent, ou une surcharge temporaire.
- La **startup probe** protège les applications **lentes à démarrer**. Tant qu'elle n'a pas réussi, les deux autres sondes sont suspendues. Elle évite le piège mortel où une liveness probe impatiente tue une application qui bootait simplement lentement, en boucle sans fin.

```yaml
livenessProbe:                 # échec → redémarrage du conteneur
  httpGet: { path: /healthz, port: 5678 }
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3          # tué après 3 échecs consécutifs
readinessProbe:                # échec → retiré des endpoints du Service
  httpGet: { path: /healthz, port: 5678 }
  initialDelaySeconds: 10
  periodSeconds: 5
startupProbe:                  # tant qu'elle échoue, liveness/readiness gelées
  httpGet: { path: /healthz, port: 5678 }
  failureThreshold: 30
  periodSeconds: 10            # 30 × 10s = jusqu'à 5 min de démarrage toléré
```

**Le gotcha.** La distinction liveness/readiness est celle qu'on rate le plus, avec des conséquences sévères. Faire pointer la liveness probe vers un endpoint qui vérifie une **dépendance externe** (la base de données) est un piège : si la base a un hoquet, la liveness échoue, Kubernetes redémarre *tous* vos Pods — qui ne peuvent de toute façon rien faire sans la base — transformant un incident mineur en **tempête de redémarrages**. Règle : la liveness ne teste que la **santé interne** du processus ; la readiness peut, elle, tenir compte des dépendances.

### L'HPA — ajouter et retirer des Pods selon la charge

Les probes gardent les Pods sains ; l'**HPA** (*Horizontal Pod Autoscaler*) ajuste leur **nombre**. C'est une boucle de réconciliation de plus : il observe une métrique (CPU moyen, mémoire, ou une métrique métier), la compare à une cible, et modifie le champ `replicas` du Deployment pour combler l'écart.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: n8n-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: n8n
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70        # vise 70% de CPU moyen par Pod
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # attendre 5 min avant de réduire
    scaleUp:
      stabilizationWindowSeconds: 0    # monter immédiatement
```

Deux points de fond. D'abord, l'HPA a besoin de mesurer : il faut déployer **metrics-server** (pour CPU/mémoire), et un adaptateur (type Prometheus) pour des métriques métier comme la profondeur d'une file d'attente. Ensuite, le champ **behavior** encode une asymétrie voulue : on **monte vite** (mieux vaut sur-provisionner une minute que refuser du trafic) mais on **descend lentement**, via une fenêtre de stabilisation, pour ne pas osciller (le *flapping*) au moindre creux passager.

L'HPA suppose que `replicas` lui appartient — d'où **l'incompatibilité classique** : si votre GitOps réapplique en boucle un manifeste avec `replicas: 3` figé, il se bat contre l'HPA qui, lui, veut monter à 8. Retirez `replicas` du manifeste géré par l'HPA.

### Le PDB — protéger la disponibilité pendant la maintenance

Il existe deux façons de perdre des Pods : les pannes *involontaires* (un nœud crashe — géré par l'auto-réparation) et les perturbations *volontaires* (vous videz un nœud pour le mettre à jour). Rien n'empêche, lors d'une maintenance, de vider plusieurs nœuds coup sur coup et de tuer *tous* les réplicas d'une application en même temps.

Le **PodDisruptionBudget** pose une garantie de disponibilité que les opérations volontaires doivent respecter :

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: n8n-pdb
spec:
  minAvailable: 2          # toujours au moins 2 Pods disponibles
  selector:
    matchLabels:
      app: n8n
```

Concrètement, `kubectl drain` (qui vide un nœud) **respecte** le PDB : si évincer un Pod violait le minimum, le drain **attend** — le temps que le remplaçant soit prêt ailleurs — plutôt que de casser la disponibilité. HPA et PDB sont complémentaires et vont de pair : l'un adapte la capacité à la charge, l'autre protège un plancher de disponibilité pendant les opérations.

---

## 6. L'état et le stockage : quand les Pods doivent se souvenir

Tout ce qui précède supposait des applications **sans état** (*stateless*), interchangeables et jetables. Une base de données est l'inverse même : son identité et ses données *sont* le service. Kubernetes offre deux abstractions distinctes — le stockage persistant, et un contrôleur de charge adapté à l'état.

### PV, PVC, StorageClass — découpler le besoin de la fourniture

Le stockage repose sur une séparation en trois pièces, calquée sur le modèle offre/demande :

- Le **PersistentVolume (PV)** est un morceau de stockage réel (un disque EBS, un volume NFS…). C'est **l'offre**.
- Le **PersistentVolumeClaim (PVC)** est une **demande** exprimée par l'application : « il me faut 20 Gi en lecture-écriture ». C'est ce que vous écrivez ; l'application ne sait rien du disque physique derrière.
- La **StorageClass** décrit **comment fabriquer** un PV à la demande, via un pilote **CSI** (*Container Storage Interface*, l'interface standard qui branche n'importe quel système de stockage).

Le grand intérêt est le **provisionnement dynamique** : plus besoin qu'un admin pré-crée des disques. Vous créez un PVC référençant une StorageClass ; Kubernetes appelle l'API du fournisseur (par ex. `CreateVolume` chez AWS), le PV est créé automatiquement et lié au PVC, et le Pod le monte.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com     # le pilote CSI EBS (l'ancien in-tree
                                 # kubernetes.io/aws-ebs a été supprimé)
parameters:
  type: gp3
  iops: "3000"                   # gp3 : IOPS provisionnés directement…
  throughput: "125"              # …et débit en MiB/s — PAS de 'iopsPerGB'
  encrypted: "true"
allowVolumeExpansion: true       # autorise l'agrandissement ultérieur des PVC
volumeBindingMode: WaitForFirstConsumer  # attendre le placement du Pod
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: n8n-pvc
  namespace: automation
spec:
  accessModes: ["ReadWriteOnce"]  # RWO : un seul nœud à la fois
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 20Gi
```

Trois détails techniques à ne pas survoler. Le **mode d'accès** : `ReadWriteOnce` (RWO) attache le volume à **un seul nœud** — c'est le cas des disques bloc comme EBS ; `ReadWriteMany` (RWX), le multi-nœud, exige un stockage de type fichier (NFS…). Le paramètre `volumeBindingMode: WaitForFirstConsumer` retarde la création du disque **jusqu'à ce que le Pod soit placé**, pour créer le volume dans la **bonne zone de disponibilité** — sinon on risque un disque en zone A et un Pod contraint en zone B, qui ne pourront jamais se joindre. Enfin, `allowVolumeExpansion` autorise l'agrandissement futur du PVC — décision à prendre d'emblée.

### Le StatefulSet — identité stable et stockage attaché

Un Deployment traite ses Pods comme un troupeau anonyme : noms aléatoires, ordre indifférent, interchangeables. Une base de données a besoin du contraire — une **identité stable et un disque personnel**. C'est le rôle du **StatefulSet**, qui apporte trois garanties que le Deployment n'offre pas :

- des **noms stables et ordonnés** : `postgres-0`, `postgres-1`, `postgres-2` (et non des suffixes aléatoires) ;
- un **PVC propre à chaque Pod**, via `volumeClaimTemplates` : `postgres-0` garde *son* disque à travers les redémarrages, même s'il migre de nœud ;
- une **création et une suppression ordonnées** (0, puis 1, puis 2…), souvent nécessaire pour amorcer un cluster proprement.

Il s'appuie sur un **Service headless** (`clusterIP: None`) qui donne à chaque Pod son entrée DNS stable — `postgres-0.postgres…` — indispensable quand les membres doivent s'adresser individuellement.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres        # le Service headless pour les IDs réseau stables
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15
        volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:        # chaque Pod obtient SON propre PVC
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

**Le gotcha le plus dangereux de tout ce chapitre.** Il est tentant de lire `replicas: 3` sur ce StatefulSet Postgres et de conclure « j'ai une base hautement disponible ». **C'est faux, et ce contresens détruit des données en production.** Un StatefulSet ne fait que garantir identité et stockage ; il **n'a aucune notion de réplication applicative**. Ce manifeste produit **trois bases Postgres totalement indépendantes**, chacune avec son propre PVC de 100 Gi, chacune vide et ignorant les deux autres. **Aucune réplication, aucun failover, aucune cohérence** entre elles. Le StatefulSet gère le *contenant* (Pod + disque + nom), pas le *contenu* (la logique de réplication de Postgres).

La vraie haute disponibilité Postgres exige un **operator** — Patroni, CloudNativePG… — c'est-à-dire un contrôleur spécialisé qui, *lui*, sait configurer la réplication primaire → réplica, promouvoir un réplica en cas de panne du primaire, et gérer la bascule. L'operator est une **boucle de réconciliation métier** ajoutée au cluster (via une CRD, § Pour aller plus loin) : il connaît Postgres comme le contrôleur de ReplicaSet connaît les Pods. Sans operator, la règle sûre est **un seul réplica** pour une base — la haute disponibilité vient de l'operator, jamais du simple compteur de réplicas.

**Le coût.** Le stateful est intrinsèquement plus difficile. Les données sont attachées à des zones et à des disques, les migrations sont lentes, les sauvegardes et restaurations vous incombent, et bien souvent l'option la plus sage reste d'utiliser une **base managée** (RDS, Cloud SQL) et de laisser Kubernetes ne gérer que le sans-état.

---

## 7. Les bases de la sécurité : cloisonner, restreindre, protéger

### Les namespaces — le premier niveau de cloisonnement

Un **namespace** est une partition logique du cluster : il regroupe des objets, offre une portée de nommage (deux Services `postgres` peuvent coexister dans deux namespaces), et sert de **frontière** à laquelle s'accrochent les quotas, RBAC et politiques réseau. C'est l'unité de base de la multi-location (*multi-tenancy*) légère.

On y attache des **ResourceQuota** pour empêcher qu'une équipe monopolise le cluster : plafond de CPU/mémoire demandés et limités, nombre maximal de Pods, de Services, de PVC, volume de stockage total. La somme des Pods d'un namespace ne peut alors dépasser son enveloppe — un garde-fou indispensable dès qu'un cluster est partagé.

### RBAC — qui peut faire quoi, où

Le pipeline de l'API Server (§ 2) comportait une étape d'autorisation : c'est **RBAC** (*Role-Based Access Control*). Son modèle tient en une phrase : **QUI** peut faire **QUELLES ACTIONS** sur **QUELLES RESSOURCES**, et **OÙ**. Il se compose de deux moitiés, délibérément séparées :

- Un **Role** (ou **ClusterRole** pour une portée cluster) définit un **ensemble de permissions** — « lire les Pods et les ConfigMaps », « modifier les Deployments ». Il ne dit *pas* à qui.
- Un **RoleBinding** (ou **ClusterRoleBinding**) **rattache** un Role à un sujet — un utilisateur, un groupe, ou un **ServiceAccount** (l'identité d'un Pod). Il ne dit *pas* quelles permissions.

Cette séparation permet de réutiliser un même Role pour plusieurs sujets, sans le redéfinir.

```yaml
apiVersion: v1
kind: ServiceAccount              # l'identité qu'un Pod endossera
metadata:
  name: n8n-sa
  namespace: automation
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role                        # un ENSEMBLE DE PERMISSIONS, dans ce namespace
metadata:
  name: n8n-role
  namespace: automation
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps"]
  verbs: ["get", "list", "watch"]         # lecture seule
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding                 # RELIE le Role au ServiceAccount
metadata:
  name: n8n-binding
  namespace: automation
subjects:
- kind: ServiceAccount
  name: n8n-sa
  namespace: automation
roleRef:
  kind: Role
  name: n8n-role
  apiGroup: rbac.authorization.k8s.io
```

Un Pod déclarant `serviceAccountName: n8n-sa` peut alors appeler l'API Kubernetes avec exactement ces droits, ni plus ni moins. Le principe directeur est le **moindre privilège** : chaque composant reçoit le strict nécessaire. La distinction Role/ClusterRole recoupe celle de portée — un outil de monitoring qui doit lire les Pods de *tout* le cluster a besoin d'un ClusterRole ; une application confinée à son namespace, d'un simple Role.

### Secrets et ConfigMaps — externaliser la configuration

Deux objets séparent la **configuration** du **code**, pour que la même image tourne en dev, staging et prod sans recompilation.

Le **ConfigMap** porte la configuration **non sensible** : variables d'environnement, fichiers de config. On l'injecte soit comme variables (`envFrom`), soit monté comme fichiers dans un volume.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: n8n-config
  namespace: automation
data:
  EXECUTIONS_MODE: "queue"
  N8N_LOG_LEVEL: "info"
  WEBHOOK_URL: "https://n8n.example.com"
```

Le **Secret** est jumeau, destiné aux données **sensibles** (mots de passe, clés, certificats), injecté de la même manière — variable ou fichier monté.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: n8n-secrets
  namespace: automation
type: Opaque
data:                            # valeurs encodées en base64
  db-password: bXlwYXNzd29yZA==  # echo -n 'mypassword' | base64
```

**Le piège de sécurité à ne jamais oublier.** Un Secret Kubernetes est encodé en **base64, ce qui n'est PAS du chiffrement** — c'est un simple ré-encodage réversible en une commande. Par défaut, un Secret dans etcd est en clair pour qui accède à etcd, et le committer dans Git l'expose à tout le dépôt. Deux protections s'imposent en production : activer le **chiffrement au repos d'etcd** côté cluster ; et ne jamais mettre de secret en clair dans Git — utiliser **Sealed Secrets** (chiffre le secret *avant* Git, seul le cluster peut le déchiffrer) ou l'**External Secrets Operator** (synchronise depuis un coffre externe : AWS Secrets Manager, Vault). Le Secret Kubernetes reste alors une simple projection d'une vérité stockée ailleurs, en sûreté.

### NetworkPolicies — le pare-feu entre Pods

Défaut surprenant et dangereux : **tout Pod peut parler à tout Pod**, à travers tous les namespaces. Un service compromis peut donc atteindre la base, Redis, n'importe quoi. Une **NetworkPolicy** referme cela, à condition que votre plugin réseau (CNI) la supporte (Calico, Cilium…).

Le mécanisme suit le **modèle du pare-feu** : sélectionner des Pods, puis n'autoriser que le trafic explicitement listé — dès qu'une policy s'applique à un Pod, tout ce qui n'est pas permis est **refusé**. On applique ainsi le principe de **moindre exposition** : n8n ne doit joindre *que* Postgres, Redis et le DNS ; le reste est coupé.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: n8n-netpol
  namespace: automation
spec:
  podSelector:
    matchLabels:
      app: n8n              # cette policy régit les Pods n8n
  policyTypes: ["Ingress", "Egress"]
  ingress:                 # entrant autorisé : seulement l'ingress-controller
  - from:
    - namespaceSelector: { matchLabels: { name: ingress-nginx } }
      podSelector: { matchLabels: { app: nginx-ingress } }
    ports: [{ protocol: TCP, port: 5678 }]
  egress:                  # sortant autorisé : Postgres, Redis, DNS
  - to: [{ podSelector: { matchLabels: { app: postgres } } }]
    ports: [{ protocol: TCP, port: 5432 }]
  - to: [{ podSelector: { matchLabels: { app: redis } } }]
    ports: [{ protocol: TCP, port: 6379 }]
  - to:                    # LE DNS : oubli n°1, casse tout silencieusement
    - namespaceSelector: { matchLabels: { name: kube-system } }
      podSelector: { matchLabels: { k8s-app: kube-dns } }
    ports: [{ protocol: UDP, port: 53 }]
```

**Le gotcha universel.** L'erreur commise par tout le monde, une fois : écrire une policy egress restrictive et **oublier d'autoriser le DNS** (UDP 53 vers kube-dns). L'application ne peut alors plus résoudre `postgres-service` en IP, et tout tombe en panne d'une manière déroutante — la connexion n'échoue pas, la *résolution de nom* échoue en amont. Dès que vous restreignez le trafic sortant, **autorisez le DNS en premier**.

---

## À retenir

1. **Tout Kubernetes est une seule idée** : vous déclarez un état désiré, des boucles de réconciliation le comparent sans cesse au réel et comblent l'écart. L'auto-réparation, l'idempotence, le GitOps en découlent mécaniquement. Débogez en cherchant *pourquoi le réel ne rejoint pas le désiré*.

2. **Les objets s'empilent en couches, chacune réparant la limite de la précédente.** Le Pod est mortel → le Deployment le maintient et le met à jour ; l'IP du Pod change → le Service offre une adresse stable ; le Service ignore HTTP → l'Ingress route au niveau 7. Et tout se relie par **étiquettes**, jamais par pointeurs.

3. **`requests` place, `limits` plafonne** — deux mécanismes distincts. Le CPU au-delà de la limite est ralenti (survivable) ; la mémoire au-delà déclenche un **OOMKill**. Réglez les requests sur la consommation *mesurée* ; le rapport requests/limits fixe la classe de QoS, donc qui meurt en premier.

4. **Trois sondes, trois rôles** : liveness redémarre, readiness retire du trafic, startup couvre le démarrage lent. Ne faites jamais dépendre la **liveness** d'une ressource externe, sous peine de tempête de redémarrages quand cette dépendance hoquette.

5. **`replicas: 3` sur un StatefulSet Postgres nu = 3 bases INDÉPENDANTES, pas de la HA.** Aucune réplication ni bascule automatique. La vraie HA exige un **operator** (Patroni, CloudNativePG). Sans operator : un seul réplica.

6. **Un Secret est du base64, pas du chiffrement.** Activez le chiffrement au repos d'etcd et externalisez (Sealed Secrets, External Secrets Operator) plutôt que du clair dans Git. Cloisonnez avec namespaces + RBAC (moindre privilège) + NetworkPolicies — et en egress restreint, **autorisez le DNS avant tout**.

7. **Le déclaratif a un coût.** Un plan de contrôle centralisé (API Server + etcd) à rendre HA et à sauvegarder, une latence de réconciliation, un découplage action/effet déroutant. Épinglez toujours les versions d'image ; `:latest` sabote le modèle déclaratif. Pour l'état lourd, une base managée est souvent le choix le plus sage.

## Pour aller plus loin

- **CRD et Operators** — Kubernetes est extensible : une **Custom Resource Definition** ajoute vos propres objets à l'API, et un **Operator** leur associe une boucle de réconciliation métier. C'est ainsi que Patroni/CloudNativePG apportent la vraie HA Postgres — la même mécanique que les contrôleurs natifs, appliquée à *votre* domaine. Le meilleur point d'entrée pour comprendre en profondeur *comment* Kubernetes est construit.

- **Gateway API** — le successeur de l'Ingress : plus expressif, portable entre implémentations, avec une séparation propre des rôles (infra vs application). À privilégier pour tout nouveau routage L7, plutôt que de s'enfermer dans les annotations propriétaires d'un Ingress Controller.

- **Helm et Kustomize** — deux façons de gérer la répétition. **Helm** empaquette une application en *chart* templatisé (un chart, plusieurs environnements via `values.yaml`, avec `install`/`upgrade`/`rollback`). **Kustomize** superpose des patchs sans templates. Indispensables dès qu'on gère dev/staging/prod.

- **Service Mesh (Istio, Linkerd)** — quand le maillage de services devient complexe : mTLS automatique entre Pods, routage fin, observabilité, *retries* et *circuit breaking* au niveau réseau, sans toucher au code. Puissant, mais lourd — à n'introduire que sous une réelle pression de complexité.

- **La sécurité au-delà des bases** — Pod Security Standards (remplaçant des PodSecurityPolicies), politiques d'admission avec **OPA/Gatekeeper** ou **Kyverno**, scan d'images, `runtimeClass`. La sécurité d'un cluster est une discipline à part entière, greffée sur le pipeline d'admission de l'API Server vu au § 2.
