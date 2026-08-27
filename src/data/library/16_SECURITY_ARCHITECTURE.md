# Architecture de sécurité : concevoir des systèmes sûrs par construction

Il y a une phrase qui résume toute la posture moderne, et vous la connaissez : *« Security is not a feature, it's a property of the system. »* Ce n'est pas un slogan RSSI, c'est une contrainte d'architecture. Une propriété ne s'ajoute pas après coup — elle émerge de chaque décision de design, ou elle n'existe pas. Le firewall périmétrique était l'illustration inverse : une muraille, un intérieur « de confiance », et l'hypothèse implicite qu'une fois franchie la porte, tout le monde était légitime. Le problème n'était pas la muraille ; c'était le corollaire — *une seule* compromission donnait accès à tout. Le blast radius était égal au réseau entier.

Ce chapitre prend le problème par l'angle qui vous intéresse en tant que CTO : non pas « comment coder sans faille » (vous savez), mais **comment la sécurité se compose au niveau système**. On part du threat modeling comme point d'entrée du design, on descend dans l'identité et l'accès (le vrai centre de gravité), puis dans les choix cryptographiques qui comptent, la gestion des secrets et la chaîne d'approvisionnement, et enfin le zero trust et la défense en profondeur comme principes structurants, refermés par le SDLC.

Gardez en tête le triptyque **CIA** — confidentialité (qui peut voir), intégrité (qui peut modifier), disponibilité (est-ce accessible) — non comme définition mais comme grille de lecture : chaque contrôle qu'on introduira sert l'une de ces trois propriétés, souvent au détriment d'une autre. C'est là que se logent les trade-offs.

---

## 1. Le threat modeling comme point d'entrée du design

La sécurité commence avant la première ligne de code, par une question de modélisation : *contre quoi* se défend-on, et *où* passent les frontières de confiance. C'est exactement ce que capture **A04 : Insecure Design** de l'OWASP Top 10 2021 — une catégorie nouvelle et révélatrice, parce qu'elle nomme une classe de failles qu'aucun scanner ne trouvera jamais : celles qui viennent de l'absence de threat model, pas d'un bug d'implémentation. Pas de rate limiting, pas de défense en profondeur, un flux d'oubli de mot de passe qui fuit l'existence d'un compte : rien de tout cela n'est un « bug » au sens SAST. C'est un défaut de conception.

### STRIDE : une taxonomie orientée propriété violée

L'intérêt de **STRIDE** n'est pas mnémotechnique, il est structurel : chaque menace est le négatif d'une propriété de sécurité, ce qui donne directement la famille de contrôle à appliquer.

| Menace | Propriété violée | Contrôle canonique |
|---|---|---|
| **S**poofing | Authentification | AuthN forte, MFA, identités de workload |
| **T**ampering | Intégrité | Signatures, hashes, TLS, WORM logs |
| **R**epudiation | Non-répudiation | Audit logs, timestamps signés |
| **I**nformation disclosure | Confidentialité | Chiffrement, access control, classification |
| **D**enial of service | Disponibilité | Rate limiting, autoscaling, CDN/anti-DDoS |
| **E**levation of privilege | Autorisation | Least privilege, validation d'input, sandboxing |

La méthode s'applique **par élément** d'un data flow diagram, pas globalement — c'est ce qui la rend actionnable. On décompose le système en processus, stores, flux et acteurs externes ; on trace les **trust boundaries** (là où le niveau de confiance change : User→Web, API→Payment Gateway externe) ; puis on passe STRIDE sur chaque arête traversant une frontière.

```
        HTTPS (credentials)          JWT              SQL
[User] ───────────────────► [Web App] ──► [API Server] ──► [DB]
                                              │
                                              │ API Key
                                              ▼
                                        [Payment Gateway]   ← frontière externe
```

En pratique on obtient une matrice élément × STRIDE, on coche les menaces plausibles, et chaque coche appelle un contrôle nommé. `User→Web` : spoofing → MFA + session management ; `API→DB` : tampering → requêtes paramétrées ; toute arête portant de la donnée sensible : information disclosure → chiffrement transit + repos. La dernière étape — souvent sautée — est de **rejouer** le modèle à chaque changement d'architecture. Un threat model qui n'est pas versionné avec le système redevient faux en quelques sprints.

### La priorisation : risque = impact × vraisemblance

Toutes les menaces cochées ne se valent pas, et le budget de mitigation est fini. La matrice de risque classique croise **impact** (perte financière, réputation, conséquences légales/réglementaires, disruption opérationnelle, sensibilité de la donnée) et **vraisemblance** (surface d'attaque exposée, motivation et capacité de l'attaquant, contrôles existants, historique d'incidents). Le produit trie ce qu'on traite maintenant, ce qu'on accepte, ce qu'on transfère. Rien d'ésotérique — mais l'expliciter force la conversation qui manque le plus souvent : *quel risque décide-t-on de ne pas traiter, et qui signe cette acceptation.*

**Trade-off.** Le threat modeling a un coût d'entrée réel — c'est du temps d'ingénieurs seniors, difficile à automatiser, et sa valeur est invisible tant qu'aucun incident ne survient. La tentation est de le réserver aux « gros » projets. La bonne granularité est en fait un modèle *léger* systématique (une page, quatre questions : sur quoi on travaille, qu'est-ce qui peut mal tourner, qu'est-ce qu'on fait, a-t-on bien fait) plutôt qu'un modèle exhaustif rare.

---

## 2. Identité et accès : le vrai centre de gravité

Si la sécurité a un centre, c'est l'identité. La quasi-totalité de l'OWASP Top 10 2021 y ramène : **A01 : Broken Access Control** est passé numéro un — l'IDOR le plus bête (`/api/users/123` → `124`) reste le plus fréquent — et **A07 : Identification and Authentication Failures** en est le pendant côté authN. Le principe directeur d'A01 tient en trois mots : **deny by default**, vérification d'ownership *côté serveur* sur chaque ressource, et pas d'ID séquentiels devinables exposés en surface (UUID, ou mieux, autorisation qui ne dépend pas du secret de l'ID).

### AuthN : session, token, ou fédération — un choix d'état

Les trois modèles d'authentification ne diffèrent pas par la sécurité mais par **où vit l'état**, ce qui détermine tout le reste.

Le modèle **session** garde l'état serveur : le client détient un cookie opaque, le serveur détient la vérité dans un session store. Révocation triviale (on supprime la session), mais l'état serveur complique le scaling horizontal et ouvre la surface CSRF.

Le modèle **JWT / token** est *stateless* : la vérité est dans le token signé, le serveur ne stocke rien et vérifie la signature. Scaling et cross-domain deviennent triviaux — au prix exact inverse : **la révocation est difficile** (un token valide l'est jusqu'à expiration) et le token grossit. D'où le pattern access token court (15 min) + refresh token long (7 j) : on borne la fenêtre d'un token volé sans réauthentifier l'utilisateur à chaque appel.

**OAuth2 + OIDC** ne remplace pas les deux précédents, il résout un autre problème : la **délégation** d'accès sans partage de credentials, et le SSO. OAuth2 fait l'autorisation déléguée (l'*authorization code flow* : redirect vers l'IdP, l'utilisateur s'authentifie là-bas, le client reçoit un code à échanger contre des tokens) ; OIDC est la couche d'identité par-dessus, qui ajoute l'`id_token` — un JWT qui répond à « qui est l'utilisateur ». Au niveau design, ce qui compte : le client applicatif ne voit jamais le mot de passe, l'IdP est le point de concentration de l'authN (donc du durcissement : MFA, détection d'anomalie), et le PKCE est non négociable pour tout client public.

### JWT bien fait : les trois pièges qui reviennent

Vous connaissez ces failles ; l'enjeu ici est de les traiter comme des **invariants de validation** à imposer côté bibliothèque et code review, parce qu'elles ressurgissent à chaque nouveau service.

```python
# ❌ Les trois classiques
jwt.encode(payload, None, algorithm="none")          # 1. alg=none : signature désactivée
jwt.encode(payload, "secret123", algorithm="HS256")  # 2. secret faible, brute-forçable
jwt.decode(token, options={"verify_signature": False}) # 3. vérification désactivée
# + un quatrième : données sensibles dans le payload — le JWT est signé, PAS chiffré.
#   Un password ou un SSN dans les claims est lisible par quiconque le décode en base64.
```

Le piège **`alg=none`** est le plus instructif architecturalement : c'est une confusion de responsabilité. Le token dit lui-même quel algorithme le vérifier — et une bibliothèque naïve obéit. La parade n'est pas de faire confiance au header mais d'**imposer une allowlist d'algorithmes** côté vérificateur, indépendante du token. Même logique pour la confusion RS256/HS256, où un attaquant fait vérifier un token « symétrique » avec la clé *publique* RSA comme secret HMAC.

```python
SECRET_KEY = secrets.token_hex(32)  # 256 bits minimum pour HS256

payload = {
    "sub": "user_123",
    "iat": now, "exp": now + timedelta(minutes=15),   # fenêtre courte
    "aud": "api.example.com", "iss": "auth.example.com",
    "jti": secrets.token_hex(16),                      # identifiant → révocation ciblée
}
token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

decoded = jwt.decode(
    token, SECRET_KEY,
    algorithms=["HS256"],            # allowlist explicite — pas le header
    audience="api.example.com",
    issuer="auth.example.com",
    options={"require": ["exp", "iat", "sub", "aud", "iss"]},  # claims obligatoires
)
```

Le `jti` mérite un mot : il ramène une capacité de révocation dans un monde stateless, via une denylist de `jti` révoqués (courte, puisque bornée par l'`exp`). C'est le compromis pragmatique entre pur stateless et contrôle de révocation — un petit état, borné dans le temps, au lieu d'un session store complet.

### AuthZ : RBAC, ABAC, ReBAC — trois modèles, trois échelles

Le choix du modèle d'autorisation est une décision d'architecture qui vieillit mal si on se trompe, parce qu'il est coûteux à migrer une fois que les policies sont éparpillées dans le code.

**RBAC** (user → rôle → permissions) est simple à comprendre et à auditer, et couvre 80 % des besoins. Sa limite est connue : la **role explosion**. Dès qu'on a besoin de contexte (« admin, mais seulement sur *son* département, aux heures ouvrées »), on multiplie les rôles combinatoires jusqu'à l'ingérable, et on perd la lisibilité qui était son seul avantage.

**ABAC** évalue des **attributs** à la volée — attributs du sujet (département, clearance), de la ressource (classification, owner), de l'action, et de l'environnement (heure, localisation, device). Une policy devient une expression : `user.department == resource.department AND user.clearance >= resource.classification AND time.hour IN [9,18]`. Extrêmement flexible et context-aware — au prix d'une complexité d'implémentation et surtout d'**auditabilité** : répondre à « qui peut accéder à quoi » devient un problème d'évaluation, plus une lecture de table.

**ReBAC** modélise l'autorisation comme un **graphe de relations** — `Alice --owner--> doc1`, `Bob --member--> team`, `team --viewer--> folder` — et répond aux requêtes (« Bob peut-il voir doc1 ? ») par traversée du graphe. C'est le modèle de **Google Zanzibar**, repris par **OpenFGA** et **Ory Keto**. Il est naturel pour tout ce qui est ownership et partage transitif (le modèle Google Docs), il scale à l'échelle Google, et il centralise la décision d'autorisation hors du code applicatif. Le coût : une pièce d'infrastructure de plus, et un modèle mental que les équipes doivent apprendre.

Au niveau CTO, la trajectoire saine est : **RBAC par défaut**, ABAC ou ReBAC quand le besoin de contexte ou de relations le justifie *réellement* — et surtout, **externaliser la décision** (un service ou une lib d'autorisation) plutôt que la disperser en `if` dans chaque endpoint. Ce qui est centralisé est auditable ; ce qui est dispersé dérive.

### Service-to-service : mTLS et identité de workload

L'authentification humaine résolue, reste la moitié cachée du problème : **les services s'authentifient-ils entre eux ?** Dans le vieux modèle périmétrique, non — « on est à l'intérieur ». C'est précisément l'hypothèse que le zero trust détruit.

Le **TLS mutuel (mTLS)** est le mécanisme de base. Le TLS classique est one-way : le client vérifie le certificat du serveur, mais le serveur ne sait pas qui l'appelle (il délègue ça à une couche applicative — token, API key). mTLS ajoute la symétrie : **le serveur exige et vérifie aussi le certificat client**. Les deux extrémités prouvent cryptographiquement leur identité avant tout échange applicatif.

```
TLS (one-way)                        mTLS (two-way)
Client ──"qui es-tu ?"──► Server     Client ──"qui es-tu ?"──► Server
       ◄── cert serveur ──                  ◄── cert serveur ──
   (le client vérifie le serveur)           ──"et toi ?"──►
                                             ◄── cert client ──
                                     (les deux se vérifient mutuellement)
```

Le problème que mTLS déplace sans résoudre : **d'où viennent ces certificats de workload, et qui les fait tourner ?** Distribuer et roter manuellement des certs sur des milliers de pods éphémères est intenable. C'est le problème que résout **SPIFFE** (Secure Production Identity Framework For Everyone) : donner une identité cryptographique à chaque workload, indépendante du réseau. Une **SPIFFE ID** est une URI structurée — `spiffe://trust-domain/path` — par exemple `spiffe://example.com/ns/production/sa/payment-service`. L'identité est *sémantique* (namespace, service account), pas une IP ni un hostname.

**SPIRE** est l'implémentation qui attelle cette identité à une attestation : il vérifie qu'un workload est bien ce qu'il prétend (via des sélecteurs — labels de pod, namespace) avant de lui délivrer un **SVID** (SPIFFE Verifiable Identity Document), un certificat X.509 court injecté et **roté automatiquement**.

```yaml
apiVersion: spire.spiffe.io/v1alpha1
kind: ClusterSPIFFEID
metadata:
  name: payment-service
spec:
  spiffeIDTemplate: "spiffe://example.com/ns/{{ .PodMeta.Namespace }}/sa/{{ .PodSpec.ServiceAccountName }}"
  podSelector:
    matchLabels: { app: payment-service }
  namespaceSelector:
    matchLabels: { environment: production }
```

En pratique, on n'implémente presque jamais ça à la main : un **service mesh** (Istio, Linkerd) fait le mTLS transparent entre sidecars et s'appuie sur des identités SPIFFE. Le mesh transforme l'autorisation réseau en policy déclarative, portant sur des *identités de service* plutôt que des IP :

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata: { name: default, namespace: production }
spec:
  mtls: { mode: STRICT }   # tout le trafic est chiffré et mutuellement authentifié
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata: { name: payment-service-policy, namespace: production }
spec:
  selector:
    matchLabels: { app: payment-service }
  rules:
    - from:
        - source:
            principals:                         # QUI, par identité SPIFFE, pas par IP
              - "cluster.local/ns/production/sa/checkout-service"
              - "cluster.local/ns/production/sa/refund-service"
      to:
        - operation:
            methods: ["POST"]
            paths: ["/api/v1/payments/*"]
    # tout le reste est refusé implicitement — deny by default
```

**Trade-off.** Le mesh apporte mTLS gratuit, identité de workload et policy déclarative — mais il ajoute une couche de complexité opérationnelle non triviale (sidecars, latence, debugging), et devient lui-même une surface d'attaque et un point de configuration critique. Pour une poignée de services, un mTLS géré à la main ou une identité cloud native (IAM roles, workload identity) suffit ; le mesh se justifie à l'échelle où le nombre de liaisons service-à-service rend la gestion manuelle intenable.

---

## 3. Les choix cryptographiques qui comptent

**A02 : Cryptographic Failures** (l'ancien « Sensitive Data Exposure », renommé pour pointer la cause plutôt que le symptôme) se résume, pour un architecte, à un très petit nombre de décisions par défaut. Le principe cardinal que vous connaissez — *ne jamais implémenter sa propre crypto* — se double d'un corollaire moins dit : **ne jamais laisser le choix de l'algorithme aux appelants.** Les mauvais défauts cryptographiques survivent des années parce qu'ils marchent fonctionnellement. La sécurité crypto est affaire de défauts imposés, pas de possibilités offertes.

Trois choix couvrent l'essentiel :

**Mots de passe → Argon2id.** Une KDF mémoire-dure, lauréate de la Password Hashing Competition, calibrée pour résister au cracking GPU/ASIC via un coût mémoire paramétrable — là où bcrypt reste acceptable mais vieillissant, et où MD5/SHA sur mot de passe est une faute. Le point architectural : le hash n'est pas un chiffrement, il est unidirectionnel *par design*, et son paramétrage (mémoire, itérations, parallélisme) doit être révisé à mesure que le matériel progresse.

**Chiffrement symétrique → AES-256-GCM.** GCM est un mode **AEAD** — authenticated encryption with associated data — ce qui est le vrai point : il fournit confidentialité *et* intégrité en une opération, fermant la classe entière des attaques par malléabilité des modes non authentifiés (CBC sans MAC). Le piège opérationnel de GCM est la **réutilisation de nonce**, catastrophique : deux messages sous le même couple (clé, nonce) cassent la confidentialité et l'authentification. La gestion des nonces est donc un problème de design, pas de détail.

**Transport → TLS 1.3, partout.** Pas seulement en bordure : *everywhere*, y compris entre services internes — c'est exactement le sens du mTLS de la section précédente. TLS 1.3 a supprimé les suites héritées faibles, imposé la forward secrecy, et réduit le handshake à un aller-retour (0-RTT possible, avec ses réserves anti-rejeu). Le « TLS en interne, c'est superflu » est le réflexe périmétrique à désapprendre : dans un modèle assume-breach, le réseau interne est hostile par hypothèse.

**Trade-off.** La crypto forte a un coût — CPU (Argon2id est *volontairement* lent, ce qui plafonne le débit d'authentification et devient un vecteur DoS si mal calibré), latence de handshake, et surtout **gestion des clés**, qui est le vrai problème dur. Une crypto impeccable adossée à des clés en dur dans le repo ne vaut rien. Ce qui nous amène naturellement aux secrets.

---

## 4. Secrets et chaîne d'approvisionnement

### Gérer les secrets : de la variable d'environnement au secret dynamique

Deux anti-patterns à éliminer, dans l'ordre de gravité. Le secret **en dur dans le code** est le pire (il vit dans l'historique git pour toujours, indexé par des scanners d'attaquants en minutes après un push public). Mais la variable d'**environnement en clair**, souvent présentée comme la solution, n'en est pas vraiment une : elle est visible dans `/proc`, fuit dans les logs, les dumps de crash, les listings de process, et se propage aux processus enfants. C'est un progrès marginal, pas une réponse.

La réponse est un **secrets manager** (HashiCorp Vault, AWS/GCP Secrets Manager) qui apporte, au-delà du simple stockage chiffré, quatre propriétés que l'env var n'aura jamais : **access control** granulaire (qui lit quoi), **audit logging** (qui a lu quand), **rotation automatique**, et surtout les **secrets dynamiques** — le saut conceptuel qui compte.

```python
class SecretManager:
    def __init__(self):
        self.client = hvac.Client(url='https://vault.example.com:8200',
                                  token=os.environ['VAULT_TOKEN'])  # via K8s auth

    def get_database_credentials(self) -> dict:
        """Credentials de BDD générés à la demande, à durée de vie bornée."""
        r = self.client.secrets.database.generate_credentials(name='my-role')
        return {'username': r['data']['username'],
                'password': r['data']['password'],
                'lease_duration': r['lease_duration']}
```

Le secret dynamique renverse le modèle : au lieu d'un mot de passe de BDD partagé, long-vécu, que tout le monde connaît et que personne n'ose changer, Vault **génère un credential à la demande**, propre à ce workload, valide le temps d'un lease, puis le révoque. On passe d'un secret qu'on protège à un secret qui **n'existe presque pas** — la fenêtre d'exploitation d'une fuite tombe de « pour toujours » à « quelques minutes ». C'est la traduction du least privilege dans le temps : *just-in-time*, pas seulement *just-enough*.

La **rotation** en découle : pour un secret dynamique elle est intrinsèque ; pour les secrets statiques inévitables (clés d'API tierces), c'est une policy à définir et à tester — un secret « rotable » qui casse la prod à la rotation n'est pas rotable en pratique. L'authentification au manager lui-même (le `VAULT_TOKEN` ci-dessus, obtenu via l'identité Kubernetes du pod) referme la boucle avec la section identité : c'est la même question — *prouver qui on est avant d'obtenir quoi que ce soit* — appliquée aux machines.

### Chaîne d'approvisionnement : signer et attester ce qu'on déploie

Le déplacement le plus important de la dernière décennie : l'attaquant n'a plus besoin de vous compromettre, il compromet une de vos **dépendances** (l'affaire SolarWinds, les typosquats npm/PyPI en série). Votre surface d'attaque inclut désormais tout votre arbre de dépendances transitives et votre pipeline de build. C'est le versant *supply chain* de **A08 : Software and Data Integrity Failures**.

Deux réponses complémentaires. Le **SBOM** (Software Bill of Materials) est l'inventaire cryptographiquement exact de ce qui compose un artefact — chaque dépendance, chaque version. Sa valeur n'est pas préventive mais **réactive** : quand la prochaine Log4Shell tombe, la question « suis-je affecté, et où ? » se répond en secondes par une requête sur des SBOM, au lieu de jours d'archéologie.

La **signature et l'attestation** (via **Cosign** / Sigstore) répondent à l'autre moitié : garantir que l'artefact déployé est bien celui que le pipeline a produit, et lier le SBOM à l'image de façon vérifiable.

```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with: { path: ., format: cyclonedx-json, output-file: sbom.json }

- name: Sign with Cosign
  uses: sigstore/cosign-installer@v3
- run: |
    cosign sign   --key cosign.key myapp:${{ github.sha }}
    cosign attest --key cosign.key --predicate sbom.json \
                  --type cyclonedx myapp:${{ github.sha }}
```

L'architecture qui donne son sens à ces signatures est la **policy d'admission** en bout de chaîne : le cluster refuse de déployer une image dont la signature ne vérifie pas contre une clé de confiance. Sans ce point d'enforcement, signer ne sert à rien — c'est la différence entre attester et *contraindre*. Sigstore ajoute le *keyless signing* (identité OIDC éphémère + transparency log Rekor), qui élimine le problème de garde de la clé de signature elle-même — encore le pattern « le secret qui n'existe presque pas ».

**Trade-off.** Tout ceci ajoute des étapes au pipeline et un point de friction au déploiement. Le risque réel est la **fatigue d'alerte** : un scan SCA qui remonte 400 CVE dont 395 non exploitables entraîne l'ignorance des 5 qui comptent. La maturité n'est pas « scanner plus » mais **prioriser par exploitabilité réelle** (reachability analysis, contexte de déploiement) et n'échouer le build que sur ce qui est atteignable et critique.

---

## 5. Zero trust et défense en profondeur : les principes structurants

Tout ce qui précède converge vers deux principes d'architecture qui, ensemble, remplacent le modèle périmétrique.

### Zero trust : *never trust, always verify*

Le zero trust n'est pas un produit, c'est une posture qui découle de cinq principes cohérents entre eux. **Never trust, always verify** : chaque requête est traitée comme venant d'un réseau hostile, y compris interne — la localisation réseau ne confère plus aucune confiance. **Assume breach** : on conçoit comme si l'attaquant était déjà à l'intérieur, ce qui déplace l'objectif de « l'empêcher d'entrer » vers « minimiser ce qu'il peut faire une fois entré » (le blast radius). **Verify explicitly** : la décision d'accès s'appuie sur *tous* les signaux — identité utilisateur, posture du device, identité du workload, classification de la donnée, contexte (heure, lieu) — pas sur un seul. **Least privilege**, décliné dans le temps (just-in-time) autant que dans l'étendue (just-enough). Et **micro-segmentation** : chaque workload est une île, isolée, ce qui contient la propagation latérale.

Le modèle **BeyondCorp** de Google en est la réalisation canonique : plus de VPN comme frontière de confiance, mais un **access proxy** — point d'entrée unique — qui, à *chaque* requête, compose l'identité utilisateur (SSO/MFA), la confiance du device (certificat, inventaire, posture) et le contexte (heure, localisation), les passe à un **access engine** qui décide : *allow*, *deny*, ou *step-up auth*. La confiance n'est jamais acquise ; elle est réévaluée en continu, par requête.

```
User + Device ──► Access Proxy ──► ┌──────────┬──────────┬──────────┐
   (chaque requête)                │ Identity │  Device  │ Context  │
                                   │ SSO/MFA  │  trust   │ time/loc │
                                   └────┬─────┴────┬─────┴────┬─────┘
                                        └──────────┼──────────┘
                                              Access Engine ──► Allow / Deny / Step-up
```

On reconnaît ici l'assemblage des sections précédentes : SSO/MFA/OIDC pour l'identité humaine, SPIFFE/mTLS pour l'identité machine, la policy déclarative du mesh pour la micro-segmentation. Le zero trust n'est pas une technologie de plus — c'est le **principe qui donne leur cohérence** à toutes les briques d'identité et d'accès.

### Défense en profondeur : plusieurs couches, pas une muraille

Le pendant du zero trust est la **défense en profondeur** : aucun contrôle unique n'est supposé tenir, on empile des couches indépendantes pour qu'une compromission de l'une ne donne pas le système. Une API publique bien architecturée illustre l'empilement — chaque couche traite une classe de menace distincte, et chacune suppose que les autres peuvent échouer :

- **Bordure** — WAF (règles OWASP + custom, rate limiting par IP/user/endpoint) et anti-DDoS séparé en L3/4 (provider : Shield, Cloudflare) et L7 (WAF + rate limiting). C'est le filtre grossier ; il ne remplace aucune couche interne.
- **AuthN** — OAuth2/OIDC, tokens courts (15 min access / 7 j refresh), API keys *scopées* et rotées pour le service-to-service.
- **AuthZ** — vérification d'ownership *par ressource* (le contrôle qui manque dans 100 % des IDOR), ABAC pour les règles contextuelles, audit log de tous les accès.
- **Validation d'input** — schéma strict (OpenAPI, rejet des champs inconnus, limites de taille), requêtes paramétrées **toujours**, validation des uploads (type, taille, *contenu*). C'est la couche qui neutralise **A03 : Injection** — dont le XSS fait désormais partie — par la seule discipline qui tienne : allowlist plutôt que blocklist, et séparation code/données.
- **Réponse** — headers de sécurité (`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`), minimisation des données retournées, masquage du sensible, messages d'erreur *constants* (pas de stack trace, pas d'oracle sur l'existence d'un compte).
- **Monitoring** — détection temps réel (échecs d'auth, patterns d'accès anormaux, indicateurs d'exfiltration) et posture forensics-ready (logging requête/réponse sans PII, correlation IDs, rétention).

Le principe unificateur : **chaque couche suppose que les précédentes ont échoué.** La validation d'input ne fait pas confiance au WAF ; l'autorisation ne fait pas confiance à l'authentification pour restreindre les ressources. C'est le même *assume breach*, appliqué couche par couche.

**Trade-off.** Empiler des couches a un coût cumulé — latence, complexité opérationnelle, et un risque paradoxal : trop de contrôles mal intégrés créent des angles morts (personne ne comprend plus le comportement global) et poussent les équipes à contourner. La défense en profondeur bien faite privilégie des couches *indépendantes et lisibles* à un empilement exhaustif et opaque.

### Quand ça casse quand même : assume breach jusqu'au bout

*Assume breach* n'est pas complet sans un plan d'incident testé — parce qu'un playbook découvert le jour de l'incident ne vaut rien. La structure canonique enchaîne **détection/analyse** (confirmer que ce n'est pas un faux positif, classer la sévérité, documenter les IOC), **containment** (isoler, révoquer les credentials, bloquer — *sans* wiper les systèmes, sous peine de détruire les preuves forensics), **eradication** (root cause, fermeture de l'accès, rotation de tout ce qui a pu être exposé), **recovery** (restauration depuis un état propre, jamais un backup potentiellement compromis, avec monitoring intensif), et **post-mortem blameless**.

La dimension proprement architecturale, souvent négligée par les ingénieurs, est **réglementaire et temporelle** : le RGPD impose 72 h pour notifier l'autorité (et « sans délai indu » les individus si le risque est élevé), la SEC 4 jours ouvrés pour un incident *material* (sociétés cotées), HIPAA 60 jours. Ces horloges démarrent à la *découverte*, pas à la résolution — ce qui fait du **temps de détection (MTTD)** une métrique de conformité autant que de sécurité, et impose que la couche monitoring de la défense en profondeur soit conçue *pour* ces obligations. Leçon récurrente des vrais breaches : la couverture médiatique fait souvent plus de dégâts que l'intrusion elle-même, et la transparence appropriée protège la réputation à long terme mieux que le silence.

---

## 6. Refermer la boucle : le SDLC sécurisé (shift left)

Les principes précédents ne tiennent que s'ils sont **enforced automatiquement** — sinon ils dérivent au premier sprint sous pression. Le SDLC sécurisé est le mécanisme qui inscrit la sécurité dans le pipeline plutôt que dans la bonne volonté. Le principe économique est **shift left** : le coût de correction d'une faille croît d'un ordre de grandeur à chaque étape franchie (design → dev → build → deploy → prod). Détecter au commit coûte des minutes ; en prod, un incident.

Chaque phase a son contrôle, et ils sont complémentaires — aucun ne couvre ce que couvre un autre :

| Phase | Contrôle | Ce qu'il attrape |
|---|---|---|
| Design | **Threat modeling** | Failles de conception (A04) — invisibles aux scanners |
| Code | **SAST** (Semgrep, CodeQL) | Patterns vulnérables dans *votre* code |
| Code/build | **Secrets scanning** (gitleaks, TruffleHog) | Credentials commités |
| Build | **SCA** (Snyk, Dependency-Check) | CVE dans les *dépendances* |
| Build | **Container / IaC scan** (Trivy, Checkov, tfsec) | Image et infra mal configurées |
| Staging | **DAST** (ZAP, Nuclei) | Failles au *runtime*, vue attaquant |

Le point d'architecture n'est pas la liste d'outils (interchangeables) mais leur **orchestration en gates** : le pipeline échoue sur un secret détecté, une CVE critique atteignable, une image avec vulnérabilité HIGH — *avant* le merge ou le deploy. Le DAST tourne après que les checks statiques passent, contre un staging réel. La signature/attestation (section 4) scelle l'artefact en sortie.

Mais l'outillage est la partie facile. La partie difficile — et proprement CTO — est **culturelle**, parce que la sécurité échoue par contournement bien plus que par absence d'outil. Le principe qui marche tient en une phrase : **« make the secure way the easy way. »** L'enforcement (« tu *dois* faire X ») produit du contournement ; l'*enablement* (« voici un template qui fait X automatiquement ») produit de l'adoption. Concrètement : des templates Terraform pré-durcis, des libs d'auth/authz prêtes à l'emploi, des gates CI/CD intégrés par défaut — de sorte que le chemin par défaut soit déjà sûr et que le développeur doive faire un effort *pour* être non sûr.

Le reste de la culture s'articule autour de ce principe : un **executive sponsorship** réel (budget dédié, pas « si on a le temps ») ; un programme de **security champions** (un référent par équipe, 10-20 % de temps dédié, œil sécurité sur les PR) qui scale l'expertise sans centraliser le goulot ; des threat models intégrés au design review ; et des métriques qui mesurent la *tendance* (MTTP des vulns critiques, % de projets avec threat model, incidents causés par des failles connues) plutôt que le théâtre de conformité.

---

## À retenir

1. **La sécurité est une propriété du système, pas une feature.** Elle émerge de chaque décision d'architecture ou n'existe pas — et sa contrepartie opérationnelle est *make the secure way the easy way* : l'enforcement se contourne, l'enablement s'adopte.

2. **Le threat modeling est le point d'entrée, pas une case à cocher.** STRIDE par élément sur un data flow diagram nomme les menaces qu'aucun scanner ne trouve (A04 : Insecure Design). Léger et systématique bat exhaustif et rare.

3. **L'identité est le centre de gravité.** A01 (Broken Access Control) domine l'OWASP 2021. Deny by default, ownership vérifié côté serveur, autorisation *externalisée* (pas dispersée en `if`), et une identité de workload — SPIFFE/mTLS — aussi rigoureuse que l'identité humaine.

4. **JWT : imposer les invariants, pas faire confiance au token.** Allowlist d'algorithmes côté vérificateur (jamais `alg=none`), secret ≥ 256 bits, `exp` court, `jti` pour la révocation. Le JWT est signé, pas chiffré.

5. **La crypto se joue en défauts imposés.** Argon2id, AES-256-GCM (AEAD, nonces uniques), TLS 1.3 *partout* y compris en interne. Le vrai problème dur n'est pas l'algo mais la **gestion des clés et des secrets** — dont la meilleure réponse est le secret dynamique, *just-in-time*, qui n'existe presque pas.

6. **Zero trust et défense en profondeur sont les principes qui donnent leur cohérence aux briques.** *Never trust, always verify* + *assume breach* : chaque couche suppose que les précédentes ont échoué, la localisation réseau ne confère aucune confiance, on minimise le blast radius plutôt que d'espérer l'étanchéité.

7. **La supply chain est votre surface d'attaque.** SBOM pour répondre vite (« suis-je affecté ? »), signature/attestation (Cosign) *contrainte par une policy d'admission* pour garantir ce qu'on déploie. Prioriser par exploitabilité réelle, sinon la fatigue d'alerte annule tout.

## Pour aller plus loin

- **Ross Anderson, *Security Engineering*** — la référence de fond, pensée système.
- **Adam Shostack, *Threat Modeling*** — la méthode STRIDE et le design-for-security en profondeur.
- **Google, *Building Secure and Reliable Systems*** — là où SRE rencontre la sécurité ; le meilleur pont vers l'échelle.
- **Google Zanzibar (paper)** — le modèle ReBAC, et sa mise en œuvre open source via **OpenFGA** / **Ory Keto**.
- **SPIFFE/SPIRE** (spiffe.io) et **Sigstore/Cosign** (sigstore.dev) — les spécifications d'identité de workload et de signature keyless.
- **NIST SP 800-207 (Zero Trust Architecture)** et **BeyondCorp (papers Google)** — les fondations du modèle.
- **OWASP** — Top 10 2021, ASVS (exigences de vérification), et le Cheat Sheet Series pour les détails d'implémentation.

*« Security is a process, not a product. »* — Bruce Schneier
