# Le leadership technique sans manager personne

Il existe une idée fausse, tenace, qui abîme beaucoup de bonnes carrières : croire qu'au-delà d'un certain niveau, avoir de l'impact veut forcément dire manager des gens. Que le seul chemin vers le haut passe par un organigramme où des noms sont rattachés au tien.

C'est faux. Il existe une autre voie, tout aussi sérieuse, tout aussi impactante, où tu restes profondément technique et où tu influences par ton expertise plutôt que par ton autorité hiérarchique. On l'appelle la **voie IC** (*Individual Contributor*), et son sommet porte le nom de **Staff Engineer**, puis Principal, Distinguished, Fellow.

Ce chapitre t'intéresse pour une raison précise. En tant que CTO, une grande partie de ton travail *est* du leadership technique sans autorité directe sur ceux que tu influences : tu ne codes pas à la place de tes équipes, tu n'imposes pas tes choix par décret sans t'y brûler, et pourtant tu dois orienter des décisions qui engagent l'entreprise pour des années. Les compétences du Staff Engineer sont exactement celles dont tu as besoin. Les comprendre, c'est aussi comprendre comment tu dois opérer toi-même — et, accessoirement, comment repérer et faire grandir les gens qui deviendront tes relais techniques.

---

## Ce que « Staff+ » veut vraiment dire

**Pourquoi ça compte.** Le mot « senior » est saturé. Dans beaucoup d'entreprises, on devient Senior Engineer après cinq à huit ans, et c'est parfaitement acceptable de s'y arrêter : c'est un *niveau de carrière*, un palier stable où l'on peut faire une longue et belle carrière. Mais au-delà commence une bifurcation nette. D'un côté le **management track** : gérer des personnes, déléguer, démultiplier l'impact via une équipe. De l'autre l'**IC track** : rester technique, démultiplier l'impact via l'expertise et l'influence. Les deux mènent à un niveau d'influence équivalent à celui d'un VP. Aucun des deux n'est une promotion de l'autre — ce sont deux métiers différents.

**L'intuition.** Un Senior excellent optimise *son* périmètre : il livre son code, résout ses tickets, tient ses délais. Un ingénieur Staff+ optimise *au-delà* de son propre code. Son unité de mesure n'est plus la feature qu'il a écrite, mais le problème d'organisation qu'il a débloqué : une architecture qui a permis à dix équipes d'avancer, une migration qui a évité une dette fatale, une décision technique qui a fait gagner un an à toute l'ingénierie. C'est le saut mental fondamental : **ton impact se mesure à ce que les autres réussissent grâce à toi, pas à ce que tu produis seul.**

**La substance.** La progression IC ressemble à ceci :

```
Junior (0-2 ans) → Mid-Level (2-5 ans) → Senior (5-8 ans)  ← palier stable, OK d'y rester
                                              │
              ┌───────────────────────────────┴───────────────────────────┐
       MANAGER TRACK                                              IC TRACK
       Engineering Manager                                        Staff Engineer
       Senior EM                                                  Senior Staff
       Director                                                   Principal
       VP Engineering                                             Distinguished
       CTO                                                        Fellow
```

Les deux colonnes peuvent atteindre une influence de niveau VP. Le Staff+ est simplement **moins visible** — pas de titre qui annonce « je commande » — mais tout aussi déterminant. On peut passer d'une voie à l'autre, mais chaque changement coûte un à deux ans de courbe d'apprentissage : ce sont des compétences distinctes qu'on ne recycle pas telles quelles.

**La nuance.** Ce n'est pas une échelle à gravir en deux ans. Staff+ est une trajectoire de dix à quinze ans. Et surtout, ce n'est pas un titre : c'est un niveau d'impact. Beaucoup d'ingénieurs opèrent déjà « au niveau Staff » avant d'en avoir le titre — et le titre, souvent, ne fait que reconnaître ce qui existait déjà.

---

## Les quatre archétypes

**Pourquoi ça compte.** La découverte la plus utile de Will Larson, dans son livre *Staff Engineer*, est que « Staff Engineer » ne désigne pas *un* rôle mais **quatre rôles distincts**, avec des responsabilités, des rythmes et des personnalités différents. Confondre les quatre est une source majeure de frustration : on peut être un excellent Solver et un piètre Architect, non par manque de talent, mais parce que ce sont des métiers différents. Savoir lequel te ressemble, c'est savoir où tu seras bon — et où tu souffriras.

Voici les quatre.

### Le Tech Lead — le leader d'un projet

C'est l'archétype le plus répandu et le plus lisible. Le Tech Lead **guide un ou deux projets critiques** : il porte l'exécution technique, coordonne avec le Produit et le Design, mentore l'équipe, et garde les mains dans le code — environ **30 à 50 % de son temps**. Son périmètre est une équipe ou un projet, sur un horizon de six à douze mois.

Concrètement, imagine un Tech Lead sur une migration de PostgreSQL vers Spanner. Il définit la stratégie (une approche par phases), écrit lui-même l'outillage de migration parce que c'est le chemin critique, relit tous les patterns d'accès à la base parce que c'est le cœur architectural, tient les standups quotidiens et envoie un point hebdomadaire au Director. Un mélange constant d'architecture, de code, de revue et de communication.

Choisis cet archétype **si tu aimes livrer des produits, rester hands-on, et coordonner des gens** dans un rythme d'exécution soutenu. Fuis-le si tu détestes les réunions et la coordination, ou si tu rêves de recherche pure. Son point de bascule : Tech Lead → Senior Staff (multi-projets) → Principal (multi-équipes) ; ou, si les gens t'attirent plus que la technique, Tech Lead → Engineering Manager.

### L'Architect — le gardien de la cohérence d'un domaine

L'Architect ne porte pas un projet, il porte **un domaine entier** — l'infrastructure, la data, le ML. Son travail est de définir l'architecture de ce domaine, de préserver son **intégrité technique** (éviter que la dette s'accumule), de conseiller les Tech Leads sans exécuter à leur place, et de tenir une direction technique de long terme, sur **deux à cinq ans**. Il code peu : **10 à 30 %** du temps.

Un Architect de plateforme data, par exemple, définit l'architecture data de toute l'entreprise, relit les designs de pipelines d'une dizaine d'équipes, arbitre entre Airflow, Temporal et Dagster, écrit une RFC sur les principes de *data mesh* pour l'organisation, et produit chaque trimestre une feuille de route. Ses compétences clés : **la largeur plutôt que la profondeur** (connaître beaucoup de technologies), la pensée systémique (voir les connexions), la communication écrite, l'influence sans autorité, et une patience stratégique qui se compte en années.

Le danger de cet archétype est réel et porte des noms précis. La **tour d'ivoire** : concevoir sans comprendre la réalité du terrain. Le **décrochage du code** : perdre le contact avec la douleur de l'implémentation. Le **sur-engineering** : préférer l'architecture parfaite à la livraison. Et le **complexe d'autorité** : s'attendre à ce que les gens fassent ce qu'on dit parce qu'on l'a dit. Choisis cet archétype si tu préfères le design de systèmes à l'implémentation, si tu vois les motifs qui se répètent entre les équipes, et si tu sais être patient. Évite-le s'il te faut livrer du code chaque jour.

### Le Solver — le pompier des problèmes impossibles

Le Solver est parachuté sur les problèmes que personne d'autre ne parvient à résoudre. Sa mission : **attaquer l'impossible**, prototyper vite pour prouver qu'une solution existe, puis **transmettre** cette solution à l'équipe et passer au problème suivant. Il ne détient pas la propriété long terme de ce qu'il résout. Il code beaucoup : **50 à 70 %** du temps. Son périmètre tourne, d'un problème à l'autre.

Prends un cas typique : après une migration, les requêtes de la base sont cent fois plus lentes. Le Solver plonge une semaine dans les plans d'exécution jusqu'à trouver la cause, prototype le correctif la semaine suivante (réécrire la couche ORM), l'implémente et le déploie, forme l'équipe aux nouveaux patterns — puis, la cinquième semaine, s'en va vers le problème suivant en laissant la propriété à l'équipe. Ses compétences : le débogage profond (trouver l'aiguille dans la botte de foin), le prototypage rapide, la polyvalence (travailler dans n'importe quelle partie du code), l'enseignement, et — sous-estimé — **le lâcher-prise** : ne pas s'accrocher à ses propres solutions.

C'est un tempérament autant qu'un rôle. Les Solvers sont un peu des accros à l'adrénaline : ils adorent le défi, s'épanouissent en mode crise, et s'ennuient dès que tout fonctionne. Choisis-le si tu aimes l'impossible, si tu peux changer de contexte rapidement, et si tu n'as pas besoin de voir l'impact long terme de ton travail. Évite-le s'il te faut des projets stables et une trace durable.

### Le Right Hand — le bras droit d'un dirigeant

Le Right Hand **étend la portée d'un dirigeant** — un VP Engineering, un CTO. Il le représente dans les réunions qu'il ne peut pas tenir, mène des projets spéciaux à l'échelle de l'organisation, prend des décisions techniques stratégiques. C'est l'archétype qui code le moins : **0 à 20 %** du temps. Son périmètre est l'organisation entière.

Un exemple rend la chose tangible. Le CTO demande : « On triple de taille cette année. Est-ce que notre architecture va tenir ? » Le Right Hand passe le premier mois à évaluer l'architecture actuelle (entretiens, analyse), le deuxième à modéliser la montée en charge (tests de charge, planification de capacité), le troisième à présenter conclusions et recommandations au comité exécutif, puis pilote la migration si nécessaire. Il ne code presque pas, mais son levier est immense. Ses compétences : **la communication de niveau exécutif** (la clarté qu'on attend devant un board), la pensée stratégique mêlant business et technique, le sens politique de l'organisation, et le statut de conseiller de confiance à qui le dirigeant se confie.

Particularité décisive : **ce rôle ne se demande pas, il se propose.** Le chemin est toujours le même — tu excelles comme Solver, Architect ou Tech Lead ; un dirigeant remarque ton travail ; il te confie un problème stratégique ; tu livres quelque chose d'exceptionnel ; il te demande de devenir son bras droit permanent. Choisis-le si tu comprends le business autant que la technique et si l'impact à l'échelle de l'organisation te motive plus que le code quotidien. Évite-le si la politique te met mal à l'aise.

### Lire la carte des quatre

La comparaison, d'un coup d'œil :

| Dimension | Tech Lead | Architect | Solver | Right Hand |
|---|---|---|---|---|
| Part de code | 30-50 % | 10-30 % | 50-70 % | 0-20 % |
| Périmètre | 1 projet | 1 domaine | tournant | organisation |
| Horizon | 6-12 mois | 2-5 ans | 1-3 mois | variable |
| Communication | élevée | très élevée | moyenne | très élevée |
| Stratégie | moyenne | élevée | faible | très élevée |
| Exécution | très élevée | moyenne | très élevée | moyenne |
| Type d'influence | projet | technique | crise | exécutif |
| Étape suivante | Senior Staff | Principal | Principal | VP / CTO |

**La nuance à garder.** Personne n'est purement un seul archétype, et l'on migre de l'un à l'autre selon les saisons de sa carrière et les besoins de l'entreprise. Le tableau n'est pas une case dans laquelle t'enfermer : c'est un langage pour nommer ce que tu fais, reconnaître ce qui te fatigue, et discuter clairement des attentes avec ceux que tu diriges. Pour toi, CTO, il a une seconde utilité : quand tu confies une mission à un ingénieur senior, sache quel archétype tu lui demandes — parce que lui demander d'être Architect alors qu'il est un Solver dans l'âme, c'est programmer sa frustration.

---

## Influencer sans autorité

**Pourquoi ça compte.** C'est le cœur du métier Staff+, et le point où ta réalité de CTO ressemble le plus à la leur. L'autorité dit : « Fais-le parce que je suis ton manager. » L'influence dit : « Fais-le parce que c'est la bonne chose à faire. » Un Staff Engineer n'a aucun subordonné et doit pourtant orienter des dizaines d'ingénieurs. Toi, tu as le titre — mais si tu diriges *uniquement* par le titre, tu obtiendras de la conformité, pas de l'adhésion, et tu useras ton crédit à chaque décret. **L'influence est un capital ; l'autorité, une carte qu'on ne joue qu'en dernier.**

**L'intuition : d'où vient l'influence.** Elle ne se décrète pas, elle s'accumule. Les gens te suivent parce qu'ils font confiance à ton **jugement technique**, parce que tu as un **historique** de choses difficiles menées à bien, parce que tu les as **débloqués** par le passé, parce que tu **expliques clairement** le compliqué, parce que tu es **crédible** — c'est-à-dire honnête, y compris sur tes erreurs — et parce que tu **plaides pour la croissance des autres**. Chacune de ces sources se construit dans le temps ; aucune ne s'improvise le jour où tu en as besoin.

À l'inverse, voici ce qui ne marche jamais, et qui détruit le capital d'influence : **brandir son titre** (« en tant que Staff Engineer, tu devrais… »), le **« fais-le, point »** sans explication, l'**agressivité passive** (le sarcasme en revue de code), et le **contournement** (aller se plaindre au manager de la personne). Ce sont des raccourcis d'autorité — et ils signalent, précisément, que l'influence manque.

**La substance : la règle des 90/10.** L'idée la plus actionnable de tout ce chapitre. Tu influences **90 % du résultat en faisant 10 % du travail** — à condition de bien choisir ces 10 %. Prends un cas concret : tu veux que ton équipe adopte un nouveau framework de test.

La mauvaise approche produit 0 % d'adoption : écrire un document de cinquante pages sur les mérites du framework, le présenter en grand-messe d'ingénierie, et espérer. Personne ne l'utilise.

La bonne approche produit 90 % d'adoption : passer *une journée* à prototyper le framework sur une vraie feature, montrer le côte-à-côte — l'ancien code en 100 lignes, le nouveau en 20 —, le présenter simplement (« voilà ce que j'ai essayé »), et offrir : « je fais du pair-programming avec quiconque veut tester. » Les gens voient que c'est meilleur, essaient, et ça se propage. Les 10 %, c'est le prototype plus l'offre d'aide. Les 90 %, c'est l'adoption spontanée parce que la supériorité est *visible*. **Montrer, pas dire.**

**La revue de code comme levier d'influence.** Chaque revue est une occasion d'enseigner — ou de blesser. Comparons. Le commentaire pauvre : « C'est faux. Utilise X à la place. » Résultat : l'ingénieur se sent critiqué et n'apprend pas *pourquoi*. Le commentaire riche dit autre chose :

> « Beau travail sur l'algorithme ! Une suggestion : l'approche actuelle est en O(N²). À notre échelle (un million d'éléments), ça risque d'être lent. Une HashMap donnerait du O(N) — voici un croquis [extrait de code]. Content de faire du pair là-dessus si utile ! Dans tous les cas ça peut partir tel quel, on optimisera plus tard si on voit un souci de perf. »

La différence tient en cinq points : c'est **spécifique** (O(N²) contre O(N)), ça **explique le pourquoi** (l'échelle compte), ça **montre le comment** (l'extrait), ça **offre de l'aide** (le pair), et ça **ne bloque pas** (ça peut être livré tel quel). L'ingénieur apprend l'analyse de complexité *et* se sent soutenu. Tu as gagné en influence au lieu d'en dépenser.

**Le cas d'école : unifier ce qui est fragmenté.** Situation classique. Cinq équipes ont chacune bâti leur propre bibliothèque de logging, toutes subtilement incompatibles. Ça gaspille du temps et fragmente l'écosystème. Ton but : une seule bibliothèque pour tous. Ton obstacle : aucune autorité sur ces équipes.

La mauvaise approche est tentante parce qu'elle est rapide : écrire une RFC « bibliothèque de logging standard », la présenter en grand-messe, décréter que tout le monde doit l'utiliser. Résultat : les équipes t'ignorent, parce que tu ne peux rien décréter.

La bonne approche prend le temps de construire l'adhésion :

- **Semaine 1** — parler à chaque équipe. « De quoi avez-vous besoin en logging ? Quels points de douleur avec l'existant ? » Des thèmes communs émergent : logging structuré, filtrage, performance.
- **Semaine 2** — concevoir la bibliothèque autour de *leurs* besoins, pas de tes préférences, en collaborant avec un ou deux ingénieurs d'équipes différentes.
- **Semaine 3** — piloter avec une équipe amie. « Envie d'essayer ? Je t'accompagne sur la migration. » Recueillir le feedback, itérer.
- **Semaine 4** — montrer les résultats. « L'équipe A a migré en deux jours. Leurs logs sont maintenant dans Grafana [démo]. Ils ont corrigé deux bugs qu'ils n'arrivaient pas à trouver avant. »
- **Semaines 5 à 8** — adoption organique. Les autres équipes voient la valeur et demandent à migrer. Tu aides chacune, ce qui accroît ton crédit.
- **Mois 3** — écrire la RFC *maintenant*, pour documenter ce qui marche déjà. Trois équipes sur cinq l'utilisent : aligner les autres devient trivial.

Résultat : cinq équipes sur cinq sur le logging standard, et ton influence a grandi au passage. Les principes sous-jacents se lisent en creux — **commencer par l'empathie** (comprendre leurs besoins), **collaborer plutôt que dicter**, **montrer plutôt que dire**, **construire l'élan** en démarrant par les équipes amies, **rendre les gens victorieux** en soutenant leur migration, et **codifier le succès** dans une RFC *après* l'adoption, pas avant.

**La nuance.** Cette approche est lente, et c'est son coût réel. Il y a des moments — un incident de sécurité, une décision réglementaire, une urgence — où il faut trancher vite et assumer l'autorité. Le discernement du leader technique, c'est de savoir quand investir dans l'influence patiente et quand dépenser son autorité. Mais le défaut par excès d'autorité est bien plus fréquent, et bien plus coûteux, que l'inverse.

---

## Direction technique : travailler sur ce qui compte, et l'écrire

**Pourquoi ça compte.** Il existe un piège qui engloutit les Senior Engineers doués : tu es bon, donc on te donne plus de travail, donc tu codes soixante heures par semaine — sans impact stratégique, donc sans progression. **Être occupé n'est pas avoir de l'impact.** Le passage au niveau Staff+ commence par un tri féroce entre le travail qui compte et le travail qui remplit l'agenda.

**L'intuition : la matrice effort/impact.** Range mentalement chaque tâche dans un carré à deux axes. **Fort impact, faible effort** : les *quick wins* — fais-les tout de suite. **Fort impact, fort effort** : le stratégique — priorise-le. **Faible impact, faible effort** : des snacks — délègue ou ignore. **Faible impact, fort effort** : les gouffres à temps — dis non. Un exemple par case ancre la chose : réparer la pipeline de déploiement (deux jours, débloque toute l'équipe) est un quick win ; ré-architecturer le système d'authentification (trois mois, débloque la croissance) est stratégique ; mettre à jour un README (trente minutes) est un snack ; réécrire du code qui marche dans un nouveau langage (deux mois, aucune valeur) est un gouffre.

**La substance : savoir dire non.** C'est une compétence de leadership, pas un trait de caractère. Le mauvais non — « je suis trop occupé » — sonne comme une incapacité à gérer sa charge. Le bon non est stratégique et offre une alternative : « J'adorerais aider, mais je suis concentré sur X, qui est critique pour les objectifs du trimestre. On peut en reparler au trimestre prochain ? » Deux formulations valent d'être mémorisées. Le **« Oui, et… »** : « Oui, je peux aider. Pour faire de la place, il faudra que je dépriorise Y. C'est OK ? » Et le **« Non, parce que… »** : « Non, parce que je livre actuellement X, notre priorité numéro un du trimestre. Quelqu'un d'autre peut-il le prendre ? » Dans les deux cas, tu rends le coût d'opportunité visible au lieu de le cacher.

Là où les ingénieurs Staff+ créent une valeur disproportionnée : la **stratégie technique** (architecture à l'échelle de l'entreprise), le **mentorat** (démultiplier l'impact des autres), le **glue work** (ce travail invisible qui tient l'ensemble — on y revient), l'**exploration** (prouver de nouvelles approches), et la **qualité et fiabilité** (prévenir les incendies futurs). À l'inverse, ce sur quoi ils ne doivent *pas* se concentrer : les features individuelles sauf chemin critique, la présence à toutes les réunions (déléguer la représentation), et le fait d'être le « point de contact » pour les questions simples — mieux vaut enseigner aux autres à se débrouiller.

**Écrire pour diriger : la RFC.** La RFC (*Request for Comments*) est l'outil par lequel les ingénieurs Staff+ pilotent les décisions techniques. Une bonne RFC suit une ossature stable : un **titre** concis, des **métadonnées** (auteur, relecteurs, statut, dates), un **résumé exécutif** de deux ou trois phrases disant quoi/pourquoi/impact, un **énoncé du problème** (état actuel, pourquoi maintenant), des **objectifs et non-objectifs** explicites, la **solution** proposée avec un schéma, les **alternatives considérées** avec leurs pour et contre, les **risques et mitigations**, un **calendrier** avec jalons, des **métriques de succès** chiffrées, les **questions ouvertes** et les **références**.

La section la plus souvent bâclée, et la plus révélatrice de maturité, est **les alternatives considérées**. Montrer que tu as évalué le statu quo, une option intermédiaire et ta proposition — avec les compromis de chacune — est ce qui transforme un plaidoyer en décision défendable. « GraphQL l'emporte pour la flexibilité à long terme » n'a de poids que précédé de la démonstration que REST-tel-quel et le BFF ont été pesés et écartés pour de bonnes raisons.

**Le vrai travail est social, pas rédactionnel.** Voici l'insight qui sépare ceux dont les RFC passent de ceux dont elles pourrissent : **écrire la RFC, c'est 20 % du travail ; la faire adopter, c'est 80 %.** Et l'essentiel de ces 80 % se joue *avant* la revue formelle. **Socialise avant de formaliser.** Le déroulé : d'abord des conversations informelles (« qu'est-ce que tu penserais de GraphQL ? ») pour prendre le pouls ; si l'accueil est bon, un *one-pager* — pas encore la RFC complète — présenté en revue d'architecture pour un premier retour ; ensuite seulement la RFC complète, qui intègre ce retour ; enfin la revue formelle, élargie. La raison pour laquelle ça marche : **aucune surprise** en revue formelle, un soutien construit par paliers, et les objections traitées tôt, quand elles sont encore cheap à traiter.

Pendant la revue, quelques tactiques : **identifier les champions** et leur demander de commenter publiquement, **répondre à chaque commentaire** (approuver ou expliquer), **itérer vite** (mettre à jour sous 24 h), et **savoir s'arrêter** — le parfait est l'ennemi du fait, on livre quand 80 % des gens sont alignés. Face aux objections classiques, prépare tes réponses : « trop risqué » appelle un plan de déploiement incrémental et une stratégie de rollback ; « trop cher » appelle un calcul de ROI ; « pas le bon moment » appelle le coût d'opportunité de l'attente ; « on a déjà essayé » appelle ce qui a changé depuis ; « je préfère X » appelle une reconnaissance sincère suivie de pourquoi Y convient mieux à *votre* contexte.

**Gérer un désaccord, en pratique.** Tu proposes de migrer vers Kubernetes. Un Senior objecte : « Docker Swarm est plus simple, pourquoi compliquer ? » La mauvaise réponse balaie l'objection : « Kubernetes est le standard de l'industrie, on devrait l'utiliser. » La bonne réponse reconnaît le point *avant* de le dépasser : « Excellent point sur la simplicité. Swarm *est* effectivement plus simple pour notre échelle actuelle, dix services. Mais on prévoit de tripler le nombre de services cette année, de déployer en multi-région pour des raisons de conformité, et de mettre en place un service mesh pour la sécurité. Pour *ces* besoins, K8s devient en réalité plus simple à long terme — le service mesh (Istio) ne fonctionne qu'avec K8s, le réseau multi-région est natif, et l'écosystème gère trente services et plus. Avec Swarm, il faudrait construire tout ça nous-mêmes. Est-ce que ça répond à ta crainte sur la complexité ? » Elle reconnaît, apporte des données, et *rend la parole*. Elle transforme un affrontement en dialogue.

**La nuance.** L'écrit clarifie la pensée — c'est même sa première fonction, avant de convaincre qui que ce soit : on découvre les trous de son raisonnement en le rédigeant. Mais l'écrit ne remplace pas les relations. Une RFC brillante envoyée à froid, sans le travail social en amont, échoue plus souvent qu'une RFC moyenne préparée par dix conversations. Le document couronne le consensus ; il ne le crée pas.

---

## Migrations et glue work : le travail critique mais invisible

**Pourquoi ça compte.** Il existe une catégorie de travail qui est à la fois **essentielle au succès de l'organisation et systématiquement invisible** dans les évaluations. On l'appelle le **glue work** — le travail de colle. C'est ce qui tient l'ensemble : débloquer une équipe voisine, documenter un système que personne ne comprend, faire dialoguer deux services qui s'ignorent, coordonner une dépendance transverse, piloter une migration qui traverse dix équipes. Personne ne t'attribuera une feature pour ça. Et pourtant, sans cette colle, tout se fissure. Les ingénieurs Staff+ font délibérément ce travail — c'est même une part de ce qui les *rend* Staff+.

**L'intuition.** Les migrations sont l'incarnation la plus pure du glue work, et l'un des rares terrains où l'impact d'un Staff Engineer devient spectaculairement visible. Une migration réussie — d'une base de données, d'un protocole d'API, d'une plateforme — ne demande presque aucune innovation technique brillante. Elle demande de la coordination sans autorité, de la patience, de la communication répétée, et la volonté de faire le travail ingrat que personne ne réclame. Exactement les compétences de ce chapitre, appliquées à un problème borné.

**La substance.** Une migration se pilote par phases, jamais d'un bloc : on introduit le nouveau système à côté de l'ancien, on migre d'abord une équipe amie pour prouver que ça marche, on mesure, on montre les résultats, puis on laisse l'adoption se propager avant de codifier. C'est, trait pour trait, l'approche « influence sans autorité » vue plus haut — la migration de la bibliothèque de logging *était* une migration. Le pilote qui réussit ne dit pas « migrez avant fin du trimestre » ; il rend la migration facile, montre qu'une équipe l'a faite en deux jours, et laisse la preuve faire le travail de persuasion.

Le glue work, plus largement, recouvre tout ce qui n'a pas de propriétaire naturel : la documentation qui manque, l'onboarding qui traîne, l'incident dont personne ne veut hériter, la décision transverse que chaque équipe repousse. Le prendre en charge, c'est augmenter le débit de toute l'organisation d'une manière qui ne rentre dans aucune case de l'organigramme.

**La nuance — et elle est importante.** Le glue work est un piège autant qu'une vertu, et il faut le dire honnêtement. Parce qu'il est invisible dans les systèmes d'évaluation, celui qui en fait *trop* sans le rendre visible risque d'être exploité : on s'appuie sur lui, on le remercie tièdement, on ne le promeut pas. Tanya Reilly, dans *The Staff Engineer's Path*, insiste sur ce point — le glue work est indispensable, et il est aussi le travail qu'on refile de façon disproportionnée à ceux qu'on juge « serviables ». La discipline du Staff+ n'est donc pas seulement de faire ce travail, mais de **le rendre lisible** : le nommer, le raconter dans les points d'étape, le documenter, expliciter le déblocage qu'il a produit. Faire le travail invisible, *et* le rendre visible. Les deux moitiés comptent.

---

## Devenir Staff+ : profondeur, largeur, et le mentorat qui fait la différence

**Pourquoi ça compte.** Les compétences techniques sont **nécessaires mais pas suffisantes**. C'est peut-être la vérité la plus contre-intuitive du chapitre pour quelqu'un qui vient de la recherche : à partir d'un certain niveau, ce n'est plus la technique qui te distingue. Tout le monde autour de toi est techniquement fort. Ce qui sépare le Senior du Staff+, ce sont les compétences *non* techniques — et c'est précisément là que se joue le fameux syndrome de l'imposteur, car ce sont des compétences qu'on ne t'a jamais notées à l'école.

**L'intuition : l'ingénieur en T.** L'image mentale utile est celle de l'ingénieur en forme de T. La barre verticale, c'est la **profondeur** : être expert dans un ou deux domaines (systèmes distribués, ML, sécurité — ton cas). La barre horizontale, c'est la **largeur** : être capable de tenir une conversation sérieuse et de relire un design dans presque tous les domaines. L'attente au niveau Staff+ est claire : de la profondeur dans un ou deux domaines, assez de largeur pour relire n'importe quel design, et la capacité de **monter en compétence rapidement** dans un domaine nouveau. Les ingénieurs Staff+ n'arrêtent jamais d'apprendre — lire des papers, tester de nouvelles technos dans des projets personnels, enseigner (la meilleure façon d'apprendre), contribuer à l'open source, aller en conférence une ou deux fois par an.

**La substance : les compétences qui différencient.** Trois familles.

La **communication**, d'abord — écrire (RFC, design docs, postmortems), présenter, écouter (comprendre avant de vouloir être compris), et raconter (rendre le technique compréhensible aux non-techniques). Un exemple vaut mieux qu'une définition. Expliquer GraphQL à un CEO de la mauvaise manière : « GraphQL est un langage de requête pour API et un runtime pour exécuter ces requêtes sur vos données existantes. » Exact, et parfaitement inutile pour un CEO. De la bonne manière : « Notre app mobile télécharge aujourd'hui 60 % de données de plus qu'il ne lui en faut, ce qui la rend lente et coûteuse pour l'utilisateur. GraphQL permet à l'équipe mobile de demander exactement les données nécessaires, réduisant la consommation de 40 % et accélérant l'app. On devrait passer de 3,8 à 4,2+ sur l'App Store. » Même sujet, mais traduit dans la langue de l'impact business. **Cette traduction est un super-pouvoir de CTO.**

La **gestion de projet**, ensuite — souvent, le Staff+ mène des projets sans être chef de projet : gérer le périmètre (ce qui est dedans ou dehors pour cette phase), suivre les dépendances, gérer les risques, tenir les parties prenantes informées.

Le **mentorat**, enfin — et c'est le multiplicateur ultime. Faire grandir les autres par le pair-programming (coder ensemble en expliquant son raisonnement), la revue de code réfléchie, des *office hours* dédiées aux questions, et le **sponsorship**.

**Le sponsorship, à distinguer du mentorat.** Le mentorat, c'est *donner des conseils* à quelqu'un. Le sponsorship, c'est *dépenser son propre capital* pour quelqu'un : le recommander pour un projet à forte visibilité, citer son nom dans les réunions où sont prises les décisions de promotion, lui attribuer publiquement le crédit de son travail, plaider pour lui quand il n'est pas dans la pièce. Le mentorat aide une personne à s'améliorer ; le sponsorship change sa trajectoire. Pour un CTO, c'est un levier disproportionné : ta parole a du poids, et l'utiliser pour propulser les bonnes personnes est l'un des investissements au meilleur rendement que tu puisses faire.

**Comment ça se passe concrètement.** Une semaine de Staff Engineer (archétype Tech Lead) ne ressemble *pas* à huit heures de code par jour. C'est un mélange : du standup où l'on écoute les blocages, de la revue de code où l'on enseigne des patterns, un 1:1 de mentorat avec un junior, des blocs de *deep work* pour implémenter la feature critique, une revue d'architecture, la rédaction d'une RFC, une synchro transverse pour coordonner les dépendances, de la recherche pour évaluer une nouvelle base de données, une design review avec le Produit, des office hours ouvertes à tous. Le motif est constant : **du code, oui, mais mêlé d'architecture, de mentorat et de coordination.** Rester technique pour garder sa crédibilité — mais consacrer plus de la moitié de son temps à l'impact non-codant.

**La nuance — Staff+ ou manager ?** C'est une décision à prendre honnêtement, sans hiérarchie entre les deux. Va vers le **Staff+** si tu aimes le travail technique profond, si tu veux rester hands-on (coder 20 à 50 %), si tu influences par l'expertise plutôt que par l'autorité, si tu es à l'aise sans subordonnés directs, et si tu penses en systèmes et en architectures. Va vers le **management** si ce qui te recharge est d'aider des gens à grandir, si tu es prêt à lâcher le code, si tu veux une autorité formelle et la propriété d'une équipe, si tu excelles en communication et coordination, et si tu penses en gens et en processus. Les deux sont valides. Les deux mènent à un impact de niveau VP. Choisis celui qui **te donne de l'énergie**, pas celui qui a l'air le plus prestigieux vu de l'extérieur.

---

## À retenir

1. **Ton impact ne se mesure plus à ton code, mais à ce que les autres réussissent grâce à toi.** C'est le saut mental qui définit le niveau Staff+, et c'est exactement la logique de ton poste de CTO.

2. **« Staff Engineer » n'est pas un rôle mais quatre** — Tech Lead, Architect, Solver, Right Hand. Ils diffèrent par la part de code, le périmètre et le tempérament. Nomme celui que tu demandes à quelqu'un ; ne demande pas à un Solver d'être Architect.

3. **L'influence est un capital qui s'accumule ; l'autorité, une carte qu'on joue en dernier.** Brandir son titre signale que l'influence manque. Règle des 90/10 : montre un prototype qui prouve la supériorité, et l'adoption se fait seule.

4. **Écrire la RFC, c'est 20 % du travail ; la faire adopter, 80 %.** Socialise avant de formaliser. Le document couronne le consensus, il ne le crée pas. Et l'écrit sert d'abord à clarifier *ta propre* pensée.

5. **Être occupé n'est pas avoir de l'impact.** Trie par la matrice effort/impact, et apprends le « non » stratégique qui rend le coût d'opportunité visible au lieu de le cacher.

6. **Le glue work est indispensable et invisible — fais-le, mais rends-le visible.** Sinon tu seras exploité plutôt que promu. Les migrations en sont la forme la plus pure, et le meilleur terrain pour un impact démontrable.

7. **À haut niveau, la technique ne te distingue plus ; la communication, le mentorat et le sponsorship le font.** Distingue mentorat (donner des conseils) et sponsorship (dépenser ton capital pour propulser quelqu'un) — ce dernier est ton levier le plus puissant.

---

## Pour aller plus loin

- **Will Larson, *Staff Engineer: Leadership Beyond the Management Track*** — le livre fondateur, source des quatre archétypes. Son site **staffeng.com** rassemble des dizaines d'entretiens avec de vrais Staff Engineers.
- **Tanya Reilly, *The Staff Engineer's Path*** — le complément indispensable, particulièrement lucide sur le glue work et sur le fait de rendre visible le travail invisible.
- **Adam Tornhill, *Software Design X-Rays*** — pour la profondeur technique : lire la santé d'un codebase à grande échelle.
- **StaffPlus (conférence) et LeadDev** — talks et articles sur le leadership technique.
- **Podcasts : *The Pragmatic Engineer* (Gergely Orosz) et *Software Engineering Daily*** — pour entretenir la largeur au fil de l'eau.

Un dernier mot, parce qu'il vise juste ton syndrome de l'imposteur : Staff+ n'est pas une promotion, le management non plus. Ce sont deux métiers différents, tous deux précieux, tous deux à fort impact. Tu n'as pas à devenir quelqu'un d'autre pour diriger techniquement — tu as à développer, délibérément, des compétences qu'on ne t'a jamais notées : l'influence, la communication, la stratégie, le mentorat. Elles s'apprennent. Ce chapitre t'a montré comment.
