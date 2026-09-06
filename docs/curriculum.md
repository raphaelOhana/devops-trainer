# Curriculum — cartographie de `0xor0ne/awesome-list`

> Généré le 2026-09-06 depuis
> <https://github.com/0xor0ne/awesome-list> (README section « Misc » + les 5
> sous-listes `topics/*.md`). **Document de travail, hors bundle** : il ne part
> pas dans l'app, il sert à décider quoi écrire.

## Méthode

Le dépôt source est un **index de liens**, pas du contenu : 1 438 titres et
~1 300 URLs vers des blogs tiers. Il n'y a donc rien à ingérer — sa valeur est
comme plan de cours et bibliographie.

Ce qui a été retenu, et pourquoi :

| Source | Entrées | Retenu ? |
|---|---|---|
| README, sections 2011→2026 | ~1 250 | ❌ Writeups de CVE nominatives : périssable, hyper-spécialisé, ~5 000 mots à lire pour 1 question. |
| README, section « Misc » | ~80 | ✅ Seul bloc pérenne : cours, livres, tutos, cheatsheets. |
| `topics/exploitation.md` | 261 | ✅ Thématique et hiérarchisée (Heap, Kernel, Mitigations, Libcs, Practice). |
| `topics/linux_kernel.md` | 111 | ✅ Internals, fuzzing, rootkits, Rust. |
| `topics/wireless.md` | 251 | ⚠️ Retenu, pertinence à arbitrer (très spécialisé). |
| `topics/ot_security.md` | 70 | ⚠️ Majoritairement des annuaires de vendeurs — 6 entrées utiles seulement. |
| `topics/red-team-adversary-emulation.md` | 133 | ⚠️ Retenu mais hors-scope à mon avis (C2, évasion, persistence offensive). |

Après résolution des liens, déduplication par URL et retrait des annuaires de
vendeurs / conférences / podcasts (93 entrées écartées) : **691 entrées**
classées par nature et rattachées à un topic de l'app.

⚠️ **Licence** : le dépôt source n'a pas de fichier LICENSE, et les contenus
pointés appartiennent à des tiers. Ces liens servent de **sources** — on écrit
notre propre texte, et on attribue.

---

## Synthèse : où sont les trous

`Exos` = état actuel du catalogue de l'app. `Ressources` = entrées disponibles
ici. Un écart fort entre les deux = un lot à produire.

| Topic app | Exos | Ressources | dont cours/tutos | Verdict |
|---|---:|---:|---:|---|
| `memory-safety` — Sûreté mémoire / exploitation du tas | 89 | 91 | 33 | 🔴 **trou interne** : 36 exos, mais 6 sur le tas |
| `linux-kernel` — Noyau Linux | — | 181 | 39 | 🔴 **topic absent de l'app** |
| `exploit-dev` — Exploit dev / mitigations | 29 | 25 | 6 | 🟠 sous-couvert |
| `reversing` — Reverse engineering | 94 | 35 | 7 | 🟢 déjà couvert, apport d'appoint |
| `hardware` — Matériel, firmware, TEE | 70 | 66 | 6 | 🟢 déjà couvert, apport d'appoint |
| `networking` — Réseau & sans-fil | 13 | 199 | 9 | 🔴 **trou majeur** |
| `iot-edge` — IoT / OT / ICS | 5 | 18 | 3 | 🟠 sous-couvert |
| `cryptography` — Cryptographie | 44 | 6 | 3 | ⚪ apport marginal |
| `languages` — Langages & compilation | 45 | 11 | 0 | 🟢 déjà couvert, apport d'appoint |
| `testing` — Tests & qualité | 45 | 5 | 1 | ⚪ apport marginal |
| `appsec` — AppSec | 183 | 3 | 0 | ⚪ apport marginal |

Le catalogue compte **1674 exercices** au total. Les topics que cette
liste **ne nourrit pas** : `system-design` (101), `mcp` (91), `security` (89), `cloud-arch` (89), `performance` (81), `databases` (76), `algorithms` (75), `ai-llm` (75), `interview` (73), `secure-review` (67), `ai-engineering` (57), `monitoring` (49), `problem-solving` (31), `kubernetes` (17), `agent-security` (16), `linux` (13), `ci-cd` (10), `git` (10), `terraform` (9), `design-patterns` (8), `docker` (7), `architecture` (7), `frontend` (4), `backend` (2).

---

## Ressources par topic

Légende : 📘 cours/tuto · 🔗 référence · 🛠 outil · 🧪 writeup technique.
Les writeups sont plafonnés aux 12 plus exploitables par topic.

### `memory-safety` — Sûreté mémoire / exploitation du tas

Le lot existant est orienté **pile, entiers et CWE de base** : sur 36 exercices, **6 seulement touchent le tas**, et aucun ne descend dans l'allocateur (bins, tcache, consolidation). Or c'est là que la liste est la plus riche — et le domaine se transpose directement en `find-error` sur du C.

*89 exercices dans l'app · 91 ressources ici*

**📘 cours/tuto**

- [Heap Exploitation (dhavalkapil)](https://heap-exploitation.dhavalkapil.com) — guide for understanding the internals of 'heap memory.
- [Heap Exploitation (nightmare)](https://guyinatuxedo.github.io/25-heap/index.html) — heap tutorials (part of the Nightmare binary exploitation series)
- [how2heap](https://github.com/shellphish/how2heap) — epository for learning various heap exploitation techniques.
- [Writeups — Cueing up a calculator: an introduction to exploit development on Linux](https://github.blog/2023-12-06-cueing-up-a-calculator-an-introduction-to-exploit-development-on-linux/)
- [Glibc Heap Exploitation Basics — Part 1](https://blog.k3170makan.com/2018/11/glibc-heap-exploitation-basics.html)
- [Glibc Heap Exploitation Basics — Part 2](https://blog.k3170makan.com/2018/12/glibc-heap-exploitation-basics.html)
- [Glibc Heap Exploitation Basics — Part 3](https://blog.k3170makan.com/2019/03/glibc-heap-exploitation-basics.html)
- [Heap Exploitation Series by Azeria — Part 1: Understanding the Glibc Heap Implementation](https://azeria-labs.com/heap-exploitation-part-1-understanding-the-glibc-heap-implementation/)
- [Heap Exploitation Series by Azeria — Part 2: Understanding the Glibc Heap Implementation](https://azeria-labs.com/heap-exploitation-part-2-glibc-heap-free-bins/)
- [Heap Exploitation Series by Azeria — Case Study from an in-the-wild iOS 0-day](https://azeria-labs.com/heap-exploit-development-part-1/)
- [Heap Exploitation Series by Azeria — Heap Overflows and the iOS Kernel Heap](https://azeria-labs.com/heap-overflows-and-the-ios-kernel-heap/)
- [Heap Exploitation Series by Azeria — Grooming the iOS Kernel Heap](https://azeria-labs.com/grooming-the-ios-kernel-heap/)
- [Overview of Malloc](https://sourceware.org/glibc/wiki/MallocInternals) — (glibc documentation)
- [The toddler’s introduction to Heap Exploitation — Part 1](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-part-1-515b3621e0e8)
- [The toddler’s introduction to Heap Exploitation — Part 2](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-part-2-d1f325b74286)
- [The toddler’s introduction to Heap Exploitation — Part 3](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-overflows-part-3-d3d1aa042d1e)
- [The toddler’s introduction to Heap Exploitation — Part 4](https://infosecwriteups.com/use-after-free-13544be5a921)
- [The toddler’s introduction to Heap Exploitation — Part 4.1](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-fastbin-dup-to-stack-part-4-1-425592a2870b)
- [The toddler’s introduction to Heap Exploitation — Part 4.2](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-fastbin-dup-consolidate-part-4-2-ce6d68136aa8)
- [The toddler’s introduction to Heap Exploitation — Part 4.3](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-unsafe-unlink-part-4-3-75e00e1b0c68)
- [The toddler’s introduction to Heap Exploitation — Part 4.4](https://infosecwriteups.com/the-toddlers-introduction-to-heap-exploitation-house-of-spirit-part-4-4-252cd8928f84)
- [Understanding glibc malloc](https://sploitfun.wordpress.com/2015/02/10/understanding-glibc-malloc/)
- [Understanding the Heap - a beautiful mess](https://jackfromeast.site/2023-01/understand-the-heap-a-beautiful-mess.html)
- [x86 Exploitation 101: “House of Lore” – People and Traditions](https://gbmaster.wordpress.com/2015/07/16/x86-exploitation-101-house-of-lore-people-and-traditions/)
- [DirtyCred Remastered: how to turn an UAF into Privilege Escalation](https://exploiter.dev/blog/2022/CVE-2022-2602.html)
- [Linux SLUB Allocator Internals and Debugging — Part 1](https://blogs.oracle.com/linux/post/linux-slub-allocator-internals-and-debugging-1)
- [Linux SLUB Allocator Internals and Debugging — Part 2](https://blogs.oracle.com/linux/post/linux-slub-allocator-internals-and-debugging-2)
- [Linux SLUB Allocator Internals and Debugging — Part 3](https://blogs.oracle.com/linux/post/linux-slub-allocator-internals-and-debugging-3)
- [Linux SLUB Allocator Internals and Debugging — Part 4](https://blogs.oracle.com/linux/post/linux-slub-allocator-internals-and-debugging-4)
- [Documentation](https://android.googlesource.com/platform/bionic/+/refs/heads/main/docs/)
- [Documentation](https://www.gnu.org/software/libc/manual/)
- [Documentation](https://musl.libc.org/manual.html)
- [Documentation](https://uclibc-ng.org/docs/)

**🔗 référence**

- [Dynamic Allocator Misuse" (pwn.college)](https://pwn.college/software-exploitation/dynamic-allocator-misuse)
- [Writeups — Behind the Shield: Unmasking Scudo's Defenses](https://www.synacktiv.com/publications/behind-the-shield-unmasking-scudos-defenses)
- [Writeups — Diving deep into heap — Glibc fastbin consolidation](https://medium.com/@soh0ro0t/diving-deep-into-heap-glibc-fastbin-consolidation-4c1f38a70917)
- [Don't Be Silly - It's Only a Lightbulb](https://research.checkpoint.com/2020/dont-be-silly-its-only-a-lightbulb/)
- [Everything In It’s Right Place](https://medium.com/@kevin.massey1189/everything-in-its-right-place-20aacd17fe3f)
- [Exploring Android Heap Allocations in jemalloc 'New'](https://www.synacktiv.com/en/publications/exploring-android-heap-allocations-in-jemalloc-new)
- [Heap overflow using Malloc Maleficarum](https://sploitfun.wordpress.com/2015/03/04/heap-overflow-using-malloc-maleficarum/)
- [Heap overflow using unlink](https://sploitfun.wordpress.com/2015/02/26/heap-overflow-using-unlink/)
- [House of Corrosion](https://github.com/CptGibbon/House-of-Corrosion)
- [House of Husk - In Depth Explanation](https://maxwelldulin.com/BlogPost/House-of-Husk-In-Depth-Explanation)
- [House of Mind - Fastbin Variant Revived](https://maxwelldulin.com/BlogPost/House-of-Mind-Fastbin-Variant-Revived)
- [House of IO - Heap Reuse](https://maxwelldulin.com/BlogPost/House-of-IO-Heap-Reuse)
- [House of Io – Remastered](https://awaraucom.wordpress.com/2020/07/19/house-of-io-remastered/)
- [House of Muney - Leakless Heap Exploitation Technique](https://maxwelldulin.com/BlogPost/House-of-Muney-Heap-Exploitation)
- [munmap madness](http://tukan.farm/2016/07/27/munmap-madness/)
- [Off-By-One Vulnerability (Heap Based)](https://sploitfun.wordpress.com/2015/06/09/off-by-one-vulnerability-heap-based/)
- [Safe-Linking – Eliminatig a 20 Year-Old malloc() Exploit Primitive](https://research.checkpoint.com/2020/safe-linking-eliminating-a-20-year-old-malloc-exploit-primitive/)
- [The Malloc Maleficarum](https://seclists.org/bugtraq/2005/Oct/118?=ref=0x434b.dev)
- [Use-After-Free](https://sploitfun.wordpress.com/2015/06/16/use-after-free/)
- [Vudo malloc tricks](http://phrack.org/issues/57/8.html)
- [Your NAS is not your NAS !](https://devco.re/blog/2022/03/28/your-NAS-is-not-your-NAS-en/)
- [CVE-2022-2602: DirtyCred File Exploitation applied on an io_uring UAF](https://blog.hacktivesecurity.com/index.php/2022/12/21/cve-2022-2602-dirtycred-file-exploitation-applied-on-an-io_uring-uaf/)
- [How a simple Linux kernel memory corruption bug can lead to complete system compromise](https://googleprojectzero.blogspot.com/2021/10/how-simple-linux-kernel-memory.html)
- [Linux Kernel Exploitation — Heap techniques](https://santaclz.github.io/2024/01/20/Linux-Kernel-Exploitation-Heap-techniques.html)
- [Linux kernel heap feng shui in 2022](https://duasynt.com/blog/linux-kernel-heap-feng-shui-2022)
- [Linux kernel heap quarantine versus use-after-free exploits](https://a13xp0p0v.github.io/2020/11/30/slab-quarantine.html)
- [Linux Kernel universal heap spray](https://duasynt.com/blog/linux-kernel-heap-spray)
- [Reviving Exploits Against Cred Structs - Six Byte Cross Cache Overflow to Leakless Data-Oriented Kernel Pwnage](https://www.willsroot.io/2022/08/)
- [Bionic](https://android.googlesource.com/platform/bionic/)
- [glibc](https://sourceware.org/git/?p=glibc.git)
- [musl](https://git.musl-libc.org/cgit/musl)
- [uclibc-ng](https://cgit.uclibc-ng.org/cgi/cgit/uclibc-ng.git/)
- [Linux Weekly News](https://lwn.net) — site dedicated to producing the best coverage from within the Linux and free software development communities.
- [Libraries — GitHub](https://github.com/gnuradio/gnuradio) — the Free and Open Software Radio Ecosystem.
- [Packers — UPX](https://upx.github.io/) — free, portable, extendable, high-performance executable packer.

**🛠 outil**

- [Libraries — LiquidSDR](https://liquidsdr.org/) — free and open-source signal processing library for software-defined radios.

**🧪 writeup**

- [Exploiting Heap Allocators](https://tc.gts3.org/cs6265/2019/tut/tut09-02-advheap.html) — part of CS6265: Information Security Lab
- [Writeups — Analysis of Malloc Protections on Singly Linked Lists](https://maxwelldulin.com/BlogPost/Analysis-Malloc-Protections-on-Singly-Linked-Lists)
- [Writeups — Bypassing GLIBC 2.32’s Safe-Linking Without Leaks into Code Execution: The House of Rust](https://c4ebt.github.io/2021/01/22/House-of-Rust.html)
- [Writeups — CUCTF 2020 Dr. Xorisaurus Heap Writeup (glibc 2.32 UAF)](https://www.willsroot.io/2020/10/cuctf-2020-dr-xorisaurus-heap-writeup.html)
- [Diving deep into the heap — Part 1](https://www.tooboat.com/?p=556)
- [Diving deep into the heap — Part 2](https://www.tooboat.com/?p=629)
- [Exploiting a Remote Heap Overflow with a Custom TCP Stack](https://www.synacktiv.com/en/publications/exploiting-a-remote-heap-overflow-with-a-custom-tcp-stack.html)
- [Exploiting an Unbounded memcpy in Parallels Desktop](https://blog.ret2.io/2022/05/19/pwn2own-2021-parallels-desktop-exploit/)
- [Exploiting Sudo Heap Overflow On Debian 10](https://syst3mfailure.io/sudo-heap-overflow/)
- [The art of exploiting heap overflow — Part 1](https://medium.com/@c0ngwang/the-art-of-exploiting-heap-overflow-part-1-3bcf41e0d449)
- [The art of exploiting heap overflow — Part 2](https://medium.com/@c0ngwang/the-art-of-exploiting-heap-overflow-part-2-1bd24a5856d0)
- [The art of exploiting heap overflow — Part 3](https://medium.com/@c0ngwang/the-art-of-exploiting-heap-overflow-part-3-9890b01d56a2)
- *…et 10 autres writeups (voir `entries.json`)*


### `linux-kernel` — Noyau Linux

Topic inexistant dans l'app. Le gisement le plus gros de la liste. À ouvrir seulement si on assume un nouveau `Topic` dans types.ts.

*0 exercices dans l'app · 181 ressources ici*

**📘 cours/tuto**

- [Writeups — Beginner's first kernel CTF with CVE-2017-5123](https://sthbrx.github.io/blog/2023/08/08/beginners-first-kernel-ctf-with-cve-2017-5123/#:~:text=This%20is%20CVE%2D2017%2D5123,for%2C%20escaping%20the%20Chrome%20sandbox)
- [CVE-2021–20226 a reference counting bug which leads to local privilege escalation in io_uring](https://flattsecurity.medium.com/cve-2021-20226-a-reference-counting-bug-which-leads-to-local-privilege-escalation-in-io-uring-e946bd69177a)
- [corCTF 2021 ret2cds writeup: Escaping a Seccomp Sandbox via Class Data Sharing regions in OpenJDK](https://www.willsroot.io/2021/08/ret2cds-writeup-escaping-seccomp.html)
- [Introduction to kernel exploitation](https://kernemporium.github.io/kernel/intro/)
- [Monitoring Surveillance Vendors: A Deep Dive into In-the-Wild Android Full Chains in 2021](https://i.blackhat.com/USA-22/Wednesday/US-22-Jin-Monitoring-Surveillance-Vendors.pdf)
- [Learning Linux kernel exploitation (0x434b) — Part 1 - Laying the groundwork](https://0x434b.dev/dabbling-with-linux-kernel-exploitation-ctf-challenges-to-learn-the-ropes/)
- [Learning Linux kernel exploitation (0x434b) — Part 2 - CVE-2022-0847](https://0x434b.dev/learning-linux-kernel-exploitation-part-2-cve-2022-0847/)
- [Learning Linux Kernel Exploitation (lkmidas) — Part 1](https://lkmidas.github.io/posts/20210123-linux-kernel-pwn-part-1/)
- [Learning Linux Kernel Exploitation (lkmidas) — Part 2](https://lkmidas.github.io/posts/20210128-linux-kernel-pwn-part-2/)
- [Learning Linux Kernel Exploitation (lkmidas) — Part 3](https://lkmidas.github.io/posts/20210205-linux-kernel-pwn-part-3/)
- [build linux](https://github.com/MichielDerhaeg/build-linux) — short tutorial about building Linux based operating systems.
- [Linux rootkit series by Xcellerator — Introduction and Workflow](https://xcellerator.github.io/posts/linux_rootkits_01/)
- [Linux rootkit series by Xcellerator — Ftrace and Function Hooking](https://xcellerator.github.io/posts/linux_rootkits_02/)
- [Linux rootkit series by Xcellerator — A Backdoor to Root](https://xcellerator.github.io/posts/linux_rootkits_03/)
- [Linux rootkit series by Xcellerator — Backdooring PRNGs by Interfering with Char Devices](https://xcellerator.github.io/posts/linux_rootkits_04/)
- [Linux rootkit series by Xcellerator — Hiding Kernel Modules from Userspace](https://xcellerator.github.io/posts/linux_rootkits_05/)
- [Linux rootkit series by Xcellerator — Hiding Directories](https://xcellerator.github.io/posts/linux_rootkits_06/)
- [Linux rootkit series by Xcellerator — Hiding Processes](https://xcellerator.github.io/posts/linux_rootkits_07/)
- [Linux rootkit series by Xcellerator — Hiding Open Ports](https://xcellerator.github.io/posts/linux_rootkits_08/)
- [Linux rootkit series by Xcellerator — Hiding Logged In Users (Modifying File Contents Without Touching Disk)](https://xcellerator.github.io/posts/linux_rootkits_09/)
- [Linux rootkit series by Xcellerator — A Dive into the Kernel Component of Drovorub](https://xcellerator.github.io/posts/linux_rootkits_10/)
- [Linux rootkit series by Xcellerator — New Methods for Kernel 5.7+](https://xcellerator.github.io/posts/linux_rootkits_11/)
- [lowlevelprogramming-university](https://github.com/gurugio/lowlevelprogramming-university) — How to be low-level programmer
- [Bootlin courses](https://bootlin.com/training/) — Linux related courses from bootlin
- [Training material](https://github.com/bootlin/training-materials) — embedded Linux and kernel training materials.
- [Elixir](https://lore.kernel.org/kernel-hardening/) — Linux kernel source code cross reference.
- [kernel-security-learning](https://github.com/bsauce/kernel-security-learning) — Anything about kernel security.
- [Kernel documentation](https://www.kernel.org/doc/html/latest/index.html) — official linux kernel documentation.
- [Linux lab](https://github.com/tinyclub/linux-lab) — create a Docker and QEMU based Linux development Lab to easier the learning.
- [linux-insides](https://0xax.gitbooks.io/linux-insides/content/) — a book about linux kernel and its insides.
- [Linux Kernel Wiki](https://github.com/0voice/linux_kernel_wiki) — linux kernel wiki (in chinese)
- [Linux Kernel Workshop](https://lkw.readthedocs.io/en/latest/index.html) — learn linux kernel programming.
- [lkmpg](https://sysprog21.github.io/lkmpg/) — The Linux Kernel Module Programming Guide.
- [Awesome Linux Rootkits](https://github.com/milabs/awesome-linux-rootkits) — .
- [rootkitkev](https://github.com/SourceCodeDeleted/rootkitdev-linux/tree/master) — Rootkit Development tutorial series.
- [Getting started](https://docs.kernel.org/rust/quick-start.html) — official documentation for getting started with Rust and Linux kernel.
- [Resources — xcellerator](https://xcellerator.github.io/tags/rootkit/) — Linux kernel rootkit series
- [PEASS-ng](https://github.com/carlospolop/PEASS-ng) — Privilege Escalation Awesome Scripts SUITE.
- [Kernel Exploit Recipes Notebook](https://docs.google.com/document/d/1a9uUAISBzw3ur1aLQqKc5JOQLaJYiOP5pe_B4xCT1KA/edit#heading=h.6141m9mqkmgh)

**🔗 référence**

- [DirtyCow](https://github.com/dirtycow/dirtycow.github.io/wiki/VulnerabilityDetails) — race condition in the way the Linux kernel's memory subsystem handled the copy-on-write.
- [DirtyPipe](https://dirtypipe.cm4all.com/?ref=0x434b.dev) — pipes and splices for verwriting data in arbitrary read-only files.
- [Exploitable kernel structures](https://bsauce.github.io/2021/09/26/kernel-exploit-有用的结构体/)
- [Kernel exploitation](https://low-level.readthedocs.io/en/latest/security/kernel/) — collection of resources for kernel layer exploitation.
- [kasld](https://github.com/bcoles/kasld) — Kernel Address Space Layout Derandomization
- [linux-kernel-exploitation](https://github.com/xairy/linux-kernel-exploitation) — collection of links related to Linux kernel security and exploitation.
- [Writeups — A Journey To The Dawn](https://blog.kylebot.net/2022/10/16/CVE-2022-1786/)
- [Writeups — A Systematic Study of Elastic Objects in Kernel Exploitation](https://zplin.me/papers/ELOISE.pdf?ref=0x434b.dev)
- [CVE-2017-2636: Exploit the race condition in the n_hdlc Linux kernel driver](https://a13xp0p0v.github.io/2017/03/24/CVE-2017-2636.html)
- [CVE-2021-32606: CAN ISOTP local privilege escalation](https://github.com/nrb547/kernel-exploitation/blob/main/cve-2021-32606/cve-2021-32606.md)
- [CVE-2021-3609: CAN BCM local privilege escalation](https://github.com/nrb547/kernel-exploitation/blob/main/cve-2021-3609/cve-2021-3609.md)
- [CVE-2022-0185 - Winning a $31337 Bounty after Pwning Ubuntu and Escaping Google's KCTF Containers](https://www.willsroot.io/2022/01/)
- [CVE-2022-27666: Exploit esp6 modules in Linux kernel](https://etenal.me/archives/1825)
- [CVE-2022-29582 An io_uring vulnerability](https://ruia-ruia.github.io/2022/08/05/CVE-2022-29582-io-uring/)
- [Cautious! A New Exploitation Method! No Pipe but as Nasty as Dirty Pipe](https://i.blackhat.com/USA-22/Thursday/US-22-Lin-Cautious-A-New-Exploitation-Method.pdf)
- [Devils Are in the File Descriptors: It Is Time To Catch Them All](https://i.blackhat.com/USA-22/Wednesday/US-22-Wu-Devils-Are-in-the-File.pdf)
- [Dirty Pagetable: A Novel Exploitation Technique To Rule Linux Kernel](https://yanglingxi1993.github.io/dirty_pagetable/dirty_pagetable.html)
- [DirtyCred: Escalating Privilege in Linux Kernel](https://zplin.me/papers/DirtyCred.pdf)
- [EntryBleed: Breaking KASLR under KPTI with Prefetch (CVE-2022-4543)](https://www.willsroot.io/2022/12/entrybleed.html)
- [Escaping the Google kCTF Container with a Data-Only Exploit](https://h0mbre.github.io/kCTF_Data_Only_Exploit/#)
- [Exploring Linux's New Random Kmalloc Caches](https://sam4k.com/exploring-linux-random-kmalloc-caches/)
- [Function Granular KASLR](https://www.trustwave.com/en-us/resources/blogs/spiderlabs-blog/linux-kernel-rop-ropping-your-way-to-part-2/?ref=0x434b.dev)
- [Gaining kernel code execution on an MTE-enabled Pixel 8](https://github.blog/2024-03-18-gaining-kernel-code-execution-on-an-mte-enabled-pixel-8/)
- [How STACKLEAK improves Linux kernel security](https://a13xp0p0v.github.io/2018/11/04/stackleak.html)
- [Improving the exploit for CVE-2021-26708 in the Linux kernel to bypass LKRG](https://a13xp0p0v.github.io/2021/08/25/lkrg-bypass.html)
- [io_uring - new code, new bugs, and a new exploit technique](https://www.starlabs.sg/blog/2022/06-io_uring-new-code-new-bugs-and-a-new-exploit-technique/#unlinking-attack)
- [IPS](https://blog.kylebot.net/2022/01/10/VULNCON-2021-IPS/)
- [Linux Kernel Exploit (CVE-2022–32250) with mqueue](https://blog.theori.io/linux-kernel-exploit-cve-2022-32250-with-mqueue-a8468f32aab5)
- [Linux Kernel Exploit Development: 1day case study](https://blog.hacktivesecurity.com/index.php/2022/06/13/linux-kernel-exploit-development-1day-case-study/)
- [Linux Kernel Exploitation — Getting started & BOF](https://santaclz.github.io/2023/11/03/Linux-Kernel-Exploitation-Getting-started-and-BOF.html)
- [Linux Kernel Exploitation Technique: Overwriting modprobe_path](https://lkmidas.github.io/posts/20210223-linux-kernel-pwn-modprobe/)
- [Racing against the clock -- hitting a tiny kernel race window](https://googleprojectzero.blogspot.com/2022/03/racing-against-clock-hitting-tiny.html)
- [ret2dir: Rethinking Kernel Isolation](https://cs.brown.edu/~vpk/papers/ret2dir.sec14.pdf?ref=0x434b.dev)
- [slides](https://www.usenix.org/sites/default/files/conference/protected-files/sec14_slides_kemerlis.pdf)
- [The tale of a GSM Kernel LPE](https://www.jmpeax.dev/The-tale-of-a-GSM-Kernel-LPE.html)
- [USMA: Share Kernel Code with Me](https://i.blackhat.com/Asia-22/Thursday-Materials/AS-22-YongLiu-USMA-Share-Kernel-Code.pdf)
- [Wall Of Perdition: Utilizing msg_msg Objects For Arbitrary Read And Arbitrary Write In The Linux Kernel](https://syst3mfailure.io/wall-of-perdition/)
- [Writeups — A Kernel Hacker Meets Fuchsia OS](https://a13xp0p0v.github.io/2022/05/24/pwn-fuchsia.html)
- [Writeups — Android Kernel Exploitation](https://cloudfuzz.github.io/android-kernel-exploitation/)
- [Linux kernel — FGKASLR](https://lwn.net/Articles/824307/) — Function Granular Kernel Address Space Layout Randomization (fgkaslr)
- [Linux kernel — SLAB freelist randomization](https://lwn.net/Articles/685047/)
- [Linux Kernel Defence Map](https://github.com/a13xp0p0v/linux-kernel-defence-map) — relationships between vulnerability classes, exploitation techniques, bug detection mechanisms, and defence technologies.
- [crash](https://github.com/crash-utility/crash) — Linux kernel crash utility
- [like-gdb](https://github.com/0xricksanchez/like-dbg) — Fully dockerized Linux kernel debugging environment
- [GEF](https://github.com/bata24/gef) — fork of GEF with functionalities specific for the Linux kernel
- [How did I approach making linux LKM rootkit, “reveng_rtkit” ?](https://reveng007.github.io/blog/2022/03/08/reveng_rkit_detailed.html)
- [man pages](https://git.kernel.org/pub/scm/docs/man-pages/man-pages.git/) — manual pages for GNU/Linux
- [Writing a simple rootkit for linux](https://0x00sec.org/t/writing-a-simple-rootkit-for-linux/29034)
- [kernel-exploit-factory](https://github.com/bsauce/kernel-exploit-factory) — Linux kernel CVE exploit analysis report and relative debug environment.
- [Linux Kernel Exploit](https://github.com/SecWiki/linux-kernel-exploits) — links related to Linux kernel exploitation.
- [Syzbot](https://syzkaller.appspot.com/upstream) — continuously fuzzes main Linux kernel branches and automatically reports found bugs
- [Clang Built Linux](https://clangbuiltlinux.github.io/) — building the Linux kernel with Clang.
- [crash](https://crash-utility.github.io) — Linux kernel crash utility
- [TuxSuite](https://tuxsuite.com/) — on-demand APIs and tools for building Linux Kernels.
- [Cross-compilation toolchains (Bootlin)](https://toolchains.bootlin.com/) — large number of ready-to-use cross-compilation toolchains, targetting the Linux operating system on a large number of architectures.
- [Dockcross](https://github.com/dockcross/dockcross) — cross compiling toolchains in Docker images.
- [Next](https://git.kernel.org/pub/scm/linux/kernel/git/next/linux-next.git/) — next tree
- [Stable](https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git/) — Stable tree
- [Torvalds](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git) — Linus Torvald tree
- [Kernel map](https://makelinux.github.io/kernel/map/) — interactive map of Linux kernel sources.
- [kernel.org](https://kernel.org/) — linux kernel archives.
- [kernelci.org](https://kernelci.org/) — test system focused on the upstream Linux kernel.
- [kernelconfig](https://www.kernelconfig.io/index.html) — Linux kernel configuration entries.
- [Linux kernel CVEs](https://github.com/nluedtke/linux_kernel_cves) — Tracking CVEs for the linux Kernel
- [Linux Kernel Labs](https://linux-kernel-labs.github.io/refs/heads/master/) — lectures and labs on Linux Kernel.
- [Linux Kernel Module Cheat](https://github.com/cirosantilli/linux-kernel-module-cheat) — emulation setup to study and develop the Linux kernel.
- [LKFT](https://lkft.linaro.org/) — Linux Kernel Functional Testing.
- [ltp](https://github.com/linux-test-project/ltp) — Linux Test Project.
- [[Mailing Lists] — Lore kernel](https://lore.kernel.org/) — Linux kernel mailing lists.
- [[Mailing Lists] — Linux hardening](https://lore.kernel.org/linux-hardening/) — Linux hardening.
- [mebeim](https://syscalls.mebeim.net/?table=x86/64/x64/v6.2) — Linux kernel syscall tables.
- [syscall.sh](https://arm64.syscall.sh) — Alternative Linux kernel syscall tables
- [1337kit](https://github.com/lukasbalazik123/1337kit) — 64-bit LKM Rootkit builder based on yaml prescription.
- [ebpfkit](https://github.com/Gui774ume/ebpfkit) — ebpfkit is a rootkit powered by eBPF
- [brokepkg](https://github.com/R3tr074/brokepkg) — LKM rootkit working in Linux Kernels 2.6.x/3.x/4.x/5.x
- [Brootus](https://github.com/dsmatter/brootus) — educational Linux Kernel Rootkit.
- [Diamorphine](https://github.com/m0nad/Diamorphine) — LKM rootkit for Linux Kernels 2.6.x/3.x/4.x/5.x and ARM64.
- [enyelkm](https://github.com/therealdreg/enyelkm) — LKM rootkit for Linux x86 with the 2.6 kerne
- [KoviD](https://github.com/carloslack/KoviD) — Kernel rk
- [linux-rootkit](https://github.com/Zhang1933/linux-rootkit) — Remote Linux Loadable Kernel Module (LKM) rootkit (For Linux Kernels 5.x).
- [linux-rootkits](https://github.com/R3x/linux-rootkits) — collection of Linux kernel rootkits found across the internet taken and put together.
- [Pinkit](https://github.com/PinkP4nther/Pinkit) — LKM rootkit that executes a reverse TCP netcat shell with root privileges.
- [Red Blue Teams](https://github.com/pentesteracademy/linux-rootkits-red-blue-teams/tree/master) — Linux Rootkits (4.x Kernel)
- [Reptile](https://github.com/f0rb1dd3n/Reptile) — LKM Linux rootkit.
- [Research rootkit](https://github.com/NoviceLive/research-rootkit) — LibZeroEvil & the Research Rootkit project.
- [Reveng_rtkit](https://github.com/reveng007/reveng_rtkit) — Linux Loadable Kernel Module (LKM) based rootkit (ring-0).
- [rkduck](https://github.com/QuokkaLight/rkduck) — Linux v4.x.x Rootkit
- [Rootkit](https://github.com/nurupo/rootkit) — rootkit for Ubuntu 16.04 and 10.04 (Linux Kernels 4.4.0 and 2.6.32), both i386 and amd64.
- [Rootkit list download](https://github.com/d30sa1/RootKits-List-Download) — list of rootkits (includes also userspace rootkits).
- [Satan](https://github.com/aesophor/satan) — x86 Linux Kernel rootkit for Debian 9
- [spy](https://github.com/jarun/spy) — Linux kernel mode debugfs keylogger.
- [Sutekh](https://github.com/PinkP4nther/Sutekh) — rootkit that gives a userland process root permissions.
- [TripleCross](https://github.com/h3xduck/TripleCross) — Linux eBPF rootkit.
- [knock-out](https://github.com/jbaublitz/knock-out) — example of a kernel module in Rust.
- [out-of-tree](https://github.com/Rust-for-Linux/rust-out-of-tree-module) — basic template for an out-of-tree Linux kernel module written in Rust.
- [Rust for Linux](https://github.com/Rust-for-Linux) — organization for adding support for the Rust language to the Linux kernel.
- [Rust Kernel Programming (blog)](https://coderjoshdk.github.io/posts/Rust-Kernel-Programming.html)
- [Dumpers — pamspy](https://github.com/citronneur/pamspy) — Credentials Dumper for Linux using eBPF.
- [Linux Kernel CVEs](https://linuxkernelcves.com)
- [Linux kernel exploit development](https://breaking-bits.gitbook.io/breaking-bits/exploit-development/linux-kernel-exploit-development?s=09)
- [Linux Privilege Escalation](https://tbhaxor.com/linux-privilege-escalation/)

**🛠 outil**

- [kernel exploit practive](https://github.com/pr0cf5/kernel-exploit-practice) — repository for kernel exploit practice
- [Linux kernel programming](https://github.com/PacktPublishing/Linux-Kernel-Programming) — code repository for Linux Kernel Programming, published by Packt.
- [Linux Exploit Suggester](https://github.com/The-Z-Labs/linux-exploit-suggester) — Linux privilege escalation auditing tool
- [difuze](https://github.com/ucsb-seclab/difuze) — fuzzer for Linux Kernel Drivers.
- [healer](https://github.com/SunHao-0/healer) — Kernel fuzzer inspired by Syzkaller.
- [Syzkaller](https://github.com/google/syzkaller) — unsupervised coverage-guided kernel fuzzer.
- [vmlinux-to-elf](https://github.com/marin-m/vmlinux-to-elf) — tool to recover a fully analyzable .ELF from a raw kernel.
- [Buildroot](https://buildroot.org/) — simple, efficient and easy-to-use tool to generate embedded Linux systems through cross-compilation.
- [kconfig-hardened-check](https://github.com/a13xp0p0v/kconfig-hardened-check) — tool for checking the security hardening options of the Linux kernel.
- [Linux Exploit Suggester](https://github.com/mzet-/linux-exploit-suggester) — Linux privilege escalation auditing tool.

**🧪 writeup**

- [Technical Review: A Deep Analysis of the Dirty Pipe Vulnerability](https://blog.aquasec.com/deep-analysis-of-the-dirty-pipe-vulnerability)
- [kernelCTF (Google)](https://google.github.io/security-research/kernelctf/rules.html) — part of the Google VRP and is focused on making exploiting Linux kernel vulnerabilities harder.
- [kctf](https://google.github.io/kctf/) — CTF infrastructure written on top of Kubernetes.
- [kernelpwn](https://github.com/smallkirby/kernelpwn) — CTF kernel-pwn challenges and writeups
- [Writeups — Attacking Android Binder: Analysis and Exploitation of CVE-2023-20938](https://androidoffsec.withgoogle.com/posts/attacking-android-binder-analysis-and-exploitation-of-cve-2023-20938/)
- [CVE-2017-11176: A step-by-step Linux Kernel exploitation — Part 1](https://blog.lexfo.fr/cve-2017-11176-linux-kernel-exploitation-part1.html)
- [CVE-2017-11176: A step-by-step Linux Kernel exploitation — Part 2](https://blog.lexfo.fr/cve-2017-11176-linux-kernel-exploitation-part2.html)
- [CVE-2017-11176: A step-by-step Linux Kernel exploitation — Part 3](https://blog.lexfo.fr/cve-2017-11176-linux-kernel-exploitation-part3.html)
- [CVE-2017-11176: A step-by-step Linux Kernel exploitation — Part 4](https://blog.lexfo.fr/cve-2017-11176-linux-kernel-exploitation-part4.html)
- [CVE-2019-18683: Exploiting a Linux kernel vulnerability in the V4L2 subsystem](https://a13xp0p0v.github.io/2020/02/15/CVE-2019-18683.html)
- [CVE-2022-2586 Writeup](https://www.jmpeax.dev/CVE-2022-2586-writeup.html)
- [Canary in the Kernel Mine: Exploiting and Defending Against Same-Type Object Reuse](https://grsecurity.net/exploiting_and_defending_against_same_type_object_reuse)
- *…et 19 autres writeups (voir `entries.json`)*


### `exploit-dev` — Exploit dev / mitigations

Complète le lot `exploit-dev` existant côté mitigations (RELRO, canari, CET, FGKASLR) et plateformes d'entraînement.

*29 exercices dans l'app · 25 ressources ici*

**📘 cours/tuto**

- [CTF Wiki pwn](https://ctf-wiki.mahaloz.re/pwn/readme/)
- [awesome-ctf (wargames)](https://github.com/apsdehal/awesome-ctf#wargames) — list of wargames websites.
- [pwn.college](https://pwn.college) — learn about, and practice, core cybersecurity concepts in a hands-on fashion.
- [ropemporium](https://ropemporium.com/index.html) — learn return-oriented programming through a series of challenges.
- [Documentation](https://sourceware.org/gdb/current/onlinedocs/gdb)
- [Tools — ble-fuzzing](https://git.ist.tugraz.at/apferscher/ble-fuzzing) — Stateful Black-Box Fuzzing of BLE Devices Using Automata Learning

**🔗 référence**

- [pwning slides](https://github.com/bash-c/slides/tree/master) — collection of slides and material on exploitation (not mainatined)
- [Writeups — 15 years later: Remote Code Execution in qmail (CVE-2005-1513)](https://www.qualys.com/2020/05/19/cve-2005-1513/remote-code-execution-qmail.txt)
- [Examining Pointer Authentication on the iPhone XS](https://googleprojectzero.blogspot.com/2019/02/examining-pointer-authentication-on.html)
- [GOT and PLT for pwning](https://systemoverlord.com/2017/03/19/got-and-plt-for-pwning.html)
- [PAC it up: Towards Pointer Integrity using ARM Pointer Authentication](https://www.usenix.org/system/files/sec19fall_liljestrand_prepub.pdf)
- [UIUCTF 2022 - SMM Cowsay 1, 2, 3](https://toh.necst.it/uiuctf/pwn/system/x86/rop/UIUCTF-2022-SMM-Cowsay/)
- [exploit_mitigations](https://github.com/nccgroup/exploit_mitigations) — Knowledge base of exploit mitigations
- [The Oddest Place You Will Ever Find PAC](https://blog.ret2.io/2021/06/16/intro-to-pac-arm64/)
- [exploit.education](https://exploit.education) — VM for practiving exploitation.
- [overthewire](https://overthewire.org/wargames/) — earn and practice security concepts.
- [pwnable.kr](http://pwnable.kr/#) — wargame site which provides various pwn challenges.
- [SyzScope](https://github.com/plummm/SyzScope) — automatically uncover high-risk impacts given a bug with only low-risk impacts.
- [elfloader](https://github.com/gamozolabs/elfloader) — architecture-agnostic ELF file flattener for shellcode.
- [Venom](https://github.com/r00t-3xp10it/venom) — metasploit Shellcode generator/compiller.
- [Advanced binary fuzzing using AFL++-QEMU and libprotobuf: a practical case of grammar-aware in-memory persistent fuzzing](https://airbus-seclab.github.io/AFLplusplus-blogpost/)

**🛠 outil**

- [pwntools](https://github.com/Gallopsled/pwntools) — CTF framework and exploit development library

**🧪 writeup**

- [BitUnmap: Attacking Android Ashmem](https://googleprojectzero.blogspot.com/2016/12/bitunmap-attacking-android-ashmem.html)
- [nftables Adventures: Bug Hunting and N-day Exploitation (CVE-2023-31248)](https://starlabs.sg/blog/2023/09-nftables-adventures-bug-hunting-and-n-day-exploitation/)
- [pwnable.tw](https://pwnable.tw) — wargame site for hackers to test and expand their binary exploiting skills.


### `reversing` — Reverse engineering

Recoupe fortement les transcrits YouTube analysés par ailleurs. Ici surtout de l'outillage (Ghidra, IDA, WinDbg) et de l'anti-analyse.

*94 exercices dans l'app · 35 ressources ici*

**📘 cours/tuto**

- [CS6265: Information Security Lab](https://tc.gts3.org/cs6265/2019/tut/tut01-warmup1.html) — Reversing, debugging, exploitation tutorials.
- [ARMv8 AArch64/ARM64 Full Beginner's Assembly Tutorial](https://mariokartwii.com/armv8/)
- [Awesome binary parsing](https://github.com/dloss/binary-parsing)
- [Awesome Executable Packing](https://github.com/packing-box/awesome-executable-packing?tab=readme-ov-file)
- [Debugger Ghidra Class](https://github.com/NationalSecurityAgency/ghidra/tree/master/GhidraDocs/GhidraClass/Debugger)
- [Introduction to Malware Analysis and Reverse Engineering](https://class.malware.re)
- [WinDBG quick start tutorial](http://codemachine.com/articles/windbg_quickstart.html)

**🔗 référence**

- [ARM64 Reversing And Exploitation (8ksec) — Part 10](https://8ksec.io/arm64-reversing-and-exploitation-part-10-intro-to-arm-memory-tagging-extension-mte/)
- [TEE-reversing](https://github.com/enovella/TEE-reversing)
- [GDB](https://www.sourceware.org/gdb/) — The GNU Project Debugger
- [GEF](https://github.com/hugsy/gef) — GDB Enhanced Feature
- [BDF](https://github.com/secretsquirrel/the-backdoor-factory) — The Backdoor Factory.
- [ReCmd](https://github.com/0xor0ne/recmd) — Remote Command executor
- [Tiny Shell](https://github.com/creaktive/tsh) — An open-source UNIX backdoor
- [Linux Malware](https://github.com/timb-machine/linux-malware) — tracking interesting Linux (and UNIX) malware.
- [ATT&CK mapping](https://gist.github.com/timb-machine/05043edd6e3f71569f0e6d2fe99f5e8c) — linux malware to ATTACK.
- [Log Cleaners — Moonwalk](https://github.com/mufeedvh/moonwalk) — Cover your tracks during Linux Exploitation by leaving zero traces on system logs and filesystem timestamps.
- [Malware Source Code](https://github.com/vxunderground/MalwareSourceCode) — collection of malware source code for a variety of platforms.
- [Packers — oxide](https://github.com/frank2/oxide) — PoC packer written in Rust.
- [Anti-Debug Tricks](https://anti-debug.checkpoint.com)
- [Reverse Engineering WiFi on RISC-V BL602](https://lupyuen.github.io/articles/wifi)

**🛠 outil**

- [Obfuscation — Bashfuscator](https://github.com/Bashfuscator/Bashfuscator) — configurable and extendable Bash obfuscation framework.
- [Pafish](https://github.com/a0rtega/pafish) — testing tool that uses different techniques to detect virtual machines and malware analysis environments.
- [Ghidriff - Ghidra Binary Diffing Engine](https://github.com/clearbluejar/ghidriff)

**🧪 writeup**

- [ARM64 Reversing And Exploitation (8ksec) — Part 1](https://8ksec.io/arm64-reversing-and-exploitation-part-1-arm-instruction-set-simple-heap-overflow/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 2](https://8ksec.io/arm64-reversing-and-exploitation-part-2-use-after-free/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 3](https://8ksec.io/arm64-reversing-and-exploitation-part-3-a-simple-rop-chain/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 4](https://8ksec.io/arm64-reversing-and-exploitation-part-4-using-mprotect-to-bypass-nx-protection-8ksec-blogs/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 5](https://8ksec.io/arm64-reversing-and-exploitation-part-5-writing-shellcode-8ksec-blogs/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 6](https://8ksec.io/arm64-reversing-and-exploitation-part-6-exploiting-an-uninitialized-stack-variable-vulnerability/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 7](https://8ksec.io/arm64-reversing-and-exploitation-part-7-bypassing-aslr-and-nx/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 8](https://8ksec.io/arm64-reversing-and-exploitation-part-8-exploiting-an-integer-overflow-vulnerability/)
- [ARM64 Reversing And Exploitation (8ksec) — Part 9](https://8ksec.io/arm64-reversing-and-exploitation-part-9-exploiting-an-off-by-one-overflow-vulnerability/)
- [ret2dl_resolve x64: Exploiting Dynamic Linking Procedure In x64 ELF Binaries Devil](https://syst3mfailure.io/ret2dl_resolve/)
- [Analysis of a LoadLibraryA Stack String Obfuscation Technique with Radare2 & x86dbg](https://www.archcloudlabs.com/projects/loadlibrary-analysis/)


### `hardware` — Matériel, firmware, TEE

Firmware, secure boot, TrustZone/TPM, injection de faute. Nourrit un topic déjà fourni (70 exercices) mais surtout côté théorie.

*70 exercices dans l'app · 66 ressources ici*

**📘 cours/tuto**

- [Documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/index.html#)
- [Documentation](https://docs.silabs.com)
- [Documentation](https://docs.nordicsemi.com)
- [Hands-on Firmware Extraction, Exploration, and Emulation](https://github.com/onekey-sec/BHEU23-firmware-workshop)
- [Operating System development tutorials in Rust on the Raspberry Pi](https://github.com/rust-embedded/rust-raspberrypi-OS-tutorials)
- [VSS: Beginners Guide to Building a Hardware Hacking Lab](https://voidstarsec.com/hw-hacking-lab/vss-lab-guide])

**🔗 référence**

- [Zephyr and MCUboot Security Analysis](https://research.nccgroup.com/wp-content/uploads/2020/05/NCC_Group_Zephyr_MCUboot_Research_Report_2020-05-26_v1.0.pdf)
- [ARM TrustZone: pivoting to the secure world](https://blog.thalium.re/posts/pivoting_to_the_secure_world/)
- [Tools — ESP32 802.11 TX](https://github.com/Jeija/esp32-80211-tx) — Send arbitrary IEEE 802.11 frames with Espressif's ESP32.
- [Tools — ESP32 ESP8266 attacks](https://github.com/Matheus-Garbelini/esp32_esp8266_attacks) — Proof of Concept of ESP32/8266 Wi-Fi vulnerabilties.
- [Tools — ESP32 Marauder](https://github.com/justcallmekoko/ESP32Marauder) — suite of WiFi/Bluetooth offensive and defensive tools for the ESP32.
- [Tools — ESP32-WiFi-Hash-Monster](https://github.com/G4lile0/ESP32-WiFi-Hash-Monster) — store EAPOL & PMKID packets in an SD CARD.
- [Tools — pawnagotchi](https://pwnagotchi.ai/) — A2C-based “AI” powered by bettercap and running on a Raspberry Pi Zero W that learns from its surrounding WiFi environment in order to maximize the crackable WPA key material it captures/
- [Tools — pi-pwnbox-rogueap](https://github.com/koutto/pi-pwnbox-rogueap) — Rogue AP based on Raspberry Pi
- [esp-wifi](https://github.com/esp-rs/esp-wifi) — WIP / POC for using the ESP32-C3, ESP32-S3 and ESP32 wifi drivers in bare-metal Rust.
- [IntelBluetoothFirmware](https://github.com/OpenIntelWireless/IntelBluetoothFirmware) — Intel Bluetooth Firmware for macOS
- [Tools — Android nRF-Connect](https://github.com/NordicSemiconductor/Android-nRF-Connect/tree/main) — nRF Connect for Mobile is an application designed for Bluetooth Low Energy developers.
- [Tools — injectable-firmware](https://github.com/RCayre/injectable-firmware) — Custom firmware for nrf52840-dongle to eversdrop and attack BLE communications.
- [Bouffalo Labs](https://www.bouffalolab.com)
- [GitHub](https://github.com/bouffalolab)
- [Espressif](https://www.espressif.com/en)
- [Github](https://github.com/espressif)
- [Silicon Labs](https://www.silabs.com)
- [GitHub](https://github.com/SiliconLabs)
- [Microchip](https://www.microchip.com)
- [GitHub](https://github.com/MicrochipTech)
- [Nordic](https://www.nordicsemi.com)
- [GitHub](https://github.com/NordicSemiconductor)
- [nrf-rs](https://github.com/nrf-rs)
- [NXP](https://www.nxp.com)
- [GitHub](https://github.com/NXP)
- [Renesas](https://www.renesas.com/us/en)
- [GitHub](https://github.com/renesas)
- [STMicroelectronics](https://www.st.com/content/st_com/en.html)
- [GitHub](https://github.com/STMicroelectronics)
- [Texas Instruments](https://www.ti.com)
- [GitHub](https://github.com/TexasInstruments)
- [ESP32-Paxcounter](https://github.com/cyberman54/ESP32-Paxcounter) — Wifi & BLE driven passenger flow metering with cheap ESP32 boards.
- [esp32-open-mac](https://github.com/esp32-open-mac/esp32-open-mac) — Reverse engineered wifi driver for the ESP32.
- [Firmware (original)](https://github.com/flipperdevices/flipperzero-firmware)
- [RogueMaster firmware](https://github.com/RogueMaster/flipperzero-firmware-wPlugins)
- [Unleashed-firmware](https://github.com/DarkFlippers/unleashed-firmware)
- [Xtreme-firmware](https://github.com/Flipper-XFW/Xtreme-Firmware)
- [Hardware — BladeRF](https://www.nuand.com/bladerf-2-0-micro/) — 2x2 MIMO, 47MHz to 6GHz frequency range
- [Hardware — GitHub](https://github.com/Nuand/bladeRF) — bladeRF USB 3.0 Superspeed Software Defined Radio Source Code.
- [Hardware — HackRF One](https://greatscottgadgets.com/hackrf/one/) — oftware Defined Radio peripheral capable of transmission or reception of radio signals from 1 MHz to 6 GHz.
- [Hardware — GitHub](https://github.com/greatscottgadgets/hackrf) — low cost software radio platform.
- [Hardware — LimeSDR](https://limemicro.com/products/boards/limesdr/) — low cost, open source, apps-enabled software defined radio (SDR).
- [Hardware — GitHub](https://github.com/myriadrf) — LimeSdr software
- [Laser-Based Audio Injection on Voice-Controllable Systems](https://lightcommands.com)
- [mjsxj09cm Recovering Firmware And Backdooring](https://whiterose-infosec.super.site/mjsxj09cm-recovering-firmware-and-backdooring)

**🛠 outil**

- [Tools — esp32-wifi-penetration-tool](https://github.com/risinek/esp32-wifi-penetration-tool) — Exploring possibilities of ESP32 platform to attack on nearby Wi-Fi networks.
- [Tools — nexmon](https://github.com/seemoo-lab/nexmon) — The C-based Firmware Patching Framework for Broadcom/Cypress WiFi Chips.
- [esp32-wifi-lib](https://github.com/espressif/esp32-wifi-lib) — ESP32 WiFi library.
- [Tools — ESP32 bluetooth classic sniffer](https://github.com/Matheus-Garbelini/esp32_bluetooth_classic_sniffer) — Active Bluetooth BR/EDR Sniffer/Injector as cheap as any ESP32 board can get.
- [Tools — nRF sniffer](https://infocenter.nordicsemi.com/index.jsp?topic=%2Fug_sniffer_ble%2FUG%2Fsniffer_ble%2Fintro.html) — Bluetooth LE sniffer from nordic.
- [Tools — nRF Sniffer for 802.15.4](https://www.nordicsemi.com/Products/Development-tools/nRF-Sniffer-for-802154)
- [Tools — nRF Sniffer for Bluetooth LE](https://www.nordicsemi.com/Products/Development-tools/nRF-Sniffer-for-Bluetooth-LE)

**🧪 writeup**

- [MCUBOOT: Security Assessment — Part 1](https://trustngo.tech/2022/10/10/mcuboot-security-assessment-part-1/)
- [MCUBOOT: Security Assessment — Part 2](https://trustngo.tech/2022/10/18/mcuboot-security-assessment-part-2/)
- [MCUBoot Under (good) Pressure — Part 1](https://eshard.com/posts/mcuboot-under-good-pressure-part-1)
- [MCUBoot Under (good) Pressure — Part 2](https://eshard.com/posts/mcuboot-under-good-pressure-part-2)
- [Breaking TEE Security — part 1](https://www.riscure.com/tee-security-samsung-teegris-part-1/)
- [Breaking TEE Security — part 2](https://www.riscure.com/tee-security-samsung-teegris-part-2/)
- [Breaking TEE Security — part 3](https://www.riscure.com/tee-security-samsung-teegris-part-3/)
- [Trust Issues: Exploiting TrustZone TEEs](https://googleprojectzero.blogspot.com/2017/07/trust-issues-exploiting-trustzone-tees.html)


### `networking` — Réseau & sans-fil

Le plus gros volume, mais aussi le plus spécialisé (802.11, BLE, SDR). Le topic `networking` de l'app n'a que 13 exercices : marge énorme, pertinence à arbitrer.

*13 exercices dans l'app · 199 ressources ici*

**📘 cours/tuto**

- [wifi-pentesting-guide](https://github.com/ricardojoserf/wifi-pentesting-guide) — WiFi Penetration Testing Guide.
- [Awesome bluetooth security](https://github.com/engn33r/awesome-bluetooth-security) — useful references for anyone working with Bluetooth BR/EDR/LE or Mesh security.
- [Linux Wireless wiki](https://wireless.wiki.kernel.org/) — Documentation for the Linux wireless (IEEE-802.11) subsystem.
- [Awesome CTS](https://github.com/BlackVS/Awesome-CTS) — curated list of Capture The Signal CTF related stuff.
- [Awesome](https://github.com/djsime1/awesome-flipperzero)
- [Fissure](https://github.com/ainfosec/FISSURE) — The RF and reverse engineering framework for everyone.
- [Signal Identification Guide](https://www.sigidwiki.com/wiki/Signal_Identification_Guide) — help identify radio signals through example sounds and waterfall images.
- [Theory — dspguide](http://www.dspguide.com/) — The Scientist and Engineer's Guide to Digital Signal Processing.
- [Theory — pysdr](https://pysdr.org/) — A Guide to SDR and DSP using Python.

**🔗 référence**

- [BleedingTooth: Linux Bluetooth Zero-Click Remote Code Execution](https://google.github.io/security-research/pocs/linux/bleedingtooth/writeup.html)
- [Specifications](https://www.3gpp.org/specifications-technologies)
- [Wi-Fi Alliance](https://www.wi-fi.org)
- [Specification](https://www.wi-fi.org/discover-wi-fi/specifications)
- [FragAttacks](https://www.fragattacks.com) — Fragmentation and aggregation attacks against Wi-Fi.
- [KRACK attack — paper](https://papers.mathyvanhoef.com/ccs2017.pdf) — Key Reinstallation Attacks: Forcing Nonce Reuse in WPA2
- [KRACK attack — scripts](https://github.com/vanhoefm/krackattacks-scripts) — scripts to test if clients or access points (APs) are affected by the KRACK attack.
- [KRACK attack — website](https://www.krackattacks.com) — Key Reinstallation Attacks
- [ICMP redirects](https://csis.gmu.edu/ksun/publications/WiFi_Interception_SP23.pdf) — Man-in-the-Middle Attacks without Rogue AP: When WPAs Meet ICMP Redirects.
- [[IEEE] — Working Group](https://www.ieee802.org/11/)
- [Tools — aircrack-ng](https://www.aircrack-ng.org/) — complete suite of tools to assess WiFi network security.
- [Tools — GitHub](https://github.com/aircrack-ng/aircrack-ng) — WiFi security auditing tools suite
- [Tools — airgeddon](https://github.com/v1s1t0r1sh3r3/airgeddon?tab=readme-ov-file) — multi-use bash script for Linux systems to audit wireless networks.
- [Tools — airgorah](https://github.com/martin-olivier/airgorah) — WiFi auditing software that can perform deauth attacks and passwords cracking.
- [Tools — airpwn-ng](https://github.com/ICSec/airpwn-ng) — Packet injection for wifi.
- [Tools — apfree-wifidog](https://github.com/liudf0716/apfree-wifidog) — high-performance, lightweight captive portal solution.
- [Tools — bettercap](https://www.bettercap.org/) — Swiss Army knife for WiFi, Bluetooth Low Energy, wireless HID hijacking.
- [Tools — crEAP](https://github.com/p0dalirius/crEAP) — WPA Enterprise mode EAP types analysis
- [Tools — EAP_buster](https://github.com/blackarrowsec/EAP_buster) — lists what EAP methods are supported by the RADIUS server.
- [Tools — eaphammer](https://github.com/s0lst1c3/eaphammer) — evil twin attacks against WPA2-Enterprise networks.
- [Tools — fern-wifi-cracker](https://github.com/savio-code/fern-wifi-cracker) — Wireless security auditing and attack software.
- [Tools — FlyingCarpet](https://github.com/spieglt/FlyingCarpet) — Cross-platform AirDrop.
- [Tools — FreeRADIUS](https://freeradius.org) — open source RADIUS server.
- [Tools — Github](https://github.com/FreeRADIUS)
- [Tools — hostapd](https://w1.fi/cgit/hostap/) — user space daemon for access points.
- [Tools — hostapd-mana](https://github.com/sensepost/hostapd-mana) — SensePost's modified hostapd for wifi attacks.
- [Tools — w1f1.net](https://w1f1.net) — set of tools for wifi hacking using rogue access points.
- [Tools — howmanypeoplearearound](https://github.com/schollz/howmanypeoplearearound) — Count the number of people around you.
- [Tools — Kismet](https://www.kismetwireless.net/) — Wi-Fi, Bluetooth, RF, and more
- [Tools — GitHub](https://github.com/kismetwireless) — Kismet and related tools and libraries for wireless monitoring, transmitting, and auditing.
- [Tools — iw](https://git.kernel.org/pub/scm/linux/kernel/git/jberg/iw.git) — nl80211 based CLI configuration utility for wireless devices.
- [Tools — libwifi (vanhoefm)](https://github.com/vanhoefm/libwifi) — python and scapy scripts for Wi-Fi.
- [Tools — LinkLiar](https://github.com/halo/LinkLiar) — Link-Layer MAC spoofing GUI for macOS.
- [Tools — linux-router](https://github.com/garywill/linux-router) — Set Linux as router in one command.
- [Tools — modwifi](https://github.com/vanhoefm/modwifi) — low-layer Wi-Fi attacks.
- [Tools — nearby](https://github.com/wisespace-io/nearby/tree/master) — scans all nearby wifi networks and the devices connected to each network for Indoor positioning.
- [Tools — openwrt](https://openwrt.org) — Linux operating system targeting embedded devices.
- [Tools — PiDense](https://github.com/WiPi-Hunter/PiDense) — Python script to audit wireless network security.
- [Tools — pixiewps](https://github.com/wiire-a/pixiewps) — An offline Wi-Fi Protected Setup brute-force utility.
- [Tools — rastap](https://raspap.com) — full-featured wireless router setup for Debian-based devices.
- [Tools — sentrygun](https://github.com/s0lst1c3/sentrygun) — Rogue AP killer
- [Tools — trackerjacker](https://github.com/calebmadrigal/trackerjacker) — like nmap for mapping wifi networks you're not connected to, plus device tracking.
- [Tools — wifi-arsenal](https://github.com/0x90/wifi-arsenal) — links to projects related to wifi security.
- [Tools — wifi-cracking](https://github.com/brannondorsey/wifi-cracking) — Crack WPA/WPA2 Wi-Fi Routers with Airodump-ng and Aircrack-ng/Hashcat.
- [Tools — wifi-deauth](https://github.com/flashnuke/wifi-deauth) — deauth attac.
- [Tools — WiFi-Spam](https://github.com/adamff-dev/WiFi-Spam) — Spam thousands of WiFi access points with custom SSIDs.
- [Tools — wifijammer](https://github.com/DanMcInerney/wifijammer) — Continuously jam all wifi clients/routers.
- [Tools — WiFiManager](https://github.com/tzapu/WiFiManager) — ESP8266 WiFi Connection manager with web captive portal.
- [Tools — wifite2](https://github.com/derv82/wifite2) — script for auditing wireless networks.
- [Tools — wifi-presence](https://github.com/awilliams/wifi-presence) — Presence detection on OpenWrt routers using connect/disconnect events of WiFi clients.
- [Tools — wirespy](https://github.com/aress31/wirespy) — automate various wireless networks attacks.
- [Fz3r0 802.11_Wi-Fi Knowledge-Base](https://github.com/Fz3r0/Fz3r0_-_802.11_Wi-Fi_-_Knowledge-Base) — 802.11 Wi-Fi Networking Knowledge Base.
- [itlwm](https://github.com/OpenIntelWireless/itlwm?tab=readme-ov-file) — Intel Wi-Fi Drivers for macOS
- [USB-WiFi](https://github.com/morrownr/USB-WiFi) — USB WiFi Adapter Information for Linux
- [bluetooth.com](https://www.bluetooth.com)
- [Specifications](https://www.bluetooth.com/specifications/specs/)
- [Attacks — BlueBorne](https://www.armis.com/research/blueborne/) — attacks famility affecting Bluetooth devices
- [Hi, My Name is Keyboard — Blog Post](https://github.com/skysafe/reblog/blob/main/cve-2024-0230/README.md)
- [Hi, My Name is Keyboard — PoC](https://github.com/marcnewlin/hi_my_name_is_keyboard)
- [bluffs](https://github.com/francozappa/bluffs) — Bluetooth Forward and Future Secrecy Attacks
- [knob](https://github.com/francozappa/knob) — Key Negotiation Of Bluetooth (KNOB) attacks.
- [kr00kie](https://hexway.io/research/r00kie-kr00kie/) — kr00kie attack.
- [Playing with kr00kie](https://www.thice.nl/playing-with-kr00k/)
- [Slides](https://web-assets.esetstatic.com/wls/2020/02/ESET_Kr00k.pdf)
- [SweynTooth — Website](https://asset-group.github.io/disclosures/sweyntooth/)
- [SweynTooth — PoC](https://github.com/Matheus-Garbelini/sweyntooth_bluetooth_low_energy_attacks)
- [BLE Security Attack Defence](https://github.com/Charmve/BLE-Security-Attack-Defence) — Unveiling zero day vulnerabilities and security flaws in modern Bluetooth LE stacks.
- [Stacks — bluez](https://github.com/bluez/bluez) — Bluetooth protocol stack for Linux
- [Stacks — BTStack](https://github.com/bluekitchen/btstack) — Dual-mode Bluetooth stack, with small memory footprint
- [Stacks — NimBLE](https://mynewt.apache.org/latest/network/) — open-source Bluetooth Low Energy (BLE) stack
- [Tools — apple_bleee](https://github.com/hexway/apple_bleee) — what an attacker get from Apple devices if they sniff Bluetooth traffic.
- [Tools — AppleJuice](https://github.com/ECTO-1A/AppleJuice) — Apple BLE proximity pairing message spoofing
- [Tools — bleak](https://github.com/hbldh/bleak) — cross platform Bluetooth Low Energy Client for Python using asyncio
- [Tools — BLEUnlock](https://github.com/ts1/BLEUnlock) — Lock/unlock your Mac with Bluetooth LE.
- [Tools — bluepy](https://github.com/IanHarvey/bluepy) — Python interface to Bluetooth LE on Linux.
- [Tools — bluer](https://github.com/bluez/bluer) — Official BlueZ Bindings for Rust.
- [Tools — bluetility](https://github.com/jnross/Bluetility) — A Bluetooth Low Energy browser, an open-source alternative to LightBlue for OS X.
- [Tools — btlejack](https://github.com/virtualabs/btlejack) — Bluetooth Low Energy Swiss-army knife.
- [Tools — crackle](https://github.com/mikeryan/crackle) — Crack and decrypt BLE encryption.
- [Tools — gattacker](https://github.com/securing/gattacker) — BLE (Bluetooth Low Energy) security assessment
- [Tools — LOGITacker](https://github.com/RoganDawes/LOGITacker) — Enumerate and test Logitech wireless input devices for vulnerabilities
- [ble_monitor](https://github.com/custom-components/ble_monitor/tree/master) — BLE monitor for passive BLE sensors
- [ZigBee](https://csa-iot.org/all-solutions/zigbee/)
- [Realtek drivers — RTL88x2BU](https://github.com/morrownr/88x2bu) — Linux Driver for USB WiFi Adapters that are based on the RTL8812BU and RTL8822BU Chipset.
- [Bluetooth 5.0](https://docs.silabs.com/bluetooth/5.0/)
- [continuity](https://github.com/furiousMAC/continuity) — Apple Continuity Protocol Reverse Engineering and Dissector
- [Official FCC ID](https://www.fcc.gov/oet/ea/fccid)
- [esp32free80211](https://github.com/Jeija/esp32free80211) — Send arbitrary IEEE 802.11 frames.
- [FlipperZero](https://flipperzero.one)
- [flipper-zero-evil-portal](https://github.com/bigbrodude6119/flipper-zero-evil-portal)
- [opendrop](https://github.com/seemoo-lab/opendrop) — An open Apple AirDrop implementation
- [owlink](https://owlink.org/publications/) — Open Wireless Link
- [Responder](https://github.com/lgandx/Responder) — LLMNR, NBT-NS and MDNS poisoner
- [sparrow-wifi](https://github.com/ghostop14/sparrow-wifi) — Next-Gen GUI-based WiFi and Bluetooth Analyzer for Linux
- [wigle.net](https://wigle.net) — Wireless network mapping service
- [Libraries — OpenOFDM](https://www.analog.com/en/education/education-library/software-defined-radio-for-engineers.html) — Sythesizable, modular Verilog implementation of 802.11 OFDM decoder.
- [Theory — rtl-sdr](https://www.rtl-sdr.com) — RTL-SDR (RTL2832U) and software defined radio news and projects.
- [Tools — sdrangel](https://github.com/f4exb/sdrangel) — SDR Rx/Tx software
- [Tools — SDRPlusPlusA](https://github.com/AlexandreRouma/SDRPlusPlus) — Cross-Platform SDR Software
- [Tools — urh](https://github.com/jopohl/urh) — Universal Radio Hacker
- [z-wave alliance](https://z-wavealliance.org)
- [C2 Frameworks](#c2-frameworks)
- [C2 matrix](https://www.thec2matrix.com/) — C2 frameworks comparison.
- [Spreadsheet](https://docs.google.com/spreadsheets/d/1b4mUxa6cDQuTV2BPC6aA-GR4zGZi0ooPYtBe4IgPsSc/edit#gid=0)
- [pwncat](https://github.com/calebstewart/pwncat) — reverse and bind shell handler.
- [veil](https://github.com/Veil-Framework/Veil) — generate metasploit payloads that bypass common anti-virus solutions.
- [File Transfer — croc](https://github.com/schollz/croc) — easily and securely send things from one computer to another.
- [Proxies — frp](https://github.com/fatedier/frp) — fast reverse proxy.
- [Proxies — mitmproxy](https://mitmproxy.org/) — interactive HTTPS proxy.
- [Proxies — ngrok](https://github.com/inconshreveable/ngrok) — introspected tunnels to localhost.
- [Proxies — rathole](https://github.com/rapiz1/rathole) — lightweight and high-performance reverse proxy for NAT traversal, written in Rust.
- [Proxies — Shadowsocks](https://github.com/shadowsocks/shadowsocks-rust) — fast tunnel proxy that helps you bypass firewalls.
- [Proxies — socat](https://repo.or.cz/socat.git) — relay for bidirectional data transfer.
- [Remote/Reverse Shells — GTRS](https://github.com/mthbernardes/GTRS) — Google Translator Reverse Shell.
- [Remote/Reverse Shells — hershell](https://github.com/lesnuages/hershell) — multiplatform reverse shell generator.
- [Remote/Reverse Shells — icmpsh](https://github.com/bdamele/icmpsh) — reverse ICMP shell.
- [Remote/Reverse Shells — Platypus](https://github.com/WangYihang/Platypus) — modern multiple reverse shell sessions manager written in go.
- [Remote/Reverse Shells — rpty](https://github.com/TimeToogo/remote-pty) — tricking shells into interactive mode when local PTY's are not available.
- [Remote/Reverse Shells — rustcat](https://github.com/robiot/rustcat) — modern Port listener and Reverse shell.
- [Remote/Reverse Shells — tunshell](https://github.com/TimeToogo/tunshell) — remote shell into ephemeral environments.
- [Remote/Reverse Shells — wash](https://github.com/puppetlabs/wash) — a cloud-native shell for bringing remote infrastructure to your terminal.
- [Tunnelling — chisel](https://github.com/jpillora/chisel) — fast TCP/UDP tunnel over HTTP.
- [Tunnelling — clash](https://github.com/Dreamacro/clash) — rule-based tunnel in Go.
- [Tunnelling — dog-tunnel](https://github.com/vzex/dog-tunnel) — p2p tunnel.
- [Tunnelling — kcp](https://github.com/skywind3000/kcp) — a Fast and Reliable ARQ Protocol.
- [Tunnelling — gost](https://github.com/ginuerzh/gost) — a simple tunnel written in golang.
- [Tunnelling — gsocket](https://github.com/hackerschoice/gsocket) — connect like there is no firewall. Securely.
- [Tunnelling — icmptunnel](https://github.com/DhavalKapil/icmptunnel) — tunnel your IP traffic through ICMP echo and reply packets.
- [Tunnelling — iodine](https://github.com/yarrick/iodine) — tunnel IPv4 data through a DNS server.
- [Tunnelling — ssf](https://github.com/securesocketfunneling/ssf) — Secure Socket Funneling.
- [Tunnelling — udp2raw](https://github.com/wangyu-/udp2raw) — tunnel which Turns UDP Traffic into Encrypted UDP/FakeTCP/ICMP Traffic.
- [Grand Theft Auto A peek of BLE relay attack](https://rollingpwn.github.io/BLE-Relay-Aattck/)
- [Illustrated Connections — dtls](https://dtls.xargs.org)
- [Illustrated Connections — quic](https://quic.xargs.org)

**🛠 outil**

- [Repository](https://github.com/vanhoefm/fragattacks)
- [MacStealer — repository](https://github.com/vanhoefm/macstealer) — est Wi-Fi networks for client isolation bypasses.
- [MacStealer — wifi-framing](https://github.com/domienschepers/wifi-framing) — Repository for the Framing Frames publication
- [Tools — AngryOxide](https://github.com/Ragnt/AngryOxide) — 802.11 Attack Tool (rust).
- [Tools — GitHub](https://github.com/bettercap/bettercap) — source code repository.
- [Tools — libwifi](https://libwifi.so/) — an 802.11 (WiFi) Frame Generation and Parsing Library in C.
- [Tools — github repo](https://github.com/libwifi/libwifi) — libwifi github repository
- [Tools — libwifi (nukesor)](https://github.com/Nukesor/libwifi) — rust library for parsing IEE 802.11 frames.
- [Tools — probequest](https://github.com/SkypLabs/probequest) — Toolkit for playing with Wi-Fi probe requests.
- [Tools — rogue (InfamousSYN)](https://github.com/InfamousSYN/rogue) — extensible toolkit providing penetration testers an easy-to-use platform to deploy Access Points.
- [Tools — websploit](https://github.com/f4rih/websploit) — an advanced MITM framework.
- [Tools — WEF](https://github.com/D3Ext/WEF) — Wi-Fi Exploitation Framework.
- [Tools — Wifi-Hacking](https://github.com/ankit0183/Wifi-Hacking) — Cyber Security Tool For Hacking Wireless Connections Using Built-In Kali Tools.
- [Tools — WIFI-HACKING](https://github.com/U7P4L-IN/WIFI-HACKING) — Security Tool For Hacking Wireless Connections.
- [Tools — WiFiBroot](https://github.com/hash3liZer/WiFiBroot) — A Wireless (WPA/WPA2) Pentest/Cracking tool.
- [Tools — wifiphisher](https://github.com/wifiphisher/wifiphisher) — The Rogue Access Point Framework.
- [Tools — wifipumpkin3](https://github.com/P0cL4bs/wifipumpkin3) — Powerful framework for rogue access point attack.
- [Tools — WPAxFuzz](https://github.com/efchatz/WPAxFuzz) — full-featured open-source Wi-Fi fuzzer
- [Tools — bluesnooze](https://github.com/odlp/bluesnooze) — Bluetooth Low Energy (BLE) snooping tool.
- [Tools — bluing](https://github.com/fO-000/bluing) — intelligence gathering tool for hacking Bluetooth.
- [Tools — BTLE](https://github.com/JiaoXianjun/BTLE) — Bluetooth Low Energy (BLE) packet sniffer and transmitter for both standard and non standard (raw bit) based on Software Defined Radio (SDR).
- [Tools — btlejuice](https://github.com/DigitalSecurity/btlejuice) — Bluetooth Smart (LE) Man-in-the-Middle framework
- [Tools — btleplug](https://github.com/deviceplug/btleplug) — Rust Cross-Platform Host-Side Bluetooth LE Access Library.
- [Tools — gattlib](https://github.com/labapart/gattlib) — Library to access GATT information from BLE (Bluetooth Low Energy) devices.
- [Tools — ice9-bluetooth-sniffer](https://github.com/mikeryan/ice9-bluetooth-sniffer) — Wireshark Bluetooth sniffer for HackRF, BladeRF, and USRP.
- [Tools — internalblue](https://github.com/seemoo-lab/internalblue) — About Bluetooth experimentation framework for Broadcom and Cypress chips.
- [Tools — Sniffle](https://github.com/nccgroup/Sniffle) — A sniffer for Bluetooth 5 and 4.x LE
- [KillerBee](https://github.com/jhshi/openofdm) — IEEE 802.15.4/ZigBee Security Research Toolkit.
- [Mirage](https://github.com/RCayre/mirage) — powerful and modular framework dedicated to the security analysis of wireless communications.
- [Libraries — GNU Radio](https://www.gnuradio.org/) — development toolkit that provides signal processing blocks to implement software radios.
- [Libraries — liquid-dsp](https://github.com/jgaeddert/liquid-dsp) — digital signal processing library for software-defined radios.
- [Emp3r0r](https://github.com/jm33-m0/emp3r0r) — Linux/Windows post-exploitation framework made by linux user.
- [empire](https://github.com/BC-SECURITY/Empire) — PowerShell and Python 3.x post-exploitation framework.
- [Havoc](https://github.com/HavocFramework/Havoc) — modern and malleable post-exploitation command and control framework.
- [Heroinn](https://github.com/b23r0/Heroinn) — Rust cross platform C2/post-exploitation framework.
- [Link](https://github.com/postrequest/link) — command and control framework written in rust.
- [pupy](https://github.com/n1nj4sec/pupy) — cross-platform remote administration and post-exploitation tool.
- [sliver](https://github.com/BishopFox/sliver) — Adversary Emulation Framework.
- [Stitch](https://github.com/nathanlopez/Stitch) — python Remote Administration Tool.
- [TheFatRat](https://github.com/screetsec/TheFatRat) — generate backdoor and easy tool to post exploitation attack.
- [File Transfer — pcp](https://github.com/dennis-tra/pcp) — peer-to-peer data transfer tool based on libp2p.
- [Proxies — leaf](https://github.com/eycorsican/leaf) — versatile and efficient proxy framework.
- [Proxies — Proxiechain](https://github.com/haad/proxychains) — a tool that forces any TCP connection made by any given application to follow through proxies.
- [Remote/Reverse Shells — rsg](https://github.com/mthbernardes/rsg) — tool to generate various ways to do a reverse shell.
- [Tunnelling — bore](https://github.com/ekzhang/bore) — simple CLI tool for making tunnels to localhost.
- [Tunnelling — pingtunnel](https://github.com/esrrhs/pingtunnel) — tool that send TCP/UDP traffic over ICMP.
- [Tunnelling — Stowaway](https://github.com/ph4ntonn/Stowaway) — Multi-hop Proxy Tool for pentesters.

**🧪 writeup**

- [Over the Air — Exploiting Broadcom’s Wi-Fi Stack (Part 1)](https://googleprojectzero.blogspot.com/2017/04/over-air-exploiting-broadcoms-wi-fi_4.html)
- [Over the Air — Exploiting Broadcom’s Wi-Fi Stack (Part 2)](https://googleprojectzero.blogspot.com/2017/04/over-air-exploiting-broadcoms-wi-fi_11.html)
- [Over the Air — Exploiting The Wi-Fi Stack on Apple Devices (Pt. 1)](https://googleprojectzero.blogspot.com/2017/09/over-air-vol-2-pt-1-exploiting-wi-fi.html)
- [Over the Air — Exploiting The Wi-Fi Stack on Apple Devices (Pt. 2)](https://googleprojectzero.blogspot.com/2017/10/over-air-vol-2-pt-2-exploiting-wi-fi.html)
- [Broadcom Wi-Fi stack exploitation — Part 5](https://googleprojectzero.blogspot.com/2017/10/over-air-vol-2-pt-3-exploiting-wi-fi.html)
- [DragonBlood](https://wpa3.mathyvanhoef.com) — attacking WPA3's Dragonfly Handshake
- [Exploiting Wi-Fi Stack on Tesla Model S](https://keenlab.tencent.com/en/2020/01/02/exploiting-wifi-stack-on-tesla-model-s/)
- [MacStealer — paper](https://papers.mathyvanhoef.com/usenix2023-wifi.pdf) — Framing Frames: Bypassing Wi-Fi Encryption by Manipulating Transmit Queues.
- [cts.ninja](https://cts.ninja/) — CTF focused on radio signal reverse engineering


### `iot-edge` — IoT / OT / ICS

`iot-edge` n'a que 5 exercices. La sous-liste OT est courte mais ciblée (Modbus, PLC, protocoles industriels).

*5 exercices dans l'app · 18 ressources ici*

**📘 cours/tuto**

- [NIST ICS Security](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-82r2.pdf) — guide to Industrial Control Systems (ICS) Security by NIST.
- [Awesome Industrial Protocols](https://github.com/Orange-Cyberdefense/awesome-industrial-protocols)
- [Satellite Hacking Demystified(RTC0007)](https://redteamrecipe.com/Satellite-Hacking-Demystified/)

**🔗 référence**

- [802.15.4](https://ieeexplore.ieee.org/browse/standards/get-program/page/series?id=68)
- [csa-iot.org](https://csa-iot.org) — Connectivity Standards Alliance
- [Specifications](https://csa-iot.org/developer-resource/specifications-download-request/)
- [ESPHome](https://esphome.io) — Home Automation systems.
- [Home Assistant](https://www.home-assistant.io/) — Open source home automation
- [Matter](https://csa-iot.org/all-solutions/matter/)
- [Thread](https://www.threadgroup.org)
- [OpenThread](https://openthread.io) — open-source implementation of Thread
- [Specifications](https://www.threadgroup.org/support#specifications)
- [ICS Security](https://github.com/hslatman/awesome-industrial-control-system-security) — curated list of resources related to Industrial Control System (ICS) security.
- [ICS Security Tools](https://github.com/ITI/ICS-Security-Tools) — tools, tips, tricks, and more for exploring ICS Security.
- [ICS/SCADA security collection](http://www.robertmlee.org/a-collection-of-resources-for-getting-started-in-icsscada-cybersecurity/) — a collection of resources for geting started in ICS/SCADA cybersecurity.
- [OWASP IoT](https://owasp.org/www-project-internet-of-things/#tab=Firmware_Analysis) — better understand the security issues associated with the Internet of Things.
- [Lytro Unlock - Making a bad camera slightly better](https://github.com/ea/lytro_unlock)

**🧪 writeup**

- [CatSniffer](https://github.com/ElectronicCats/CatSniffer) — multiprotocol and multiband board for sniffing, communicating, and attacking IoT (Internet of Things) devices


### `cryptography` — Cryptographie

Peu d'entrées, mais deux références majeures (cryptopals, Practical Cryptography for Developers).

*44 exercices dans l'app · 6 ressources ici*

**📘 cours/tuto**

- [Introduction to encryption for embedded Linux — Introduction to encryption for embedded Linux developers](https://sergioprado.blog/introduction-to-encryption-for-embedded-linux-developers/)
- [Introduction to encryption for embedded Linux — A hands-on approach to symmetric-key encryption](https://sergioprado.blog/a-hands-on-approach-to-symmetric-key-encryption/)
- [Introduction to encryption for embedded Linux — Asymmetric-Key Encryption and Digital Signatures in Practice](https://sergioprado.blog/asymmetric-key-encryption-and-digital-signatures-in-practice/)

**🔗 référence**

- [cryptopals](https://cryptopals.com)
- [Illustrated Connections — tls 1.2](https://tls12.xargs.org)
- [Illustrated Connections — tls 1.3](https://tls13.xargs.org)


### `languages` — Langages & compilation

Rust (atomics, locks), compilateurs. Marginal : `languages` compte déjà 45 exercices.

*45 exercices dans l'app · 11 ressources ici*

**🔗 référence**

- [clang](https://clang.llvm.org/) — C language family frontend for LLVM.
- [gcc](https://gcc.gnu.org/) — GNU Compiler Collection.
- [Rust](https://github.com/Rust-for-Linux/linux) — rust tree
- [RFL-patch-registry](https://github.com/tgross35/RFL-patch-registry) — aggregate Rust abstractions for Linux that have not yet been upstreamed.
- [Rust for Linux mailing list](https://lore.kernel.org/rust-for-linux/) — rust for Linux mailing list
- [Comprehensive Rust](https://google.github.io/comprehensive-rust/)
- [Minimizing Rust Binary Size](https://github.com/johnthagen/min-sized-rust)
- [Rust Atomics and Locks](https://marabos.nl/atomics/)

**🛠 outil**

- [netscanner](https://github.com/Chleba/netscanner) — network scanner implemented in rust
- [Houdini](https://github.com/yamakadi/houdini) — rust library that allows you to delete your executable while it's running.
- [Intruducer](https://github.com/vfsfitvnm/intruducer) — Rust crate to load a shared library into a Linux process without using ptrace.


### `testing` — Tests & qualité

Une seule entrée vraiment utile : le Testing Handbook de Trail of Bits.

*45 exercices dans l'app · 5 ressources ici*

**📘 cours/tuto**

- [Trail of Bits Testing Handbook](https://appsec.guide)

**🔗 référence**

- [Standards — OSSTMM](https://www.isecom.org/research.html#content5-9d) — Open Source Security Testing Methodology Manual.
- [Standards — PTES](http://www.pentest-standard.org/index.php/Main_Page) — Penetration Testing Methodologies and Standards.
- [Standards — STG](https://owasp.org/www-project-web-security-testing-guide/latest/3-The_OWASP_Testing_Framework/1-Penetration_Testing_Methodologies) — OWASP testing methodologies.

**🛠 outil**

- [Metasploit Framework](https://github.com/rapid7/metasploit-framework) — penetration testing framework.


### `appsec` — AppSec

Quasi absent de cette liste — orientée binaire, pas web. `appsec` est déjà le topic le mieux fourni de l'app (183).

*183 exercices dans l'app · 3 ressources ici*

**🔗 référence**

- [WiFiDuck](https://github.com/SpacehuhnTech/WiFiDuck) — Wireless keystroke injection attack platform
- [Remote/Reverse Shells — rtty](https://www.graplsecurity.com/blog) — access your terminal from anywhere via the web.

**🧪 writeup**

- [PayloadAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings) — list of useful payloads and bypass for Web Application Security and Pentest/CTF.


---

## Plan d'action proposé

Par ordre de rentabilité (effort de production / valeur pour le catalogue).

### 1. `exercises-memory-heap.ts` — ✅ **LIVRÉ** (53 exercices)

> Fait le 2026-09-06 : `src/data/exercises-memory-heap.ts`,
> branché dans `index.ts`. 53 exercices (43 QCM + 10 find-error), tous avec
> `optionNotes`. `memory-safety` passe de 36 à 89 exercices. Bundle +69 Ko.
> Le détail de plan ci-dessous documente ce qui a été produit.


`memory-safety` compte 36 exercices, mais **6 seulement touchent le tas**
(`mem-uaf-free`, `mem-double-free`, `mem-int-mul`, `mem-null-deref`,
`mem-realloc-leak`, `mem-q-stack-vs-heap`) et aucun ne descend dans
l'allocateur. Face à cela : 91 ressources ici, dont 33 cours structurés.
C'est le sous-domaine le plus mal couvert du catalogue.

Plan de lot :

| Bloc | Exos | Sources principales |
|---|---:|---|
| Anatomie du tas glibc (chunk, taille, flags PREV_INUSE) | 10 | Overview of Malloc (glibc wiki), Understanding glibc malloc |
| Les bins : fast, tcache, small, large, unsorted | 12 | Azeria Labs parties 1-2, Heap Exploitation (dhavalkapil) |
| UAF, double-free, off-by-one / poison null byte | 12 | how2heap, toddler's introduction parties 3-4 |
| Primitives : unsafe unlink, fastbin dup, House of * | 12 | how2heap, House of Husk / Mind / Lore |
| Durcissements : safe-linking, tcache key, Scudo, jemalloc | 8 | Malloc Protections on Singly Linked Lists, Behind the Shield |
| Allocateurs noyau : SLUB/SLAB, cross-cache | 6 | Linux SLUB Allocator Internals (Oracle, 4 parties) |

Format : majoritairement `find-error` sur du C — c'est exactement ce que le
catalogue a le moins (407 `find-error` sur 1674) et ce que le sujet
permet le mieux. `company` = la source, comme les lots générés existants.

### 2. Chapitre bibliothèque `40_RESSOURCES.md` — **priorité haute, coût faible**

~60 liens triés et commentés en français, par sujet, incluant la section
« où s'entraîner pour de vrai » (pwn.college, ropemporium, pwnable.kr/tw,
exploit.education, OverTheWire, how2heap). L'app n'a aucun volet hands-on ;
une bibliographie assume d'être une bibliographie. Poids : ~20 Ko.

### 3. Topic `linux-kernel` — **gros morceau, à arbitrer**

181 ressources, dont 39 cours, pour un topic **inexistant** dans l'app.
Demande : une entrée dans `Topic` (`src/engine/types.ts`), un cours
`courses/linux-kernel.md`, un lot d'exercices. Découpage naturel :
internals (Linux Insides, Bootlin, kernel map) · syscalls & modules ·
SLUB & mémoire noyau · privesc & mitigations (kconfig-hardened-check,
FGKASLR) · fuzzing (syzkaller) · rootkits & eBPF · Rust for Linux.

### 4. `networking` — **le plus gros volume, la pertinence la plus discutable**

199 ressources pour 8 exercices, mais l'essentiel est du 802.11/BLE/SDR très
spécialisé (DragonBlood, FragAttacks, KRACK). À trancher : soit on assume un
virage « sécurité radio », soit on ne prend que le noyau pédagogique — les
Illustrated Connections (TLS 1.2/1.3, QUIC, DTLS) et les attaques canoniques
WPA2/WPA3, soit ~15 exercices.

### Ce que je ne ferais pas

- **Les 1 250 writeups chronologiques** : voir la méthode plus haut.
- **La sous-liste red team** (133 entrées : C2, évasion, backdoors) : l'app
  entraîne à construire et défendre, pas à opérer une intrusion. `agent-security`
  et `secure-review` couvrent déjà l'angle défensif.
- **`ot_security.md`** : 70 entrées dont 64 sont des annuaires de vendeurs.
  Les 6 restantes ne justifient pas un lot à elles seules.
