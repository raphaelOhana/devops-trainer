import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Code review avancé » — issu de challenges réels (dub-flow), de
// techniques de bypass de filtres (PayloadsAllTheThings) et de bugs logiques
// (PortSwigger / bug bounty). Angles nouveaux, non couverts par les autres lots.
// ---------------------------------------------------------------------------

export const reviewExercises: Exercise[] = [
  // ============ CHALLENGES DE CODE REVIEW (dub-flow) ============
  {
    id: 'rv-account-overwrite',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Register qui écrase un compte',
    company: 'dub-flow #03',
    scenario: "Revue d'une inscription Spring Boot. On te dit de vérifier le hachage du mot de passe.",
    question: 'Quelle est la faille la PLUS grave (au-delà du hash) ?',
    language: 'java',
    code: `void register(String username, String password) {
    String hash = md5(password);
    userDatabase.put(username, hash); // pas de check d'existence
}`,
    options: [
      'MD5 est faible : c\'est le seul vrai problème du code',
      'Aucun check d\'existence : register(\'admin\') écrase le compte admin',
      'Le username devrait plutôt être un email valide',
      'Il manque un return à la fin de la fonction',
    ],
    answer: 1,
    explanation:
      "Le piège : on est attiré par MD5 (vrai défaut, CWE-916), mais la faille **critique** est l'**absence de vérification d'unicité** : `put('admin', ...)` **remplace** le compte admin → **account takeover**. Corriger les deux : bcrypt/argon2 + sel, ET refuser un username déjà pris. Une revue doit chercher au-delà du défaut « évident ».",
    tags: ['appsec', 'account-takeover', 'java', 'cwe-916'],
  },
  {
    id: 'rv-host-header',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Host header injection',
    company: 'dub-flow #07',
    scenario: "Un lien de réinitialisation de mot de passe est construit puis envoyé par email.",
    question: 'Où est la vulnérabilité ?',
    language: 'javascript',
    code: `const resetLink =
  \`http://\${req.headers.host}/reset?token=\${token}\`;
sendMail(req.body.email, \`Cliquez : \${resetLink}\`);`,
    options: [
      'Le token de reset devrait être plus long',
      'req.headers.host est contrôlé par l\'attaquant : lien empoisonné',
      'La fonction sendMail est asynchrone et non attendue',
      'Il faudrait utiliser HTTPS dans le lien généré',
    ],
    answer: 1,
    explanation:
      "**Host Header Injection (CWE-74)** : l'en-tête `Host` est **fourni par le client**. Un attaquant qui déclenche un reset pour la victime avec `Host: evil.com` fait générer un lien pointant vers son domaine ; si la victime clique (ou si le token fuit autrement), il est volé. Correctif : **hostname en dur** (config/env) ou **allowlist** stricte des Host acceptés.",
    tags: ['appsec', 'host-header', 'javascript', 'cwe-74'],
  },
  {
    id: 'rv-nginx-alias',
    type: 'find-error',
    domain: 'devops',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Nginx off-by-slash',
    company: 'dub-flow #08',
    scenario: "Configuration Nginx servant des fichiers statiques.",
    question: 'Quelle subtilité crée un path traversal ?',
    language: 'nginx',
    code: `location /html {
    alias /usr/share/nginx/html/;
}`,
    options: [
      'La directive alias est dépréciée dans Nginx',
      'location sans slash + alias : /html../ sort du dossier (traversal)',
      'Il manque une directive index dans le bloc location',
      'Le chemin du dossier servi devrait être relatif',
    ],
    answer: 1,
    explanation:
      "**Off-by-slash / path traversal (CWE-22)** : `location /html` (sans slash final) matche `/html../`, et `alias` **recolle** le chemin → `/usr/share/nginx/html/../nginx.conf` sort du dossier. Correctif : `location /html/ {` (slash final) ou utiliser `root` (qui **append** le chemin au lieu de le remplacer). Différence subtile `alias` vs `root` classique.",
    tags: ['appsec', 'nginx', 'path-traversal', 'cwe-22'],
  },
  {
    id: 'rv-jwt-decode',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'decode au lieu de verify',
    company: 'dub-flow #10',
    scenario: "Middleware d'authentification JWT en Express.",
    question: 'Pourquoi n\'importe qui peut-il devenir admin ?',
    language: 'javascript',
    code: `const decoded = jwt.decode(token, { complete: true });
req.user = decoded.payload;
if (req.user.username === 'admin') grantAdmin();`,
    options: [
      'L\'option complete: true est incorrecte ici',
      'jwt.decode ne vérifie pas la signature (payload non fiable)',
      'Il manque la vérification de l\'expiration du token',
      'La fonction grantAdmin est mal nommée',
    ],
    answer: 1,
    explanation:
      "**Signature non vérifiée (CWE-347)** : `jwt.decode` **décode sans valider** la signature — il lit le payload de confiance zéro. N'importe qui forge `{username:'admin'}`. Confusion classique **decode vs verify**. Correctif : **`jwt.verify(token, secret, { algorithms:['HS256'] })`**, qui rejette tout token non signé correctement.",
    tags: ['appsec', 'jwt', 'javascript', 'cwe-347'],
  },
  {
    id: 'rv-bash-unquoted',
    type: 'find-error',
    domain: 'devops',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Comparaison Bash non quotée',
    company: 'dub-flow #12',
    scenario: "Un script Bash valide un mot de passe (appelé par une app).",
    question: 'Comment contourner / extraire le mot de passe ?',
    language: 'bash',
    code: `SECRET="SuperAdmin@123"
if [[ $SECRET == $1 ]]; then
    echo "true"
fi`,
    options: [
      'Il faudrait chiffrer la valeur SECRET dans le script',
      '$1 non quoté dans [[ == ]] fait du pattern matching (glob)',
      'L\'opérateur == devrait être un simple =',
      'L\'appel echo est totalement inutile ici',
    ],
    answer: 1,
    explanation:
      "**Wildcard injection** : dans `[[ $SECRET == $1 ]]`, le membre droit **non quoté** est traité comme un **motif glob**, pas une chaîne littérale. `*` matche tout (bypass d'auth) ; et `S*`, `Su*`, `Sup*`… permettent une **extraction caractère par caractère** du secret. Correctif : **quoter les deux côtés** — `[[ \"$SECRET\" == \"$1\" ]]`. Piège : l'app appelle le script sans shell, on croit à tort que tout est sûr — la faille est dans le `.sh`.",
    tags: ['appsec', 'bash', 'wildcard', 'shell'],
  },
  {
    id: 'rv-sqli-orderby',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'SQLi dans ORDER BY',
    company: 'dub-flow #13',
    scenario: "Le reste du code utilise des requêtes paramétrées. Cette ligne trie les résultats.",
    question: 'Pourquoi est-elle quand même injectable ?',
    language: 'java',
    code: `String query = "SELECT * FROM users ORDER BY " + orderBy;
return jdbc.queryForList(query);`,
    options: [
      'La méthode queryForList est dépréciée',
      'Un nom de colonne (ORDER BY) ne peut pas être un paramètre lié',
      'Il manque une clause LIMIT sur la requête',
      'Le SELECT * est trop large, lister les colonnes',
    ],
    answer: 1,
    explanation:
      "**SQLi (CWE-89)** — piège du faux sentiment de sécurité : le reste du code est paramétré, mais un **placeholder `?` ne peut pas remplacer un nom de colonne ou une clause `ORDER BY`** (éléments structurels). D'où la concaténation… injectable. Correctif : **allowlist** des colonnes triables (`if (!allowed.contains(orderBy)) reject`), ou un mapping index→colonne côté serveur.",
    tags: ['appsec', 'sqli', 'order-by', 'java', 'cwe-89'],
  },
  {
    id: 'rv-response-splitting',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'HTTP Response Splitting',
    company: 'dub-flow #15',
    scenario: "Une valeur utilisateur est réfléchie dans un en-tête de réponse HTTP.",
    question: 'Quelle attaque permettent des CRLF non filtrés ?',
    options: [
      'Une injection SQL via l\'en-tête réfléchi',
      'Response splitting : des CRLF injectent des en-têtes ou une réponse',
      'Un buffer overflow sur le parsing de l\'en-tête',
      'Rien : les CRLF sont parfaitement inoffensifs',
    ],
    answer: 1,
    explanation:
      "**HTTP Response Splitting (CWE-113)** : `\\r\\n` (CRLF, `%0d%0a`) sont les **délimiteurs** des en-têtes HTTP. Réfléchir une valeur contenant des CRLF dans un en-tête permet d'**injecter des en-têtes** ou une **seconde réponse** (cache poisoning, redirection, XSS). Correctif : **rejeter/neutraliser les CRLF** dans toute valeur placée dans un en-tête ; ne pas réfléchir d'entrée brute dans les headers.",
    tags: ['appsec', 'response-splitting', 'crlf', 'cwe-113'],
  },
  {
    id: 'rv-unsafe-reflection',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Unsafe reflection',
    company: 'dub-flow #23',
    scenario: "Un endpoint instancie une classe dont le nom vient de l'utilisateur.",
    question: 'Quel est le danger ?',
    language: 'java',
    code: `Class<?> clazz = Class.forName(userInput);
Object o = clazz.getDeclaredConstructor().newInstance();
return o.toString();`,
    options: [
      'La méthode toString peut renvoyer null',
      'Unsafe reflection : l\'attaquant choisit la classe instanciée',
      'Il faut un cast explicite du résultat obtenu',
      'La méthode newInstance() est dépréciée',
    ],
    answer: 1,
    explanation:
      "**Unsafe reflection (CWE-470)** : `Class.forName(userInput)` laisse l'utilisateur **choisir la classe** à instancier. Il peut viser une classe privilégiée (`AdminUser`) → escalade, ou une classe dangereuse du classpath → parfois RCE. Correctif : **allowlist stricte** des classes instanciables, jamais un nom libre venant du client.",
    tags: ['appsec', 'reflection', 'java', 'cwe-470'],
  },
  {
    id: 'rv-int-overflow-cast',
    type: 'find-error',
    domain: 'software',
    topic: 'memory-safety',
    difficulty: 'senior',
    title: 'Overflow par cast unsigned→signed',
    company: 'dub-flow #27',
    scenario: "Un prix est calculé en C. Le code refuse déjà les nombres négatifs en entrée.",
    question: 'Pourquoi le total peut-il devenir négatif ?',
    language: 'c',
    code: `unsigned int qty = strtoul(input, NULL, 10);
unsigned int total_u = qty * PRICE;
int total_s = (int) total_u;     // cast final
printf("Total: %d\\n", total_s);`,
    options: [
      'La fonction strtoul est dépréciée en C moderne',
      'Le cast (int) d\'une grande valeur unsigned produit un négatif',
      'La constante PRICE devrait être un float',
      'printf devrait utiliser %u au lieu de %d',
    ],
    answer: 1,
    explanation:
      "**Integer overflow / wraparound (CWE-190)** : on bloque le `-` en entrée et on utilise `unsigned`, croyant les négatifs impossibles. Mais le **cast final `(int)`** d'une grande valeur `unsigned` (> 2^31−1) donne un **négatif** → « le système doit de l'argent ». Correctif : **bornes explicites** sur `qty` (0 < qty < seuil raisonnable), et vérifier l'overflow de la multiplication.",
    tags: ['appsec', 'integer-overflow', 'c', 'cwe-190'],
  },
  {
    id: 'rv-cache-deception',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Web Cache Deception',
    company: 'dub-flow #28',
    scenario: "Une route de profil renvoie des données sensibles. Le CDN cache les fichiers statiques (.css, .js…).",
    question: 'Quelle est la faille ?',
    language: 'javascript',
    code: `app.get("/profile*", (req, res) => {   // wildcard
  if (!req.session.user) return res.redirect("/login");
  res.send(\`API Key: \${users[req.session.user].apiKey}\`);
});`,
    options: [
      'Il faudrait ajouter un rate-limit sur la route',
      'Web Cache Deception : /profile/x.css est mis en cache par le CDN',
      'La valeur session.user peut être null ici',
      'Il manque un bloc try/catch autour du handler',
    ],
    answer: 1,
    explanation:
      "**Web Cache Deception (CWE-444)** : le **wildcard** `/profile*` fait que `/profile/x.css` est traité par le backend (renvoie l'API key) **et** vu comme statique par le CDN (extension `.css`) → mis en **cache** et servi à d'autres utilisateurs. Correctif : **route exacte** `/profile`, en-têtes `Cache-Control: private, no-store` sur les réponses authentifiées, et cache CDN basé sur autre chose que la seule extension.",
    tags: ['appsec', 'web-cache-deception', 'javascript', 'cwe-444'],
  },
  {
    id: 'rv-ssrf-rebind',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Bypass de protection localhost (SSRF)',
    company: 'dub-flow #33',
    scenario:
      "Un fetch d'URL vérifie que l'hôte n'est pas loopback : il résout le DNS une fois et teste is_loopback, puis fait la requête.",
    question: 'Comment contourner cette protection ?',
    options: [
      'Impossible : la vérification loopback est correcte',
      'DNS rebinding : deux résolutions DNS distinctes (TOCTOU)',
      'Il faudrait exiger une clé API sur cet endpoint',
      'Le timeout de la requête sortante est trop long',
    ],
    answer: 1,
    explanation:
      "**SSRF avec bypass (CWE-918)** : deux failles. (1) **DNS rebinding / TOCTOU** : la vérification et la requête font **deux résolutions DNS** distinctes ; l'attaquant renvoie une IP publique à la vérif puis `127.0.0.1` à la requête. (2) **Couverture incomplète** : ne bloquer que le loopback laisse passer `169.254.169.254` (métadonnées cloud) et les IP privées. Correctif : **résoudre l'IP une seule fois** et l'utiliser pour la connexion, **bloquer tout l'espace interne** (loopback + privé + link-local), allowlist.",
    tags: ['appsec', 'ssrf', 'dns-rebinding', 'cwe-918'],
  },

  // ============ BYPASS DE FILTRES (PayloadsAllTheThings) ============
  {
    id: 'rv-bypass-xss-script',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'Contourner un filtre anti <script>',
    company: 'PayloadsAllTheThings',
    scenario: "Un filtre supprime la balise <script> de l'entrée. Le développeur pense le XSS bloqué.",
    question: 'Comment exécuter du JS sans <script> ?',
    options: [
      'C\'est impossible d\'exécuter du JS sans <script>',
      'Via des handlers d\'événement : <img onerror> ou <svg onload>',
      'Il faudrait servir la page en HTTPS',
      'En doublant simplement les balises <script>',
    ],
    answer: 1,
    explanation:
      "Bloquer `<script>` ne bloque **rien** : le JS s'exécute via des **event handlers** — `<img src=x onerror=alert(1)>`, `<svg onload=...>`, `<body onload=...>`, `<input autofocus onfocus=...>`. Une **blocklist** de balises/mots est structurellement perdante. Vraie défense : **encodage de sortie contextuel** (HTML-encode) + **CSP** sans `unsafe-inline`.",
    tags: ['appsec', 'xss', 'bypass', 'cwe-79'],
  },
  {
    id: 'rv-bypass-xss-nested',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Filtre qui strip <script> une fois',
    company: 'PayloadsAllTheThings',
    scenario: "Un sanitizer retire <script> en UNE passe (non récursive).",
    question: 'Quel payload le contourne ?',
    options: [
      'Écrire <SCRIPT> en majuscules pour tromper le filtre',
      '<scr<script>ipt> : les fragments se recomposent après suppression',
      'Envoyer un payload très long qui sature le filtre',
      'Encoder le payload en base64 avant l\'envoi',
    ],
    answer: 1,
    explanation:
      "**Bypass de sanitizer non récursif** : `<scr<script>ipt>` → après avoir retiré le `<script>` du milieu, il reste `<scr` + `ipt>` = `<script>` **reconstitué**. Un `replace` de chaîne, même en boucle, reste fragile. Vraie défense : un **sanitizer basé sur un vrai parseur HTML avec allowlist** (DOMPurify), pas du remplacement textuel.",
    tags: ['appsec', 'xss', 'bypass', 'sanitizer', 'cwe-79'],
  },
  {
    id: 'rv-bypass-cmdi-ifs',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Injection de commande sans espace',
    company: 'PayloadsAllTheThings',
    scenario: "Un filtre supprime tous les espaces de l'entrée pour empêcher `cat /etc/passwd`.",
    question: 'Comment injecter quand même une commande avec argument ?',
    options: [
      'Impossible d\'injecter une commande sans espace',
      'Utiliser ${IFS} ou la brace expansion : {cat,/etc/passwd}',
      'Encoder chaque espace en %20 dans l\'entrée',
      'Doubler la commande pour contourner le filtre',
    ],
    answer: 1,
    explanation:
      "Supprimer les espaces ne suffit pas : `${IFS}` (Internal Field Separator du shell) et la **brace expansion** `{cat,/etc/passwd}` recréent la séparation sans espace littéral. On peut aussi utiliser une tabulation (`%09`) ou `<`. Vraie défense : **ne pas passer par un shell** — exécuter avec un **tableau d'arguments** (`execve`, `subprocess([...], shell=False)`).",
    tags: ['appsec', 'command-injection', 'bypass', 'cwe-78'],
  },
  {
    id: 'rv-bypass-upload-ext',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Bypass de blocklist d\'upload',
    company: 'PayloadsAllTheThings',
    scenario: "Un upload interdit l'extension .php pour empêcher les webshells.",
    question: 'Comment uploader un fichier exécutable malgré la blocklist ?',
    options: [
      'En chiffrant le fichier avant de l\'uploader',
      'Extensions alternatives exécutées : .phtml, .php5, .phar, .pHp',
      'En réduisant fortement la taille du fichier',
      'En ajoutant simplement .php à la blocklist',
    ],
    answer: 1,
    explanation:
      "Une **blocklist** d'extensions est structurellement contournable : `.phtml`, `.php3/4/5/7`, `.phar`, `.pht` restent **exécutés** par le serveur, tout comme les variations de casse (`.pHp`) sur un FS insensible à la casse, ou la double extension `shell.php.jpg`. Vraie défense : **allowlist** stricte, **renommer** avec un nom généré, servir depuis un dossier **non exécutant** (ou hors webroot).",
    tags: ['appsec', 'file-upload', 'bypass', 'cwe-434'],
  },
  {
    id: 'rv-bypass-upload-magic',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Polyglotte GIF/PHP',
    company: 'PayloadsAllTheThings',
    scenario: "Un upload valide le type par les 'magic bytes' (signature) : le fichier doit commencer par GIF87a.",
    question: 'Comment passer un webshell PHP ?',
    options: [
      'Impossible avec une vérification des magic bytes',
      'Préfixer le PHP par GIF87a : polyglotte GIF valide + PHP',
      'Changer le Content-Type déclaré de la requête',
      'Compresser le fichier pour masquer le payload',
    ],
    answer: 1,
    explanation:
      "Un fichier peut être un **polyglotte** : commencer par `GIF87a` (signature GIF valide) **puis** contenir `<?php ... ?>`. La vérification des magic bytes ne lit que le **début** → elle voit un GIF, mais le serveur exécute le PHP. Vraie défense : combiner **allowlist d'extension**, **re-encodage/normalisation** de l'image (qui détruit le code injecté), et **stockage non exécutable**.",
    tags: ['appsec', 'file-upload', 'polyglot', 'cwe-434'],
  },
  {
    id: 'rv-bypass-cors-null',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'CORS : origine null',
    company: 'PayloadsAllTheThings',
    scenario: "Un serveur autorise l'origine `null` dans sa configuration CORS (avec credentials).",
    question: 'Pourquoi est-ce exploitable ?',
    options: [
      'null désigne l\'origine locale, c\'est donc sûr',
      'Un iframe sandboxé ou une data: URI produit Origin: null',
      'null est en réalité une erreur de syntaxe',
      'Il suffit de passer la connexion en HTTPS',
    ],
    answer: 1,
    explanation:
      "**CORS mal configuré (CWE-346)** : `Origin: null` n'est pas « local et sûr » — **tout attaquant peut le produire** depuis un `<iframe sandbox>` ou une `data:` URI. Si le serveur renvoie `Access-Control-Allow-Origin: null` avec `Allow-Credentials: true`, la page attaquante lit les réponses authentifiées. Correctif : **ne jamais autoriser `null`** ; allowlist d'origines réelles.",
    tags: ['appsec', 'cors', 'bypass', 'cwe-346'],
  },
  {
    id: 'rv-bypass-cors-regex',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'CORS : regex mal ancrée',
    company: 'PayloadsAllTheThings',
    scenario: "La validation d'origine CORS utilise cette vérification.",
    question: 'Quels domaines attaquants passent ?',
    language: 'javascript',
    code: `if (origin.endsWith("example.com")) {
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
}`,
    options: [
      'La méthode endsWith est lente à l\'exécution',
      'endsWith(\'example.com\') matche aussi evil-example.com',
      'Il faut ajouter l\'en-tête Access-Control-Allow-Methods',
      'La variable origin peut être undefined ici',
    ],
    answer: 1,
    explanation:
      "**Validation d'origine défaillante (CWE-346)** : `endsWith('example.com')` accepte **`evil-example.com`**, `attacker-example.com`, etc. (et une regex `^https://api.example.com$` avec `.` non échappé matcherait `apiXexample.com`). Correctif : **comparaison exacte** de l'origine complète contre une **allowlist**, ou une regex **ancrée** avec `\\.` échappé.",
    tags: ['appsec', 'cors', 'bypass', 'regex', 'cwe-346'],
  },
  {
    id: 'rv-ssti-fingerprint',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Fingerprint d\'un moteur de template',
    company: 'PayloadsAllTheThings',
    scenario: "Une entrée est reflétée dans une page. Tu injectes {{7*7}} et la page affiche 49.",
    question: 'Que conclus-tu, et comment affiner ?',
    options: [
      'C\'est un XSS classique reflété dans la page',
      'SSTI (exécution serveur) ; {{7*\'7\'}} distingue Jinja2 de Twig',
      'C\'est de la chance, le calcul est côté navigateur',
      'Il faut plutôt essayer la syntaxe ${7*7}',
    ],
    answer: 1,
    explanation:
      "`{{7*7}}` → `49` révèle un **SSTI** (le serveur **évalue** l'expression du template) — pas un simple XSS, et bien plus grave (souvent RCE). Pour identifier le moteur : `{{7*'7'}}` donne `7777777` en **Jinja2/Python** (répétition de chaîne) mais `49` en **Twig**. Les syntaxes `${7*7}` (Java), `#{7*7}`, `<%= 7*7 %>` (ERB) et les messages d'erreur affinent le diagnostic. Défense : données en **variables de contexte**, jamais dans la source du template + sandbox.",
    tags: ['appsec', 'ssti', 'fingerprint', 'cwe-1336'],
  },

  // ============ BUGS LOGIQUES (PortSwigger / bug bounty) ============
  {
    id: 'rv-logic-client-price',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Le prix envoyé par le client',
    company: 'Business logic',
    scenario: "La page produit poste productId, quantity ET price. Le serveur additionne les price reçus.",
    question: 'Quelle est la faille logique ?',
    language: 'javascript',
    code: `app.post('/cart/add', (req, res) => {
  const { productId, quantity, price } = req.body;
  cart.total += price * quantity;   // fait confiance au price
});`,
    options: [
      'Injection SQL via le paramètre productId',
      'Le serveur fait confiance au price envoyé par le client',
      'Le champ quantity peut être une chaîne de caractères',
      'Il faudrait servir cet endpoint en HTTPS',
    ],
    answer: 1,
    explanation:
      "**Excessive trust in client-side controls (business logic)** : le **prix ne doit jamais venir du client**. En interceptant la requête, l'attaquant met `price=1` et paie une bouchée de pain. Correctif : le serveur **relit le prix depuis la base** à partir du seul `productId` ; `price` reçu du client est ignoré. Aucun scanner ne détecte ça — c'est de la logique métier.",
    tags: ['appsec', 'business-logic', 'client-trust'],
  },
  {
    id: 'rv-logic-discount-remove',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Remise seuil contournée',
    company: 'PortSwigger',
    scenario:
      "« -10 % dès 1000 € d'achat. » Le système valide la remise quand le panier franchit 1000 €.",
    question: 'Comment l\'attaquant paie-t-il moins ?',
    options: [
      'En modifiant le code promo appliqué au panier',
      'Franchir 1000 € pour la remise, puis retirer des articles',
      'En dupliquant le compte pour cumuler les remises',
      'En forçant la connexion du panier en HTTPS',
    ],
    answer: 1,
    explanation:
      "**Bug logique de workflow** : l'éligibilité à la remise est figée **trop tôt**. On atteint 1000 € (remise validée), puis on **retire** des articles avant paiement → la remise persiste sur un petit panier. Correctif : **recalculer l'éligibilité au moment final du paiement**, sur le contenu réel du panier. Hypothèse cachée fausse : « le panier ne change plus après validation de la remise ».",
    tags: ['appsec', 'business-logic', 'discount'],
  },
  {
    id: 'rv-logic-2fa-response',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: '2FA : manipulation de réponse',
    company: 'Bug bounty',
    scenario:
      "La vérification OTP renvoie {\"status\":\"failure\"}. Le front redirige vers le compte si status == 'success'.",
    question: 'Comment contourner la 2FA ?',
    options: [
      'Bruteforcer le code OTP jusqu\'à le trouver',
      'Intercepter la réponse et remplacer failure par success',
      'C\'est du MITM : il faut du certificate pinning',
      'Le code OTP à 6 chiffres est trop court',
    ],
    answer: 1,
    explanation:
      "**Excessive client-side trust** : la **décision d'accès est prise côté client** (`if status=='success'`). Le titulaire **intercepte sa propre réponse** et remplace `failure` par `success` → il entre. Le certificate pinning n'y change rien (c'est lui l'« attaquant »). Correctif : la validation OTP réussie doit délivrer un **jeton d'autorisation côté serveur** ; le client ne décide **jamais** de l'authentification.",
    tags: ['appsec', 'business-logic', '2fa', 'response-manipulation'],
  },
  {
    id: 'rv-logic-otp-notbound',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'OTP non lié à l\'action',
    company: 'Bug bounty',
    scenario:
      "Un OTP confirme un virement. Le même endpoint de validation OTP sert aussi à changer une préférence anodine.",
    question: 'Comment l\'attaquant abuse-t-il ?',
    options: [
      'Il faut passer du canal SMS au TOTP',
      'Rejouer un OTP obtenu pour une action anodine sur le virement',
      'Le code OTP devrait être plus long',
      'Il faudrait chiffrer l\'OTP en transit',
    ],
    answer: 1,
    explanation:
      "**Bug logique d'authentification** : un OTP valide prouve « l'utilisateur a un code », mais **pas pour quelle action**. S'il n'est pas **lié à l'opération**, l'attaquant obtient un OTP pour une action bénigne et le **rejoue** pour valider une action sensible (virement). Correctif : lier chaque OTP à **(utilisateur, action, montant/paramètres)**, usage **unique**, **expiration courte**, et le vérifier au regard de l'action réellement exécutée. Le canal (SMS/TOTP) n'est pas le sujet.",
    tags: ['appsec', 'business-logic', 'otp'],
  },
  {
    id: 'rv-logic-email-parser',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Discordance de parseur d\'email',
    company: 'PortSwigger',
    scenario:
      "L'inscription auto-approuve les emails finissant par @entreprise.com (accès à l'espace org).",
    question: 'Comment un attaquant obtient-il l\'accès ?',
    options: [
      'Utiliser une regex de validation plus longue',
      'S\'inscrire avec attacker@entreprise.com@evil.com (discordance)',
      'Il faut bloquer les caractères + dans l\'email',
      'C\'est en réalité une faille de type XSS',
    ],
    answer: 1,
    explanation:
      "**Email parser discrepancy** : différents composants **parsent l'email différemment**. Le validateur voit « se termine par / contient `entreprise.com` » et approuve, mais l'envoi (ou un autre composant) route le mail vers **`evil.com`** — ou l'inverse. Correctif : **un seul parseur RFC strict** pour extraire le domaine, et **vérifier la propriété du domaine** par un **lien de confirmation réellement délivré**. Le problème n'est pas la longueur de la regex mais la **divergence** entre composants.",
    tags: ['appsec', 'business-logic', 'email-parsing'],
  },
  {
    id: 'rv-logic-otp-race',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Bruteforce OTP par race',
    company: 'PortSwigger',
    scenario:
      "Après 3 codes OTP faux, le compte est verrouillé. Le compteur d'échecs s'incrémente à chaque tentative.",
    question: 'Comment tester tout l\'espace du code malgré la limite ?',
    options: [
      'Impossible avec un verrou après 3 essais',
      'Envoyer des centaines de tentatives en parallèle (race)',
      'Le code OTP à 6 chiffres est trop court',
      'Il faut simplement ajouter un CAPTCHA',
    ],
    answer: 1,
    explanation:
      "**Race condition sur l'anti-bruteforce** : si le compteur d'échecs est lu puis incrémenté de façon **non atomique**, des **centaines de tentatives parallèles** (single-packet attack) passent toutes le check « < 3 » avant qu'aucune n'ait incrémenté → tout l'espace de l'OTP est testé avant le verrou. Correctif : **incrément atomique** du compteur avant traitement, **verrou par compte**, et **invalider l'OTP** dès la première tentative.",
    tags: ['appsec', 'business-logic', 'race-condition', 'otp'],
  },
  {
    id: 'rv-logic-team-limit',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Dépasser une limite de plan (race)',
    company: 'Bug bounty',
    scenario:
      "Un plan SaaS limite à 5 membres. L'ajout vérifie nb_membres < 5 puis insère.",
    question: 'Comment ajouter 14 membres sur un plan à 5 ?',
    options: [
      'En cachant le bouton d\'invitation côté interface',
      'Envoyer 10 invitations en parallèle (limit overrun)',
      'En changeant le plan tarifaire côté client',
      'Avec une injection SQL sur la table des membres',
    ],
    answer: 1,
    explanation:
      "**Limit overrun (race condition)** : la vérification `nb_membres < 5` et l'insertion ne sont pas atomiques → des invitations **parallèles** lisent toutes l'ancien compte et insèrent. Correctif : **compteur vérifié et incrémenté dans la même transaction** (ou contrainte de quota en base, `SELECT ... FOR UPDATE`). Cacher le bouton (UI) est trivialement contournable.",
    tags: ['appsec', 'business-logic', 'race-condition', 'limit-overrun'],
  },
  {
    id: 'rv-logic-mandatory-param',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Le paramètre requis... supprimé',
    company: 'PortSwigger',
    scenario:
      "Un changement de mot de passe vérifie l'ancien mot de passe SI le paramètre currentPassword est présent.",
    question: 'Comment changer le mot de passe sans connaître l\'ancien ?',
    options: [
      'Bruteforcer l\'ancien mot de passe du compte',
      'Supprimer entièrement le paramètre currentPassword de la requête',
      'Envoyer le paramètre currentPassword avec une valeur vide',
      'C\'est un problème de politique de mot de passe',
    ],
    answer: 1,
    explanation:
      "**Flawed assumption (business logic)** : le code ne vérifie l'ancien mot de passe **que si** le paramètre est **présent**. En le **supprimant** entièrement de la requête, l'attaquant saute la branche de contrôle. Hypothèse fausse : « le navigateur envoie toujours tous les champs ». Correctif : **exiger explicitement** la présence **et** la validité de chaque paramètre requis, et **échouer par défaut** en son absence.",
    tags: ['appsec', 'business-logic', 'mandatory-fields'],
  },
];
