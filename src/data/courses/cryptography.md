===LESSON===
KEY: cryptography
TOPIC: cryptography
TITLE: Cryptographie
ICON: 🔐
INTRO: La cryptographie n'est pas une collection de formules magiques : c'est un ensemble d'outils précis, chacun résolvant un problème précis (confidentialité, intégrité, authenticité), et dont la sécurité repose sur des hypothèses mathématiques ET sur une utilisation correcte — car en pratique, ce ne sont presque jamais les algorithmes qui cassent, mais la façon dont on s'en sert.

---SECTION---
HEADING: Trois propriétés à ne jamais confondre
BODY:
Avant tout algorithme, il faut savoir **ce qu'on cherche à garantir**. La cryptographie appliquée tourne autour de trois propriétés distinctes que les débutants confondent constamment :

- **Confidentialité** : personne d'autre que le destinataire ne peut lire le message. C'est le rôle du *chiffrement*.
- **Intégrité** : le message n'a pas été modifié en transit. C'est le rôle des *fonctions de hachage* et des *MAC*.
- **Authenticité** : le message vient bien de qui il prétend venir. C'est le rôle des *MAC* et des *signatures numériques*.

Le piège classique : croire que « chiffré » signifie « sécurisé ». Un message chiffré sans protection d'intégrité peut être **modifié** par un attaquant sans être lu — et parfois cette modification suffit à casser tout le système. Aumasson insiste : chiffrer sans authentifier est l'erreur la plus répandue.

On distingue aussi deux grands mondes :

- **Symétrique** : une seule clé partagée, rapide, pour chiffrer/déchiffrer de gros volumes.
- **Asymétrique** : une paire de clés (publique/privée), lent, utilisé pour échanger des clés et signer.

En pratique, on combine les deux (**cryptographie hybride**) : l'asymétrique établit une clé de session, le symétrique fait le gros du travail. TLS fonctionne exactement ainsi.

---SECTION---
HEADING: Les fonctions de hachage : l'empreinte numérique
BODY:
Une **fonction de hachage** prend une entrée de taille quelconque et produit une sortie de taille fixe (le *digest* ou empreinte), par exemple 256 bits pour SHA-256. Propriétés attendues :

- **Déterministe** : même entrée → même sortie, toujours.
- **Rapide** à calculer.
- **Effet d'avalanche** : changer un seul bit d'entrée change ~50 % des bits de sortie.

Trois propriétés de sécurité, du plus faible au plus fort :

- **Résistance à la préimage** : étant donné un hash `h`, impossible de retrouver un `m` tel que `hash(m) = h`. (fonction à sens unique)
- **Résistance à la seconde préimage** : étant donné `m1`, impossible de trouver `m2 ≠ m1` avec le même hash.
- **Résistance aux collisions** : impossible de trouver *n'importe quelle* paire `(m1, m2)` avec le même hash.

La résistance aux collisions est la plus dure à garantir à cause du **paradoxe des anniversaires** : pour un hash de `n` bits, on trouve une collision en environ `2^(n/2)` essais, pas `2^n`. C'est pourquoi SHA-256 (256 bits) offre seulement **128 bits** de sécurité contre les collisions. C'est aussi pourquoi **MD5 (cassé) et SHA-1 (cassé en 2017)** sont interdits : on sait fabriquer des collisions.

Usages légitimes : vérification d'intégrité (checksums), identifiants de contenu (Git utilise le hash comme adresse), déduplication, structures comme les arbres de Merkle. **À ne PAS faire** : hacher un mot de passe avec SHA-256 seul (voir plus loin).

---SECTION---
HEADING: SHA-2, SHA-3 et le piège de l'extension de longueur
BODY:
**SHA-2** (SHA-256, SHA-512...) est la famille dominante aujourd'hui, solide et rapide. Elle repose sur la construction dite **Merkle-Damgård** : le message est découpé en blocs traités séquentiellement, chaque bloc mettant à jour un état interne.

Cette construction a un défaut subtil : l'**attaque par extension de longueur** (*length-extension*). Comme le hash final EST l'état interne, un attaquant qui connaît `hash(message)` et la longueur du message peut calculer `hash(message || données_ajoutées)` **sans connaître le message**. Cela casse la construction naïve `MAC = hash(clé_secrète || message)`.

**SHA-3** (Keccak, standardisé en 2015) utilise une construction totalement différente, l'**éponge** (*sponge*), qui n'est **pas** vulnérable à cette attaque. SHA-3 n'a pas remplacé SHA-2 — il sert d'alternative structurellement indépendante, une assurance au cas où SHA-2 serait un jour affaibli.

Points pratiques :

- Pour de l'intégrité simple, **SHA-256 suffit** et est largement supporté.
- **SHA-512** est souvent plus rapide sur les CPU 64 bits.
- **BLAKE2 / BLAKE3** sont d'excellentes alternatives modernes, très rapides et sans le défaut de length-extension.
- Ne construisez jamais un MAC vous-même avec `hash(clé || message)` sur SHA-2 : utilisez **HMAC**.

---SECTION---
HEADING: HMAC : authentifier avec une fonction de hachage
BODY:
Un **MAC** (Message Authentication Code) prouve à la fois l'**intégrité** et l'**authenticité** d'un message, à l'aide d'une **clé secrète partagée**. Contrairement à un simple hash (que n'importe qui peut recalculer), un MAC ne peut être produit ni vérifié que par ceux qui détiennent la clé.

**HMAC** est la façon standard et prouvée de construire un MAC à partir d'une fonction de hachage. Sa formule :

```
HMAC(K, m) = H( (K ⊕ opad) || H( (K ⊕ ipad) || m ) )
```

Le double hachage imbriqué avec deux constantes (`ipad`, `opad`) **neutralise l'attaque par extension de longueur** de Merkle-Damgård — c'est toute la raison de sa structure. On l'écrit `HMAC-SHA256`, `HMAC-SHA512`, etc.

Usages typiques :

- Authentifier des jetons/cookies de session (détecter la falsification).
- Signer des webhooks (le récepteur vérifie que l'appel vient bien du bon service).
- Dériver des clés (au sein de **HKDF**).

Règle d'or de vérification : **comparez les MAC en temps constant** (voir section sur les attaques temporelles). Une comparaison `==` naïve peut fuiter le MAC attendu octet par octet.

---SECTION---
HEADING: Hacher les mots de passe : lent, c'est le but
BODY:
Stocker les mots de passe des utilisateurs demande l'inverse d'une fonction de hachage classique : on veut que ce soit **LENT**. Pourquoi ? Parce que si votre base de données fuite, l'attaquant va tester des milliards de mots de passe candidats hors ligne. SHA-256 est si rapide qu'un GPU teste **des milliards** de candidats par seconde. Une fonction lente réduit cela à quelques milliers, rendant l'attaque impraticable.

**N'utilisez jamais** SHA-256, MD5 ou SHA-1 seuls pour un mot de passe. Utilisez une fonction dédiée au *password hashing* :

- **Argon2** (gagnant du Password Hashing Competition 2015) — **recommandé par défaut aujourd'hui**, variante `Argon2id`.
- **scrypt** — bon, gourmand en mémoire.
- **bcrypt** — ancien mais toujours acceptable, très éprouvé.
- **PBKDF2** — acceptable si contraint par des normes (FIPS), mais le moins résistant aux GPU.

Ces fonctions ont un **facteur de coût réglable** (nombre d'itérations, mémoire) : on l'augmente à mesure que le matériel s'améliore. C'est un paramètre vivant, pas figé.

```
# Pseudocode d'inscription
hash = argon2id(password, sel_aléatoire, coût_mémoire, coût_temps)
stocker(user, hash)   # le hash inclut sel + paramètres
```

---SECTION---
HEADING: Le sel et le poivre : contre les attaques précalculées
BODY:
Un **sel** (*salt*) est une valeur **aléatoire, unique par utilisateur**, ajoutée au mot de passe avant hachage. Il n'est **pas secret** — on le stocke à côté du hash. Son but :

- **Empêcher les rainbow tables** : des tables de hash précalculés pour des mots de passe courants. Avec un sel unique, l'attaquant ne peut pas réutiliser un précalcul.
- **Casser les doublons** : deux utilisateurs avec le même mot de passe auront des hash **différents**. Sans sel, une fuite révèle instantanément qui partage un mot de passe.

Le sel doit être **long (≥ 16 octets), aléatoire (CSPRNG), et régénéré à chaque changement de mot de passe**. Les bonnes bibliothèques Argon2/bcrypt génèrent et encodent le sel automatiquement dans la chaîne de sortie — vous n'avez rien à gérer manuellement.

Le **poivre** (*pepper*) est un secret **global**, identique pour tous, stocké séparément de la base (variable d'environnement, HSM). Si seule la base de données fuit — mais pas le poivre — les hash restent inattaquables. C'est une défense en profondeur optionnelle mais utile.

Résumé : **sel = unique + public + en base** ; **poivre = global + secret + hors base**.

---SECTION---
HEADING: Le chiffrement symétrique et AES
BODY:
Le **chiffrement symétrique** utilise **la même clé** pour chiffrer et déchiffrer. Il est rapide et adapté à de gros volumes. Le standard absolu est **AES** (Advanced Encryption Standard), avec des clés de 128, 192 ou 256 bits — AES-128 est déjà largement suffisant, AES-256 offre une marge supplémentaire.

AES est un **chiffrement par blocs** (*block cipher*) : il transforme un bloc de **exactement 128 bits (16 octets)** en un autre bloc de 128 bits, sous le contrôle de la clé. Mais un message fait rarement 16 octets pile. Deux questions se posent alors :

1. Comment enchaîner plusieurs blocs pour chiffrer un long message ? → C'est le **mode d'opération** (ECB, CBC, CTR, GCM...).
2. Comment gérer un dernier bloc incomplet ? → C'est le **padding** (ou on utilise un mode qui n'en a pas besoin, comme CTR/GCM).

Le point crucial que retiennent Ferguson, Schneier et Kohno : **le choix du mode compte autant que l'algorithme lui-même**. Un AES-256 mal employé (mode ECB) est catastrophiquement peu sûr. « AES » seul ne veut rien dire : il faut préciser **AES-256-GCM**, par exemple.

À noter : AES par bloc de 128 bits n'est pas concerné par l'attaque *Sweet32* qui vise les vieux chiffrements à blocs de 64 bits (3DES, Blowfish) — encore une raison d'éviter le legacy.

---SECTION---
HEADING: Pourquoi ECB est dangereux
BODY:
Le mode **ECB** (Electronic CodeBook) est la façon la plus naïve d'enchaîner les blocs : on chiffre chaque bloc **indépendamment** avec la même clé. Conséquence fatale :

> **Deux blocs de clair identiques produisent deux blocs de chiffré identiques.**

L'attaquant n'a même pas besoin de casser AES : il **voit les motifs** du message en clair à travers le chiffré. L'illustration devenue célèbre est l'« image du pingouin Tux » : chiffrée en ECB, on distingue encore parfaitement le pingouin, car les zones de couleur uniforme donnent des blocs répétés.

Cela fuit énormément d'information : structure d'un document, répétitions, champs identiques dans une base. Et ça permet des attaques actives (rejouer, réordonner, copier-coller des blocs).

**Règle : n'utilisez JAMAIS ECB pour chiffrer des données.** C'est l'exemple canonique d'un algorithme fort (AES) rendu inutile par un mode faible. La solution est un mode qui rend chaque bloc **dépendant de sa position et d'une valeur aléatoire** : c'est le rôle de l'IV / nonce dans les modes suivants.

---SECTION---
HEADING: IV, nonce et les modes CBC / CTR
BODY:
Pour que chiffrer deux fois le même message donne deux chiffrés **différents**, les modes introduisent une valeur variable par message :

- **IV** (Initialization Vector) : valeur d'initialisation, typiquement pour CBC.
- **Nonce** (*Number used ONCE*) : valeur qui ne doit **jamais** se répéter avec la même clé, typiquement pour CTR/GCM.

**Mode CBC** (Cipher Block Chaining) : chaque bloc de clair est XORé avec le chiffré du bloc précédent avant chiffrement ; le premier bloc utilise l'IV. L'IV doit être **imprévisible (aléatoire)**. CBC nécessite du padding, ce qui l'expose aux fameuses **attaques par oracle de padding** (comme *POODLE*) si l'intégrité n'est pas protégée.

**Mode CTR** (Counter) : transforme AES en chiffrement par flux. On chiffre un compteur (nonce || compteur croissant) pour produire un flux pseudo-aléatoire, XORé avec le clair. Avantages : pas de padding, parallélisable, accès aléatoire.

Points clés à retenir :

- L'IV/nonce n'est **pas secret** : on le transmet en clair avec le chiffré.
- L'IV/nonce ne doit **jamais être fixe/codé en dur**.
- CBC et CTR seuls ne fournissent **aucune intégrité** : un attaquant peut retourner des bits. Il faut y ajouter un MAC — ou mieux, utiliser directement un mode authentifié (GCM).

---SECTION---
HEADING: La catastrophe de la réutilisation d'IV / nonce
BODY:
La règle la plus impitoyable de la cryptographie symétrique moderne : **ne jamais réutiliser un nonce avec la même clé**. Voici pourquoi, mécaniquement.

En mode **CTR** (et GCM), le chiffré est `clair ⊕ flux(clé, nonce)`. Si on réutilise le même `(clé, nonce)` pour deux messages, le flux est identique. L'attaquant calcule alors :

```
C1 ⊕ C2 = (M1 ⊕ flux) ⊕ (M2 ⊕ flux) = M1 ⊕ M2
```

Le flux secret **s'annule** ! Il reste `M1 ⊕ M2`, le XOR des deux clairs, souvent suffisant pour tout reconstruire par analyse statistique. C'est exactement la faille qui a cassé le chiffrement WEP du WiFi.

Pour **GCM**, c'est encore pire : réutiliser un nonce ne fuite pas seulement les clairs, mais permet de **récupérer la clé d'authentification** et donc de **forger des messages valides**. Une seule répétition peut détruire toute la sécurité.

Stratégies sûres :

- **Nonce aléatoire** : sûr tant que la probabilité de collision reste négligeable — attention, un nonce de 96 bits impose de changer de clé bien avant 2³² messages.
- **Nonce compteur** : incrémenté strictement, sans jamais recommencer (attention aux redémarrages !).
- **Modes à nonce résistant** comme **AES-GCM-SIV** ou **XChaCha20** (nonce de 192 bits) quand on ne peut pas garantir l'unicité.

---SECTION---
HEADING: Le chiffrement authentifié (AEAD) : le bon défaut
BODY:
Le message principal de la cryptographie moderne — martelé par David Wong et Aumasson — est : **utilisez du chiffrement authentifié**, point de départ par défaut. Un mode **AEAD** (Authenticated Encryption with Associated Data) combine en une seule primitive :

- **Confidentialité** (chiffrement),
- **Intégrité + authenticité** (un tag d'authentification intégré).

Si un seul bit du chiffré est modifié, le déchiffrement **échoue** proprement (erreur) au lieu de rendre un clair corrompu. Fini le besoin de coller manuellement un MAC — et fini les erreurs de « comment combiner chiffrement et MAC ».

Les deux AEAD à connaître :

- **AES-GCM** : standard, accéléré matériellement (instructions AES-NI) sur les CPU modernes. Le choix par défaut côté serveur.
- **ChaCha20-Poly1305** : chiffrement par flux + MAC Poly1305. Excellent en logiciel pur (mobile, embarqué sans AES-NI), et à temps constant par conception. Sa variante **XChaCha20-Poly1305** accepte un grand nonce aléatoire, très pratique.

Le « **AD** » (*Associated Data*) permet d'**authentifier sans chiffrer** : en-têtes, numéro de version, métadonnées de routage qui doivent rester lisibles mais non falsifiables. Ils sont couverts par le tag mais transmis en clair.

Règle pratique : **choisissez AES-256-GCM ou ChaCha20-Poly1305**, gérez le nonce correctement, et vous avez éliminé la majorité des pièges du chiffrement symétrique.

---SECTION---
HEADING: Le chiffrement asymétrique : RSA et les courbes elliptiques
BODY:
La cryptographie **asymétrique** (ou à clé publique) résout un problème que le symétrique ne peut pas : communiquer en sécurité **sans avoir partagé de secret au préalable**. Chaque partie a une **paire de clés** :

- **Clé publique** : diffusée à tous. Sert à chiffrer (pour vous) ou à vérifier vos signatures.
- **Clé privée** : gardée secrète. Sert à déchiffrer ou à signer.

**RSA** repose sur la difficulté de **factoriser** un grand nombre (produit de deux grands premiers). Points essentiels :

- Les clés doivent faire **≥ 2048 bits** (3072 pour une marge long terme).
- **N'utilisez jamais RSA « brut »** : il faut un *padding* sûr — **OAEP** pour le chiffrement, **PSS** pour la signature. Le vieux padding **PKCS#1 v1.5** a mené à d'innombrables attaques (Bleichenbacher).
- RSA est **lent** et limité à chiffrer de petites données (typiquement une clé de session).

**ECC** (Elliptic Curve Cryptography) offre la **même sécurité avec des clés bien plus petites** : une clé de **256 bits** (courbe P-256 ou Curve25519) équivaut à ~3072 bits de RSA. Résultat : plus rapide, moins de bande passante. C'est le choix moderne par défaut. Courbes recommandées : **Curve25519** (échange, via X25519) et **Ed25519** (signatures), réputées pour éviter les pièges d'implémentation des courbes NIST.

La difficulté sous-jacente d'ECC est le **logarithme discret sur courbe elliptique**, considéré plus dur que la factorisation à taille de clé égale.

---SECTION---
HEADING: Échange de clés Diffie-Hellman et ECDH
BODY:
Comment deux personnes qui ne se sont jamais parlé peuvent-elles se mettre d'accord sur une clé secrète **en public**, sous les yeux d'un espion ? C'est le miracle de **Diffie-Hellman (DH)**.

Le principe, avec l'analogie des peintures :

1. Tous partagent une couleur publique de base.
2. Chacun ajoute sa couleur **secrète** et envoie le mélange (impossible de « dé-mélanger »).
3. Chacun ajoute à nouveau sa couleur secrète au mélange reçu.
4. Les deux obtiennent la **même couleur finale** — le secret partagé — que l'espion ne peut pas reconstituer.

Mathématiquement, DH repose sur le logarithme discret ; **ECDH** en est la variante sur courbes elliptiques (avec **X25519** comme implémentation vedette), plus rapide et à clés courtes.

Point **capital** : DH « brut » n'authentifie **personne**. Il est donc vulnérable à l'attaque de **l'homme du milieu (MITM)** : un attaquant fait un DH séparé avec chaque partie et relaie tout. DH doit **toujours** être combiné à une authentification (signatures, certificats) pour savoir *avec qui* on partage la clé. C'est précisément ce que fait le handshake TLS.

L'usage **éphémère** (DHE / ECDHE : une nouvelle paire jetable à chaque session) apporte la *forward secrecy*, abordée plus loin.

---SECTION---
HEADING: Signatures numériques : intégrité et non-répudiation
BODY:
Une **signature numérique** est l'analogue asymétrique du MAC, avec un avantage majeur : elle est **vérifiable publiquement**. Le mécanisme inverse le chiffrement asymétrique :

- On **signe avec la clé privée** (que seul le signataire possède).
- On **vérifie avec la clé publique** (que tout le monde possède).

En pratique, on ne signe pas le message entier mais son **hash** : `signature = Sign(clé_privée, hash(message))`. On combine donc hachage et asymétrique.

Ce qu'une signature garantit :

- **Authenticité** : le message vient bien du détenteur de la clé privée.
- **Intégrité** : le message n'a pas été modifié.
- **Non-répudiation** : le signataire ne peut pas nier avoir signé — propriété qu'un MAC **ne fournit pas**, car avec un MAC la clé est partagée (les deux parties peuvent produire le tag).

Algorithmes : **RSA-PSS**, **ECDSA** (sur courbes NIST), et **EdDSA / Ed25519** (moderne, rapide, résistant aux fautes d'implémentation).

Attention historique : **ECDSA exige un nonce aléatoire unique par signature**. Réutiliser ou rendre ce nonce prévisible **révèle la clé privée** — c'est la faille qui a compromis la console PS3 de Sony. Ed25519 génère ce nonce de façon déterministe et sûre, éliminant le problème.

---SECTION---
HEADING: PKI, certificats et confiance
BODY:
Diffie-Hellman et les signatures règlent le *comment*, mais laissent une question béante : **à qui appartient réellement cette clé publique ?** Rien n'empêche un attaquant de publier une clé en prétendant être votre banque. C'est le problème que résout la **PKI** (Public Key Infrastructure).

Un **certificat numérique** (format **X.509**) est un document qui lie une **identité** (`www.mabanque.fr`) à une **clé publique**, le tout **signé** par une **autorité de certification** (**CA**) en qui les navigateurs font déjà confiance. La chaîne de confiance :

```
CA racine (dans le magasin du système/navigateur)
   └─ signe → CA intermédiaire
                 └─ signe → certificat du site (mabanque.fr)
```

Votre navigateur vérifie la signature de chaque maillon jusqu'à une racine de confiance. Si tout concorde et que le nom de domaine correspond, le cadenas s'affiche.

Éléments essentiels :

- Un certificat a une **date d'expiration** et peut être **révoqué** (via CRL ou **OCSP**) s'il est compromis.
- **Let's Encrypt** fournit des certificats gratuits et automatisés (protocole ACME), généralisant HTTPS.
- La **transparence des certificats** (*Certificate Transparency*) : des journaux publics où toute émission est enregistrée, permettant de détecter une CA malveillante ou piratée.

La PKI est le maillon *humain/organisationnel* : sa sécurité dépend autant de la rigueur des CA que des mathématiques.

---SECTION---
HEADING: Le handshake TLS : tout assembler
BODY:
**TLS** (successeur de SSL) protège HTTPS et assemble **toutes** les briques précédentes. C'est l'exemple parfait de cryptographie hybride bien conçue. Voici le handshake **TLS 1.3** (la version moderne, plus rapide et plus sûre) :

1. **ClientHello** : le client annonce les suites cryptographiques qu'il supporte et envoie sa **part ECDHE** (clé publique éphémère).
2. **ServerHello** : le serveur choisit les paramètres, envoie sa **part ECDHE** et son **certificat**.
3. **Authentification** : le client vérifie le certificat via la **PKI** (chaîne jusqu'à une CA de confiance) et vérifie la **signature** du serveur.
4. **Dérivation de clés** : les deux côtés combinent leurs parts ECDHE pour obtenir un secret partagé, passé dans un **KDF (HKDF)** pour dériver les clés de session.
5. **Communication chiffrée** : tout le trafic est ensuite protégé par un **AEAD** (AES-GCM ou ChaCha20-Poly1305).

Chaque brique joue son rôle : **ECDHE** pour l'échange de clé, **certificat + signature** pour l'authentification (contre le MITM), **HKDF** pour dériver les clés, **AEAD** pour la confidentialité et l'intégrité des données.

TLS 1.3 a **supprimé** les options dangereuses du passé : plus de RSA pour l'échange de clé (pour garantir la forward secrecy), plus de CBC, plus de RC4, plus de renégociation risquée. Le handshake se fait en **1 aller-retour** (1-RTT), rendant HTTPS quasi gratuit en latence.

---SECTION---
HEADING: L'aléa, le CSPRNG et les générateurs prévisibles
BODY:
Presque toute la cryptographie repose sur une ressource invisible : **des nombres vraiment imprévisibles**. Clés, IV, nonces, sels, nonces de signature — tout vient d'un générateur d'aléa. Si cet aléa est **prévisible**, la meilleure crypto du monde s'effondre.

Distinction cruciale :

- **PRNG classique** (`rand()`, `Math.random()`, `Mersenne Twister`) : conçu pour la **simulation**, statistiquement uniforme mais **totalement prévisible**. En observant quelques sorties, on reconstruit l'état interne et on prédit toutes les suivantes. **Jamais pour la crypto.**
- **CSPRNG** (Cryptographically Secure PRNG) : conçu pour résister à la prédiction, même en connaissant des sorties passées.

**Utilisez toujours** la source du système d'exploitation, qui collecte de l'entropie physique :

- Linux/macOS : `/dev/urandom`, appel `getrandom()`.
- Windows : `BCryptGenRandom`.
- Bibliothèques : `secrets` en Python (**pas** `random`), `crypto.randomBytes` en Node, `crypto/rand` en Go, `SecureRandom` en Java.

Exemples de désastres réels : la faille **Debian OpenSSL (2008)** où un bug réduisit l'entropie à ~32 768 clés possibles ; des portefeuilles Bitcoin vidés à cause de générateurs faibles sur Android. Retenez : **`secrets.token_bytes(32)` oui, `random.random()` jamais** pour quoi que ce soit de sensible.

---SECTION---
HEADING: Forward secrecy et gestion des clés
BODY:
### Forward secrecy (confidentialité persistante)

Imaginez qu'un attaquant **enregistre aujourd'hui** tout votre trafic chiffré, et vole votre clé privée **dans deux ans**. Peut-il déchiffrer l'ancien trafic ? Avec l'ancien TLS (échange de clé via RSA), **oui** : la clé privée du serveur déchiffrait tout, rétroactivement.

La **forward secrecy** (ou *perfect forward secrecy*) empêche cela. Grâce à un échange **ECDHE éphémère**, chaque session utilise une paire de clés **jetable, détruite après usage**. Compromettre la clé long terme du serveur ne donne **aucune** prise sur les sessions passées. C'est pourquoi TLS 1.3 **impose** l'échange éphémère. C'est une propriété défensive majeure contre la surveillance de masse (« récolter maintenant, déchiffrer plus tard »).

### Gestion des clés

La partie la plus négligée, et souvent le vrai maillon faible. Principes :

- **Une clé = un usage** : ne réutilisez pas une même clé pour chiffrer ET signer, ou entre deux systèmes.
- **Rotation** : changez les clés périodiquement pour limiter l'impact d'une fuite.
- **Stockage** : jamais dans le code ni un dépôt Git. Utilisez un **gestionnaire de secrets** (Vault, AWS KMS, un **HSM** pour les cas critiques).
- **Dérivation** : à partir d'un secret maître, dérivez des sous-clés avec un **KDF** (HKDF) plutôt que de multiplier les secrets indépendants.
- **Moindre privilège** : limitez qui/quoi peut accéder à chaque clé.

Ferguson et Schneier le disent sans détour : concevoir les algorithmes est le problème le plus *facile* ; **gérer les clés sur toute leur durée de vie** est le vrai défi opérationnel.

---SECTION---
HEADING: Les attaques temporelles et la comparaison en temps constant
BODY:
Un algorithme peut être mathématiquement parfait et fuiter ses secrets par un **canal auxiliaire** (*side channel*) : le **temps** d'exécution, la consommation électrique, le cache CPU. La plus accessible aux développeurs est l'**attaque temporelle**.

Le cas d'école : comparer un MAC ou un jeton avec l'opérateur `==`. La plupart des comparaisons de chaînes **s'arrêtent au premier octet différent**. L'attaquant mesure le temps de réponse : plus il devine d'octets corrects au début, plus la réponse est lente. Octet par octet, il **reconstruit le secret** sans jamais le connaître.

La parade est la **comparaison en temps constant** : on compare **tous** les octets quelle que soit l'issue, en accumulant les différences.

```python
# DANGEREUX — s'arrête au premier écart
if mac_recu == mac_attendu: ...

# SÛR — temps constant, fourni par la lib standard
import hmac
if hmac.compare_digest(mac_recu, mac_attendu): ...
```

Utilisez les fonctions dédiées : `hmac.compare_digest` (Python), `crypto.timingSafeEqual` (Node), `subtle.ConstantTimeCompare` (Go). Plus généralement, la bonne réponse à ces canaux auxiliaires est de **s'appuyer sur des bibliothèques éprouvées** conçues à temps constant (comme ChaCha20-Poly1305), plutôt que de réimplémenter des primitives soi-même.

---SECTION---
HEADING: Le musée des erreurs classiques
BODY:
Récapitulons les fautes qui reviennent sans cesse — les connaître, c'est déjà éviter 90 % des vulnérabilités crypto. Chacune est documentée dans les trois ouvrages de référence.

- **Inventer sa propre crypto.** La règle numéro un. Un algorithme « maison » n'a pas subi des années de cryptanalyse publique. Utilisez des primitives standard et des bibliothèques éprouvées (**libsodium**, la lib crypto de votre plateforme). « Don't roll your own crypto. »
- **Utiliser ECB.** Fuit les motifs du clair (le pingouin Tux). Toujours un AEAD à la place.
- **Réutiliser un IV/nonce** avec la même clé. Casse CTR/GCM instantanément (WEP, forge de messages).
- **Chiffrer sans authentifier** (pas de MAC/AEAD). Permet la modification du chiffré, les oracles de padding. Préférez un AEAD.
- **MAC-then-Encrypt** ou autres combinaisons maladroites. L'ordre sûr est **Encrypt-then-MAC**, mais le vrai conseil est : **n'assemblez pas vous-même, utilisez un AEAD**.
- **Comparaison non constante** de secrets (`==`). Fuite temporelle → usez de `compare_digest`.
- **Hacher un mot de passe avec SHA-256**. Trop rapide. Utilisez Argon2/bcrypt/scrypt avec sel.
- **Clé ou secret codé en dur** dans le source ou committé dans Git. Une fois dans l'historique, considérez-le fuité. Secrets managers.
- **RSA sans padding sûr** ou avec PKCS#1 v1.5. Utilisez OAEP/PSS.
- **Aléa non cryptographique** (`Math.random`, `rand()`) pour des clés/tokens. Toujours un CSPRNG.
- **Ignorer les mises à jour** : algorithmes obsolètes (MD5, SHA-1, DES, RC4, TLS 1.0/1.1) qu'il faut retirer.

Le fil conducteur des trois livres : **la crypto échoue rarement par les maths, presque toujours par l'usage.** Choisissez des primitives modernes, laissez les bibliothèques éprouvées faire le travail délicat, et défiez-vous de toute construction « astucieuse » que vous auriez inventée.

===END===
