# Windows internals & platform security — le parcours Alex Ionescu

Comprendre comment Windows 10/11 s'est **réarchitecturé** autour de la sécurité : une frontière de confiance placée **au-dessus** du noyau, des secrets hors de portée d'un rootkit, un firmware qui doit se prouver avant l'OS. Ce chapitre est un **parcours de lecture/visionnage** — le fil rouge des conférences d'Alex Ionescu (@aionescu) et coauteurs — doublé des exercices du sujet **Windows internals 🪟**.

> Ces travaux appartiennent à leurs auteurs. Ce chapitre en donne l'intuition et la carte ; les liens renvoient aux talks originaux. À visionner dans l'ordre pour construire le tableau d'ensemble.

---

## Pourquoi ce sujet

Pendant des décennies, un principe implicite gouvernait presque tous les systèmes : **compromettre le noyau, c'est tout obtenir**. Administrateur = noyau = accès à l'intégralité de la mémoire, des secrets, du code. Il n'existait aucune frontière de confiance *à l'intérieur* de l'OS.

Windows 10 casse ce modèle. À l'aide de l'hyperviseur, il crée un **monde sécurisé** (VTL1) plus privilégié que le noyau lui-même (VTL0). Un rootkit ring-0 ne franchit plus cette ligne. Autour de cette idée gravitent une dizaine de mécanismes — PPL, Code Integrity, WNF, KnownDlls, callbacks d'instrumentation, tables de pages, bootkits UEFI, WSL — que ce parcours relie.

---

## 1. La réécriture de l'architecture : VBS, VTL, Secure Kernel

**Battle of the SKM and IUM : How Windows 10 Rewrites OS Architecture** — Black Hat USA 2015 — <https://youtu.be/LqaWIn4y26E>

Le point de départ. La **Virtualization-Based Security (VBS)** introduit les **Virtual Trust Levels** : **VTL0** (le Windows « normal », noyau NT + user mode) et **VTL1** (le **Secure Kernel** et l'**Isolated User Mode**). L'hyperviseur arbitre la frontière.

Les idées à retenir :

- **VTL1 est plus privilégié que le noyau NT.** Un noyau VTL0 compromis ne peut pas lire la mémoire de VTL1.
- Le **Secure Kernel** reste **minimal** (moins de code = moins de bugs dans la TCB) et **délègue** au noyau normal tout ce qui n'est pas critique, via des **VTL calls** arbitrés par l'hyperviseur.
- Un **trustlet** (ex. `LsaIso.exe`) est un processus user-mode signé qui tourne en **IUM/VTL1**. C'est là que **Credential Guard** met les secrets d'authentification — hors de portée de mimikatz même en administrateur.

## 2. L'intégrité du code imposée par l'hyperviseur : HVCI

**OS Security Is Hard** — USENIX WOOT 2020 — <https://www.usenix.org/conference/woot20/presentation/ionescu>

Avec **HVCI (Hypervisor-enforced Code Integrity)**, c'est **VTL1** qui contrôle les **permissions des pages** de VTL0 : une page ne devient exécutable que si elle passe le Code Integrity. Conséquence directe : le noyau normal, même compromis, **ne peut plus s'accorder du RWX** — le classique « allouer une page RWX + shellcode » est mort. L'attaque **BYOVD** (charger un pilote signé vulnérable) donne encore une écriture noyau, mais plus l'exécution de code noyau arbitraire : elle est réduite aux primitives **data-only**.

Le talk porte un message plus large : beaucoup de failles sont **architecturales** (frontières de confiance, confused deputies, hypothèses fausses entre composants) et **échappent au fuzzing**, qui teste des entrées, pas des modèles de confiance.

## 3. Protéger les processus : PPL & Code Integrity

Le **Protected Process Light (PPL)** ajoute une hiérarchie **orthogonale aux ACL** : un **niveau de signataire** (WinTcb > Windows > Lsa > Antimalware…). Le noyau refuse à un processus — **même SYSTEM** — d'ouvrir un handle sensible sur un PPL de niveau **supérieur**. C'est ce qui protège `lsass.exe` en **RunAsPPL** et les moteurs antimalware.

Côté code, **KMCI** (pilotes) et **UMCI** (code user, via **WDAC/App Control**) définissent « quel code a le droit de s'exécuter ». Les contournements ne cassent pas la crypto : ils **réutilisent la confiance** d'un binaire déjà signé (LOLBins, side-loading).

## 4. La confiance implicite du chargeur : KnownDlls

**Unknown Known DLLs and other Code Integrity Trust Violations** (avec James Forshaw) — REcon 2018 — <https://recon.cx/2018/montreal/schedule/events/120.html>

Le répertoire objet **\\KnownDlls** fournit des sections **déjà mappées** des DLL système (kernel32, ntdll…), chargées **en priorité** et **sans re-vérification**. Le chargeur leur fait **confiance**. Subvertir cette confiance — ou la manière dont une DLL y échappe (redirections **.local**, **SxS**, ordre de recherche) — permet d'injecter du code dans des processus légitimes, parfois protégés. La leçon : le maillon faible n'est pas « signé vs non signé », c'est **à qui le système accorde sa confiance implicite**.

## 5. Instrumenter sans laisser de trace : Hooking Nirvana

**Hooking Nirvana : Stealthy Instrumentation Techniques for Windows 10** — REcon 2015 — <https://infocondb.org/con/recon/recon-2015/hooking-nirvana-stealthy-instrumentation-techniques-for-windows-10>

Les **instrumentation callbacks** (`PsSetProcessInstrumentationCallback`) font invoquer par le **noyau** une routine **user-mode** à **chaque retour** de syscall/exception vers le user mode. On instrumente tout le flot d'un processus depuis **un seul point**, **sans patcher** le code des API — donc **invisible** aux scans d'intégrité qui comparent le code en mémoire à l'image disque. Ils capturent même les **syscalls directs** qui contournent ntdll. Outil de télémétrie pour le défenseur, primitive furtive pour l'attaquant.

## 6. Le mécanisme caché : WNF

**The Windows Notification Facility** (avec Gabrielle Viala) — Black Hat USA 2018 — <https://youtu.be/MybmgE95weo>

La **WNF** est un bus **publish/subscribe d'états**, interne et longtemps **non documenté**, qui irrigue une immense partie de Windows. Chaque canal a un **state name** (souvent « well-known », codé en dur). On peut s'abonner à un état pour **déclencher du code** sur un événement, ou l'utiliser comme **canal de communication discret** — sans les artefacts habituellement surveillés (services, Run keys, tâches planifiées). À distinguer d'**ETW** (tracing d'événements) et d'**ALPC** (transport de messages).

## 7. Le nerf de l'exploitation noyau : les tables de pages

**Hacking Like in the Movies : Visualizing Page Tables for Local Exploitation** (avec Georg Wicherski et Alexandru Radocea) — Black Hat USA 2013 — <https://youtu.be/Of6DemoMLaA>

La **self-map** (entrée récursive du **PML4**) expose toutes les tables de pages à des **adresses virtuelles fixes et calculables**. Avec une primitive d'écriture noyau, modifier une **PTE** change l'**adresse physique** et les bits **R/W/X** d'une page : rendre une page exécutable, la remapper, s'octroyer un accès. C'est aussi le terrain où l'on contourne **SMEP** (pas d'exécution de pages user par le noyau → tue le ret2usr) et **SMAP** (pas d'accès aux pages user). Une primitive générique et « propre » — souvent l'étape finale d'un exploit noyau (là où HVCI, en déplaçant le contrôle en VTL1, rebat les cartes).

## 8. Sous l'OS : les bootkits UEFI

**Advancing the State of UEFI Bootkits** — OffensiveCon 2018 — <https://youtu.be/dpG97TBR3Ys>

Le firmware démarre en phases : **SEC → PEI → DXE → BDS → OS**. Un bootkit vise une insertion **précoce** (un **pilote DXE**) pour s'exécuter **avant l'OS** et ses protections. **Secure Boot** établit une **chaîne de confiance** par signatures (base **db**, révocations **dbx**) — mais tombe si une **clé** est compromise, la **dbx** obsolète, ou un **composant signé vulnérable**. Logé dans la **flash SPI**, un bootkit **survit** au formatage et au changement de disque : le niveau de persistance le plus élevé, éradicable seulement en reflashant le firmware.

## 9. Un OS étranger dans le noyau NT : WSL

**The Linux Kernel Hidden Inside Windows 10** — Black Hat USA 2016 — <https://youtu.be/36Ykla27FIo>

**WSL1** exécutait de vrais binaires **ELF** sans VM grâce aux **pico processes** : des processus « vides » dont le noyau NT **redirige tous les syscalls** vers un **pico provider** (`lxcore.sys`) qui **émule l'ABI Linux**. Élégant — le noyau NT fournit le minimum et délègue toute une « personnalité » d'OS — mais coûteux en **surface d'attaque** : chaque syscall Linux émulé est du nouveau code noyau traitant des entrées non fiables. (WSL2, lui, embarque un **vrai noyau Linux** dans une VM légère Hyper-V.)

## 10. La méthode : Reversing Without Reversing

**Reversing Without Reversing** — OffensiveCon 2019 — <https://youtu.be/2D9ExVc0G10>

La leçon transversale. Avant de désassembler à la main, on récolte l'information **déjà disponible** : **symboles PDB** publics (le serveur de symboles Microsoft rend `ntoskrnl` presque lisible), documentation, structures connues, et surtout le **patch diffing** — comparer un binaire **avant/après** un correctif révèle exactement le bug corrigé, donc un exploit **n-day** contre les systèmes non patchés. Le meilleur reverser est souvent celui qui **lit** ce que d'autres ont déjà exposé.

---

## Le tableau d'ensemble

Ces mécanismes ne sont pas isolés : ils dessinent une **défense en profondeur** où la confiance est **fragmentée**.

- **Où sont les secrets ?** En VTL1 (Credential Guard), hors du noyau normal.
- **Qui peut exécuter du code ?** Ce que valide le Code Integrity, avec HVCI qui l'impose depuis l'hyperviseur.
- **Qui peut toucher qui ?** La hiérarchie PPL, orthogonale aux droits classiques.
- **À qui fait-on confiance implicitement ?** Au chargeur (\\KnownDlls), au firmware signé (Secure Boot) — et c'est là que se logent les violations.
- **Comment tout cela casse ?** Rarement par la crypto ; presque toujours par une **frontière de confiance mal définie**, un **confused deputy**, une hypothèse fausse entre deux composants — exactement ce que le fuzzing ne voit pas.

Vus ensemble, ces talks racontent une même histoire : sécuriser une plateforme, ce n'est pas empiler des correctifs, c'est **repenser à qui l'on fait confiance, et pour quoi**.
