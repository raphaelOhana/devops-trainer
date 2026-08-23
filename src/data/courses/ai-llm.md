===LESSON===
KEY: ai-llm
TOPIC: ai-llm
TITLE: IA & LLM
ICON: 🤖
INTRO: Derrière la fluidité troublante de ChatGPT ou Claude se cache une machinerie étonnamment mécanique : des matrices, des produits scalaires et une seule tâche répétée des milliards de fois — prédire le prochain mot ; ce cours démonte pièce par pièce le Transformer pour que vous compreniez vraiment ce qui se passe sous le capot, avec l'intuition mathématique à chaque étape.
---SECTION---
HEADING: La tâche fondamentale : prédire le prochain token
BODY:
Avant toute chose, il faut dissiper le mystère. Un LLM (Large Language Model) ne « comprend » pas au sens humain : il fait **une seule chose**, prédire le token suivant étant donné les tokens précédents. Tout le reste — raisonnement, traduction, code — émerge de cette tâche unique poussée à l'échelle extrême.

Formellement, le modèle apprend une distribution de probabilité :

P(x_t | x_1, x_2, …, x_(t-1))

Autrement dit : « étant donné la séquence jusqu'ici, quelle est la probabilité de chaque token possible comme suivant ? » Le modèle produit un vecteur de probabilités sur **tout le vocabulaire** (souvent 50 000 à 130 000 entrées).

### Pourquoi c'est si puissant

- Pour bien prédire le mot après « La capitale de la France est », il faut *encoder de la connaissance* (Paris).
- Pour continuer « 17 × 4 = », il faut *un embryon de calcul*.
- Pour finir un raisonnement logique, il faut *modéliser des structures abstraites*.

La prédiction du prochain token est donc un **objectif-prétexte** : simple à définir, mais qui force le modèle à apprendre presque tout sur le langage et le monde pour être bon. C'est l'idée centrale de Raschka (*Build a LLM From Scratch*) : le modèle est entraîné de façon **auto-supervisée**, le texte lui-même fournissant les « bonnes réponses » (le mot réellement suivant), sans étiquetage humain.

La génération de texte est alors simplement cette prédiction appliquée **en boucle** : on prédit un token, on l'ajoute à la séquence, on reprédit — c'est le mode *autorégressif*.
---SECTION---
HEADING: Tokenization : découper le texte en unités (BPE)
BODY:
Un réseau de neurones ne manipule que des nombres. La première étape est donc de convertir le texte en une suite d'entiers : ce sont les **tokens**. Un token n'est ni tout à fait un mot, ni une lettre — c'est un morceau intermédiaire.

### Pourquoi pas simplement des mots ou des lettres ?

- **Par mots** : le vocabulaire explose (millions de mots + fautes de frappe + noms propres), et tout mot inconnu devient un trou (`<UNK>`).
- **Par caractères** : le vocabulaire est minuscule, mais les séquences deviennent très longues et le modèle doit tout réapprendre depuis zéro.

Le **BPE** (Byte Pair Encoding), utilisé par GPT, est le compromis. L'algorithme part des caractères et **fusionne itérativement la paire de symboles la plus fréquente** :

```
Corpus initial :  l o w   l o w e r   n e w e s t
Paire la + fréquente : (e, s) → fusion en "es"
Puis (es, t) → "est"
Puis (l, o) → "lo"
...
```

Après quelques milliers de fusions, on obtient un vocabulaire où les mots fréquents sont un seul token (`the`, ` dog`) et les mots rares se décomposent en sous-mots (`tokenization` → `token` + `ization`). Résultat : **aucun mot n'est jamais inconnu** (au pire on retombe sur des octets bruts), et les séquences restent courtes.

### Repères concrets

- Règle de pouce en anglais : **~1 token ≈ 4 caractères ≈ 0,75 mot**.
- L'espace fait généralement partie du token (` chat` ≠ `chat`), ce qui explique certaines bizarreries de comptage.
- Le même modèle « voit » `cat` comme, par exemple, l'entier `2543` — un simple indice dans une table.

C'est ce simple indice qui va, à la section suivante, se transformer en vecteur riche de sens.
---SECTION---
HEADING: Embeddings : donner un sens géométrique aux tokens
BODY:
Un token n'est qu'un entier, sans structure : rien ne dit que `2543` (« cat ») est proche de `2544` (« dog »). L'**embedding** résout cela en associant à chaque token un **vecteur** de dimension d (par exemple 768, 4096…) dans un espace continu.

Concrètement, c'est une grande table apprise, la **matrice d'embedding** de taille `vocab × d`. Le token d'indice `i` récupère simplement la ligne `i` :

```python
# token_ids : [15, 2543, 88]
embeddings = embedding_matrix[token_ids]  # shape (3, d)
```

### L'intuition clé : le sens devient de la géométrie

Ces vecteurs ne sont pas aléatoires : ils sont **appris** pendant l'entraînement de sorte que la position dans l'espace encode le sens. Des mots utilisés dans des contextes similaires finissent proches. Cela rend possibles des relations *arithmétiques* célèbres :

roi - homme + femme ≈ reine

La direction « masculin → féminin » devient un **vecteur de translation** cohérent dans l'espace. De même, il existe des directions approximatives pour le pluriel, le temps verbal, ou le pays → capitale.

### Ce qu'il faut retenir

- L'embedding transforme un symbole discret en un point dans un espace **continu et différentiable** — indispensable pour que la descente de gradient fonctionne.
- La **proximité** (distance cosinus) mesure la similarité sémantique.
- Ces vecteurs sont le véritable « langage interne » du modèle. Tout le Transformer travaille en manipulant et en déplaçant ces points dans l'espace.

À ce stade, chaque token est un vecteur — mais **isolé**, sans savoir qui l'entoure. C'est le rôle de l'attention de faire dialoguer ces vecteurs.
---SECTION---
HEADING: L'intuition de l'attention : le contexte change le sens
BODY:
Le sens d'un mot dépend de son entourage. Dans « la **souris** a mangé le fromage » et « j'ai cliqué avec la **souris** », le même token `souris` doit finir avec des représentations différentes. Un embedding statique ne suffit pas : il faut un mécanisme qui **mélange l'information entre les mots**. C'est l'**attention**.

### L'idée centrale

Pour chaque mot, l'attention pose la question : *« parmi tous les autres mots de la phrase, lesquels sont pertinents pour m'enrichir, et à quel point ? »* Elle calcule un **score de pertinence** entre chaque paire de mots, puis construit une nouvelle représentation de chaque mot comme une **moyenne pondérée** des autres.

Reprenons « souris » + « cliqué » : le mot `souris` va accorder un poids d'attention élevé à `cliqué`, absorber une part de son vecteur, et sa représentation glissera vers le sens « périphérique informatique ». Le contexte a littéralement **déplacé le point dans l'espace**.

### La métaphore de la recherche (Alammar)

Jay Alammar (*The Illustrated Transformer*) propose une analogie qui structure tout le reste : l'attention fonctionne comme un système de **recherche par clé-valeur**.

- Chaque mot émet une **requête** (Query) : « voici ce que je cherche ».
- Chaque mot expose une **clé** (Key) : « voici ce que je propose ».
- Et une **valeur** (Value) : « voici l'information que je transmets si on me sélectionne ».

On compare chaque requête à toutes les clés pour savoir *où regarder*, puis on récupère un mélange des valeurs. La section suivante formalise ce mécanisme avec les matrices Q, K, V — le cœur mathématique du Transformer.
---SECTION---
HEADING: Self-attention : les matrices Q, K, V en détail
BODY:
Voici le cœur battant du Transformer, tiré de Vaswani et al. (*Attention Is All You Need*, 2017). Partons de la séquence d'embeddings X (une ligne par token, dimension d).

### Étape 1 — Projeter en Q, K, V

On apprend trois matrices de poids W^Q, W^K, W^V. Chaque token est projeté en trois vecteurs :

Q = X W^Q K = X W^K V = X W^V

Le même mot joue donc **trois rôles** simultanément : ce qu'il cherche (Q), ce qu'il offre comme étiquette (K), et le contenu qu'il transmet (V).

### Étape 2 — Scores par produit scalaire

La pertinence entre un token i et un token j est le **produit scalaire** q_i · k_j. Pourquoi le produit scalaire ? Parce qu'il mesure l'**alignement** entre deux vecteurs : grand et positif s'ils pointent dans la même direction (requête et clé « compatibles »), proche de zéro s'ils sont orthogonaux. Sous forme matricielle, on calcule tous les scores d'un coup :

scores = Q K^\top

### Étape 3 — Normaliser en poids (softmax)

On transforme chaque ligne de scores en une distribution de probabilités qui somme à 1 avec le **softmax**. Chaque poids dit : *« quelle fraction de mon attention je consacre à ce mot »*. Enfin, on mélange les valeurs :

sortie_i = Σ_j poids_(ij) \, v_j

La formule complète, la plus importante du cours :

Attention(Q,K,V) = softmax\!((QK^\top)/(√(d_k)))V

Chaque token ressort enrichi d'un mélange pondéré du contexte. Reste à expliquer ce mystérieux √(d_k) au dénominateur — c'est l'objet de la section suivante.
---SECTION---
HEADING: Pourquoi diviser par √d_k : stabiliser le softmax
BODY:
Le facteur (1)/(√(d_k)) (où d_k est la dimension des vecteurs clés) semble anodin, mais il est essentiel à la stabilité de l'entraînement. C'est le « **scaled** » de *scaled dot-product attention*.

### Le problème sans mise à l'échelle

Un produit scalaire est une somme de d_k termes. Si les composantes de q et k sont des variables aléatoires indépendantes de variance 1, alors :

- l'espérance du produit scalaire reste 0,
- mais sa **variance vaut d_k**, donc son écart-type vaut √(d_k).

Avec d_k = 64, les scores fluctuent typiquement dans une plage d'écart-type 8 ; avec de grandes dimensions, certains scores deviennent très grands (positifs ou négatifs).

### Pourquoi c'est un problème pour le softmax

Le softmax est **exponentiel**. Face à des scores très écartés, il **sature** : il attribue presque tout le poids (≈ 1) au plus grand score et écrase les autres vers 0. Le mécanisme d'attention devient alors quasi *binaire* et rigide.

Surtout, dans les régions saturées, le **gradient du softmax devient minuscule** (il tend vers 0). L'apprentissage se bloque : c'est le phénomène de gradient évanescent, mortel pour la descente de gradient.

### La solution

En divisant par √(d_k), on **ramène la variance des scores à 1**, quelle que soit la dimension. Le softmax reste dans sa zone « douce », sensible et différentiable, et les gradients circulent correctement. C'est un exemple parfait de détail mathématique en apparence mineur mais qui conditionne l'apprentissage.
---SECTION---
HEADING: Le masque causal : ne pas voir le futur
BODY:
Dans un modèle génératif (type GPT), il y a une contrainte absolue : pour prédire le token en position t, le modèle ne doit utiliser **que** les tokens 1 à t. S'il pouvait « voir » les tokens suivants pendant l'entraînement, il tricherait — la tâche de prédiction deviendrait triviale et il n'apprendrait rien d'utile.

### Comment on impose cette contrainte

On applique un **masque causal** (ou masque triangulaire) sur la matrice des scores, **avant** le softmax. Toutes les positions « futures » (où j > i) reçoivent la valeur -∞ :

```
Scores après masquage (exemple 4 tokens) :
        j=1     j=2     j=3     j=4
i=1  [ s11    -inf    -inf    -inf ]
i=2  [ s21     s22    -inf    -inf ]
i=3  [ s31     s32     s33    -inf ]
i=4  [ s41     s42     s43     s44 ]
```

Pourquoi -∞ ? Parce qu'après passage dans le softmax, e^(-∞) = 0 : le poids d'attention vers le futur devient **exactement nul**. Chaque token ne peut donc s'informer que de lui-même et de son passé.

### La conséquence pratique décisive

Ce masque permet d'entraîner le modèle sur **toutes les positions d'une phrase en parallèle**, en une seule passe, tout en simulant une génération strictement gauche-à-droite. C'est ce qui distingue l'attention **causale** (GPT, décodeur) de l'attention **bidirectionnelle** (BERT, encodeur), où chaque token voit toute la phrase — utile pour comprendre, mais pas pour générer.
---SECTION---
HEADING: Attention multi-tête : plusieurs regards en parallèle
BODY:
Une seule attention ne capture qu'**un seul type de relation** à la fois. Or dans une phrase, un mot entretient simultanément plusieurs liens : grammatical (avec son verbe), sémantique (avec un synonyme), positionnel (avec le mot précédent). La solution de Vaswani et al. : faire tourner **plusieurs attentions en parallèle**, les « têtes ».

### Le mécanisme

Au lieu d'une attention en dimension d, on en fait h (par exemple 8, 12, 96…) en dimension réduite d_k = d/h chacune. Chaque tête a **ses propres** matrices W^Q, W^K, W^V et apprend donc à regarder un aspect différent.

```
Entrée (dim d)
   ├── tête 1 : W1_Q, W1_K, W1_V → attention → sortie1 (dim d/h)
   ├── tête 2 : W2_Q, W2_K, W2_V → attention → sortie2
   ├── ...
   └── tête h
Concaténation des h sorties (redonne dim d) → projection W^O → sortie finale
```

### Pourquoi ça marche mieux

- **Spécialisation** : l'analyse des modèles entraînés montre des têtes qui suivent la syntaxe, d'autres qui relient un pronom à son antécédent, d'autres qui regardent juste le mot d'avant.
- **Sous-espaces distincts** : chaque tête projette dans un sous-espace différent de l'espace d'embedding, capturant des motifs qu'une attention unique moyennerait et perdrait.
- **Coût maîtrisé** : comme d_k = d/h, faire h têtes coûte à peu près autant qu'une seule grande attention — on gagne en richesse sans exploser le calcul.

La projection finale W^O recombine ces multiples points de vue en une représentation unique. Le multi-tête est ainsi l'un des ingrédients majeurs de la puissance des Transformers.
---SECTION---
HEADING: Encodage positionnel : réinjecter l'ordre des mots
BODY:
Un fait surprenant : l'attention est **invariante à l'ordre**. Si vous mélangez les mots d'une phrase, les produits scalaires q_i · k_j sont identiques — l'attention voit un « sac de mots ». Or « le chien mord l'homme » ≠ « l'homme mord le chien ». Il faut donc **injecter explicitement la position**.

### La solution originelle : l'encodage sinusoïdal

Vaswani et al. ajoutent aux embeddings un vecteur qui dépend de la position, construit avec des sinus et cosinus de fréquences différentes :

PE_((pos, 2i)) = \sin\!((pos)/(10000^(2i/d))) PE_((pos, 2i+1)) = \cos\!((pos)/(10000^(2i/d)))

L'intuition : c'est comme un **nombre binaire continu**. Les dimensions de basse fréquence changent lentement (bits de poids fort), celles de haute fréquence rapidement (bits de poids faible). Chaque position a ainsi une **signature unique**, et surtout les positions relatives se déduisent par des relations linéaires — le modèle peut apprendre « 3 mots plus loin » de façon générique.

### L'approche moderne : RoPE (Rotary Position Embedding)

Les LLM récents (LLaMA, Mistral…) utilisent **RoPE**. Plutôt que d'*ajouter* un vecteur, RoPE **fait tourner** les vecteurs Q et K d'un angle proportionnel à leur position, par blocs de 2 dimensions.

L'élégance : le produit scalaire entre deux vecteurs tournés ne dépend plus que de leur **différence de position** (m - n). La position devient donc **intrinsèquement relative**, ce qui généralise mieux aux longues séquences et permet certaines techniques d'extension de contexte. C'est aujourd'hui le standard de fait.
---SECTION---
HEADING: Le bloc Transformer : résiduel, normalisation, FFN
BODY:
L'attention n'est qu'une moitié de l'histoire. Un **bloc Transformer** empile plusieurs composants, et on empile ensuite des dizaines de ces blocs identiques. Comprendre un bloc, c'est comprendre toute l'architecture.

Un bloc contient deux **sous-couches** : l'attention multi-tête, puis un réseau feed-forward (FFN). Chacune est enveloppée de deux éléments cruciaux : une **connexion résiduelle** et une **normalisation**.

### Connexion résiduelle : `x + f(x)`

Au lieu de remplacer l'entrée par la sortie de la sous-couche, on **ajoute** : `sortie = x + f(x)`. Chaque couche n'apprend qu'une *correction* (un résidu) à appliquer. C'est vital car :

- le gradient peut « court-circuiter » les couches via cette autoroute additive, ce qui **évite le gradient évanescent** dans les réseaux très profonds (Goodfellow, *Deep Learning*) ;
- cela rend l'empilement de 30, 80 voire plus de couches réellement entraînable.

### Normalisation : garder les activations stables

La **LayerNorm** normalise chaque vecteur (moyenne 0, variance 1 sur ses composantes) puis le re-scale avec des paramètres appris. Elle empêche les activations de diverger et lisse le paysage d'optimisation.

Beaucoup de LLM récents utilisent la **RMSNorm**, une variante allégée qui ne recentre pas (pas de soustraction de moyenne) mais divise seulement par la racine de la moyenne des carrés. Moins de calcul, performances équivalentes.

Un débat existe entre **Post-LN** (norme après le résiduel, article original) et **Pre-LN** (norme avant la sous-couche) ; le **Pre-LN** est aujourd'hui préféré car il stabilise l'entraînement des très grands modèles.
---SECTION---
HEADING: Le réseau feed-forward et l'activation GELU
BODY:
La seconde sous-couche de chaque bloc est un **réseau feed-forward** (FFN), appliqué **indépendamment à chaque position**. Si l'attention sert à *échanger* de l'information entre tokens, le FFN sert à *la transformer et la digérer*, token par token.

### Structure : expansion puis compression

Le FFN est un simple perceptron à deux couches, avec une **dimension cachée bien plus grande** (typiquement 4× la dimension du modèle) :

FFN(x) = W_2 · GELU(W_1 x + b_1) + b_2

Par exemple : d = 4096 → 16384 → 4096. On projette dans un espace élargi, on applique une non-linéarité, puis on recompresse. Cette expansion donne au modèle de la **capacité de calcul et de mémorisation** : c'est là que réside une grande partie des « connaissances » factuelles du modèle.

### Pourquoi GELU plutôt que ReLU

La non-linéarité est **indispensable** : sans elle, empiler des couches linéaires reviendrait à une seule couche linéaire (le modèle ne pourrait apprendre que des relations… linéaires).

- **ReLU** : \max(0, x) — coupe brutalement tout le négatif à zéro.
- **GELU** (Gaussian Error Linear Unit) : x · Φ(x), où Φ est la fonction de répartition de la loi normale. C'est une version **douce** de ReLU qui laisse passer une petite partie des valeurs légèrement négatives.

Cette douceur rend la fonction **différentiable partout** et empiriquement plus performante sur les Transformers. C'est le choix par défaut de GPT, BERT et la plupart des LLM (certains modèles récents préfèrent des variantes comme SwiGLU).

En résumé, un bloc alterne un temps de **communication** (attention) et un temps de **réflexion** (FFN) — et c'est la répétition de ce motif qui construit la profondeur.
---SECTION---
HEADING: Complexité O(n²) et FlashAttention
BODY:
L'attention a un talon d'Achille : son **coût quadratique** en la longueur de séquence n. La matrice des scores QK^\top a une taille n × n — chaque token est comparé à tous les autres.

### Ce que le quadratique implique

Doubler la longueur du contexte **quadruple** le calcul et la mémoire de l'attention. Passer de 1 000 à 100 000 tokens multiplie le coût par 10 000. C'est **la** raison pour laquelle les longs contextes ont longtemps été si difficiles et coûteux :

- Coût en **calcul** : O(n^2 · d).
- Coût en **mémoire** : O(n^2) pour stocker la matrice des poids d'attention.

### FlashAttention : le même résultat, sans la matrice complète

**FlashAttention** (Dao et al.) est une avancée majeure. Observation clé : sur un GPU, le goulot d'étranglement n'est pas le calcul brut mais les **transferts mémoire** entre la mémoire lente (HBM) et la mémoire ultra-rapide (SRAM). Le coût réel vient d'écrire puis relire l'énorme matrice n × n.

FlashAttention calcule l'attention **par tuiles** (blocs), sans jamais matérialiser la matrice complète en mémoire lente. Il utilise un softmax « en ligne » (incrémental) et garde tout dans la SRAM. Le résultat est **numériquement identique** — ce n'est pas une approximation — mais bien plus rapide et bien plus économe en mémoire.

L'impact : la mémoire devient **linéaire** en n (au lieu de quadratique), ce qui a rendu possibles les contextes de dizaines voire centaines de milliers de tokens des LLM actuels. C'est un exemple magistral où comprendre le *matériel* débloque un progrès algorithmique.
---SECTION---
HEADING: L'entraînement : cross-entropy, backprop et Adam
BODY:
Comment le modèle apprend-il ses milliards de poids ? Par la même boucle que tout réseau de neurones, mais à grande échelle (Goodfellow, *Deep Learning*).

### La fonction de perte : cross-entropy

En sortie, le modèle produit des scores bruts (**logits**) sur tout le vocabulaire, transformés en probabilités par softmax. On les compare au vrai token suivant avec la **cross-entropy** :

\mathcal{L} = -\log P(token correct)

L'intuition est limpide : si le modèle donne une forte probabilité au bon token, -\log est proche de 0 (faible perte) ; s'il lui donne une probabilité minuscule, la perte explose. Minimiser la cross-entropy revient à **maximiser la probabilité du texte réel**.

### Backpropagation : distribuer le blâme

La **rétropropagation** calcule, par la règle de dérivation en chaîne, la dérivée de la perte par rapport à **chaque** poids : de combien ce poids a contribué à l'erreur. C'est un gradient — un vecteur qui pointe dans la direction d'augmentation de l'erreur.

### Adam / AdamW : la descente intelligente

On met à jour les poids dans la direction opposée au gradient. Plutôt que la descente de gradient basique, les LLM utilisent **Adam**, qui pour chaque paramètre :

- garde une moyenne mobile du gradient (**momentum**, une inertie qui lisse la trajectoire) ;
- garde une moyenne mobile du gradient **au carré** pour adapter le pas à chaque paramètre (grands pas là où c'est plat, petits pas là où ça oscille).

**AdamW** ajoute un *weight decay* correctement découplé (une régularisation qui empêche les poids de trop grossir, limitant le surapprentissage). C'est aujourd'hui l'optimiseur standard des LLM.
---SECTION---
HEADING: Warmup et planification du taux d'apprentissage
BODY:
Le **taux d'apprentissage** (learning rate) — la taille du pas de mise à jour — est l'hyperparamètre le plus critique. Trop grand, l'entraînement diverge ; trop petit, il rampe. Pour les LLM, on ne le garde pas constant : on le **planifie** dans le temps.

### Le warmup : démarrer en douceur

Au tout début, les poids sont aléatoires et les gradients sont énormes et chaotiques. Appliquer d'emblée un grand taux ferait « exploser » le modèle. Le **warmup** augmente donc le taux **linéairement depuis ~0** pendant les premiers milliers de pas.

L'analogie : on ne démarre pas une voiture pied au plancher sur une plaque de verglas. On laisse d'abord le modèle trouver une région stable de l'espace des paramètres.

### Le decay : ralentir pour affiner

Après le pic, on **décroît** progressivement le taux, typiquement selon une courbe en **cosinus** jusqu'à une petite valeur. Au début, de grands pas pour explorer largement ; à la fin, de petits pas pour se poser finement au fond d'un minimum sans le dépasser.

```
taux
 │        ╭─────╮
 │       ╱       ╰────╮
 │      ╱              ╰────╮___
 │     ╱                       ╰──
 │____╱________________________________ pas
   warmup   décroissance (cosinus)
```

Cette combinaison **warmup + cosine decay** est quasi universelle dans l'entraînement des grands modèles. Elle illustre qu'entraîner un LLM n'est pas qu'une question d'architecture, mais aussi d'un **calendrier d'optimisation** soigneusement réglé.
---SECTION---
HEADING: Pré-entraînement, fine-tuning et alignement (RLHF, DPO)
BODY:
Un modèle utile comme ChatGPT ne naît pas en une étape. Il y a une **chaîne** de phases, chacune avec un objectif distinct.

### 1. Pré-entraînement : ingérer le monde

Le modèle apprend la prédiction du prochain token sur un **corpus gigantesque** (des milliers de milliards de tokens : web, livres, code). C'est de loin la phase la plus coûteuse (des millions d'euros de calcul). Le résultat est un **modèle de base** : brillant pour compléter du texte, mais pas pour « obéir ». Demandez-lui une question, il pourrait répondre par… dix autres questions (car c'est un début de texte plausible).

### 2. Fine-tuning supervisé (SFT) : apprendre le format

On poursuit l'entraînement sur un jeu, plus petit mais **de haute qualité**, de paires (instruction → bonne réponse) rédigées par des humains. Le modèle apprend le **comportement** attendu : répondre, suivre des consignes, adopter un format de dialogue.

### 3. Alignement sur les préférences humaines

Le SFT ne suffit pas à capter des qualités subtiles (utilité, honnêteté, innocuité). Deux approches :

- **RLHF** (Reinforcement Learning from Human Feedback) : des humains **classent** des réponses ; on entraîne un *modèle de récompense* à imiter ces préférences, puis on optimise le LLM pour maximiser cette récompense (via l'algorithme PPO). Puissant mais complexe et instable.
- **DPO** (Direct Preference Optimization) : plus récent et plus simple. À partir des mêmes paires de préférences (réponse préférée vs rejetée), DPO **se passe du modèle de récompense** et optimise directement le LLM par une perte de classification élégante. Résultat comparable, pipeline bien plus léger — d'où son adoption rapide.

Cette distinction **pré-entraînement (savoir) vs alignement (comportement)** est fondamentale : le premier donne les connaissances, le second les rend utiles et sûres.
---SECTION---
HEADING: L'inférence et le KV-cache
BODY:
Une fois entraîné, le modèle **génère**. La génération est **autorégressive** : un token à la fois, chacun réinjecté pour produire le suivant. Cela crée un défi de performance majeur — et une optimisation incontournable.

### Le problème de la redondance

Naïvement, pour générer le token 101, on repasserait toute la séquence de 100 tokens dans le modèle. Pour le token 102, les 101… Or, à chaque étape, on **recalculerait les Keys et Values de tous les tokens déjà traités** — un gâchis colossal, car ces K et V ne changent pas.

### Le KV-cache : mémoriser au lieu de recalculer

L'idée est simple et décisive : on **stocke en mémoire les vecteurs K et V** de chaque token dès qu'ils sont calculés. À l'étape suivante, on ne calcule les Q, K, V **que pour le nouveau token**, et on récupère le reste dans le cache.

- Sans cache : coût par token ∝ n (on refait tout) → génération globale en O(n^2).
- Avec cache : coût par token ∝ 1 pour la partie K/V → énorme accélération.

### La contrepartie : la mémoire

Le KV-cache **échange du calcul contre de la mémoire**. Sa taille croît avec la longueur du contexte × le nombre de couches × les têtes, et il peut devenir énorme (plusieurs Go). C'est aujourd'hui l'un des principaux **goulots mémoire** de l'inférence, ce qui motive des techniques comme la *Grouped-Query Attention* (partager les K/V entre têtes) pour l'alléger.
---SECTION---
HEADING: Le sampling : temperature, top-k, top-p et beam
BODY:
À chaque étape, le modèle produit une distribution de probabilités sur le vocabulaire. Comment en tirer le prochain token ? Ce choix, la **stratégie de décodage**, façonne totalement le style du texte : trop rigide il devient robotique et répétitif, trop libre il devient incohérent.

### Le curseur de base : la température

La **température** T divise les logits avant le softmax : softmax(z / T).

- T → 0 : la distribution se **pique** sur le token le plus probable → sortie déterministe (*greedy*), sûre mais monotone et sujette aux répétitions.
- T = 1 : distribution d'origine.
- T > 1 : distribution **aplatie** → plus de diversité et de créativité, mais plus de risque d'incohérence.

### Filtrer la « longue traîne » : top-k et top-p

Le vocabulaire contient des dizaines de milliers de tokens ; la plupart sont absurdes dans le contexte, mais leur probabilité cumulée n'est pas nulle. On les élague avant de tirer :

- **top-k** : ne garder que les **k tokens** les plus probables (ex. k = 40), renormaliser, puis échantillonner.
- **top-p** (*nucleus sampling*) : garder le plus petit ensemble de tokens dont la probabilité cumulée atteint **p** (ex. 0,9). Sa force : la taille de l'ensemble s'**adapte** — étroit quand le modèle est sûr, large quand il hésite.

### Beam search : explorer plusieurs pistes

Le **beam search** garde en parallèle les b séquences partielles les plus probables (les « faisceaux ») et développe chacune, retenant à la fin la séquence globalement la plus probable. Utile pour des tâches à réponse « exacte » comme la traduction, mais souvent trop rigide et peu créatif pour du dialogue ouvert — d'où la préférence pour top-p en génération conversationnelle.
---SECTION---
HEADING: Lois d'échelle et le tournant Chinchilla
BODY:
Pourquoi les modèles ont-ils tant grossi, et jusqu'où ? Les **lois d'échelle** (scaling laws) décrivent comment la performance s'améliore avec trois leviers : la **taille du modèle** (nombre de paramètres N), la **quantité de données** (tokens D) et le **calcul** (compute C).

### La découverte fondatrice

La performance (la perte) diminue de façon **prévisible**, selon une **loi de puissance**, à mesure qu'on augmente ces facteurs. C'est capital : cela permet de **prédire** la performance d'un très grand modèle à partir de petits, et donc de justifier des investissements massifs. Pas de plateau brutal en vue — juste des rendements décroissants réguliers.

### Le tournant Chinchilla (DeepMind, 2022)

Un résultat a rebattu les cartes. Jusque-là, la course visait surtout **plus de paramètres** (GPT-3 : 175 milliards). Chinchilla a montré que ces modèles étaient **massivement sous-entraînés** : pour un budget de calcul donné, on obtenait de meilleurs résultats avec un modèle **plus petit** nourri de **beaucoup plus de données**.

- Règle de pouce Chinchilla : environ **20 tokens d'entraînement par paramètre** pour un entraînement « compute-optimal ».
- Preuve par l'exemple : Chinchilla (70 milliards de paramètres) a **battu** GPT-3 (175 milliards) en étant entraîné sur bien plus de données.

### La conséquence durable

Cela a réorienté tout le domaine vers la **qualité et la quantité des données**, pas seulement la taille. Cela explique aussi la vague de modèles « petits mais très bien entraînés » (comme LLaMA), volontairement nourris **au-delà** de l'optimum Chinchilla pour rester peu coûteux **à l'inférence** — un arbitrage entre coût d'entraînement et coût d'usage.
---SECTION---
HEADING: Quantification : int8, GPTQ, NF4 et QLoRA
BODY:
Un modèle de 70 milliards de paramètres en précision 16 bits pèse ~140 Go — impossible à charger sur un GPU grand public. La **quantification** réduit la précision numérique des poids pour **comprimer** le modèle, avec une perte de qualité minime.

### L'idée

Les poids sont normalement stockés en 16 ou 32 bits. La quantification les représente sur **moins de bits** (8, 4, voire moins), en projetant les valeurs continues sur une grille discrète. Passer de 16 à 4 bits **divise la taille mémoire par 4**.

- **int8** : quantification 8 bits, robuste, souvent quasi sans perte.
- **GPTQ** : méthode 4 bits *post-entraînement* sophistiquée, qui quantifie couche par couche en **minimisant l'erreur** introduite sur les activations, à l'aide d'informations de courbure (hessien). Excellente qualité en 4 bits.
- **NF4** (NormalFloat 4-bit) : un format 4 bits astucieux du projet **QLoRA**, conçu pour des poids distribués selon une loi **normale** (ce qui est le cas des poids de réseaux). Il place ses niveaux de quantification de façon **information-théoriquement optimale** pour cette distribution.

### QLoRA : fine-tuner un géant sur un seul GPU

**QLoRA** combine deux idées : (1) charger le modèle de base **gelé** en NF4 (4 bits) pour tenir en mémoire, et (2) n'entraîner par-dessus que de petits adaptateurs **LoRA** (section suivante) en précision normale. On peut ainsi **fine-tuner un modèle de 65 milliards de paramètres sur un seul GPU de 48 Go** — une démocratisation majeure. La distinction clé : NF4/GPTQ compressent pour **l'inférence**, QLoRA rend possible le **fine-tuning** économique.
---SECTION---
HEADING: LoRA : adapter un modèle à moindre coût
BODY:
Fine-tuner un LLM entier signifie mettre à jour **tous** ses milliards de poids : coûteux en calcul, et surtout on obtient une copie complète (des dizaines de Go) par tâche. **LoRA** (Low-Rank Adaptation) résout élégamment ce problème.

### L'intuition mathématique : le faible rang

Observation clé : la **mise à jour** Δ W apprise pendant un fine-tuning a un **rang intrinsèque faible**. Autrement dit, bien que Δ W soit une grande matrice, l'essentiel de son information tient dans très peu de dimensions. On peut donc l'approximer par un **produit de deux petites matrices** :

Δ W = B A avec A ∈ R^(r × d), \; B ∈ R^(d × r), \; r ≪ d

Le **rang** r est petit (souvent 8, 16, 64). Pour une couche 1000 × 1000 (un million de poids), une adaptation LoRA de rang 8 ne coûte que 2 × 8 × 1000 = 16\,000 paramètres — **60× moins**.

### Comment ça marche

On **gèle** entièrement les poids d'origine W et on n'entraîne que A et B. La couche calcule :

h = W x + BA\,x

W ne bouge pas ; seul le petit « patch » BA apprend la tâche.

### Les bénéfices concrets

- **Mémoire d'entraînement** réduite drastiquement (moins de gradients et d'états d'optimiseur à stocker).
- **Adaptateurs minuscules** : quelques Mo par tâche au lieu de dizaines de Go. On peut collectionner des dizaines d'adaptateurs pour un même modèle de base et **les échanger à la volée**.
- **Aucune latence ajoutée** à l'inférence : on peut **fusionner** BA dans W une fois l'entraînement fini.

LoRA (surtout couplé à la quantification via QLoRA) est devenu la méthode de fine-tuning la plus répandue en pratique.
---SECTION---
HEADING: Hallucinations et perplexité : limites et mesure
BODY:
Terminons par deux notions essentielles pour un usage lucide des LLM : d'où viennent les erreurs, et comment mesure-t-on la qualité d'un modèle de langage.

### Pourquoi les LLM hallucinent

Une **hallucination** est une affirmation fausse énoncée avec assurance. Ce n'est pas un bug accidentel mais une **conséquence directe** du principe de fonctionnement :

- Le modèle optimise la **plausibilité** statistique, pas la vérité. Il génère ce qui « sonne juste » selon ses données, sans base de faits vérifiable.
- Il n'a **pas de mémoire des sources** ni de mécanisme intrinsèque de vérification. La connaissance est diluée dans les poids, pas stockée comme des faits consultables.
- Le sampling **introduit du hasard** : à température non nulle, le modèle choisit parfois un token moins probable qui l'engage dans une affirmation inventée.
- Face à une question dont il ignore la réponse, la complétion la plus « probable » reste souvent une réponse au **ton assuré** (car ses données d'entraînement en regorgent), plutôt qu'un « je ne sais pas ».

Comprendre cela, c'est comprendre pourquoi le **RAG** (fournir des documents en contexte) et la vérification externe sont nécessaires : ils réancrent le modèle sur des faits réels.

### La perplexité : mesurer la « surprise »

La **perplexité** est la métrique reine pour évaluer un modèle de langage. Elle se définit comme l'exponentielle de la cross-entropy moyenne :

Perplexité = e^{\mathcal{L}}

Intuition : c'est le **facteur de branchement effectif** — en moyenne, entre combien de tokens le modèle hésite-t-il à chaque étape ? Une perplexité de 10 signifie qu'il est aussi « perdu » que s'il choisissait uniformément parmi 10 options.

- Perplexité **basse** = le modèle est peu surpris par le texte réel = il le prédit bien.
- C'est une mesure de **fluidité prédictive**, pas de véracité : un modèle peut avoir une excellente perplexité et pourtant halluciner. D'où l'importance de compléter par des évaluations de tâches et de factualité.

Vous disposez maintenant d'une vision complète, du token brut jusqu'aux limites du système — de quoi non seulement utiliser un LLM, mais raisonner sur son comportement.
===END===
