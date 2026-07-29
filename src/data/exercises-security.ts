import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Code Review Sécurité » — repère la vulnérabilité dans un extrait réel.
// Multi-langages (SQL, Python, JS/Node, PHP, C). Chaque item cite sa CWE.
// Inspiré des classiques OWASP / PortSwigger / CWE-MITRE.
// ---------------------------------------------------------------------------

export const securityExercises: Exercise[] = [
  // ================= INJECTIONS SQL =================
  {
    id: 'sec-sqli-python',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'SQL injection (Python)',
    company: 'CWE-89',
    scenario: "Revue de code d'une API Flask. Un endpoint recherche un utilisateur par nom.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'python',
    code: `@app.route("/user")
def get_user():
    name = request.args.get("name")
    q = "SELECT * FROM users WHERE name = '" + name + "'"
    return db.execute(q).fetchall()`,
    options: [
      "Le endpoint devrait être en POST",
      "SQL injection : le paramètre `name` est concaténé dans la requête. Un input comme ' OR '1'='1 modifie la requête. Il faut une requête PARAMÉTRÉE : db.execute(\"... WHERE name = ?\", (name,))",
      "fetchall() est trop lent",
      "Il manque un try/except",
    ],
    answer: 1,
    explanation:
      "**SQL injection (CWE-89)** : concaténer l'input dans la requête permet à l'attaquant d'injecter du SQL (`' OR '1'='1' --`, UNION, etc.). Correctif : **requête paramétrée / prepared statement** — `db.execute(\"SELECT * FROM users WHERE name = ?\", (name,))`. Le driver sépare alors le code SQL des données. Ne jamais construire du SQL par concaténation de chaînes.",
    tags: ['appsec', 'sqli', 'python', 'cwe-89'],
  },
  {
    id: 'sec-sqli-php',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'SQL injection (PHP)',
    company: 'CWE-89',
    scenario: "Page de login PHP legacy.",
    question: 'Où est la faille ?',
    language: 'php',
    code: `$user = $_POST['user'];
$pass = $_POST['pass'];
$sql = "SELECT * FROM users WHERE user='$user' AND pass='$pass'";
$result = mysqli_query($conn, $sql);`,
    options: [
      "mysqli_query est déprécié",
      "SQL injection : $user et $pass sont interpolés directement. `user=admin'--` contourne le mot de passe. Utiliser des requêtes préparées (mysqli_prepare + bind_param)",
      "Il faut chiffrer la connexion",
      "$_POST devrait être $_GET",
    ],
    answer: 1,
    explanation:
      "**SQL injection (CWE-89)** : l'interpolation de `$user`/`$pass` permet `admin'-- ` pour contourner l'authentification, ou pire. Correctif : **requêtes préparées** avec `mysqli_prepare(...)` + `bind_param('ss', $user, $pass)` (ou PDO). Bonus : les mots de passe ne doivent jamais être comparés en clair — ils doivent être hachés (bcrypt/argon2).",
    tags: ['appsec', 'sqli', 'php', 'cwe-89'],
  },
  {
    id: 'sec-sqli-node',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'SQL injection (Node)',
    company: 'CWE-89',
    scenario: "API Node.js avec le driver `pg` (PostgreSQL).",
    question: 'Quel est le problème ?',
    language: 'javascript',
    code: `app.get('/orders', async (req, res) => {
  const id = req.query.id;
  const { rows } = await pool.query(
    \`SELECT * FROM orders WHERE user_id = \${id}\`
  );
  res.json(rows);
});`,
    options: [
      "async/await est mal utilisé",
      "SQL injection via template literal : `${id}` injecte directement l'input. Utiliser une requête paramétrée : pool.query('SELECT ... WHERE user_id = $1', [id])",
      "Il faut un middleware CORS",
      "res.json est incorrect",
    ],
    answer: 1,
    explanation:
      "**SQL injection (CWE-89)** : le template literal `${id}` concatène l'input dans le SQL. Le driver `pg` supporte les **paramètres** : `pool.query('SELECT * FROM orders WHERE user_id = $1', [id])`. Ne jamais confondre l'interpolation de chaîne JS avec un paramètre SQL sécurisé.",
    tags: ['appsec', 'sqli', 'javascript', 'node', 'cwe-89'],
  },

  // ================= COMMAND INJECTION =================
  {
    id: 'sec-cmdi-python',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Command injection (Python)',
    company: 'CWE-78',
    scenario: "Un outil convertit une image via ImageMagick.",
    question: 'Quelle est la vulnérabilité critique ?',
    language: 'python',
    code: `import os
def convert(filename):
    os.system("convert " + filename + " output.png")`,
    options: [
      "os.system est lent",
      "OS command injection : `filename` non validé passe au shell. Un nom comme 'a.png; rm -rf /' exécute des commandes arbitraires. Utiliser subprocess.run([...], shell=False) avec une liste d'arguments",
      "Il faut vérifier l'extension du fichier",
      "output.png devrait être unique",
    ],
    answer: 1,
    explanation:
      "**OS command injection (CWE-78)** : `os.system` passe la chaîne au **shell**, donc `; rm -rf /`, `$(...)`, backticks et `|` sont interprétés. Correctif : `subprocess.run(['convert', filename, 'output.png'], shell=False)` — la liste d'arguments évite le shell et l'injection. Valider aussi le nom de fichier (allowlist).",
    tags: ['appsec', 'command-injection', 'python', 'cwe-78'],
  },
  {
    id: 'sec-cmdi-node',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Command injection (Node)',
    company: 'CWE-78',
    scenario: "Un endpoint ping un host fourni par l'utilisateur.",
    question: 'Où est la faille ?',
    language: 'javascript',
    code: `const { exec } = require('child_process');
app.get('/ping', (req, res) => {
  exec('ping -c 1 ' + req.query.host, (e, out) => res.send(out));
});`,
    options: [
      "exec est asynchrone",
      "Command injection : `host` va au shell via exec(). '8.8.8.8; cat /etc/passwd' exécute des commandes. Utiliser execFile('ping', ['-c','1', host]) qui n'invoque pas de shell",
      "ping nécessite root",
      "Il manque un timeout",
    ],
    answer: 1,
    explanation:
      "**Command injection (CWE-78)** : `exec()` lance un **shell**, donc `; cat /etc/passwd`, `&&`, `|` sont interprétés. Correctif : `execFile('ping', ['-c', '1', host])` — pas de shell, `host` est un argument littéral. Et valider `host` (regex IP/hostname). Règle : préférer toujours `execFile`/`spawn` avec un tableau d'arguments à `exec`.",
    tags: ['appsec', 'command-injection', 'javascript', 'node', 'cwe-78'],
  },

  // ================= XSS =================
  {
    id: 'sec-xss-dom',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'XSS DOM (JavaScript)',
    company: 'CWE-79',
    scenario: "Une recherche affiche le terme saisi sur la page.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'javascript',
    code: `const q = new URLSearchParams(location.search).get('q');
document.getElementById('results').innerHTML =
  'Résultats pour : ' + q;`,
    options: [
      "innerHTML est déprécié",
      "XSS DOM-based : `q` (contrôlé par l'URL) est injecté via innerHTML. Un payload <img src=x onerror=alert(1)> s'exécute. Utiliser textContent (pas innerHTML) ou échapper/assainir",
      "URLSearchParams ne marche pas partout",
      "Il faut encoder l'URL",
    ],
    answer: 1,
    explanation:
      "**XSS DOM-based (CWE-79)** : écrire une valeur contrôlée par l'attaquant dans `innerHTML` exécute le HTML/JS injecté (`<img src=x onerror=...>`, `<svg onload=...>`). Correctif : utiliser **`textContent`** (traite tout comme du texte) plutôt que `innerHTML`, ou assainir avec DOMPurify si du HTML est vraiment nécessaire.",
    tags: ['appsec', 'xss', 'javascript', 'cwe-79'],
  },
  {
    id: 'sec-xss-php',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'junior',
    title: 'XSS reflected (PHP)',
    company: 'CWE-79',
    scenario: "Une page affiche un message de bienvenue avec le nom en paramètre.",
    question: 'Où est la faille ?',
    language: 'php',
    code: `<?php
echo "Bonjour " . $_GET['name'] . " !";
?>`,
    options: [
      "echo est lent",
      "XSS reflected : $_GET['name'] est affiché sans échappement. name=<script>...</script> s'exécute chez la victime. Échapper avec htmlspecialchars($_GET['name'], ENT_QUOTES)",
      "Il faut utiliser print au lieu de echo",
      "$_GET devrait être $_REQUEST",
    ],
    answer: 1,
    explanation:
      "**XSS reflected (CWE-79)** : renvoyer l'input dans la page sans échappement permet d'injecter `<script>`. Correctif : **`htmlspecialchars($_GET['name'], ENT_QUOTES, 'UTF-8')`** convertit `< > & \" '` en entités HTML inoffensives. Échapper **en sortie**, selon le contexte (HTML, attribut, JS, URL).",
    tags: ['appsec', 'xss', 'php', 'cwe-79'],
  },

  // ================= PATH TRAVERSAL / SSRF =================
  {
    id: 'sec-path-traversal',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Path traversal (Python)',
    company: 'CWE-22',
    scenario: "Un endpoint sert des fichiers depuis un dossier public.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'python',
    code: `@app.route("/download")
def download():
    fn = request.args.get("file")
    return send_file("/var/www/files/" + fn)`,
    options: [
      "send_file est obsolète",
      "Path traversal : fn peut contenir ../../ pour sortir du dossier (file=../../etc/passwd). Il faut valider/normaliser : rejeter les .., utiliser os.path.basename ou vérifier que le chemin résolu reste dans le dossier",
      "Il manque un Content-Type",
      "Le dossier devrait être relatif",
    ],
    answer: 1,
    explanation:
      "**Path traversal (CWE-22)** : `../../etc/passwd` (ou encodages `..%2f`) sort du dossier prévu. Correctif : normaliser le chemin et **vérifier qu'il reste dans le répertoire autorisé** (`os.path.realpath` puis test de préfixe), ou n'accepter qu'un nom via `os.path.basename` + allowlist. Ne jamais concaténer directement un chemin fourni par l'utilisateur.",
    tags: ['appsec', 'path-traversal', 'python', 'cwe-22'],
  },
  {
    id: 'sec-ssrf',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'SSRF (Node)',
    company: 'CWE-918',
    scenario: "Un service récupère l'aperçu d'une URL fournie par l'utilisateur.",
    question: 'Quel est le risque ?',
    language: 'javascript',
    code: `app.post('/preview', async (req, res) => {
  const r = await fetch(req.body.url);
  res.send(await r.text());
});`,
    options: [
      "fetch n'existe pas en Node",
      "SSRF : l'URL non validée peut viser des ressources internes (http://169.254.169.254/ métadonnées cloud, http://localhost:.../, réseau interne). Valider par allowlist de domaines et bloquer les IP privées/loopback",
      "Il faut un cache",
      "res.send est incorrect",
    ],
    answer: 1,
    explanation:
      "**SSRF — Server-Side Request Forgery (CWE-918)** : le serveur fait une requête vers une URL contrôlée par l'attaquant, qui peut cibler `http://169.254.169.254/` (métadonnées cloud → vol de credentials), `localhost`, ou le réseau interne. Correctif : **allowlist** de domaines/schémas autorisés, résolution DNS + blocage des **plages privées/loopback**, désactiver les redirections.",
    tags: ['appsec', 'ssrf', 'javascript', 'cwe-918'],
  },

  // ================= AUTH / CRYPTO / SECRETS =================
  {
    id: 'sec-weak-hash',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'Hachage de mot de passe faible',
    company: 'CWE-916',
    scenario: "Stockage des mots de passe utilisateurs.",
    question: 'Quel est le problème ?',
    language: 'python',
    code: `import hashlib
def store_password(pw):
    h = hashlib.md5(pw.encode()).hexdigest()
    db.save(h)`,
    options: [
      "hashlib est déprécié",
      "MD5 est rapide et cassé pour les mots de passe : pas de sel, vulnérable aux rainbow tables et au bruteforce GPU. Utiliser un algo lent à sel (bcrypt, argon2, scrypt)",
      "Il faut chiffrer, pas hacher",
      "hexdigest devrait être digest",
    ],
    answer: 1,
    explanation:
      "**Hachage faible (CWE-916)** : MD5 (et SHA-1/SHA-256 nu) est **rapide** → bruteforce GPU massif, et **sans sel** → rainbow tables. Les mots de passe exigent une fonction **lente et salée** : **bcrypt, scrypt ou argon2** (avec facteur de coût réglable). Ne jamais chiffrer un mot de passe (réversible) — on le **hache**.",
    tags: ['appsec', 'crypto', 'password', 'cwe-916'],
  },
  {
    id: 'sec-insecure-random',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Token prévisible (JavaScript)',
    company: 'CWE-338',
    scenario: "Génération d'un token de réinitialisation de mot de passe.",
    question: 'Quelle est la faille ?',
    language: 'javascript',
    code: `function resetToken() {
  return Math.random().toString(36).slice(2);
}`,
    options: [
      "toString(36) est incorrect",
      "Math.random() n'est PAS cryptographiquement sûr : son PRNG est prévisible, un attaquant peut deviner les tokens. Utiliser crypto.randomBytes(32).toString('hex')",
      "slice(2) enlève trop de caractères",
      "Il faut ajouter un timestamp",
    ],
    answer: 1,
    explanation:
      "**PRNG non sécurisé (CWE-338)** : `Math.random()` utilise un générateur **prévisible** (non cryptographique) — les tokens de sécurité (reset, session, CSRF) deviennent devinables. Correctif : **`crypto.randomBytes(32).toString('hex')`** (Node) ou `crypto.getRandomValues` (navigateur), ou `secrets.token_urlsafe` en Python.",
    tags: ['appsec', 'random', 'javascript', 'cwe-338'],
  },
  {
    id: 'sec-jwt-none',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'JWT : algorithme non vérifié',
    company: 'CWE-347',
    scenario: "Vérification d'un token JWT côté serveur.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'javascript',
    code: `const decoded = jwt.verify(token, secret);
// ...pas d'option algorithms
req.user = decoded;`,
    options: [
      "Il faut décoder avant de vérifier",
      "Ne pas fixer `algorithms` permet l'attaque alg=none ou une confusion RS256/HS256 (utiliser la clé publique comme secret HMAC). Toujours : jwt.verify(token, secret, { algorithms: ['HS256'] })",
      "secret devrait être en clair",
      "req.user est mal nommé",
    ],
    answer: 1,
    explanation:
      "**Vérification de signature défaillante (CWE-347)** : sans restreindre `algorithms`, un attaquant peut forger un token avec **`alg: none`** (aucune signature) ou provoquer une **confusion RS256↔HS256** (signer en HMAC avec la clé publique connue). Correctif : **imposer l'algorithme** — `jwt.verify(token, secret, { algorithms: ['HS256'] })`.",
    tags: ['appsec', 'jwt', 'javascript', 'cwe-347'],
  },
  {
    id: 'sec-hardcoded',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'junior',
    title: 'Secret en dur',
    company: 'CWE-798',
    scenario: "Configuration d'un client API dans le code.",
    question: 'Quel est le problème ?',
    language: 'python',
    code: `AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
client = boto3.client("s3",
    aws_secret_access_key=AWS_SECRET)`,
    options: [
      "boto3 est obsolète",
      "Secret codé en dur : une fois commité, il reste dans l'historique Git même après suppression, et fuit avec le code. Utiliser des variables d'environnement / un gestionnaire de secrets, et rotationner la clé exposée",
      "Il faut une région",
      "La clé est trop courte",
    ],
    answer: 1,
    explanation:
      "**Credentials codés en dur (CWE-798)** : un secret dans le code fuit avec le dépôt et **reste dans l'historique Git** même supprimé ensuite. Correctif : variables d'environnement, gestionnaire de secrets (Vault, AWS Secrets Manager), ou rôles IAM. Et toute clé exposée doit être **révoquée et rotationnée** immédiatement (elle est déjà compromise).",
    tags: ['appsec', 'secrets', 'python', 'cwe-798'],
  },
  {
    id: 'sec-timing',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Timing attack',
    company: 'CWE-208',
    scenario: "Comparaison d'un token/API-key reçu avec le secret attendu.",
    question: 'Quelle est la faiblesse subtile ?',
    language: 'python',
    code: `def check(token):
    return token == SECRET_TOKEN`,
    options: [
      "== ne marche pas sur les strings",
      "Comparaison non constante en temps : == s'arrête au premier caractère différent, fuitant de l'information temporelle qui permet de deviner le token octet par octet. Utiliser hmac.compare_digest",
      "Il faut hacher le token",
      "SECRET_TOKEN doit être global",
    ],
    answer: 1,
    explanation:
      "**Timing attack (CWE-208)** : l'opérateur `==` compare caractère par caractère et **s'arrête au premier écart** → le temps de réponse dépend du préfixe correct, ce qui permet de reconstituer le secret octet par octet. Correctif : comparaison **à temps constant** — `hmac.compare_digest(token, SECRET_TOKEN)` (Python) ou `crypto.timingSafeEqual` (Node).",
    tags: ['appsec', 'timing-attack', 'python', 'cwe-208'],
  },

  // ================= DESERIALIZATION / EVAL =================
  {
    id: 'sec-pickle',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Désérialisation dangereuse (Python)',
    company: 'CWE-502',
    scenario: "Un cache lit des objets sérialisés depuis une source externe.",
    question: 'Quel est le danger ?',
    language: 'python',
    code: `import pickle
def load_session(data):
    return pickle.loads(data)`,
    options: [
      "pickle est lent",
      "pickle.loads sur des données non fiables = RCE : le format pickle peut exécuter du code arbitraire à la désérialisation (__reduce__). Utiliser un format de données pur (JSON) pour les entrées externes",
      "Il faut préciser l'encodage",
      "data devrait être une string",
    ],
    answer: 1,
    explanation:
      "**Désérialisation non sécurisée (CWE-502)** : `pickle.loads` sur des données contrôlées par l'attaquant permet l'**exécution de code arbitraire** (méthode `__reduce__` déclenchée au unpickling). Idem `yaml.load` non-safe, `unserialize` PHP, `ObjectInputStream` Java. Correctif : pour des entrées externes, utiliser un **format de données inerte** (JSON) ; jamais pickle sur du non-fiable.",
    tags: ['appsec', 'deserialization', 'python', 'cwe-502'],
  },
  {
    id: 'sec-eval',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Code injection via eval',
    company: 'CWE-95',
    scenario: "Une calculatrice web évalue l'expression saisie.",
    question: 'Quelle est la faille critique ?',
    language: 'javascript',
    code: `app.get('/calc', (req, res) => {
  const result = eval(req.query.expr);
  res.send(String(result));
});`,
    options: [
      "eval est juste lent",
      "Code injection : eval() exécute l'input comme du JS. expr=require('child_process').execSync('...') donne une RCE serveur. Utiliser un parseur d'expression mathématique dédié, jamais eval sur de l'input",
      "req.query.expr peut être undefined",
      "String(result) est inutile",
    ],
    answer: 1,
    explanation:
      "**Code injection (CWE-95)** : `eval()` exécute la chaîne comme du **code** ; côté serveur c'est une **RCE** directe (`require('child_process')...`). Correctif : ne jamais `eval` de l'input. Pour évaluer des maths, utiliser une **bibliothèque de parsing dédiée** (mathjs avec évaluateur restreint) ou un parseur maison sans exécution de code.",
    tags: ['appsec', 'code-injection', 'javascript', 'cwe-95'],
  },

  // ================= MÉMOIRE C =================
  {
    id: 'sec-c-strcpy',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Buffer overflow (C)',
    company: 'CWE-120',
    scenario: "Fonction C qui copie un nom d'utilisateur dans un buffer fixe.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'c',
    code: `void greet(char *name) {
    char buf[32];
    strcpy(buf, name);
    printf("Hello %s\\n", buf);
}`,
    options: [
      "printf est mal utilisé",
      "Buffer overflow : strcpy ne vérifie pas la taille. Si name > 31 octets, il écrase la pile (stack smashing) → crash ou exécution de code. Utiliser strncpy/snprintf avec la taille du buffer",
      "buf devrait être global",
      "Il manque un free(buf)",
    ],
    answer: 1,
    explanation:
      "**Buffer overflow (CWE-120)** : `strcpy` copie sans borne ; un `name` de plus de 31 octets déborde `buf[32]` et écrase la pile (adresse de retour → exécution de code). Correctif : **`snprintf(buf, sizeof(buf), \"%s\", name)`** ou `strncpy` avec la taille (attention à la terminaison `\\0`). Éviter `strcpy`, `strcat`, `sprintf`, `gets`.",
    tags: ['appsec', 'buffer-overflow', 'c', 'cwe-120'],
  },
  {
    id: 'sec-c-gets',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'gets() interdit (C)',
    company: 'CWE-242',
    scenario: "Lecture d'une ligne au clavier.",
    question: 'Pourquoi ce code est-il dangereux ?',
    language: 'c',
    code: `char line[64];
gets(line);
process(line);`,
    options: [
      "line est trop petit",
      "gets() ne limite JAMAIS la taille lue → débordement de buffer garanti pour toute entrée > 63 octets. La fonction est si dangereuse qu'elle a été retirée du C11. Utiliser fgets(line, sizeof(line), stdin)",
      "Il faut initialiser line",
      "process devrait retourner un int",
    ],
    answer: 1,
    explanation:
      "**Usage d'une fonction intrinsèquement dangereuse (CWE-242)** : `gets()` lit sans **aucune** limite de taille → débordement systématique et vecteur d'exploitation historique (ver Morris). Elle a été **supprimée du standard C11**. Correctif : **`fgets(line, sizeof(line), stdin)`** qui borne la lecture.",
    tags: ['appsec', 'buffer-overflow', 'c', 'cwe-242'],
  },
  {
    id: 'sec-c-format',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Format string (C)',
    company: 'CWE-134',
    scenario: "Affichage d'un message fourni par l'utilisateur.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'c',
    code: `void log_msg(char *user_input) {
    printf(user_input);
}`,
    options: [
      "Il manque un \\n",
      "Format string : passer l'input comme chaîne de format permet %x/%n de lire la pile ou d'écrire en mémoire. Toujours printf(\"%s\", user_input)",
      "printf devrait être puts",
      "user_input doit être const",
    ],
    answer: 1,
    explanation:
      "**Format string (CWE-134)** : `printf(user_input)` interprète l'input comme **chaîne de format**. Des spécificateurs `%x` (lire la pile), `%s` (déréférencer), `%n` (**écrire** en mémoire) mènent à la fuite d'info ou l'exécution de code. Correctif : **`printf(\"%s\", user_input)`** — l'input est traité comme donnée, pas comme format.",
    tags: ['appsec', 'format-string', 'c', 'cwe-134'],
  },
  {
    id: 'sec-c-uaf',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Use-after-free (C)',
    company: 'CWE-416',
    scenario: "Gestion d'un buffer dynamique.",
    question: 'Quel est le bug de sécurité ?',
    language: 'c',
    code: `char *b = malloc(64);
strcpy(b, input);
free(b);
// ... plus loin
printf("%s\\n", b);`,
    options: [
      "malloc peut échouer",
      "Use-after-free : b est utilisé APRÈS free(b). Le bloc libéré peut être réalloué → lecture de données arbitraires, corruption, ou exécution de code. Mettre b = NULL après free et ne plus l'utiliser",
      "strcpy est correct ici",
      "Il faut caster malloc",
    ],
    answer: 1,
    explanation:
      "**Use-after-free (CWE-416)** : accéder à `b` après `free(b)` lit/écrit dans un bloc qui peut avoir été **réalloué** ailleurs → fuite de données, corruption de tas, exploitation. Correctif : ne plus utiliser le pointeur après `free`, et le mettre à **`NULL`** (un déréférencement de NULL crashe proprement au lieu d'exploiter). Attention aussi au double-free.",
    tags: ['appsec', 'use-after-free', 'c', 'cwe-416'],
  },
  {
    id: 'sec-c-intoverflow',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Integer overflow → heap overflow (C)',
    company: 'CWE-190',
    scenario: "Allocation d'un tableau dont la taille dépend de l'entrée.",
    question: 'Où est le piège ?',
    language: 'c',
    code: `int n = get_user_count();   // ex. attaquant : 1073741824
int *arr = malloc(n * sizeof(int));
for (int i = 0; i < n; i++) arr[i] = 0;`,
    options: [
      "La boucle est trop lente",
      "Integer overflow : n * sizeof(int) peut déborder la taille de size_t et wrapper à une petite valeur → malloc alloue trop peu, la boucle écrit hors du tas. Vérifier n et utiliser calloc(n, sizeof(int)) qui détecte l'overflow",
      "arr devrait être un char*",
      "Il faut free(arr)",
    ],
    answer: 1,
    explanation:
      "**Integer overflow (CWE-190)** : `n * sizeof(int)` peut **déborder** et retomber à une petite valeur → `malloc` sous-alloue, puis la boucle écrit **au-delà** (heap overflow). Correctif : valider les bornes de `n` et utiliser **`calloc(n, sizeof(int))`**, qui vérifie le débordement de la multiplication (et zéro-initialise).",
    tags: ['appsec', 'integer-overflow', 'c', 'cwe-190'],
  },

  // ================= JS SPÉCIFIQUE =================
  {
    id: 'sec-proto-pollution',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Prototype pollution (JS)',
    company: 'CWE-1321',
    scenario: "Une fonction de merge récursive fusionne un objet fourni par l'utilisateur.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'javascript',
    code: `function merge(target, src) {
  for (const k in src) {
    if (typeof src[k] === 'object')
      merge(target[k] = target[k] || {}, src[k]);
    else target[k] = src[k];
  }
}`,
    options: [
      "La récursion peut être infinie",
      "Prototype pollution : une clé '__proto__' (ou 'constructor'.'prototype') dans src modifie Object.prototype globalement → altère tous les objets (contournement d'auth, DoS, RCE). Rejeter les clés __proto__/constructor/prototype",
      "for...in est déprécié",
      "Il faut cloner target",
    ],
    answer: 1,
    explanation:
      "**Prototype pollution (CWE-1321)** : un payload `{\"__proto__\": {\"isAdmin\": true}}` fusionné récursivement écrit sur **`Object.prototype`**, donc sur **tous** les objets → contournement de contrôles, DoS, parfois RCE. Correctif : **rejeter les clés `__proto__`, `constructor`, `prototype`**, utiliser `Object.create(null)` ou `Map`, et des libs sûres (lodash à jour).",
    tags: ['appsec', 'prototype-pollution', 'javascript', 'cwe-1321'],
  },
  {
    id: 'sec-redos',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'ReDoS (JavaScript)',
    company: 'CWE-1333',
    scenario: "Validation d'un email par expression régulière sur une entrée utilisateur.",
    question: 'Quel est le risque de cette regex ?',
    language: 'javascript',
    code: `const re = /^(a+)+$/;
if (re.test(req.body.input)) { /* ... */ }`,
    options: [
      "La regex ne valide pas les emails",
      "ReDoS : le motif (a+)+ est catastrophiquement rétrograde. Une entrée comme 'aaaa...!' provoque un backtracking exponentiel qui gèle le thread (DoS). Éviter les quantificateurs imbriqués ; utiliser une regex linéaire ou un validateur non-backtracking",
      "test() renvoie toujours true",
      "Il faut compiler la regex",
    ],
    answer: 1,
    explanation:
      "**ReDoS — Regular expression Denial of Service (CWE-1333)** : les **quantificateurs imbriqués** (`(a+)+`, `(a|a)*`) provoquent un **backtracking exponentiel**. Une entrée piégée (`aaaaaaaaaa!`) gèle l'event loop → déni de service. Correctif : réécrire en motif **linéaire** (pas de quantificateur sur groupe déjà quantifié), limiter la taille de l'input, ou un moteur regex sans backtracking (RE2).",
    tags: ['appsec', 'redos', 'javascript', 'cwe-1333'],
  },

  // ================= XXE / IDOR / CORS =================
  {
    id: 'sec-xxe',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'XXE (Python)',
    company: 'CWE-611',
    scenario: "Parsing d'un XML reçu d'un client.",
    question: 'Quelle est la faille ?',
    language: 'python',
    code: `from lxml import etree
def parse(xml_bytes):
    return etree.fromstring(xml_bytes)`,
    options: [
      "lxml est lent",
      "XXE : le parseur autorise par défaut les entités externes. Un XML avec <!ENTITY xxe SYSTEM 'file:///etc/passwd'> lit des fichiers locaux / fait du SSRF. Configurer un parser avec resolve_entities=False (no_network, no DTD)",
      "fromstring devrait être parse",
      "Il faut décoder en UTF-8",
    ],
    answer: 1,
    explanation:
      "**XXE — XML External Entity (CWE-611)** : un parseur qui résout les **entités externes** permet `<!ENTITY xxe SYSTEM \"file:///etc/passwd\">` (lecture de fichiers), du **SSRF** (`http://...`), ou un DoS (billion laughs). Correctif : désactiver DTD et entités externes — en lxml, `etree.XMLParser(resolve_entities=False, no_network=True)` ; en général, `defusedxml`.",
    tags: ['appsec', 'xxe', 'python', 'cwe-611'],
  },
  {
    id: 'sec-idor',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'IDOR / Broken Access Control',
    company: 'CWE-639',
    scenario: "Endpoint qui renvoie une facture par son identifiant.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'javascript',
    code: `app.get('/invoice/:id', auth, async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  res.json(inv);
});`,
    options: [
      "findById peut renvoyer null",
      "IDOR : l'utilisateur est authentifié mais on ne vérifie pas qu'il POSSÈDE la facture. Changer :id accède aux factures d'autrui. Filtrer par propriétaire : findOne({ _id: id, userId: req.user.id })",
      "Il manque un try/catch",
      "auth est mal placé",
    ],
    answer: 1,
    explanation:
      "**IDOR — Insecure Direct Object Reference (CWE-639)**, cœur du **Broken Access Control** (OWASP A01) : `auth` prouve **qui** tu es, mais pas que tu as le **droit** sur CET objet. En changeant `:id`, on lit les factures d'autrui. Correctif : **contrôle d'autorisation au niveau objet** — `Invoice.findOne({ _id: id, userId: req.user.id })`. Ne jamais se fier à l'obscurité de l'ID.",
    tags: ['appsec', 'idor', 'access-control', 'cwe-639'],
  },
  {
    id: 'sec-cors',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'CORS dangereusement permissif',
    company: 'CWE-942',
    scenario: "Configuration CORS d'une API qui utilise des cookies de session.",
    question: 'Pourquoi cette config est-elle dangereuse ?',
    language: 'javascript',
    code: `res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
res.setHeader('Access-Control-Allow-Credentials', 'true');`,
    options: [
      "Il manque Allow-Methods",
      "Refléter aveuglément l'Origin + Allow-Credentials:true revient à autoriser TOUTE origine avec les cookies : n'importe quel site peut faire des requêtes authentifiées au nom de la victime. Valider l'Origin contre une allowlist stricte",
      "setHeader est déprécié",
      "true doit être un booléen",
    ],
    answer: 1,
    explanation:
      "**CORS mal configuré (CWE-942)** : renvoyer `Access-Control-Allow-Origin: <origin reflétée>` **avec** `Allow-Credentials: true` autorise **n'importe quel site** à envoyer des requêtes **avec les cookies** de la victime → vol de données authentifiées. (Le wildcard `*` est d'ailleurs interdit avec credentials.) Correctif : comparer `Origin` à une **allowlist stricte** et ne renvoyer l'en-tête que pour les origines de confiance.",
    tags: ['appsec', 'cors', 'javascript', 'cwe-942'],
  },

  // ================= INJECTIONS AVANCÉES =================
  {
    id: 'sec-sqli-blind',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'SQLi aveugle dans un cookie',
    company: 'PortSwigger',
    scenario: "Un tracker lit un identifiant depuis un cookie. Le résultat n'est jamais affiché.",
    question: 'Est-ce sûr puisque rien n\'est renvoyé au client ?',
    language: 'php',
    code: `$tracking = $_COOKIE['TrackingId'];
$sql = "SELECT COUNT(*) FROM tracking WHERE id = '$tracking'";
mysqli_query($conn, $sql);`,
    options: [
      "Sûr : le résultat n'est jamais affiché",
      "Blind SQL injection : même sans sortie, l'attaquant infère l'info par le comportement (' AND 1=1-- vs 1=2--) ou le temps (WAITFOR/SLEEP). Un cookie est une source non fiable. Paramétrer la requête",
      "Le problème est mysqli, il faut PDO",
      "COUNT(*) est trop lent",
    ],
    answer: 1,
    explanation:
      "**Blind SQL injection (CWE-89)** : l'absence de sortie n'immunise pas. L'attaquant exploite un canal **inférentiel** — booléen (différence de comportement entre `1=1` et `1=2`) ou **temporel** (`; WAITFOR DELAY`/`SLEEP`). Piège fréquent : oublier que **cookies, en-têtes, User-Agent** sont des sources non fiables. Correctif : requête paramétrée, toujours.",
    tags: ['appsec', 'sqli', 'blind', 'php', 'cwe-89'],
  },
  {
    id: 'sec-nosqli',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'NoSQL injection (MongoDB)',
    company: 'CWE-943',
    scenario: "Login sur une API Node + MongoDB.",
    question: 'Comment contourner le mot de passe ?',
    language: 'javascript',
    code: `db.collection('users').findOne({
  username: req.body.username,
  password: req.body.password
});`,
    options: [
      "findOne renvoie plusieurs résultats",
      "NoSQL injection : un body JSON {\"username\":\"admin\",\"password\":{\"$ne\":null}} injecte un OPÉRATEUR Mongo qui matche tout mot de passe. Caster en String et valider les types (schéma)",
      "Il faut un index sur username",
      "MongoDB est déprécié",
    ],
    answer: 1,
    explanation:
      "**NoSQL injection (CWE-943)** : `req.body` peut contenir des **objets**, pas juste des chaînes. `{\"password\": {\"$ne\": null}}` devient l'opérateur Mongo `$ne` → matche n'importe quel mot de passe. Correctif : **caster** (`String(req.body.password)`), valider les types via un schéma (Joi/Zod), ou forcer `{ $eq: ... }`.",
    tags: ['appsec', 'nosql', 'javascript', 'cwe-943'],
  },
  {
    id: 'sec-ssti',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Template injection (SSTI)',
    company: 'PortSwigger',
    scenario: "Une page Flask salue l'utilisateur par son nom.",
    question: 'Quelle est la vulnérabilité ?',
    language: 'python',
    code: `from jinja2 import Template
name = request.args.get('name')
return Template("<h1>Hello " + name + "</h1>").render()`,
    options: [
      "Il manque un doctype HTML",
      "SSTI : name est concaténé dans la SOURCE du template puis compilé. ?name={{7*7}} donne 49 ; {{config}} ou l'accès aux classes mène à la RCE. Passer name en VARIABLE : render_template_string('Hello {{name}}', name=name)",
      "Template est déprécié",
      "Il faut échapper le HTML",
    ],
    answer: 1,
    explanation:
      "**Server-Side Template Injection (CWE-1336)** : construire le template avec l'input le fait **compiler** comme du code de template. `{{7*7}}` → `49`, puis `{{''.__class__.__mro__[1].__subclasses__()}}` → **RCE**. Correctif : ne jamais bâtir la source avec l'input ; passer la donnée en **variable de contexte** (`render_template_string(\"Hello {{name}}\", name=name)`). L'auto-échappement de Jinja ne protège **pas** de la SSTI.",
    tags: ['appsec', 'ssti', 'python', 'cwe-1336'],
  },
  {
    id: 'sec-ldap',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'LDAP injection',
    company: 'CWE-90',
    scenario: "Recherche d'un utilisateur dans un annuaire LDAP.",
    question: 'Où est la faille ?',
    language: 'php',
    code: `$user = $_GET['user'];
$filter = "(&(objectClass=person)(uid=$user))";
ldap_search($ds, "dc=example,dc=com", $filter);`,
    options: [
      "objectClass devrait être en minuscules",
      "LDAP injection : $user injecté dans le filtre. Un input *)(uid=*))(|(uid=* altère la logique du filtre (contournement d'auth, énumération). Échapper avec ldap_escape($user, '', LDAP_ESCAPE_FILTER)",
      "ldap_search est obsolète",
      "Il faut une connexion TLS",
    ],
    answer: 1,
    explanation:
      "**LDAP injection (CWE-90)** : les métacaractères de filtre (`* ( ) \\ NUL`) non échappés permettent de réécrire la logique (`*)(uid=*))(|(uid=*`) → contournement d'authentification ou énumération. Correctif : **`ldap_escape($user, '', LDAP_ESCAPE_FILTER)`**. `htmlspecialchars` ne sert à rien ici (mauvais contexte).",
    tags: ['appsec', 'ldap', 'php', 'cwe-90'],
  },

  // ================= CSRF / OPEN REDIRECT =================
  {
    id: 'sec-csrf',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'CSRF',
    company: 'CWE-352',
    scenario: "Endpoint qui change l'email du compte, authentifié par cookie de session.",
    question: 'Quelle protection manque-t-il ?',
    language: 'python',
    code: `@app.route('/change_email', methods=['POST'])
def change_email():
    user = session['user']   # auth par cookie
    update_email(user, request.form['email'])
    return "OK"`,
    options: [
      "Il faut du HTTPS",
      "CSRF : une action à effet de bord n'est protégée que par le cookie (envoyé automatiquement par le navigateur). Un formulaire malveillant auto-soumis change l'email de la victime. Ajouter un token anti-CSRF + SameSite",
      "session est mal utilisé",
      "POST devrait être GET",
    ],
    answer: 1,
    explanation:
      "**CSRF (CWE-352)** : le navigateur envoie **automatiquement** le cookie de session, donc une page tierce peut déclencher l'action au nom de la victime. HTTPS n'y change rien. Correctif : **token anti-CSRF** (synchronizer token), cookies **`SameSite=Lax/Strict`**, et vérification de `Origin`/`Referer` pour les requêtes state-changing.",
    tags: ['appsec', 'csrf', 'python', 'cwe-352'],
  },
  {
    id: 'sec-open-redirect',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'Open redirect',
    company: 'CWE-601',
    scenario: "Après login, l'app redirige vers l'URL passée en paramètre `next`.",
    question: 'Pourquoi est-ce dangereux ?',
    language: 'php',
    code: `$next = $_GET['next'];
header("Location: " . $next);
exit;`,
    options: [
      "header() doit être avant tout output",
      "Open redirect : next=https://evil.com redirige la victime vers un site de phishing (ou vole un token OAuth). N'autoriser que des chemins relatifs internes / une allowlist d'hôtes",
      "exit est inutile",
      "Il faut encoder l'URL",
    ],
    answer: 1,
    explanation:
      "**Open redirect (CWE-601)** : rediriger vers une URL absolue contrôlée sert au **phishing** (l'utilisateur fait confiance au domaine de départ) et au **vol de tokens OAuth**. Correctif : n'autoriser que des **chemins relatifs internes** ou une **allowlist d'hôtes**. Piège : vérifier « commence par `/` » ne suffit pas — `//evil.com` et `/\\evil.com` s'échappent.",
    tags: ['appsec', 'open-redirect', 'php', 'cwe-601'],
  },

  // ================= FICHIERS =================
  {
    id: 'sec-upload',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Upload de fichier dangereux',
    company: 'CWE-434',
    scenario: "Upload d'avatar stocké dans un dossier servi par le serveur web.",
    question: 'Quel est le risque critique ?',
    language: 'php',
    code: `$name = $_FILES['avatar']['name'];
move_uploaded_file(
  $_FILES['avatar']['tmp_name'], "uploads/$name");`,
    options: [
      "Il faut limiter la taille",
      "Unrestricted file upload : un shell.php uploadé dans un dossier exécutable = RCE. Valider l'extension/MIME par CONTENU, renommer avec un id aléatoire, stocker hors webroot ou désactiver l'exécution",
      "move_uploaded_file est déprécié",
      "$_FILES devrait être $_POST",
    ],
    answer: 1,
    explanation:
      "**Unrestricted file upload (CWE-434)** : accepter un nom/type non validés et stocker dans un dossier **exécutable** permet d'uploader `shell.php` → **RCE**. Correctif : **allowlist** d'extensions/MIME vérifiée par le **contenu** (pas l'en-tête client, falsifiable), **renommer** avec un id aléatoire, stocker **hors webroot** ou désactiver l'exécution. Attention aux doubles extensions `shell.php.jpg`.",
    tags: ['appsec', 'file-upload', 'php', 'cwe-434'],
  },
  {
    id: 'sec-xxe-php',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'XXE : le piège LIBXML_NOENT',
    company: 'CWE-611',
    scenario: "Parsing d'un XML client en PHP.",
    question: 'Quel flag active la vulnérabilité ?',
    language: 'php',
    code: `$dom = new DOMDocument();
$dom->loadXML($_POST['xml'],
  LIBXML_NOENT | LIBXML_DTDLOAD);`,
    options: [
      "LIBXML_DTDLOAD est inoffensif",
      "LIBXML_NOENT (malgré son nom = 'substituer les entités', pas 'no entity') + LIBXML_DTDLOAD activent les entités externes → lecture de fichiers / SSRF. Retirer ces flags",
      "Il faut utiliser SimpleXML",
      "loadXML est obsolète",
    ],
    answer: 1,
    explanation:
      "**XXE (CWE-611)** — piège de **nommage** : `LIBXML_NOENT` ne signifie pas « no entity » mais « **substituer** les entités » (il les **active**). Combiné à `LIBXML_DTDLOAD`, une entité `SYSTEM \"file:///etc/passwd\"` lit des fichiers ou fait du SSRF. Correctif : **retirer ces flags** ; sur PHP < 8, `libxml_disable_entity_loader(true)`.",
    tags: ['appsec', 'xxe', 'php', 'cwe-611'],
  },

  // ================= AUTH / CRYPTO =================
  {
    id: 'sec-jwt-confusion',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'JWT : confusion RS256 → HS256',
    company: 'CWE-347',
    scenario: "Vérification d'un JWT signé en RS256 (clé publique connue de tous).",
    question: 'Quelle attaque permet cette ligne ?',
    language: 'javascript',
    code: `const decoded = jwt.verify(token, publicKey);
// aucun algorithms fixé`,
    options: [
      "Il faut vérifier l'expiration",
      "Algorithm confusion : sans algorithme forcé, l'attaquant signe un token en HS256 en utilisant la CLÉ PUBLIQUE (connue) comme secret HMAC. Le serveur la vérifie et l'accepte. Forcer algorithms: ['RS256']",
      "publicKey doit être secrète",
      "jwt.verify est asynchrone",
    ],
    answer: 1,
    explanation:
      "**Algorithm confusion (CWE-347)** : sans `algorithms` imposé, c'est l'en-tête `alg` du **token** qui décide. L'attaquant passe en **HS256** et signe avec la **clé publique** (connue) comme secret HMAC → le serveur, utilisant cette même clé publique, valide. Correctif : **forcer l'algorithme attendu** — `jwt.verify(token, publicKey, { algorithms: ['RS256'] })`.",
    tags: ['appsec', 'jwt', 'javascript', 'cwe-347'],
  },
  {
    id: 'sec-ecb',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Chiffrement en mode ECB',
    company: 'CWE-327',
    scenario: "Chiffrement de données avec AES.",
    question: 'Quel est le défaut de ce mode ?',
    language: 'python',
    code: `from Crypto.Cipher import AES
cipher = AES.new(key, AES.MODE_ECB)
ct = cipher.encrypt(pad(plaintext, 16))`,
    options: [
      "La clé est trop courte",
      "Mode ECB : des blocs de clair identiques donnent des blocs chiffrés identiques → fuite de motifs (le fameux 'pingouin ECB'), cut-and-paste. Utiliser un mode authentifié (AES-GCM) avec nonce aléatoire",
      "pad() est incorrect",
      "Il faut AES-256 au lieu d'AES-128",
    ],
    answer: 1,
    explanation:
      "**Mode de chiffrement inadéquat (CWE-327)** : en **ECB**, chaque bloc est chiffré indépendamment → deux blocs de clair identiques produisent le **même** chiffré, révélant les **motifs** (image « pingouin ECB »), et permettant des attaques par recombinaison. Correctif : mode **authentifié AES-GCM** (nonce unique aléatoire) ou AES-CBC + HMAC. Passer à AES-256 ne change **rien** au problème de mode.",
    tags: ['appsec', 'crypto', 'ecb', 'python', 'cwe-327'],
  },
  {
    id: 'sec-static-iv',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'IV statique (CBC)',
    company: 'CWE-329',
    scenario: "Chiffrement AES-CBC dans un service Node.",
    question: 'Où est la faiblesse ?',
    language: 'javascript',
    code: `const iv = Buffer.alloc(16, 0); // IV = 0
const c = crypto.createCipheriv('aes-256-cbc', key, iv);`,
    options: [
      "aes-256-cbc est cassé",
      "IV constant (zéro) réutilisé : en CBC, un IV fixe rend le chiffrement déterministe (fuite d'égalité de préfixes, chosen-plaintext). L'IV doit être ALÉATOIRE et UNIQUE par message (crypto.randomBytes(16)), transmis en clair",
      "L'IV doit être secret et chiffré",
      "Il faut un IV de 32 octets",
    ],
    answer: 1,
    explanation:
      "**IV statique (CWE-329)** : en CBC, réutiliser un IV fixe rend le chiffrement **déterministe** → fuite d'égalité de préfixes et attaques à clair choisi. L'IV doit être **aléatoire et unique** par message (`crypto.randomBytes(16)`), et transmis **en clair** avec le ciphertext. Piège : l'IV n'a **pas** à être secret — juste unique.",
    tags: ['appsec', 'crypto', 'iv', 'javascript', 'cwe-329'],
  },

  // ================= MÉMOIRE C (compléments) =================
  {
    id: 'sec-c-offbyone',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Off-by-one (C)',
    company: 'CWE-193',
    scenario: "Copie manuelle d'un tableau de 8 octets.",
    question: 'Quelle est l\'erreur ?',
    language: 'c',
    code: `char dst[8];
for (int i = 0; i <= 8; i++)
    dst[i] = src[i];`,
    options: [
      "src doit être plus grand",
      "Off-by-one : la condition i <= 8 accède à dst[8], le 9e élément d'un tableau de 8 → écriture hors bornes. Utiliser i < 8 (et prévoir la place du \\0 si c'est une chaîne)",
      "char devrait être int",
      "Il faut memcpy",
    ],
    answer: 1,
    explanation:
      "**Off-by-one / out-of-bounds write (CWE-193 / CWE-787)** : `i <= 8` fait 9 itérations (0 à 8) et écrit `dst[8]`, **hors** des 8 octets. Correctif : `i < 8`. Erreur classique ; penser aussi à réserver l'octet du terminateur `\\0` pour une chaîne.",
    tags: ['appsec', 'off-by-one', 'c', 'cwe-193'],
  },

  // ================= LOGIQUE / ACCÈS =================
  {
    id: 'sec-mass-assignment',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Mass assignment',
    company: 'CWE-915',
    scenario: "Création d'un utilisateur à partir du corps de la requête.",
    question: 'Quel est le risque ?',
    language: 'javascript',
    code: `app.post('/users', (req, res) => {
  const u = new User(req.body);
  u.save();
});`,
    options: [
      "save() est asynchrone",
      "Mass assignment : tout req.body est lié au modèle. Un body {\"email\":\"x\",\"isAdmin\":true} écrit un champ privilégié non prévu. Allowlister les champs autorisés (pick) ou un DTO strict",
      "new User est incorrect",
      "Il faut valider l'email",
    ],
    answer: 1,
    explanation:
      "**Mass assignment / over-posting (CWE-915)** : lier tout `req.body` au modèle permet d'injecter des champs sensibles (`isAdmin`, `role`, `balance`) que l'utilisateur ne devrait pas contrôler. Correctif : **allowlist explicite** des champs (`pick(req.body, ['email','name'])`), un DTO, ou un schéma strict. Valider l'email ne bloque pas l'injection de `isAdmin`.",
    tags: ['appsec', 'mass-assignment', 'javascript', 'cwe-915'],
  },
  {
    id: 'sec-toctou',
    type: 'find-error',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Race condition (TOCTOU)',
    company: 'CWE-367',
    scenario: "Débit d'un compte après vérification du solde.",
    question: 'Quel bug de concurrence ?',
    language: 'python',
    code: `if get_balance(user) >= amount:  # check
    debit(user, amount)          # use`,
    options: [
      "get_balance est lent",
      "TOCTOU : des requêtes concurrentes passent TOUTES le check avant que le débit s'applique → solde négatif / double-dépense. Rendre l'opération atomique : UPDATE ... WHERE balance >= amount, ou verrou SELECT FOR UPDATE",
      "Il faut un try/except",
      "amount peut être négatif",
    ],
    answer: 1,
    explanation:
      "**TOCTOU — Time-Of-Check to Time-Of-Use (CWE-367)** : entre le `check` (solde suffisant) et le `use` (débit), des requêtes **parallèles** peuvent toutes valider la condition → dépassement de solde / double-spend. Correctif : rendre l'opération **atomique** — `UPDATE accounts SET balance = balance - :amt WHERE user = :u AND balance >= :amt`, ou un verrou (`SELECT ... FOR UPDATE`), plus l'idempotence.",
    tags: ['appsec', 'race-condition', 'toctou', 'python', 'cwe-367'],
  },
  {
    id: 'sec-verbose-error',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'Debug activé en production',
    company: 'CWE-209',
    scenario: "Configuration d'une app Flask déployée en production.",
    question: 'Pourquoi est-ce grave ?',
    language: 'python',
    code: `app = Flask(__name__)
app.config['DEBUG'] = True   # en production`,
    options: [
      "C'est juste moins performant",
      "Le mode debug expose stack traces, code source, variables d'env ET une console interactive Werkzeug qui peut mener à une RCE. Désactiver DEBUG en prod, page d'erreur générique, logs côté serveur",
      "Il faut un __name__ différent",
      "DEBUG doit être une string",
    ],
    answer: 1,
    explanation:
      "**Exposition d'informations sensibles (CWE-209/215)** : `DEBUG=True` en prod révèle stack traces, extraits de code, variables d'environnement, et surtout la **console interactive Werkzeug** — potentiellement une **RCE**. Correctif : `DEBUG=False` en production, pages d'erreur **génériques**, détails uniquement dans les **logs serveur**.",
    tags: ['appsec', 'information-disclosure', 'python', 'cwe-209'],
  },
];
