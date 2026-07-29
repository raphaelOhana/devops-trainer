import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Sécurité mémoire (C) » — bugs mémoire bas niveau : débordements de
// tampon (pile/tas), use-after-free, double-free, off-by-one, integer
// overflow, lecture hors bornes, format string, pointeurs pendants, mémoire
// non initialisée + mitigations (canary, ASLR, NX/DEP, PIE, FORTIFY).
// Ancré sur CWE (MITRE) et les recommandations SEI CERT C.
// Options équilibrées, bonne réponse en index 0, position randomisée par shuffle.ts.
// ---------------------------------------------------------------------------

type Lang = Extract<Exercise, { type: 'find-error' }>['language'];

// find-error en C
const F = (
  id: string, difficulty: Exercise['difficulty'], title: string, company: string,
  code: string, question: string, options: string[], explanation: string, tags: string[],
): Exercise => ({
  id, type: 'find-error', domain: 'software', topic: 'memory-safety', difficulty,
  title, company, language: 'c' as Lang, code, question, options, answer: 0, explanation, tags,
});

// quiz (mcq) — concepts et mitigations
const Q = (
  id: string, difficulty: Exercise['difficulty'], title: string,
  question: string, options: string[], explanation: string, tags: string[],
  scenario?: string,
): Exercise => ({
  id, type: 'mcq', domain: 'software', topic: 'memory-safety', difficulty,
  title, ...(scenario ? { scenario } : {}), question, options, answer: 0, explanation, tags,
});

export const memoryExercises: Exercise[] = [
  // ---------------------------------------------------------- Stack overflow
  F('mem-stack-strcat', 'intermediate', 'strcat sans borne', 'CWE-787',
    `void build(char *first, char *last) {
    char full[64];
    strcpy(full, first);
    strcat(full, " ");
    strcat(full, last);   // <-- ici
}`,
    'Quel est le défaut ?',
    ['Aucune borne : first + last peuvent dépasser full[64] et déborder la pile',
     'strcat renvoie une valeur qui devrait être vérifiée avant usage',
     'full devrait être un pointeur alloué par malloc plutôt qu\'un tableau',
     'Il manque un appel à memset pour initialiser full avant la copie'],
    'Ni `strcpy` ni `strcat` ne bornent l\'écriture : si `first`+`last`+séparateur ≥ 64 octets, on écrase la pile (adresse de retour). **CWE-787 (Out-of-bounds Write)**. Correctif : `snprintf(full, sizeof(full), "%s %s", first, last)`.',
    ['c', 'stack-overflow', 'strcat', 'cwe-787']),

  F('mem-scanf-nolimit', 'intermediate', 'scanf %s non borné', 'CWE-120',
    `char name[16];
printf("Name? ");
scanf("%s", name);   // <-- ici`,
    'Où est la vulnérabilité ?',
    ['%s de scanf n\'a pas de limite de largeur : une entrée > 15 octets déborde name',
     'name devrait être initialisé à zéro avant l\'appel à scanf',
     'printf doit précéder un fflush(stdout) pour afficher le prompt',
     'scanf renvoie le nombre de champs lus, jamais vérifié ici'],
    '`scanf("%s", ...)` écrit sans limite → débordement classique. Utiliser une **largeur** : `scanf("%15s", name)` (15 + le `\\0`), ou `fgets(name, sizeof(name), stdin)`. CWE-120.',
    ['c', 'stack-overflow', 'scanf', 'cwe-120']),

  F('mem-sprintf', 'intermediate', 'sprintf vers tampon fixe', 'CWE-120',
    `char url[128];
sprintf(url, "https://%s/%s", host, path);   // <-- ici`,
    'Quel est le risque ?',
    ['sprintf ne borne pas : host + path longs débordent url[128]',
     'Le protocole https devrait être une constante nommée',
     'url devrait être déclaré const pour éviter la modification',
     'Il faut échapper les caractères spéciaux de path avant concaténation'],
    '`sprintf` n\'a aucune borne de destination. Avec des `host`/`path` contrôlés, on déborde. Utiliser **`snprintf(url, sizeof(url), ...)`** et vérifier la valeur de retour (tronquage). CWE-120.',
    ['c', 'stack-overflow', 'sprintf', 'cwe-120']),

  // ---------------------------------------------------------- Off-by-one
  F('mem-offbyone-loop', 'senior', 'Boucle <= sur un tableau', 'CWE-193',
    `int a[10];
for (int i = 0; i <= 10; i++)   // <-- ici
    a[i] = 0;`,
    'Quel est le bug ?',
    ['i <= 10 accède à a[10], hors du tableau de 10 éléments (indices 0..9)',
     'Le tableau a devrait être initialisé avec {0} à la déclaration',
     'La variable i devrait être de type size_t et non int',
     'Il faut déclarer a en static pour garantir sa mise à zéro'],
    '**Off-by-one (CWE-193)** : `<= 10` itère `i=0..10`, or `a[10]` est hors bornes (valides : `0..9`). Écriture hors limites sur la pile. Correctif : `i < 10`. Règle : `i < N`, pas `i <= N`.',
    ['c', 'off-by-one', 'cwe-193']),

  F('mem-offbyone-nul', 'senior', 'strncpy et le \\0 oublié', 'CWE-170',
    `char dst[8];
strncpy(dst, src, sizeof(dst));   // <-- ici
printf("%s\\n", dst);`,
    'Quel est le problème ?',
    ['Si src fait ≥ 8 octets, strncpy ne pose pas de \\0 : printf lit hors bornes',
     'strncpy est obsolète et remplacé par strcpy dans le C moderne',
     'sizeof(dst) devrait être sizeof(src) pour copier toute la source',
     'dst devrait être alloué sur le tas pour survivre à la fonction'],
    '`strncpy` **ne termine pas** par `\\0` si la source remplit exactement (ou dépasse) la destination. `printf("%s")` lit alors au-delà (**over-read**, CWE-170/125). Correctif : `strncpy(dst, src, sizeof(dst)-1); dst[sizeof(dst)-1] = 0;`.',
    ['c', 'off-by-one', 'strncpy', 'cwe-170']),

  // ---------------------------------------------------------- Use-after-free
  F('mem-uaf-return', 'intermediate', 'Pointeur vers pile locale', 'CWE-562',
    `char *make_greeting(void) {
    char buf[32];
    strcpy(buf, "hello");
    return buf;   // <-- ici
}`,
    'Pourquoi est-ce dangereux ?',
    ['buf est sur la pile : à la sortie de la fonction, le pointeur devient pendant',
     'strcpy devrait être snprintf même pour une chaîne littérale',
     'La fonction devrait renvoyer un int de statut, pas un pointeur',
     'buf[32] est trop petit pour contenir la chaîne "hello"'],
    'On renvoie l\'adresse d\'une variable **locale** (pile). Après le `return`, ce cadre est réutilisé → **pointeur pendant** (CWE-562). Correctif : `malloc` + copie (l\'appelant `free`), ou tampon fourni par l\'appelant, ou `static` (attention à la réentrance).',
    ['c', 'use-after-free', 'dangling', 'cwe-562']),

  F('mem-uaf-free', 'senior', 'Accès après free()', 'CWE-416',
    `Node *n = malloc(sizeof(Node));
n->next = head;
free(n);
head = n;   // <-- ici`,
    'Quelle est la faille ?',
    ['n est libéré puis réutilisé (head = n) : use-after-free sur mémoire recyclée',
     'malloc n\'est pas vérifié contre NULL avant le déréférencement',
     'sizeof(Node) devrait être sizeof(*n) pour la portabilité',
     'head doit être passé par double pointeur pour être modifié'],
    '**Use-after-free (CWE-416)** : après `free(n)`, le bloc peut être réalloué ; `head = n` conserve un pointeur vers de la mémoire recyclée → corruption ou exécution de code (heap grooming). Ne jamais réutiliser un pointeur libéré ; mettre `n = NULL` après `free`.',
    ['c', 'use-after-free', 'cwe-416']),

  F('mem-double-free', 'senior', 'Double free()', 'CWE-415',
    `char *b = malloc(64);
if (error) {
    free(b);
    goto cleanup;
}
// ...
cleanup:
    free(b);   // <-- ici`,
    'Quel est le bug ?',
    ['Sur le chemin d\'erreur, b est libéré deux fois : double-free',
     'malloc(64) devrait utiliser calloc pour zéro-initialiser',
     'goto est interdit et casse la portée de la variable b',
     'Le label cleanup devrait libérer error avant b'],
    '**Double-free (CWE-415)** : sur le chemin `error`, `free(b)` est appelé, puis à nouveau en `cleanup`. Corrompt les métadonnées du tas (exploitable). Correctif : libérer à **un seul endroit**, et `b = NULL` après `free` (`free(NULL)` est sûr).',
    ['c', 'double-free', 'cwe-415']),

  // ---------------------------------------------------------- Integer issues
  F('mem-int-mul', 'senior', 'malloc(n * size) qui déborde', 'CWE-190',
    `void *dup(uint32_t n, uint32_t size) {
    char *p = malloc(n * size);   // <-- ici
    for (uint32_t i = 0; i < n; i++)
        memcpy(p + i*size, src[i], size);
    return p;
}`,
    'Quelle est la vulnérabilité ?',
    ['n * size peut déborder (wrap) : malloc alloue trop peu, puis heap overflow',
     'malloc devrait être remplacé par une allocation sur la pile',
     'La boucle devrait s\'arrêter à i <= n pour copier le dernier élément',
     'memcpy devrait être memmove pour gérer le chevauchement'],
    '**Integer overflow → heap overflow (CWE-190)** : `n * size` peut *wrapper* sur 32 bits → `malloc` trop petit, puis la boucle écrit au-delà. Correctif : vérifier `n && size > SIZE_MAX/n`, ou utiliser `calloc(n, size)` (qui détecte le débordement), ou `reallocarray`.',
    ['c', 'integer-overflow', 'heap-overflow', 'cwe-190']),

  F('mem-int-signed-len', 'senior', 'Longueur signée négative', 'CWE-195',
    `void copy(char *dst, char *src, int len) {
    if (len > MAX) return;
    memcpy(dst, src, len);   // <-- ici
}`,
    'Où est le piège ?',
    ['len signé peut être négatif ; converti en size_t énorme par memcpy',
     'La comparaison len > MAX devrait être len >= MAX',
     'memcpy devrait vérifier que dst et src ne se chevauchent pas',
     'dst devrait être alloué avec malloc(len) avant la copie'],
    'Le contrôle `len > MAX` laisse passer les **valeurs négatives**. `memcpy` prend un `size_t` (non signé) : un `len` négatif devient un nombre colossal → copie massive hors bornes (**CWE-195/190**). Correctif : `size_t len` + `if (len > MAX)`, ou vérifier `len < 0`.',
    ['c', 'integer-overflow', 'signedness', 'cwe-195']),

  F('mem-int-cast', 'senior', 'Cast unsigned → signed', 'CWE-195',
    `unsigned int total = get_count();  // ex. 0xFFFFFFFF
int n = total;                     // <-- ici
for (int i = 0; i < n; i++)
    process(items[i]);`,
    'Quel est le comportement dangereux ?',
    ['total non signé (ex. 4294967295) devient un int négatif : la boucle se comporte mal ou déborde',
     'get_count devrait renvoyer un size_t plutôt qu\'un unsigned int',
     'La boucle devrait utiliser un index de type unsigned int',
     'process devrait recevoir un pointeur const sur items'],
    'Convertir un `unsigned` > `INT_MAX` vers `int` donne un résultat **implementation-defined** (souvent négatif). La boucle est alors incohérente et un contrôle de borne basé sur `n` peut être contourné. Rester **cohérent en signedness** ; utiliser `size_t` pour des tailles.',
    ['c', 'integer-overflow', 'signedness', 'cwe-195']),

  // ---------------------------------------------------------- OOB read
  F('mem-oob-read', 'intermediate', 'Lecture hors bornes (index client)', 'CWE-125',
    `int get(int *arr, int size, int idx) {
    return arr[idx];   // <-- ici
}`,
    'Que manque-t-il ?',
    ['Aucune vérification 0 <= idx < size : lecture hors bornes possible',
     'arr devrait être déclaré const int * pour interdire l\'écriture',
     'La fonction devrait renvoyer un long pour éviter la troncature',
     'size devrait être de type size_t plutôt que int'],
    '**Out-of-bounds read (CWE-125)** : `idx` non validé permet de lire n\'importe où (fuite d\'infos type Heartbleed). Correctif : `if (idx < 0 || idx >= size) return -1;` avant l\'accès.',
    ['c', 'oob-read', 'cwe-125']),

  F('mem-heartbleed', 'senior', 'Longueur fournie par le pair', 'CWE-130',
    `// buffer reçu du réseau, payload_len vient du pair
memcpy(response, buffer, payload_len);   // <-- ici
send(fd, response, payload_len);`,
    'Quelle classe de faille (type Heartbleed) ?',
    ['payload_len n\'est pas validée contre la taille réelle reçue : over-read et fuite mémoire',
     'response devrait être alloué avec calloc au lieu de malloc',
     'send peut envoyer moins d\'octets que demandé sans être vérifié',
     'memcpy devrait être remplacé par une boucle octet par octet'],
    'C\'est le schéma **Heartbleed (CWE-130/125)** : on fait confiance à une longueur contrôlée par l\'attaquant sans la comparer à la taille réellement reçue → on copie/renvoie de la mémoire adjacente (clés, secrets). Toujours **valider les longueurs issues du réseau** contre les données réellement disponibles.',
    ['c', 'oob-read', 'heartbleed', 'cwe-130']),

  // ---------------------------------------------------------- Format string
  F('mem-fmt-printf', 'intermediate', 'printf(user_input)', 'CWE-134',
    `void show(char *user_input) {
    printf(user_input);   // <-- ici
}`,
    'Quelle est la vulnérabilité ?',
    ['Chaîne de format contrôlée par l\'utilisateur : %x/%n permettent lecture/écriture mémoire',
     'printf devrait être suivi d\'un fflush pour vider le tampon',
     'user_input devrait être copié dans un tampon local avant affichage',
     'Il manque un retour à la ligne \\n en fin de format'],
    '**Format string (CWE-134)** : passer une entrée utilisateur comme *format* laisse injecter `%x` (fuite pile), `%s` (crash), `%n` (**écriture** mémoire). Correctif : `printf("%s", user_input)`. Toujours un format **constant**.',
    ['c', 'format-string', 'cwe-134']),

  // ---------------------------------------------------------- malloc misuse
  F('mem-null-deref', 'intermediate', 'malloc non vérifié', 'CWE-476',
    `char *buf = malloc(size);
memcpy(buf, data, size);   // <-- ici`,
    'Quel est le défaut ?',
    ['malloc peut renvoyer NULL (échec) : memcpy déréférence alors un pointeur NULL',
     'size devrait être multiplié par sizeof(char) pour l\'allocation',
     'buf devrait être libéré immédiatement après la copie',
     'memcpy devrait être memmove pour la sécurité'],
    '**NULL pointer dereference (CWE-476)** : si `malloc` échoue il renvoie `NULL` ; `memcpy(NULL, ...)` plante (DoS) ou pire selon le mapping de la page 0. Toujours `if (!buf) { /* gérer */ }` après allocation.',
    ['c', 'null-deref', 'malloc', 'cwe-476']),

  F('mem-uninit', 'intermediate', 'Mémoire non initialisée', 'CWE-457',
    `char key[16];
if (have_key) load_key(key);
use_key(key);   // <-- ici`,
    'Quel est le risque ?',
    ['Si have_key est faux, key contient des octets de pile arbitraires (non initialisés)',
     'key[16] est trop court pour une clé cryptographique moderne',
     'load_key devrait renvoyer un code d\'erreur vérifié',
     'use_key devrait recevoir la taille du tampon en second argument'],
    '**Use of uninitialized memory (CWE-457)** : sur le chemin `!have_key`, `key` garde des restes de pile (données d\'un autre appel, potentiellement sensibles) et le comportement est indéterminé. Initialiser : `char key[16] = {0};` et gérer explicitement l\'absence de clé.',
    ['c', 'uninitialized', 'cwe-457']),

  F('mem-realloc-leak', 'senior', 'realloc qui écrase le pointeur', 'CWE-401',
    `buf = realloc(buf, new_size);   // <-- ici
if (!buf) return -1;`,
    'Quel est le problème classique ?',
    ['Si realloc échoue (NULL), l\'ancien buf est perdu : fuite mémoire (le bloc d\'origine n\'est pas libéré)',
     'realloc ne peut pas agrandir un bloc, seulement le réduire',
     'new_size devrait être vérifié contre zéro avant l\'appel',
     'buf devrait être casté en (char *) après realloc'],
    '`realloc` renvoie `NULL` en cas d\'échec **sans libérer** l\'ancien bloc. `buf = realloc(buf, ...)` écrase alors la seule référence → **fuite (CWE-401)**. Idiome sûr : `tmp = realloc(buf, n); if (!tmp) { free(buf); ... } buf = tmp;`.',
    ['c', 'memory-leak', 'realloc', 'cwe-401']),

  F('mem-sizeof-ptr', 'senior', 'sizeof sur un pointeur', 'CWE-467',
    `void copy(char *dst, char *src) {
    memcpy(dst, src, sizeof(dst));   // <-- ici
}`,
    'Pourquoi la copie est-elle fausse ?',
    ['sizeof(dst) vaut la taille d\'un pointeur (8 octets), pas celle du tampon pointé',
     'memcpy devrait toujours utiliser strlen pour les chaînes',
     'dst et src devraient être des const char *',
     'sizeof doit être appliqué au type char et non à la variable'],
    '**CWE-467** : `sizeof` sur un *pointeur* renvoie la taille du pointeur (4/8 octets), pas celle de la zone visée. On copie donc 8 octets au lieu du contenu réel. La taille doit être **passée en paramètre** ; `sizeof(tab)` ne marche que sur un *tableau* dans sa portée de déclaration.',
    ['c', 'sizeof', 'cwe-467']),

  F('mem-stack-vla', 'senior', 'VLA à taille contrôlée', 'CWE-789',
    `void handle(int n) {   // n vient du réseau
    char buf[n];          // <-- ici
    read_into(buf, n);
}`,
    'Quel est le danger ?',
    ['n contrôlé par l\'attaquant dimensionne un tableau sur la pile : épuisement / stack clash',
     'Les VLA sont interdits par le standard C et ne compilent pas',
     'buf devrait être un int[] et non un char[]',
     'read_into devrait renvoyer le nombre d\'octets lus'],
    'Un **VLA** (tableau à longueur variable) dimensionné par une valeur non fiable permet une allocation pile énorme ou négative → **stack exhaustion / stack clash (CWE-789)**. Éviter les VLA sur des tailles externes ; borner `n` ou allouer sur le tas avec vérification.',
    ['c', 'stack-overflow', 'vla', 'cwe-789']),

  F('mem-toctou-tmp', 'senior', 'TOCTOU sur fichier temporaire', 'CWE-367',
    `if (access(path, W_OK) == 0) {   // <-- ici
    FILE *f = fopen(path, "w");
    fwrite(data, 1, len, f);
}`,
    'Quelle est la faille de concurrence ?',
    ['Entre access() et fopen(), le fichier peut être remplacé (lien symbolique) : TOCTOU',
     'access renvoie -1 en cas de succès, la condition est inversée',
     'fopen devrait ouvrir en mode "wb" pour les données binaires',
     'fwrite ne vérifie pas le nombre d\'octets réellement écrits'],
    '**TOCTOU (CWE-367)** : le contrôle (`access`) et l\'usage (`fopen`) sont deux opérations distinctes ; un attaquant substitue un symlink entre les deux (écriture arbitraire en tant que root). Correctif : `open` avec `O_NOFOLLOW`/`O_CREAT|O_EXCL`, opérer sur le descripteur (`fstat`), pas sur le chemin.',
    ['c', 'toctou', 'race-condition', 'cwe-367']),

  F('mem-gets', 'junior', 'gets() interdit', 'CWE-242',
    `char line[80];
gets(line);   // <-- ici
process(line);`,
    'Pourquoi gets() est-il proscrit ?',
    ['gets ne connaît pas la taille de line : toute entrée longue déborde, sans borne possible',
     'gets ne lit qu\'un seul caractère à la fois, c\'est trop lent',
     'gets ajoute un \\n final qu\'il faut retirer manuellement',
     'gets nécessite d\'inclure stdlib.h au lieu de stdio.h'],
    '`gets` **ne peut pas** être utilisé en sécurité : aucun moyen de lui passer la taille du tampon → débordement garanti sur entrée longue. **Supprimé du C11 (CWE-242)**. Utiliser `fgets(line, sizeof(line), stdin)`.',
    ['c', 'stack-overflow', 'gets', 'cwe-242']),

  F('mem-strlen-oob', 'senior', 'strlen sur données non terminées', 'CWE-125',
    `// data lu depuis un socket, pas garanti \\0-terminé
size_t n = strlen(data);   // <-- ici
memcpy(out, data, n);`,
    'Quel est le bug ?',
    ['data réseau n\'est pas forcément terminé par \\0 : strlen lit hors bornes',
     'strlen renvoie un int, pas un size_t, d\'où une troncature',
     'memcpy devrait copier n+1 octets pour inclure le \\0',
     'out devrait être alloué avec strlen(data)+1 octets'],
    'Les données réseau/binaires ne sont **pas garanties `\\0`-terminées** ; `strlen` parcourt alors la mémoire jusqu\'à tomber sur un zéro → **over-read (CWE-125)**. Travailler avec une **longueur explicite** connue à la réception, pas avec les fonctions `str*`.',
    ['c', 'oob-read', 'strlen', 'cwe-125']),

  // ---------------------------------------------------------- MCQ concepts / mitigations
  Q('mem-q-stack-vs-heap', 'intermediate', 'Débordement pile vs tas',
    'Quelle différence principale entre un stack overflow et un heap overflow ?',
    ['Le stack overflow écrase l\'adresse de retour / variables locales ; le heap overflow corrompt les métadonnées d\'allocation et objets voisins',
     'Le stack overflow concerne le disque, le heap overflow la RAM',
     'Le heap overflow n\'est jamais exploitable, seulement le stack overflow',
     'Les deux désignent exactement le même bug à des noms différents'],
    'Sur la **pile**, déborder écrase les variables locales et surtout l\'**adresse de retour** (détournement du flot). Sur le **tas**, on corrompt les **métadonnées du chunk** (taille, pointeurs de liste libre) et les objets adjacents → primitives d\'écriture (heap grooming). Mécanismes et exploitation différents.',
    ['concept', 'stack', 'heap'],
    'Un collègue confond les deux types de débordement en revue de code.'),

  Q('mem-q-canary', 'senior', 'Stack canary',
    'À quoi sert un « stack canary » (stack protector) ?',
    ['Une valeur aléatoire placée avant l\'adresse de retour ; si un overflow la modifie, le programme abandonne avant le return',
     'Un compteur qui limite la profondeur de récursion autorisée',
     'Un chiffrement de la pile activé par le CPU à chaque appel',
     'Un outil qui détecte les fuites mémoire à l\'exécution'],
    'Le **canary** (`-fstack-protector`) est une valeur secrète insérée entre les variables locales et l\'adresse de retour. Un débordement séquentiel l\'écrase ; à la sortie de fonction, le compilateur vérifie sa valeur et **avorte** (`__stack_chk_fail`) si elle a changé. Contourné par les écritures non contiguës ou les fuites du canary.',
    ['mitigation', 'canary']),

  Q('mem-q-aslr', 'senior', 'ASLR',
    'Que rend plus difficile l\'ASLR (Address Space Layout Randomization) ?',
    ['Prédire les adresses (pile, tas, bibliothèques) : l\'attaquant ne connaît plus où sauter/écrire',
     'Écrire dans un tampon au-delà de sa taille déclarée',
     'Allouer de la mémoire sans passer par malloc',
     'Exécuter du code présent dans le segment .text'],
    '**ASLR** randomise les adresses de base à chaque exécution → un exploit ne peut plus coder en dur l\'adresse d\'un gadget ou d\'un shellcode. Se combine avec **PIE** (exécutable lui-même relocalisable). Contourné par une **fuite d\'adresse** (info leak) qui révèle une base.',
    ['mitigation', 'aslr']),

  Q('mem-q-nx', 'senior', 'NX / DEP',
    'Que garantit le bit NX (No-eXecute, aussi appelé DEP) ?',
    ['Les pages de données (pile, tas) ne sont pas exécutables : injecter du shellcode dans un tampon ne suffit plus',
     'Aucune page mémoire ne peut être modifiée après le démarrage',
     'Chaque allocation est chiffrée avec une clé par processus',
     'Les débordements de tampon deviennent impossibles'],
    '**NX/DEP** marque la pile et le tas **non exécutables** : le shellcode qu\'on y injecte ne peut plus tourner. La réponse des attaquants est le **ROP** (Return-Oriented Programming) : réutiliser des morceaux de code déjà exécutable. NX élève la barre, ne supprime pas l\'exploitation.',
    ['mitigation', 'nx', 'dep', 'rop']),

  Q('mem-q-safe-fns', 'intermediate', 'Fonctions à bannir',
    'Quel ensemble de fonctions C faut-il éviter au profit de variantes bornées ?',
    ['gets, strcpy, strcat, sprintf — remplacées par fgets, strncpy/strlcpy, snprintf',
     'malloc, free, realloc — remplacées par new et delete',
     'printf, puts, putchar — remplacées par write',
     'memcpy, memmove, memset — remplacées par des boucles manuelles'],
    'Les fonctions **sans borne de destination** (`gets`, `strcpy`, `strcat`, `sprintf`, `scanf("%s")`) sont les causes historiques de débordement. On leur préfère les variantes qui prennent une **taille** : `fgets`, `snprintf`, `strncpy`/`strlcpy`, `strncat`. `memcpy` reste sûr *si* la taille est correcte.',
    ['mitigation', 'safe-functions']),

  Q('mem-q-asan', 'intermediate', 'AddressSanitizer',
    'À quoi sert AddressSanitizer (ASan) pendant le développement ?',
    ['Instrumenter le binaire pour détecter à l\'exécution les débordements, use-after-free et fuites, avec la localisation exacte',
     'Chiffrer automatiquement toutes les allocations mémoire',
     'Empêcher toute compilation contenant un appel à strcpy',
     'Réduire l\'empreinte mémoire du programme en production'],
    '**ASan** (`-fsanitize=address`) place des « redzones » autour des allocations et suit l\'état de chaque octet (shadow memory). Il **stoppe et localise** précisément OOB read/write, use-after-free, double-free, fuites. Coûteux (≈2×) → outil de **test/CI et fuzzing**, pas de production.',
    ['mitigation', 'asan', 'testing']),

  Q('mem-q-fortify', 'senior', 'FORTIFY_SOURCE',
    'Que fait `_FORTIFY_SOURCE=2` avec optimisations activées ?',
    ['Remplace certaines fonctions (memcpy, strcpy, sprintf…) par des variantes qui vérifient les bornes quand la taille est connue à la compilation',
     'Désactive toutes les fonctions de la libc jugées dangereuses',
     'Chiffre la pile entre chaque appel de fonction',
     'Force l\'allocation de toute la mémoire au démarrage du programme'],
    '**FORTIFY_SOURCE** substitue aux fonctions de copie des versions `__*_chk` qui, lorsque le compilateur connaît la taille de destination, insèrent un **contrôle de borne** à l\'exécution et avortent en cas de débordement. Défense en profondeur peu coûteuse, mais limitée aux tailles connues statiquement.',
    ['mitigation', 'fortify', 'hardening']),
];
