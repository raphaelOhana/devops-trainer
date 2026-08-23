===LESSON===
KEY: reversing
TOPIC: reversing
TITLE: Reverse engineering
ICON: 🔬
INTRO: Le reverse engineering, c'est l'art de reconstruire la logique d'un programme dont on ne possède que le binaire — sans code source, sans documentation — en lisant l'assembleur, en comprenant comment le système d'exploitation charge et exécute le code, et en déjouant les protections que les auteurs (légitimes ou malveillants) dressent pour vous ralentir.
---SECTION---
HEADING: Pourquoi et comment : la boucle du reverser
BODY:
Reverser un binaire répond à un besoin concret : analyser un malware pour écrire une signature, auditer un logiciel propriétaire pour trouver une faille, comprendre un format de fichier non documenté, ou vérifier qu'un compilateur n'a pas trahi votre intention.

Le point de départ, c'est que **le compilateur détruit de l'information**. Les noms de variables, les commentaires, les types, la structure des boucles : tout cela disparaît. Il ne reste que des instructions machine et des adresses. Reverser, c'est **remonter le flot** : reconstruire du sens à partir de ce qui a survécu à la compilation.

Les quatre ouvrages de référence structurent ce domaine :

- **Eldad Eilam, _Reversing_** — les fondations : assembleur, OS, compilation.
- **Chris Eagle, _The IDA Pro Book_** — l'outil de désassemblage de référence.
- **Sikorski & Honig, _Practical Malware Analysis_** — l'analyse de code hostile.
- **Dennis Andriesse, _Practical Binary Analysis_** — la théorie moderne (analyse de flot, instrumentation).

La méthode générale alterne deux regards : **statique** (lire le binaire au repos) et **dynamique** (l'exécuter et l'observer). On zoome et dézoome en permanence entre la vue d'ensemble (graphe de fonctions) et l'instruction isolée.
---SECTION---
HEADING: Le CPU x86/x64 : registres et EFLAGS
BODY:
Tout raisonnement en reversing repose sur le **modèle mémoire + registres** du processeur. Les registres sont des cases ultra-rapides internes au CPU sur lesquelles portent la plupart des instructions.

En **x86 (32 bits)**, les registres généraux font 32 bits et portent un `E` (Extended) : `EAX, EBX, ECX, EDX, ESI, EDI, EBP, ESP`. En **x64**, ils passent à 64 bits avec un `R` : `RAX...RSP`, plus huit nouveaux, `R8` à `R15`. On peut adresser des sous-parties : `RAX` (64) ⊃ `EAX` (32) ⊃ `AX` (16) ⊃ `AL` (8 bas) / `AH` (8 hauts).

Certains registres ont un rôle conventionnel qu'il faut connaître par cœur :

- `ESP`/`RSP` — **Stack Pointer**, sommet de la pile.
- `EBP`/`RBP` — **Base Pointer**, ancre du stack frame courant.
- `EIP`/`RIP` — **Instruction Pointer**, adresse de la prochaine instruction (non modifiable directement).
- `ECX` sert souvent de compteur, `EAX` porte la **valeur de retour** d'une fonction.

Le registre `EFLAGS` (ou `RFLAGS`) est un registre de bits d'état positionnés par les instructions arithmétiques et logiques. Les flags décisifs :

- **ZF** (Zero) : le résultat vaut zéro.
- **CF** (Carry) : retenue / emprunt (comparaisons non signées).
- **SF** (Sign) : bit de signe du résultat.
- **OF** (Overflow) : débordement signé.

C'est `EFLAGS` qui pilote les sauts conditionnels : `CMP eax, ebx` fait une soustraction fictive et positionne les flags, puis `JZ`/`JNZ`/`JG`/`JB` saute selon ces flags. **Comprendre les flags, c'est comprendre toutes les branches conditionnelles.**
---SECTION---
HEADING: La pile et le stack frame
BODY:
La **pile** (stack) est une zone mémoire LIFO qui **croît vers les adresses basses**. `PUSH` décrémente `ESP` puis y écrit ; `POP` lit puis incrémente `ESP`. Elle sert à trois choses : sauvegarder l'adresse de retour lors d'un `CALL`, passer des arguments (en 32 bits surtout), et loger les variables locales.

Un **stack frame** est le bloc de pile propre à un appel de fonction. `EBP` sert d'ancre stable : pendant que `ESP` bouge (push/pop temporaires), `EBP` reste fixe, ce qui permet d'adresser proprement arguments et locales par déplacement constant.

Schéma classique d'un frame en x86 (adresses hautes en haut) :

```
[EBP+8]   premier argument
[EBP+4]   adresse de retour (poussée par CALL)
[EBP]     ancien EBP sauvegardé   <- EBP pointe ici
[EBP-4]   variable locale 1
[EBP-8]   variable locale 2       <- ESP pointe vers le bas du frame
```

Retenez la règle mnémotechnique : **au-dessus de `EBP` (offsets positifs) → arguments et retour ; en dessous (offsets négatifs) → variables locales.** Reconnaître ce motif dans le désassemblage vous dit instantanément si `[ebp-0x10]` est une locale ou `[ebp+0xC]` un argument.
---SECTION---
HEADING: Prologue et épilogue de fonction
BODY:
Le compilateur encadre chaque fonction (hors optimisations) par deux séquences stéréotypées qui **mettent en place puis démontent le stack frame**. Les reconnaître, c'est repérer les frontières de fonctions même sans symboles.

Le **prologue** classique en x86 :

```asm
push ebp            ; sauve le frame de l'appelant
mov  ebp, esp       ; EBP <- sommet actuel : nouvelle ancre
sub  esp, 0x20      ; réserve 0x20 octets pour les locales
```

L'**épilogue** défait tout, dans l'ordre inverse :

```asm
mov  esp, ebp       ; libère les locales (ou 'leave')
pop  ebp            ; restaure le frame de l'appelant
ret                 ; dépile l'adresse de retour -> EIP
```

L'instruction `leave` condense `mov esp, ebp` + `pop ebp`. En x64 optimisé, le compilateur se passe souvent d'`EBP` (frame pointer omission) et adresse tout par rapport à `RSP` : les prologues se réduisent alors à un `sub rsp, N`. Savoir cela évite de chercher un `push rbp` qui n'existe pas.
---SECTION---
HEADING: Conventions d'appel : le contrat des fonctions
BODY:
Une **convention d'appel** définit *qui* met les arguments *où*, *qui* nettoie la pile, et *quels registres* sont préservés. Sans elle, appelant et appelé ne pourraient pas coopérer. C'est le contrat que vous devez identifier pour lire correctement un appel.

**Sur x86 (32 bits)** — arguments principalement sur la pile :

- **cdecl** (C par défaut) : arguments empilés **de droite à gauche**, **l'appelant** nettoie la pile (`add esp, N` après le `call`). Permet les fonctions variadiques (`printf`).
- **stdcall** (API Win32) : mêmes arguments empilés, mais **l'appelé** nettoie via `ret N`. Vous verrez `ret 0x8` en fin de fonction : signe distinctif.
- **fastcall** : les deux premiers arguments dans `ECX` et `EDX`, le reste sur la pile.

**Sur x64**, tout passe d'abord par registres :

- **System V AMD64** (Linux/macOS) : entiers dans `RDI, RSI, RDX, RCX, R8, R9`.
- **Microsoft x64** (Windows) : entiers dans `RCX, RDX, R8, R9`, et l'appelant réserve **32 octets de « shadow space »** sur la pile avant le `call`.

Enfin, la distinction **volatile / non-volatile** : certains registres peuvent être écrasés par l'appelé (volatile, ex. `RAX`, `RCX`), d'autres doivent être restaurés s'ils sont utilisés (non-volatile, ex. `RBX`, `RSI`, `RDI` en System V). Repérer un `push rbx` en prologue signale un registre non-volatile sauvegardé.
---SECTION---
HEADING: Le format PE : anatomie d'un binaire Windows
BODY:
Un exécutable n'est pas du code brut : c'est un **conteneur structuré** que le chargeur (loader) de l'OS sait interpréter. Sous Windows, c'est le **PE** (Portable Executable).

Structure en couches :

- Un vieux **en-tête DOS** (`MZ`) avec un « DOS stub », suivi d'un pointeur (`e_lfanew`) vers l'en-tête PE.
- La signature **`PE\0\0`**, puis le **File Header** (machine, nombre de sections) et l'**Optional Header** (qui n'a d'optionnel que le nom : il contient l'**entry point**, l'**ImageBase**, et les Data Directories).
- Les **sections** : `.text` (code), `.data` (données initialisées), `.rdata` (constantes, imports), `.rsrc` (ressources), `.reloc` (relocations).

Deux notions d'adressage à ne jamais confondre :

- **RVA** (Relative Virtual Address) : offset **par rapport à l'ImageBase** une fois le fichier chargé en mémoire.
- **Offset fichier** : position dans le fichier sur disque.

Le mapping n'est pas identique : chaque section a un `VirtualAddress` (en mémoire) et un `PointerToRawData` (sur disque), souvent alignés différemment. **Convertir un RVA en offset fichier** (et inversement) est une opération que vous ferez sans cesse ; c'est la source d'erreur numéro un des débutants.
---SECTION---
HEADING: IAT et EAT : le lien vers les bibliothèques
BODY:
Un programme n'embarque pas le code de `MessageBoxA` : il l'**importe** depuis `user32.dll`. Le PE décrit ces liens via deux tables symétriques.

L'**IAT** (Import Address Table) est le point clé. À la compilation, le binaire ne connaît pas l'adresse réelle des fonctions des DLL (elles dépendent du chargement). Il réserve donc un **tableau de pointeurs** que le loader **remplit au chargement** avec les adresses résolues. Un appel à une fonction importée passe par une indirection :

```asm
call dword ptr [0x00402040]   ; 0x00402040 = entrée IAT de MessageBoxA
```

Pour l'analyste, l'IAT est **une mine d'or** : elle révèle les capacités du programme. Un malware important `CreateRemoteThread`, `WriteProcessMemory` et `VirtualAllocEx` annonce clairement de l'injection de code — avant même de lire une ligne d'assembleur.

L'**EAT** (Export Address Table) est le miroir : c'est ce qu'une DLL **expose** aux autres (nom → RVA de la fonction). Les malwares « désidentifient » parfois leurs imports (les résolvant dynamiquement via `GetProcAddress`) précisément pour vider l'IAT et **cacher leurs intentions**. Une IAT anormalement pauvre est en soi un signal.
---SECTION---
HEADING: Le format ELF : PLT, GOT et lazy binding
BODY:
Sous Linux, le format est l'**ELF** (Executable and Linkable Format). Le problème du lien dynamique y est résolu par un **duo d'indirections** : la **GOT** et la **PLT**.

- La **GOT** (Global Offset Table) est la table de pointeurs, équivalent conceptuel de l'IAT : elle contient les adresses résolues des symboles externes.
- La **PLT** (Procedure Linkage Table) est un ensemble de petits **stubs de code** par lesquels transitent les appels externes.

L'intérêt majeur est le **lazy binding** (résolution paresseuse) : résoudre *tous* les symboles au démarrage serait coûteux, alors que beaucoup ne sont jamais appelés. Le mécanisme :

1. Le premier appel à `printf` saute dans `printf@plt`.
2. Le stub saute à l'adresse contenue dans l'entrée GOT correspondante, qui pointe (au début) **de retour dans la PLT**, vers le résolveur du linker dynamique.
3. Le résolveur trouve la vraie adresse de `printf`, **la réécrit dans la GOT**.
4. Tous les appels suivants sautent directement au bon endroit : le coût n'est payé qu'une fois.

Conséquence pour le reverser : la GOT est une cible d'attaque et d'observation. En analyse dynamique, un breakpoint après résolution montre l'adresse réelle ; en statique, la PLT donne le nom symbolique lisible de l'appel.
---SECTION---
HEADING: Désassemblage : linéaire contre récursif
BODY:
Désassembler, c'est traduire des octets en instructions. Le problème fondamental sur x86 : les instructions sont **de longueur variable** (1 à 15 octets) et **code et données sont mêlés** dans les mêmes sections. Décider *où commence* une instruction est un vrai problème.

Deux stratégies opposées (Andriesse en fait un développement central) :

**Désassemblage linéaire (linear sweep).** On décode octet après octet, du début à la fin de la section `.text`. Simple et exhaustif, c'est l'approche d'`objdump`. Faille : si des **données** (une table de sauts, du padding) sont incrustées dans le code, le décodeur les interprète comme des instructions et **se désynchronise** — les instructions suivantes deviennent du charabia jusqu'à un éventuel resynchronisation fortuite.

**Désassemblage récursif (recursive descent/traversal).** On **suit le flot de contrôle** : on décode une instruction, et à chaque saut/appel on met les cibles en file d'attente. C'est l'approche d'IDA Pro et de Ghidra. Avantage : on ne désassemble que ce qui est réellement atteignable comme code, on évite les données. Faille : les **cibles calculées dynamiquement** (`jmp eax`, tables de `switch`) sont indécidables statiquement — du code réel peut rester non découvert.

Aucune méthode n'est parfaite : c'est le **théorème pratique** du désassemblage. Les bons outils combinent les deux et ajoutent des heuristiques.
---SECTION---
HEADING: Décompilation et P-code de Ghidra
BODY:
La **décompilation** va un cran plus loin que le désassemblage : elle reconstruit une **pseudo-source de type C** à partir de l'assembleur. Elle regroupe les instructions en expressions, reconnaît les boucles (`while`, `for`), les `if/else`, et remplace les offsets de pile par des variables nommées `local_8`, `param_1`.

Le mécanisme repose sur une **représentation intermédiaire** (IR). Ghidra utilise le **P-code** : chaque instruction machine (x86, ARM, MIPS…) est traduite en une poignée de micro-opérations P-code élémentaires et *indépendantes de l'architecture* (`COPY`, `LOAD`, `STORE`, `INT_ADD`, `CBRANCH`…).

L'intérêt est double :

- **Universalité** : l'analyse de flot de données, la propagation de constantes, l'élimination de code mort s'écrivent **une seule fois** sur le P-code, puis s'appliquent à *toutes* les architectures. C'est ce qui permet à Ghidra de décompiler l'ARM aussi bien que le x86.
- **Simplification** : le décompilateur travaille sur cette forme normalisée pour remonter progressivement vers le C.

Attention : le pseudo-C est une **reconstruction faillible**, pas la vérité. Types approximés, conventions parfois mal devinées, artefacts d'optimisation : le décompilateur **oriente** votre lecture, il ne la remplace pas. Recouper avec le désassemblage reste indispensable sur les points sensibles.
---SECTION---
HEADING: Analyse statique contre analyse dynamique
BODY:
Ce sont les **deux modes fondamentaux**, complémentaires. Les maîtriser, c'est savoir quel outil sortir face à un problème donné.

**Analyse statique** — examiner le binaire *sans l'exécuter* : désassemblage, décompilation, lecture des chaînes de caractères, table des imports, entropie des sections.

- *Avantages* : sûr (le code ne s'exécute jamais), exhaustif (on voit *tous* les chemins, y compris les branches jamais prises), reproductible.
- *Limites* : le code chiffré/packé reste illisible ; les valeurs calculées à l'exécution (adresses, clés) sont inconnues.

**Analyse dynamique** — *exécuter* le binaire sous contrôle : débogueur, sandbox, moniteur d'API, trace réseau.

- *Avantages* : le code se déchiffre lui-même en mémoire, on observe le comportement réel, les valeurs concrètes apparaissent.
- *Limites* : **dangereux** (malware qui s'exécute → environnement isolé obligatoire : VM, réseau simulé) ; on ne voit **qu'un seul chemin** par exécution ; le programme peut détecter l'analyse et modifier son comportement.

La pratique réelle **tricote les deux** : la statique cartographie (« où est la routine de déchiffrement ? »), la dynamique confirme et extrait (« quelle clé ? quel payload en mémoire ? »). Sikorski & Honig en font la colonne vertébrale de leur méthode : d'abord la statique de base, puis la dynamique de base, puis les analyses avancées.
---SECTION---
HEADING: Débogage : breakpoints logiciels et matériels
BODY:
Le débogueur est l'outil central de l'analyse dynamique. Deux mécanismes de **point d'arrêt** coexistent, aux propriétés très différentes — savoir lequel est utilisé explique beaucoup de comportements.

**Breakpoint logiciel (0xCC).** Le débogueur **remplace l'octet** à l'adresse cible par l'opcode `0xCC` (`INT 3`). À l'exécution, le CPU lève une exception de breakpoint, le débogueur reprend la main, restaure l'octet original, et affiche l'état. Coût nul, nombre illimité — mais **il modifie le code en mémoire**. Un programme qui lit son propre code (checksum) peut donc **détecter** le `0xCC` : c'est un vecteur anti-debug classique.

**Breakpoint matériel (registres DR).** Le CPU x86 possède des registres de débogage `DR0`–`DR3` où l'on place jusqu'à **4 adresses** ; `DR7` configure leur déclenchement (exécution, lecture, écriture). Le CPU s'arrête sans toucher au code — idéal pour poser un **watchpoint** sur un accès mémoire (« arrête-toi quand cette variable est *lue* »). Limite dure : **4 slots seulement**.

**Single-step et Trap Flag.** Le bit **TF** d'`EFLAGS` déclenche une exception `INT 1` **après chaque instruction**. Le débogueur l'utilise pour l'exécution pas-à-pas. Réciproquement, un programme peut positionner `TF` lui-même et surveiller si le déroulement est perturbé : encore une technique anti-debug.
---SECTION---
HEADING: Techniques anti-debug
BODY:
Le code hostile (et le code protégé) cherche activement à **détecter le débogueur** pour bifurquer vers un comportement inoffensif ou planter. Les reconnaître permet de les **neutraliser** (patcher le saut, forcer le flag).

Techniques fondées sur les **structures Windows** :

- **`PEB.BeingDebugged`** : un octet du Process Environment Block (accessible sans appel système via `fs:[0x30]` en x86) vaut 1 sous débogueur. C'est ce que teste `IsDebuggerPresent`. Le check le plus courant.
- **`NtGlobalFlag`** : un champ du PEB qui prend certaines valeurs (heap flags `0x70`) quand le processus est lancé *depuis* un débogueur.
- **Heap flags** (`ForceFlags`) : le tas porte des marqueurs de débogage similaires.

Techniques fondées sur le **timing** :

- **`RDTSC`** : lit le compteur de cycles du CPU. On le lit deux fois autour d'un bloc ; si l'écart est énorme, c'est qu'un humain a fait du pas-à-pas ou qu'un breakpoint a suspendu l'exécution → débogueur détecté.

Techniques fondées sur les **exceptions** :

- **SEH / gestion d'exception** : le programme provoque volontairement une exception. En exécution normale, *son* gestionnaire la traite ; sous débogueur mal configuré, c'est le débogueur qui l'intercepte, révélant sa présence.
- **`INT 2D`** : instruction qui se comporte différemment selon qu'un débogueur est attaché, exploitée comme détecteur.

Contre-mesure générale : des plugins (type ScyllaHide) **falsifient** ces indicateurs pour rendre le débogueur transparent.
---SECTION---
HEADING: Anti-VM et détection d'environnement d'analyse
BODY:
Puisque l'analyse dynamique se fait presque toujours en **machine virtuelle**, le malware cherche à **détecter la VM** : s'il se croit observé, il reste dormant, faussant votre analyse.

Les indices exploités :

- **Artefacts matériels** : adresses MAC réservées aux hyperviseurs (préfixes VMware, VirtualBox), noms de périphériques (`VBOX`, `VMware` dans les descripteurs de disque), pilotes et services invités (`vmtoolsd`, `VBoxService`).
- **Clés de registre et fichiers** signatures de l'hyperviseur.
- **Instruction `CPUID`** : avec le bit hyperviseur positionné (leaf `0x1`, bit 31 d'ECX), le CPU révèle qu'il tourne sous un hyperviseur ; la leaf `0x40000000` donne même le nom du fournisseur (`VMwareVMware`, `Microsoft Hv`).
- **Instructions « red pill »** historiques : `SIDT`/`SGDT` (lire l'adresse des tables IDT/GDT) donnaient jadis des valeurs caractéristiques sous VM.
- **Faible empreinte** : peu de RAM, un seul CPU, pas d'activité utilisateur, disque minuscule — un environnement « trop propre » trahit un bac à sable.

Contre-mesure : **durcir la VM** (masquer les artefacts, ajouter du bruit réaliste) ou, pour le doute, comparer le comportement sur métal nu.
---SECTION---
HEADING: Packers, UPX et OEP
BODY:
Un **packer** compresse et/ou chiffre l'exécutable original, et le remplace par un petit **stub** qui, au lancement, **décompresse le vrai code en mémoire** puis lui saute dedans. Objectifs : réduire la taille, mais surtout **contrer l'analyse statique** — sur disque, il n'y a plus de code lisible, l'IAT est vide, les chaînes ont disparu, l'entropie des sections est élevée (signe révélateur).

Le concept central est l'**OEP** (Original Entry Point) : l'adresse du **vrai** point d'entrée du programme d'origine, celle vers laquelle le stub saute une fois le déballage terminé. **Tout le déballage manuel consiste à trouver l'OEP**, puis à faire un *dump* de la mémoire à ce moment-là pour reconstruire un binaire analysable.

**UPX** est le packer le plus courant, non malveillant à l'origine (compression). Il est **réversible** : `upx -d` déballe ce qu'`upx` a emballé, tant que l'en-tête n'a pas été trafiqué (les malwares modifient souvent les marqueurs UPX pour casser le `-d`).

Méthode générique de déballage dynamique :

1. Lancer sous débogueur ; le stub s'exécute et déballe.
2. Trouver le saut vers l'OEP (souvent un `jmp` lointain, un « tail jump » qui quitte la section du stub).
3. Poser un breakpoint après le déballage (heuristique : breakpoint mémoire sur la section de code qui va être écrite puis exécutée).
4. Au niveau de l'OEP, *dumper* le processus et **reconstruire l'IAT** (outils type Scylla).
---SECTION---
HEADING: Obfuscation et anti-désassemblage
BODY:
Au-delà du packing, l'**obfuscation** rend le code *présent et lisible* mais **volontairement pénible** à analyser. Une sous-catégorie vise spécifiquement à **tromper le désassembleur**.

Techniques **anti-désassemblage** (Sikorski & Honig y consacrent un chapitre) — elles exploitent précisément les failles vues plus haut :

- **Octets indésirables / saut sur un octet fictif.** On insère un `jmp` qui saute *au milieu* d'une instruction bidon. Le désassembleur linéaire décode l'octet parasite comme une instruction et se désynchronise ; le CPU, lui, suit le saut et ignore l'octet. Motif classique : `EB FF C0 48` — un saut par-dessus le `FF` qui a piégé le décodeur.
- **Sauts conditionnels toujours pris** : `xor eax, eax` puis `jz cible` — le `jz` est *toujours* vrai (ZF forcé) mais le désassembleur, incapable d'évaluer, désassemble aussi la branche « fausse » (qui contient du leurre).
- **Appels qui ne reviennent pas** : `call` suivi d'un `pop` pour lire l'adresse de retour (utilisé pour la position-independent code), ou pile trafiquée pour détourner le `ret`.

Techniques d'obfuscation **logique** : aplatissement de flot de contrôle (control-flow flattening, un grand `switch` qui masque la structure), insertion d'opérations mortes, substitution d'instructions, machines virtuelles maison (le code réel devient du bytecode interprété par un moteur custom — le plus coûteux à casser).
---SECTION---
HEADING: Injection de code et hooking
BODY:
Faire exécuter *son* code dans le contexte d'un *autre* processus est au cœur du malware (furtivité, contournement de pare-feu, vol de données) et du reversing (instrumentation). Deux familles : l'injection et le hooking.

**Injection.** On écrit du code/DLL dans un processus cible et on l'y fait exécuter :

- **DLL injection classique** : `OpenProcess` → `VirtualAllocEx` (allouer chez la cible) → `WriteProcessMemory` (écrire le chemin de la DLL) → `CreateRemoteThread` pointant sur `LoadLibrary`. Cette signature d'API dans l'IAT est un drapeau rouge immédiat.
- **Process hollowing** : on crée un processus légitime **suspendu** (`CreateProcess(CREATE_SUSPENDED)`), on **vide** son image mémoire (`NtUnmapViewOfSection`), on y écrit un binaire malveillant, on réajuste le contexte (`SetThreadContext` pour repositionner l'entry point) et on **reprend** le thread. Le malware s'exécute sous l'identité d'un processus de confiance (`svchost.exe`).

**Hooking.** Détourner un appel de fonction vers son propre code :

- **IAT hooking** : réécrire l'entrée IAT d'une API pour qu'elle pointe vers sa fonction. Discret, mais ne touche que les appels passant par l'IAT.
- **Inline hooking** : écraser les **premiers octets** de la fonction cible par un `jmp` vers son handler (qui, après traitement, exécute les octets sauvegardés et rebranche). Plus universel, c'est la base des moniteurs d'API et de nombreux rootkits.
---SECTION---
HEADING: Mitigations d'exploitation : NX, ASLR, canari, RELRO
BODY:
Le reverser rencontre constamment les **protections anti-exploitation** : soit pour évaluer la surface d'attaque d'un binaire, soit pour comprendre pourquoi un exploit emprunte tel détour. Chacune répond à une classe d'attaque.

- **NX / DEP** (No-eXecute / Data Execution Prevention) : marque la pile et le tas comme **non exécutables**. Un shellcode injecté sur la pile ne peut plus s'exécuter. C'est précisément ce qui a rendu **ROP** nécessaire (section suivante).
- **ASLR** (Address Space Layout Randomization) : **randomise les adresses de base** des modules, de la pile et du tas à chaque exécution. L'attaquant ne peut plus coder d'adresses en dur ; il lui faut une **fuite d'information** (leak) pour retrouver une base. Sous Windows, une DLL doit être compilée `/DYNAMICBASE` pour participer.
- **Stack canary** (canari) : le compilateur place une **valeur secrète** entre les variables locales et l'adresse de retour, vérifiée à l'épilogue. Un débordement de pile qui écrase le retour écrase aussi le canari → détection et abandon (`__stack_chk_fail`). Contre-mesure attaquant : fuiter ou deviner le canari.
- **RELRO** (Relocation Read-Only, ELF) : rend la GOT **en lecture seule** après résolution. En *full RELRO*, le lazy binding est désactivé (tout résolu au démarrage) et la GOT devient non modifiable, fermant l'attaque classique de **réécriture d'entrée GOT**.

Ces protections se **combinent** : un exploit moderne doit généralement vaincre ASLR (par un leak), NX (par ROP) et le canari (par un leak) simultanément.
---SECTION---
HEADING: ROP : réutiliser le code existant
BODY:
Le **Return-Oriented Programming** est la réponse des attaquants à **NX/DEP**. Puisqu'on ne peut plus exécuter de *nouveau* code (shellcode) sur la pile, on **réutilise des morceaux du code déjà présent** et exécutable (le binaire, la libc).

Le principe repose sur les **gadgets** : de courtes séquences d'instructions existantes se terminant par un `ret`. Par exemple :

```asm
pop rdi        ; charge une valeur (dépilée) dans RDI
ret            ; passe au gadget suivant
```

Le `ret` est la clé : il dépile une adresse et y saute. En **empilant une suite d'adresses de gadgets** (une « ROP chain »), l'attaquant enchaîne ces bouts de code comme un programme. Chaque `ret` « avance » dans la chaîne. Avec assez de gadgets, on est **Turing-complet** — en pratique, il suffit d'appeler `mprotect`/`VirtualProtect` pour rendre une zone exécutable, puis y sauter (contournant NX), ou d'appeler directement `system("/bin/sh")`.

Pour le reverser, comprendre ROP sert à **lire un exploit** (reconnaître une chaîne d'adresses sur la pile comme des gadgets), et à **auditer** un binaire (chercher les gadgets utiles avec des outils type ROPgadget). Variantes : **JOP** (Jump-Oriented, via `jmp`), et le détournement de `ret` que **CFI** et **shadow stacks** tentent de bloquer.
---SECTION---
HEADING: FLIRT et l'identification de code de bibliothèque
BODY:
Problème concret : un binaire lié **statiquement** embarque des milliers de fonctions de bibliothèque (la CRT, la STL, `strcpy`, `malloc`…). Sans aide, l'analyste perdrait des heures à reverser du code standard *déjà connu*, mêlé au *vrai* code de l'auteur.

**FLIRT** (Fast Library Identification and Recognition Technology), la technologie d'IDA Pro (détaillée par Chris Eagle), résout cela par **reconnaissance de signatures**. Le principe :

- Chaque fonction de bibliothèque a un **motif d'octets** caractéristique. FLIRT en extrait une **signature** (les premiers octets, en masquant les parties variables comme les adresses relogées).
- IDA compare le binaire à des **bases de signatures** (`.sig`) pré-générées à partir des `.lib` des compilateurs courants.
- Les fonctions reconnues sont **automatiquement nommées** (`_strcpy`, `_printf`…), colorées différemment, et **écartées** de l'analyse manuelle.

Le gain est double : on **élimine le bruit** (concentrer l'effort sur le code non standard) et on **retrouve des types** (les prototypes connus des fonctions de bibliothèque renseignent les arguments). On peut aussi **générer ses propres signatures** (outil `sigmake`) pour reconnaître une bibliothèque statique spécifique retrouvée dans plusieurs échantillons — précieux en analyse de familles de malwares. L'équivalent open source existe (par exemple les signatures de fonctions de Ghidra).
===END===
