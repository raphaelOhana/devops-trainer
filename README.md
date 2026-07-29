# DevOps Trainer 🚀

PWA d'entraînement **DevOps / software** qui fonctionne **100 % hors-ligne**.
Quiz, debug de config et écriture de code réel — validés automatiquement,
avec XP, niveaux et séries pour donner envie de progresser.

Conçue comme un projet « méta » : on **révise le DevOps dans l'app** tout en
**pratiquant le DevOps sur l'app** (Docker, CI/CD, K8s dans les phases suivantes).

---

## Stack

- **Vite + React + TypeScript** — build statique, léger, rapide
- **vite-plugin-pwa** (Workbox) — service worker, précache, offline total
- **js-yaml** — parsing des configs pour la validation
- Aucun backend, aucun réseau requis après la première visite

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de prod dans dist/
npm run preview    # sert le build (teste le mode hors-ligne)
```

Une fois l'app ouverte une fois, coupe le réseau : elle continue de fonctionner.

---

## Les 3 types d'exercices

| Type | Ce que fait l'utilisateur | Validation |
|------|---------------------------|------------|
| **Quiz** (`mcq`) | Choisit la bonne réponse | Comparaison d'index |
| **Debug** (`find-error`) | Repère l'erreur dans un bloc de code/config | Comparaison d'index |
| **Code** (`write-config`) | Écrit un Dockerfile / YAML K8s / JSON | **Assertions déclaratives** sur la config parsée |

La validation « code » est le cœur : l'utilisateur écrit une vraie config,
elle est parsée (YAML/JSON) puis vérifiée par des règles portées **par l'exercice
lui-même** — feedback précis, ligne par ligne.

---

## Ajouter du contenu (le point clé)

**Un exercice est une donnée, jamais du code.** Pour en ajouter un, on ajoute un
objet dans [`src/data/exercises.ts`](src/data/exercises.ts). Le moteur n'est
jamais modifié.

Exemple d'exercice « écris la config » avec sa validation embarquée :

```ts
{
  id: 'k8s-hpa-amazon',
  type: 'write-config',
  domain: 'devops', topic: 'kubernetes', difficulty: 'intermediate',
  company: 'Amazon',
  scenario: 'Le panier doit encaisser le Black Friday…',
  prompt: 'Écris un HorizontalPodAutoscaler…',
  language: 'yaml',
  assert: [
    { path: 'kind', equals: 'HorizontalPodAutoscaler', msg: 'kind: HorizontalPodAutoscaler' },
    { path: 'spec.minReplicas', equals: 3, msg: 'minReplicas: 3' },
    { path: 'spec.maxReplicas', equals: 20, msg: 'maxReplicas: 20' },
  ],
  solution: '…',
  explanation: 'Le HPA ajuste le nombre de pods…',
}
```

### Opérateurs d'assertion disponibles

`equals` · `gte` · `lte` · `contains` · `matches` (regex) · `exists`.
Le `path` est un chemin pointé dans le YAML/JSON parsé
(ex. `spec.template.spec.containers.0.image`).
Pour un **Dockerfile** (non structuré), on valide le texte brut via
`{ path: '_raw', matches: 'FROM…' }`.

---

## Architecture

```
src/
  engine/
    types.ts       ← modèle de données des exercices (la « forme » du contenu)
    validate.ts    ← moteur de validation, 3 modes, 100% offline
    meta.ts        ← icônes/couleurs par topic et domaine
  data/
    exercises.ts   ← LE CONTENU (objets). C'est ici qu'on enrichit.
  store/
    progress.ts    ← XP, niveaux, série, maîtrise (localStorage)
  components/
    ExerciseView   ← l'écran d'un exercice + célébration
    Confetti, LevelUp, Markdown
  App.tsx          ← HUD gamifié + liste + navigation
```

---

## Déploiement sur GitHub Pages (→ app installable sur téléphone, hors-ligne à vie)

Le dépôt contient un workflow CI ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml))
qui **build et déploie automatiquement** à chaque push sur `main`. Une fois en ligne,
tu ouvres l'URL **une fois** sur ton téléphone, tu l'installes, et elle fonctionne
ensuite **sans réseau, PC éteint, partout**.

### Étapes (une seule fois)

1. **Créer le dépôt GitHub** (public — Pages est gratuit sur les repos publics) :
   ```bash
   # depuis le dossier du projet
   gh repo create devops-trainer --public --source=. --push
   # …ou manuellement : créer le repo sur github.com puis
   git remote add origin https://github.com/<TON_USER>/devops-trainer.git
   git branch -M main
   git push -u origin main
   ```

2. **Activer Pages via Actions** : sur GitHub → **Settings → Pages → Source : GitHub Actions**.

3. Le workflow se lance au push. À la fin, l'app est en ligne sur :
   ```
   https://<TON_USER>.github.io/devops-trainer/
   ```
   (Le `base` s'adapte automatiquement au nom du dépôt via `BASE_PATH`.)

### Installer sur le téléphone

1. Ouvre l'URL ci-dessus dans **Chrome/Safari** sur ton téléphone.
2. Menu → **« Ajouter à l'écran d'accueil »**.
3. Lance l'app depuis l'icône. **Coupe le réseau : elle continue de tourner.**

Pour ajouter des exercices plus tard : `git push` → le CI redéploie → l'app se met à
jour au prochain lancement avec réseau.

> Note : les mises à jour ne s'appliquent qu'**avec réseau**. Hors-ligne, tu gardes la
> dernière version installée — c'est le comportement voulu.

---

## Roadmap

- [x] **Phase 1** — Socle PWA offline, moteur data-driven, gamification, 1er lot d'exercices
- [ ] **Phase 2** — Gros catalogue (cas réels multi-sujets), révision espacée
- [ ] **Phase 3** — Validation « exécution réelle » (hadolint / kubeval en WASM)
- [ ] **Phase 4** — Terrain DevOps : Dockerfile, CI/CD GitHub Actions, K8s, monitoring

---

## Gamification

- **XP** à la première maîtrise d'un exercice (10 / 20 / 30 selon la difficulté)
- **Niveaux** (100 XP chacun) avec overlay de montée de niveau
- **Série 🔥** de bonnes réponses consécutives (+ record)
- **Confettis** à la réussite
- Progression persistée en local — rien ne quitte l'appareil.
