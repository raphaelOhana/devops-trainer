===LESSON===
KEY: testing
TOPIC: testing
TITLE: Tests & qualité
ICON: 🧪
INTRO: Un test n'est pas une corvée administrative que l'on ajoute après coup pour rassurer un chef de projet : c'est l'outil qui vous rend libre de modifier votre code sans peur, qui capture votre intention sous forme exécutable et qui transforme un tas de code fragile en un système dans lequel vous avez confiance — ce cours vous apprend à écrire des tests qui vous aident au lieu de vous ralentir.
---SECTION---
HEADING: Pourquoi tester, vraiment
BODY:
Beaucoup de développeurs pensent que les tests servent à « trouver des bugs ». C'est une vision incomplète et même trompeuse. Un test qui passe ne prouve pas l'absence de bugs — il prouve seulement que le cas précis que vous avez imaginé fonctionne. Comme le disait Dijkstra : « tester peut démontrer la présence de bugs, jamais leur absence ».

La vraie raison d'écrire des tests, celle que défend Vladimir Khorikov dans *Unit Testing Principles*, est **la croissance durable du projet**. Sans tests, tout logiciel finit par ralentir : chaque nouvelle fonctionnalité risque d'en casser une ancienne, et la peur de casser paralyse. Le graphe typique montre deux courbes — avec tests, la vélocité reste soutenable ; sans tests, elle s'effondre après quelques mois.

### Les tests apportent concrètement

- **Un filet de sécurité** : vous pouvez refactorer, mettre à jour une dépendance, réécrire un module — si les tests passent, le comportement est préservé.
- **Une documentation exécutable** : un bon test décrit *ce que le code est censé faire*, et cette documentation ne ment jamais car elle est vérifiée à chaque exécution.
- **Une pression sur la conception** : du code difficile à tester est presque toujours du code mal conçu (couplage fort, responsabilités mélangées). Le test agit comme un premier « client » de votre code.

### Ce que les tests ne sont pas

Un test n'a pas de valeur intrinsèque. Un projet peut avoir 2000 tests et être ingérable si ces tests sont fragiles, lents ou testent la mauvaise chose. **La quantité de tests n'est pas un objectif** — ce qui compte, c'est le rapport entre la valeur qu'ils apportent (protection contre les régressions, résistance au refactoring) et leur coût (maintenance, lenteur, faux positifs).
---SECTION---
HEADING: La pyramide des tests
BODY:
La **pyramide des tests**, popularisée par Mike Cohn, est un modèle qui répond à une question : combien de tests de chaque type devrais-je avoir ? Elle distingue trois grandes couches.

### Les trois couches

- **Tests unitaires** (base large) : ils vérifient une petite unité de logique (une classe, une fonction) en isolation. Ils sont nombreux, rapides (millisecondes), et pointent précisément la cause d'un échec.
- **Tests d'intégration** (milieu) : ils vérifient que votre code collabore correctement avec ses dépendances — base de données, système de fichiers, file de messages, autres modules. Moins nombreux, plus lents.
- **Tests end-to-end / E2E** (sommet étroit) : ils exercent le système entier du point de vue de l'utilisateur, à travers l'interface réelle. Peu nombreux, très lents, mais très proches de la réalité.

```
        /\
       /E2E\        peu, lents, réalistes
      /------\
     /  Intég. \    moyennement
    /------------\
   /  Unitaires   \ nombreux, rapides, précis
  /----------------\
```

### Pourquoi cette forme

Plus on monte, plus un test est **réaliste** (il ressemble à ce que vit l'utilisateur), mais plus il est **lent, coûteux et imprécis** en cas d'échec. Un test E2E rouge vous dit « quelque chose est cassé quelque part » ; un test unitaire rouge vous dit « la méthode `calculerRemise` renvoie un mauvais résultat ligne 42 ». La pyramide cherche l'équilibre : beaucoup de tests rapides pour le feedback quotidien, quelques tests lents pour vérifier que le tout tient ensemble.
---SECTION---
HEADING: L'anti-pattern du cornet de glace
BODY:
Quand on inverse la pyramide, on obtient le **cornet de glace** (*ice cream cone*) : peu ou pas de tests unitaires, quelques tests d'intégration, et une masse de tests E2E et de tests manuels au sommet. C'est l'un des anti-patterns les plus coûteux de l'industrie.

### Pourquoi c'est un piège

- **Lenteur** : une suite E2E peut prendre des heures. Le feedback arrive trop tard, on ne l'exécute plus à chaque changement, il perd son intérêt.
- **Fragilité** : les tests E2E dépendent de tout (réseau, base, timing, UI). Ils échouent pour des raisons sans rapport avec un vrai bug — ce sont des tests *flaky* par nature.
- **Diagnostic difficile** : quand un test E2E échoue, localiser la cause peut prendre des heures.
- **Coût de maintenance** : le moindre changement d'interface casse des dizaines de tests.

### Comment on y tombe

Souvent par accident : l'équipe n'a pas pris l'habitude d'écrire des tests unitaires, mais la QA a construit une grosse suite de tests d'interface. Ça « marche » au début, puis la suite devient si lente et instable qu'on finit par la désactiver — et on revient aux tests manuels. La solution n'est pas de supprimer les tests E2E, mais de **déplacer la logique testable vers le bas de la pyramide**, là où elle peut être vérifiée vite et précisément.

### Nuance : le trophée des tests

Pour certaines applications (notamment côté front-end et micro-services), Kent C. Dodds propose le **testing trophy**, qui met l'accent sur les tests d'intégration. L'idée n'est pas de contredire la pyramide mais de rappeler que la couche optimale dépend du contexte : ce qui compte est de tester au niveau où le rapport confiance/coût est le meilleur pour *votre* système.
---SECTION---
HEADING: TDD : le cycle red-green-refactor
BODY:
Le **Test-Driven Development** (TDD), formalisé par Kent Beck dans *Test-Driven Development: By Example*, renverse l'ordre habituel : on écrit le test **avant** le code de production. Le cycle tient en trois temps, souvent résumés par des couleurs.

### Les trois étapes

1. **Red** — Écrivez un test pour un comportement qui n'existe pas encore. Il échoue (rouge). Ce test décrit ce que vous *voulez* obtenir.
2. **Green** — Écrivez le minimum de code pour faire passer le test, même si c'est « sale ». L'objectif est la barre verte, le plus vite possible — quitte à écrire en dur `return 42;`.
3. **Refactor** — Maintenant que le test protège le comportement, nettoyez le code : éliminez la duplication, améliorez les noms, clarifiez la structure. Les tests restent verts.

```
   ┌──────────┐
   │   RED    │  écrire un test qui échoue
   └────┬─────┘
        ▼
   ┌──────────┐
   │  GREEN   │  le faire passer vite
   └────┬─────┘
        ▼
   ┌──────────┐
   │ REFACTOR │  nettoyer sans casser
   └────┬─────┘
        └──► on recommence
```

### Pourquoi écrire le test d'abord

- Cela vous force à **définir le résultat attendu avant de vous perdre dans l'implémentation**. Vous concevez depuis l'usage, pas depuis la mécanique interne.
- Cela garantit que chaque ligne de code de production existe pour une raison — elle a été demandée par un test.
- Beck insiste sur les « petits pas » (*baby steps*) : quand on doute, on réduit la taille du pas. Le refactoring devient sûr car chaque micro-changement est immédiatement validé.

### Ce que le TDD n'est pas

Le TDD n'est pas une religion : ce n'est pas « toujours, partout, sans exception ». C'est une discipline de conception. Beaucoup de développeurs expérimentés l'utilisent sur la logique métier complexe et le lâchent sur le code trivial. L'essentiel est d'en comprendre le moteur : **le test guide la conception**.
---SECTION---
HEADING: Ce qui fait un bon test : les principes FIRST
BODY:
Un test peut faire techniquement son travail et rester un mauvais test. L'acronyme **FIRST** (popularisé dans la mouvance Clean Code) résume cinq qualités d'un bon test unitaire. Roy Osherove, dans *The Art of Unit Testing*, développe les mêmes idées.

### F.I.R.S.T.

- **Fast (rapide)** — Un test unitaire doit s'exécuter en millisecondes. Une suite de milliers de tests doit tourner en secondes. Pourquoi ? Parce qu'un test lent n'est plus lancé — et un test qu'on ne lance pas ne protège rien.
- **Isolated / Independent (isolé)** — Chaque test doit pouvoir s'exécuter seul, dans n'importe quel ordre, sans dépendre d'un autre. Un test qui suppose qu'un test précédent a « préparé le terrain » crée un couplage caché et des échecs mystérieux.
- **Repeatable (répétable)** — Le test donne le même résultat à chaque exécution, sur n'importe quelle machine, quel que soit l'environnement. Pas de dépendance à la date du jour, au fuseau horaire, à une base partagée.
- **Self-validating (auto-vérifiant)** — Le test dit lui-même s'il passe ou échoue, par une assertion claire. Pas d'inspection manuelle d'un log, pas de « regardez si la sortie ressemble à ça ».
- **Timely (opportun)** — Écrit au bon moment, idéalement juste avant (TDD) ou juste après le code, tant que le contexte est frais.

### Le lien avec le déterminisme

Ces cinq qualités convergent vers une idée : **un test doit avoir exactement deux issues possibles, vert ou rouge, et toujours pour la même raison**. Dès qu'un test peut échouer aléatoirement (dépendance au temps, à l'ordre, à un service externe), il perd sa valeur de signal. On y revient dans la section sur les tests fragiles.
---SECTION---
HEADING: Le pattern AAA / Given-When-Then
BODY:
Un test lisible suit une structure en trois temps. Deux vocabulaires coexistent pour la même idée : **Arrange-Act-Assert** (AAA), courant dans le monde du test unitaire, et **Given-When-Then** (GWT), issu du BDD (*Behaviour-Driven Development*).

### Les trois phases

- **Arrange / Given** — Préparez le contexte : créez les objets, configurez les données, mettez le système dans l'état de départ.
- **Act / When** — Déclenchez le comportement que vous testez : appelez la méthode, envoyez l'événement. **Une seule action.**
- **Assert / Then** — Vérifiez le résultat : l'état a-t-il changé comme prévu ? La bonne valeur est-elle renvoyée ?

### Exemple concret

```javascript
test('applique une remise de 10% aux commandes VIP', () => {
  // Arrange
  const client = new Client({ statut: 'VIP' });
  const commande = new Commande({ montant: 100 });

  // Act
  const total = calculerTotal(commande, client);

  // Assert
  expect(total).toBe(90);
});
```

### Pourquoi cette structure

- **Lisibilité** : n'importe qui repère en un coup d'œil le contexte, l'action et l'attendu. Le test devient une petite histoire.
- **Discipline** : si votre phase *Act* comporte plusieurs actions, c'est souvent le signe que vous testez plusieurs choses à la fois — divisez.
- **Un seul concept par test** : la règle n'est pas « une seule assertion » (plusieurs assertions peuvent vérifier un même comportement) mais **un seul comportement testé**. Un test qui vérifie « la remise ET l'envoi de l'email ET la mise à jour du stock » sera difficile à nommer et à diagnostiquer.

### Nommer le test

Un bon nom décrit le scénario et l'attendu, pas la méthode appelée. Préférez `applique_une_remise_de_10pourcent_aux_clients_VIP` à `testCalculerTotal`. Osherove recommande un schéma en trois parties : *unité testée — scénario — comportement attendu*.
---SECTION---
HEADING: Les doublures de test : dummy, stub, mock, spy, fake
BODY:
Pour tester une unité en isolation, il faut souvent remplacer ses dépendances réelles (base de données, service HTTP, horloge) par des **doublures de test** (*test doubles*, terme de Gerard Meszaros). Le mot « mock » est souvent employé à tort pour désigner n'importe laquelle. Voici la taxonomie précise.

### Les cinq types

- **Dummy** — Un objet passé mais jamais utilisé, juste pour remplir une signature. Exemple : un `null` ou un objet vide donné à un constructeur qui l'exige mais ne s'en sert pas dans ce test.
- **Stub** — Fournit des réponses prédéfinies aux appels. Il *remplace une entrée* : « quand on te demande le taux de change, réponds 1,1 ». On ne vérifie jamais un stub, on s'en sert pour piloter le chemin d'exécution.
- **Spy** — Un stub qui, en plus, **enregistre** comment il a été appelé (arguments, nombre d'appels). On l'inspecte après coup.
- **Mock** — Une doublure programmée avec des **attentes** : « je m'attends à ce que `envoyerEmail` soit appelé une fois avec cette adresse ». Le mock *vérifie une interaction sortante*. Si l'attente n'est pas satisfaite, le test échoue.
- **Fake** — Une implémentation réelle mais simplifiée : une base de données en mémoire remplaçant Postgres, un faux dépôt qui stocke dans une liste. Elle a une vraie logique, mais raccourcie pour les tests.

### La distinction cruciale de Khorikov : mock vs stub

Khorikov insiste sur une frontière essentielle :

- Un **stub** remplace une **dépendance entrante** (une donnée que votre code *lit*). **Ne vérifiez jamais un stub** — vérifier qu'on a bien lu une valeur revient à tester l'implémentation.
- Un **mock** vérifie une **dépendance sortante** (un effet que votre code *provoque* sur le monde extérieur : envoyer un email, publier un message). Vérifier cette interaction a du sens car c'est un comportement observable du système.

```javascript
// STUB : pilote une entrée, on ne le vérifie pas
const tauxStub = { obtenir: () => 1.1 };

// MOCK : vérifie une sortie observable
const emailMock = { envoyer: jest.fn() };
notifier(client, emailMock);
expect(emailMock.envoyer).toHaveBeenCalledWith('client@x.com'); // interaction sortante
```

### Quand les utiliser

La règle de Khorikov : **n'utilisez des mocks que pour les interactions avec des dépendances externes qui sont visibles hors du système** (envoi d'email, appel d'API tierce). Pour les collaborations internes entre vos propres objets, préférez tester l'état final plutôt que les interactions — sinon vos tests se couplent à l'implémentation.
---SECTION---
HEADING: Tester le comportement, pas l'implémentation
BODY:
C'est probablement l'idée la plus importante — et la plus mal comprise — de tout le domaine. Un test doit vérifier **ce que fait le code** (son comportement observable), pas **comment il le fait** (sa mécanique interne).

### La différence en pratique

Imaginez une classe `Panier` avec une méthode `ajouter(article)`. 

- **Tester le comportement** : après avoir ajouté deux articles à 30 €, `panier.total()` vaut 60. Peu importe si en interne c'est stocké dans un tableau, une `Map` ou calculé à la volée.
- **Tester l'implémentation** : vérifier que `ajouter` appelle bien `this._items.push()` en interne. Si demain vous remplacez le tableau par une `Map`, ce test casse alors que le comportement n'a pas changé.

### Pourquoi c'est capital

Un test couplé à l'implémentation transforme le refactoring en cauchemar : vous changez la structure interne, tout est encore correct pour l'utilisateur, mais **des dizaines de tests virent au rouge**. Vous perdez alors la principale valeur des tests — la liberté de refactorer. Khorikov le formule ainsi : un bon test doit **résister au refactoring**, c'est-à-dire ne pas produire de faux positifs quand on réorganise le code sans changer son comportement.

### Le test comme utilisateur de votre code

Freeman & Pryce, dans *Growing Object-Oriented Software*, poussent l'idée plus loin : écrire le test en premier vous force à concevoir votre objet **du point de vue de celui qui l'utilise**. Vous vous demandez « quelle interface est agréable à appeler ? » avant « comment je l'implémente ? ». Le test devient un outil de conception orientée usage, pas seulement de vérification.

### Le piège des mocks excessifs

Trop de mocks est le symptôme classique du test d'implémentation. Si votre test dit « la méthode A appelle B qui appelle C avec tel argument », il décrit un *algorithme interne*, pas un comportement. Le jour où vous simplifiez cet algorithme, le test se plaint sans qu'aucun bug n'existe. Réservez les mocks aux frontières du système (section précédente).
---SECTION---
HEADING: La couverture de code et ses illusions
BODY:
La **couverture de code** (*code coverage*) mesure le pourcentage de code exécuté pendant les tests. C'est une métrique utile mais dangereusement trompeuse quand on en fait un objectif.

### Les types de couverture

- **Couverture de lignes** : quel pourcentage de lignes a été exécuté.
- **Couverture de branches** : chaque embranchement (`if`/`else`, `switch`) a-t-il été emprunté dans les deux sens ? Plus exigeante et plus significative que la couverture de lignes.
- **Couverture de conditions** : chaque sous-condition booléenne a-t-elle pris les valeurs vrai et faux ?

### L'illusion fondamentale

Une couverture élevée prouve que le code **a été exécuté**, pas qu'il **a été vérifié**. Ce test atteint 100 % de couverture sans rien tester :

```javascript
test('couverture bidon', () => {
  calculerTotal(commande, client); // exécuté... mais aucune assertion !
});
```

Le code est parcouru, la ligne compte comme « couverte », et pourtant si `calculerTotal` renvoie n'importe quoi, le test passe. **La couverture mesure l'exécution, jamais la pertinence des assertions.**

### Pourquoi en faire un objectif est nocif

Khorikov est catégorique : la couverture est un **mauvais objectif mais un bon indicateur négatif**. 

- Une couverture *faible* (disons 10 %) est un signal fiable qu'il manque des tests.
- Une couverture *élevée* (95 %) ne garantit rien sur la qualité — on peut atteindre 100 % avec des tests inutiles.
- Imposer « 100 % de couverture » comme règle pousse les développeurs à écrire des tests sans assertions, ou à tester du code trivial (*getters*), juste pour gonfler le chiffre. La métrique devient une cible et cesse d'être une mesure honnête (loi de Goodhart).

### Bon usage

Servez-vous de la couverture pour **repérer les zones oubliées** (« tiens, cette branche de gestion d'erreur n'est jamais testée »), pas comme un score à maximiser. Une branche non couverte est une question à se poser, pas forcément un test à écrire.
---SECTION---
HEADING: Les tests fragiles (flaky) et leurs causes
BODY:
Un test **flaky** (fragile, instable) est un test qui passe puis échoue **sans qu'aucun code n'ait changé**. C'est l'un des maux les plus corrosifs d'une suite de tests, car il détruit la confiance : quand un rouge peut être « juste un flaky », l'équipe finit par ignorer *tous* les rouges — y compris les vrais bugs.

### Les causes classiques

- **Le temps et les dates** : `new Date()`, des `sleep`, des timeouts. Un test qui suppose qu'une opération prend « moins de 100 ms » échouera un jour où la machine est chargée.
- **L'aléa** : un `Math.random()` non contrôlé qui fait parfois tomber le test dans un cas limite.
- **L'ordre d'exécution** : des tests qui partagent un état (variable globale, base de données) et supposent un ordre. En les mélangeant, tout casse.
- **La concurrence** : des conditions de course entre threads, des promesses non attendues (`await` oublié).
- **Les dépendances externes** : réseau, service tiers, système de fichiers — tout ce qui peut être temporairement indisponible ou lent.
- **L'ordre des collections** : itérer sur un ensemble non ordonné (`Set`, `HashMap`) et supposer un ordre stable.

### Pourquoi c'est si grave

Un seul test flaky dans une suite de mille sabote l'ensemble : la CI devient rouge « au hasard », on relance « pour voir », on prend l'habitude de re-run. La suite entière perd sa valeur de signal binaire. **Un test flaky est pire qu'aucun test** car il coûte du temps sans apporter de certitude.

### Comment les combattre

- **Injectez le temps et l'aléa** au lieu de les appeler directement (voir la section sur le code pur/impur) : passez une horloge et un générateur en paramètre pour pouvoir les figer.
- **Isolez l'état** : chaque test crée et détruit ses propres données.
- **Éliminez les `sleep`** : attendez une condition explicite plutôt qu'une durée arbitraire.
- **Traitez tout flaky comme un bug prioritaire** : quarantaine puis correction, jamais « on relance et ça passe ».
---SECTION---
HEADING: Les test smells
BODY:
Comme le code de production, le code de test peut « sentir mauvais ». Un **test smell** est un symptôme, pas forcément une faute, mais un signal qu'il faut regarder de plus près. Le code de test mérite le même soin que le code de production — c'est lui qui vous protège.

### Les odeurs les plus courantes

- **Logique dans le test** : des `if`, des boucles, des calculs dans le test. Le test devient à son tour du code à débuguer — qui teste le test ? Un test doit être bête et linéaire.
- **Test fragile (over-specified)** : il vérifie trop de détails d'implémentation (voir plus haut). Il casse au moindre refactoring.
- **Assertion faible ou absente** : le test s'exécute mais ne vérifie rien de significatif, ou fait `expect(resultat).toBeDefined()` là où il faudrait vérifier la valeur exacte.
- **Test obscur (mystery guest)** : le test dépend de données externes cachées (un fichier, une entrée en base) qu'on ne voit pas dans le test. On ne comprend pas d'où vient le résultat.
- **Duplication massive** : le même *setup* copié dans cent tests. Un changement de constructeur oblige à modifier cent tests. Extrayez des *factory methods* et des *builders*.
- **Nom trompeur** : `test1`, `testItWorks`. Le nom doit raconter le scénario.
- **Test lent caché parmi les unitaires** : un test qui touche la vraie base et ralentit toute la suite.
- **Assertion roulette** : dix assertions sans message ; quand la septième échoue, on ne sait pas laquelle.

### Le principe DAMP plutôt que DRY

Dans le code de production, on vise **DRY** (*Don't Repeat Yourself*). Dans les tests, on privilégie souvent **DAMP** (*Descriptive And Meaningful Phrases*) : un peu de répétition lisible vaut mieux qu'une abstraction maligne qui oblige à sauter dans cinq fichiers pour comprendre un test. Un test doit se lire **de haut en bas, seul**, sans chasse au trésor.
---SECTION---
HEADING: Le property-based testing
BODY:
Le test classique fonctionne par **exemples** : « pour cette entrée précise, j'attends cette sortie précise ». Le **property-based testing** (test basé sur les propriétés) renverse l'approche : au lieu de choisir des cas, on énonce une **propriété générale** que le code doit respecter pour *toutes* les entrées, et l'outil génère automatiquement des centaines d'entrées aléatoires pour tenter de la violer.

### Le principe

Popularisé par la bibliothèque QuickCheck (Haskell) et décliné partout (fast-check en JS, Hypothesis en Python, jqwik en Java), l'outil :

1. Génère des centaines d'entrées aléatoires.
2. Vérifie la propriété sur chacune.
3. Si une entrée la viole, il **rétrécit** (*shrinking*) le contre-exemple jusqu'au plus petit cas possible pour faciliter le diagnostic.

### Exemple

```javascript
// Propriété : encoder puis décoder doit redonner l'original (round-trip)
fc.assert(
  fc.property(fc.string(), (texte) => {
    return decoder(encoder(texte)) === texte;
  })
);
```

fast-check va essayer `""`, `"a"`, des chaînes Unicode bizarres, des milliers de cas. S'il trouve que `"é"` casse l'encodage, il vous le signale avec le plus petit contre-exemple.

### Quelles propriétés chercher

- **Round-trip / inverse** : `décoder(encoder(x)) == x`, `parse(serialize(x)) == x`.
- **Invariants** : trier une liste ne change pas sa taille ; le résultat est toujours ordonné.
- **Idempotence** : appliquer deux fois donne le même résultat que l'appliquer une fois (`normaliser(normaliser(x)) == normaliser(x)`).
- **Commutativité, associativité**, comparaison à une implémentation de référence (*oracle*).

### Sa valeur

Le property-based testing trouve les **cas limites que vous n'auriez jamais imaginés** : chaînes vides, débordements, caractères spéciaux, listes énormes. Il complète — sans remplacer — les tests par exemple, qui restent plus lisibles pour documenter un cas métier précis.
---SECTION---
HEADING: Le mutation testing
BODY:
Une question hante tout testeur : **mes tests sont-ils bons ?** La couverture ne répond pas (elle mesure l'exécution, pas la vérification). Le **mutation testing** (test par mutation) offre une réponse bien plus honnête : il teste vos tests.

### Le mécanisme

L'outil introduit délibérément de petits bugs dans votre code de production — les **mutants**. Par exemple :

- remplacer `+` par `-`,
- changer `>` en `>=`,
- inverser une condition `if (x)` en `if (!x)`,
- remplacer un `return true` par `return false`.

Puis, pour chaque mutant, il relance votre suite de tests :

- Si **au moins un test échoue**, le mutant est « tué » ✅ — vos tests ont détecté le bug injecté. C'est bon signe.
- Si **tous les tests passent** malgré le mutant, le mutant « survit » ❌ — vos tests n'ont pas vu la différence. C'est un trou dans votre filet.

### Le score de mutation

Le **taux de mutants tués** est une mesure de la *qualité effective* de vos tests, bien plus parlante que la couverture. Un code couvert à 100 % mais avec un score de mutation de 40 % révèle que la moitié des bugs introduits passe inaperçue — vos assertions sont trop faibles.

### Le lien avec la couverture bidon

Reprenez le test sans assertion de la section couverture : il donne 100 % de couverture. En mutation testing, **tous les mutants survivent** — la vérité éclate immédiatement. C'est pourquoi le mutation testing est le meilleur antidote à l'illusion de la couverture.

### Le coût

Le mutation testing est **lent** : il faut relancer la suite pour chaque mutant (des centaines, des milliers). On le réserve donc aux modules critiques (logique métier, calculs financiers) plutôt qu'à tout le code. Outils : Stryker (JS), PIT (Java), mutmut (Python).
---SECTION---
HEADING: Tester le code pur vs le code impur
BODY:
La testabilité d'un code dépend énormément d'une distinction : est-il **pur** ou **impur** ? Comprendre cette frontière est le levier le plus puissant pour rendre du code facile à tester.

### Fonction pure vs code impur

- **Une fonction pure** : sa sortie dépend uniquement de ses entrées, et elle n'a aucun effet de bord. `additionner(2, 3)` renvoie toujours `5`, ne touche ni au disque, ni au réseau, ni à l'horloge. **C'est le rêve du testeur** : entrée → sortie, un test trivial et déterministe.
- **Le code impur** : il dépend du monde extérieur ou le modifie — lire un fichier, appeler une API, `new Date()`, `Math.random()`, écrire en base. C'est lui la source des tests lents et flaky.

### Les trois grandes sources d'impureté

- **Les I/O** : fichiers, réseau, base de données, console.
- **Le temps** : `Date.now()`, `System.currentTimeMillis()`, les timers.
- **L'aléa** : générateurs de nombres aléatoires, UUID.

### La stratégie : isoler l'impureté aux frontières

Le principe (que Khorikov appelle *functional core, imperative shell*, aussi connu comme « humble object ») consiste à **repousser l'impureté vers une fine coquille externe** et à concentrer la logique métier dans un cœur pur.

```javascript
// IMPUR et difficile à tester : le temps est caché à l'intérieur
function estExpire(token) {
  return token.expiration < Date.now(); // dépend de l'horloge réelle
}

// PUR et trivial à tester : le temps devient un paramètre (entrée)
function estExpire(token, maintenant) {
  return token.expiration < maintenant;
}
```

Dans la seconde version, plus besoin de mock ni de manipulation d'horloge : on passe `maintenant` en argument, le test est déterministe. **On a transformé une dépendance cachée en entrée explicite.** Même stratégie pour l'aléa (injecter le générateur) et les I/O (passer les données déjà lues plutôt que lire dans la fonction).

### La conséquence

Plus votre cœur logique est pur, plus il est testable par des tests unitaires rapides et fiables. L'impureté résiduelle, confinée à la coquille, se vérifie par quelques tests d'intégration. C'est la pyramide des tests qui découle naturellement d'une bonne architecture.
---SECTION---
HEADING: Le contract testing
BODY:
Dans une architecture distribuée (micro-services, API), un service A appelle un service B. Comment tester leur collaboration sans lancer tout le système à chaque fois ? Les tests E2E sont trop lents et fragiles ; les tests unitaires de A avec un mock de B ne prouvent rien si le mock ne correspond plus à la réalité de B. Le **contract testing** (test de contrat) résout ce dilemme.

### Le problème du mock qui ment

Quand vous testez le service A (*consommateur*) avec un stub du service B (*fournisseur*), votre test suppose que B répond d'une certaine façon. Mais si l'équipe de B change son format de réponse, **votre stub continue de mentir** : vos tests restent verts, et pourtant l'intégration réelle est cassée. C'est le danger fondamental des doublures aux frontières entre équipes.

### Le principe du contrat

Le contract testing établit un **contrat** — une description partagée de ce que le consommateur attend et de ce que le fournisseur promet :

1. Côté **consommateur** (A), on écrit des tests contre un mock de B ; ces tests **génèrent le contrat** (« j'attends un GET /user/1 qui renvoie `{id, nom}` »).
2. Côté **fournisseur** (B), on **rejoue le contrat** contre le vrai service pour vérifier qu'il l'honore toujours.

Si B casse le contrat, **c'est le test de B qui échoue**, avant tout déploiement. On détecte l'incompatibilité tôt, sans lancer un E2E complet. L'outil emblématique est **Pact** ; on parle de *consumer-driven contract testing* car c'est le consommateur qui définit ses besoins.

### Ce que ça apporte

- On teste l'intégration **sans orchestrer tous les services ensemble** : rapide et fiable.
- Chaque équipe peut évoluer indépendamment tant que le contrat tient.
- On attrape les *breaking changes* d'API au moment où ils sont introduits, pas en production.

Le contract testing occupe ainsi une place précise dans la pyramide : il donne une bonne partie de la confiance des tests E2E entre services, pour une fraction du coût et de la fragilité.
---SECTION---
HEADING: L'état d'esprit : les tests comme filet pour refactorer
BODY:
Terminons par ce qui donne son sens à tout le reste. Si vous ne deviez retenir qu'une chose de ce cours, ce serait celle-ci : **les tests existent pour vous rendre libre**.

### Le vrai cadeau des tests

Sans filet, modifier du code est un acte de foi. On touche une fonction, on croise les doigts, on déploie, on prie. La peur du changement s'installe, et avec elle la **dette de conception** : on n'ose plus refactorer, le code pourrit, chaque évolution devient plus coûteuse que la précédente.

Avec une bonne suite de tests, tout change. Vous pouvez saisir une classe mal fichue, la découper, renommer, restructurer — et **la barre verte vous confirme, en secondes, que le comportement est intact**. Le refactoring cesse d'être risqué. Martin Fowler définit d'ailleurs le refactoring comme « améliorer la structure interne sans changer le comportement observable » — et c'est précisément le comportement observable que vos tests verrouillent.

### La boucle vertueuse

C'est le cœur du message de Freeman & Pryce et de Kent Beck : test et conception se nourrissent l'un l'autre.

- Des tests qui vérifient le **comportement** (pas l'implémentation) vous laissent libre de refactorer.
- La liberté de refactorer vous permet de **garder le code propre** en continu.
- Un code propre est **facile à tester**, ce qui rend les tests encore meilleurs.

À l'inverse, des tests couplés à l'implémentation vous **enferment** : ils cassent à chaque refactoring, deviennent un fardeau, et vous finissez par les supprimer. La qualité d'une suite de tests se juge donc à une question simple : **me donne-t-elle envie et pouvoir de changer mon code, ou me l'interdit-elle ?**

### En résumé

- Testez le **comportement observable**, pour résister au refactoring.
- Gardez vos tests **rapides, isolés, déterministes** (FIRST) — un test flaky est pire que pas de test.
- Confinez l'**impureté** aux frontières, gardez un cœur pur facile à tester.
- Ne courez pas après la **couverture** ; cherchez la qualité réelle (mutation testing).
- Voyez chaque test comme un **investissement dans votre liberté future** de faire évoluer le système sans peur.

Un bon test n'est pas celui qui attrape le plus de bugs aujourd'hui, mais celui qui vous permettra de dormir tranquille en modifiant ce code dans six mois.
===END===
