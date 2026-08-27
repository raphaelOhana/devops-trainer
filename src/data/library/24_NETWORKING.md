# Le réseau, de bout en bout : le manuel du CTO

*Synthèse d'un guide « Networking for CTOs » (OSI/TCP-IP, adressage, TCP, TLS, DNS, HTTP, load balancing, CDN). Objectif : non pas cataloguer les protocoles, mais comprendre les quelques lois physiques qui expliquent pourquoi la latence et le débit se comportent comme ils le font — et ce que ça coûte à chaque étage.*

Presque tout ce que vous construisez repose sur le réseau, et presque tous les incidents mystérieux en production s'y logent. La bonne nouvelle : la pile réseau n'est pas un empilement arbitraire de sigles à mémoriser. C'est une poignée de mécanismes, chacun né d'un problème précis, chacun avec un coût précis. Une fois qu'on tient le *pourquoi*, le reste se déduit.

Vous venez du bas niveau, et cela va servir. Un paquet réseau, c'est une ligne de cache qui voyage. Le *three-way handshake* de TCP, c'est un protocole de synchronisation entre deux cœurs qui ne partagent pas d'horloge. Le contrôle de congestion, c'est de l'arbitrage de bus sous contention. Le *head-of-line blocking* de HTTP/2 sur TCP, c'est exactement le faux partage (*false sharing*) : deux flux logiquement indépendants sérialisés par une ressource partagée en dessous. Je tirerai ces fils au passage.

Un principe domine tout le chapitre : **on ne bat pas la vitesse de la lumière.** La lumière parcourt environ 200 000 km/s dans la fibre (contre 300 000 dans le vide). New York–Tokyo, c'est ~11 000 km, donc ~55 ms incompressibles dans un sens, ~110 ms l'aller-retour minimum théorique — et en pratique ~150–200 ms avec le routage. Aucune optimisation logicielle n'efface cette distance. Tout ce qui suit est, au fond, une stratégie pour amortir, masquer ou contourner ce **RTT** (*round-trip time*).

---

## Un modèle mental de la pile

### Pourquoi des couches

Un ordinateur à Paris veut parler à un serveur en Virginie. Entre les deux : des cartes réseau, des switches, des routeurs, des fibres transatlantiques, des systèmes d'exploitation différents. Écrire un seul programme monolithique qui gère tout, du voltage sur le câble jusqu'au sens d'une requête HTTP, serait ingérable. La solution est la même qu'en architecture logicielle : **des abstractions empilées, chacune ignorant les détails de celle du dessous.**

Chaque couche rend un service à celle du dessus et n'a qu'un contrat à respecter avec sa jumelle distante. TCP se moque de savoir si le lien physique est une fibre ou du Wi-Fi ; HTTP se moque de savoir comment TCP garantit la livraison. C'est de l'encapsulation, au sens exact où vous l'entendez : chaque couche ajoute son en-tête autour du *payload* de la couche supérieure, comme des poupées russes, et la couche jumelle en face retire le sien.

### OSI vs TCP/IP : sept couches pour parler, quatre pour travailler

Le **modèle OSI à 7 couches** est le vocabulaire de référence. On l'utilise surtout pour se comprendre entre ingénieurs (« ton problème est en couche 3 ou en couche 7 ? ») :

```
7. Application   HTTP, DNS, gRPC        ce que l'app manipule
6. Présentation  TLS, compression       format, chiffrement
5. Session       gestion de session     cookies, tokens
4. Transport     TCP, UDP               ports, fiabilité
3. Réseau        IP, ICMP               adressage, routage
2. Liaison       Ethernet, Wi-Fi        adresses MAC, trames
1. Physique      fibre, cuivre, radio   bits, signaux
```

En pratique, Internet tourne sur le **modèle TCP/IP à 4 couches**, plus honnête sur ce qui existe réellement :

```
Application  (OSI 5-7)   HTTP, DNS, TLS
Transport    (OSI 4)     TCP, UDP
Internet     (OSI 3)     IP
Liaison      (OSI 1-2)   Ethernet, Wi-Fi
```

Retenez la correspondance opérationnelle, car elle décide de vos choix d'architecture. Un **load balancer L4** travaille au transport : il voit des adresses IP et des ports, rien de plus. Un **load balancer L7** travaille à l'application : il lit l'URL, les en-têtes, les cookies. La **terminaison TLS**, c'est la couche présentation. Quand un incident tombe, on diagnostique de bas en haut : le lien est-il up (L1-2) ? la route existe-t-elle (L3) ? le port répond-il (L4) ? le certificat est-il valide (L6) ? l'application renvoie-t-elle 500 (L7) ? Cette discipline transforme un « ça marche pas » en une recherche binaire.

---

## Adressage IP, sous-réseaux et CIDR

### 32 bits, et le mur qu'ils imposent

Une adresse **IPv4** tient sur **32 bits**, soit quatre octets notés en décimal : `192.168.1.100` vaut `11000000.10101000.00000001.01100100` en binaire. Cela plafonne l'espace à 2³² ≈ **4,3 milliards** d'adresses. Insuffisant pour la planète — d'où IPv6 (128 bits) et, entre-temps, les astuces que sont les adresses privées et le NAT, qu'on verra plus loin.

### CIDR : la frontière mobile entre réseau et hôte

Une adresse IP se coupe en deux : un **préfixe réseau** (quelle « rue ») et un **suffixe hôte** (quelle « maison » dans la rue). La notation **CIDR** (*Classless Inter-Domain Routing*) écrit où passe la coupure : le nombre après le `/` compte les bits de réseau.

```
192.168.1.0/24
             └─ 24 bits de réseau, 8 bits d'hôte
                → 2^8 = 256 adresses (254 utilisables)

10.0.0.0/8    → 8 bits réseau, 24 d'hôte  → 2^24 = 16 777 216 adresses
172.16.0.0/12 → 12 bits réseau            → 2^20 = 1 048 576 adresses
192.168.0.0/16→ 16 bits réseau            → 2^16 = 65 536 adresses
```

La règle unique à intérioriser : **un préfixe `/n` laisse `32 − n` bits d'hôte, donc `2^(32−n)` adresses.** Chaque bit gagné sur le réseau divise par deux le nombre d'hôtes. C'est un curseur binaire, exactement comme découper un espace d'adressage mémoire en pages : plus de bits de page, moins d'offset.

Sur chaque sous-réseau, deux adresses sont réservées et non attribuables à une machine : la **première** (adresse réseau, tous les bits d'hôte à 0) et la **dernière** (broadcast, tous à 1). D'où « 254 utilisables » sur un `/24` et non 256.

Concrètement, `192.168.1.0/24` se déroule ainsi :

```
Réseau (réservé)     192.168.1.0
Première utilisable  192.168.1.1
Dernière utilisable  192.168.1.254
Broadcast (réservé)  192.168.1.255
Masque               255.255.255.0
```

Le masque `255.255.255.0` est simplement le préfixe écrit en décimal : 24 bits à 1 suivis de 8 bits à 0. Un ET binaire entre une IP et son masque donne l'adresse réseau — l'opération exacte que fait un routeur pour décider si une destination est « locale » ou « à router ailleurs ».

### CIDR n'est pas les « classes » d'antan

Point de vigilance, souvent mal transmis. Les trois plages privées de la **RFC 1918** se décrivent **par préfixe CIDR**, pas par les vieilles « classes » d'adressage :

```
10.0.0.0/8      10.0.0.0    – 10.255.255.255   (~16,7 M adresses)
172.16.0.0/12   172.16.0.0  – 172.31.255.255   (~1 M adresses)
192.168.0.0/16  192.168.0.0 – 192.168.255.255  (65 536 adresses)
```

Ne confondez pas ces blocs avec l'adressage *classful* hérité. Dans l'ancien système, une **classe B** correspond à un `/16` et une **classe C** à un `/24` (256 adresses, 254 utilisables). Le CIDR a précisément aboli cette rigidité : la frontière réseau/hôte peut tomber à n'importe quel bit, ce qui permet de tailler des sous-réseaux à la bonne dimension au lieu de gaspiller des classes entières.

Ces plages ne sont **pas routables sur l'Internet public**. Une machine en `10.x` doit passer par du **NAT** pour atteindre le monde extérieur — j'y reviens.

### Découper en pratique : l'exemple d'un VPC

Un réseau privé cloud (AWS VPC, ou l'équivalent) part typiquement d'un `10.0.0.0/16` (65 536 adresses) qu'on subdivise par fonction et par zone de disponibilité :

```
VPC 10.0.0.0/16
├─ Publics    (load balancers, passerelles NAT)
│    10.0.1.0/24  10.0.2.0/24  10.0.3.0/24   ← une par AZ
├─ Privés     (serveurs applicatifs)
│    10.0.11.0/24 10.0.12.0/24 10.0.13.0/24
└─ Bases      (données isolées)
     10.0.21.0/24 10.0.22.0/24 10.0.23.0/24
```

Trois raisons de séparer : la **sécurité** (des règles de pare-feu distinctes par étage), le **routage** (seuls les sous-réseaux publics ont une route vers Internet), la **disponibilité** (répartition multi-AZ pour survivre à la panne d'un datacenter). Détail cloud utile : AWS réserve **5 adresses par sous-réseau** (réseau, routeur, DNS, réserve, broadcast), pas 2 — un `/24` n'y offre donc que 251 hôtes.

---

## TCP : d'où vient la latence, d'où vient le débit

TCP est le protocole de transport fiable d'Internet. Comprendre trois de ses mécanismes — la poignée de main, le contrôle de flux, le contrôle de congestion — suffit à expliquer *pourquoi* une connexion est lente ou rapide. UDP, son opposé, se résume vite : pas de poignée de main, pas d'accusé de réception, pas d'ordre garanti, un en-tête de 8 octets contre 20+. On le choisit quand la vitesse prime sur la fiabilité et qu'une perte occasionnelle est tolérable — DNS, streaming vidéo, VoIP, jeu en ligne, et, on le verra, QUIC.

### La poignée de main en trois temps : une RTT avant tout

Avant d'échanger le moindre octet utile, TCP établit une connexion en trois messages :

```
Client                          Serveur
  │──────── SYN (seq=x) ───────────►│   « je veux me connecter »
  │◄─── SYN-ACK (seq=y, ack=x+1) ───│   « d'accord, prêt »
  │──────── ACK (ack=y+1) ─────────►│   « confirmé »
  │═══════ connexion établie ═══════│
  │──────── données ───────────────►│
```

Pourquoi trois messages et pas deux ? Parce que chaque partie doit prouver à l'autre qu'elle *reçoit* bien ce que l'autre envoie : le client apprend son propre numéro de séquence accepté au 2ᵉ message, le serveur apprend le sien au 3ᵉ. C'est un accord bilatéral sur un point de départ commun, en présence d'un canal qui peut perdre, dupliquer ou réordonner. Les numéros de séquence (`seq`, `ack`) sont ce point de départ : ils numérotent les octets pour permettre l'ordre et la retransmission.

Le coût est structurel : **une RTT complète est consommée avant la première donnée** (le SYN et le SYN-ACK forment un aller-retour ; le client peut coller ses données au 3ᵉ paquet). Sur un lien Tokyo–Virginie à ~100 ms, c'est ~100 ms perdus *avant* de commencer. Fermer une connexion (FIN/ACK des deux côtés) coûte de nouveau des allers-retours. La leçon opérationnelle tombe d'elle-même : **une connexion, ça se réutilise**.

### Contrôle de flux : la fenêtre glissante

Le récepteur a un tampon de taille finie. S'il est lent à consommer et que l'émetteur pousse trop vite, il déborde. TCP l'évite par la **fenêtre glissante** (*sliding window*) : dans chaque ACK, le récepteur annonce combien d'octets supplémentaires il est prêt à accepter (le champ *Window*). L'émetteur ne peut jamais avoir plus que cette fenêtre d'octets « en vol », non encore acquittés.

C'est un protocole producteur/consommateur à crédit — le même patron que la contre-pression d'une file bornée. Le récepteur régule l'émetteur en temps réel, sans négociation coûteuse : l'information de crédit voyage gratuitement dans les ACK qui circulent déjà.

### Débit, fenêtre et BDP : la loi qui surprend

Voici le résultat contre-intuitif que tout ingénieur bute un jour. Sur un lien à haute latence, **le débit n'est pas limité par la bande passante mais par la taille de la fenêtre.** La raison : l'émetteur envoie *une fenêtre pleine*, puis **doit attendre l'ACK** avant d'envoyer la suite. S'il vide sa fenêtre en moins d'une RTT, il reste bras croisés le reste du temps.

La quantité pivot est le **produit bande passante × délai** (*Bandwidth-Delay Product*, BDP) :

```
BDP = bande passante × RTT
100 Mbit/s × 100 ms = 10 Mbit = 1,25 Mo
```

Le BDP, c'est la quantité de données « qui tiennent dans le tuyau » — le volume en transit sur le câble à un instant donné. **Pour saturer le lien, la fenêtre doit être au moins égale au BDP.** Or le champ *Window* d'origine tient sur 16 bits : 65 535 octets maximum. Bien en deçà des 1,25 Mo de l'exemple. D'où le **window scaling** (RFC 1323), une option qui applique un facteur d'échelle au champ et débloque des fenêtres de plusieurs mégaoctets. Sans lui, une liaison transcontinentale à 100 Mbit/s plafonne à une fraction de sa capacité, quelle que soit la fibre.

C'est exactement le raisonnement « nombre d'accès en vol » d'un contrôleur mémoire : pour saturer une DRAM à forte latence, il faut assez de requêtes *outstanding* pour couvrir le temps d'aller-retour. Fenêtre trop petite = pipeline sous-alimenté.

### Contrôle de congestion : ne pas noyer le réseau

Le contrôle de flux protège le *récepteur*. Le **contrôle de congestion** protège le *réseau* — les routeurs intermédiaires, dont les files peuvent déborder. TCP maintient une seconde fenêtre, la *congestion window*, et l'ajuste à l'aveugle car il ne voit pas l'état des routeurs. Il procède par tâtonnement :

- **Slow start** : la fenêtre part petite et **double à chaque RTT**. Croissance exponentielle jusqu'au premier signe de saturation.
- **Congestion avoidance** : passé un seuil, la croissance devient linéaire (prudente).
- **Réaction à la perte** : une perte de paquet est interprétée comme un signal de congestion ; la fenêtre s'effondre, puis remonte.

L'algorithme par défaut, **CUBIC**, est *loss-based* : il attend la perte pour reculer. Cela marche bien à basse latence mais **sous-exploite les liens longs** (il recule trop, remonte trop lentement). L'alternative de Google, **BBR**, est *model-based* : au lieu d'attendre la perte, il *estime* la bande passante et la RTT réelles et vise le point optimal. Sur des liens longue distance ou à pertes (mobile, transcontinental), BBR peut multiplier le débit par 2 à 25. On l'active côté serveur en une ligne (`net.ipv4.tcp_congestion_control=bbr`), sans rien changer côté client — un des meilleurs rapports gain/effort du réseau.

### TCP Fast Open : grappiller la RTT du handshake

**TFO** permet, sur une connexion vers un serveur déjà connu, de **coller les données au SYN** grâce à un cookie obtenu lors d'une session précédente. On passe de 1,5 RTT avant données à 0,5. Gain réel mais conditionnel (support des deux bouts, cookie valide), à réserver aux cas où chaque RTT compte.

### La vraie optimisation : réutiliser la connexion

Rassemblons. Une requête « à froid » cumule DNS + TCP + TLS + traitement + transfert. Sur Tokyo↔Virginie, cela donne facilement 600 ms. Mais l'essentiel de ce coût est *fixe par connexion*, pas *par requête*. D'où la règle d'or :

```
Sans keep-alive (nouvelle connexion à chaque requête)
  req 1 : DNS+TCP+TLS+HTTP = 400 ms
  req 2 : DNS+TCP+TLS+HTTP = 400 ms
  req 3 : DNS+TCP+TLS+HTTP = 400 ms

Avec keep-alive (connexion réutilisée)
  req 1 : DNS+TCP+TLS+HTTP = 400 ms
  req 2 :               HTTP =  50 ms
  req 3 :               HTTP =  50 ms
```

Le **keep-alive** — maintenir la connexion TCP ouverte pour les requêtes suivantes — amortit le coût d'établissement sur des dizaines de requêtes. C'est pour cela que les serveurs applicatifs maintiennent un *pool* de connexions persistantes vers leurs bases et leurs backends, et que HTTP/2 (plus loin) fait tenir tout un site sur une seule connexion. Le simple fait de configurer un pool correct est souvent le plus gros gain de latence disponible.

---

## TLS : chiffrer sans payer trop de RTT

Chiffrer coûte des allers-retours, et on vient de voir que les RTT sont le nerf de la guerre. Toute l'évolution de TLS tient dans une phrase : **faire tomber le nombre de RTT du handshake.**

Situons d'abord le coût. Le handshake TLS s'exécute **par-dessus** la connexion TCP déjà établie. La RTT du *three-way handshake* TCP est donc toujours là ; TLS ajoute la sienne.

### TLS 1.2 : deux allers-retours

Dans un handshake **TLS 1.2** complet, client et serveur négocient d'abord la *cipher suite* (quels algorithmes), puis échangent le certificat et se mettent d'accord sur les clés de session avant de pouvoir chiffrer quoi que ce soit :

```
Client                                 Serveur
  │─ ClientHello ────────────────────────►│  (suites proposées, aléa)
  │◄─ ServerHello, Certificate, ──────────│  (suite choisie, cert, param. clé)
  │   ServerKeyExchange, Done
  │─ ClientKeyExchange, ─────────────────►│  (secret, bascule chiffrée)
  │   ChangeCipherSpec, Finished
  │◄─ ChangeCipherSpec, Finished ─────────│
  │═══ données applicatives chiffrées ═══►│
```

Comptez : **2 RTT** pour TLS 1.2. Ajoutés à la RTT de TCP, cela fait **3 RTT avant la première donnée applicative** — ~300 ms sur un lien à 100 ms.

### TLS 1.3 : un seul aller-retour

**TLS 1.3** a réduit et durci le protocole. Il abandonne les algorithmes faibles et, surtout, fait un **pari** : le client envoie dès son premier message (*ClientHello*) une proposition de matériel de clé (*key share*). Si le serveur accepte l'un des groupes proposés — le cas quasi général — les clés sont dérivées immédiatement, sans aller-retour de négociation supplémentaire :

```
Client                                 Serveur
  │─ ClientHello + key_share ────────────►│
  │◄─ ServerHello + key_share, ───────────│  (+ Certificate, Finished chiffrés)
  │═══ Finished + données chiffrées ═════►│
```

Résultat : **1 RTT** pour TLS 1.3. Avec TCP, **2 RTT avant données** au lieu de 3 — on économise ~100 ms par connexion à froid sur un lien long. Gratuit, il suffit d'activer 1.3.

### Reprise de session et 0-RTT

Mieux encore : quand un client se reconnecte à un serveur déjà visité, ils peuvent réutiliser un secret pré-partagé (*PSK*) issu de la session précédente. TLS 1.3 permet alors le **0-RTT** : le client **envoie ses données applicatives dès le premier paquet**, sans attendre. Le handshake cryptographique disparaît du chemin critique.

Le compromis est réel et il faut le connaître en tant qu'ex-sécurité : les données 0-RTT sont **rejouables**. Un attaquant qui capture le premier flight peut le renvoyer ; sans protection anti-rejeu, la même opération s'exécute deux fois. On réserve donc le 0-RTT aux requêtes **idempotentes** (un GET, typiquement), jamais à un virement bancaire.

C'est le motif récurrent de tout le chapitre : chaque RTT économisé se paie ailleurs — ici en surface d'attaque.

---

## DNS : l'annuaire, et sa mise en cache

Avant même TCP, le navigateur doit traduire `www.example.com` en adresse IP. Le **DNS** est cet annuaire distribué et hiérarchique. Sa hiérarchie se lit de droite à gauche depuis une racine implicite : `. → com → example.com`.

### La résolution récursive

Personne ne détient l'annuaire entier. La résolution descend l'arbre, un niveau à la fois :

```
1. Caches locaux (navigateur, OS) → si trouvé et TTL valide : fini.
2. Client → Résolveur récursif (celui du FAI, ou 8.8.8.8) : « www.example.com ? »
3. Résolveur → Serveur racine :          « où est .com ? »        → « voici le TLD .com »
4. Résolveur → Serveur TLD .com :        « où est example.com ? » → « voici son NS autoritaire »
5. Résolveur → Serveur autoritaire :     « www.example.com ? »    → « A : 93.184.216.34, TTL 3600 »
6. Résolveur → Client : « 93.184.216.34 » (et il met en cache pour la durée du TTL)
```

Une résolution à froid coûte **20–100 ms** ; en cache, **0–5 ms**. C'est un premier péage de latence, avant même d'avoir touché le serveur. On l'atténue par le cache (partout) et, côté page, par le *DNS prefetch*.

### Les types d'enregistrements utiles

- **A** / **AAAA** : nom → adresse IPv4 / IPv6.
- **CNAME** : alias d'un nom vers un autre (`www.example.com → example.com`). Change l'IP une fois, tout suit — mais ajoute une résolution, et interdit à la racine du domaine.
- **MX** : serveurs de messagerie (routage SMTP).
- **TXT** : texte libre, support de SPF/DKIM (authentification e-mail) et des vérifications de domaine.
- **NS** / **SOA** : serveurs autoritaires et métadonnées de la zone.

Les DNS managés (Route 53, Cloudflare) ajoutent des politiques de routage qui font du DNS un premier étage de répartition : **pondéré** (70/30 pour un déploiement progressif), **par latence** (l'utilisateur reçoit l'IP de la région la plus proche), **failover** (bascule sur secours si un *health check* échoue), **géolocalisé** (conformité, langue). Et un enregistrement **ALIAS**, propre au cloud, qui se comporte comme un CNAME mais sans requête DNS supplémentaire et utilisable à la racine du domaine.

### Le TTL : le curseur qui décide de tout

Chaque réponse porte un **TTL** (*time-to-live*) : combien de secondes les caches peuvent la conserver. C'est un arbitrage franc entre fraîcheur et coût :

- **TTL élevé** (24 h) : peu de requêtes, réponses rapides pour l'utilisateur, mais **propagation lente** — changer une IP prend jusqu'à 24 h.
- **TTL faible** (60 s) : mises à jour quasi immédiates, mais plus de requêtes et un poil plus de latence.

D'où la manœuvre standard avant une migration : **abaisser le TTL à 60–300 s quelques heures avant**, basculer l'IP, observer, puis remonter le TTL une fois stabilisé. Oublier la première étape, c'est se condamner à une bascule qui traîne un jour entier.

---

## HTTP : de 1.1 à HTTP/3, la chasse au blocage

HTTP est le langage applicatif du web. Son évolution est l'histoire d'un même défaut poursuivi de couche en couche : le **blocage de tête de file** (*head-of-line blocking*), où une requête lente en bloque d'autres qui n'ont rien à voir.

### HTTP/1.1 : une requête à la fois

Sur une connexion HTTP/1.1, les requêtes sont sérialisées : la réponse à la requête N doit revenir avant d'émettre la N+1. Une ressource lente bloque toute la file derrière elle. Les navigateurs contournaient en ouvrant 6 connexions en parallèle par domaine, et les développeurs en bricolant (*domain sharding*, concaténation de fichiers, sprites CSS) — autant de rustines contre une limite de conception.

### HTTP/2 : multiplexer sur une connexion

**HTTP/2** règle le problème *au niveau applicatif* avec le **multiplexage** : plusieurs requêtes et réponses circulent en parallèle, entrelacées, sur **une seule connexion TCP**. S'ajoutent la **compression des en-têtes** (HPACK, car les en-têtes HTTP sont très répétitifs d'une requête à l'autre), un **protocole binaire** (parsing plus rapide que le texte) et la priorisation des flux. Gain typique : 30–50 % sur le chargement d'une page, davantage sur une application riche en petites requêtes parallèles. Bénéfice induit : une seule connexion à ouvrir, donc un seul handshake TCP+TLS à payer.

Mais HTTP/2 déplace le problème sans l'éliminer. Les flux sont indépendants *au-dessus*, mais ils partagent **un seul flux TCP en dessous**. Or TCP garantit l'ordre : **si un paquet est perdu, TCP bloque la livraison de tout ce qui suit** — y compris les octets d'autres flux logiquement indépendants. Le *head-of-line blocking* a simplement migré de la couche application vers la couche transport. C'est du faux partage à l'état pur : deux flux sans rapport, sérialisés par une ressource commune en dessous d'eux.

### HTTP/3 et QUIC : changer de transport

**HTTP/3** tranche le nœud en abandonnant TCP pour **QUIC**, un transport bâti sur **UDP** qui réimplémente en espace utilisateur ce que TCP faisait dans le noyau — mais avec les flux comme citoyens de première classe. Chaque flux a son propre ordonnancement : **une perte sur un flux ne bloque plus les autres.** Le blocage de tête de file disparaît vraiment.

QUIC apporte trois autres gains :

- **Établissement fusionné** : QUIC intègre la cryptographie (TLS 1.3) dans sa poignée de main. Transport *et* chiffrement s'établissent en **1 RTT**, contre TCP (1 RTT) + TLS (1 RTT) séparés. Et **0-RTT** à la reprise.
- **Migration de connexion** : une connexion QUIC est identifiée par un *connection ID*, pas par le quadruplet IP/port. Passer du Wi-Fi à la 4G ne coupe donc pas la session — précieux en mobilité.
- **Meilleure résilience aux pertes**, d'où 2–3× de mieux que HTTP/2 sur des réseaux dégradés.

Le compromis : QUIC vit en espace utilisateur (plus de coût CPU que le TCP du noyau, longtemps moins optimisé), et transite par UDP, que certains pare-feu d'entreprise brident. En pratique, l'adoption est massive (YouTube, Cloudflare, CloudFront l'activent), avec repli automatique sur HTTP/2 si QUIC ne passe pas.

Le fil rouge est limpide : HTTP/1.1 bloquait à l'application, HTTP/2 a poussé le blocage vers TCP, HTTP/3 a changé de transport pour l'éliminer. À chaque étage, on a payé en complexité ce qu'on a gagné en parallélisme.

---

## Répartir la charge, sortir du réseau privé, rapprocher le contenu

Restent les briques d'architecture qui, ensemble, tiennent le trafic d'un service à l'échelle.

### Load balancing : L4 contre L7

Un seul serveur est un point de défaillance unique et un plafond de capacité. Un **répartiteur de charge** place N serveurs derrière une entrée unique : haute disponibilité (un serveur tombe, les autres encaissent), scalabilité horizontale (on ajoute des serveurs), déploiements sans coupure, terminaison TLS centralisée, et retrait automatique des serveurs malades via *health checks*. Ces sondes périodiques (par ex. `GET /health` toutes les 30 s, sain après 2 succès, retiré après 3 échecs) sont ce qui rend l'ensemble auto-cicatrisant.

Le choix structurant est la couche à laquelle il opère :

```
                    L4 (transport)          L7 (application)
Voit                IP + port               URL, en-têtes, cookies
Route selon         quintuplet TCP/UDP      chemin, hôte, en-tête
Débit               ultra-élevé (M req/s)   élevé
Latence ajoutée     sous la ms              quelques ms
Protocoles          TCP, UDP, TLS           HTTP, HTTPS, WebSocket
Cas d'usage         non-HTTP, débit brut    apps web, routage fin
```

Un **L4** (type NLB) ne lit pas le contenu : il hache le quintuplet (IP source, port source, IP dest, port dest, protocole) pour envoyer chaque *flux* toujours au même serveur, et le laisse passer. D'où sa vitesse (traitement minimal, latence sous la milliseconde), sa capacité à porter n'importe quel protocole TCP/UDP (MySQL, Redis, custom) et à exposer des **IP statiques** — utiles à whitelister dans un pare-feu client. Il préserve nativement l'IP réelle du client.

Un **L7** (type ALB, Nginx, HAProxy en mode HTTP) lit la requête HTTP et route sur son **contenu** : `/api/*` vers un groupe, `/images/*` vers un autre ; `api.example.com` vs `www.example.com` ; en-tête, *query string*. Il gère nativement WebSocket et HTTP/2, la terminaison TLS, les redirections, les groupes pondérés (déploiement *canary* 90/10). Il expose un nom DNS, pas une IP fixe. Le prix : quelques millisecondes de traitement en plus et un débit moindre qu'un L4.

Règle de décision : **L7 pour du HTTP applicatif** qui a besoin de routage fin ; **L4 pour du non-HTTP, du débit extrême ou une IP statique**. Sur la terminaison TLS, le schéma courant est *client —HTTPS→ LB —HTTP→ backends* : on décharge le chiffrement des serveurs et on centralise les certificats, au prix de ne plus chiffrer le dernier segment (acceptable dans un réseau privé, sinon on re-chiffre jusqu'au backend).

Quant aux **algorithmes** de répartition, l'essentiel tient en trois idées. Le **round robin** (chacun son tour) est simple et équitable mais ignore la charge réelle. Le **least connections** (vers le serveur le moins chargé) convient aux connexions longues (WebSocket, bases). Le **hachage d'IP / de flux** garantit qu'un même client retombe sur le même serveur — utile pour l'affinité de session, mais fragile quand on ajoute ou retire un serveur (la distribution se réarrange). L'**affinité de session** (*sticky sessions*, via cookie) force ce collage ; on l'évite dès qu'on peut en rendant l'application *stateless* et en externalisant la session (Redis, base) — un serveur redevient alors jetable, ce qui simplifie déploiements et montée en charge.

### NAT : partager une IP publique

Les adresses privées RFC 1918 ne sont pas routables sur Internet. Le **NAT** (*Network Address Translation*) fait le pont : une passerelle réécrit l'adresse (et le port) source des paquets sortants pour qu'ils portent son IP publique, mémorise la correspondance dans une table, et réécrit en sens inverse les réponses. Des milliers de machines privées partagent ainsi une poignée d'IP publiques — c'est ce qui a permis à IPv4 de tenir malgré ses 4,3 milliards d'adresses.

Dans le cloud, la **passerelle NAT** joue un rôle de sécurité : elle donne aux serveurs privés un accès **sortant** (télécharger des mises à jour, appeler une API, joindre un service managé) tout en **bloquant l'entrant**. La table de traduction est directionnelle : rien n'entre qui n'ait été initié de l'intérieur. C'est stateful par nature — la passerelle se souvient de chaque connexion, exactement comme un *security group* se souvient qu'il doit laisser revenir le trafic retour d'une requête qu'il a autorisée à sortir.

### CDN : rapprocher les octets de l'utilisateur

On revient au mur de départ : la vitesse de la lumière. Un utilisateur à Tokyo qui frappe un serveur en Virginie paie ~200 ms de RTT, connexion après connexion. Le **CDN** (*Content Delivery Network*) supprime la distance en **répliquant le contenu sur des serveurs *edge* proches des utilisateurs**.

```
Sans CDN : Tokyo ───────────► Origine (Virginie)   ~200 ms
Avec CDN : Tokyo ─► edge (Tokyo) ─( miss )─► Origine  10 ms si hit
```

Le mécanisme est un cache géographique :

1. Le DNS résout le domaine vers l'*edge* le plus proche.
2. **Cache hit** : l'edge sert depuis sa mémoire, ~10 ms, sans toucher l'origine.
3. **Cache miss** : l'edge va chercher à l'origine (~200 ms cette fois), met en cache pour la durée du TTL, puis sert. Les requêtes suivantes sont des hits.
4. À expiration, l'edge **revalide** (`If-Modified-Since` / `ETag`) : l'origine répond `304 Not Modified` si rien n'a changé, évitant un re-téléchargement.

Le contrôle passe par les en-têtes `Cache-Control` que renvoie l'origine (`max-age`, `no-cache`, `no-store`, `immutable`). On applique des politiques distinctes par chemin : cache long pour les assets statiques, aucun cache pour `/api/*` dynamique. Le vrai piège opérationnel est l'**invalidation** : après un déploiement, l'edge peut servir l'ancienne version. On peut purger explicitement (lent, parfois facturé), mais la bonne pratique est le **nom de fichier versionné** — `app.a3f2b1c.js` plutôt que `app.js`. Un contenu qui ne change jamais de nom peut être mis en cache *pour toujours* (`immutable`) ; changer de version, c'est changer l'URL référencée dans le HTML, donc une mise à jour instantanée et un rollback trivial. Les bundlers (Webpack, Vite) le font automatiquement par empreinte de hash.

### Le budget latence, vu d'ensemble

Tout ce chapitre se résume dans une addition. Voici une requête Tokyo→Virginie à froid, puis les mêmes octets une fois chaque levier actionné :

```
                À froid    Optimisé          Edge (Tokyo)
DNS               50 ms     10 ms (cache)      5 ms
TCP              150 ms      0 ms (keep-alive) 2 ms
TLS              200 ms      0 ms (reprise)    4 ms
Requête           50 ms     50 ms             1 ms
Traitement       100 ms     20 ms (cache)    20 ms
Réponse           50 ms     30 ms (compress.) 2 ms
──────────────────────────────────────────────────────
TOTAL            600 ms    110 ms            34 ms
```

Lisez cette table comme une feuille de route : le DNS s'amortit par le cache, TCP et TLS par la **réutilisation de connexion** et la reprise de session, le traitement par le cache applicatif (Redis), la réponse par la compression (gzip/brotli, 80 %+ de réduction), et le tout par le **rapprochement géographique** (CDN, multi-région) quand on se heurte à la physique. Chacun de ces gains a été détaillé plus haut ; ensemble, ils font passer une page de « lente » à « instantanée » sans changer une ligne de logique métier.

---

## À retenir

1. **La latence est gouvernée par la vitesse de la lumière, pas par le logiciel.** Le RTT est un plancher physique (~150 ms transcontinental). Toute l'ingénierie réseau consiste à l'amortir, le masquer ou le contourner — jamais à l'annuler.

2. **CIDR est un curseur binaire, pas une classe.** `/n` laisse `2^(32−n)` adresses ; `/24` = 256 (254 utilisables), `/16` = 65 536. Les plages privées RFC 1918 (`10/8`, `172.16/12`, `192.168/16`) se décrivent par préfixe — ne les confondez pas avec les vieilles classes (Class B = /16, Class C = /24).

3. **Le débit sur lien long est limité par la fenêtre, pas par la bande passante.** Il faut une fenêtre ≥ BDP (bande passante × RTT) pour saturer le tuyau — d'où le *window scaling*. Même logique que le nombre d'accès mémoire en vol.

4. **Une connexion, ça se réutilise.** Le coût DNS+TCP+TLS est fixe par connexion. Keep-alive, pools de connexions et HTTP/2 (une connexion multiplexée) transforment 400 ms en 50 ms sur les requêtes suivantes.

5. **TLS 1.3 vaut une RTT de moins que 1.2** (1 contre 2, sur TCP : 2 contre 3 avant données), et la reprise 0-RTT en gagne une autre — au prix d'une exposition au rejeu, donc requêtes idempotentes uniquement.

6. **Le blocage de tête de file a migré de couche en couche.** HTTP/1.1 le subissait à l'application, HTTP/2 l'a repoussé dans TCP (une perte bloque tous les flux), HTTP/3/QUIC l'élimine en changeant de transport (UDP, flux indépendants, handshake fusionné, migration de connexion).

7. **Choisissez la couche du load balancer selon le besoin :** L7 pour du routage HTTP fin, L4 pour du débit brut, du non-HTTP ou une IP statique. Et rendez l'application *stateless* pour que chaque serveur reste jetable.

---

## Pour aller plus loin

- **RFC de référence** : TCP (793, et 9293 qui la consolide), window scaling (7323), TLS 1.3 (8446), QUIC (9000) et HTTP/3 (9114), DNS (1034/1035), adresses privées (1918).
- **Ouvrages** : *TCP/IP Illustrated* (Stevens) pour la mécanique fine des protocoles ; *Computer Networks* (Tanenbaum) pour la vue d'ensemble ; *High Performance Browser Networking* (Grigorik) — le pont exact entre ces fondamentaux et la performance web, gratuit en ligne.
- **Outils à avoir dans les doigts** : `dig +trace` (résolution DNS pas à pas), `curl -w` (décomposition DNS/TCP/TLS/TTFB d'une requête), `mtr` (traceroute continu avec pertes), `ss` et `tcpdump`/Wireshark (état des sockets et capture de paquets). Un incident réseau se diagnostique de bas en haut ; ces outils sont les sondes de chaque couche.
- **Congestion** : lire le papier BBR de Google pour comprendre le passage d'un contrôle *loss-based* (CUBIC) à *model-based* — et pourquoi il change tout sur les liens longs.
