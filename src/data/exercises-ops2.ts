import type { Exercise } from '../engine/types';

// ---------------------------------------------------------------------------
// Lot « DevOps / Ops » (2) — étoffe les fondamentaux : Linux, Git, CI/CD,
// Terraform, réseau, monitoring. Concepts distincts des lots existants.
// Ancré sur la doc officielle (man pages, Pro Git, docs GitHub Actions /
// HashiCorp, RFC réseau, Google SRE book / Prometheus).
// Options équilibrées, bonne réponse en index 0 (position randomisée par shuffle.ts).
// ---------------------------------------------------------------------------

type Topic = Exercise['topic'];
type Lang = Extract<Exercise, { type: 'find-error' }>['language'];

// mcq
const M = (
  id: string, topic: Topic, difficulty: Exercise['difficulty'], title: string, company: string,
  question: string, options: string[], explanation: string, tags: string[], scenario?: string,
): Exercise => ({
  id, type: 'mcq', domain: 'devops', topic, difficulty,
  title, company, ...(scenario ? { scenario } : {}), question, options, answer: 0, explanation, tags,
});

// find-error
const F = (
  id: string, topic: Topic, difficulty: Exercise['difficulty'], title: string, company: string,
  language: Lang, code: string, question: string, options: string[], explanation: string, tags: string[],
): Exercise => ({
  id, type: 'find-error', domain: 'devops', topic, difficulty,
  title, company, language, code, question, options, answer: 0, explanation, tags,
});

export const ops2Exercises: Exercise[] = [
  // ============================================================= LINUX
  M('op-linux-oom', 'linux', 'senior', 'Le processus tué la nuit', 'man 5 proc',
    'Un service disparaît sans crash applicatif ; `dmesg` montre « Out of memory: Killed process ». Que s\'est-il passé ?',
    ['L\'OOM killer du noyau a tué le processus pour libérer de la RAM sous pression mémoire',
     'Le disque était plein et le noyau a arrêté le service pour protéger les données',
     'Un signal SIGTERM a été envoyé par systemd lors d\'un redémarrage planifié',
     'Le CPU a surchauffé et le throttling a suspendu le processus'],
    'Sous pression mémoire, l\'**OOM killer** choisit une victime selon son `oom_score` et la tue par SIGKILL. Remèdes : limiter la mémoire (cgroups/`MemoryMax`), régler `oom_score_adj`, ajouter de la RAM/swap, corriger la fuite. Rien à voir avec le disque ou le CPU.',
    ['linux', 'oom', 'memory']),

  M('op-linux-loadavg', 'linux', 'intermediate', 'Load average de 8', 'man uptime',
    'Sur une machine à 4 cœurs, `uptime` affiche un load average de 8,0. Qu\'est-ce que cela signifie ?',
    ['En moyenne 8 tâches veulent tourner pour 4 cœurs : la machine est surchargée (file d\'attente)',
     'Le CPU est utilisé à 8 % seulement, la machine est au repos',
     'Il reste 8 Go de mémoire libre disponible pour les processus',
     '8 processus au total sont lancés, ce qui est normal'],
    'Le load average = nombre moyen de tâches **runnable + en attente I/O ininterruptible**. 8 pour 4 cœurs = 2× la capacité → saturation. Sous Linux, un load élevé peut venir du **CPU** ou d\'attentes disque (état D), pas seulement du CPU.',
    ['linux', 'load-average', 'performance']),

  M('op-linux-inode', 'linux', 'senior', 'Disque plein mais df dit 60 %', 'man df',
    'Une écriture échoue avec « No space left on device », pourtant `df -h` montre 60 % d\'utilisation. Que vérifier ?',
    ['Les inodes avec `df -i` : ils peuvent être épuisés même avec de l\'espace en octets restant',
     'La température du disque, probablement en surchauffe',
     'Le quota réseau, qui limite les écritures distantes',
     'Le cache de page, qu\'il faut vider avec sync'],
    'Chaque fichier consomme un **inode** ; des millions de petits fichiers (sessions, caches) épuisent la table d\'inodes alors que l\'espace en octets reste. `df -i` le révèle. Fréquent avec des répertoires temporaires jamais purgés.',
    ['linux', 'inode', 'filesystem']),

  M('op-linux-zombie', 'linux', 'intermediate', 'Processus zombie', 'man 2 wait',
    'Un `ps` montre un processus en état `Z` (defunct). Que représente-t-il ?',
    ['Un enfant terminé dont le parent n\'a pas encore lu le code de sortie (wait)',
     'Un processus bloqué en attente d\'une entrée/sortie disque',
     'Un processus consommant 100 % de CPU en boucle infinie',
     'Un processus détaché de son terminal et tournant en arrière-plan'],
    'Un **zombie** est un enfant mort dont l\'entrée reste dans la table des processus jusqu\'à ce que le parent appelle `wait()` pour récolter son statut. Un zombie ne consomme ni CPU ni RAM ; le vrai problème est un parent bogué. Si le parent meurt, `init`/PID 1 les adopte et les nettoie.',
    ['linux', 'process', 'zombie']),

  F('op-linux-bash-pipefail', 'linux', 'senior', 'Script qui masque ses erreurs', 'man bash',
    'bash',
    `#!/bin/bash
backup=$(pg_dump mydb | gzip > /backups/db.gz)
aws s3 cp /backups/db.gz s3://bucket/
echo "Backup OK"`,
    'Pourquoi ce script peut-il afficher « Backup OK » alors que la sauvegarde a échoué ?',
    ['Sans set -o pipefail, le code de retour du pipe est celui de gzip, pas de pg_dump qui a échoué',
     'aws s3 cp est asynchrone et rend la main avant la fin du transfert',
     'La variable backup capture stdout, donc le fichier n\'est jamais écrit',
     'echo renvoie toujours 0, ce qui réinitialise le code d\'erreur précédent'],
    'Dans un pipe, bash renvoie par défaut le statut de la **dernière** commande (`gzip`), donc l\'échec de `pg_dump` est masqué. En-tête robuste : `set -euo pipefail`. Sinon un backup vide part en prod sans alerte.',
    ['linux', 'bash', 'pipefail']),

  F('op-linux-rm', 'linux', 'intermediate', 'La variable vide fatale', 'man rm',
    'bash',
    `#!/bin/bash
rm -rf "$DIR/"*
# $DIR n'est pas défini si le script est lancé sans l'exporter`,
    'Quel est le danger si $DIR est vide ou non défini ?',
    ['rm -rf "/"* efface la racine : une variable vide transforme le chemin en /',
     'rm refuse de s\'exécuter sans argument et le script s\'arrête proprement',
     'Les guillemets autour de $DIR empêchent toute expansion, donc rien ne se passe',
     'rm supprime uniquement le fichier littéral nommé $DIR sans risque'],
    'Si `$DIR` est vide, la commande devient `rm -rf "/"*` → suppression catastrophique. Toujours `set -u` (échoue sur variable non définie), valider `[ -n "$DIR" ]`, et utiliser `${DIR:?message}` pour avorter si vide.',
    ['linux', 'bash', 'safety']),

  M('op-linux-signal-hup', 'linux', 'intermediate', 'Le process qui meurt à la déconnexion', 'man 7 signal',
    'Vous lancez un long traitement dans un terminal SSH ; à la déconnexion, il s\'arrête. Quel signal et quel remède ?',
    ['SIGHUP est envoyé à la fermeture du terminal ; utiliser nohup, disown, tmux ou un service systemd',
     'SIGKILL est envoyé par SSH ; il faut relancer avec sudo pour l\'éviter',
     'SIGSEGV survient car le terminal libère la mémoire du process',
     'SIGTERM est envoyé par le noyau ; augmenter la priorité avec nice le corrige'],
    'La fermeture du terminal envoie **SIGHUP** aux processus de la session. Pour survivre : `nohup cmd &`, `disown`, ou mieux un multiplexeur (`tmux`/`screen`) ou un **service systemd** détaché de la session.',
    ['linux', 'signal', 'sighup']),

  M('op-linux-chmod777', 'linux', 'junior', 'Le réflexe chmod 777', 'man chmod',
    'Un fichier n\'est pas accessible par l\'application. Pourquoi `chmod 777` est-il une mauvaise réponse ?',
    ['Il donne lecture/écriture/exécution à tout le monde : n\'importe quel utilisateur peut modifier le fichier',
     'Il rend le fichier immuable et empêche toute modification future',
     'Il supprime le propriétaire du fichier et le transfère à root',
     'Il chiffre le fichier, le rendant illisible sans la clé'],
    '`777` = `rwx` pour propriétaire, groupe **et autres** → tout utilisateur (ou processus compromis) peut lire/écrire/exécuter. On ajuste plutôt le **propriétaire/groupe** (`chown`) et on donne le minimum (`640`, `750`). 777 est un trou de sécurité, pas un correctif.',
    ['linux', 'permissions', 'chmod']),

  M('op-linux-hardlink', 'linux', 'senior', 'Lien dur vs lien symbolique', 'man ln',
    'Quelle différence fondamentale entre un lien dur (`ln`) et un lien symbolique (`ln -s`) ?',
    ['Le lien dur pointe le même inode (survit à la suppression de l\'original) ; le lien symbolique pointe un chemin (cassé si l\'original disparaît)',
     'Le lien dur peut traverser les systèmes de fichiers, pas le lien symbolique',
     'Le lien symbolique copie physiquement les données, le lien dur non',
     'Le lien dur ne fonctionne que pour les répertoires, le symbolique pour les fichiers'],
    'Un **lien dur** est un second nom pour le **même inode** : les données survivent tant qu\'un lien existe. Un **lien symbolique** contient un *chemin* ; si la cible est supprimée/déplacée, il devient pendant (dangling). Le lien dur ne traverse pas les systèmes de fichiers et ne vise pas les répertoires.',
    ['linux', 'filesystem', 'inode']),

  // ============================================================= GIT
  M('op-git-bisect', 'git', 'intermediate', 'Trouver le commit fautif', 'Pro Git',
    'Un bug est apparu il y a ~200 commits, sans que vous sachiez lequel l\'a introduit. Quel outil Git le trouve efficacement ?',
    ['git bisect : recherche dichotomique entre un commit « good » et « bad » (~log2 étapes)',
     'git blame parcourt linéairement chaque commit jusqu\'à trouver le bug',
     'git reflog rejoue tous les commits pour identifier le fautif',
     'git cherry-pick teste chaque commit un par un automatiquement'],
    '`git bisect start`, `bisect bad`, `bisect good <ref>` → Git fait une **dichotomie** : ~8 tests pour 200 commits au lieu de 200. Automatisable avec `git bisect run <script>`. `blame` montre qui a modifié une ligne, pas quand un comportement a cassé.',
    ['git', 'bisect', 'debugging']),

  M('op-git-detached', 'git', 'intermediate', 'HEAD détachée', 'Pro Git',
    'Après `git checkout <sha>`, Git annonce « detached HEAD ». Quel est le risque si vous committez ?',
    ['Les nouveaux commits n\'appartiennent à aucune branche : ils seront perdus (GC) au prochain checkout',
     'Le dépôt passe en lecture seule et refuse tout commit',
     'Les commits écrasent définitivement l\'historique de la branche main',
     'Git bascule automatiquement tous les collègues sur ce commit'],
    'En HEAD détachée, `HEAD` pointe un commit et non une branche. Committer crée des commits **non référencés** : dès que vous repartez ailleurs, ils deviennent inaccessibles (récupérables un temps via `reflog`). Pour garder le travail : `git switch -c <branche>`.',
    ['git', 'detached-head', 'branches']),

  F('op-git-gitignore', 'git', 'junior', 'Le fichier ignoré... suivi quand même', 'Pro Git',
    'bash',
    `# .gitignore contient : config/secrets.env
git status
# secrets.env apparaît toujours comme "modified"`,
    'Pourquoi .gitignore n\'ignore-t-il pas ce fichier ?',
    ['.gitignore n\'agit que sur les fichiers non suivis : un fichier déjà commité reste suivi',
     'Il faut redémarrer le serveur Git pour recharger le .gitignore',
     'Le chemin doit commencer par un / pour être pris en compte',
     'Les fichiers .env sont toujours suivis, quelle que soit la règle'],
    '`.gitignore` empêche l\'**ajout** de fichiers non suivis ; il n\'a aucun effet sur un fichier déjà indexé/commité. Il faut `git rm --cached config/secrets.env` puis committer. (Et si un secret a été poussé, il faut le considérer comme compromis et le faire tourner.)',
    ['git', 'gitignore', 'tracking']),

  M('op-git-revert-reset', 'git', 'intermediate', 'Annuler un commit déjà poussé', 'Pro Git',
    'Un commit fautif est déjà sur `main` partagée. Faut-il `git reset` ou `git revert` ?',
    ['git revert : crée un nouveau commit qui annule le fautif, sans réécrire l\'historique partagé',
     'git reset --hard : supprime le commit, c\'est propre pour une branche partagée',
     'git commit --amend : modifie le commit fautif en place sans risque',
     'git checkout : restaure les fichiers et efface le commit du dépôt distant'],
    'Sur une branche **partagée**, on ne réécrit pas l\'historique (`reset`/`amend` cassent les clones des autres). `git revert <sha>` crée un commit **inverse** — l\'historique reste linéaire et non destructif. `reset` est réservé aux branches locales non poussées.',
    ['git', 'revert', 'reset']),

  M('op-git-stash-pitfall', 'git', 'junior', 'Le stash oublié', 'Pro Git',
    'Que fait `git stash` et quel est le piège classique ?',
    ['Il met de côté les modifications non commitées ; piège : on l\'oublie et on empile plusieurs stash intraçables',
     'Il crée une branche permanente nommée stash visible par tous',
     'Il pousse les modifications sur le dépôt distant temporairement',
     'Il supprime définitivement les modifications non commitées'],
    '`git stash` sauvegarde le travail en cours dans une pile locale et nettoie l\'arbre. Piège : les stash ne sont **pas nommés par contexte** et s\'empilent ; on les perd de vue. Bonnes pratiques : `git stash list`, messages (`stash push -m`), ou préférer une vraie branche wip.',
    ['git', 'stash', 'workflow']),

  M('op-git-ff', 'git', 'senior', 'Merge fast-forward', 'Pro Git',
    'Qu\'est-ce qu\'un merge « fast-forward » et quand n\'a-t-il pas lieu ?',
    ['Quand la cible n\'a pas divergé, Git avance juste le pointeur ; impossible si les deux branches ont des commits distincts',
     'C\'est un merge qui ignore les conflits en gardant toujours la version distante',
     'C\'est un merge qui compresse tous les commits en un seul automatiquement',
     'C\'est un merge qui saute les hooks pour aller plus vite'],
    'Un **fast-forward** survient quand la branche cible est un ancêtre direct : Git déplace simplement le pointeur, sans commit de merge. Si les deux branches ont **divergé**, un vrai commit de merge (ou un rebase) est nécessaire. `--no-ff` force un commit de merge pour tracer la fusion.',
    ['git', 'merge', 'fast-forward']),

  // ============================================================= CI/CD
  F('op-ci-cache-key', 'ci-cd', 'senior', 'Le cache qui ne se met jamais à jour', 'GitHub Actions',
    'yaml',
    `- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-cache   # <-- ici`,
    'Pourquoi ce cache sert-il des dépendances périmées ?',
    ['La clé est statique : elle ne change jamais quand package-lock change, donc le vieux cache est toujours réutilisé',
     'Le chemin ~/.npm est incorrect, npm cache ailleurs',
     'actions/cache@v4 est obsolète et ignore la clé fournie',
     'Il manque un restore-keys, sans quoi le cache n\'est jamais lu'],
    'Une clé de cache **fixe** ne s\'invalide jamais : on restaure éternellement les mêmes paquets. La clé doit **inclure un hash du lockfile** : `key: npm-${{ hashFiles(\'**/package-lock.json\') }}`. Ainsi tout changement de dépendances crée une nouvelle entrée.',
    ['ci-cd', 'cache', 'github-actions']),

  M('op-ci-oidc', 'ci-cd', 'senior', 'Créds cloud dans le CI', 'GitHub Actions',
    'Comment donner à un pipeline l\'accès à AWS sans stocker de clé d\'accès longue durée dans les secrets ?',
    ['OIDC : le pipeline échange un token court contre un rôle IAM via une relation de confiance fédérée',
     'Coller la clé AWS_SECRET dans un secret de dépôt chiffré',
     'Encoder la clé en base64 dans une variable d\'environnement',
     'Utiliser un utilisateur IAM partagé dont la clé tourne chaque mois'],
    'La **fédération OIDC** laisse le fournisseur CI émettre un jeton d\'identité de courte durée qu\'AWS/GCP/Azure échange contre des credentials temporaires via un rôle. Plus de clé statique à fuiter ou à faire tourner. C\'est la recommandation moderne (GitHub Actions, GitLab).',
    ['ci-cd', 'oidc', 'secrets']),

  M('op-ci-build-once', 'ci-cd', 'senior', 'La même image de la recette à la prod', '12-factor',
    'Pourquoi faut-il promouvoir le **même artefact** (image) de la staging à la prod plutôt que de rebuild à chaque étape ?',
    ['Rebuild peut produire un binaire différent (deps, timestamps) : on ne déploie pas ce qui a été testé',
     'Rebuild est interdit par la plupart des registres d\'images',
     'Un seul build par jour est autorisé pour des raisons de quota',
     'Le rebuild efface les logs de la CI, compliquant l\'audit'],
    '« **Build once, deploy many** » : on construit l\'artefact **une fois**, on le teste, puis on **promeut le même** hash d\'un environnement à l\'autre. Rebuild par environnement risque des différences (versions transitoires, non-déterminisme) → on déploie autre chose que ce qui a été validé.',
    ['ci-cd', 'artifact', 'promotion']),

  M('op-ci-concurrency', 'ci-cd', 'intermediate', 'Deux déploiements qui se marchent dessus', 'GitHub Actions',
    'Sur une même branche, deux pushs rapprochés lancent deux déploiements simultanés qui se corrompent. Quelle protection ?',
    ['Un groupe de concurrence qui annule le déploiement en cours quand un nouveau démarre',
     'Augmenter le timeout du job pour laisser finir le premier',
     'Relancer manuellement le second déploiement après le premier',
     'Dupliquer l\'environnement pour absorber les deux déploiements'],
    'Un `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: true }` sérialise (ou annule) les exécutions par branche/env → un seul déploiement actif à la fois. Sans cela, deux runs concurrents peuvent laisser l\'environnement dans un état incohérent.',
    ['ci-cd', 'concurrency', 'deployment']),

  M('op-ci-canary', 'ci-cd', 'intermediate', 'Blue-green vs canary', 'Google SRE',
    'Quelle différence entre un déploiement blue-green et un déploiement canary ?',
    ['Blue-green bascule 100 % du trafic d\'un coup vers la nouvelle version ; canary l\'expose progressivement à un % croissant',
     'Blue-green concerne les bases de données, canary les serveurs web',
     'Canary déploie sans tests, blue-green avec tests complets',
     'Blue-green est un rollback, canary un rollforward'],
    '**Blue-green** : deux environnements complets, on bascule le trafic instantanément (rollback = rebasculer). **Canary** : on route un petit pourcentage vers la v2, on surveille les métriques, puis on monte progressivement. Canary limite le rayon d\'impact ; blue-green minimise le temps de bascule.',
    ['ci-cd', 'deployment', 'canary']),

  M('op-ci-pin-sha', 'ci-cd', 'senior', 'Épingler une action', 'Supply chain',
    'Pourquoi référencer une action tierce par son SHA de commit (`uses: org/action@a1b2c3…`) plutôt que par tag (`@v3`) ?',
    ['Un tag est mutable : le mainteneur (ou un attaquant) peut le repointer vers du code malveillant ; le SHA est immuable',
     'Le SHA télécharge l\'action plus vite que le tag',
     'Les tags ne sont pas supportés par les runners auto-hébergés',
     'Le SHA active automatiquement le cache des dépendances'],
    'Un **tag Git est mutable** : `v3` peut être déplacé vers un commit compromis (attaque supply chain type *tj-actions*). Un **SHA de commit** est immuable → vous exécutez exactement le code audité. Compromis : maintenir les SHA à jour (Dependabot le fait).',
    ['ci-cd', 'supply-chain', 'pinning']),

  // ============================================================= TERRAFORM
  M('op-tf-count-foreach', 'terraform', 'senior', 'count vs for_each', 'HashiCorp',
    'Vous créez 5 buckets. Avec `count`, supprimer celui du milieu recrée les suivants. Pourquoi `for_each` est-il préférable ?',
    ['for_each indexe par clé stable (nom) ; count indexe par position, donc retirer un élément décale et recrée les suivants',
     'count est déprécié et sera retiré de Terraform',
     'for_each est plus rapide car il parallélise mieux les créations',
     'count ne fonctionne qu\'avec des ressources de type liste'],
    'Avec `count`, l\'adresse d\'état est `res[2]` (position) : retirer l\'index 1 décale tout → destruction/recréation en cascade. `for_each` indexe par **clé** (`res["logs"]`) : ajouter/retirer un élément n\'affecte que lui. Préférer `for_each` dès que les éléments ont une identité.',
    ['terraform', 'for_each', 'count']),

  M('op-tf-sensitive-state', 'terraform', 'senior', 'Le mot de passe dans le state', 'HashiCorp',
    'Vous générez un mot de passe de base de données avec `random_password`. Où se retrouve-t-il et quelle conséquence ?',
    ['En clair dans le fichier state : le state doit être traité comme un secret (backend chiffré, accès restreint)',
     'Nulle part : Terraform ne stocke jamais les valeurs sensibles',
     'Uniquement dans les logs, qu\'il suffit de purger',
     'Chiffré automatiquement dans le state avec une clé locale'],
    'Terraform stocke **toutes** les valeurs (y compris secrets) **en clair** dans le state pour calculer les diffs. `sensitive = true` masque seulement l\'affichage CLI, pas le stockage. Donc : backend distant **chiffré** (S3+KMS), accès IAM restreint, jamais de state en clair dans Git.',
    ['terraform', 'state', 'secrets']),

  M('op-tf-plan-apply', 'terraform', 'junior', 'plan puis apply', 'HashiCorp',
    'Pourquoi exécuter `terraform plan` avant `apply`, et pourquoi sauvegarder le plan (`-out`) en CI ?',
    ['plan montre les changements à valider ; le plan sauvegardé garantit qu\'apply exécute exactement ce qui a été revu',
     'plan crée les ressources en lecture seule, apply les rend inscriptibles',
     'plan est obligatoire pour initialiser les providers',
     'apply sans plan supprime toujours toute l\'infrastructure'],
    '`plan` calcule et affiche le diff (create/update/destroy) pour revue. En CI, `terraform plan -out=tfplan` puis `apply tfplan` évite une **course** : sans le plan figé, l\'état a pu changer entre la revue et l\'apply, exécutant autre chose que ce qui a été approuvé.',
    ['terraform', 'plan', 'workflow']),

  F('op-tf-prevent-destroy', 'terraform', 'intermediate', 'La prod détruite par un rename', 'HashiCorp',
    'hcl',
    `resource "aws_db_instance" "prod" {
  identifier = "prod-db"
  # ... pas de lifecycle
}`,
    'Un collègue renomme la ressource dans le code et `apply` planifie de détruire la base. Quelle protection manque-t-il ?',
    ['Un bloc lifecycle { prevent_destroy = true } qui bloque toute destruction accidentelle',
     'Un provider aws en version figée pour empêcher les changements',
     'Un depends_on vers le VPC pour ordonner les opérations',
     'Une variable sensitive = true sur l\'identifiant'],
    'Renommer le bloc change l\'adresse d\'état → Terraform voit un destroy + create. `lifecycle { prevent_destroy = true }` fait **échouer** tout plan qui détruirait la ressource, garde-fou sur les ressources critiques (bases, buckets de données). Pour un vrai rename sans perte : `terraform state mv` ou un bloc `moved`.',
    ['terraform', 'lifecycle', 'prevent-destroy']),

  M('op-tf-drift', 'terraform', 'intermediate', 'Le changement fait à la console', 'HashiCorp',
    'Quelqu\'un a modifié une règle de sécurité directement dans la console cloud. Comment Terraform voit-il ce « drift » et que fait-il ?',
    ['refresh/plan compare l\'état réel au state et propose de réappliquer la config pour ré-imposer l\'infra déclarée',
     'Terraform ne détecte jamais les changements faits hors de son périmètre',
     'Terraform supprime automatiquement toute l\'infrastructure dérivée',
     'Terraform met à jour le code source pour refléter le changement manuel'],
    'Au `plan`, Terraform **rafraîchit** l\'état réel et le compare au state + config. Le drift apparaît comme un diff : `apply` **ré-impose** la configuration déclarée (le changement console est écrasé). D\'où la règle : l\'infra gérée par Terraform ne se modifie **pas** à la main.',
    ['terraform', 'drift', 'state']),

  // ============================================================= NETWORKING
  M('op-net-timewait', 'networking', 'senior', 'Des milliers de TIME_WAIT', 'RFC 793',
    'Un service client ouvre beaucoup de connexions courtes ; `ss` montre des milliers de sockets en TIME_WAIT. Pourquoi cet état existe-t-il ?',
    ['Le côté qui ferme activement garde la socket en TIME_WAIT (~2×MSL) pour absorber les paquets retardataires et fermer proprement',
     'TIME_WAIT signale une fuite de descripteurs à corriger d\'urgence',
     'C\'est un état d\'erreur indiquant que le pair ne répond plus',
     'Le noyau bloque volontairement le trafic pour limiter le débit'],
    '`TIME_WAIT` protège la fin de connexion : le pair qui **ferme en premier** attend ~2×MSL pour que les segments en vol expirent et éviter qu\'un vieux paquet contamine une nouvelle connexion sur le même couple ports. Remèdes : réutiliser les connexions (keep-alive/pooling), pas bidouiller `tcp_tw_reuse` à l\'aveugle.',
    ['networking', 'tcp', 'time-wait']),

  M('op-net-mtu', 'networking', 'senior', 'Le VPN qui rame sur les gros transferts', 'RFC 791',
    'Après la mise en place d\'un tunnel (VPN/overlay), les petites requêtes passent mais les gros transferts se figent. Cause probable ?',
    ['Problème de MTU : l\'encapsulation réduit la taille utile, et la fragmentation/PMTU est cassée (ICMP bloqué)',
     'Le DNS résout mal les grosses réponses au-delà de 512 octets',
     'Le certificat TLS expire pendant les transferts longs',
     'La table ARP déborde sur les paquets volumineux'],
    'Un tunnel ajoute des en-têtes → la **MTU effective** baisse. Si les paquets « Don\'t Fragment » dépassent la MTU et que les **ICMP « Fragmentation Needed »** sont filtrés, le *Path MTU Discovery* échoue : les gros paquets sont silencieusement perdus (blackhole). Remèdes : baisser la MTU/MSS clamp, autoriser l\'ICMP.',
    ['networking', 'mtu', 'pmtud']),

  M('op-net-cidr', 'networking', 'intermediate', 'Combien d\'hôtes dans un /24', 'CIDR',
    'Un sous-réseau `10.0.1.0/24`. Combien d\'adresses IP utilisables pour des hôtes ?',
    ['254 : 256 adresses moins l\'adresse réseau (.0) et l\'adresse de broadcast (.255)',
     '256 : toutes les adresses du bloc sont utilisables',
     '255 : seule l\'adresse réseau est réservée',
     '128 : la moitié du bloc est réservée au routage'],
    'Un `/24` = 32−24 = 8 bits d\'hôte = 2⁸ = **256** adresses, dont **2 réservées** : `.0` (réseau) et `.255` (broadcast) → **254 hôtes**. (Les clouds réservent souvent quelques IP de plus pour la passerelle et le DNS.)',
    ['networking', 'cidr', 'subnet']),

  M('op-net-privatesubnet', 'networking', 'senior', 'Sous-réseau privé sans Internet', 'AWS VPC',
    'Des instances dans un sous-réseau privé doivent télécharger des mises à jour depuis Internet sans être joignables depuis l\'extérieur. Quelle brique ?',
    ['Une NAT gateway : sortie Internet initiée par l\'hôte, sans route entrante depuis Internet',
     'Une Internet gateway attachée directement au sous-réseau privé',
     'Un load balancer public pointant vers les instances',
     'Une passerelle VPN site-à-site vers un data center'],
    'Un **sous-réseau privé** n\'a pas de route vers l\'*Internet gateway*. Pour la sortie sortante (updates, API), on route vers une **NAT gateway** (dans un subnet public) : elle traduit les connexions **initiées par l\'hôte**, mais rien ne peut initier une connexion entrante. C\'est le motif public/privé standard.',
    ['networking', 'nat', 'vpc']),

  M('op-net-tls-handshake', 'networking', 'intermediate', 'Ce que fait la poignée TLS', 'RFC 8446',
    'Pendant un handshake TLS, à quoi sert principalement le certificat du serveur ?',
    ['Authentifier le serveur (son identité est signée par une CA de confiance) et transporter sa clé publique',
     'Chiffrer symétriquement toutes les données de la session',
     'Compresser le trafic pour réduire la latence',
     'Stocker le mot de passe de l\'utilisateur de façon sécurisée'],
    'Le **certificat** prouve l\'identité du serveur (chaîne signée jusqu\'à une **CA** de confiance) et fournit sa **clé publique**. Le handshake s\'en sert pour établir un secret partagé (ECDHE) ; ensuite le trafic est chiffré **symétriquement** (AES/ChaCha), bien plus rapide que l\'asymétrique.',
    ['networking', 'tls', 'certificates']),

  // ============================================================= MONITORING
  M('op-mon-cardinality', 'monitoring', 'senior', 'Prometheus qui explose en RAM', 'Prometheus',
    'Après avoir ajouté un label `user_id` à une métrique, Prometheus consomme énormément de RAM et ralentit. Pourquoi ?',
    ['Explosion de cardinalité : chaque valeur de label crée une série temporelle distincte, ici une par utilisateur',
     'Les labels sont stockés en clair et gonflent le disque de logs',
     'user_id force Prometheus à interroger la base applicative en continu',
     'Le label déclenche un recalcul complet de l\'historique à chaque scrape'],
    'Chaque **combinaison unique de labels** = une **série temporelle** stockée en mémoire. Un label à haute cardinalité (`user_id`, `request_id`, email) multiplie les séries → OOM. Règle : labels à **cardinalité bornée** (statut, route, méthode) ; les identifiants uniques vont dans les logs/traces, pas les métriques.',
    ['monitoring', 'cardinality', 'prometheus']),

  M('op-mon-counter-gauge', 'monitoring', 'intermediate', 'Compteur ou jauge ?', 'Prometheus',
    'Quelle métrique doit être un **counter** plutôt qu\'un **gauge** ?',
    ['Le nombre total de requêtes HTTP traitées (monotone croissant, on regarde son taux avec rate())',
     'La température actuelle du CPU',
     'Le nombre de connexions ouvertes à l\'instant t',
     'La quantité de mémoire libre disponible'],
    'Un **counter** ne fait qu\'augmenter (requêtes servies, octets envoyés) ; on l\'exploite via `rate()`/`increase()`. Un **gauge** monte et descend (température, mémoire libre, connexions actives). Confondre les deux casse les calculs : `rate()` sur un gauge n\'a aucun sens.',
    ['monitoring', 'metrics', 'prometheus']),

  M('op-mon-histogram', 'monitoring', 'senior', 'Mesurer les latences', 'Prometheus',
    'Pour calculer un p99 de latence côté serveur agrégé sur plusieurs instances, quel type de métrique choisir ?',
    ['Un histogram : il expose des buckets agrégeables, d\'où on calcule les quantiles (histogram_quantile) après agrégation',
     'Un summary : ses quantiles pré-calculés par instance s\'agrègent parfaitement',
     'Un counter simple divisé par le nombre de requêtes',
     'Un gauge mis à jour à chaque requête avec la dernière latence'],
    'Les **summary** calculent les quantiles **par instance** — et des quantiles **ne s\'additionnent pas** entre instances. Les **histogram** exposent des **buckets** cumulables : on agrège d\'abord, puis `histogram_quantile()`. Pour un p99 global multi-instances, c\'est l\'histogram qu\'il faut.',
    ['monitoring', 'histogram', 'latency']),

  M('op-mon-deadman', 'monitoring', 'senior', 'L\'alerte qui ne sonne jamais', 'Google SRE',
    'Comment détecter que votre chaîne d\'alerting elle-même est en panne (aucune alerte ne partirait même en cas de problème réel) ?',
    ['Une alerte « dead man\'s switch » : une alerte qui doit TOUJOURS être active ; si elle cesse, c\'est que le pipeline est cassé',
     'Augmenter le seuil des alertes existantes pour qu\'elles se déclenchent plus souvent',
     'Envoyer toutes les alertes en double sur deux canaux',
     'Réduire l\'intervalle de scrape pour ne rien manquer'],
    'Un **dead man\'s switch** (ou *watchdog*) est une alerte qui se déclenche en **permanence** et qu\'un système externe surveille : tant qu\'elle arrive, le pipeline vit ; **son silence** signale une panne de l\'alerting (Prometheus down, Alertmanager cassé). On teste ainsi le testeur.',
    ['monitoring', 'alerting', 'dead-mans-switch']),

  M('op-mon-structured-logs', 'monitoring', 'intermediate', 'Logs illisibles à grande échelle', 'observability',
    'À grande échelle, pourquoi préférer des logs structurés (JSON) à des lignes de texte libre ?',
    ['Ils sont indexables et requêtables par champ (niveau, trace_id, user) sans parsing fragile par regex',
     'Ils occupent toujours moins d\'espace disque que le texte',
     'Ils suppriment le besoin de métriques et de traces',
     'Ils sont chiffrés par défaut, contrairement au texte'],
    'Des logs **structurés** (clé/valeur JSON) se filtrent et s\'agrègent par **champ** (`level=error`, `trace_id=…`) dans un backend, sans regex fragiles. Ils permettent la corrélation avec les traces. Ils ne remplacent pas métriques/traces (les trois piliers) et ne sont pas plus compacts, mais bien plus exploitables.',
    ['monitoring', 'logging', 'observability']),

  M('op-mon-slo', 'monitoring', 'intermediate', 'SLI, SLO, SLA', 'Google SRE',
    'Quelle formulation distingue correctement SLI, SLO et SLA ?',
    ['SLI = la mesure (ex. % de requêtes < 300 ms) ; SLO = l\'objectif interne visé (99,9 %) ; SLA = l\'engagement contractuel avec pénalités',
     'SLI = l\'objectif, SLO = la mesure, SLA = le tableau de bord',
     'Les trois désignent la même chose selon le fournisseur cloud',
     'SLA = la mesure technique, SLO = le contrat client, SLI = l\'alerte'],
    '**SLI** = l\'indicateur mesuré (latence, dispo, taux d\'erreur). **SLO** = l\'objectif interne sur ce SLI (ex. 99,9 %). **SLA** = le **contrat** externe (souvent plus laxiste que le SLO) avec pénalités si non tenu. On alerte sur le budget d\'erreur du SLO, bien avant de violer le SLA.',
    ['monitoring', 'slo', 'sre']),
];
