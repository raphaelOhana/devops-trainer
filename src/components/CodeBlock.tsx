import { Fragment, type ReactNode } from 'react';

// Coloration syntaxique légère, maison (aucune dépendance, 100 % offline).
// Suffisante pour rendre les extraits lisibles et colorés (thème one-dark).
// On génère du JSX (pas de dangerouslySetInnerHTML) → sûr par construction.

type Lang = string;

const KEYWORDS: Record<string, string[]> = {
  common: ['if', 'else', 'for', 'while', 'return', 'function', 'const', 'let', 'var',
    'new', 'class', 'import', 'from', 'export', 'default', 'async', 'await', 'try',
    'catch', 'throw', 'true', 'false', 'null', 'undefined', 'this', 'def', 'elif',
    'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False', 'public', 'private',
    'static', 'void', 'int', 'char', 'struct', 'echo', 'require', 'foreach', 'end'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
    'DELETE', 'JOIN', 'ON', 'AND', 'OR', 'UNION', 'ORDER', 'BY', 'GROUP', 'COUNT',
    'LIMIT', 'CREATE', 'TABLE', 'NOT', 'NULL'],
  dockerfile: ['FROM', 'RUN', 'CMD', 'COPY', 'ADD', 'WORKDIR', 'EXPOSE', 'ENV',
    'ENTRYPOINT', 'USER', 'HEALTHCHECK', 'ARG', 'LABEL', 'AS'],
};

// Un token = un segment coloré.
interface Tok { t: string; cls: string }

function classify(lang: Lang): { kw: Set<string>; caseSensitive: boolean } {
  if (lang === 'sql') return { kw: new Set(KEYWORDS.sql), caseSensitive: false };
  if (lang === 'dockerfile') return { kw: new Set(KEYWORDS.dockerfile), caseSensitive: false };
  return { kw: new Set(KEYWORDS.common), caseSensitive: true };
}

function commentRegex(lang: Lang): RegExp {
  // Ordre : commentaires spécifiques au langage.
  if (lang === 'python' || lang === 'yaml' || lang === 'bash' || lang === 'dockerfile' || lang === 'hcl' || lang === 'nginx')
    return /#[^\n]*/y;
  if (lang === 'sql') return /--[^\n]*/y;
  return /\/\/[^\n]*|\/\*[\s\S]*?\*\//y; // c, js, ts, php, json-ish
}

function tokenize(code: string, lang: Lang): Tok[] {
  const { kw, caseSensitive } = classify(lang);
  const comRe = commentRegex(lang);
  const toks: Tok[] = [];
  let i = 0;
  const n = code.length;

  const push = (t: string, cls: string) => { if (t) toks.push({ t, cls }); };

  while (i < n) {
    const c = code[i];

    // Commentaire
    comRe.lastIndex = i;
    const cm = comRe.exec(code);
    if (cm && cm.index === i) { push(cm[0], 'tok-com'); i += cm[0].length; continue; }

    // Chaîne " ' `
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && code[j] !== c) { if (code[j] === '\\') j++; j++; }
      j = Math.min(j + 1, n);
      push(code.slice(i, j), 'tok-str'); i = j; continue;
    }

    // Nombre
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fx._]/i.test(code[j])) j++;
      push(code.slice(i, j), 'tok-num'); i = j; continue;
    }

    // Identifiant / mot-clé
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      const lookup = caseSensitive ? word : word.toUpperCase();
      let cls = 'tok-id';
      if (kw.has(lookup)) cls = 'tok-key';
      else if (code[j] === '(') cls = 'tok-fn';
      else if (/^[A-Z]/.test(word)) cls = 'tok-type';
      push(word, cls); i = j; continue;
    }

    // Ponctuation notable
    if (/[{}[\]().;:,=<>+\-*/&|!?]/.test(c)) { push(c, 'tok-punc'); i++; continue; }

    // Reste (espaces, etc.)
    push(c, 'tok-txt'); i++;
  }
  return toks;
}

export function CodeBlock({ code, lang }: { code: string; lang: Lang }) {
  const toks = tokenize(code, lang);
  const nodes: ReactNode[] = toks.map((tk, i) =>
    tk.cls === 'tok-txt' || tk.cls === 'tok-id'
      ? <Fragment key={i}>{tk.t}</Fragment>
      : <span key={i} className={tk.cls}>{tk.t}</span>
  );
  return <pre className="codeblock">{nodes}</pre>;
}
