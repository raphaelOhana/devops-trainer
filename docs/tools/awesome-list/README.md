# Pipeline d'extraction — `0xor0ne/awesome-list`

Régénère [`docs/curriculum.md`](../../curriculum.md) : la cartographie de la
liste source sur les topics de l'app.

```bash
cd docs/tools/awesome-list
curl -sLO https://raw.githubusercontent.com/0xor0ne/awesome-list/main/README.md
mv README.md awesome.md   # attention : écrase ce fichier-ci si oublié
for t in exploitation linux_kernel wireless ot_security red-team-adversary-emulation; do
  curl -sL -o "t_$t.md" "https://raw.githubusercontent.com/0xor0ne/awesome-list/main/topics/$t.md"
done
node extract.mjs    # → entries.json   (parse, résout les liens, déduplique)
node classify.mjs   # → classified.json (nature + topic de l'app)
node gen.mjs        # → ../../curriculum.md
```

Les trois étapes sont indépendantes et relisibles : `extract` ne connaît que le
markdown, `classify` ne porte que les règles de rattachement (à ajuster quand un
topic est ajouté à `src/engine/types.ts`), `gen` ne fait que du rendu.

Les `.md` téléchargés ne sont pas versionnés — seuls les JSON produits le sont,
pour que le curriculum reste diffable sans réseau.
