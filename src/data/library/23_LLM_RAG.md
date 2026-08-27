# Infrastructure LLM & systèmes RAG

*Comment ancrer un modèle de langage dans tes données, et l'infrastructure qui rend ça viable en production.*

> Note sur la fraîcheur : les noms de modèles et les prix cités ici sont **illustratifs** et vieillissent vite. Le raisonnement — pourquoi RAG existe, comment marche une recherche vectorielle, où sont les compromis — reste stable. Traite les chiffres comme des ordres de grandeur, pas comme des références. On est en 2025, et ce domaine bouge d'un trimestre à l'autre.

---

## Pourquoi RAG existe

Un LLM est un système figé. Ses poids encodent ce qu'il a vu à l'entraînement, avec une date de coupure, et rien de plus. Pose-lui une question sur ta base de connaissances interne, sur un ticket client d'hier, sur la clause 7.3 d'un contrat qu'il n'a jamais lu — il n'a que deux options : refuser, ou inventer une réponse plausible. C'est le problème de fond. Le modèle **ne connaît pas tes données**, et il n'a aucun moyen de savoir qu'il ne les connaît pas.

Il y a historiquement deux façons de corriger ça. La première est le **fine-tuning** : réentraîner le modèle sur tes données pour graver ta connaissance dans ses poids. C'est puissant mais lourd — il faut un dataset, du GPU, une passe d'entraînement, et il faut recommencer à chaque fois que la donnée change. Un document mis à jour ce matin ? Ton modèle fine-tuné d'hier est déjà périmé, et il n'a aucun moyen de te citer ses sources.

La seconde, c'est **RAG — Retrieval-Augmented Generation**. L'idée est presque bête : plutôt que de faire *apprendre* la donnée au modèle, on la lui *donne* au moment de la question. On récupère les quelques passages pertinents dans ta base, on les colle dans le prompt, et on demande au modèle de répondre en s'appuyant dessus. Le modèle ne mémorise rien ; il lit, à chaque requête, le contexte dont il a besoin.

L'analogie qui tient : le fine-tuning, c'est envoyer quelqu'un réviser pendant six mois pour devenir expert d'un sujet. RAG, c'est lui donner un examen à livre ouvert avec exactement les bonnes pages ouvertes devant lui. Pour la grande majorité des cas d'usage — un chatbot sur ta doc, un assistant qui répond sur tes contrats, un support qui puise dans tes tickets — le livre ouvert gagne. Il est moins cher, il se met à jour instantanément (tu changes le document, pas le modèle), et surtout il est **traçable** : tu sais quels passages ont produit la réponse, donc tu peux la vérifier et l'attribuer.

Le compromis honnête : RAG ne rend pas le modèle plus intelligent, il le rend mieux informé. Si la tâche demande d'assimiler un *style*, un raisonnement métier profond ou un format très spécifique, le fine-tuning garde son intérêt — souvent les deux se combinent. Mais si le besoin est « réponds juste sur ma donnée », commence toujours par RAG.

Tout le reste de ce chapitre est de la plomberie autour de cette idée : comment retrouver « les bonnes pages » de façon fiable, comment les stocker, et comment ne pas se ruiner en le faisant.

---

## Embeddings & similarité vectorielle

### Le problème : retrouver par le sens, pas par les mots

« Retrouver les bonnes pages » suppose qu'on sache mesurer la pertinence. La recherche classique par mots-clés (`WHERE content LIKE '%workflow%'`) échoue dès que l'utilisateur emploie d'autres mots que le document. Quelqu'un tape « comment automatiser une tâche répétitive », le document dit « créer un workflow » — zéro mot en commun, zéro résultat, alors que c'est exactement la bonne page. Il nous faut une recherche par **sens**, pas par surface lexicale.

### L'intuition : transformer le texte en coordonnées

Un **embedding** est un vecteur — une liste de nombres, typiquement 384, 768 ou 1536 dimensions — qui représente le *sens* d'un morceau de texte. Un modèle d'embedding a appris, sur d'énormes corpus, à placer les textes dans un espace géométrique où **la proximité spatiale = la proximité de sens**. « I love pizza » et « Pizza is delicious » atterrissent tout près l'un de l'autre ; « The weather is nice today » atterrit loin.

L'image mentale : imagine une carte où chaque texte est un point. Les textes qui parlent de la même chose forment des quartiers. Chercher devient géométrique : on projette la question dans cette carte, et on regarde quels documents sont dans le voisinage.

### Le détail technique : mesurer la distance

Deux mesures dominent, et la distinction compte pour la suite.

La **similarité cosinus** regarde l'*angle* entre deux vecteurs, en ignorant leur longueur. Elle vaut 1 quand les vecteurs pointent dans la même direction (sens identique), 0 quand ils sont orthogonaux (sans rapport), −1 quand ils sont opposés. C'est la mesure de référence pour le texte, parce qu'elle se moque de la magnitude : un texte long et un texte court sur le même sujet pointent dans la même direction même si leurs vecteurs n'ont pas la même « taille ».

```python
import numpy as np

def cosine_similarity(vec1, vec2):
    vec1, vec2 = np.array(vec1), np.array(vec2)
    dot = np.dot(vec1, vec2)
    return dot / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
```

La formule dit exactement ce que « angle » veut dire : le produit scalaire des deux vecteurs, **normalisé** par leurs longueurs respectives. On divise par les normes précisément pour annuler l'effet de la magnitude et ne garder que la direction.

Le **produit scalaire** (« inner product ») est ce même numérateur, *sans* la normalisation. Il mélange donc direction *et* magnitude. Détail qui a son importance : si tous tes vecteurs sont **normalisés** (longueur ramenée à 1) — ce que font par défaut beaucoup de modèles d'embedding modernes — alors produit scalaire et cosinus donnent le même classement, et le produit scalaire est plus rapide à calculer puisqu'il saute la division. C'est pour ça qu'on le rencontre souvent en production. Retiens ce point, il va nous poser un piège dans pgvector.

### Générer les embeddings : le compromis

Deux familles d'options. Les **API managées** (OpenAI `text-embedding-3-small` à 1536 dimensions, `-3-large` à 3072, ou Cohere) : excellente qualité, zéro infra, mais tu paies chaque appel et ta donnée transite chez un tiers. Les **modèles locaux** via `sentence-transformers` (`all-MiniLM-L6-v2` à 384 dimensions, `all-mpnet-base-v2` à 768, ou une variante multilingue) : gratuits, tournent sur ta machine, ta donnée reste chez toi, au prix d'un peu d'infra et d'une qualité parfois légèrement en dessous du haut de gamme propriétaire.

```python
class EmbeddingService:
    def __init__(self, provider="openai"):
        self.provider = provider
        if provider == "openai":
            self.client = openai.OpenAI()
            self.model = "text-embedding-3-small"   # 1536 dimensions
        elif provider == "sentence-transformers":
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer('all-MiniLM-L6-v2')  # 384 dim

    def embed(self, text: str) -> list[float]:
        if self.provider == "openai":
            r = self.client.embeddings.create(model=self.model, input=text)
            return r.data[0].embedding
        return self.model.encode(text).tolist()

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        # Toujours privilégier le batch : un aller-retour réseau pour N textes.
        if self.provider == "openai":
            r = self.client.embeddings.create(model=self.model, input=texts)
            return [item.embedding for item in r.data]
        return [e.tolist() for e in self.model.encode(texts)]
```

Deux réflexes à ancrer. D'abord, **le nombre de dimensions est un contrat** : si tu indexes en 1536, tu es lié à ce modèle et à cette dimension pour tout le corpus. Changer de modèle d'embedding, c'est réindexer *tout*. Ensuite, **embedde toujours en batch** quand tu peux : un seul aller-retour pour N textes au lieu de N appels, c'est un facteur décisif sur le débit et le coût à l'indexation.

---

## Stockage vectoriel & indexation : pgvector

### Le problème : chercher vite dans des millions de vecteurs

Calculer la similarité entre la question et *tous* les documents fonctionne pour un millier de vecteurs. À un million, un balayage exhaustif à chaque requête s'écroule. Il faut une structure de données pensée pour « trouver les k plus proches voisins » sans tout comparer. C'est le rôle d'un **index vectoriel**, et c'est là que se joue le compromis central de tout le domaine.

### pgvector : ta base vectorielle est déjà installée

La tentation, dès qu'on parle de vecteurs, est d'aller chercher une base spécialisée (Pinecone, Weaviate, Qdrant). Souvent c'est prématuré. **pgvector** est une extension PostgreSQL qui ajoute un type `vector` et les opérateurs de recherche associés. L'avantage est architectural avant d'être technique : tes vecteurs vivent **à côté de tes données relationnelles**, dans la base que tu opères déjà, avec tes transactions, tes backups, tes jointures, tes filtres `WHERE`. Pas de système supplémentaire à déployer, monitorer et synchroniser. Pour la grande majorité des charges — jusqu'à des millions de vecteurs — c'est du niveau production, point.

```sql
CREATE EXTENSION vector;

CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),         -- dimension imposée par le modèle
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

Le `vector(1536)` fige la dimension au niveau du schéma : la base refusera un vecteur d'une autre taille. C'est le contrat évoqué plus haut, rendu explicite par la colonne.

### Les trois opérateurs de distance (et le piège du produit scalaire)

pgvector expose trois opérateurs, et il faut les manier avec précision car **ils rangent tous dans le sens « plus petit = plus proche »** — ce sont des *distances*, pas des scores de similarité.

`<=>` est la **distance cosinus**. Elle vaut `1 - similarité_cosinus`. Donc 0 = identique, 2 = opposé. Pour afficher la similarité familière (entre −1 et 1), on écrit `1 - (embedding <=> query)`. Pour classer du plus pertinent au moins pertinent, on ordonne la distance en **ASC** :

```sql
SELECT content,
       1 - (embedding <=> '[0.1, 0.2, ...]') AS similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'   -- ASC : distance croissante
LIMIT 5;
```

`<->` est la **distance euclidienne (L2)** : 0 = identique, croît sans borne. Même logique, `ORDER BY ... ASC`.

`<#>` est le piège. Il renvoie le **produit scalaire négatif** — pgvector le nie exprès pour que, comme les deux autres, « plus petit = plus proche » reste vrai. Les lignes les plus similaires ont donc la valeur la plus **négative**, et on ordonne toujours en **ASC**. Pour afficher le vrai produit scalaire (où « plus grand = plus similaire »), on multiplie par −1 :

```sql
SELECT content,
       (embedding <#> '[0.1, 0.2, ...]') * -1 AS inner_product
FROM documents
ORDER BY embedding <#> '[0.1, 0.2, ...]' ASC   -- ASC, jamais DESC
LIMIT 5;
```

L'erreur classique — et coûteuse car silencieuse — est de raisonner « produit scalaire, donc plus grand = mieux, donc `ORDER BY ... DESC` ». Avec `<#>` c'est faux : tu récupérerais les vecteurs les *plus dissemblables*, sans aucune erreur SQL pour t'avertir. La règle mnémotechnique tient en une phrase : **avec pgvector, les trois opérateurs se rangent en ASC, parce que ce sont des distances**.

### HNSW vs IVFFlat : le compromis vitesse / mémoire / rappel

Un index vectoriel est **approximatif** (on parle d'ANN, *approximate nearest neighbors*). Il accepte de rater de temps en temps le voisin exact en échange d'une recherche des dizaines à des milliers de fois plus rapide. La qualité de cette approximation s'appelle le **rappel** (recall) : la fraction des vrais plus proches voisins effectivement retrouvés. Tout se joue sur le triangle **vitesse / mémoire / rappel**, et pgvector propose deux index qui l'arbitrent différemment.

**HNSW** (*Hierarchical Navigable Small World*) construit un graphe multi-couches où chaque vecteur est connecté à ses voisins. Chercher, c'est naviguer ce graphe de proche en proche, comme un réseau de routes avec des autoroutes pour les grands sauts et des rues pour l'approche fine. C'est **rapide et d'excellent rappel**, au prix d'une construction plus lente et d'une **empreinte mémoire plus grande**. C'est le défaut raisonnable aujourd'hui.

```sql
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

Deux paramètres à la construction gouvernent le compromis. `m` est le nombre de connexions par nœud (défaut 16) : plus haut = meilleur rappel mais plus de mémoire. `ef_construction` est la profondeur d'exploration pendant le build (défaut 64) : plus haut = graphe de meilleure qualité mais construction plus lente.

```sql
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

Et un paramètre **à la requête**, `hnsw.ef_search` (défaut 40) : il fixe la largeur d'exploration au moment de chercher. Le monter améliore le rappel au prix de la latence — c'est ton bouton « précision vs vitesse » réglable sans reconstruire l'index :

```sql
SET hnsw.ef_search = 40;   -- plus haut = plus précis, plus lent
```

**IVFFlat** partitionne l'espace en `lists` cellules (via un clustering type k-means), et à la requête ne fouille que les quelques cellules les plus proches. Moins de mémoire que HNSW, construction plus rapide, mais **rappel plus sensible au réglage** et généralement inférieur à qualité égale. Détail piégeux : il faut idéalement construire un index IVFFlat **après** avoir chargé des données représentatives, sinon le partitionnement est mal calibré.

```sql
CREATE INDEX ON documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

En pratique : **HNSW par défaut**. Passe à IVFFlat si la mémoire est ta contrainte dure ou si tu réindexes très fréquemment. Et une remarque de fond qui vaut pour les deux : **`vector_cosine_ops` doit correspondre à ta mesure**. Si tu comptes chercher en cosinus, l'index doit être en `vector_cosine_ops` ; un index construit pour une distance et interrogé avec une autre ne sera tout simplement pas utilisé.

### Recherche hybride : le vecteur ne fait pas tout

La recherche vectorielle excelle sur le sens mais peut manquer les **correspondances exactes** — un code produit, un nom propre, un identifiant, un terme rare. « ERR_5012 » n'a pas de voisin sémantique utile ; il faut le match littéral. D'où la **recherche hybride** : combiner la similarité vectorielle avec la recherche plein-texte de Postgres (`tsvector` / `ts_rank`), et pondérer les deux scores.

```sql
ALTER TABLE documents ADD COLUMN content_tsvector tsvector;
UPDATE documents SET content_tsvector = to_tsvector('english', content);
CREATE INDEX ON documents USING GIN (content_tsvector);

SELECT content,
       1 - (embedding <=> $1)                                   AS similarity,
       ts_rank(content_tsvector, to_tsquery('english', $2))     AS text_rank
FROM documents
WHERE content_tsvector @@ to_tsquery('english', $2)
ORDER BY (1 - (embedding <=> $1)) * 0.7                         -- 70 % vectoriel
       + ts_rank(content_tsvector, to_tsquery('english', $2)) * 0.3  -- 30 % lexical
       DESC
LIMIT 5;
```

Ici on classe par un score composite, donc `DESC` est correct — on n'ordonne plus une distance brute mais une pertinence agrégée. Les poids 0.7 / 0.3 sont un point de départ à calibrer sur *tes* requêtes. La recherche hybride est presque toujours meilleure que le vecteur seul dès qu'il y a du jargon, des références ou des noms propres dans le corpus.

---

## Le pipeline RAG de bout en bout

On a les briques ; assemblons la chaîne. Un système RAG a deux temps bien distincts : une phase **hors-ligne** (indexation) qu'on fait une fois et qu'on rejoue quand la donnée change, et une phase **à la requête** (récupération + génération) qui tourne à chaque question.

```text
INDEXATION (hors-ligne) :  Documents → Chunks → Embeddings → Base vectorielle
RÉCUPÉRATION (à la requête) : Question → Embedding → Recherche vectorielle → Top-K passages
GÉNÉRATION (à la requête)  : Question + passages → LLM → Réponse
```

### Phase 1 — Indexation : découper avant d'embedder

On n'embedde pas un document de 40 pages en un seul vecteur : le sens s'y dilue, et un vecteur unique ne peut pas représenter fidèlement dix sujets à la fois. On **découpe** (chunking) en morceaux de taille gérable, chacun embeddé séparément. C'est une des décisions les plus structurantes de tout le système, parce que **le chunk est l'unité de récupération** : c'est lui qu'on retrouvera et qu'on injectera dans le prompt.

```python
def _chunk_text(self, text, chunk_size=500, overlap=50):
    """
    Découpe en morceaux qui se chevauchent.

    ATTENTION : chunk_size et overlap sont ici comptés en MOTS (text.split()),
    pas en tokens (~1 token ≈ 0.75 mot). Pour un vrai découpage en tokens,
    utiliser un tokenizer comme tiktoken. Le chevauchement préserve le
    contexte à la frontière entre deux chunks.
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunks.append(' '.join(words[i:i + chunk_size]))
    return chunks
```

Deux réglages, deux compromis. La **taille** : trop petit, chaque chunk perd son contexte et la réponse devient fragmentaire ; trop grand, tu récupères du bruit autour de l'info utile et tu gaspilles du budget de contexte. L'ordre de grandeur usuel se situe autour de 500 à 1000 tokens. Le **chevauchement** (overlap) : sans lui, une phrase coupée pile à la frontière de deux chunks est perdue pour les deux ; un recouvrement de ~10 % préserve la continuité au prix d'un peu de redondance stockée.

Une nuance importante et facile à rater, signalée dans le code ci-dessus : ce découpage naïf compte en **mots** (`text.split()`), pas en **tokens**. Or c'est en tokens que le modèle facture et que le contexte se remplit — et environ 1 token ≈ 0,75 mot. Pour un contrôle réel du budget, découpe avec le tokenizer du modèle (`tiktoken` côté OpenAI). Le mot-à-mot est une approximation acceptable pour prototyper, pas pour dimensionner précisément.

Le reste de l'indexation enchaîne mécaniquement : pour chaque chunk, générer l'embedding et l'insérer avec son contenu et ses métadonnées.

```python
def index_documents(self, documents):
    for doc in documents:
        for chunk in self._chunk_text(doc["content"], chunk_size=500):
            embedding = self.embedder.embed(chunk)
            self.cur.execute(
                "INSERT INTO documents (content, embedding, metadata) VALUES (%s, %s, %s)",
                (chunk, embedding, json.dumps(doc["metadata"]))
            )
    self.conn.commit()
```

Les **métadonnées** (`JSONB`) ne sont pas décoratives : source, section, date, niveau d'accès. Elles servent à filtrer (`WHERE metadata->>'lang' = 'fr'`), à citer la provenance dans la réponse, et à gérer les permissions — ne jamais récupérer un passage qu'un utilisateur n'a pas le droit de voir.

### Phase 2 — Récupération : la qualité de la réponse se joue ici

À la requête, on embedde la question avec **le même modèle** qu'à l'indexation (sinon les vecteurs ne vivent pas dans le même espace, et la comparaison n'a aucun sens), puis on cherche les k plus proches.

```python
def retrieve(self, query, top_k=3, similarity_threshold=0.7):
    query_embedding = self.embedder.embed(query)
    self.cur.execute(
        """
        SELECT content, metadata, 1 - (embedding <=> %s) AS similarity
        FROM documents
        WHERE 1 - (embedding <=> %s) > %s        -- écarte les passages faibles
        ORDER BY embedding <=> %s                -- distance ASC
        LIMIT %s
        """,
        (query_embedding, query_embedding, similarity_threshold, query_embedding, top_k)
    )
    return [
        {"content": r[0], "metadata": json.loads(r[1]), "similarity": r[2]}
        for r in self.cur.fetchall()
    ]
```

Deux garde-fous. `top_k` limite le nombre de passages — chacun consomme du budget de contexte et de l'argent, donc on n'en prend que quelques-uns. Le `similarity_threshold` écarte les passages trop faibles : mieux vaut ne rien renvoyer que du bruit, car un contexte hors-sujet **pousse le modèle à halluciner** en tentant de raccrocher les wagons. C'est le principe directeur du RAG : **récupération pourrie = réponse pourrie**. Aucune prouesse de génération ne rattrape un mauvais contexte, et l'immense majorité des échecs RAG en production sont des échecs de *récupération*, pas de génération.

### Phase 3 — Génération : construire le prompt et cadrer le modèle

On assemble les passages récupérés en un bloc de contexte, on le place dans un **prompt système** qui donne au modèle une consigne stricte, et on pose la question de l'utilisateur.

```python
def generate_answer(self, query, retrieved_docs):
    context = "\n\n".join(
        f"Document {i+1}:\n{doc['content']}" for i, doc in enumerate(retrieved_docs)
    )
    system_prompt = """
You are a helpful assistant. Answer questions based ONLY on the provided context.
If the answer is not in the context, say "I don't have enough information to answer."

Context:
{context}
"""
    messages = [
        {"role": "system", "content": system_prompt.format(context=context)},
        {"role": "user", "content": query},
    ]
    return self.llm.complete(messages)["content"]
```

La consigne « réponds **uniquement** à partir du contexte, sinon dis que tu ne sais pas » est le cœur du **grounding**. Sans elle, le modèle complète les trous avec sa connaissance paramétrique — parfois juste, souvent inventée, jamais traçable. Avec elle, tu transformes un générateur créatif en un lecteur discipliné, et tu obtiens une réponse vérifiable contre des sources que tu peux exhiber.

Le pipeline complet ne fait qu'enchaîner récupérer puis générer, avec le repli propre quand rien ne dépasse le seuil :

```python
def ask(self, query):
    retrieved = self.retrieve(query, top_k=3)
    if not retrieved:
        return {"answer": "I don't have enough information to answer this question.",
                "sources": []}
    answer = self.generate_answer(query, retrieved)
    return {
        "answer": answer,
        "sources": [
            {"content": d["content"][:200] + "...", "similarity": d["similarity"],
             "metadata": d["metadata"]}
            for d in retrieved
        ],
    }
```

Renvoyer les **sources** avec la réponse n'est pas un luxe : c'est ce qui rend le système auditable. L'utilisateur voit d'où vient l'affirmation, et toi tu peux diagnostiquer un mauvais résultat en regardant ce qui a été récupéré.

### Fenêtre de contexte & budget de tokens

Tout ce pipeline vit sous une contrainte physique : la **fenêtre de contexte**, le nombre maximal de tokens que le modèle traite en une fois — prompt système, contexte récupéré, question et réponse compris. C'est un budget fermé qu'il faut répartir. Un prompt système verbeux, dix chunks trop gros, et il ne reste plus de place pour une réponse développée — ou pire, la requête est rejetée. Ça se paie deux fois : en argent, car **tu paies chaque token en entrée comme en sortie**, et en qualité, car noyer trois phrases utiles dans vingt pages de contexte dégrade la réponse (le modèle « se perd au milieu »). Le bon réflexe RAG n'est pas « mettre le plus de contexte possible » mais « mettre le *strict nécessaire* le plus pertinent » — ce qui renvoie, encore, à la qualité de la récupération.

---

## Servir, cacher, mesurer : les préoccupations de production

### Où tourne le modèle : API vs auto-hébergé

Le premier arbitrage d'infra est : appeler une **API** (OpenAI, Anthropic…) ou **héberger** un modèle open-source toi-même. L'API est le chemin le plus simple et le plus rapide à mettre en route — pas de GPU, pas d'ops — mais c'est aussi le plus cher au token, et ta donnée sort de chez toi. L'auto-hébergement inverse le compromis : coût marginal quasi nul par token une fois le GPU amorti, donnée souveraine, latence maîtrisée, au prix d'une vraie charge opérationnelle.

Côté serving auto-hébergé, l'outil de référence est **vLLM**. Il sert des modèles open-source (Llama-3.x, Mistral…) bien plus efficacement qu'une boucle HuggingFace naïve, grâce à deux idées. Le **PagedAttention** gère la mémoire du cache d'attention comme un OS gère la RAM par pages, ce qui évite le gaspillage et permet de tenir bien plus de requêtes simultanées. Le **continuous batching** agrège les requêtes concurrentes à la volée pour saturer le GPU au lieu de le laisser tourner à vide entre deux appels. Bonus pratique décisif : vLLM expose une **API compatible OpenAI** — tu changes juste l'URL de base, et le reste de ton code ne bouge pas.

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="not-needed")
response = client.chat.completions.create(
    model="mistralai/Mistral-7B-Instruct-v0.2",
    messages=[{"role": "user", "content": "What is the capital of France?"}],
)
```

Levier complémentaire quand le GPU est la contrainte : la **quantization**, qui réduit la précision des poids (fp16 → int8 → int4). Un Mistral-7B passe d'environ 14 Go en fp16 à ~4 Go en 4-bit — près de 3,5× plus petit, pour une perte de qualité souvent marginale. Les méthodes courantes : GPTQ (rapide, bonne qualité), AWQ (qualité un peu meilleure, légèrement plus lent), GGUF (pour l'inférence CPU via llama.cpp). Concrètement, la quantization est ce qui fait tenir un modèle sérieux sur une seule carte au lieu de deux.

### Suivre le coût

Dès qu'un LLM est en production, le coût dérive silencieusement — chaque appel se facture au token, entrée et sortie à des tarifs différents. Un suivi minimal, appliqué à chaque appel, évite la mauvaise surprise en fin de mois :

```python
def _calculate_cost(self, usage):
    p = self.pricing[self.model]          # $ par 1K tokens, illustratif
    return (usage.prompt_tokens   / 1000) * p["input"] \
         + (usage.completion_tokens / 1000) * p["output"]
```

Le principe qui compte, au-delà des chiffres (rappel : **illustratifs, à revérifier**) : **les tokens de sortie coûtent nettement plus cher que ceux d'entrée** — souvent un facteur 3 à 4 — et les modèles « mini » sont plus d'un ordre de grandeur moins chers que les modèles pleins. Deux conséquences directes. D'abord, demander des réponses concises n'est pas qu'une question de style, c'est une ligne budgétaire. Ensuite, **choisir le bon modèle par tâche** : router les cas simples vers un petit modèle et ne réserver le gros que là où il fait la différence est souvent l'optimisation la plus rentable de tout le système.

### Cacher, la vraie économie

L'optimisation la plus payante n'est pas de payer moins cher, c'est de **ne pas appeler du tout**. Un système RAG offre trois niveaux de cache naturels, du moins au plus spécifique.

Le **cache d'embeddings** est le plus solide : un texte donné produit toujours le même vecteur, donc on peut le mettre en cache quasi indéfiniment. Il sert à la fois à l'indexation (ne pas ré-embedder un chunk déjà vu) et à la récupération (les questions récurrentes). Point d'attention d'ingénierie : pour qu'il agisse *partout*, on branche le cache directement sur la méthode `embed` de l'embedder, de sorte que tout code appelant `self.embedder.embed(...)` — indexation comme récupération — en profite sans le savoir.

```python
class CachedRAGSystem(RAGSystem):
    def __init__(self):
        super().__init__()
        self.redis = redis.Redis(host='localhost', port=6379, db=0)
        self.EMBEDDING_TTL = 86400 * 30   # 30 jours : un embedding ne change pas
        self.RETRIEVAL_TTL = 3600         # 1 h : les docs peuvent bouger
        self.RESPONSE_TTL  = 3600         # 1 h : la réponse peut évoluer

        # On branche le cache SUR embed(), pour que index_documents() ET
        # retrieve() — qui appellent tous deux self.embedder.embed(...) —
        # en bénéficient automatiquement.
        self._embed_uncached = self.embedder.embed
        self.embedder.embed = self.embed_with_cache

    def embed_with_cache(self, text):
        key = f"embedding:{hashlib.md5(text.encode()).hexdigest()}"
        if (hit := self.redis.get(key)):
            return json.loads(hit)
        # Appeler la version NON cachée pour éviter la récursion infinie.
        emb = self._embed_uncached(text)
        self.redis.setex(key, self.EMBEDDING_TTL, json.dumps(emb))
        return emb
```

Deux subtilités qui font que ce cache est *réellement* actif, et pas juste une méthode jamais appelée. On sauvegarde la fonction d'origine dans `self._embed_uncached` **avant** de remplacer `self.embedder.embed`, puis on appelle cette version sauvegardée à l'intérieur du wrapper — sans quoi le cache s'appellerait lui-même en boucle infinie. Et parce qu'on redirige la méthode de l'embedder plutôt qu'un point d'appel précis, les méthodes héritées de `RAGSystem` passent par le cache **sans être modifiées**. C'est ce câblage-là qui distingue un cache branché d'un cache décoratif.

Les deux autres niveaux suivent la même mécanique avec des durées de vie (TTL) plus courtes, parce qu'ils dépendent d'une donnée qui peut changer. Le **cache de récupération** (question → passages) et le **cache de réponse** (question → réponse finale) se gardent typiquement à l'heure : les documents sous-jacents peuvent être mis à jour, donc on accepte de se retromper un court instant, pas un mois. Détail utile pour le cache de réponse : **normaliser la question** (minuscules, espaces coupés) avant d'en faire la clé, pour que « Comment créer un workflow ? » et « comment créer un workflow » tapent la même entrée.

```python
def ask_with_cache(self, query):
    normalized = query.lower().strip()
    key = f"response:{hashlib.md5(normalized.encode()).hexdigest()}"
    if (hit := self.redis.get(key)):
        return json.loads(hit)
    result = self.ask(query)
    self.redis.setex(key, self.RESPONSE_TTL, json.dumps(result))
    return result
```

Le compromis du cache est toujours le même : **fraîcheur contre coût/latence**. Le TTL est le curseur. Un cache trop long sert des réponses périmées après une mise à jour de la doc ; trop court, il ne sert plus à rien. Cale-le sur la vitesse réelle à laquelle *ta* donnée bouge.

---

## Les limites de ce socle, et quoi ajouter ensuite

Ce qui précède est un RAG fonctionnel et honnête. Mais c'est un socle, pas un système mûr. Voici, sans langue de bois, ce qui manque et pourquoi — le domaine bouge vite, considère cette liste comme une carte des directions, pas comme un dogme.

**Le reranking.** La recherche vectorielle est rapide mais approximative : elle compare deux vecteurs figés, calculés *indépendamment* l'un de l'autre. Un **cross-encoder** (bge-reranker, Cohere Rerank) fait mieux : il lit la question *et* le passage **ensemble** et produit un score de pertinence bien plus fin — au prix d'un calcul lourd, impossible à appliquer à toute la base. Le motif gagnant est donc en deux temps : récupérer largement en vectoriel (disons top-50, rapide), puis **reranker** ces 50 candidats pour n'en garder que les 3 ou 5 meilleurs à injecter. Compromis : une latence et un coût supplémentaires, contre un gain de précision souvent spectaculaire. Quand la qualité de récupération plafonne, c'est le premier levier à ajouter.

**L'évaluation.** « Ça a l'air de marcher » n'est pas une métrique, et pourtant c'est là que s'arrêtent trop de systèmes. Un framework comme **RAGAS** mesure ce qui compte vraiment : la *faithfulness* (la réponse s'appuie-t-elle réellement sur le contexte, ou hallucine-t-elle ?), l'*answer relevancy* (répond-elle à la question ?), la *context precision/recall* (a-t-on récupéré les bons passages, et rien que les bons ?). Sans évaluation, tu ne peux pas améliorer ton système, seulement le tripatouiller à l'aveugle : chaque changement de chunking, de seuil ou de modèle devient un pari non mesuré. C'est le chantier le moins glamour et le plus rentable.

**Long-context vs RAG.** Les fenêtres de contexte ont explosé — des centaines de milliers de tokens, parfois plus. Tentation légitime : « et si j'injectais tout le corpus et laissais le modèle trier ? » Parfois c'est la bonne réponse, quand la base est petite et qu'on veut zéro effort d'infra. Mais ça se paie : coût qui grimpe linéairement avec chaque token à chaque requête, latence qui augmente, et qualité qui se dégrade quand l'info utile est noyée au milieu d'un contexte immense (le fameux « lost in the middle »). RAG reste la réponse dès que le corpus est grand, que le coût par requête compte, ou qu'on veut de la traçabilité. Ce n'est pas « RAG ou long-context », c'est un curseur à placer selon la taille du corpus et le budget.

**Les structured outputs.** Notre pipeline renvoie du texte libre. Dès qu'un système *consomme* la sortie du modèle — une API, un workflow, une base — il lui faut du JSON valide, garanti, à tous les coups. Les mécanismes de **structured output** (`response_format`, contrainte par schéma JSON) forcent le modèle à produire une structure conforme au lieu d'espérer qu'il « pense » à bien formater. C'est la différence entre un prototype qui marche quand le modèle coopère et un système qui ne casse pas en production sur une virgule mal placée.

**Agentic RAG & GraphRAG.** Notre RAG fait *une* récupération puis *une* génération. Beaucoup de vraies questions n'entrent pas dans ce moule : « compare l'approche du document A avec celle du document B et dis-moi laquelle s'applique à mon cas » demande plusieurs récupérations, du raisonnement intermédiaire, parfois une reformulation de la requête en cours de route. Le **RAG agentique** donne au modèle la main pour piloter sa propre récupération — chercher, lire, décider s'il lui manque quelque chose, rechercher encore. Le **GraphRAG** structure la connaissance en graphe d'entités et de relations plutôt qu'en chunks isolés, pour répondre aux questions qui exigent de relier des faits dispersés. Plus puissant, nettement plus complexe, plus cher, plus lent — à ne sortir que quand les questions le justifient réellement, pas par défaut.

---

## À retenir

1. **RAG > fine-tuning dans la plupart des cas.** Moins cher, se met à jour instantanément (tu changes la donnée, pas le modèle), et surtout traçable. Commence toujours par là ; garde le fine-tuning pour le style ou le raisonnement métier profond.

2. **La récupération fait la réponse.** Récupération pourrie = réponse pourrie, sans exception. La quasi-totalité des échecs RAG sont des échecs de récupération, pas de génération. C'est là qu'il faut investir : chunking, seuils, recherche hybride, reranking.

3. **pgvector suffit très largement.** Tes vecteurs à côté de tes données relationnelles, avec tes transactions et tes backups. Pas de base vectorielle séparée avant d'en avoir la preuve du besoin.

4. **Avec pgvector, on range en ASC.** `<=>`, `<->` et `<#>` sont des *distances* : plus petit = plus proche. En particulier `<#>` renvoie le produit scalaire **négatif** — jamais `ORDER BY ... DESC` sur `<#>`, ce serait chercher les vecteurs les plus dissemblables sans la moindre erreur SQL.

5. **HNSW par défaut, IVFFlat si la mémoire est la contrainte.** Un index vectoriel échange du rappel contre de la vitesse ; règle le curseur avec `ef_search` sans reconstruire. Et l'index doit correspondre à la mesure (`vector_cosine_ops` pour du cosinus).

6. **Le budget de tokens est fermé — vise le pertinent, pas le volumineux.** La sortie coûte 3-4× l'entrée, un modèle « mini » coûte un ordre de grandeur de moins. Router par tâche et cacher (embeddings surtout, quasi indéfiniment) sont les optimisations les plus rentables.

7. **Un socle n'est pas un système mûr.** Reranking, évaluation (RAGAS), structured outputs, arbitrage long-context, agentic/GraphRAG : ajoute-les quand le besoin réel apparaît, pas par principe. Et n'oublie jamais que noms de modèles et prix sont illustratifs — revérifie avant de dimensionner.

---

## Pour aller plus loin

- **Documentation pgvector** — la référence sur les opérateurs de distance, HNSW/IVFFlat et leurs paramètres. C'est la source d'autorité sur le comportement de `<#>`.
- **RAGAS** — pour transformer « ça a l'air de marcher » en métriques (faithfulness, answer/context relevancy, precision/recall). À installer tôt, pas à la fin.
- **vLLM** — documentation du serving auto-hébergé : PagedAttention, continuous batching, quantization, API compatible OpenAI.
- **Rerankers cross-encoder** — bge-reranker (open-source) ou Cohere Rerank, pour le motif « récupérer large puis reranker fin ».
- **« Lost in the middle » (Liu et al.)** — l'article qui documente pourquoi noyer l'info utile dans un long contexte dégrade la réponse ; utile pour arbitrer long-context vs RAG.
- **GraphRAG (Microsoft Research)** — le point d'entrée sérieux si tes questions exigent de relier des faits dispersés dans le corpus.

> Le meilleur modèle est celui que tu peux te permettre de faire tourner en production. Tout l'enjeu de ce chapitre — récupérer juste, cacher, mesurer le coût — sert cette phrase.
