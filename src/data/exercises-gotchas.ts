import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « Pièges par langage » — comportements subtils qui trompent même les
// développeurs expérimentés (Python, JS, Go, Rust, Java, C/C++).
// Snippet rendu via le type find-error (bloc de code) ; concepts purs en mcq.
// Options équilibrées, bonne réponse en premier (shuffle randomise).
// ---------------------------------------------------------------------------

type Lang = Extract<Exercise, { type: 'find-error' }>['language'];

const F = (
  id: string, difficulty: Exercise['difficulty'], title: string, language: Lang,
  code: string, question: string, options: string[], explanation: string, tags: string[],
): Exercise => ({
  id, type: 'find-error', domain: 'software', topic: 'languages', difficulty,
  title, language, code, question, options, answer: 0, explanation, tags,
});

const M = (
  id: string, difficulty: Exercise['difficulty'], title: string,
  question: string, options: string[], explanation: string, tags: string[],
): Exercise => ({
  id, type: 'mcq', domain: 'software', topic: 'languages', difficulty,
  title, question, options, answer: 0, explanation, tags,
});

export const gotchaExercises: Exercise[] = [
  // ------------------------------------------------------------- PYTHON
  F('gt-py-default-arg', 'intermediate', 'Argument par défaut mutable', 'python',
    `def ajoute(x, lst=[]):
    lst.append(x)
    return lst
print(ajoute(1)); print(ajoute(2))`,
    'Qu\'affichent les deux appels ?',
    ['[1] puis [1, 2], car la liste par défaut est partagée entre les appels',
     '[1] puis [2], car lst repart vide à chaque appel',
     'Une erreur, car on ne peut pas muter un argument par défaut',
     '[1] puis [2], mais seulement hors d\'une fonction récursive'],
    'La valeur par défaut est évaluée une seule fois, à la définition, et le même objet liste est réutilisé. Correctif : `lst=None` puis `if lst is None: lst = []`.',
    ['python', 'mutable-default']),
  F('gt-py-closure', 'intermediate', 'Fermetures et variable de boucle', 'python',
    `fs = [lambda: i for i in range(3)]
print([f() for f in fs])`,
    'Qu\'affiche ce code ?',
    ['[2, 2, 2], car i est lié tardivement et vaut 2 à la fin',
     '[0, 1, 2], chaque lambda capture sa propre valeur',
     '[3, 3, 3], car range(3) laisse i à 3',
     'Une erreur, car i n\'existe plus après la boucle'],
    'Les lambdas capturent la variable `i` par référence, pas sa valeur ; à l\'appel, la boucle est finie et `i` vaut 2. Correctif : `lambda i=i: i`.',
    ['python', 'closure', 'late-binding']),
  F('gt-py-is-int', 'intermediate', 'is contre == sur les entiers', 'python',
    `a = 256; b = 256
c = 257; d = 257
print(a is b, c is d)`,
    'Qu\'affiche ce code en CPython ?',
    ['True False, car CPython pré-alloue les petits entiers (-5 à 256)',
     'True True, car les entiers égaux sont toujours le même objet',
     'False False, car is compare une identité mémoire distincte',
     'False True, car seuls les grands entiers sont mis en cache'],
    'CPython met en cache les entiers de -5 à 256 : `a is b` est True. 257 est hors cache → deux objets, d\'où False. Toujours comparer les valeurs avec `==`, jamais `is`.',
    ['python', 'identity', 'interning']),
  M('gt-py-gil', 'senior', 'Le GIL et les threads',
    'En CPython, deux threads exécutant une boucle de calcul intensif tournent-ils vraiment en parallèle sur deux cœurs ?',
    ['Non, le GIL n\'autorise qu\'un thread à exécuter du bytecode à la fois',
     'Oui, chaque thread tourne sur son propre cœur physique',
     'Oui, mais uniquement si on utilise threading.Lock',
     'Non, car Python interdit purement et simplement les threads'],
    'Le Global Interpreter Lock garantit qu\'un seul thread exécute du bytecode à la fois : les tâches CPU ne s\'accélèrent pas. Pour du vrai parallélisme CPU, utiliser `multiprocessing`. Les threads restent utiles pour l\'I/O.',
    ['python', 'gil', 'concurrency']),
  F('gt-py-shallow-copy', 'junior', 'Copie superficielle de liste', 'python',
    `a = [[0, 0], [0, 0]]
b = a[:]
b[0][0] = 9
print(a[0][0])`,
    'Qu\'affiche ce code ?',
    ['9, car la copie est superficielle et les sous-listes sont partagées',
     '0, car a[:] fait une copie complète indépendante',
     'Une erreur, car on ne peut pas assigner dans une copie',
     '0, car seule b est modifiée en profondeur'],
    '`a[:]` copie la liste externe mais partage les références des sous-listes. Modifier `b[0][0]` affecte la sous-liste partagée avec `a`. Pour une copie indépendante : `copy.deepcopy`.',
    ['python', 'shallow-copy']),
  F('gt-py-generator', 'intermediate', 'Épuisement d\'un générateur', 'python',
    `g = (x for x in range(3))
print(sum(g))
print(sum(g))`,
    'Qu\'affiche la seconde somme ?',
    ['0, car un générateur est épuisé après un seul parcours',
     '3, car le générateur se réinitialise à chaque parcours',
     'Une erreur StopIteration non gérée est levée',
     '6, car les deux sommes sont additionnées ensemble'],
    'Un générateur ne se parcourt qu\'une fois ; après le premier `sum`, il est épuisé et le second donne 0. Pour réutiliser, matérialiser en liste ou recréer le générateur.',
    ['python', 'generator']),
  F('gt-py-wraps', 'intermediate', 'Décorateur sans functools.wraps', 'python',
    `def deco(f):
    def wrapper(*a): return f(*a)
    return wrapper
@deco
def salut(): "docstring"
print(salut.__name__)`,
    'Qu\'affiche __name__ ?',
    ['"wrapper", car les métadonnées de la fonction sont perdues',
     '"salut", car le décorateur préserve automatiquement le nom',
     '"deco", car c\'est le décorateur externe qui prime',
     '"" (chaîne vide), car le nom devient anonyme'],
    'Sans `@functools.wraps(f)`, le nom, la docstring et la signature sont remplacés par ceux de `wrapper`. Correctif : décorer `wrapper` avec `@functools.wraps(f)`.',
    ['python', 'decorator']),
  F('gt-py-chained', 'junior', 'Comparaison chaînée', 'python',
    `print(1 == 1 == True)
print(False == False in [False])`,
    'Qu\'affiche la seconde ligne ?',
    ['True, car elle équivaut à (False == False) and (False in [False])',
     'True, car False vaut bien 0 partout dans l\'expression',
     'False, car False n\'est pas contenu dans la liste testée',
     'Une erreur, car on ne peut pas chaîner == et in'],
    'Python chaîne les comparaisons : `a == b in c` signifie `(a == b) and (b in c)`. Ici les deux sont True, donc True. Ce chaînage implicite surprend et masque des bugs.',
    ['python', 'chained-comparison']),
  F('gt-py-bare-except', 'intermediate', 'except trop large', 'python',
    `try:
    resultat = calcul()
except:
    resultat = None`,
    'Quel est le principal danger de ce bloc ?',
    ['Il capture aussi KeyboardInterrupt et SystemExit, masquant tout',
     'Il ralentit le programme car try/except est coûteux',
     'Il ne capture que les erreurs de syntaxe et rien d\'autre',
     'Il relance automatiquement l\'exception après l\'avoir attrapée'],
    'Un `except:` nu attrape tout, y compris `KeyboardInterrupt` (Ctrl+C) et `SystemExit`, empêchant l\'arrêt propre et masquant des bugs. Attraper des exceptions précises ou `except Exception:`.',
    ['python', 'exceptions']),
  F('gt-py-iadd-tuple', 'senior', '+= sur une liste dans un tuple', 'python',
    `t = (1, [2, 3])
t[1] += [4]`,
    'Que se passe-t-il ?',
    ['TypeError est levée ET la liste devient [2, 3, 4]',
     'Rien, le tuple devient (1, [2, 3, 4]) sans erreur',
     'TypeError est levée et la liste reste inchangée',
     'La liste est remplacée par un nouvel objet [2, 3, 4]'],
    '`+=` appelle `__iadd__` qui modifie la liste en place (→ [2,3,4]), puis Python tente de réassigner `t[1]`, interdit sur un tuple → TypeError. Surprenant : l\'erreur survient mais la mutation a déjà eu lieu.',
    ['python', 'tuple', 'iadd']),
  // ---------------------------------------------------------- JAVASCRIPT
  F('gt-js-microtask', 'senior', 'Microtâches contre macrotâches', 'javascript',
    `console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
console.log('D');`,
    'Dans quel ordre s\'affichent les lettres ?',
    ['A, D, C, B car les Promises passent avant les timers',
     'A, B, C, D dans l\'ordre exact d\'écriture du code',
     'A, D, B, C car setTimeout(0) s\'exécute immédiatement',
     'A, C, D, B car then est synchrone comme console.log'],
    'Le code synchrone d\'abord (A, D). Puis la file des microtâches (Promises) est vidée avant la prochaine macrotâche (setTimeout) : C puis B. Les `.then` priment toujours sur `setTimeout`.',
    ['javascript', 'event-loop']),
  F('gt-js-coercion', 'senior', 'Coercition [] == ![]', 'javascript',
    `console.log([] == ![]);`,
    'Que vaut cette expression ?',
    ['true, car ![] vaut false puis les deux côtés deviennent 0',
     'false, car un tableau n\'est jamais égal à un booléen',
     'true, car un tableau vide est toujours égal à lui-même',
     'false, car ![] devient true et diffère du tableau vide'],
    '`![]` vaut `false` (un objet est truthy). On compare `[] == false` : `false` → `0`, `[]` → `""` → `0`, et `0 == 0` est vrai. Piège classique de la coercition `==` ; `===` l\'évite.',
    ['javascript', 'coercion']),
  F('gt-js-this', 'intermediate', 'this dans un callback classique', 'javascript',
    `const obj = {
  v: 42,
  get() { return [1].map(function() { return this.v; })[0]; }
};
console.log(obj.get());`,
    'Qu\'affiche ce code (en mode non strict) ?',
    ['undefined, car une fonction classique redéfinit son propre this',
     '42, car this reste lié à obj dans le callback',
     'Une erreur, car this.v n\'existe pas dans map',
     '1, car this renvoie le premier élément du tableau'],
    'Le callback `function` de `map` a son propre `this` (objet global / undefined en strict), donc `this.v` est undefined. Une fonction fléchée `() => this.v` capturerait le `this` de `get` → 42.',
    ['javascript', 'this']),
  F('gt-js-tdz', 'intermediate', 'Zone morte temporelle (TDZ)', 'javascript',
    `console.log(x);
let x = 5;`,
    'Que se passe-t-il ?',
    ['Lève ReferenceError à cause de la zone morte temporelle',
     'Affiche undefined, car let est hissé comme var',
     'Affiche 5, car x est déjà initialisé au hissage',
     'Lève SyntaxError, car x est utilisé avant sa déclaration'],
    '`let`/`const` sont hissés mais restent dans la zone morte temporelle jusqu\'à leur initialisation ; y accéder avant lève une `ReferenceError` (contrairement à `var` → undefined).',
    ['javascript', 'tdz', 'hoisting']),
  F('gt-js-float', 'junior', '0.1 + 0.2', 'javascript',
    `console.log(0.1 + 0.2 === 0.3);`,
    'Que vaut cette comparaison ?',
    ['false, car 0.1 + 0.2 donne 0.30000000000000004',
     'true, car les deux valeurs sont mathématiquement égales',
     'Une erreur d\'arrondi bloque l\'exécution du script',
     'true, car JavaScript arrondit automatiquement à 0.3'],
    'Les nombres sont des flottants IEEE 754 : 0.1 et 0.2 n\'ont pas de représentation exacte, leur somme vaut 0.30000000000000004. Comparer avec une tolérance : `Math.abs(a - b) < Number.EPSILON`.',
    ['javascript', 'floating-point']),
  F('gt-js-nan', 'junior', 'NaN n\'est pas égal à lui-même', 'javascript',
    `console.log(NaN === NaN);`,
    'Que vaut cette expression ?',
    ['false, car NaN n\'est égal à aucune valeur, y compris lui-même',
     'true, car les deux NaN sont identiques',
     'Une erreur, car NaN ne peut pas être comparé',
     'undefined, car NaN n\'a pas de valeur définie'],
    'Par la norme IEEE 754, `NaN` n\'est jamais égal à quoi que ce soit, même à un autre `NaN`. Tester avec `Number.isNaN(x)` ou l\'astuce `x !== x`.',
    ['javascript', 'nan']),
  F('gt-js-typeof-null', 'junior', 'typeof null', 'javascript',
    `console.log(typeof null);`,
    'Que renvoie cette expression ?',
    ['"object", à cause d\'un bug historique conservé pour compatibilité',
     '"null", comme on pourrait logiquement s\'y attendre',
     '"undefined", car null représente l\'absence de valeur',
     'Une erreur, car typeof n\'accepte pas null'],
    '`typeof null` renvoie `"object"`, un bug présent depuis la première implémentation de JS, jamais corrigé pour compatibilité. Tester null avec `x === null`.',
    ['javascript', 'typeof']),
  F('gt-js-var-loop', 'intermediate', 'var contre let dans une boucle', 'javascript',
    `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i), 0);
}`,
    'Qu\'affiche ce code ?',
    ['3, 3, 3, car var partage une seule variable pour la boucle',
     '0, 1, 2, car chaque itération garde sa valeur',
     '0, 0, 0, car i est réinitialisé à chaque tour',
     '1, 2, 3, car setTimeout décale l\'indice d\'une unité'],
    '`var` a une portée de fonction : les trois callbacks référencent le même `i`, qui vaut 3 à l\'exécution des timers. Avec `let`, chaque itération crée une nouvelle liaison → 0, 1, 2.',
    ['javascript', 'var-let', 'closure']),
  F('gt-js-foreach-async', 'intermediate', 'forEach et async/await', 'javascript',
    `async function run(ids) {
  ids.forEach(async (id) => { await save(id); });
  console.log('fini');
}`,
    'Que se passe-t-il avec "fini" ?',
    ['"fini" s\'affiche immédiatement, sans attendre les save',
     '"fini" s\'affiche après que tous les save soient terminés',
     'Une erreur, car forEach n\'accepte pas de callback async',
     'Les save s\'exécutent de façon strictement séquentielle'],
    '`forEach` ignore la Promise retournée par son callback : aucun `await`, donc `run` ne l\'attend pas et "fini" s\'affiche avant la fin des `save`. Utiliser `for...of` avec `await`, ou `await Promise.all(ids.map(...))`.',
    ['javascript', 'async', 'foreach']),
  // ----------------------------------------------------------------- GO
  F('gt-go-loopvar', 'senior', 'Capture de variable en goroutine', 'go',
    `for _, v := range []int{1, 2, 3} {
    go func() { fmt.Print(v) }()
}`,
    'Qu\'affiche ce code avec Go antérieur à 1.22 ?',
    ['Souvent 333, car toutes les goroutines partagent la même variable v',
     '123 dans l\'ordre garanti des éléments du slice',
     'Toujours une erreur de compilation sur la capture de v',
     '000, car v n\'est pas encore initialisée au lancement'],
    'Avant Go 1.22, la variable de boucle `v` est unique et réutilisée ; les goroutines différées lisent souvent sa dernière valeur (3). Correctif : `v := v` dans la boucle. Go 1.22 donne une variable par itération.',
    ['go', 'goroutine', 'loop-var']),
  F('gt-go-nil-interface', 'senior', 'Interface nil qui n\'est pas nil', 'go',
    `func get() error {
    var p *MyErr = nil
    return p
}
func main() { fmt.Println(get() == nil) }`,
    'Qu\'affiche ce code ?',
    ['false, car l\'interface contient un type non nil et une valeur nil',
     'true, car le pointeur retourné vaut nil',
     'Une erreur, car on ne peut pas retourner un pointeur nil',
     'true, car Go convertit automatiquement en interface nil'],
    'Une interface vaut nil seulement si son type ET sa valeur sont nil. Ici l\'interface `error` porte le type `*MyErr` (non nil) avec une valeur nil → comparaison à nil = false. Correctif : retourner explicitement `nil`.',
    ['go', 'nil-interface']),
  F('gt-go-goroutine-leak', 'senior', 'Fuite de goroutine sur canal', 'go',
    `ch := make(chan int)
go func() { ch <- 42 }()
// aucun récepteur ne lit ch`,
    'Que devient la goroutine ?',
    ['Elle reste bloquée pour toujours, provoquant une fuite',
     'Elle se termine normalement après l\'envoi sur le canal',
     'Elle panique car personne ne lit le canal non bufferisé',
     'Elle abandonne l\'envoi après un court délai d\'attente'],
    'Un canal non bufferisé exige un récepteur prêt ; sans lecteur, `ch <- 42` bloque indéfiniment et la goroutine fuit. Garantir un récepteur, un canal bufferisé, ou un `context`/`select` avec sortie.',
    ['go', 'goroutine-leak', 'channel']),
  F('gt-go-append', 'senior', 'append et réallocation de slice', 'go',
    `a := []int{1, 2, 3}
b := a[:2]
b = append(b, 99)
fmt.Println(a)`,
    'Qu\'affiche a ?',
    ['[1 2 99], car append écrit dans le tableau sous-jacent partagé',
     '[1 2 3], car b est une copie indépendante de a',
     '[1 2 3 99], car append agrandit aussi la slice a',
     'Une erreur, car b dépasse sa capacité initiale'],
    '`b` partage le tableau sous-jacent de `a` avec de la capacité restante : `append` écrit à l\'indice 2 sans réallouer, écrasant le 3 par 99. Si la capacité était pleine, append réallouerait et `a` resterait intact.',
    ['go', 'slice', 'append']),
  F('gt-go-map-order', 'intermediate', 'Ordre d\'itération d\'une map', 'go',
    `m := map[string]int{"a": 1, "b": 2, "c": 3}
for k := range m { fmt.Print(k) }`,
    'Dans quel ordre les clés sont-elles parcourues ?',
    ['Dans un ordre volontairement aléatoire à chaque exécution',
     'Dans l\'ordre d\'insertion des clés dans la map',
     'Toujours par ordre alphabétique croissant des clés',
     'Dans l\'ordre inverse de leur insertion'],
    'Go randomise délibérément l\'ordre d\'itération des maps pour empêcher d\'en dépendre. Pour un ordre stable, extraire les clés dans un slice et le trier.',
    ['go', 'map']),
  F('gt-go-err-shadow', 'senior', 'Ombrage d\'erreur avec :=', 'go',
    `var err error
if cond {
    x, err := doSomething()
    _ = x
}
return err`,
    'Quel est le bug ?',
    [':= crée un err local au bloc ; l\'externe reste inchangé',
     'Aucun, err externe reçoit bien la valeur du bloc',
     'Le code ne compile pas car err est déclaré deux fois',
     'doSomething doit retourner exactement une seule valeur'],
    'Comme `x` est nouveau, `:=` déclare de nouvelles variables locales, dont un `err` qui ombrage l\'externe. L\'`err` retourné n\'est jamais mis à jour. Correctif : déclarer `x` avant et utiliser `x, err = doSomething()`.',
    ['go', 'shadowing']),
  F('gt-go-nil-map', 'intermediate', 'Écriture dans une map nil', 'go',
    `var m map[string]int
m["x"] = 1`,
    'Que se passe-t-il ?',
    ['panic à l\'exécution : assignation dans une map nil',
     'La map est créée automatiquement puis reçoit la clé',
     'Erreur de compilation car m n\'est pas initialisée',
     'Rien, l\'écriture est silencieusement ignorée'],
    'Une map déclarée sans `make` vaut nil ; la lecture est autorisée (valeur zéro) mais l\'écriture provoque une panic. Initialiser avec `make(map[string]int)` ou un littéral avant d\'écrire.',
    ['go', 'nil-map']),
  F('gt-go-defer', 'intermediate', 'Évaluation des arguments de defer', 'go',
    `i := 0
defer fmt.Println(i)
i = 42`,
    'Qu\'affiche le defer ?',
    ['0, car les arguments de defer sont évalués immédiatement',
     '42, car defer lit la valeur au moment de l\'exécution',
     'Une erreur, car i change après le defer',
     'Rien, car defer annule l\'appel si i est modifié'],
    'Les arguments d\'un `defer` sont évalués quand l\'instruction est rencontrée, pas à la fin de la fonction. `i` valait 0 → 0 s\'affiche. Pour la valeur finale : `defer func() { fmt.Println(i) }()`.',
    ['go', 'defer']),
  // --------------------------------------------------------------- RUST
  F('gt-rust-move', 'intermediate', 'Utilisation après déplacement', 'rust',
    `let s = String::from("hi");
let t = s;
println!("{}", s);`,
    'Que se passe-t-il ?',
    ['Erreur de compilation : s a été déplacé vers t',
     'Le code affiche "hi" car s et t pointent la même donnée',
     'Le code affiche une chaîne vide car s est vidé',
     'Une panic à l\'exécution sur un accès invalide'],
    '`String` ne dérive pas `Copy` ; `let t = s` déplace la propriété vers `t`, invalidant `s`. Toute utilisation ultérieure de `s` est refusée à la compilation. Pour garder les deux : `s.clone()` ou `&s`.',
    ['rust', 'ownership', 'move']),
  F('gt-rust-borrow', 'senior', 'Emprunt mutable et immuable', 'rust',
    `let mut v = vec![1, 2, 3];
let first = &v[0];
v.push(4);
println!("{}", first);`,
    'Que se passe-t-il ?',
    ['Erreur de compilation : push exige un emprunt mutable exclusif',
     'Le code affiche 1 sans aucun problème d\'emprunt',
     'Une panic car push invalide la référence first',
     'Le vecteur est copié avant push pour éviter le conflit'],
    '`first` est un emprunt immuable de `v` ; `v.push(4)` réclame un emprunt mutable, interdit tant que l\'emprunt immuable vit. Le vérificateur rejette à la compilation, prévenant une référence pendante si le vecteur se réalloue.',
    ['rust', 'borrow-checker']),
  F('gt-rust-unwrap', 'junior', 'unwrap sur None', 'rust',
    `let v: Vec<i32> = vec![];
let x = v.first().unwrap();`,
    'Que se passe-t-il ?',
    ['panic à l\'exécution car first renvoie None',
     'x vaut 0, la valeur par défaut d\'un i32',
     'Erreur de compilation car le vecteur est vide',
     'x devient une Option contenant None'],
    '`first()` renvoie `Option<&i32>`, ici `None` (vecteur vide). `unwrap()` sur `None` provoque une panic. Correctif : `match`, `if let`, ou un défaut via `unwrap_or`.',
    ['rust', 'option', 'unwrap']),
  F('gt-rust-overflow', 'senior', 'Débordement d\'entier debug/release', 'rust',
    `let x: u8 = 255;
let y = x + 1;`,
    'Que se passe-t-il selon le mode de compilation ?',
    ['panic en debug, mais wrap à 0 en release',
     'Toujours une panic, quel que soit le profil de compilation',
     'Toujours 0 par bouclage silencieux dans les deux modes',
     'Erreur de compilation car 256 dépasse un u8'],
    'En debug, le débordement est détecté → panic ; en release (optimisé), il boucle silencieusement (complément à deux) → 0. Pour un comportement explicite : `checked_add`, `wrapping_add`, `saturating_add`.',
    ['rust', 'overflow']),
  F('gt-rust-iter-mut', 'intermediate', 'Mutation pendant l\'itération', 'rust',
    `let mut v = vec![1, 2, 3];
for x in &v {
    v.push(*x);
}`,
    'Que se passe-t-il ?',
    ['Erreur de compilation : v est déjà emprunté par la boucle',
     'Une boucle infinie remplit le vecteur sans fin',
     'Le vecteur double de taille puis la boucle s\'arrête',
     'Une panic à l\'exécution sur invalidation d\'itérateur'],
    '`for x in &v` emprunte `v` immuablement pour toute la boucle ; `v.push` réclame un emprunt mutable, refusé à la compilation. Rust empêche l\'invalidation d\'itérateur au lieu de la subir à l\'exécution.',
    ['rust', 'borrow-checker', 'iterator']),
  // --------------------------------------------------------------- JAVA
  F('gt-java-string-eq', 'junior', '== contre .equals sur les chaînes', 'java',
    `String a = new String("hi");
String b = new String("hi");
System.out.println(a == b);`,
    'Qu\'affiche ce code ?',
    ['false, car == compare les références, distinctes ici',
     'true, car les deux chaînes ont le même contenu',
     'true, car Java interne toutes les chaînes littérales',
     'Une erreur, car on ne peut pas comparer des String avec =='],
    '`new String(...)` crée deux objets distincts ; `==` compare les références → false. Pour le contenu : `a.equals(b)`. Avec des littéraux internés, `==` pourrait accidentellement donner true.',
    ['java', 'string', 'equals']),
  F('gt-java-integer-cache', 'senior', 'Cache d\'autoboxing des Integer', 'java',
    `Integer a = 127, b = 127;
Integer c = 128, d = 128;
System.out.println((a == b) + " " + (c == d));`,
    'Qu\'affiche ce code ?',
    ['true false, car le cache Integer ne couvre que -128 à 127',
     'true true, car les valeurs égales donnent le même objet',
     'false false, car == compare toujours des références distinctes',
     'false true, car seuls les grands entiers sont mis en cache'],
    'L\'autoboxing met en cache les Integer de -128 à 127 : `a` et `b` sont le même objet (true). 128 est hors cache → deux objets, `==` donne false. Comparer avec `.equals`, jamais `==` sur des Integer.',
    ['java', 'autoboxing', 'integer-cache']),
  F('gt-java-hashcode', 'senior', 'equals sans hashCode', 'java',
    `// Point : equals() redéfini mais pas hashCode()
Set<Point> s = new HashSet<>();
s.add(new Point(1, 1));
System.out.println(s.contains(new Point(1, 1)));`,
    'Qu\'affiche généralement contains ?',
    ['false, car des objets égaux ont des hashCode différents',
     'true, car equals suffit à retrouver l\'élément',
     'Une erreur, car hashCode est obligatoire à la compilation',
     'true, car HashSet ignore le hashCode pour contains'],
    '`HashSet` localise via `hashCode` avant `equals`. Sans redéfinir `hashCode`, deux Point égaux ont des codes différents (identité) et tombent dans des seaux distincts → false. Toujours redéfinir `hashCode` avec `equals`.',
    ['java', 'equals', 'hashcode']),
  F('gt-java-cme', 'intermediate', 'ConcurrentModificationException', 'java',
    `List<Integer> l = new ArrayList<>(List.of(1, 2, 3));
for (Integer x : l) {
    if (x == 2) l.remove(x);
}`,
    'Que se passe-t-il ?',
    ['ConcurrentModificationException est levée pendant l\'itération',
     'L\'élément 2 est retiré proprement puis la boucle finit',
     'Une IndexOutOfBoundsException sur l\'accès décalé',
     'Rien, la modification est ignorée durant le parcours'],
    'Modifier une liste pendant un parcours foreach invalide l\'itérateur, qui détecte le changement de `modCount` et lève `ConcurrentModificationException`. Utiliser `Iterator.remove()`, `removeIf`, ou itérer sur une copie.',
    ['java', 'cme', 'iterator']),
  F('gt-java-double', 'intermediate', 'double pour de l\'argent', 'java',
    `System.out.println(0.1 + 0.2);
System.out.println(1.03 - 0.42);`,
    'Qu\'affiche la seconde ligne ?',
    ['0.6100000000000001, à cause de l\'imprécision binaire',
     '0.61, car double gère exactement les décimales courantes',
     'Une erreur d\'arrondi interrompt le calcul monétaire',
     '0.61 arrondi automatiquement par la JVM à deux décimales'],
    '`double` est un flottant IEEE 754 incapable de représenter exactement la plupart des décimales → `0.6100000000000001`. Pour de l\'argent : `BigDecimal` (avec des String) ou compter en centimes entiers.',
    ['java', 'double', 'money']),
  F('gt-java-finally', 'senior', 'return dans finally', 'java',
    `int f() {
    try { return 1; }
    finally { return 2; }
}`,
    'Que renvoie f() ?',
    ['2, car le return du finally écrase celui du try',
     '1, car le return du try est évalué en premier',
     'Une erreur de compilation sur les deux return',
     '3, car les deux valeurs de retour s\'additionnent'],
    'Le `finally` s\'exécute avant que la méthode rende la main ; son `return 2` remplace le `return 1`, perdu. Piège dangereux qui masque aussi les exceptions : ne jamais mettre de `return` dans un `finally`.',
    ['java', 'finally']),
  F('gt-java-ternary', 'senior', 'Promotion numérique du ternaire', 'java',
    `System.out.println(true ? 1 : 2.0);`,
    'Qu\'affiche ce code ?',
    ['1.0, car les deux branches sont promues en double',
     '1, car la condition est vraie et sélectionne l\'entier',
     '2.0, car la branche double impose son type',
     'Une erreur, car les branches ont des types différents'],
    'Le ternaire calcule un type commun aux deux branches ; mélanger `int` et `double` promeut toute l\'expression en `double`. Même si la branche `int` est choisie, on affiche `1.0`. Le type dépend de la branche non prise — surprenant.',
    ['java', 'ternary', 'promotion']),
  // ---------------------------------------------------------------- C/C++
  F('gt-c-signed-overflow', 'senior', 'Débordement signé, UB', 'c',
    `int x = INT_MAX;
if (x + 1 < x) puts("boucle");
else puts("pas de boucle");`,
    'Que peut faire ce programme ?',
    ['Le comportement est indéfini ; le compilateur peut éliminer le test',
     'Toujours afficher "boucle" car x+1 déborde vers négatif',
     'Toujours afficher "pas de boucle" par saturation à INT_MAX',
     'Lever une exception d\'overflow interceptable à l\'exécution'],
    'Le débordement d\'entier signé est un comportement indéfini en C ; le compilateur suppose qu\'il n\'arrive jamais et peut optimiser `x + 1 < x` en `false`. On ne peut rien garantir. Détecter avant, ou utiliser des entiers non signés (bouclage défini).',
    ['c', 'undefined-behavior', 'overflow']),
  F('gt-c-aliasing', 'senior', 'Aliasing strict', 'c',
    `float f = 1.0f;
unsigned int i = *(unsigned int*)&f;`,
    'Quel est le problème avec ce type-punning ?',
    ['Il viole la règle d\'aliasing strict : comportement indéfini',
     'Aucun, lire un float via un int* est parfaitement portable',
     'Il provoque toujours une erreur d\'alignement mémoire',
     'Il convertit correctement la valeur 1.0 en l\'entier 1'],
    'Accéder à un `float` via un `unsigned int*` viole l\'aliasing strict : le compilateur suppose que des types incompatibles ne se chevauchent pas et peut optimiser de façon surprenante → UB. Moyens sûrs : `memcpy`, une `union` (C), ou `std::bit_cast` (C++20).',
    ['c', 'strict-aliasing', 'undefined-behavior']),
  F('gt-c-array-decay', 'intermediate', 'Dégénérescence de tableau', 'c',
    `void f(int a[]) { printf("%zu\\n", sizeof(a)); }
int main() { int t[10]; f(t); }`,
    'Qu\'affiche f (sur une plateforme 64 bits) ?',
    ['8, car le paramètre est en réalité un pointeur',
     '40, soit la taille des dix entiers du tableau',
     '10, soit le nombre d\'éléments du tableau passé',
     'Une erreur, car sizeof ne s\'applique pas aux tableaux'],
    'Un paramètre `int a[]` dégénère en pointeur `int*` ; `sizeof(a)` donne la taille d\'un pointeur (8 octets), pas celle du tableau. L\'info de taille est perdue au passage : la passer en argument séparé.',
    ['c', 'array-decay', 'sizeof']),
  F('gt-c-dangling', 'senior', 'Référence pendante retournée', 'c',
    `const std::string& f() {
    std::string s = "temp";
    return s;
}`,
    'Que se passe-t-il en utilisant la référence retournée ?',
    ['Comportement indéfini : s est détruit à la fin de f',
     'Elle reste valide car s est copié à la sortie',
     'Une erreur de compilation empêche le retour de s',
     'La chaîne est prolongée automatiquement par le compilateur'],
    '`s` est locale, détruite quand `f` retourne ; la référence renvoyée devient pendante et l\'utiliser est un UB. Correctif : retourner par valeur (`std::string`), la copie étant optimisée via RVO/move.',
    ['c', 'dangling-reference', 'cpp']),
  F('gt-c-static-init', 'senior', 'Ordre d\'init statique (fiasco)', 'c',
    `// a.cpp : extern B b; A a = b.value();
// b.cpp : B b;`,
    'Quel est le risque avec ces objets statiques ?',
    ['L\'ordre d\'init entre unités de compilation n\'est pas défini : a peut lire b non initialisé',
     'Aucun, le compilateur ordonne toujours les initialisations',
     'Une erreur de l\'éditeur de liens interdit ce couplage',
     'b est toujours initialisé avant a par ordre alphabétique'],
    'L\'ordre d\'initialisation des objets statiques globaux entre unités de compilation n\'est pas spécifié ; `a` peut être initialisé avant `b`, lisant une valeur non initialisée (« static init order fiasco »). Correctif : idiome Construct On First Use (fonction retournant une référence à un statique local).',
    ['c', 'static-init', 'cpp']),
  F('gt-c-sequence', 'senior', 'i = i++ et points de séquence', 'c',
    `int i = 5;
i = i++;
printf("%d\\n", i);`,
    'Qu\'affiche ce code ?',
    ['Le comportement est indéfini : i est modifié deux fois sans séquence',
     '6, car i est incrémenté après l\'affectation',
     '5, car la valeur pré-incrément est réassignée à i',
     'Une erreur de compilation sur l\'affectation ambiguë'],
    '`i = i++` modifie `i` deux fois (l\'affectation et le post-incrément) sans point de séquence entre les deux → comportement indéfini : le résultat n\'est garanti ni à 5 ni à 6. Séparer les opérations.',
    ['c', 'sequence-point', 'undefined-behavior']),
];
