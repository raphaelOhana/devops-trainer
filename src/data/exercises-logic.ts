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
      'Injection SQL via le champ quantité du panier',
      'Une quantité négative donne un total négatif : le paiement crédite l\'attaquant',
      'Le prix unitaire peut être modifié côté client',
      'Le panier n\'est pas chiffré pendant le transit',
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
      'Rien : la vérification « déjà utilisé » protège le coupon',
      'Race condition : les 30 requêtes passent le check avant le marquage',
      'Le code du coupon est trop court pour résister au brute force',
      'Le coupon devrait être chiffré côté serveur avant envoi',
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
      'XSS stockée sur la page de confirmation /confirm',
      'Workflow cassé : le serveur ne vérifie pas que /payment a eu lieu',
      'CSRF sur l\'endpoint d\'ajout au panier /cart',
      'Absence de HTTPS sur le tunnel de commande',
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
      'newPassword devrait être haché avant stockage (le vrai bug)',
      'userId vient du body : l\'attaquant cible l\'ID de la victime',
      'Il manque un bloc try/catch autour de setPassword',
      'setPassword est asynchrone et n\'est pas attendu',
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
      'Le code OTP à 6 chiffres est trop court',
      'La session est pleinement authentifiée dès /login, avant l\'OTP',
      'L\'OTP devrait être chiffré avant sa transmission',
      'Le cookie de session devrait être plus long',
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
      'Les calculs en float sont trop lents pour la finance',
      'Le float ne représente pas exactement les décimaux (erreurs d\'arrondi)',
      'Les montants devraient être chiffrés en base de données',
      'Le type double est déprécié dans les langages récents',
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
      'attempts devrait être une Map plutôt qu\'un objet',
      'X-Forwarded-For est contrôlé par le client : il le change à chaque requête',
      'Le seuil de 5 tentatives est beaucoup trop bas',
      'Le code 429 n\'est pas le bon statut à renvoyer',
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
      'Impossible : la clé reste secrète côté serveur',
      'L\'arrêt au premier octet faux fait fuir la clé octet par octet',
      'Il suffit d\'allonger la clé pour empêcher l\'attaque',
      'HTTPS masque les temps de réponse mesurés par l\'attaquant',
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
      'SHA-256 est cryptographiquement cassé',
      'H(secret‖message) laisse forger H(…‖extra) sans connaître le secret',
      'Le secret utilisé pour le MAC est trop court',
      'Il faudrait utiliser SHA-512 au lieu de SHA-256',
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
      'Aucune : cette distinction d\'erreur est anodine',
      'L\'erreur « padding invalide » est un oracle déchiffrant octet par octet',
      'Il suffit d\'utiliser une clé AES plus longue',
      'Le mode CBC est de toute façon toujours sûr',
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
      'Un bug dans l\'optimiseur du compilateur',
      'L\'exécution spéculative laisse une trace lisible dans le cache',
      'Un simple dépassement de buffer sur la pile',
      'Une injection SQL réalisée au niveau matériel',
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
      'C\'est exactement la même attaque que Spectre',
      'L\'exécution out-of-order lit la mémoire kernel avant le contrôle',
      'Meltdown est un bug purement logiciel du noyau',
      'Meltdown ne touche que la pile réseau du système',
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
      'Un débordement de tampon dans la table S-box',
      'Les accès aux tables dépendent de la clé (cache-timing)',
      'Une race condition entre les tours de chiffrement',
      'Une injection de code dans l\'implémentation d\'AES',
    ],
    answer: 1,
    explanation:
      "**Cache-timing side-channel** : les **lookups de table** (S-box) indexés par des valeurs liées à la clé provoquent des accès mémoire **dépendants du secret**. En observant l'état du cache (Prime+Probe, Flush+Reload), un attaquant sur la même machine infère des **bits de clé**. Parade : implémentations **à temps/accès constants** — **AES-NI** (instructions matérielles), bitslicing, ou tables évitées. C'est pourquoi le crypto « fait maison » en table est risqué.",
    tags: ['appsec', 'side-channel', 'cache-timing', 'aes'],
  },
];
