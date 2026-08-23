===LESSON===
KEY: secure-review
TOPIC: secure-review
TITLE: Revue de code sécu
ICON: 🔎
INTRO: Une faille ne se voit presque jamais dans une fonctionnalité qui « marche » : elle vit dans la façon dont une donnée non fiable circule jusqu'à un point sensible, et la revue de code sécurisée est l'art de suivre ce flux à la lecture pour repérer, avant l'attaquant, l'endroit où la confiance a été accordée trop tôt.
---SECTION---
HEADING: L'état d'esprit du reviewer : suivre la donnée, pas la fonctionnalité
BODY:
Relire du code pour la sécurité n'est pas relire pour la correction fonctionnelle. Un code peut passer tous ses tests, faire exactement ce que le ticket demande, et rester exploitable. La raison est simple : les tests vérifient le comportement attendu sur des **entrées attendues**, alors qu'un attaquant fournit des entrées **inattendues**, choisies précisément pour sortir du chemin nominal.

Le modèle mental central est celui du **flux de données non fiables** (*data flow analysis*), au cœur de l'OWASP Code Review Guide :

- **Source** : tout point d'entrée contrôlé par l'extérieur — paramètres HTTP (query, body, headers, cookies), champs de formulaire, fichiers uploadés, messages d'une file, réponses d'API tierces, données lues en base qui viennent à l'origine d'un utilisateur.
- **Sink** (puits) : tout point où cette donnée devient dangereuse — une requête SQL, un `exec()` système, un rendu HTML, un chemin de fichier, un désérialiseur, une redirection.
- **Sanitizer / validateur** : ce qui se trouve entre les deux et rend la donnée sûre pour ce sink précis (échappement, paramétrage, allow-list).

La question de revue, répétée pour chaque sink, est toujours la même :

> « Cette donnée peut-elle venir d'une source non fiable, et si oui, qu'est-ce qui la rend sûre **avant** d'atteindre le sink ? »

Une faille, c'est un chemin source → sink sans sanitizer adapté. Retenez aussi la règle de la **frontière de confiance** (*trust boundary*) : dès qu'une donnée traverse une frontière (client → serveur, service → service), tout ce qui vient de l'autre côté est non fiable, y compris ce que « votre » front-end a envoyé. La validation côté client est une aide UX, jamais un contrôle de sécurité.
---SECTION---
HEADING: Injection SQL : le sink qui mélange code et données
BODY:
L'injection SQL est l'archétype de toutes les injections (CWE-89, systématiquement dans le CWE Top 25). Le mécanisme : la donnée utilisateur est **concaténée** dans le texte d'une requête, si bien que le moteur SQL interprète une partie de l'entrée comme de la **syntaxe** plutôt que comme une **valeur**.

À repérer en revue — toute construction de requête par concaténation ou interpolation de chaîne :

```python
# VULNÉRABLE : le nom d'utilisateur devient de la syntaxe SQL
query = "SELECT * FROM users WHERE name = '" + username + "'"
cursor.execute(query)
# username = "' OR '1'='1' --"  -> renvoie toute la table
```

Le correctif n'est **pas** d'échapper les quotes à la main (on en oublie toujours, et selon l'encodage on est contournable). Le correctif est le **requêtage paramétré** (*prepared statement*) : la structure de la requête est envoyée séparément des valeurs, et le driver garantit que les valeurs ne peuvent jamais changer la structure.

```python
# SÛR : ? est un emplacement de valeur, jamais de syntaxe
cursor.execute("SELECT * FROM users WHERE name = ?", (username,))
```

Points de vigilance en relecture :
- Un ORM ne protège pas magiquement : `Model.raw("... " + x)`, `session.execute(text(f"..."))` ou un `.order_by()` construit dynamiquement rouvrent la faille.
- Les **identifiants** (noms de table/colonne, sens de tri `ASC`/`DESC`) ne peuvent pas être paramétrés. S'ils viennent de l'utilisateur, ils doivent passer par une **allow-list** stricte (une map de valeurs autorisées), jamais par concaténation.
- Cherchez les mots-clés dangereux : `execute(`, `f"SELECT`, `+ " WHERE`, `.format(`, template strings dans le SQL.
---SECTION---
HEADING: Injection de commande, LDAP, XXE, SSRF : la même faille, d'autres interpréteurs
BODY:
Toute injection suit le patron « donnée non fiable interprétée comme code par un sous-système ». Reconnaître le patron permet de couvrir des sinks très différents.

### Injection de commande (CWE-78)
Danger : passer une chaîne à un shell.

```python
os.system("ping " + host)          # host = "8.8.8.8; rm -rf /"
subprocess.run(f"convert {name}", shell=True)   # idem
```

Correctif : bannir `shell=True`, passer les arguments sous forme de **liste** pour que l'OS ne réinterprète pas les métacaractères :

```python
subprocess.run(["ping", "-c", "1", host])   # host reste UN argument
```

### Injection LDAP (CWE-90)
Concaténer un filtre : `(&(uid=" + user + ")(...))`. Une entrée `*)(uid=*` casse le filtre. Correctif : encodage des filtres LDAP (RFC 4515) via l'API dédiée, allow-list des caractères.

### XXE — XML External Entity (CWE-611)
Un parseur XML qui résout les entités externes permet `<!ENTITY xxe SYSTEM "file:///etc/passwd">` (lecture de fichiers, SSRF, DoS). Correctif : **désactiver** entités externes et DTD (`defusedxml` en Python, `setFeature(..."disallow-doctype-decl", true)` en Java).

### SSRF — Server-Side Request Forgery (CWE-918, entrée récente du Top 25)
Le serveur fait une requête vers une URL fournie par l'utilisateur ; l'attaquant vise l'intérieur du réseau (`http://169.254.169.254/` = métadonnées cloud, services internes). Correctif : **allow-list** de domaines/hôtes autorisés, résolution DNS puis vérification que l'IP n'est pas privée/loopback/link-local, blocage des redirections, jamais de simple *deny-list*.

Le fil conducteur : **séparer les canaux** (données vs instructions) et **valider par allow-list** au plus près du sink.
---SECTION---
HEADING: SSTI et injection de templates : quand l'entrée atteint le moteur de rendu
BODY:
La *Server-Side Template Injection* (CWE-1336 / CWE-94) survient quand une entrée utilisateur est **concaténée dans le template lui-même** plutôt que passée comme **variable** au template. Le moteur (Jinja2, Twig, Freemarker, Velocity…) évalue alors l'entrée comme une expression, ce qui mène souvent à l'exécution de code arbitraire.

À repérer : le nom même de la fonction de rendu appliqué à une chaîne construite.

```python
# VULNÉRABLE : l'entrée fait partie de la source du template
from jinja2 import Template
Template("Bonjour " + name).render()
# name = "{{7*7}}" -> "Bonjour 49"  (preuve d'évaluation)
# puis escalade vers {{ ''.__class__... }} -> RCE
```

```python
# SÛR : le template est fixe, l'entrée est une donnée liée
Template("Bonjour {{ name }}").render(name=name)
```

Le signal de revue est net : **le template ne doit jamais être une chaîne dynamique**. Cherchez `render_template_string(...)` avec un argument non littéral, des f-strings/concaténations qui construisent du markup de template, `Template(variable)`. La distinction cruciale, la même partout : une entrée est une **donnée** (liée par nom au template), jamais une **partie du programme**. En revue, le test « `{{7*7}}` deviendrait-il 49 ? » se raisonne à la lecture.
---SECTION---
HEADING: XSS : stocké, réfléchi, DOM — trois chemins, un même échappement manquant
BODY:
Le *Cross-Site Scripting* (CWE-79) est l'injection dans le sink « navigateur » : une donnée non fiable est insérée dans une page **sans échappement adapté au contexte HTML**, et le navigateur l'exécute comme du script. On distingue trois variantes par le **chemin** de la donnée :

- **Réfléchi** : l'entrée d'une requête est renvoyée immédiatement dans la réponse (`?q=<script>`). Un lien piégé suffit.
- **Stocké** : la charge est enregistrée (commentaire, profil) puis servie à toutes les victimes. Le plus grave car persistant.
- **DOM-based** : rien côté serveur — du JavaScript client lit une source (`location.hash`, `document.referrer`) et l'écrit dans un **sink DOM** (`innerHTML`, `document.write`, `eval`).

Le correctif dépend du **contexte de sortie**, et c'est le point clé de la revue :

- Corps HTML → échappement HTML (`<` → `&lt;`). Les moteurs de template auto-échappent par défaut ; méfiez-vous des désactivations : `|safe` (Jinja), `{!! !!}` (Blade), `v-html` (Vue), `dangerouslySetInnerHTML` (React).
- Attribut, JavaScript, URL, CSS → chaque contexte a son échappement propre. Une donnée dans `href` doit être un schéma validé (attention à `javascript:`).

Côté DOM, préférez systématiquement `textContent` à `innerHTML` :

```javascript
el.innerHTML = location.hash.slice(1);   // VULNÉRABLE (sink DOM)
el.textContent = location.hash.slice(1); // SÛR (pas d'interprétation)
```

En défense en profondeur : une **Content-Security-Policy** stricte limite l'impact, mais ne remplace jamais l'échappement à la source.
---SECTION---
HEADING: CSRF : l'attaque qui abuse de l'authentification ambiante
BODY:
Le *Cross-Site Request Forgery* (CWE-352) n'injecte rien : il **abuse d'une session déjà authentifiée**. Si les droits d'un utilisateur sont portés par un cookie envoyé **automatiquement** par le navigateur à chaque requête vers votre domaine, alors un site tiers malveillant peut déclencher une requête vers votre application, et le cookie partira tout seul. L'utilisateur, simplement en visitant une page piégée, exécute une action (virement, changement d'email) à son insu.

```html
<!-- Sur un site attaquant ; le cookie de session part avec la requête -->
<form action="https://banque.example/virement" method="POST">
  <input name="montant" value="1000"><input name="vers" value="attaquant">
</form>
<script>document.forms[0].submit()</script>
```

La condition d'existence : l'action sensible ne s'appuie **que** sur une authentification ambiante (cookie) sans preuve que la requête vient bien de votre application. En revue, cherchez les endpoints qui changent d'état (POST/PUT/DELETE) et vérifiez la présence d'une des défenses :

- **Jeton anti-CSRF** (*synchronizer token*) : une valeur imprévisible, liée à la session, exigée dans chaque formulaire et vérifiée côté serveur. L'attaquant ne peut pas la deviner.
- **Cookies `SameSite`** (`Lax` par défaut sur les navigateurs modernes, `Strict` pour le sensible) : le navigateur n'envoie pas le cookie sur les requêtes cross-site.
- **Vérification d'origine** : contrôler les en-têtes `Origin`/`Referer`.

Point de vigilance : une API purement token-based (Authorization: Bearer, non envoyé automatiquement) n'est pas sujette au CSRF classique — mais si vous acceptez **aussi** le cookie, la faille revient. Et les requêtes `GET` ne doivent **jamais** modifier d'état.
---SECTION---
HEADING: Contrôle d'accès : IDOR / BOLA, la faille la plus courante et la plus discrète
BODY:
Le *Broken Access Control* est en tête de l'OWASP Top 10, et sa forme la plus fréquente est l'**IDOR** (*Insecure Direct Object Reference*), appelée **BOLA** côté API (Broken Object Level Authorization). Le mécanisme est d'une simplicité redoutable : le code **authentifie** l'utilisateur (on sait *qui* il est) mais **n'autorise pas** l'accès à l'objet précis demandé (a-t-il le droit d'accéder à *cet* objet ?).

```python
# VULNÉRABLE : on lit l'objet par son id, sans vérifier le propriétaire
@app.get("/api/invoices/<id>")
def get_invoice(id):
    return db.invoices.find(id)      # /api/invoices/1002 -> facture d'autrui
```

```python
# SÛR : l'autorisation fait partie de la requête (scopée au user courant)
def get_invoice(id):
    inv = db.invoices.find_one(id=id, owner_id=current_user.id)
    if inv is None:
        abort(404)                   # 404, pas 403 : ne pas révéler l'existence
    return inv
```

Ce qui rend l'IDOR discret : le code « marche » parfaitement pour l'utilisateur légitime. Rien ne saute aux yeux ; il faut **chercher l'absence** de contrôle. Méthode de revue :

- Pour **chaque** endpoint qui prend un identifiant d'objet (id, uuid, slug, nom de fichier), demandez : « où est vérifié que `current_user` a le droit sur CET objet ? »
- Méfiez-vous du contrôle d'accès **par l'UI** (bouton caché) sans contrôle serveur.
- Vérifiez les accès en **écriture** autant qu'en lecture, et les **actions par lot**.
- Un id imprévisible (UUID) réduit l'exposition mais **n'est pas** un contrôle d'accès (sécurité par obscurité).

Règle ASVS : l'autorisation se vérifie **côté serveur, à chaque requête, au niveau de l'objet**.
---SECTION---
HEADING: Mass assignment : quand le binding automatique écrase vos garde-fous
BODY:
Le *mass assignment* (CWE-915), aussi appelé *autobinding* ou *object injection*, exploite les frameworks qui **mappent automatiquement** les champs d'une requête vers les attributs d'un objet métier. Pratique pour le développeur, dangereux si l'utilisateur peut ainsi renseigner des champs qu'il ne devrait **jamais** contrôler.

```python
# VULNÉRABLE : tout le JSON entrant écrase l'objet
user = User(**request.json)          # {"name":"x", "is_admin":true}
db.save(user)                        # l'utilisateur s'est promu admin
```

L'attaquant ajoute simplement des champs au payload : `is_admin`, `role`, `account_balance`, `verified`, `owner_id`… Le serveur les accepte parce que le binding est aveugle. En revue, ce sont les constructions « tout d'un coup » qui doivent alerter : `User(**data)`, `Object.assign(entity, req.body)`, `model.update(req.body)`, `@ModelAttribute` sans restriction, `updateAttributes(params)`.

Le correctif est l'**allow-list explicite** des champs modifiables (jamais une deny-list, qu'on oublie de mettre à jour) :

```python
# SÛR : on ne prend QUE les champs autorisés
ALLOWED = {"name", "email", "bio"}
data = {k: v for k, v in request.json.items() if k in ALLOWED}
user.update(data)
```

Concrètement : DTO d'entrée dédié, `fillable`/`guarded` (Laravel), `strong parameters` / `permit(...)` (Rails), `@JsonIgnore` sur les champs sensibles, sérialiseurs avec champs déclarés (DRF). La question de revue : « quels attributs de cet objet un attaquant peut-il atteindre via ce binding, et lesquels sont sensibles ? »
---SECTION---
HEADING: Authentification & session : confusion d'algorithme JWT
BODY:
Les JSON Web Tokens portent des *claims* signés. Leur sécurité repose entièrement sur la **vérification correcte de la signature** — et c'est précisément là que se logent les failles (CWE-347, vérification de signature incorrecte).

**Confusion d'algorithme `alg`.** L'en-tête du token déclare l'algorithme. Une bibliothèque naïve fait confiance à ce champ. Deux attaques classiques :

- **`alg: none`** : le token prétend n'être pas signé. Si la lib l'accepte, n'importe qui forge n'importe quel claim.
- **RS256 → HS256** : le serveur signe en asymétrique (clé privée RSA) et publie sa clé **publique**. L'attaquant change `alg` en HS256 (symétrique) et signe le token avec cette clé publique comme secret HMAC. Une lib qui choisit l'algorithme d'après l'en-tête vérifiera alors avec la clé publique connue → token valide.

```python
# VULNÉRABLE : l'algorithme est dicté par le token
jwt.decode(token, key, algorithms=["HS256", "RS256", "none"])

# SÛR : on impose l'algorithme et on refuse tout le reste
jwt.decode(token, public_key, algorithms=["RS256"])
```

Autres points de revue JWT : une **signature jamais vérifiée** (`decode` sans clé, `verify=False`), un secret HMAC **faible/deviné**, l'absence de contrôle d'`exp` (expiration), l'oubli de vérifier `aud`/`iss`. Règle : **fixer explicitement l'algorithme attendu**, ne jamais le déduire du token, et traiter le JWT comme une entrée non fiable jusqu'à signature validée.
---SECTION---
HEADING: Authentification & session : timing, fixation, gestion du cycle de vie
BODY:
Au-delà du JWT, plusieurs classes de failles touchent l'authentification et les sessions (OWASP WSTG, ASVS chapitres V2/V3).

### Attaques temporelles (*timing attacks*, CWE-208)
Comparer un secret avec `==` s'arrête au premier octet différent : le **temps de réponse** fuit le nombre d'octets corrects, ce qui permet de reconstruire le secret octet par octet. Concerne mots de passe, tokens d'API, signatures HMAC.

```python
if user_token == provided:            # VULNÉRABLE : court-circuit précoce
import hmac
if hmac.compare_digest(user_token, provided):  # SÛR : temps constant
```

### Fixation de session (CWE-384)
Si l'identifiant de session **ne change pas** au moment de la connexion, un attaquant peut fixer un id connu (via un lien) puis en hériter une fois la victime authentifiée. Correctif : **régénérer l'id de session à chaque changement de niveau de privilège** (login, élévation).

```python
session.regenerate()   # après login réussi — l'ancien id devient invalide
```

### Cycle de vie et énumération
- **Cookies de session** : attributs `HttpOnly` (inaccessible au JS, limite le vol par XSS), `Secure` (HTTPS uniquement), `SameSite`.
- **Expiration** : timeout d'inactivité et invalidation **côté serveur** à la déconnexion (un JWT « stateless » ne se révoque pas sans liste de révocation).
- **Énumération de comptes** : des messages ou temps de réponse différents entre « login inconnu » et « mot de passe faux » révèlent quels comptes existent. Réponse et timing **uniformes**.
- **Anti-bruteforce** : throttling, verrouillage progressif, MFA.
---SECTION---
HEADING: Cryptographie : les erreurs qui se repèrent à la lecture
BODY:
On ne juge pas la robustesse d'un algorithme en revue de code — mais on repère les **mauvais usages**, qui sont visibles et catastrophiques (CWE-327 algorithme faible, CWE-326 force insuffisante).

### Mode ECB
Chiffrer par blocs indépendants : deux blocs de clair identiques donnent deux blocs de chiffré identiques. Les **motifs du clair transparaissent** (le fameux « pingouin ECB »). Signal : `AES/ECB/...`, `MODE_ECB`. Correctif : un mode authentifié comme **GCM** (confidentialité + intégrité).

### IV / nonce réutilisé ou prévisible
Un vecteur d'initialisation doit être **unique** (et aléatoire pour CBC). Un IV constant (`iv = b"\x00"*16`) ou réutilisé avec la même clé casse la confidentialité ; en mode CTR/GCM, réutiliser un nonce est fatal. Signal : IV codé en dur, dérivé d'un compteur non aléatoire, ou absent.

### Clé / secret en dur
`key = b"1234567890abcdef"` dans le source : la clé fuit avec le code (dépôt, binaire). Les secrets vont dans un **coffre** (variable d'environnement au minimum, KMS/secret manager idéalement).

### Hash faible pour mots de passe
`md5(password)` / `sha1(...)` sont **trop rapides** : brute-force massif par GPU, tables arc-en-ciel. Un mot de passe se stocke avec une fonction **lente et salée** conçue pour : **bcrypt, scrypt, Argon2**, PBKDF2 (avec un coût élevé). MD5/SHA-1 sont aussi cassés en résistance aux collisions.

### Comparaison non constante
Comparer HMAC/signatures avec `==` (voir timing) → `hmac.compare_digest`.

### Aléa non cryptographique
`random.random()`, `Math.random()` sont **prédictibles** : proscrits pour tokens, mots de passe, IV, sels. Utilisez `secrets` (Python), `crypto.randomBytes` (Node), un CSPRNG.
---SECTION---
HEADING: Désérialisation non sûre : reconstruire un objet, c'est exécuter du code
BODY:
La *désérialisation non sûre* (CWE-502, présente au Top 25) est parmi les plus dangereuses car elle mène souvent directement à l'exécution de code à distance. Le principe : désérialiser, c'est **reconstruire des objets** à partir d'un flux d'octets. Si ce flux vient d'une source non fiable, l'attaquant contrôle **quels objets** sont créés et **quelles méthodes** sont invoquées pendant la reconstruction (constructeurs, hooks comme `__reduce__`, `readObject`, *magic methods*), formant une chaîne (*gadget chain*) jusqu'à un effet dangereux.

Signaux à repérer, par écosystème :

```python
pickle.loads(data)          # Python : RCE quasi directe sur data non fiable
yaml.load(data)             # sans SafeLoader -> instancie des objets arbitraires
```

- **Java** : `ObjectInputStream.readObject()` sur des données externes (les gadget chains type ysoserial).
- **PHP** : `unserialize()` sur de l'entrée utilisateur (magic methods `__wakeup`, `__destruct`).
- **.NET** : `BinaryFormatter`, `LosFormatter`, `NetDataContractSerializer`.
- **Node** : bibliothèques qui désérialisent des fonctions.

Correctifs, dans l'ordre de préférence :

1. **Ne pas désérialiser de données non fiables** avec un format capable d'instancier des objets. Préférez un format **de données pur** : JSON/protobuf mappé vers des DTO connus.
2. Si YAML : `yaml.safe_load` (types simples uniquement).
3. Si c'est inévitable : signer/chiffrer le flux (intégrité), restreindre les types autorisés par allow-list (*look-ahead deserialization*), isoler.

Règle de revue : `pickle`, `unserialize`, `readObject`, `yaml.load`, `BinaryFormatter` sur une donnée qui a traversé une frontière de confiance = signalement immédiat.
---SECTION---
HEADING: Path traversal et open redirect : la validation de destination
BODY:
Deux failles distinctes partagent une même racine : une **entrée utilisateur décide d'une destination** (un chemin de fichier, une URL) sans validation que cette destination reste dans le périmètre autorisé.

### Path traversal / directory traversal (CWE-22)
Construire un chemin de fichier avec de l'entrée utilisateur permet, via `../`, de sortir du répertoire prévu et de lire/écrire des fichiers arbitraires.

```python
# VULNÉRABLE : filename = "../../etc/passwd"
open(os.path.join(BASE_DIR, filename))
```

Le correctif : **résoudre** le chemin canonique puis **vérifier** qu'il reste sous la racine autorisée — la résolution neutralise les `../`, `..\`, encodages et liens symboliques.

```python
# SÛR : on canonicalise, puis on contrôle l'appartenance
base = os.path.realpath(BASE_DIR)
full = os.path.realpath(os.path.join(base, filename))
if not full.startswith(base + os.sep):
    abort(403)
```

Complétez par une allow-list de noms/extensions et le refus des chemins absolus. Attention aux archives (*zip slip* : une entrée `../` dans un zip).

### Open redirect (CWE-601)
Rediriger vers une URL fournie par l'utilisateur (`?next=`) sans contrôle envoie la victime vers un site malveillant sous couvert de votre domaine (phishing, vol de token OAuth).

```python
redirect(request.args["next"])          # VULNÉRABLE : next = "//evil.com"
```

Correctif : n'autoriser que des **chemins relatifs internes** ou une **allow-list** d'URLs. Méfiez-vous des contournements : `//evil.com`, `/\evil.com`, `https:evil.com`, URLs encodées. Valider le **host** résolu, pas un simple préfixe de chaîne.
---SECTION---
HEADING: Race conditions et TOCTOU : la fenêtre entre vérifier et agir
BODY:
Une *race condition* de sécurité, souvent de type **TOCTOU** (*Time Of Check To Time Of Use*, CWE-367), naît d'un intervalle entre le moment où l'on **vérifie** une condition et le moment où l'on **agit** dessus. Si l'état peut changer dans cette fenêtre — par concurrence — la vérification devient mensongère.

```python
# VULNÉRABLE : le solde peut changer entre le check et le débit
if account.balance >= amount:         # (1) vérification
    # ... deux requêtes simultanées passent toutes deux ce test ...
    account.balance -= amount         # (2) action -> solde négatif
```

Deux retraits simultanés lisent tous deux l'ancien solde et débitent : l'utilisateur dépense plus qu'il ne possède (double-spending). Le patron se retrouve partout : vérifier l'unicité d'un email puis insérer, vérifier les droits sur un fichier puis l'ouvrir, appliquer un coupon « une seule fois », valider un panier puis payer.

Ce qui rend ces bugs traîtres : ils sont **invisibles en test séquentiel** et ne se déclenchent que sous concurrence. En revue, cherchez le motif **check-puis-act** sur une ressource partagée, et vérifiez l'atomicité :

- **Transaction + verrou** : `SELECT ... FOR UPDATE`, niveau d'isolation adapté.
- **Opération atomique** en base : `UPDATE ... SET balance = balance - :amt WHERE balance >= :amt` (le check et l'act en une seule instruction), contrainte `UNIQUE`, `INSERT ... ON CONFLICT`.
- **Verrou applicatif** idempotent, jeton d'unicité.

Côté système, le TOCTOU classique est le couple `access()` puis `open()`, ou vérifier un fichier puis l'ouvrir par son nom : préférez opérer sur un descripteur (`open` puis `fstat`).
---SECTION---
HEADING: ReDoS et prototype pollution : deux pièges spécifiques à connaître
BODY:
### ReDoS — Regular Expression Denial of Service (CWE-1333)
Certaines expressions régulières ont un temps d'exécution **exponentiel** sur des entrées adverses, à cause du *catastrophic backtracking*. Une seule requête peut bloquer un cœur CPU plusieurs secondes ou minutes.

Le motif dangereux : **quantificateurs imbriqués** sur des classes qui se chevauchent — `(a+)+`, `(\d+)*`, `(.*)*`, ou alternances chevauchantes `(a|a)*`.

```javascript
/^(\w+\s?)*$/.test(input)   // sur "aaaa...!" -> backtracking catastrophique
```

À repérer en revue : `(...)*`, `(...+)+`, `(...)*` où le groupe interne peut matcher la même chose de plusieurs façons, surtout sur une **entrée utilisateur** de longueur non bornée. Correctifs : réécrire le motif sans ambiguïté (atomic groups, quantificateurs possessifs), borner la longueur de l'entrée, utiliser un moteur regex à temps linéaire (RE2), ou un timeout.

### Prototype pollution (CWE-1321, spécifique JavaScript)
En JS, modifier `__proto__` d'un objet altère le **prototype partagé** `Object.prototype`, donc **tous** les objets. Un merge récursif naïf de JSON utilisateur peut injecter des propriétés globales, menant à un déni de service, un contournement de logique, voire une RCE.

```javascript
// payload : {"__proto__": {"isAdmin": true}}
merge(target, JSON.parse(userInput)); // pollue Object.prototype
({}).isAdmin;                          // -> true partout
```

À repérer : fonctions de *deep merge*/`extend`/`set` par chemin (`lodash.set`, `deepmerge`) sur de l'entrée non fiable, sans filtrage des clés. Correctifs : rejeter les clés `__proto__`, `constructor`, `prototype` ; utiliser `Object.create(null)` pour les maps ; `Map` plutôt qu'objet ; `Object.freeze(Object.prototype)` ; schéma de validation strict.
---SECTION---
HEADING: Secrets en dur et validation d'entrée : les deux réflexes transverses
BODY:
Deux thèmes traversent toutes les catégories précédentes et méritent une passe dédiée.

### Secrets en dur (CWE-798)
Un identifiant, une clé d'API, un mot de passe de base, un token écrit **dans le code source** finit dans l'historique Git, les images Docker, les binaires distribués — impossible à révoquer proprement.

```python
API_KEY = "sk_live_51H8xY..."         # fuite dès le premier commit
DB_PASSWORD = "prod_p@ss"
```

À repérer : chaînes à haute entropie, préfixes connus (`sk_`, `AKIA`, `-----BEGIN ... PRIVATE KEY-----`), noms de variables `password`/`secret`/`token`/`apikey` affectés à un littéral. Correctifs : variables d'environnement, gestionnaire de secrets (Vault, KMS, secret manager cloud), scanners automatiques (git-secrets, gitleaks) en CI, et **rotation** de tout secret déjà commité — le retirer du code ne suffit pas, il reste dans l'historique.

### Validation d'entrée : allow-list au bon endroit
La validation d'entrée est une **défense en profondeur**, pas le contrôle primaire (l'échappement/paramétrage au sink reste indispensable), mais elle réduit fortement la surface d'attaque. Principes issus de l'ASVS :

- **Allow-list plutôt que deny-list** : définir ce qui est **autorisé** (format, longueur, type, plage), rejeter le reste. Une deny-list se contourne toujours (nouveaux encodages, casse, Unicode).
- **Valider côté serveur**, au format canonique (décoder **avant** de valider, sinon `%2e%2e` passe).
- **Typer fortement** : un id est un entier, une date est une date. La désérialisation vers un DTO typé fait déjà une part du travail.
- **Contextualiser** : la validation *complète* mais ne *remplace* pas l'encodage de sortie. Une donnée valide (« O'Brien ») doit quand même être paramétrée en SQL et échappée en HTML.

Synthèse de la revue sécurisée : pour chaque entrée, suivez-la jusqu'à son sink, et à chaque frontière demandez « qu'est-ce qui garantit ici que cette donnée ne peut pas changer de nature ? »
===END===
