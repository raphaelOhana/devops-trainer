// Permet d'importer des fichiers texte bruts (cours) : import md from './x.md?raw'
declare module '*.md?raw' {
  const content: string;
  export default content;
}
