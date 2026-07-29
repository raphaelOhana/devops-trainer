===LESSON===
KEY: memory-safety
TOPIC: memory-safety
TITLE: Sécurité mémoire (C)
ICON: 🧨
INTRO: Le C ne vérifie ni les bornes des tableaux, ni la validité des pointeurs : c'est au programmeur de tout garantir. Une erreur d'un seul octet peut écraser l'adresse de retour et donner l'exécution de code à un attaquant. Ce cours couvre les grandes familles de bugs mémoire (débordements pile/tas, use-after-free, integer overflow, lecture hors bornes, format string) et les protections modernes (canary, ASLR, NX, PIE, FORTIFY, sanitizers). Références : CWE (MITRE) et SEI CERT C.
---SECTION---
HEADING: Le modèle mémoire d'un processus
BODY:
Un programme C organise sa mémoire en segments :

- **Text** : le code exécutable (lecture seule, non modifiable).
- **Data / BSS** : variables globales et statiques.
- **Heap (tas)** : allocations dynamiques (`malloc`/`free`), croît vers le haut.
- **Stack (pile)** : cadres d'appel de fonctions (variables locales, adresse de retour, arguments), croît vers le bas.

À chaque appel de fonction, un **cadre de pile** (stack frame) est empilé : il contient les variables locales **et l'adresse de retour** — l'adresse où reprendre l'exécution après la fonction. C'est cette adresse de retour qui fait de la pile une cible privilégiée : la corrompre, c'est détourner le flot d'exécution.

Le C **ne vérifie aucune borne** : écrire `buf[100]` dans un tableau de 10 est un *undefined behavior*, pas une erreur. Le programme continue, en corrompant ce qui suit.
---SECTION---
HEADING: Stack buffer overflow
BODY:
Le débordement de tampon sur la pile est la vulnérabilité mémoire historique.

```c
void greet(char *name) {
    char buf[32];
    strcpy(buf, name);   // aucune borne !
}
```

Si `name` dépasse 31 octets, `strcpy` continue d'écrire au-delà de `buf[32]`, écrasant les données de pile voisines **puis l'adresse de retour**. En contrôlant précisément le débordement, un attaquant remplace l'adresse de retour par l'adresse de son choix → **exécution de code arbitraire**.

**CWE-787 (Out-of-bounds Write) / CWE-121 (Stack-based Buffer Overflow).**

Correctifs :
- Fonctions **bornées** : `snprintf(buf, sizeof(buf), "%s", name)`.
- Vérifier les longueurs *avant* de copier.
- Ne jamais faire confiance à une taille d'entrée.
---SECTION---
HEADING: Heap buffer overflow
BODY:
Le tas n'échappe pas au problème : déborder un bloc `malloc` corrompt les blocs voisins et surtout les **métadonnées de l'allocateur**.

```c
char *b = malloc(16);
memcpy(b, input, input_len);   // si input_len > 16 → heap overflow
```

Entre deux chunks, l'allocateur (ptmalloc, jemalloc…) stocke des métadonnées : taille du chunk, pointeurs de listes de blocs libres. Les écraser permet, lors d'un `free`/`malloc` ultérieur, d'obtenir une **écriture arbitraire** (techniques *unlink*, *tcache poisoning*, *House of …*).

**CWE-122 (Heap-based Buffer Overflow).** L'exploitation est plus indirecte que sur la pile mais tout aussi puissante. Même remède : borner chaque écriture par la taille réellement allouée.
---SECTION---
HEADING: Off-by-one : l'erreur d'un octet
BODY:
Se tromper d'un seul indice suffit à créer une faille.

```c
int a[10];
for (int i = 0; i <= 10; i++)  // i=10 est hors bornes
    a[i] = 0;
```

Les indices valides d'un tableau de `N` éléments sont `0` à `N-1`. La condition doit être `i < N`, **jamais** `i <= N`.

Cas classique avec les chaînes : oublier l'octet du terminateur `\0`.

```c
char dst[8];
strncpy(dst, src, sizeof(dst));  // si src ≥ 8 : PAS de \0 final
printf("%s", dst);               // lit au-delà de dst
```

`strncpy` ne pose pas de `\0` quand la source remplit la destination. Idiome sûr : `strncpy(dst, src, sizeof(dst)-1); dst[sizeof(dst)-1] = '\0';`. **CWE-193 (Off-by-one), CWE-170 (Improper Null Termination).**
---SECTION---
HEADING: Use-after-free et pointeurs pendants
BODY:
Un **pointeur pendant** (dangling pointer) désigne une mémoire qui n'est plus valide. L'utiliser est un **use-after-free**.

```c
free(n);
head = n;   // n est libéré : use-after-free
```

Après `free`, le bloc peut être **réalloué** à un autre objet. Lire/écrire via l'ancien pointeur corrompt alors cet autre objet — technique d'exploitation par **heap grooming** (placer un objet contrôlé à l'emplacement libéré).

Autre forme fréquente : renvoyer l'adresse d'une variable **locale**.

```c
char *f(void) { char buf[32]; return buf; }  // buf disparaît au return
```

**CWE-416 (Use After Free), CWE-562 (Return of Stack Variable Address).**

Règle d'or : après chaque `free`, remettre le pointeur à `NULL`. Un déréférencement de `NULL` plante proprement plutôt que de corrompre silencieusement.
---SECTION---
HEADING: Double-free
BODY:
Libérer deux fois le même bloc corrompt les structures internes de l'allocateur.

```c
free(b);
// ... chemin d'erreur ...
free(b);   // double-free
```

Le second `free` insère le chunk une deuxième fois dans une liste de blocs libres. Un `malloc` ultérieur peut alors renvoyer **deux pointeurs vers le même bloc** → primitive d'exploitation puissante.

**CWE-415 (Double Free).**

Bonnes pratiques :
- Libérer à **un seul endroit** (souvent un label `cleanup:` unique).
- `b = NULL;` juste après `free` — `free(NULL)` est **sans effet** et sûr, ce qui neutralise un second appel.
---SECTION---
HEADING: Integer overflow → corruption mémoire
BODY:
Les entiers ont une taille finie ; un calcul qui dépasse **wrappe** silencieusement. Le danger surgit quand ce calcul sert à **dimensionner une allocation**.

```c
char *p = malloc(n * size);   // n * size peut wrapper → trop petit
for (uint32_t i = 0; i < n; i++)
    memcpy(p + i*size, src[i], size);  // écrit au-delà de p
```

Si `n * size` déborde le type, `malloc` alloue trop peu, puis la boucle écrit hors du bloc → **heap overflow**. **CWE-190 (Integer Overflow).**

Piège cousin : la **signedness**. Une taille `int` peut être négative ; convertie en `size_t` (non signé) par `memcpy`, elle devient colossale.

```c
if (len > MAX) return;      // ne rejette pas len négatif !
memcpy(dst, src, len);      // len<0 → taille énorme
```

Remèdes : `calloc(n, size)` (détecte le débordement), `reallocarray`, vérifier `n > SIZE_MAX / size`, et rester **cohérent en signedness** (`size_t` pour les tailles). **CWE-195 (Signed/Unsigned Conversion).**
---SECTION---
HEADING: Lecture hors bornes (out-of-bounds read)
BODY:
Toutes les corruptions ne sont pas des écritures : **lire** hors bornes fuit des données mémoire (secrets, pointeurs, clés).

```c
int get(int *arr, int size, int idx) {
    return arr[idx];   // idx non validé
}
```

L'archétype est **Heartbleed** (2014) : faire confiance à une **longueur fournie par le pair** sans la comparer aux données réellement reçues.

```c
memcpy(response, buffer, payload_len);  // payload_len vient de l'attaquant
send(fd, response, payload_len);        // renvoie la mémoire adjacente
```

**CWE-125 (Out-of-bounds Read), CWE-130 (Improper Handling of Length).** Toujours valider `0 <= idx < size` et comparer toute longueur externe à la taille **réellement disponible**.
---SECTION---
HEADING: Format string
BODY:
Passer une entrée utilisateur comme **chaîne de format** est une faille à part entière.

```c
printf(user_input);          // DANGER
printf("%s", user_input);    // correct
```

Si `user_input` contient des spécificateurs, l'attaquant peut :
- `%x`, `%p` : **lire** la pile (fuite d'adresses, contournement d'ASLR) ;
- `%s` : déréférencer un pointeur arbitraire (crash) ;
- **`%n`** : **écrire** le nombre d'octets déjà affichés à une adresse de la pile → écriture mémoire ciblée.

**CWE-134 (Uncontrolled Format String).** Le format doit **toujours** être une chaîne **constante** ; la donnée passe en argument.
---SECTION---
HEADING: NULL deref et mémoire non initialisée
BODY:
### Déréférencement de NULL
`malloc` renvoie `NULL` en cas d'échec. L'utiliser sans vérifier déréférence `NULL`.

```c
char *buf = malloc(size);
memcpy(buf, data, size);   // si malloc a échoué : crash
```

**CWE-476 (NULL Pointer Dereference).** Toujours `if (!buf) { /* gérer */ }`.

### Mémoire non initialisée
Une variable locale non initialisée contient des **restes de pile** — potentiellement des données sensibles d'un appel précédent.

```c
char key[16];
if (have_key) load_key(key);
use_key(key);   // si !have_key : octets arbitraires
```

**CWE-457 (Use of Uninitialized Variable).** Initialiser explicitement (`char key[16] = {0};`) et gérer les chemins où la donnée n'est pas remplie.
---SECTION---
HEADING: Les fonctions à bannir
BODY:
Certaines fonctions de la libc sont dangereuses **par conception** : elles n'ont aucun moyen de connaître la taille de la destination. À bannir, et par quoi les remplacer :

- **`gets`** : aucune borne possible (retiré du C11) → `fgets(buf, sizeof buf, stdin)`
- **`strcpy`** : pas de borne → `snprintf` ou `strlcpy`
- **`strcat`** : pas de borne → `snprintf` ou `strlcat`
- **`sprintf`** : pas de borne de destination → `snprintf(buf, sizeof buf, …)`
- **`scanf("%s")`** : pas de largeur → `scanf("%15s", …)` ou `fgets`

`memcpy`/`memmove` restent sûrs **à condition que la taille soit correcte** — ils ne dispensent pas de valider les longueurs. Astuce : `sizeof(tab)` donne la taille du **tableau** dans sa portée de déclaration, mais sur un **pointeur** il vaut 4/8 octets (**CWE-467**) — passez toujours la taille en paramètre.
---SECTION---
HEADING: TOCTOU : les races sur le système de fichiers
BODY:
Une faille mémoire peut aussi être une faille de **concurrence**. Le schéma **TOCTOU** (Time-Of-Check To Time-Of-Use) sépare la vérification de l'usage.

```c
if (access(path, W_OK) == 0) {   // check
    FILE *f = fopen(path, "w");  // use — le fichier a pu changer !
    ...
}
```

Entre `access` et `fopen`, un attaquant remplace `path` par un **lien symbolique** vers un fichier sensible → écriture arbitraire (souvent en tant que root). **CWE-367 (TOCTOU Race Condition).**

Correctif : opérer sur un **descripteur de fichier** unique plutôt que sur un chemin — `open` avec `O_NOFOLLOW` et `O_CREAT|O_EXCL`, puis `fstat`/écriture sur le `fd`.
---SECTION---
HEADING: Mitigations du compilateur et de l'OS
BODY:
Aucune de ces protections ne « corrige » les bugs — elles rendent l'exploitation plus difficile. On les empile (**défense en profondeur**).

- **Stack canary** (`-fstack-protector`) : valeur secrète placée avant l'adresse de retour ; vérifiée à la sortie de fonction. Un débordement séquentiel la modifie → abandon (`__stack_chk_fail`).
- **NX / DEP** : la pile et le tas sont **non exécutables**. Le shellcode injecté ne tourne plus → l'attaquant passe au **ROP** (réutiliser du code existant).
- **ASLR** : randomise les adresses de base (pile, tas, libs) à chaque exécution → les adresses ne sont plus prévisibles. Contourné par une **fuite d'adresse**.
- **PIE** : rend l'exécutable lui-même relocalisable, pour que l'ASLR couvre aussi son code.
- **RELRO** : rend la table de liaison (GOT) en lecture seule après le démarrage.
- **FORTIFY_SOURCE=2** : remplace `memcpy`/`strcpy`/`sprintf`… par des variantes `__*_chk` qui vérifient les bornes quand la taille est connue à la compilation.

Un binaire moderne devrait cumuler canary + NX + ASLR/PIE + RELRO + FORTIFY.
---SECTION---
HEADING: Détecter et prévenir en amont
BODY:
### Sanitizers (développement / CI)
- **AddressSanitizer** (`-fsanitize=address`) : place des *redzones* autour des allocations et suit chaque octet (shadow memory). Détecte et **localise** OOB read/write, use-after-free, double-free, fuites. Coût ≈ 2× → test et **fuzzing**, pas production.
- **UBSan** (`-fsanitize=undefined`) : attrape les *undefined behaviors* (overflow signé, décalages invalides…).
- **Valgrind/Memcheck** : détection dynamique sans recompilation, plus lent.

### Fuzzing
`libFuzzer`, `AFL++` : bombardent le programme d'entrées aléatoires guidées par la couverture, combinés à ASan, pour révéler les crashs mémoire automatiquement.

### Choix du langage
La meilleure prévention reste structurelle : **Rust** garantit la sûreté mémoire à la compilation (ownership, borrow checker) sans ramasse-miettes ; Go, Java, etc. bornent les tableaux et gèrent la mémoire automatiquement. Pour du nouveau code système sensible, un langage *memory-safe* élimine des classes entières de vulnérabilités (position soutenue par la CISA et le NCSC).
===END===
