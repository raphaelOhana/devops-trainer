# Sécurité pour un CTO

Tu connais déjà la sécurité de l'intérieur. Ce chapitre ne va pas t'expliquer ce qu'est une injection SQL — il va parler de l'angle qui change quand on passe de chercheur à CTO : la sécurité comme **décision organisationnelle** plutôt que comme problème technique. Quels protocoles d'identité imposer, où vivent les secrets et comment ils tournent, quel hardening devient une politique versus un détail d'implémentation, ce que la conformité exige réellement de ton équipe, et comment tu hérites du risque de tout ce que tu n'as pas écrit toi-même.

Le fil rouge : en tant que CTO, tu ne « fais » plus la sécurité, tu la **possèdes**. Ça veut dire choisir des standards que d'autres implémenteront, définir des defaults qui survivront à ton départ, et arbitrer des trade-offs coût/risque que personne d'autre dans l'entreprise n'a le contexte pour arbitrer. Un breach ne coûte pas qu'une CVE — il coûte la confiance client, jusqu'à 4 % du CA mondial sous le RGPD, et parfois l'entreprise. Ton job est de rendre les attaques assez chères pour que l'attaquant aille voir ailleurs.

---

## Ce que « posséder la sécurité » veut dire

La différence entre un ingénieur sécurité et un CTO sécurité tient en un mot : **levier**. L'ingénieur corrige une faille ; le CTO fait en sorte que cette classe de failles ne puisse plus être introduite. Concrètement, ça se traduit par trois responsabilités que tu ne peux pas déléguer.

**Choisir les standards.** Tu ne devrais jamais laisser une équipe « rouler sa propre crypto » ni improviser un protocole d'auth maison. Ton rôle est de dire : « on fait de l'OAuth2/OIDC, point », et d'assumer les conséquences de ce choix — y compris quand un dev senior voudra réinventer les sessions parce que « c'est plus simple ». La valeur d'un standard n'est pas technique, elle est organisationnelle : elle rend le code auditable par quelqu'un qui n'était pas là quand il a été écrit.

**Définir les defaults.** Un `default deny` sur le réseau, un `rejectUnauthorized: true`, une CSP stricte : ce sont des positions par défaut que tu imposes une fois et qui protègent chaque feature future sans que personne y repense. Le trade-off est réel — les defaults stricts génèrent de la friction (un dev qui débogue pourquoi son service ne joint pas un autre), mais cette friction est précisément ce que tu veux : elle force une décision explicite à chaque exception.

**Arbitrer le coût du risque.** C'est ici que tu es seul. Rotation des secrets tous les 90 jours ou tous les 30 ? mTLS partout ou seulement sur les chemins sensibles ? Le chercheur en toi voudra le maximum ; le CTO doit peser le coût opérationnel contre la réduction réelle de surface d'attaque. La bonne réponse dépend de ton modèle de menace, pas d'une checklist.

---

## Identité et authentification, au niveau décision

Tu maîtrises les mécanismes. L'enjeu ici est de choisir le bon flow pour le bon contexte et de comprendre ce que chaque choix engage pour l'équipe.

### OAuth2 n'est pas de l'authentification

Le piège organisationnel classique : traiter **OAuth2** comme un système de login. OAuth2 est un protocole d'**autorisation** — il répond à « cette application a-t-elle le droit d'accéder à ces ressources ? », pas à « qui es-tu ? ». Pour l'identité, c'est **OpenID Connect (OIDC)**, la couche d'authentification posée sur OAuth2, qui ajoute un `id_token` (un JWT signé décrivant l'utilisateur). Confondre les deux mène des équipes à bricoler de l'authentification à partir d'un access token, qui n'a jamais été conçu pour ça.

Les quatre rôles à garder en tête quand tu discutes archi : le **Resource Owner** (l'utilisateur), le **Client** (ton app), l'**Authorization Server** (Auth0, Keycloak, Cognito… qui émet les tokens) et le **Resource Server** (ton API protégée). La décision CTO la plus lourde ici est *build vs buy* sur l'Authorization Server — y héberger toi-même signifie posséder la rotation des clés de signature, la révocation et l'audit ; l'externaliser signifie accepter une dépendance critique et un vendor lock-in sur ton identité.

### Choisir le bon flow

Trois flows couvrent l'essentiel de tes cas.

**Authorization Code + PKCE** est aujourd'hui le défaut pour toute application interactive, backend ou pas. Le flow classique — redirection vers l'AS, consentement, retour avec un `code`, échange serveur-à-serveur du `code` contre les tokens via le `client_secret` — garde les tokens hors du navigateur. Le paramètre `state` porte la protection CSRF.

```
# 1. Redirection de l'utilisateur vers l'Authorization Server
GET https://accounts.google.com/o/oauth2/v2/auth
      ?client_id=YOUR_CLIENT_ID
      &redirect_uri=https://yourapp.com/callback
      &response_type=code
      &scope=openid email profile
      &state=RANDOM_STRING            # protection CSRF

# 2. Retour après consentement
GET https://yourapp.com/callback?code=AUTH_CODE&state=RANDOM_STRING

# 3. Échange serveur-à-serveur (le client_secret ne quitte JAMAIS le backend)
POST https://oauth2.googleapis.com/token
{
  "code": "AUTH_CODE",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uri": "https://yourapp.com/callback",
  "grant_type": "authorization_code"
}

# 4. Réponse (id_token = ajout OIDC)
{
  "access_token": "ya29.a0AfH6...",
  "expires_in": 3600,
  "refresh_token": "1//0gL3...",
  "token_type": "Bearer",
  "id_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**PKCE (Proof Key for Code Exchange)** est ce qui rend ce flow sûr *sans* `client_secret` — indispensable pour les SPA et le mobile, où aucun secret ne peut être caché. Le client génère un `code_verifier` aléatoire, en dérive un `code_challenge = SHA256(verifier)`, envoie le challenge à l'autorisation puis le verifier à l'échange. Le serveur vérifie que `SHA256(verifier) == challenge` : un attaquant qui intercepte le `code` ne peut rien en faire sans le verifier.

```python
import hashlib, base64, secrets

# code_verifier : aléatoire, gardé côté client
code_verifier = base64.urlsafe_b64encode(
    secrets.token_bytes(32)
).decode().rstrip('=')

# code_challenge : envoyé à l'autorisation (avec code_challenge_method=S256)
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).decode().rstrip('=')

# À l'échange du code, on renvoie code_verifier ;
# le serveur recalcule SHA256(verifier) et compare au challenge reçu.
```

La recommandation actuelle (OAuth 2.1) est simple : **PKCE partout**, y compris pour les clients confidentiels. Ça ne coûte rien et ferme une classe d'attaques par interception de code.

**Client Credentials** est le flow machine-to-machine — pas d'utilisateur, juste un service qui s'authentifie auprès d'un autre avec son propre `client_id`/`client_secret` pour obtenir un token restreint par `scope`. C'est le bon outil pour un worker qui appelle ton API interne. La discipline CTO ici : un couple d'identifiants par service (jamais partagé), des scopes minimaux, et ces secrets gérés comme tous les autres — c'est-à-dire dans un coffre, pas dans un env var éternel.

```
POST https://oauth.yourapi.com/token
{
  "grant_type": "client_credentials",
  "client_id": "service_client_id",
  "client_secret": "service_client_secret",
  "scope": "api.read api.write"
}
```

### JWT contre sessions : le vrai trade-off

Un **JWT** est un `HEADER.PAYLOAD.SIGNATURE` en base64url, vérifiable sans état côté serveur : n'importe quel service qui a la clé (ou la clé publique en RS256) peut valider le token sans requête à une base. C'est exactement ce qui le rend séduisant en microservices — et exactement ce qui rend la **révocation** difficile.

```python
payload = {
    'sub': user_id,                                   # sujet
    'exp': utcnow() + timedelta(hours=1),             # expiration — courte !
    'iat': utcnow(),
    'roles': ['user', 'admin']
}
token = jwt.encode(payload, secret_key, algorithm='HS256')
# À la vérification : algorithms=['HS256'], options={'verify_exp': True}
```

Le trade-off que tu dois trancher : un JWT valide reste valide jusqu'à `exp`, même si tu veux déconnecter l'utilisateur *maintenant*. Une **session** côté serveur (un identifiant opaque pointant vers un état en base) est révocable instantanément mais te coûte un lookup par requête et un point de contention. La position pragmatique que la plupart adoptent : **access tokens JWT à durée courte (≈ 1 h)** pour la vérification stateless, adossés à des **refresh tokens à durée longue et stockés en base** — la base te rend le pouvoir de révoquer.

Deux erreurs de config à bannir par policy, parce qu'elles ont coulé de vrais produits : n'accepte jamais `alg: none`, et fixe explicitement la liste des algorithmes acceptés à la vérification. Sinon un attaquant qui passe de RS256 à HS256 peut signer des tokens avec ta clé *publique*.

### Refresh tokens et rotation

Le pattern à imposer : au login, tu émets un access token court et un refresh token long, ce dernier **stocké en base** pour pouvoir le révoquer. À chaque refresh, tu **fais tourner** le refresh token — l'ancien est détruit, un nouveau est émis. La rotation transforme un refresh token volé en une alarme : si l'ancien est réutilisé après rotation, c'est le signal d'un vol, et tu peux invalider toute la famille de tokens.

```javascript
// /api/refresh
app.post('/api/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  const payload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);

  // Le token doit exister en base (sinon : révoqué ou déjà consommé)
  const rec = await db.query(
    'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2',
    [refreshToken, payload.sub]
  );
  if (!rec.rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

  // Rotation : on supprime l'ancien, on émet un nouveau couple
  await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  const accessToken = generateAccessToken(payload.sub);
  const newRefresh = generateRefreshToken(payload.sub);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
    [payload.sub, newRefresh, new Date(Date.now() + 30*24*60*60*1000)]
  );
  res.json({ accessToken, refreshToken: newRefresh });
});
```

Une table `refresh_tokens` (avec `user_id`, `expires_at`) et une table `sessions` séparée (indexée sur un `token_hash` en SHA256, avec `ip_address` et `user_agent`) te donnent à la fois la révocation et une trace d'audit exploitable en réponse à incident. Le hash plutôt que le token en clair, pour que ta base de sessions ne soit pas elle-même un butin.

### Zero Trust : cadre NIST, pas slogan

Tu as vu passer « Never trust, always verify » mille fois. Ce qui compte au niveau CTO, c'est de le traiter comme le **NIST SP 800-207** le définit — un modèle d'architecture, pas un produit qu'on achète. Trois principes opérationnels :

**Vérifier explicitement.** Chaque décision d'accès s'appuie sur tous les signaux disponibles — identité, posture de l'appareil, localisation, classification de la donnée, anomalies — pas sur la seule position réseau. Le modèle « château et douves » (tout ce qui est à l'intérieur est de confiance) échoue dès qu'un attaquant franchit le périmètre : le mouvement latéral devient trivial.

**Moindre privilège, en juste-à-temps.** Accès borné dans le temps (JIT), portée minimale (JEA), politiques adaptatives au risque. Le privilège permanent est une dette de sécurité qui s'accumule silencieusement.

**Assumer la compromission.** Micro-segmentation pour limiter le rayon de souffle, chiffrement de bout en bout, détection analytique et réponse automatisée. Tu ne conçois pas pour empêcher toute intrusion — tu conçois pour que la première intrusion ne soit pas la dernière étape.

Concrètement, ça se matérialise par du **mTLS** entre services (le serveur vérifie aussi le certificat du client, pas seulement l'inverse), un **service mesh** (Istio, Linkerd) pour l'imposer à l'échelle sans toucher au code applicatif, et des **network policies** en `default deny`.

```javascript
// mTLS côté serveur : on exige et on rejette les certificats clients invalides
const options = {
  key:  fs.readFileSync('server-key.pem'),
  cert: fs.readFileSync('server-cert.pem'),
  ca:   fs.readFileSync('ca-cert.pem'),
  requestCert: true,        // exige le certificat client
  rejectUnauthorized: true  // rejette s'il est invalide
};
https.createServer(options, (req, res) => {
  if (req.socket.authorized) { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(401); res.end('Unauthorized'); }
}).listen(443);
```

Le trade-off à assumer : gérer manuellement les certificats de 100 microservices est ingérable — c'est précisément le problème que résout un service mesh, en injectant un sidecar qui chiffre tout le trafic en mTLS automatiquement. En échange, tu introduis une couche d'infrastructure complexe (le mesh lui-même devient un composant critique à opérer et sécuriser). Pour une petite architecture, un `PeerAuthentication` en mode `STRICT` et quelques `NetworkPolicy` bien placées suffisent souvent — le mesh complet n'est justifié qu'à partir d'une certaine densité de services.

```yaml
# Istio : imposer mTLS strict sur tout un namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: { name: default, namespace: default }
spec:
  mtls: { mode: STRICT }
---
# Kubernetes : default deny (ingress + egress), puis allow explicite
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny-all, namespace: default }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
```

Par défaut, tous les pods d'un cluster Kubernetes peuvent se parler — un `default deny` suivi d'allows explicites (worker → api sur son port, api → postgres sur 5432, egress restreint) transforme ce réseau plat en périmètres segmentés. C'est le principe du moindre privilège appliqué au réseau, et c'est une policy que tu poses une fois.

---

## Secrets et rotation

C'est le domaine où l'écart entre « on sait qu'il faut faire bien » et « on fait bien » est le plus large, et c'est un écart que seul le CTO peut fermer, parce qu'il touche au workflow de toute l'équipe.

### La hiérarchie des solutions

Le point de départ est ce qu'on **ne** fait **pas** : secrets en dur dans le code, `.env` committé, secret loggé dans un message de connexion, clé d'API en clair dans un `config.json`. Tu connais. L'important est que ces anti-patterns soient bloqués *mécaniquement* (secret scanning en pre-commit et en CI), pas confiés à la vigilance humaine.

**Les variables d'environnement** sont le niveau de base : simples, universelles, mais toujours en clair et susceptibles de fuiter dans les logs, les dumps d'erreur ou l'introspection d'un process. Acceptables en dev local et pour les petits projets ; insuffisantes pour de la production à l'échelle. Le `.env` va dans le `.gitignore` (avec `*.pem` et `*.key`), toujours.

**HashiCorp Vault** est le niveau recommandé en production multi-services. Ce qui le distingue d'un simple store chiffré, c'est ce que tu ne peux pas obtenir autrement : des **secrets dynamiques** (Vault génère des identifiants de base à la demande, avec un TTL, et les révoque automatiquement à expiration), du chiffrement-as-a-service, des leases et un audit log natif.

```bash
# Secret dynamique : Vault crée un rôle Postgres éphémère à la demande
vault write database/roles/readonly \
  db_name=postgresql \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' \
    VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" max_ttl="24h"

vault read database/creds/readonly
# → username/password générés, valables 1 h, révoqués ensuite automatiquement
```

L'intérêt organisationnel des secrets dynamiques est profond : il n'existe plus de « mot de passe de la base » à protéger éternellement, puisque chaque application obtient des identifiants jetables. Un identifiant qui fuite expire tout seul. C'est le moindre privilège appliqué dans le temps.

```javascript
const vault = require('node-vault')({ endpoint: 'http://vault:8200', token: process.env.VAULT_TOKEN });
const { data } = await vault.read('database/creds/readonly');
const pool = new Pool({ host: 'postgres', user: data.username, password: data.password, database: 'mydb' });
// Vault révoque après le TTL ; l'app va rechercher de nouveaux identifiants.
```

**Sealed Secrets** répond à un problème différent et très concret quand tu fais du **GitOps** : comment versionner tes secrets dans Git sans les exposer ? Tu chiffres avec une clé publique (`kubeseal`), tu committes le résultat chiffré, et un contrôleur dans le cluster le déchiffre avec la clé privée pour produire un Secret Kubernetes standard. Le `SealedSecret` est sûr à committer ; seul le cluster peut le déchiffrer.

```bash
# Chiffrement local avec la clé publique — le résultat est sûr à committer
kubectl create secret generic db-creds \
  --from-literal=password=supersecret --dry-run=client -o yaml \
  | kubeseal --cert pub-cert.pem > sealed-secret.yaml
git add sealed-secret.yaml   # ✅ chiffré, versionnable
# Le contrôleur dans le cluster déchiffre et crée un Secret K8s standard.
```

Le choix Vault vs Sealed Secrets n'est pas exclusif et dépend de ta topologie : Vault brille pour les secrets dynamiques et le M2M à grande échelle ; Sealed Secrets s'intègre naturellement à un workflow GitOps où le désir premier est « tout est dans Git, y compris la config sensible ». Beaucoup d'équipes utilisent les deux.

### La rotation comme politique

La rotation est là où le CTO tranche des cadences. Un point de départ raisonnable : mots de passe de base ≈ 90 jours, clés d'API ≈ 180 jours, clés de signature JWT ≈ 365 jours, et **immédiatement après tout breach**. Ces chiffres ne sont pas sacrés — ce sont des defaults que tu ajustes selon ta surface. Le vrai enjeu n'est pas la fréquence, c'est que la rotation soit **sans downtime**, sinon elle ne se fera jamais.

Le pattern zero-downtime tient en une idée : faire coexister l'ancien et le nouveau secret pendant une fenêtre de transition. Pour une clé de signature JWT, tu marques chaque token avec un `kid` (key id) : tu signes avec la clé courante, mais tu acceptes en vérification l'ancienne *et* la nouvelle, le temps que les tokens signés avec l'ancienne clé expirent.

```javascript
const keys = {
  current:  process.env.JWT_KEY_V2,  // signe les nouveaux tokens
  previous: process.env.JWT_KEY_V1   // vérifie encore les anciens
};
function signToken(payload) {
  return jwt.sign(payload, keys.current, { algorithm: 'HS256', keyid: 'v2' });
}
function verifyToken(token) {
  const { kid } = jwt.decode(token, { complete: true }).header;
  if (kid === 'v2') return jwt.verify(token, keys.current);
  if (kid === 'v1') return jwt.verify(token, keys.previous);  // fenêtre de transition
  throw new Error('Unknown key version');
}
```

La séquence : ajouter `key_v2` (les apps acceptent les deux) → émettre les nouveaux tokens avec `key_v2` → attendre l'expiration de tous les tokens `key_v1` → retirer `key_v1`. Ce mécanisme de `kid` est ce qui rend la rotation *routinière* plutôt qu'événementielle — et une rotation routinière est la seule qui survit à la pression du delivery.

---

## Hardening applicatif comme policy

Tu sais ce qu'est une CSP. Ce qui change en tant que CTO, c'est que le hardening cesse d'être un réglage par application pour devenir une **posture par défaut** que chaque service hérite. Deux ou trois points méritent d'être faits *correctement*, parce que la version bâclée est pire que rien — elle donne un faux sentiment de sécurité.

### En-têtes de sécurité, corrigés

`helmet()` pose un socle raisonnable en une ligne, mais les valeurs qui comptent méritent d'être explicites.

```javascript
app.use((req, res, next) => {
  // Anti-clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Pas de MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection : à mettre à 0. L'auditeur XSS legacy est déprécié et a
  // lui-même introduit des vulnérabilités ; on le désactive et on s'appuie sur la CSP.
  res.setHeader('X-XSS-Protection', '0');

  // CSP : la vraie défense anti-XSS. PAS de 'unsafe-inline' pour les scripts —
  // on autorise les scripts par nonce (ou hash), régénéré à chaque requête.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'nonce-{RANDOM_PER_REQUEST}'; " +
    "style-src 'self' 'unsafe-inline'"
  );

  // HSTS : force HTTPS après la première visite
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Ne pas fuiter les URLs complètes vers les tiers
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
});
```

Deux corrections importantes, à traiter comme des règles non négociables :

**`X-XSS-Protection` doit valoir `0`.** L'en-tête est déprécié ; l'auditeur XSS des navigateurs legacy a historiquement *créé* des vulnérabilités par ses faux positifs et ses fuites. On le désactive explicitement et on confie la défense anti-XSS à la CSP.

**La CSP ne doit jamais utiliser `'unsafe-inline'` pour `script-src`.** C'est l'erreur qui vide la CSP de son sens : autoriser le script inline, c'est rouvrir la porte exacte que la CSP est censée fermer. La bonne approche est un **nonce** (`'nonce-{valeur aléatoire par requête}'`) — ou un **hash** du script — de sorte que seuls tes scripts légitimes s'exécutent et que tout script injecté est bloqué. Le `'unsafe-inline'` sur `style-src` est un compromis plus défendable (le CSS injecté a une surface d'attaque bien moindre), mais si tu peux t'en passer, fais-le.

Le trade-off réel de la CSP au niveau organisationnel : une CSP par nonce impose que ton pipeline de rendu génère et propage ce nonce à chaque requête. C'est un peu de plomberie côté framework, et c'est la raison pour laquelle tant d'équipes « simplifient » avec `'unsafe-inline'` — auquel cas elles feraient mieux de ne pas prétendre avoir une CSP. Ta décision de CTO est d'exiger la version qui protège vraiment, ou d'assumer explicitement l'absence de protection, mais pas l'entre-deux confortable.

### Validation, rate limiting : au niveau du contrat

La validation d'entrée et le rate limiting sont des choses que tu connais par cœur ; l'angle CTO est de les rendre **systémiques**. Les requêtes paramétrées ne sont pas une bonne pratique optionnelle, c'est une règle de lint qui casse la CI. L'auto-échappement d'un framework (React échappe par défaut, `escapeHtml` côté serveur) est une raison de choisir ce framework. Une bibliothèque de validation de schéma (Joi, Zod…) appliquée à *chaque* endpoint transforme la validation d'un acte de discipline en une propriété structurelle du code.

Le rate limiting mérite une nuance de policy : une limite générale sur `/api/` protège de l'abus, mais les endpoints d'authentification veulent une limite bien plus stricte (quelques tentatives par heure, en ne comptant pas les succès) parce que c'est là que se joue le brute force. Séparer les deux régimes est une décision d'architecture, pas un détail.

```javascript
// Régime strict, réservé aux endpoints d'auth
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 heure
  max: 5,                          // 5 tentatives
  skipSuccessfulRequests: true,    // on ne compte que les échecs
  message: 'Too many login attempts, try again in an hour'
});
app.use('/api/auth/login', authLimiter);
```

---

## RGPD et conformité : l'essentiel pour décider

Le RGPD n'est pas un sujet juridique que tu peux entièrement déléguer, parce que ses exigences se traduisent directement en schéma de base, en endpoints et en processus opérationnels. Voici la part qui t'incombe en tant que CTO — celle qui doit être *construite*, pas rédigée par le legal.

Le RGPD s'applique dès que tu traites des données de résidents de l'UE. Les sanctions vont jusqu'à 20 M€ ou 4 % du CA mondial annuel, le montant le plus élevé retenu. Traduit en obligations techniques, cela donne une poignée de capacités que ton système doit posséder nativement.

**L'inventaire des données d'abord.** Avant tout code, tu dois savoir quelle donnée tu collectes, pourquoi, où elle est stockée (base, logs, backups, tiers), qui y accède et combien de temps tu la gardes. Cet inventaire n'est pas de la paperasse — c'est la carte qui rend possibles tous les droits ci-dessous. On ne peut ni exporter ni effacer une donnée qu'on ne sait pas localiser. C'est aussi ce qui te fait découvrir que des PII traînent dans des logs ou des backups que personne n'avait mappés.

**Le droit d'accès** (répondre sous 30 jours à « donne-moi toutes mes données ») se construit comme un endpoint d'export qui rassemble les données de l'utilisateur à travers toutes les tables et les renvoie dans un format lisible par machine — un ZIP de JSON fait très bien l'affaire. Le fait de devoir écrire cette requête d'agrégation te force, utilement, à confronter ton inventaire à la réalité de ton schéma.

**Le droit à l'effacement** cache le piège le plus courant, et c'est un piège de conception : le **soft delete n'est pas conforme**. Marquer `deleted_at = NOW()` laisse la donnée en base — donc non effacée au sens du RGPD. La conformité exige un *hard delete* : suppression réelle, dans une transaction, en respectant l'ordre des clés étrangères.

```sql
-- ❌ Non conforme : la donnée existe toujours
UPDATE users SET deleted_at = NOW() WHERE id = $1;

-- ✅ Conforme : suppression réelle, dans l'ordre des dépendances
BEGIN;
  DELETE FROM sessions       WHERE user_id = $1;
  DELETE FROM refresh_tokens WHERE user_id = $1;
  DELETE FROM restaurants    WHERE owner_id = $1;
  -- Les logs d'audit qu'on doit garder légalement : on ANONYMISE, on ne supprime pas
  UPDATE audit_logs
     SET user_id = NULL, user_email = 'deleted@example.com', ip_address = '0.0.0.0'
   WHERE user_id = $1;
  DELETE FROM users WHERE id = $1;
COMMIT;
```

La nuance qui sauve : certaines données doivent légalement être conservées (les pièces financières, souvent 7 ans). La réponse n'est pas de refuser l'effacement, c'est d'**anonymiser** — retirer les identifiants personnels, garder l'agrégat. L'anonymisation est ton outil de réconciliation entre le droit à l'oubli et les obligations de rétention.

**Le consentement** doit être explicite, granulaire et révocable. Concrètement : pas de case pré-cochée (juridiquement invalide), pas de consentement groupé (chaque finalité — marketing, analytics, cookies — a son propre opt-in), et un retrait aussi simple que l'octroi. Techniquement, ça se matérialise par une table `user_consents` qui trace chaque finalité avec son horodatage de consentement/retrait et une preuve (IP, user agent) — parce qu'en cas de contrôle, tu dois pouvoir *prouver* le consentement, pas juste l'affirmer.

**La notification de breach en 72 heures** est un processus, pas du code, et c'est ta responsabilité de l'avoir écrit *avant* l'incident. La trame : détecter et évaluer (heures 0–2), contenir et préserver les preuves (2–24), notifier l'autorité de contrôle si requis et les utilisateurs en cas de risque élevé (24–72), puis analyse de cause racine et correctifs. La seule chose qui compte le jour J est que ce plan existe déjà et que l'équipe sache l'exécuter — improviser un plan de réponse pendant qu'on saigne est le meilleur moyen de rater la fenêtre de 72 h.

Enfin, la **minimisation** est un principe de conception avant d'être une obligation : ne collecte pas ce dont tu n'as pas besoin. Chaque champ de trop dans ton formulaire d'inscription est une donnée à sécuriser, à exporter, à effacer et à justifier. La date de naissance, le téléphone, l'adresse — en as-tu réellement besoin *maintenant* ? Le default « email + mot de passe + ce qui est strictement nécessaire au service » réduit ta surface RGPD et ta surface d'attaque d'un même geste. Privacy by design, ce n'est pas un slogan : c'est le choix par défaut de ne pas collecter.

---

## Chaîne d'approvisionnement et risque tiers

C'est probablement l'angle qui a le plus changé depuis ton passage à la sécurité offensive : aujourd'hui, une part majeure du risque ne vient pas de ton code mais de tout ce que tu importes. Tu hérites de la sécurité de chaque dépendance, chaque image de base, chaque SaaS branché sur tes données. Le CTO est le seul à avoir la vue d'ensemble sur cette surface.

**Les dépendances** sont la voie d'entrée que tu ne contrôles pas à l'écriture. La défense n'est pas humaine, elle est automatisée : `npm audit` (ou son équivalent) en CI, Snyk pour le scan continu et les PR de correction, Dependabot pour les mises à jour automatiques, OWASP Dependency-Check en open source. Le point de décision CTO est le **seuil de blocage** — à partir de quelle sévérité la CI échoue-t-elle ? Bloquer sur `CRITICAL` est un minimum ; bloquer sur `HIGH` génère plus de friction mais réduit la fenêtre d'exposition. C'est un curseur que tu positionnes en connaissance de cause.

```yaml
# Dependabot : mises à jour automatiques hebdomadaires
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 10
```

**Les images de conteneurs** portent leur propre chaîne de vulnérabilités, souvent dans des couches de base que personne n'a choisies consciemment. Trivy est l'outil open source de référence : il scanne images et Dockerfiles, et surtout il s'intègre en CI avec un `--exit-code 1` sur un seuil de sévérité, ce qui transforme le scan d'un rapport qu'on ignore en un **gate qui bloque le déploiement**.

```yaml
# GitHub Actions : échoue le build si l'image contient du CRITICAL/HIGH
- name: Run Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'myapp:${{ github.sha }}'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'
```

Le trade-off de la chaîne d'approvisionnement est permanent et inconfortable : chaque gate que tu poses ralentit le delivery et génère des faux positifs qui frustrent les équipes ; chaque gate que tu retires élargit ta fenêtre d'exposition. Il n'y a pas de réglage parfait — il y a un curseur que tu ajustes selon ton modèle de menace, et que tu assumes explicitement plutôt que de le laisser dériver par défaut. La question n'est jamais « scanne-t-on ? » mais « où place-t-on la barre, et qui a le droit de la baisser ? ».

Étends ce raisonnement aux **tiers SaaS** : chaque service à qui tu confies des données (paiement, analytics, support) étend ta surface de conformité et de breach. Le paiement délégué à un prestataire PCI-compliant (garder les 4 derniers chiffres, le reste chez le prestataire) est l'exemple canonique du bon arbitrage — tu transfères un risque coûteux à qui est équipé pour le porter. Mais chaque intégration est aussi une dépendance de confiance : leur breach devient ton incident.

---

## À retenir

- **Tu possèdes la sécurité, tu ne la fais plus.** Ton levier, ce sont les standards que tu imposes, les defaults que tu poses et les trade-offs coût/risque que tu es seul à pouvoir arbitrer.
- **OAuth2 ≠ authentification.** OAuth2 autorise, OIDC authentifie. Authorization Code + PKCE partout pour l'interactif, Client Credentials pour le M2M ; ne laisse personne rouler sa propre crypto.
- **JWT court + refresh token en base.** Le stateless te donne la scalabilité, la base te rend la révocation. Interdis `alg: none` et fige la liste des algos par policy.
- **Secrets dans un coffre, rotation sans downtime.** Vault pour le dynamique, Sealed Secrets pour le GitOps. La rotation par `kid`/coexistence est la seule qui survit à la pression du delivery.
- **CSP par nonce, jamais `'unsafe-inline'` pour les scripts ; `X-XSS-Protection: 0`.** Une CSP bâclée est pire que pas de CSP : elle rassure à tort. Exige la vraie ou assume l'absence, pas l'entre-deux.
- **RGPD = capacités techniques, pas paperasse.** Inventaire d'abord, hard delete (jamais soft), consentement granulaire prouvable, plan de breach écrit *avant* l'incident, minimisation par défaut.
- **Tu hérites du risque de tout ce que tu importes.** Scan des dépendances et des images en CI, avec un seuil de blocage que tu positionnes consciemment. Chaque tiers SaaS étend ta surface de breach et de conformité.

## Pour aller plus loin

- **OAuth 2.0** — RFC 6749, et OAuth 2.1 pour la consolidation des bonnes pratiques (PKCE obligatoire, disparition du flow implicite).
- **OpenID Connect** — https://openid.net/connect/ pour la couche d'identité au-dessus d'OAuth2.
- **JWT** — RFC 7519, à lire avec les recommandations de la RFC 8725 (*JWT Best Current Practices*) sur les pièges d'algorithme.
- **Zero Trust** — NIST SP 800-207, le cadre de référence pour dépasser le slogan.
- **HashiCorp Vault** — https://www.vaultproject.io/ ; **Sealed Secrets** — https://github.com/bitnami-labs/sealed-secrets.
- **Trivy** — https://github.com/aquasecurity/trivy ; **Snyk** — https://snyk.io/ pour la chaîne d'approvisionnement.
- **RGPD** — texte officiel sur https://gdpr-info.eu/ ; checklist praticable sur https://gdprchecklist.io/.
- **OWASP** — Top 10 et les cheat sheets (notamment CSP, JWT, Secrets Management) restent la référence opérationnelle la plus dense.

---

*La sécurité n'est pas un état de perfection. C'est un travail de fond dont le but est de rendre les attaques assez coûteuses pour que l'attaquant aille chercher une cible plus facile.*
