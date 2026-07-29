import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Bugs logiques & side-channels » — les vulnérabilités les plus dures :
// elles ne se trouvent PAS avec un scanner (SAST), seulement par le raisonnement
// sur le métier et le contexte. + attaques par canal auxiliaire (timing, cache,
// Spectre/Meltdown, length extension, padding oracle).
// Inspiré des labs PortSwigger « Business logic » et « Race conditions ».
// ---------------------------------------------------------------------------

export const logicExercises: Exercise[] = [
  // ================= BUSINESS LOGIC =================
  {
    id: 'logic-negative-qty',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Quantité négative',
    company: 'Business logic',
    scenario:
      "Une boutique calcule le total = prix × quantité, puis débite/crédite la carte. La quantité vient du panier, validée « c'est bien un entier ».",
    question: 'Quelle faille logique un attaquant exploite-t-il ?',
    options: [
      "SQL injection dans la quantité",
      "Une quantité NÉGATIVE (ex. −5) donne un total négatif → le paiement CRÉDITE le compte de l'attaquant. Valider que quantité ≥ 1 côté serveur (bornes métier)",
      "Le prix peut être modifié",
      "Il faut chiffrer le panier",
    ],
    answer: 1,
    explanation:
      "**Bug de logique métier** : « c'est un entier » n'implique pas « c'est un entier **valide** ». Une quantité **négative** produit un montant négatif → remboursement/crédit indu. Aucun scanner ne détecte ça : c'est une **règle métier** (quantité ≥ 1, prix ≥ 0) à valider **côté serveur**. Ne jamais faire confiance aux bornes implicites.",
    tags: ['appsec', 'business-logic', 'validation'],
  },
  {
    id: 'logic-coupon-race',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Coupon à usage unique... vraiment ?',
    company: 'PortSwigger',
    scenario:
      "Un code promo « −50 %, usage unique » : le serveur vérifie qu'il n'a pas été utilisé, l'applique, puis le marque comme utilisé. Un attaquant envoie 30 requêtes en parallèle en une milliseconde.",
    question: 'Que se passe-t-il et comment corriger ?',
    options: [
      "Rien, le coupon est protégé",
      "Race condition (limit overrun) : les 30 requêtes passent le 'check' avant qu'aucune ne marque le coupon utilisé → réduction appliquée 30 fois. Corriger par une opération atomique / verrou (UPDATE ... WHERE used=false)",
      "Il faut chiffrer le coupon",
      "Le coupon doit être plus long",
    ],
    answer: 1,
    explanation:
      "**Race condition — limit overrun (TOCTOU)** : la fenêtre entre « vérifier non-utilisé » et « marquer utilisé » permet à des requêtes **concurrentes** de toutes passer le check. Classique des labs PortSwigger « race conditions ». Correctif : rendre l'opération **atomique** — `UPDATE coupons SET used=true WHERE code=? AND used=false` et n'appliquer la remise que si **1 ligne** a été modifiée ; ou un verrou.",
    tags: ['appsec', 'business-logic', 'race-condition'],
  },
  {
    id: 'logic-workflow-bypass',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Sauter l\'étape de paiement',
    company: 'Business logic',
    scenario:
      "Un tunnel de commande : /cart → /payment → /confirm. Chaque page est une route. Un attaquant appelle /confirm directement, sans passer par /payment.",
    question: 'Quelle est la vulnérabilité ?',
    options: [
      "XSS sur /confirm",
      "Broken workflow / forced browsing : le serveur ne vérifie pas que les étapes précédentes (paiement) ont bien eu lieu. Il faut valider l'état complet de la commande côté serveur avant de confirmer",
      "CSRF sur /cart",
      "Il manque du HTTPS",
    ],
    answer: 1,
    explanation:
      "**Contournement de workflow (business logic)** : supposer que l'utilisateur suit l'ordre des pages est une erreur — il contrôle les requêtes. Appeler `/confirm` sans `/payment` livre la commande **sans payer** si l'état n'est pas vérifié. Correctif : le serveur valide **l'état complet et cohérent** de la commande (paiement confirmé, montant, stock) avant toute action finale. Ne jamais se fier au parcours côté client.",
    tags: ['appsec', 'business-logic', 'workflow'],
  },
  {
    id: 'logic-reset-userid',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Reset password d\'un autre compte',
    company: 'Business logic',
    scenario:
      "Endpoint de réinitialisation : l'utilisateur a validé un token, et envoie maintenant son nouveau mot de passe.",
    question: 'Où est la faille logique ?',
    language: 'javascript',
    code: `app.post('/reset', (req, res) => {
  // token déjà validé plus tôt
  const { userId, newPassword } = req.body;
  setPassword(userId, newPassword);
});`,
    options: [
      "newPassword devrait être hashé (c'est le vrai bug)",
      "userId vient du body : l'attaquant met l'ID de la VICTIME et change SON mot de passe. L'identité doit venir du token/session vérifié, jamais d'un paramètre contrôlé par le client",
      "Il manque un try/catch",
      "setPassword est asynchrone",
    ],
    answer: 1,
    explanation:
      "**Bug de logique / broken access control** : `userId` est fourni par le **client**. L'attaquant valide un token pour SON compte, puis envoie le `userId` de la **victime** → il réinitialise le mot de passe d'autrui. L'identité doit être **liée au token/à la session vérifiés** côté serveur (`req.session.userId`), jamais lue depuis le body. (Hasher le mot de passe est nécessaire mais n'est pas *ce* bug.)",
    tags: ['appsec', 'business-logic', 'access-control'],
  },
  {
    id: 'logic-2fa-bypass',
    type: 'mcq',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Contourner la 2FA',
    company: 'PortSwigger',
    scenario:
      "Login en 2 étapes : /login (user+pass) pose un cookie de session, puis /2fa-verify demande le code OTP. Un attaquant, après /login, va directement sur /account sans passer par /2fa-verify.",
    question: 'Quelle est la faille ?',
    options: [
      "L'OTP est trop court",
      "La session est considérée comme pleinement authentifiée dès /login, avant l'OTP. Il faut un état 'auth partielle' : tant que l'OTP n'est pas validé, la session ne donne accès à rien de protégé",
      "Il faut chiffrer l'OTP",
      "Le cookie doit être plus long",
    ],
    answer: 1,
    explanation:
      "**2FA broken logic** (lab PortSwigger classique) : si `/login` établit une session **déjà authentifiée**, l'étape OTP n'est qu'un écran qu'on peut **sauter** en naviguant ailleurs. Correctif : après `/login`, la session est dans un état **« authentification partielle »** qui n'autorise **que** `/2fa-verify` ; elle ne devient complète qu'**après** validation de l'OTP. L'état d'auth doit être vérifié sur **chaque** ressource protégée.",
    tags: ['appsec', 'business-logic', '2fa', 'auth'],
  },
  {
    id: 'logic-float-money',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'intermediate',
    title: 'Argent en flottant',
    company: 'Business logic',
    scenario:
      "Un système financier stocke les montants en float (double). Des écarts d'un centime apparaissent, et un attaquant les exploite en masse.",
    question: 'Quel est le problème et la solution ?',
    options: [
      "Les floats sont trop lents",
      "Les nombres à virgule flottante ne représentent pas exactement les décimaux (0.1 + 0.2 ≠ 0.3) → erreurs d'arrondi cumulables/exploitables. Stocker l'argent en ENTIERS de centimes (ou type décimal exact)",
      "Il faut chiffrer les montants",
      "double est déprécié",
    ],
    answer: 1,
    explanation:
      "**Bug logique de représentation** : le flottant IEEE-754 ne représente pas exactement `0.1`, `0.2`… → `0.1 + 0.2 = 0.30000000000000004`. En finance, ces erreurs d'arrondi se **cumulent** et deviennent exploitables (salami slicing). Correctif : stocker l'argent en **entiers** (centimes) ou en type **décimal exact** (`decimal`, `BigDecimal`), et définir explicitement les règles d'arrondi.",
    tags: ['appsec', 'business-logic', 'float', 'finance'],
  },
  {
    id: 'logic-ratelimit-bypass',
    type: 'find-error',
    domain: 'web',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Rate limit contournable',
    company: 'Business logic',
    scenario:
      "Une protection anti-bruteforce limite les tentatives de login par adresse IP.",
    question: 'Comment un attaquant contourne-t-il cette limite ?',
    language: 'javascript',
    code: `const ip = req.headers['x-forwarded-for'];
if (attempts[ip] > 5) return res.status(429).end();
attempts[ip]++;`,
    options: [
      "attempts devrait être une Map",
      "X-Forwarded-For est un en-tête contrôlé par le client : l'attaquant le change à chaque requête (IP différente) pour réinitialiser le compteur. Utiliser l'IP réelle de la connexion (req.socket.remoteAddress), validée",
      "Le seuil de 5 est trop bas",
      "429 est le mauvais code",
    ],
    answer: 1,
    explanation:
      "**Bug logique** : `X-Forwarded-For` est un **en-tête HTTP falsifiable** par le client. En le changeant à chaque requête, l'attaquant présente une IP différente → le compteur ne monte jamais, le rate-limit est **inutile**. Correctif : se baser sur l'**IP réelle** de la connexion (`req.socket.remoteAddress`), ou ne faire confiance à `X-Forwarded-For` **que** derrière un proxy de confiance qui le réécrit.",
    tags: ['appsec', 'business-logic', 'rate-limit', 'spoofing'],
  },

  // ================= SIDE-CHANNELS / CRYPTO =================
  {
    id: 'logic-timing-deep',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Timing attack',
    company: 'Side-channel',
    scenario:
      "La vérification d'une API-key compare octet par octet et s'arrête au premier écart. L'attaquant mesure très précisément le temps de réponse sur des millions de requêtes.",
    question: 'Comment récupère-t-il la clé, et la parade ?',
    options: [
      "Impossible, la clé est secrète",
      "Le temps de réponse augmente légèrement à chaque octet correct (l'arrêt anticipé fuit l'info). En cherchant l'octet qui maximise le temps, il reconstitue la clé octet par octet. Utiliser une comparaison à temps CONSTANT",
      "Il faut une clé plus longue",
      "Le HTTPS empêche la mesure",
    ],
    answer: 1,
    explanation:
      "**Timing attack (canal auxiliaire, CWE-208)** : une comparaison qui **s'arrête au premier octet faux** met (très) légèrement plus de temps quand le préfixe est correct. En moyennant des millions de mesures, l'attaquant devine la clé **octet par octet** (complexité linéaire au lieu d'exponentielle). Parade : comparaison à **temps constant** (`hmac.compare_digest`, `crypto.timingSafeEqual`) qui parcourt **toujours** toute la longueur.",
    tags: ['appsec', 'side-channel', 'timing', 'cwe-208'],
  },
  {
    id: 'logic-length-extension',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Length extension attack',
    company: 'Crypto',
    scenario:
      "Un serveur authentifie ses messages avec un « MAC » calculé comme SHA-256(secret ‖ message) et publie (message, mac).",
    question: 'Pourquoi ce MAC est-il forgeable ?',
    options: [
      "SHA-256 est cassé",
      "Length extension : avec H(secret‖message), un attaquant peut calculer H(secret‖message‖padding‖extra) SANS connaître le secret (état interne récupérable du MAC) → forger un message valide étendu. Utiliser HMAC, pas hash(secret‖message)",
      "Le secret est trop court",
      "Il faut du SHA-512",
    ],
    answer: 1,
    explanation:
      "**Length extension attack** : les fonctions de type Merkle-Damgård (MD5, SHA-1, SHA-256) exposent leur **état interne** dans la sortie. Depuis `H(secret‖message)`, un attaquant peut **continuer** le calcul et produire `H(secret‖message‖padding‖extra)` valide **sans connaître le secret**. Ne **jamais** faire `hash(secret‖message)` comme MAC : utiliser **HMAC** (conçu pour résister à cette attaque) ou SHA-3/BLAKE2 (immunes).",
    tags: ['appsec', 'crypto', 'length-extension', 'mac'],
  },
  {
    id: 'logic-padding-oracle',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Padding oracle',
    company: 'Crypto',
    scenario:
      "Un service déchiffre un token en AES-CBC et renvoie une erreur différente selon que le PADDING est invalide ou que le contenu est mauvais.",
    question: 'Quelle attaque cela permet-il ?',
    options: [
      "Aucune, l'erreur est anodine",
      "Padding oracle : la distinction 'padding invalide' vs 'autre erreur' est un ORACLE qui permet de déchiffrer (et forger) le message octet par octet, SANS la clé. Renvoyer une erreur générique et authentifier le chiffré (AES-GCM / Encrypt-then-MAC)",
      "Il faut une clé plus longue",
      "CBC est toujours sûr",
    ],
    answer: 1,
    explanation:
      "**Padding oracle attack** : si le serveur révèle (par message d'erreur, code, ou timing) que le **padding** est invalide, cet **oracle** permet de déchiffrer le ciphertext **octet par octet** en manipulant le bloc précédent (CBC), sans la clé — et même de chiffrer des messages arbitraires. Parades : **erreur générique unique**, et surtout **chiffrement authentifié** (AES-GCM) ou **Encrypt-then-MAC** qui rejette tout ciphertext altéré avant déchiffrement.",
    tags: ['appsec', 'crypto', 'padding-oracle', 'cbc'],
  },
  {
    id: 'logic-spectre',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Spectre',
    company: 'CPU 2018',
    scenario:
      "Vulnérabilité matérielle de 2018 touchant presque tous les processeurs modernes. Elle exploite l'exécution spéculative.",
    question: 'Quel est le mécanisme de Spectre ?',
    options: [
      "Un bug dans le compilateur",
      "Le CPU exécute SPÉCULATIVEMENT des instructions au-delà d'une vérification de borne (branch prediction) ; même si le résultat est annulé, il laisse une trace dans le CACHE, lue via un side-channel timing → fuite de mémoire hors des limites autorisées",
      "Un dépassement de buffer classique",
      "Une injection SQL matérielle",
    ],
    answer: 1,
    explanation:
      "**Spectre** exploite l'**exécution spéculative** : le CPU, pour aller vite, exécute par avance les branches qu'il *prédit* — y compris au-delà d'une vérification de borne (`if (i < len) access(array[i])`). Le résultat spéculatif est annulé, mais il a **modifié l'état du cache**. Un attaquant lit cette trace par **timing du cache** (Flush+Reload) → fuite de données hors limites, même entre processus. Atténuations : barrières spéculatives, retpoline, isolation.",
    tags: ['appsec', 'side-channel', 'spectre', 'cpu'],
  },
  {
    id: 'logic-meltdown',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Meltdown',
    company: 'CPU 2018',
    scenario:
      "Cousine de Spectre (2018). Elle permet à un processus utilisateur de lire la mémoire du NOYAU.",
    question: 'En quoi diffère-t-elle de Spectre ?',
    options: [
      "C'est exactement la même chose",
      "Meltdown exploite l'exécution out-of-order : une lecture de mémoire kernel (normalement interdite) est exécutée spéculativement AVANT que la vérification de permission ne lève l'exception ; la donnée fuit dans le cache. Elle brise l'isolation user/kernel. Corrigée par KPTI (isolation des tables de pages)",
      "Meltdown est un bug logiciel",
      "Meltdown touche uniquement le réseau",
    ],
    answer: 1,
    explanation:
      "**Meltdown** exploite l'**exécution out-of-order** : le CPU lit une adresse mémoire **kernel** de façon transitoire **avant** que le contrôle de permission ne déclenche la faute. La valeur, bien qu'« annulée », a été utilisée pour indexer le cache → lue par timing. Elle **brise l'isolation user↔kernel** (contrairement à Spectre qui reste intra-espace). Correctif principal : **KPTI** (Kernel Page-Table Isolation) qui sépare les tables de pages user et kernel, au prix d'un peu de performance.",
    tags: ['appsec', 'side-channel', 'meltdown', 'cpu', 'kernel'],
  },
  {
    id: 'logic-cache-timing',
    type: 'mcq',
    domain: 'software',
    topic: 'appsec',
    difficulty: 'senior',
    title: 'Cache timing sur AES',
    company: 'Side-channel',
    scenario:
      "Une implémentation logicielle d'AES utilise des tables de lookup (S-box) indexées par des octets dépendant de la clé.",
    question: 'Quel side-channel menace cette implémentation ?',
    options: [
      "Un buffer overflow",
      "Cache-timing attack : les accès aux tables dépendent de la clé ; un attaquant observe quelles lignes de cache sont touchées (Prime+Probe / Flush+Reload) pour inférer des bits de clé. Utiliser une implémentation à temps constant (AES-NI matériel, bitslicing)",
      "Une race condition",
      "Une injection de code",
    ],
    answer: 1,
    explanation:
      "**Cache-timing side-channel** : les **lookups de table** (S-box) indexés par des valeurs liées à la clé provoquent des accès mémoire **dépendants du secret**. En observant l'état du cache (Prime+Probe, Flush+Reload), un attaquant sur la même machine infère des **bits de clé**. Parade : implémentations **à temps/accès constants** — **AES-NI** (instructions matérielles), bitslicing, ou tables évitées. C'est pourquoi le crypto « fait maison » en table est risqué.",
    tags: ['appsec', 'side-channel', 'cache-timing', 'aes'],
  },
];
