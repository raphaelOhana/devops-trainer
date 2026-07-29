===LESSON===
KEY: security
TOPIC: security
TITLE: Cryptographie appliquée & authentification
ICON: 🔒
INTRO: La cryptographie « ne se casse pas, elle se contourne ». La quasi-totalité des failles crypto en revue de code ne viennent pas d'un algorithme cassé mais d'un mauvais usage : mauvais mode, IV réutilisé, comparaison naïve, secret prévisible, vérification oubliée. Cette leçon relie chaque primitive (hachage, chiffrement, signature) à son échec réel côté application, puis remonte vers l'authentification moderne (JWT, OAuth, SAML, TLS). Règle d'or transverse issue de l'OWASP Code Review Guide : **ne réinventez jamais une primitive** — utilisez une bibliothèque éprouvée, avec les bons paramètres, et vérifiez ce que vous croyez vérifier.
---SECTION---
HEADING: Hachage de mots de passe : MD5/SHA sont un piège
BODY:
Un mot de passe ne doit **jamais** être haché avec une fonction rapide (MD5, SHA-1, SHA-256). Ces fonctions sont conçues pour être véloces : un GPU calcule des milliards de SHA-256/s, donc une base volée se craque par force brute et tables arc-en-ciel.

Il faut une **fonction de dérivation de clé lente et paramétrable** :

- **bcrypt** : éprouvé, coût logarithmique (`cost` 12+). Limite : ignore les octets après ~72.
- **scrypt** : lent **et** gourmand en mémoire (résiste aux ASIC/GPU).
- **argon2id** : recommandation actuelle (OWASP). Variante `id` = résistance side-channel + GPU. Paramètres typiques : `m=19456` (19 MiB), `t=2`, `p=1`.

Concepts clés :

- **Sel (salt)** : valeur aléatoire **unique par utilisateur**, stockée en clair à côté du hash. Empêche les tables arc-en-ciel et le fait que deux utilisateurs avec le même mot de passe aient le même hash. bcrypt/argon2 le génèrent et l'encodent automatiquement dans la chaîne de sortie.
- **Poivre (pepper)** : secret **global**, non stocké en base mais dans la config/HSM. Ajouté avant hachage (ou via HMAC), il rend une base volée inexploitable sans le second secret. Complément du sel, pas un remplacement.

```
# À bannir
sha256(password)                      # rapide, pas de sel
md5(password + salt)                  # cassé + rapide

# Correct
argon2id(password, salt, m=19MiB, t=2, p=1)
```

**Remédiation :** utilisez argon2id (ou bcrypt cost≥12 / scrypt) via une lib maintenue ; sel unique automatique ; poivre applicatif dans un secret store ; ré-hachez à la volée lors du login quand vous augmentez le coût.
---SECTION---
HEADING: Chiffrement symétrique et modes : le pingouin ECB
BODY:
Choisir AES ne suffit pas : le **mode opératoire** décide de la sécurité réelle.

- **ECB (Electronic Codebook)** : chaque bloc chiffré indépendamment. Deux blocs de clair identiques → deux blocs chiffrés identiques. Résultat célèbre : le « pingouin ECB » (Tux) reste reconnaissable après chiffrement d'une image. **Jamais** utiliser ECB.
- **CBC (Cipher Block Chaining)** : chaque bloc est XORé avec le précédent, amorcé par un **IV** aléatoire. Masque les motifs, mais **ne garantit pas l'intégrité** → vulnérable au padding oracle et au bit-flipping si non authentifié.
- **GCM / AEAD (Authenticated Encryption with Associated Data)** : chiffre **et** authentifie (tag d'intégrité). AES-GCM, ChaCha20-Poly1305. Détecte toute altération du ciphertext avant déchiffrement. C'est le standard moderne.

L'AEAD permet aussi d'authentifier des **données associées** non chiffrées (ex. en-têtes, ID de version) : elles ne sont pas secrètes mais leur intégrité est garantie.

```
# Mauvais
AES-ECB(data)                         # motifs visibles
AES-CBC(data, iv) sans MAC            # malléable

# Bon
AES-256-GCM(key, nonce, plaintext, aad)  -> ciphertext + tag
ChaCha20-Poly1305(...)                    # idéal sans AES matériel
```

**Remédiation :** utilisez systématiquement un mode AEAD (AES-GCM ou ChaCha20-Poly1305) ; bannissez ECB ; si CBC est imposé par du legacy, ajoutez un HMAC en **Encrypt-then-MAC** et vérifiez le MAC avant tout déchiffrement.
---SECTION---
HEADING: IV et nonce : l'unicité avant tout
BODY:
Un **IV** (Initialization Vector) ou **nonce** (number used once) rend le chiffrement non déterministe : le même clair, chiffré deux fois, doit donner deux ciphertexts différents. Les erreurs classiques :

- **IV constant / à zéro** : réintroduit les faiblesses d'ECB (motifs, corrélations entre messages).
- **Réutilisation de nonce en GCM** : catastrophique. Deux messages sous la même clé et le même nonce permettent de récupérer le **hash key** d'authentification (attaque « forbidden attack »), donc de **forger des tags** valides. La confidentialité du keystream tombe aussi (XOR des deux clairs).
- **IV prévisible en CBC** : historiquement la faille **BEAST** sur TLS 1.0 (IV = dernier bloc du message précédent).

Règles :

- CBC : IV **aléatoire** (CSPRNG), transmis en clair avec le ciphertext.
- GCM : nonce de 96 bits **unique par clé**. Aléatoire acceptable si volume modéré ; au-delà de ~2³² messages, préférez un compteur déterministe ou renouvelez la clé.

**Remédiation :** générez chaque IV/nonce via un CSPRNG (ou un compteur strictement croissant par clé pour GCM) ; ne réutilisez jamais un couple (clé, nonce) ; effectuez une rotation de clé avant d'épuiser l'espace des nonces.
---SECTION---
HEADING: Padding oracle : quand une erreur trahit le clair
BODY:
En CBC avec padding **PKCS#7**, le déchiffrement vérifie que le padding est valide. Si l'application révèle — par un message d'erreur, un code HTTP différent, ou un **temps de réponse** distinct — que le padding est invalide, l'attaquant dispose d'un **oracle**.

En manipulant le bloc IV/précédent octet par octet et en observant l'oracle, il déchiffre **tout le message sans connaître la clé**, à raison d'environ 128 requêtes par octet. C'est l'attaque qui a brisé de nombreux systèmes ; sur TLS, **POODLE** exploite ce principe (padding SSLv3 non déterministe).

```
# Réponses distinctes = oracle
200 OK              -> padding valide
500 "bad padding"   -> padding invalide   <-- fuite
```

La cause profonde : **MAC-then-Encrypt ou pas de MAC du tout**. Avec un AEAD, la vérification du tag échoue en temps constant **avant** toute logique de padding, supprimant l'oracle.

**Remédiation :** passez à un mode AEAD (GCM) ; si CBC persiste, faites **Encrypt-then-MAC** et vérifiez le MAC en temps constant avant de déchiffrer ; renvoyez une **erreur générique unique** (même message, même code, même timing) quelle que soit la cause d'échec.
---SECTION---
HEADING: Comparaison à temps constant : la fuite par le chrono
BODY:
Comparer deux secrets (tag HMAC, token, mot de passe haché, clé d'API) avec `==` ou `strcmp` est dangereux : ces comparaisons **s'arrêtent au premier octet différent**. Le temps de réponse dépend donc du nombre d'octets corrects en tête, et un attaquant peut reconstruire le secret octet par octet — c'est une **timing attack**.

```
# Vulnérable : court-circuit au premier octet faux
if user_tag == expected_tag: ...

# Sûr : parcourt toujours toute la longueur
hmac.compare_digest(user_tag, expected_tag)   # Python
crypto.timingSafeEqual(a, b)                   # Node.js
```

En pratique le bruit réseau masque souvent ces micro-écarts, mais l'attaque est réelle en local, en co-tenant cloud, ou via amplification statistique (Timeless timing attacks via HTTP/2). Ne pariez pas sur le bruit.

**Remédiation :** comparez tout secret/MAC avec une fonction **constant-time** dédiée (`compare_digest`, `timingSafeEqual`, `hash_equals` en PHP) ; comparez d'abord des longueurs fixes (idéalement des hashs des deux valeurs) pour ne pas fuiter la longueur.
---SECTION---
HEADING: Length extension attack : HMAC, pas hash(secret‖msg)
BODY:
Une erreur fréquente pour « signer » un message : `MAC = SHA256(secret ‖ message)`. Les fonctions de type **Merkle–Damgård** (MD5, SHA-1, SHA-256, SHA-512) sont vulnérables à la **length extension** : connaissant `H(secret ‖ msg)` et la **longueur** du secret (mais pas le secret lui-même), un attaquant calcule `H(secret ‖ msg ‖ padding ‖ extension)` valide.

Concrètement, un paramètre signé `user=guest` peut être étendu en `user=guest&admin=true` avec un MAC valide, sans connaître le secret. C'est l'attaque classique sur les cookies « maison ».

```
# Vulnérable
mac = sha256(secret + message)

# Sûr : HMAC neutralise la length extension
mac = hmac_sha256(secret, message)
```

HMAC casse la structure exploitable. Les fonctions **SHA-3/Keccak** et **BLAKE2/3** ne sont pas Merkle–Damgård et n'ont pas cette faiblesse, mais HMAC reste le standard interopérable.

**Remédiation :** n'utilisez **jamais** `hash(secret‖msg)` comme MAC ; utilisez HMAC (ou un AEAD, ou Ed25519 pour des signatures) via une lib éprouvée.
---SECTION---
HEADING: PRNG cryptographique vs Math.random / rand
BODY:
Les générateurs « classiques » (`Math.random()`, `rand()`, `java.util.Random`, `mt_rand`) sont des **PRNG non cryptographiques** : rapides, mais **prévisibles**. Ils reposent souvent sur un Mersenne Twister ou un LCG dont l'état interne se reconstruit à partir de quelques sorties observées → toutes les valeurs futures (et passées) deviennent calculables.

Impact réel : tokens de reset de mot de passe devinables, identifiants de session prédictibles, coupons, nonces, mots de passe temporaires. C'est une source récurrente de compromission de comptes.

```
# Non cryptographique — INTERDIT pour tout secret
Math.random()            # JS
rand() / mt_rand()       # C / PHP

# CSPRNG
crypto.randomBytes(32)                 # Node.js
crypto.getRandomValues(new Uint8Array(32))  # navigateur
secrets.token_urlsafe(32)              # Python
java.security.SecureRandom             # Java
```

Attention aussi au **seed** : `srand(time(NULL))` rend un CSPRNG lui-même prévisible.

**Remédiation :** tout ce qui doit être imprévisible (tokens, sessions, IV, mots de passe temporaires, clés) doit provenir d'un **CSPRNG** de l'OS ; réservez `Math.random`/`rand` au non-sécuritaire.
---SECTION---
HEADING: JWT : decode n'est pas verify
BODY:
Un JWT = `base64url(header).base64url(payload).base64url(signature)`. Le payload est **encodé, pas chiffré** : lisible par tous. Les failles côté serveur sont nombreuses et classiques (HackTricks) :

- **`alg: none`** : le token prétend n'avoir aucune signature. Une lib laxiste l'accepte → forge totale du payload.
- **Confusion RS256 → HS256** : le serveur attend RS256 (asymétrique). L'attaquant change `alg` en HS256 (symétrique) et signe avec la **clé publique** (connue) comme secret HMAC. Si la lib choisit l'algo d'après le header, la signature est validée.
- **`kid` / `jku` / `x5u`** : `kid` peut être vecteur d'**injection SQL** ou de **path traversal** (pointer vers `/dev/null` → secret vide) ; `jku`/`x5u` peuvent pointer vers une **URL attaquant** fournissant sa propre clé (SSRF/clé contrôlée).
- **Secret HMAC faible** : `secret`, `password`… se cassent hors ligne (hashcat).
- **`decode` vs `verify`** : `jwt.decode()` **ne vérifie pas** la signature. Beaucoup de code lit les claims après un simple decode.

```
# DANGER : lit le payload sans vérifier la signature
claims = jwt.decode(token, verify=False)

# Correct : algo imposé + clé + exp/aud/iss
claims = jwt.verify(token, key, algorithms=["RS256"],
                    audience=AUD, issuer=ISS)
```

**Remédiation :** imposez une **liste blanche d'algorithmes** (jamais tirée du header) ; rejetez `alg:none` ; secret HMAC à haute entropie ou clés asymétriques ; validez `kid`/`jku` contre une allow-list ; vérifiez toujours `exp`, `nbf`, `aud`, `iss` ; n'utilisez jamais `decode` sans `verify`.
---SECTION---
HEADING: OAuth 2.0 / OIDC : redirect_uri, state, PKCE
BODY:
OAuth 2.0 délègue l'**autorisation** ; OIDC ajoute l'**authentification** (ID token). Trois points cassent le plus souvent :

- **`redirect_uri`** : le serveur d'autorisation doit faire une correspondance **exacte** avec une URI pré-enregistrée. Un match laxiste (préfixe, wildcard, `redirect_uri` ouvert) permet de **détourner le code/token** vers un domaine attaquant.
- **`state`** : valeur aléatoire liée à la session, renvoyée telle quelle. Son absence ou sa non-vérification = **CSRF sur le login** (l'attaquant injecte son propre code d'autorisation → account fixation).
- **PKCE (Proof Key for Code Exchange)** : le client génère un `code_verifier` aléatoire, envoie `code_challenge = SHA256(verifier)`. À l'échange, il prouve la possession du verifier. Empêche l'**interception du code** (indispensable pour SPA/mobile, recommandé partout).

```
code_verifier  = base64url(csprng(32))
code_challenge = base64url(sha256(code_verifier))
```

Autres pièges : préférer le **flow code + PKCE** (pas l'implicit flow, déprécié) ; valider `aud`/`iss`/`nonce` de l'ID token.

**Remédiation :** match **exact** de `redirect_uri` ; `state` obligatoire et vérifié ; **PKCE S256** systématique ; Authorization Code Flow uniquement ; validez signature, `iss`, `aud`, `exp`, `nonce` de l'ID token.
---SECTION---
HEADING: SAML : signature wrapping (XSW)
BODY:
SAML transporte des assertions d'identité en **XML signé**. La faille structurelle est le **XML Signature Wrapping (XSW)** : la signature protège un élément identifié par un `ID`, mais le code applicatif lit **un autre élément** que celui vérifié.

L'attaquant garde l'assertion signée légitime (pour que la vérif passe) et **injecte une seconde assertion** non signée (ou déplace la signée) de sorte que le parseur de vérification valide l'une pendant que la logique métier consomme l'autre — contenant `admin=true` ou un autre utilisateur.

Facteurs aggravants : deux passes de parsing distinctes (vérif vs lecture), résolution d'`ID` ambiguë, transformations XML permissives, absence de canonicalisation stricte, XXE.

**Remédiation :** vérifiez que l'élément **signé est exactement celui consommé** (même référence, une seule fois) ; utilisez une bibliothèque SAML éprouvée et à jour ; désactivez la résolution d'entités externes (anti-XXE) ; imposez schéma strict, un seul `Assertion` attendu, et validez `Conditions`/`Audience`/`NotOnOrAfter`.
---SECTION---
HEADING: TLS / PKI : handshake, forward secrecy, downgrade
BODY:
TLS assure confidentialité, intégrité et **authentification du serveur** via un certificat X.509 (chaîne jusqu'à une CA de confiance).

- **Handshake (TLS 1.3)** : négociation en 1-RTT, échange **(EC)DHE** éphémère, dérivation des clés de session. TLS 1.3 supprime les suites faibles (RSA key exchange, CBC, RC4, compression).
- **Forward secrecy (PFS)** : grâce aux clés éphémères (ECDHE), compromettre la clé privée du serveur plus tard **ne déchiffre pas** les sessions passées capturées.
- **SNI / ECH** : le SNI révèle en clair le hostname visé (fuite de métadonnées). **ECH (Encrypted Client Hello)** chiffre le ClientHello, dont le SNI.
- **Downgrade** : un attaquant MITM tente de forcer une version/suite plus faible (ex. **FREAK**, **Logjam**, POODLE). TLS 1.3 intègre une protection anti-downgrade.
- **HSTS** : l'en-tête `Strict-Transport-Security` force le navigateur en HTTPS et bloque le stripping SSL.

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

**Remédiation :** TLS 1.2+ (idéalement 1.3), suites AEAD avec ECDHE (PFS) ; désactivez SSLv3/TLS 1.0/1.1, RC4, export ; activez HSTS (preload) ; validez correctement la chaîne (pas de `verify=false`).
---SECTION---
HEADING: Gestion des secrets : Vault, secret zéro, rotation
BODY:
Les secrets (clés, mots de passe DB, tokens API) **ne doivent pas** vivre en dur dans le code, un `.env` commité, une image Docker ou un log. Le git history garde tout : un secret commité est un secret **compromis**, même après suppression.

Un gestionnaire de secrets (HashiCorp **Vault**, AWS Secrets Manager, GCP Secret Manager) apporte : stockage chiffré, contrôle d'accès fin, **audit**, secrets **dynamiques** (identifiants DB générés à la demande et à courte durée), et rotation.

- **Secret zéro (secret zero)** : le problème du « premier secret » — comment l'appli s'authentifie-t-elle auprès du coffre sans un secret pré-partagé ? Réponse : **identité de la plateforme** (IAM role, Kubernetes ServiceAccount, SPIFFE/SPIRE, cloud metadata) plutôt qu'un token statique.
- **Rotation** : changer régulièrement les secrets limite la fenêtre d'exploitation d'une fuite ; les secrets dynamiques rendent la rotation quasi automatique.

**Remédiation :** externalisez tous les secrets vers un coffre ; injectez-les à l'exécution (jamais dans l'image/le repo) ; résolvez le secret zéro via l'identité de plateforme ; automatisez la **rotation** ; scannez le repo (gitleaks/trufflehog) et **révoquez** tout secret exposé.
---SECTION---
HEADING: Stockage de tokens : localStorage vs cookie HttpOnly
BODY:
Où stocker un token de session/JWT côté navigateur ? Le compromis oppose surtout **XSS** et **CSRF** :

- **localStorage / sessionStorage** : accessible en JavaScript → **toute XSS exfiltre le token** instantanément. Pas de protection intégrée.
- **Cookie `HttpOnly`** : inaccessible au JS → une XSS ne peut pas **lire** le token. En contrepartie, le cookie part automatiquement avec chaque requête → exposé au **CSRF**, à contrer par `SameSite` et/ou anti-CSRF token.

Attributs à combiner sur le cookie :

```
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

Note : `HttpOnly` **ne protège pas** contre une XSS qui effectue des requêtes authentifiées depuis la victime — d'où l'importance de corriger la XSS elle-même.

**Remédiation :** privilégiez un **cookie `HttpOnly; Secure; SameSite`** pour les tokens de session, complété d'une défense CSRF ; évitez `localStorage` pour les secrets ; dans tous les cas, éliminez la XSS (CSP, encodage de sortie).
===END===
===LESSON===
KEY: security-supply
TOPIC: security
TITLE: Supply chain & attaques réelles
ICON: 📦
INTRO: Vous n'écrivez qu'une fraction du code qui tourne en production : le reste vient de dépendances, d'images de base, d'actions CI, d'outils de build. La **supply chain logicielle** est devenue le vecteur d'attaque à plus fort effet de levier — compromettre un maillon touche des milliers de victimes en aval. Cette leçon couvre les vecteurs (typosquatting, build compromis, désérialisation) et les défenses (SBOM, signature, provenance SLSA, pinning), puis décortique les incidents majeurs (Log4Shell, xz, event-stream, Codecov).
---SECTION---
HEADING: Dépendances : typosquatting et confusion de dépendances
BODY:
Deux attaques par le **nom** du paquet :

- **Typosquatting** : publier un paquet malveillant dont le nom ressemble à un populaire (`python-dateutil` → `python-dateuti1`, `crossenv` → `cross-env`). Un `pip install`/`npm install` avec une faute de frappe exécute le code de l'attaquant, souvent dès l'install via des scripts.
- **Dependency confusion** (Alex Birsan, 2021) : si une organisation utilise un paquet **interne** `@corp/utils` non publié, un attaquant publie un paquet **public** du même nom avec une **version plus élevée**. Certains gestionnaires, mal configurés, préfèrent la source publique → exécution de code dans le build interne.

Aggravant côté npm : **scripts d'installation** (`preinstall`/`postinstall`) exécutés automatiquement, idéaux pour un dropper.

```
npm ci --ignore-scripts
```

**Remédiation :** épinglez les noms exacts et des versions (lockfile) ; configurez un **registre interne / scoping** empêchant la résolution publique des paquets privés ; désactivez les scripts d'install par défaut ; passez les dépendances par un proxy/allow-list et scannez avant intégration.
---SECTION---
HEADING: Lockfiles et intégrité : figer ce qui entre
BODY:
Une plage de versions (`^1.2.0`) signifie « fais-moi confiance pour toute mise à jour mineure/patch future ». C'est exactement le canal exploité quand une version compromise est publiée (cf. event-stream). Le **lockfile** fige les versions **et les hashs**.

- npm : `package-lock.json` + `npm ci` (installe **exactement** le lock, échoue si divergence).
- Python : `requirements.txt`/`poetry.lock` avec `--require-hashes`.
- Le hash d'intégrité (`sha512-...`, `integrity`) garantit que l'artefact téléchargé est bit-à-bit celui attendu.

Attention : un lock protège l'intégrité **de ce que vous avez déjà validé**, pas contre une dépendance déjà malveillante au moment du lock — d'où le besoin de revue des mises à jour.

**Remédiation :** committez un lockfile ; installez en mode strict et vérifié par hash (`npm ci`, `pip --require-hashes`) ; passez les bumps de dépendances par une **revue** ; activez la vérification d'intégrité du registre.
---SECTION---
HEADING: SBOM : CycloneDX et SPDX
BODY:
Un **SBOM (Software Bill of Materials)** est la « liste d'ingrédients » de votre logiciel : chaque composant, sa version, sa licence, son origine, ses hashs. Sans SBOM, la question « suis-je affecté par la CVE-X ? » prend des jours ; avec, quelques secondes.

Deux formats standards :

- **CycloneDX** (OWASP) : orienté sécurité/supply chain, supporte VEX, dépendances, services.
- **SPDX** (Linux Foundation, ISO/IEC 5962) : origine licence/conformité, très complet.

Un SBOM devient actionnable couplé à **VEX (Vulnerability Exploitability eXchange)**, qui indique si une CVE présente est réellement **exploitable** dans votre contexte.

```
syft dir:. -o cyclonedx-json > sbom.json
grype sbom:sbom.json
```

**Remédiation :** générez un SBOM **à chaque build** (syft, cdxgen) et archivez-le comme artefact ; scannez-le en continu (grype/trivy/Dependency-Track) ; utilisez VEX pour prioriser ; exigez un SBOM de vos fournisseurs.
---SECTION---
HEADING: Signature d'artefacts : Sigstore / cosign
BODY:
Comment prouver qu'un artefact (image, binaire, paquet) vient bien de vous et n'a pas été altéré ? Par une **signature**. **Sigstore** simplifie via le **keyless signing** :

- **cosign** signe images/artefacts.
- **Fulcio** : CA qui émet un certificat **éphémère** lié à une identité **OIDC** (workflow GitHub Actions, email…). Pas de clé privée à garder.
- **Rekor** : journal de **transparence** append-only, public et vérifiable, qui horodate chaque signature.

```
cosign sign --yes registry.example/app@sha256:...
cosign verify registry.example/app@sha256:... \
  --certificate-identity-regexp '.*@github/org/repo' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Signer un **digest** (`@sha256:...`), pas un tag mutable comme `latest`.

**Remédiation :** signez chaque artefact publié avec cosign (keyless de préférence) ; **vérifiez** la signature **et l'identité** au déploiement (admission controller : Kyverno/Gatekeeper/Connaisseur) ; refusez tout artefact non signé ou d'identité inattendue ; référencez par digest immuable.
---SECTION---
HEADING: Provenance SLSA : prouver comment c'est construit
BODY:
Signer prouve **qui** ; la **provenance** prouve **comment**. **SLSA** (Supply-chain Levels for Software Artifacts) est un référentiel de niveaux de garanties sur le processus de build.

- Une **attestation de provenance** (format in-toto) déclare de façon vérifiable : quel **code source** (commit), quel **builder**, quels paramètres ont produit cet artefact.
- Niveaux (v1) : **L1** provenance existe → **L2** provenance signée par un service de build → **L3** build **isolé, non falsifiable**, sur infrastructure durcie.

L'objectif : empêcher qu'un artefact prétende venir d'un code source qu'il ne reflète pas.

**Remédiation :** générez une provenance signée depuis un builder isolé ; visez au moins **SLSA L2-L3** pour les artefacts critiques ; **vérifiez** provenance + source URI au déploiement, pas seulement la signature.
---SECTION---
HEADING: Compromission du build : la leçon SolarWinds / SUNSPOT
BODY:
En 2020, **SolarWinds Orion** a été compromis non pas dans son code source mais dans son **pipeline de build**. L'implant **SUNSPOT** surveillait le serveur de build et, au moment de la compilation, **remplaçait à la volée** un fichier source pour injecter la backdoor **SUNBURST**, puis restaurait le fichier original — de sorte que le dépôt et les développeurs ne voyaient rien.

Le binaire produit était ensuite **signé légitimement** par SolarWinds et distribué via les mises à jour officielles à ~18 000 clients. Leçon clé : **un artefact signé peut être malveillant si le build lui-même est compromis**. La signature d'un binaire ne dit rien de la fidélité au code source — c'est précisément le trou que **SLSA / provenance / builds reproductibles** comblent.

**Remédiation :** durcissez et **isolez** l'environnement de build (éphémère, sans accès humain, hermétique) ; visez des **builds reproductibles** ; générez une **provenance SLSA** liant binaire↔commit ; surveillez l'intégrité des agents de build ; séparez les privilèges de signature de ceux de build.
---SECTION---
HEADING: Pinning des actions CI par SHA
BODY:
Une action GitHub référencée par tag (`actions/checkout@v4`) ou branche (`@main`) est **mutable** : le mainteneur — ou un attaquant ayant compromis le repo de l'action — peut **repointer le tag** vers du code malveillant qui s'exécutera dans **votre** pipeline, avec vos secrets.

La défense : **épingler par SHA de commit complet**, immuable.

```
- uses: actions/checkout@8ade135a41bc03ea155e62e844d188df1ea18608 # v4.1.0
```

Complétez par : **permissions minimales** du `GITHUB_TOKEN`, pas de secrets exposés aux workflows sur `pull_request` d'un fork, et méfiance envers `pull_request_target`. L'incident **tj-actions/changed-files** (2025) a illustré le pillage de secrets via une action compromise non épinglée.

**Remédiation :** épinglez **toutes** les actions tierces par **SHA complet** (Dependabot/Renovate met à jour les SHA avec revue) ; restreignez `permissions` au minimum ; auditez les actions tierces ; allow-list d'actions au niveau organisation.
---SECTION---
HEADING: Désérialisation non fiable dans la supply chain
BODY:
La **désérialisation** de données non fiables transforme des octets en objets — et, avec les mauvais formats, en **exécution de code**. C'est un vecteur supply chain car des **gadget chains** (suites de classes présentes dans vos **dépendances**) peuvent être enchaînées pour aboutir à une RCE, même si votre code ne fait « rien de dangereux ».

- **Java** : `ObjectInputStream.readObject` + libs comme Commons-Collections → RCE (outil **ysoserial**).
- **Python** : `pickle.loads`, `yaml.load` (non-`safe`) → exécution arbitraire.
- **PHP** : `unserialize` + POP chains.
- **.NET** : `BinaryFormatter`.

```
pickle.loads(untrusted)             # Python — dangereux
yaml.safe_load(data)                # Python — sûr
json.loads(data)                    # format sans code
```

**Remédiation :** ne désérialisez **jamais** de données non fiables avec un format porteur de code ; préférez des formats de **données** (JSON, protobuf) ; si la désérialisation d'objets est imposée, imposez une **allow-list de types**, isolez, et maintenez les libs à jour.
---SECTION---
HEADING: Étude de cas — Log4Shell (CVE-2021-44228)
BODY:
Fin 2021, **Log4Shell** frappe **Log4j 2**, l'une des libs de logging Java les plus répandues. La cause : Log4j interprétait des **expressions de lookup** dans les messages loggés, dont `${jndi:ldap://…}`. Logger une chaîne contrôlée par l'attaquant (un User-Agent, un champ de formulaire, un nom de device) déclenchait une requête **JNDI/LDAP** vers un serveur attaquant, qui renvoyait une classe Java **exécutée** → RCE non authentifiée, triviale, massive.

Facteurs d'amplification : la faille est dans une **dépendance transitive** souvent invisible ; « il suffit de logger » ; présente dans d'innombrables produits. C'est l'illustration parfaite du besoin de **SBOM** pour répondre en heures.

Leçons : fonctionnalité dangereuse activée **par défaut** (lookups) ; entrée non fiable atteignant un composant « inoffensif » (le logger) ; profondeur des dépendances transitives.

**Remédiation :** maintenez un SBOM ; mettez à jour Log4j (≥ 2.17.1) ; principe du **moindre pouvoir** dans les libs ; filtrez les sorties JNDI/egress ; ne loggez pas d'entrées non assainies dans des moteurs à interprétation.
---SECTION---
HEADING: Étude de cas — la backdoor xz / liblzma (CVE-2024-3094)
BODY:
En mars 2024, une **backdoor** est découverte dans **xz-utils** (liblzma), quasi intégrée aux distributions Linux majeures. L'attaque est un chef-d'œuvre d'**ingénierie sociale sur le long terme** : un contributeur (« Jia Tan »), après ~2 ans de contributions crédibles, gagne la **confiance du mainteneur** épuisé et obtient les droits de release.

La charge n'était **pas dans le dépôt Git** mais cachée dans les **tarballs de release** : des fichiers de test binaires « corrompus » et un script du système de build reconstituaient l'implant à la compilation. Celui-ci s'accrochait à **sshd** (via liblzma tirée par systemd) pour permettre un contournement d'authentification. Découverte par hasard : un ingénieur (Andres Freund) intrigué par ~500 ms de latence SSH en trop.

Leçons : le **mainteneur unique surchargé** est un point de défaillance ; **release artifact ≠ code source** ; obfuscation dans le build system ; social engineering patient.

**Remédiation :** construisez depuis le **source vérifié**, pas des tarballs opaques ; exigez builds **reproductibles** et provenance ; soutenez/diversifiez la maintenance des projets critiques ; surveillez les anomalies ; auditez les artefacts de test binaires.
---SECTION---
HEADING: Étude de cas — event-stream (2018)
BODY:
**event-stream**, paquet npm très populaire, est **cédé** par son mainteneur d'origine (lassé) à un volontaire inconnu qui en fait la demande. Ce nouveau mainteneur publie une version ajoutant une dépendance, **flatmap-stream**, contenant une charge **ciblée et obfusquée** : elle ne s'activait que dans le build d'une application spécifique (le wallet **Copay**) pour **voler des clés Bitcoin**.

Le code malveillant était **chiffré** et ne se déclenchait que dans l'environnement cible, échappant à l'observation générale.

Leçons : le **transfert de propriété** d'un paquet est un vecteur de confiance majeur ; charge **conditionnelle/ciblée** difficile à repérer ; plages de versions (`^`) qui tirent automatiquement la version piégée.

**Remédiation :** verrouillez les versions (lockfile) et **revoyez les diffs** des mises à jour, surtout nouveaux mainteneurs / nouvelles deps transitives ; méfiez-vous des changements de propriété ; désactivez les scripts d'install ; minimisez la surface (moins de deps).
---SECTION---
HEADING: Étude de cas — Codecov Bash Uploader (2021)
BODY:
En 2021, l'attaquant modifie le script **Bash Uploader** de **Codecov** (outil de couverture utilisé dans d'innombrables pipelines CI). Une erreur de configuration dans le processus de création de l'image Docker de Codecov a permis d'**extraire la clé** protégeant le script hébergé, puis d'y insérer une ligne exfiltrant les **variables d'environnement** de l'environnement CI de la victime (secrets, tokens, clés cloud) vers un serveur tiers.

Comme le script était **`curl`é et exécuté** à la volée dans les CI, la modification s'est propagée silencieusement pendant ~2 mois.

Leçons : le danger de **`curl | bash`** de ressources distantes mutables et non vérifiées ; la CI comme **coffre à secrets** hautement convoité.

**Remédiation :** ne faites jamais `curl | bash` sans **vérification d'intégrité** (hash/signature épinglés) ; épinglez les outils par version **et** checksum ; scindez et **limitez la portée des secrets CI** (courte durée, OIDC plutôt que clés statiques) ; surveillez l'egress réseau du CI ; faites tourner tout secret potentiellement exposé.
---SECTION---
HEADING: Leçons transverses de la supply chain
BODY:
Les incidents (SolarWinds, Log4Shell, xz, event-stream, Codecov) partagent des motifs :

- **La confiance est le vrai périmètre** : source, mainteneurs, build, artefacts, CI, miroirs. Compromettre le maillon le plus faible suffit.
- **Artefact signé ≠ artefact sûr** : la signature prouve l'origine, pas la fidélité au source → besoin de **provenance/SLSA** et builds reproductibles.
- **Le facteur humain** : mainteneurs surchargés, transferts de propriété, social engineering patient.
- **La visibilité change tout** : sans **SBOM**, on ne sait pas si l'on est touché ; la détection tient souvent au **hasard**.
- **Le CI est une cible de premier plan** : il concentre secrets et privilèges de déploiement.

**Remédiation :** appliquez la **défense en profondeur** : lockfiles + SHA pinning, signature **et** provenance vérifiées à l'admission, SBOM scanné en continu, builds isolés/reproductibles, secrets CI éphémères (OIDC), moindre privilège et monitoring d'egress ; traitez la mise à jour de dépendance comme un **changement de code à revoir**, pas un automatisme.
===END===
