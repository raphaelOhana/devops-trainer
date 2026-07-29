===LESSON===
KEY: linux
TOPIC: linux
TITLE: Linux & systèmes
ICON: 🐧
INTRO: Linux est le socle des serveurs, conteneurs et de l'edge. Comprendre comment le noyau gère processus, mémoire, fichiers ouverts et isolation permet de diagnostiquer les pannes réelles en production (arrêts brutaux, "too many open files", OOM) plutôt que de deviner.
---SECTION---
HEADING: Processus & signaux
BODY:
Un signal est une notification asynchrone envoyée à un processus. Les deux à connaître :

- **SIGTERM (15)** : demande polie d'arrêt. Le processus peut l'intercepter pour fermer proprement (flush des buffers, fin des requêtes en cours). C'est le signal par défaut de `kill`.
- **SIGKILL (9)** : arrêt immédiat, **non interceptable**, non ignorable. Le processus n'a aucune chance de nettoyer.

```bash
kill 4242          # envoie SIGTERM par défaut
kill -9 4242       # SIGKILL, dernier recours
pkill -f "python app.py"
```

**Graceful shutdown** : on envoie SIGTERM, on laisse un délai de grâce, puis SIGKILL si le processus n'a pas terminé. C'est exactement ce que fait `docker stop` (SIGTERM puis SIGKILL après 10 s) et systemd (`TimeoutStopSec`).
---SECTION---
HEADING: Gérer les signaux dans son code
BODY:
Un serveur robuste installe un handler pour arrêter proprement.

```python
import signal, sys

def shutdown(signum, frame):
    print("SIGTERM reçu : on ferme les connexions...")
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown)
```

Points d'attention :

- SIGKILL et SIGSTOP ne peuvent **jamais** être capturés : n'écrivez pas de logique de cleanup en comptant dessus.
- Dans un conteneur, votre appli tourne souvent en **PID 1**, qui a un traitement spécial : les signaux sans handler explicite sont ignorés. Utilisez un init léger (`--init` de Docker, `tini`) ou installez vous-même les handlers.
---SECTION---
HEADING: Permissions & bits spéciaux
BODY:
Chaque fichier a un propriétaire, un groupe et des droits rwx pour user/group/other.

```bash
ls -l fichier          # -rwxr-xr-- 
chmod 640 fichier      # rw- r-- ---
chown app:app fichier
```

Le triplet numérique : r=4, w=2, x=1. Donc `640` = `rw-r-----`.

**Bit setuid** : quand il est posé sur un exécutable, le programme s'exécute avec les droits du **propriétaire du fichier**, pas de l'appelant. Exemple canonique : `passwd` appartient à root pour pouvoir modifier `/etc/shadow`.

```bash
ls -l /usr/bin/passwd   # -rwsr-xr-x  (le 's' = setuid)
find / -perm -4000 -type f 2>/dev/null  # auditer les setuid root
```

Le setuid root est une surface d'attaque majeure : tout bug de ce binaire peut donner root. Sur les répertoires, le **sticky bit** (`/tmp`) empêche un user de supprimer les fichiers d'un autre.
---SECTION---
HEADING: OOM killer & oom_score_adj
BODY:
Linux **surengage** la mémoire (overcommit) : il autorise plus d'allocations que la RAM physique. Quand la mémoire manque vraiment, le noyau déclenche l'**OOM killer**, qui tue un processus pour libérer de la RAM.

La victime est choisie via un score : le noyau maintient un `oom_score` par processus (plus il est haut, plus le processus est candidat). On l'influence avec `oom_score_adj` (de -1000 à +1000).

```bash
cat /proc/4242/oom_score_adj      # ajustement (-1000..1000)
echo -1000 > /proc/4242/oom_score_adj   # exclure de l'OOM (root)
dmesg | grep -i "killed process"        # voir les kills passés
```

- `oom_score_adj = -1000` : jamais tué (à réserver aux processus critiques comme sshd).
- Sous systemd/cgroups v2, préférez `MemoryMax=` sur l'unité pour cadrer un service au lieu de laisser l'OOM global décider.
---SECTION---
HEADING: File descriptors, ulimit & LimitNOFILE
BODY:
Chaque fichier, socket ou pipe ouvert est un **file descriptor** (FD). Chaque processus a une limite. L'erreur `Too many open files` (EMFILE) vient de là — fréquente sur les serveurs à forte concurrence.

```bash
ulimit -n              # limite soft de FD du shell courant
ulimit -n 65536        # augmenter (jusqu'à la hard)
ls -1 /proc/4242/fd | wc -l   # FD ouverts par un processus
lsof -p 4242           # détail des FD
```

**Piège classique** : `ulimit` ne s'applique **pas** aux services lancés par systemd. Il faut le régler dans l'unité :

```ini
[Service]
LimitNOFILE=65536
```

Les valeurs par défaut système sont dans `/etc/security/limits.conf` (pour les sessions PAM) — mais systemd les ignore, d'où la confusion fréquente.
---SECTION---
HEADING: systemd : units & services
BODY:
systemd est l'init (PID 1) de la plupart des distributions. Il gère les services via des **units** déclaratives.

```ini
# /etc/systemd/system/monapp.service
[Unit]
Description=Mon application
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/app/app.py
Restart=on-failure
User=app
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now monapp
journalctl -u monapp -f      # logs en temps réel
```

`Restart=on-failure` redémarre automatiquement en cas de crash (mais pas sur `systemctl stop`). `Type=notify` permet à l'appli de signaler qu'elle est réellement prête.
---SECTION---
HEADING: Le pseudo-système de fichiers /proc
BODY:
`/proc` n'est pas sur disque : c'est une interface du noyau exposée comme des fichiers. C'est la source de vérité pour l'introspection.

```bash
cat /proc/loadavg            # charge (1/5/15 min)
cat /proc/4242/status        # état d'un processus
cat /proc/4242/limits        # limites effectives réelles !
cat /proc/4242/environ | tr '\0' '\n'   # variables d'env
```

`/proc/<pid>/limits` est l'endroit fiable pour vérifier les limites **effectives** d'un processus déjà lancé, plutôt que de supposer ce que `ulimit` aurait donné.
---SECTION---
HEADING: Namespaces & cgroups : la base des conteneurs
BODY:
Un conteneur n'est pas une VM : c'est un processus Linux normal, **isolé** par deux mécanismes du noyau.

- **Namespaces** = isolation de la *visibilité*. Chaque namespace restreint ce que le processus voit : PID (son propre arbre de processus), NET (ses interfaces réseau), MNT (ses points de montage), UTS (hostname), USER (mapping d'UID), IPC.
- **cgroups** (control groups) = limitation des *ressources* : CPU, mémoire, I/O.

```bash
lsns                          # lister les namespaces
systemd-cgls                  # arbre des cgroups
systemd-cgtop                 # top par cgroup
```

Docker, Podman et Kubernetes ne font qu'orchestrer namespaces + cgroups + un système de fichiers en couches. Comprendre ça démystifie complètement les conteneurs.
---SECTION---
HEADING: Réseau local
BODY:
Outils modernes (paquet `iproute2`) pour inspecter le réseau :

```bash
ip addr                 # interfaces et adresses IP (remplace ifconfig)
ip route                # table de routage
ss -tlnp                # sockets TCP en écoute + processus (remplace netstat)
dig example.com         # résolution DNS
```

`ss -tlnp` est le réflexe pour répondre à "quel processus écoute sur le port 8080 ?". Le fichier `/etc/hosts` court-circuite le DNS pour des noms locaux, `/etc/resolv.conf` définit les serveurs DNS utilisés.
---SECTION---
HEADING: Debug : strace, lsof, dmesg
BODY:
Le trio de diagnostic système.

- **strace** : trace les appels système d'un processus. Idéal quand un programme "bloque" ou échoue sans log clair.

```bash
strace -p 4242              # attacher à un processus vivant
strace -c ./app            # résumé statistique des syscalls
```

- **lsof** : "list open files" — fichiers, sockets, FD ouverts.

```bash
lsof -i :8080              # qui utilise le port 8080
```

- **dmesg** : messages du noyau (ring buffer) — OOM kills, erreurs disque, segfaults.

```bash
dmesg -T | tail -50        # -T = timestamps lisibles
```
---SECTION---
HEADING: Récap & bonnes pratiques
BODY:
- Toujours tenter **SIGTERM** avant SIGKILL, et implémenter un graceful shutdown dans les services longue durée.
- Auditer régulièrement les binaires **setuid root** (`find / -perm -4000`).
- Cadrer la mémoire des services critiques via `MemoryMax` (cgroups) plutôt que subir l'OOM killer global.
- Les limites de FD sous systemd se règlent avec **`LimitNOFILE`**, pas `ulimit`. Vérifier via `/proc/<pid>/limits`.
- Un conteneur = **namespaces + cgroups** : rien de magique.
- Réflexes debug : `ss -tlnp` (ports), `strace -p` (blocage), `lsof` (fichiers), `dmesg -T` (noyau, OOM).
===END===
===LESSON===
KEY: git
TOPIC: git
TITLE: Git
ICON: 🔀
INTRO: Git ne stocke pas des "diffs" mais des instantanés reliés dans un graphe. Comprendre son modèle d'objets rend limpides des opérations qui semblent magiques : rebase, cherry-pick, reflog. Cette leçon couvre le quotidien et surtout comment récupérer après une erreur — car presque tout est réversible.
---SECTION---
HEADING: Le modèle d'objets
BODY:
Git est une base de données d'objets adressés par le hash SHA-1/SHA-256 de leur contenu. Quatre types :

- **blob** : le contenu d'un fichier (sans nom).
- **tree** : un répertoire — liste de noms → blobs/trees.
- **commit** : pointe vers un tree (l'état complet du projet), vers son/ses parent(s), + auteur, date, message.
- **tag** (annoté) : pointeur nommé vers un objet.

```bash
git cat-file -p HEAD        # voir le contenu d'un commit
git log --oneline --graph --all
```

Point clé : un commit **contient** l'état complet (via son tree), pas un diff. Une **branche** n'est qu'un fichier texte contenant le hash d'un commit ; `HEAD` pointe vers la branche courante. C'est pourquoi créer une branche est instantané.
---SECTION---
HEADING: Zones de travail & états
BODY:
Git a trois zones : le **working directory**, l'**index** (staging area) et le **dépôt** (commits).

```bash
git add fichier          # working dir -> index
git add -p               # stager par morceaux (hunks)
git restore --staged f   # unstager (index -> working)
git commit -m "message"
```

`git add -p` est essentiel pour faire des commits atomiques : on ne stage que les changements liés à un même sujet, même s'ils sont dans le même fichier.
---SECTION---
HEADING: Branches, merge vs rebase
BODY:
Deux façons d'intégrer le travail d'une branche dans une autre.

- **merge** : crée un commit de fusion à deux parents. Préserve l'historique réel, non linéaire.

```bash
git switch main
git merge feature          # commit de merge (sauf fast-forward)
```

- **rebase** : rejoue vos commits **au-dessus** d'une nouvelle base, créant de *nouveaux* commits (nouveaux hashes). Historique linéaire.

```bash
git switch feature
git rebase main
```

### Quand choisir ?
- **Rebase** pour nettoyer une branche locale avant de la partager (historique propre, linéaire).
- **Merge** pour intégrer une feature terminée dans main, ou dès que la branche est **partagée**.

Règle d'or : **ne jamais rebaser des commits déjà poussés et partagés** — vous réécririez l'historique des autres.
---SECTION---
HEADING: Rebase interactif : squash & fixup
BODY:
Le rebase interactif permet de réorganiser, fusionner, éditer ou supprimer des commits avant de partager.

```bash
git rebase -i HEAD~5      # travailler sur les 5 derniers commits
```

Une action par ligne : `pick` (garder), `reword` (changer le message), `squash` (fusionner + combiner les messages), `fixup` (fusionner + **jeter** le message), `drop` (supprimer), `edit` (s'arrêter pour amender).

Workflow typique : un commit "feat: login" suivi de "typo", "fix review". On les met en `fixup` sous le premier pour obtenir **un seul commit propre**. Astuce : `git commit --fixup=<hash>` puis `git rebase -i --autosquash` place et marque tout automatiquement.
---SECTION---
HEADING: Push, force-push & --force-with-lease
BODY:
Après un rebase, les hashes ont changé : un `git push` normal est refusé (non fast-forward). Il faut forcer — mais prudemment.

```bash
git push --force                    # DANGEREUX : écrase sans vérifier
git push --force-with-lease         # sûr : refuse si le distant a bougé
```

`--force` écrase la branche distante inconditionnellement : si un collègue a poussé entre-temps, **son travail est perdu**.

`--force-with-lease` vérifie d'abord que le distant est toujours là où vous croyez (basé sur votre dernier fetch). Si quelqu'un a poussé entre-temps, le push est **rejeté** au lieu d'écraser. **Utilisez toujours `--force-with-lease`** — c'est le filet de sécurité.
---SECTION---
HEADING: reflog : le filet de sécurité ultime
BODY:
Le **reflog** enregistre tous les mouvements de `HEAD` et des branches localement, même après reset, rebase raté ou "suppression" de commits. Tant qu'un commit y figure, il n'est pas perdu.

```bash
git reflog                 # historique de tous les déplacements de HEAD
git reset --hard HEAD@{2}  # revenir juste avant l'erreur
git branch recup ef12ab    # récupérer un commit "perdu" dans une branche
```

Scénario classique : "j'ai fait `git reset --hard` et perdu 3 commits !" → `git reflog`, on retrouve le hash d'avant, on y revient. Les commits orphelins restent ~30 jours avant le passage du garbage collector (`git gc`).
---SECTION---
HEADING: Réécrire l'historique : dangers
BODY:
`rebase`, `commit --amend`, `reset` réécrivent l'historique (nouveaux hashes).

```bash
git reset --soft HEAD~1       # défaire le commit, garder les changements stagés
git reset --mixed HEAD~1      # défaire commit + unstager (défaut)
git reset --hard HEAD~1       # défaire tout, JETER les changements
```

**La règle** : réécrire l'historique **local et non partagé** est excellent (nettoyer avant PR). Réécrire un historique **déjà partagé** oblige tout le monde à des manœuvres douloureuses. Si vous devez corriger un commit déjà public, préférez `git revert` (crée un nouveau commit annulant les changements, sans réécrire).

```bash
git revert <hash>             # sûr sur branche partagée
```
---SECTION---
HEADING: bisect : trouver le commit fautif
BODY:
`git bisect` fait une recherche dichotomique dans l'historique pour localiser le commit qui a introduit un bug.

```bash
git bisect start
git bisect bad                 # le commit actuel est cassé
git bisect good v1.2.0         # cette version marchait
# Git checkout un commit au milieu ; vous testez, puis :
git bisect good                # (ou bad selon le résultat)
git bisect reset               # revenir à l'état initial
```

Sur 1000 commits, ~10 tests suffisent (log₂). On peut automatiser avec un script : `git bisect run ./test.sh`.
---SECTION---
HEADING: cherry-pick
BODY:
`cherry-pick` applique un commit spécifique d'une branche sur la branche courante (nouveau hash, mêmes changements).

```bash
git cherry-pick <hash>            # appliquer un commit
git cherry-pick A..B              # une plage (A exclu)
```

Usage typique : porter un **hotfix** de `main` vers une branche de release. À éviter en masse : dupliquer beaucoup de commits crée un historique confus — un merge/rebase est souvent plus adapté.
---SECTION---
HEADING: .gitignore et hooks
BODY:
`.gitignore` empêche Git de suivre des fichiers (build, dépendances, secrets).

```
node_modules/
dist/
.env
*.pem
.DS_Store
```

**Piège majeur** : `.gitignore` n'agit que sur les fichiers **non encore suivis**. Un fichier déjà commité continue d'être suivi. Pour arrêter de le suivre : `git rm --cached fichier`.

Les **hooks** (`.git/hooks/`) sont des scripts déclenchés par des événements : `pre-commit` (linter avant commit), `commit-msg` (format du message), `pre-push` (tests). Comme `.git/hooks/` n'est pas versionné, on utilise **pre-commit** ou **husky** pour les partager. Les hooks locaux sont contournables (`--no-verify`) — doublez avec la CI.
---SECTION---
HEADING: Secrets committés : que faire
BODY:
Un secret (clé API, mot de passe) commité **reste dans l'historique** même si vous le supprimez dans un commit ultérieur. Il est accessible via `git log`, les anciens commits, et sur les forks/clones existants.

Procédure :

1. **Révoquer/roter le secret immédiatement** — c'est la seule vraie protection ; considérez-le comme compromis.
2. Purger l'historique avec `git filter-repo` (recommandé) ou BFG Repo-Cleaner :

```bash
git filter-repo --path config/secrets.yml --invert-paths
```

3. Force-push (branche partagée → prévenir l'équipe, qui devra re-cloner).
4. Prévenir : `.gitignore` pour `.env`, un hook/CI de détection (gitleaks, trufflehog).

Ne jamais se contenter d'un commit "remove secret" : le secret vit toujours dans l'historique.
===END===
===LESSON===
KEY: networking
TOPIC: networking
TITLE: Réseau
ICON: 🌐
INTRO: Chaque requête HTTP traverse une pile : DNS, TCP, TLS, routage. Comprendre ces couches explique la latence, les erreurs CORS mystérieuses, les migrations DNS lentes et le choix entre HTTP/2 et HTTP/3. Cette leçon relie théorie (OSI) et réalité opérationnelle.
---SECTION---
HEADING: Le modèle OSI (et le modèle TCP/IP réel)
BODY:
OSI décompose la communication en 7 couches conceptuelles. En pratique on parle surtout de quelques-unes :

- **L1 Physique** : signaux (câble, fibre, radio)
- **L2 Liaison** : trames, adresses MAC (Ethernet, Wi-Fi)
- **L3 Réseau** : paquets, adresses IP, routage
- **L4 Transport** : TCP / UDP, ports
- **L7 Application** : HTTP, DNS, TLS

Le modèle **TCP/IP** réel condense cela en 4 couches. Retenez surtout **L4 vs L7** — c'est la distinction clé pour le load balancing et les proxies.
---SECTION---
HEADING: TCP vs UDP
BODY:
Deux protocoles de transport (L4) aux philosophies opposées.

**TCP** : connexion fiable, ordonnée. Établie par un **handshake en 3 temps** :

```
Client → SYN            "je veux parler"
Serveur → SYN-ACK       "ok, moi aussi"
Client → ACK            "c'est parti"
```

Garantit livraison, ordre, contrôle de flux et de congestion. Coût : latence d'établissement + overhead.

**UDP** : sans connexion, "fire and forget". Pas de garantie de livraison ni d'ordre, mais rapide et léger. Utilisé pour DNS, VoIP, jeux, streaming, et... QUIC (HTTP/3).

- TCP quand l'intégrité prime (web, fichiers, DB).
- UDP quand la latence prime et qu'on tolère des pertes (temps réel).
---SECTION---
HEADING: Slow-start & contrôle de congestion
BODY:
TCP ne balance pas tout le débit d'un coup. Le **slow-start** augmente progressivement la fenêtre de congestion (cwnd) : elle démarre petite et croît (grossièrement en doublant par RTT) jusqu'à détecter une perte, puis se réduit.

Conséquences pratiques :

- Les **connexions courtes** (une petite requête HTTP) ne profitent jamais de la pleine bande passante : elles finissent avant la fin du slow-start. D'où l'intérêt de **réutiliser les connexions** (keep-alive, pooling).
- Une nouvelle connexion sur un réseau à fort RTT (satellite, mobile) est lente à "chauffer".
- C'est un argument fort pour HTTP/2 (une seule connexion multiplexée qui reste chaude) et les CDN.
---SECTION---
HEADING: DNS : résolution, TTL, migration
BODY:
Le DNS traduit un nom (`example.com`) en adresse IP. La résolution est **hiérarchique et mise en cache** : resolver → racine → TLD → serveur autoritaire → IP.

```bash
dig example.com A          # enregistrement IPv4
dig example.com +trace     # suivre toute la chaîne
```

Le **TTL** (Time To Live) de chaque enregistrement dit combien de temps le cacher.

**Migration** : avant de changer une IP, on **baisse le TTL** à l'avance (ex. 300 s) plusieurs jours avant. Sinon les anciens caches (TTL de 24 h) continueront d'envoyer le trafic vers l'ancienne IP longtemps après le changement. Une fois migré et stable, on remonte le TTL. Types : A/AAAA (IP), CNAME (alias), MX (mail), TXT (SPF/DKIM).
---SECTION---
HEADING: HTTP/1.1 vs HTTP/2 vs HTTP/3
BODY:
Évolution centrée sur un problème : le **head-of-line (HOL) blocking**.

- **HTTP/1.1** : une requête à la fois par connexion. Une réponse lente bloque les suivantes → les navigateurs ouvrent 6 connexions parallèles par domaine. HOL blocking **applicatif**.
- **HTTP/2** : **multiplexage** de plusieurs flux sur une seule connexion TCP. Résout le HOL applicatif. Mais comme tout passe dans **un seul flux TCP**, une perte de paquet bloque tous les flux : HOL blocking **au niveau TCP**.
- **HTTP/3** : abandonne TCP pour **QUIC** (sur UDP). Chaque flux est indépendant au niveau transport → une perte n'affecte que son flux. TLS 1.3 intégré, établissement plus rapide (0-RTT possible), et **migration de connexion** (changer de Wi-Fi à 4G sans rompre la connexion, grâce à un Connection ID).
---SECTION---
HEADING: TLS, SNI & ECH
BODY:
**TLS** chiffre et authentifie la connexion. Le handshake négocie une version (privilégier **TLS 1.3**), vérifie le certificat du serveur (chaîne de confiance jusqu'à une CA) et établit des clés de session.

**SNI** (Server Name Indication) : dès le début du handshake, le client indique **en clair** quel domaine il veut joindre. Indispensable pour héberger plusieurs sites HTTPS sur une même IP. Problème : le SNI en clair **révèle le domaine visité** à un observateur réseau.

**ECH** (Encrypted Client Hello) chiffre le ClientHello — dont le SNI — pour combler cette fuite. Il s'appuie sur une clé publique publiée via DNS (enregistrement HTTPS).
---SECTION---
HEADING: Load balancing L4 vs L7
BODY:
Un load balancer répartit le trafic sur plusieurs serveurs. La couche où il opère change tout.

**L4 (transport)** : route selon IP/port, sans lire le contenu. Très rapide, faible latence, agnostique au protocole. Mais aucune décision basée sur l'URL, les en-têtes ou les cookies. Ne peut pas terminer TLS.

**L7 (application)** : comprend HTTP. Peut router selon l'URL (`/api` → backend A), les en-têtes, les cookies (sticky sessions), terminer TLS, réécrire, compresser, mettre en cache.

- L4 (ex. AWS NLB, IPVS) : perf max, protocoles arbitraires.
- L7 (ex. Nginx, HAProxy, AWS ALB, Envoy) : routage intelligent, terminaison TLS.
---SECTION---
HEADING: Reverse proxy, CDN, NAT
BODY:
- **Reverse proxy** : se place devant les serveurs. Il termine TLS, load-balance, met en cache, protège (WAF), masque la topologie interne.

```nginx
location /api/ {
    proxy_pass http://backend_pool;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

- **CDN** : réseau de serveurs distribués géographiquement qui cachent le contenu **au plus près de l'utilisateur**. Réduit le RTT, absorbe la charge, et amortit les attaques DDoS.

- **NAT** (Network Address Translation) : traduit des IP privées (`10.x.x.x`) vers une IP publique partagée. C'est ce qui permet à tout un réseau de sortir avec une seule IP publique.
---SECTION---
HEADING: CORS (côté navigateur)
BODY:
**CORS** (Cross-Origin Resource Sharing) est une sécurité **du navigateur** : par la *same-origin policy*, une page sur `https://app.com` ne peut pas lire une réponse de `https://api.autre.com` sauf si ce serveur l'autorise explicitement.

Clé de compréhension : **CORS n'est PAS une protection serveur** — c'est le navigateur qui bloque la *lecture* de la réponse par le JavaScript. Un client hors navigateur (curl, backend) ignore totalement CORS.

Pour les requêtes "non simples", le navigateur envoie d'abord un **preflight** `OPTIONS` :

```
Access-Control-Allow-Origin: https://app.com
Access-Control-Allow-Credentials: true
```

Piège fréquent : `Allow-Origin: *` est **incompatible** avec `Allow-Credentials: true` — il faut renvoyer l'origine exacte.
---SECTION---
HEADING: Anycast & BGP (bases)
BODY:
**BGP** (Border Gateway Protocol) est le protocole de routage **entre** les réseaux (AS) qui forment Internet. Chaque AS annonce les préfixes IP qu'il dessert ; BGP choisit les chemins. C'est un système de confiance fragile : une mauvaise annonce BGP peut détourner ou couper des pans d'Internet.

**Anycast** : une même IP est annoncée depuis **plusieurs endroits** du globe. BGP route chaque client vers l'instance **topologiquement la plus proche**. Résultat : latence réduite, résilience (si un site tombe, le trafic bascule), et absorption du DDoS. C'est la base des DNS publics (1.1.1.1, 8.8.8.8) et des CDN.
---SECTION---
HEADING: Récap
BODY:
- Raisonnez en couches : la plupart des problèmes se situent à **L4 (TCP/UDP)** ou **L7 (HTTP)**.
- **Réutilisez les connexions** (keep-alive, HTTP/2) pour échapper au coût du handshake et du slow-start.
- Baissez le **TTL DNS** *avant* une migration, remontez-le après.
- **HTTP/3 (QUIC)** élimine le HOL blocking TCP et survit aux changements de réseau.
- Privilégiez **TLS 1.3** ; SNI fuit le domaine, **ECH** le corrige.
- **L4** = rapide/aveugle, **L7** = intelligent/HTTP.
- **CORS** protège l'utilisateur dans le navigateur, pas le serveur.
- **CDN + Anycast** rapprochent le contenu et encaissent la charge.
===END===
===LESSON===
KEY: monitoring
TOPIC: monitoring
TITLE: Monitoring & Observabilité
ICON: 📊
INTRO: Le monitoring répond à "est-ce que ça marche ?" ; l'observabilité à "pourquoi ça ne marche pas ?". Cette leçon couvre les trois piliers (métriques, logs, traces), les pièges statistiques (le p99 et les histogrammes), les cadres SLO/error budget et comment alerter sans épuiser l'équipe.
---SECTION---
HEADING: Monitoring vs Observabilité
BODY:
- **Monitoring** : surveiller des signaux **connus à l'avance** (CPU, taux d'erreur, latence). Répond à des questions prévues.
- **Observabilité** : capacité à comprendre l'état **interne** d'un système à partir de ses sorties, y compris pour des problèmes **jamais anticipés**.

L'observabilité exige des données suffisamment riches et corrélables pour poser de **nouvelles** questions sans redéployer. C'est ce qui distingue un dashboard figé d'un système que l'on peut réellement interroger.
---SECTION---
HEADING: Les 3 piliers : métriques, logs, traces
BODY:
- **Métriques** : valeurs numériques agrégées dans le temps (req/s, latence p99, taux d'erreur). Peu coûteuses à stocker, idéales pour les tendances et les alertes. Faible cardinalité conseillée.
- **Logs** : événements discrets horodatés. Riches en détail, coûteux à grande échelle. Préférez le **log structuré** (JSON) pour pouvoir filtrer/agréger.
- **Traces** : suivent une requête **à travers tous les services** (microservices). Chaque étape est un *span*, reliés par un *trace ID*. Révèlent où le temps est passé dans un système distribué.

```json
{"level":"error","trace_id":"abc123","service":"checkout","msg":"payment timeout","user_id":42}
```

Le `trace_id` dans les logs permet de **corréler** les trois piliers : d'une métrique anormale → à la trace → aux logs de la requête.
---SECTION---
HEADING: Prometheus : modèle de données
BODY:
Prometheus **scrape** (tire) périodiquement des métriques exposées par les cibles sur un endpoint `/metrics`. Chaque métrique = un nom + des **labels** (dimensions) + une valeur temporelle.

```
http_requests_total{method="POST", handler="/api", status="500"} 1027
```

Quatre types : **Counter** (ne fait qu'augmenter → `rate()`), **Gauge** (monte et descend), **Histogram** (distribution en buckets), **Summary** (quantiles côté client).

```
rate(http_requests_total{status="500"}[5m])   # erreurs/s sur 5 min
```

**Attention à la cardinalité** : un label à haute cardinalité (user_id, request_id) multiplie les séries et fait exploser la mémoire. Ne jamais mettre d'identifiant unique en label.
---SECTION---
HEADING: Histogrammes & quantiles
BODY:
Un **histogramme** Prometheus compte les observations dans des **buckets** cumulatifs (≤10ms, ≤50ms, ≤100ms...). Les quantiles (p50, p99) sont calculés côté serveur avec `histogram_quantile()` :

```
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
```

Points cruciaux :

- La précision du p99 dépend **entièrement des bornes de buckets** choisies. Si vos buckets s'arrêtent à 1 s mais que la vraie latence est 3 s, le calcul l'ignore.
- C'est une **estimation** interpolée dans le bucket, pas une valeur exacte.
- L'avantage sur les summaries : les histogrammes sont **agrégeables** entre instances (on somme les buckets), contrairement aux quantiles pré-calculés.
---SECTION---
HEADING: Le piège du p99
BODY:
Les moyennes **mentent**. Une latence moyenne de 50 ms peut cacher que 1 % des requêtes prennent 5 s. On utilise donc des quantiles (p50, p95, p99, p99.9).

Pièges à connaître :

- **On ne moyenne JAMAIS des quantiles.** Faire la moyenne des p99 de 10 serveurs ne donne pas le p99 global. Il faut agréger les histogrammes bruts puis calculer.
- Le **p99 concerne 1 requête sur 100** : sur une page qui fait 100 appels backend, presque **chaque** chargement touche au moins une requête p99. La latence perçue est souvent pire que le p99 unitaire.
- Surveillez aussi le **p99.9** et le max : les queues (tail latency) dégradent l'expérience et signalent GC, contention, ou saturation.
---SECTION---
HEADING: USE, RED & les 4 golden signals
BODY:
Trois méthodologies complémentaires pour savoir **quoi** mesurer :

- **USE** (ressources) — pour chaque ressource : **U**tilization, **S**aturation, **E**rrors. Orienté infra (CPU, disque, mémoire).
- **RED** (services) — pour chaque service : **R**ate (req/s), **E**rrors, **D**uration (latence). Orienté requêtes/expérience.
- **4 Golden Signals** (Google SRE) : **Latency, Traffic, Errors, Saturation**.

En pratique : **RED** pour vos services applicatifs, **USE** pour les ressources sous-jacentes. Les deux se complètent — un service RED qui se dégrade (Duration ↑) s'explique souvent par une ressource USE saturée.
---SECTION---
HEADING: SLI, SLO, SLA & error budget
BODY:
- **SLI** (Indicator) : une mesure réelle de qualité de service (ex. % de requêtes < 300 ms sans erreur).
- **SLO** (Objective) : la **cible** interne sur ce SLI (ex. 99,9 % sur 30 jours).
- **SLA** (Agreement) : engagement **contractuel** envers le client, avec pénalités. Toujours plus laxiste que le SLO interne.

**Error budget** = 100 % − SLO. Un SLO de 99,9 % autorise **0,1 % d'échec**, soit ~43 minutes d'indisponibilité par mois. 99,99 % ≈ 4,3 min/mois ; 99 % ≈ 7,3 h/mois.

L'error budget transforme la fiabilité en **ressource à dépenser** : tant qu'il reste du budget, on peut livrer vite et prendre des risques ; s'il est épuisé, on gèle les features et on stabilise. Cela aligne dev et ops sur une même métrique.
---SECTION---
HEADING: Alerting sur burn-rate
BODY:
Alerter sur "erreur > 0" génère du bruit. La bonne pratique (Google SRE) : alerter sur le **burn rate**, la vitesse de consommation de l'error budget.

- Burn rate = 1 → on consomme le budget pile à la vitesse prévue.
- Burn rate = 14,4 → on brûle 14,4× trop vite : à ce rythme, un budget mensuel disparaît en ~2 jours.

**Alertes multi-fenêtres** :

- Fenêtre **courte + rapide** (ex. burn rate ×14 sur 1 h) → page immédiat (incident aigu).
- Fenêtre **longue + lente** (ex. ×3 sur 6 h) → ticket (dégradation progressive).

Cela déclenche **fort et vite** sur les vraies urgences, et calmement sur les fuites lentes — au lieu d'un seuil fixe qui sonne pour un pic sans conséquence.
---SECTION---
HEADING: Alert fatigue et dashboards
BODY:
Trop d'alertes = alertes ignorées. L'**alert fatigue** est un risque de fiabilité en soi (une vraie alerte noyée dans le bruit passe inaperçue).

Principes d'une bonne alerte :

- **Actionnable** : si on ne peut rien faire, ce n'est pas une alerte (au mieux un dashboard).
- **Basée sur les symptômes** (l'utilisateur souffre-t-il ?) plutôt que sur les causes (un CPU à 90 % sans impact n'est pas une urgence).
- **Urgente** : ce qui réveille à 3 h doit exiger une action immédiate. Le reste → tickets.

Un bon dashboard raconte une histoire : **hiérarchie** (golden signals en haut → détail plus bas), organisé autour de **RED**, anomalies évidentes (seuils SLO tracés). Éviter le "wall of graphs" que personne ne sait lire pendant un incident.
---SECTION---
HEADING: OpenTelemetry
BODY:
**OpenTelemetry (OTel)** est le standard ouvert (CNCF) pour instrumenter métriques, logs et traces avec **une seule API/SDK**, indépendant du backend (Prometheus, Jaeger, Grafana, Datadog...).

Intérêt : on instrumente le code **une fois** ; le **Collector** OTel reçoit, transforme et exporte vers n'importe quelle destination. Fini le verrouillage à un fournisseur.

```
App (SDK OTel) → OTLP → Collector → exporters (Prometheus / Jaeger / …)
```

La **propagation de contexte** (trace ID transmis d'un service à l'autre via les en-têtes) est ce qui rend les traces distribuées possibles. Bonne pratique : instrumenter dès le départ avec OTel plutôt que de dépendre d'agents propriétaires.
===END===
===LESSON===
KEY: iot-edge
TOPIC: iot-edge
TITLE: IoT & Edge
ICON: 📡
INTRO: L'IoT et l'edge computing rapprochent le calcul des capteurs : ressources minuscules, réseau intermittent, contraintes d'énergie, et une surface de sécurité tristement célèbre. Cette leçon couvre les protocoles adaptés (MQTT, CoAP), la mise à jour sûre (OTA A/B), le fonctionnement hors-ligne et les leçons de sécurité (Mirai).
---SECTION---
HEADING: Les contraintes de l'edge
BODY:
Un nœud edge n'est pas un serveur cloud. Il faut concevoir **autour** de ses limites :

- **CPU/RAM** : parfois quelques KB de RAM (microcontrôleurs). Pas de place pour des runtimes lourds.
- **Énergie** : appareils sur batterie/solaire. La radio consomme énormément → minimiser les transmissions, préférer le sommeil profond, envoyer par lots.
- **Réseau intermittent** : connectivité qui va et vient (mobile, LoRa). On ne peut **pas** supposer une connexion stable.
- **Latence & coût** : traiter localement évite l'aller-retour cloud.

Conséquence directe : protocoles légers (MQTT/CoAP), formats compacts (CBOR), fonctionnement **offline-first**, et traitement local pour ne remonter que l'essentiel.
---SECTION---
HEADING: Pourquoi pas HTTP ?
BODY:
HTTP/TCP est trop lourd pour beaucoup d'usages IoT :

- En-têtes verbeux (texte), overhead par requête.
- Le modèle requête/réponse convient mal à des milliers de capteurs qui **poussent** des données.
- Établissement TCP + TLS coûteux en énergie et en RTT sur réseau instable.

D'où deux protocoles pensés pour l'edge :

- **MQTT** : publish/subscribe sur TCP, très léger (en-tête fixe de 2 octets), idéal pour la télémétrie de nombreux appareils vers un broker.
- **CoAP** : requête/réponse "façon REST" mais sur **UDP**, ultra-compact, pour les appareils les plus contraints.
---SECTION---
HEADING: MQTT : le modèle publish/subscribe
BODY:
MQTT découple les producteurs des consommateurs via un **broker** central. Les appareils **publient** sur des *topics* ; d'autres s'y **abonnent**.

```
capteur → PUBLISH  "maison/salon/temp" = 21.5  → [BROKER] → SUBSCRIBE "maison/+/temp" → app
```

Topics hiérarchiques avec wildcards : `+` (un seul niveau), `#` (plusieurs niveaux).

```bash
mosquitto_sub -t "maison/+/temp" -h broker.local
mosquitto_pub -t "maison/salon/temp" -m "21.5" -h broker.local
```

Ce découplage est parfait pour l'IoT : on ajoute des capteurs/consommateurs sans reconfigurer les autres, et le broker absorbe l'intermittence.
---SECTION---
HEADING: MQTT : niveaux de QoS
BODY:
MQTT offre trois niveaux de **Quality of Service** pour la livraison :

- **QoS 0** — "at most once" : envoi sans accusé. Peut être perdu. Le plus léger.
- **QoS 1** — "at least once" : accusé (PUBACK), retransmis si non confirmé. Garantit la livraison mais **peut dupliquer**. Le consommateur doit être idempotent.
- **QoS 2** — "exactly once" : handshake en 4 temps, aucune perte ni doublon. Le plus fiable mais le plus coûteux.

Choix pratique : **QoS 0** pour de la télémétrie haute fréquence, **QoS 1** pour la plupart des cas, **QoS 2** réservé aux opérations critiques non idempotentes.
---SECTION---
HEADING: MQTT : retained & Last Will (LWT)
BODY:
Deux fonctionnalités clés pour gérer l'état et les déconnexions.

- **Retained message** : le broker **garde le dernier** message publié avec ce flag sur un topic. Tout nouvel abonné le reçoit **immédiatement**. Idéal pour l'état courant.

```bash
mosquitto_pub -t "maison/salon/temp" -m "21.5" -r   # -r = retained
```

- **Last Will and Testament (LWT)** : à la connexion, l'appareil enregistre un message auprès du broker. Si l'appareil se déconnecte **anormalement** (crash), le broker publie automatiquement ce message. Usage : signaler `status = offline`.

Combinés (LWT + retained sur un topic `status`), ils donnent une **présence** fiable : les abonnés savent toujours si un appareil est en ligne.
---SECTION---
HEADING: CoAP
BODY:
**CoAP** (Constrained Application Protocol) apporte un modèle **REST** (GET/POST/PUT/DELETE, URIs, codes de réponse) mais adapté aux appareils minuscules :

- Sur **UDP** (pas de handshake TCP), avec un mécanisme optionnel de fiabilité (messages *confirmable*/ACK).
- En-têtes **binaires** de 4 octets → très compact.
- Sécurisé par **DTLS** (TLS sur UDP).
- Supporte l'**observe** (abonnement à une ressource, façon pub/sub).

CoAP convient aux appareils les plus contraints. MQTT et CoAP coexistent souvent : CoAP à l'extrême bord, MQTT pour agréger vers le cloud (des passerelles font le pont).
---SECTION---
HEADING: Sécurité IoT & leçon Mirai
BODY:
La faille numéro un de l'IoT : les **identifiants par défaut** (`admin/admin`, `root/root`) jamais changés, avec des services (Telnet, SSH) exposés sur Internet.

**Mirai** (2016) est le botnet IoT emblématique : il scannait Internet à la recherche d'appareils (caméras, DVR) avec **Telnet ouvert**, testait une **liste d'~60 identifiants par défaut**, et enrôlait les appareils compromis dans un botnet lançant des DDoS massifs (~1 Tbps contre le DNS Dyn → chute de Twitter, GitHub, Netflix). Mirai n'exploitait **aucune faille sophistiquée** — juste des mots de passe par défaut.

**Remédiation :** credentials uniques par appareil, changement forcé au premier démarrage ; fermer les ports inutiles (jamais de Telnet) ; authentification par certificat (mTLS) ; chiffrer les communications (TLS/DTLS) ; segmenter l'IoT sur un VLAN isolé ; prévoir les mises à jour.
---SECTION---
HEADING: OTA & partitions A/B
BODY:
Mettre à jour à distance (**OTA**) est indispensable mais risqué : une update qui échoue peut **briquer** un appareil inaccessible physiquement.

La solution : les **partitions A/B** (dual-bank).

```
[ Partition A : firmware actuel (actif) ]
[ Partition B : nouveau firmware (téléchargé ici) ]
```

1. Le système tourne sur A. La nouvelle image est écrite sur B (A reste intact).
2. On vérifie l'intégrité/signature de B, puis on bascule le boot sur B.
3. B démarre et doit se **confirmer** sain (health check). Sinon, **rollback automatique** sur A au reboot suivant.

Avantages : mise à jour **sans downtime**, et surtout **résiliente** — une panne de courant en plein flash ne condamne pas l'appareil. Les images doivent être **signées** pour empêcher l'installation de firmware malveillant.
---SECTION---
HEADING: Offline-first et traitement local
BODY:
Le réseau edge **va et vient**. Un appareil doit continuer à fonctionner et collecter **sans connexion**, puis se resynchroniser au retour.

Stratégies **offline-first** : stockage local des mesures (buffer circulaire, SQLite) ; rejeu à la reconnexion avec l'**horodatage d'origine** (pas celui de l'envoi) ; idempotence côté backend (la reconnexion renvoie des doublons via QoS 1) ; gestion explicite du buffer plein.

**Traitement local (edge processing)** : plutôt que tout remonter au cloud, on traite sur place. Bénéfices : latence (réagir en ms), bande passante/coût (n'envoyer que des **agrégats/événements**, pas le flux brut), résilience et vie privée. Exemples : filtrage/seuils, agrégation, détection d'anomalies, voire inférence ML embarquée (TinyML). Partage typique : **inférence à l'edge**, entraînement dans le cloud.
===END===
