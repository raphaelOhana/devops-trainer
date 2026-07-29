===LESSON===
KEY: problem-solving
TOPIC: problem-solving
TITLE: Décortiquer un problème
ICON: 🧭
INTRO: La plupart des échecs logiciels ne viennent pas d'un mauvais code, mais d'un mauvais problème résolu. On code la spec décrite au lieu de la réalité ; on suit les critères qu'un client affirme au lieu de regarder les vraies données ; on traite les cas particuliers au lieu de trouver l'invariant qui les relie tous. Ce cours est une méthode pour aller à la racine d'un problème, trouver le dénominateur commun, valider avant de coder, et construire une solution robuste — celle qui tient face aux données sales du monde réel.
---SECTION---
HEADING: Le vrai travail : définir le problème
BODY:
« Un problème bien posé est à moitié résolu. » La majorité du temps d'ingénierie devrait aller à **comprendre**, pas à taper du code.

Le piège classique : on te *décrit* une solution (« il faut trier ces documents selon les critères A, B, C, D ») et tu te mets à coder cette description. Mais une description n'est pas le problème — c'est **l'hypothèse d'une personne** sur le problème.

Reformule toujours en termes de **but** et de **réalité observable**, pas de recette :
- Mauvais cadrage : « classer selon A, B, C, D » (une méthode, potentiellement fausse).
- Bon cadrage : « à la fin, chaque document doit atterrir dans le bon bac ; qu'est-ce qui, **dans les documents eux-mêmes**, détermine le bac ? »

Le second cadrage t'oblige à regarder les données. Le premier te fait coder les croyances de quelqu'un.
---SECTION---
HEADING: Symptôme vs cause racine
BODY:
Un **symptôme** est ce qui fait mal ; la **cause racine** est ce qui le produit. Corriger un symptôme, c'est déplacer le problème.

Technique des **5 pourquoi** : remonte la chaîne causale.
- « L'algo classe mal ce document. » — Pourquoi ?
- « Parce qu'il n'a pas le critère B. » — Pourquoi je m'attends à B ?
- « Parce que le client a dit que ce type a toujours B. » — Est-ce vrai dans les données ?
- « … non, 30 % ne l'ont pas. » → **La racine n'est pas le code, c'est l'hypothèse « ce type a toujours B ».**

Signe que tu traites un symptôme : tu ajoutes des `if` spéciaux, des exceptions, des rustines pour des cas qui « ne rentrent pas ». Chaque rustine est un indice que ton modèle du problème est faux.
---SECTION---
HEADING: L'invariant : le dénominateur commun
BODY:
Un **invariant** est quelque chose de vrai pour **tous** les cas, y compris les sales, les partiels, les futurs. C'est le socle sur lequel bâtir.

Face à un ensemble hétérogène (des documents tous différents), la bonne question n'est pas « quelles sont les catégories ? » mais :

> **Qu'est-ce qui est vrai de TOUS ces éléments, sans exception ?**

Exemple des documents de taxe : les critères A/B/C/D varient, sont partiels, absents. Mais peut-être que **chaque** document contient un **identifiant fiscal**, ou une **année**, ou un **type déclaré en en-tête**. Si un seul champ est présent partout et permet de relier/classer, **c'est lui le dénominateur commun**. Tu construis dessus, et les variations de A/B/C/D deviennent secondaires.

Chercher l'invariant transforme un problème « à mille cas particuliers » en un problème « à une règle solide + quelques exceptions bornées ».
---SECTION---
HEADING: Regarde les vraies données, pas leur description
BODY:
La règle d'or : **les données ont toujours raison contre les affirmations.**

Un expert métier, même de bonne foi, te décrit un **modèle idéalisé** de ses données — ce qu'elles *devraient* être, pas ce qu'elles sont. Les vraies données sont sales : champs manquants, formats mélangés, doublons, cas hérités que personne ne se rappelle.

Avant de coder une seule règle :
- **Échantillonne** un vrai jeu de données représentatif (pas 2 exemples choisis — un lot au hasard).
- **Compte** : sur 200 documents, combien ont A ? combien A **et** B ? combien n'ont **rien** ?
- **Cherche les contre-exemples** activement : « montrez-moi un document qui ne rentre dans aucune catégorie. »

Ce simple comptage aurait révélé, dès le jour 1, que « ce type a toujours B » était faux — avant d'écrire l'algorithme.
---SECTION---
HEADING: Valider les hypothèses avant de construire
BODY:
Chaque « toujours », « jamais », « il n'y a que » d'un client est une **hypothèse à tester**, pas un fait.

Rends tes hypothèses **explicites et écrites** :
- « J'ai compris qu'il n'existe que 2 types de documents. Vrai ou faux ? »
- « Je suppose que tout document de type 1 contient le champ B. Voici 5 contre-exemples trouvés dans vos données. »

Un contre-exemple concret vaut mille débats. Il déplace la conversation de « le développeur n'a pas bien fait » vers « ah, ce cas existe aussi, il faut décider quoi en faire ».

Le coût d'une hypothèse fausse **explose** avec le temps : trivial à corriger avant de coder, coûteux après la livraison, parfois fatal en production. Valide tôt, valide par les données, garde une trace écrite.
---SECTION---
HEADING: Choisir la bonne représentation
BODY:
« Choisis la bonne représentation et le problème devient trivial. » Beaucoup de problèmes difficiles ne le sont que parce qu'on les regarde sous le mauvais angle.

- Trier des intervalles ? **Trie d'abord**, la logique s'effondre en une passe.
- Relier des entités éparses ? Réduis chacune à une **clé commune** (l'invariant) et le regroupement devient un simple `group by`.
- Un labyrinthe de règles métier ? Souvent une **table de décision** (données) remplace cent `if` (code).

Avant de coder l'algorithme, demande : « existe-t-il une forme des données où ce problème est presque déjà résolu ? » Extraire d'abord l'invariant, **normaliser** vers cette forme, puis résoudre le problème simple.
---SECTION---
HEADING: Réduire à un problème déjà résolu
BODY:
Les bons ingénieurs ne résolvent pas des problèmes neufs : ils **ramènent** un problème inconnu à un problème connu.

Demande-toi : « à quoi ce problème ressemble-t-il ? »
- Classer des documents hétérogènes → un problème de **normalisation puis de classification** (extraire des features communes, puis décider).
- Relier des enregistrements dispersés → un problème de **clé de jointure / déduplication**.
- Des règles qui changent souvent → un problème de **moteur de règles piloté par la donnée**, pas de code en dur.

Une fois le problème rangé dans une catégorie connue, tu hérites de décennies de solutions éprouvées au lieu d'improviser une usine à `if`.
---SECTION---
HEADING: Le cœur fiable d'abord, les cas particuliers ensuite
BODY:
Ne commence pas par les cas tordus. Commence par le **cœur** : la règle qui couvre la majorité des cas **de façon sûre**, bâtie sur l'invariant.

Stratégie robuste face à des données sales :
1. **Classe ce que tu peux classer avec certitude** grâce au dénominateur commun.
2. **Isole explicitement l'incertain** dans un bac « à vérifier » plutôt que de deviner.
3. Ne **jamais** deviner silencieusement : une mauvaise classification silencieuse est pire qu'un « je ne sais pas » visible.

Un système qui traite 80 % automatiquement et **signale** les 20 % ambigus est infiniment plus sûr — et plus honnête vis-à-vis du client — qu'un système qui prétend traiter 100 % mais se trompe sur 20 % sans le dire.
---SECTION---
HEADING: Rendre l'échec visible (fail loud)
BODY:
La pire issue n'est pas l'erreur : c'est l'erreur **silencieuse**. Un algorithme qui range mal un document sans rien dire crée une dette invisible qui explose plus tard.

Conçois pour que l'inattendu **crie** :
- Un document qui ne matche **aucune** règle ne doit pas tomber dans un bac par défaut au hasard → il doit lever un signal (« non classé », file d'attente humaine).
- Compte et expose les cas ambigus : « 43 documents n'ont pas pu être classés avec certitude. »

Cela transforme aussi la relation client : au lieu de « ton algo est faux », tu apportes « voici les 43 documents que vos règles ne couvrent pas — quelle est la décision métier ? ». Le problème redevient partagé et factuel.
---SECTION---
HEADING: Interviewer l'expert métier
BODY:
Tu n'es pas expert du domaine — c'est normal, et ce n'est pas une excuse pour coder à l'aveugle. Ton rôle est d'**extraire le vrai modèle** de la tête de l'expert, ce qui demande une technique.

- Demande des **exemples réels**, pas des règles abstraites : « montrez-moi 10 documents et dites-moi le bac de chacun **et pourquoi**. »
- Cherche les **frontières** : « qu'est-ce qui distingue ce document limite de celui-là ? »
- Provoque les **contre-exemples** : « existe-t-il un document sans aucun de ces critères ? Que faites-vous alors, à la main ? »
- Reformule et fais **confirmer par écrit** : « donc la règle est X ; est-ce exact ? »

L'expert connaît la réponse **implicitement** (il classe à la main sans effort). Ton travail est de rendre cette connaissance **explicite et vérifiable** — souvent l'expert lui-même découvre ses propres exceptions en faisant l'exercice.
---SECTION---
HEADING: La méthode, en résumé
BODY:
Une checklist à dérouler avant d'écrire une ligne de code sur un problème flou :

### Comprendre
- Reformuler le **but** (l'état final voulu), pas la méthode décrite.
- Séparer symptôme et **cause racine** (5 pourquoi).

### Observer
- **Échantillonner** les vraies données ; compter la présence de chaque critère.
- Chercher activement les **contre-exemples**.

### Modéliser
- Trouver l'**invariant** / dénominateur commun présent partout.
- Choisir la **représentation** qui rend le problème trivial ; réduire à un problème connu.

### Valider
- Rendre les **hypothèses** explicites et les faire confirmer (par écrit, par contre-exemples).

### Construire
- **Cœur fiable** d'abord (l'invariant), cas particuliers **isolés** ensuite.
- **Échec visible** : jamais de mauvaise classification silencieuse ; signaler l'ambigu.

La règle qui résume tout : **construis sur ce qui est vrai de tous les cas, pas sur ce qu'on t'a dit de certains.**
===END===
