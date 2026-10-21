import { Note } from './note';

// [[Název]] na jednom řádku, bez vnořených závorek
const LINK = /\[\[([^[\]\n]+)\]\]/g;

export type LinkPart = { text: string } | { link: string };

// Klíč pro porovnání názvů: bez okrajových mezer a bez ohledu na velikost písmen
export function linkKey(title: string): string {
  return title.trim().toLocaleLowerCase('cs');
}

// Názvy odkazovaných poznámek bez duplicit
export function extractLinks(content: string): string[] {
  const links = new Map<string, string>();
  for (const match of content.matchAll(LINK)) {
    const title = match[1].trim();
    if (title && !links.has(linkKey(title))) {
      links.set(linkKey(title), title);
    }
  }
  return [...links.values()];
}

// Rozdělení řádku na prostý text a odkazy
export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let from = 0;
  for (const match of text.matchAll(LINK)) {
    const title = match[1].trim();
    if (!title) {
      continue;
    }
    if (match.index > from) {
      parts.push({ text: text.slice(from, match.index) });
    }
    parts.push({ link: title });
    from = match.index + match[0].length;
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from) });
  }
  return parts;
}

function isActive(note: Note): boolean {
  return !note.deletedAt && !note.isTemplate;
}

// Klíč názvu → id aktivní poznámky; při shodném názvu vyhrává naposledy upravená, při shodném čase první
export function linkTargets(notes: Note[]): Map<string, string> {
  const targets = new Map<string, Note>();
  for (const note of notes) {
    const key = linkKey(note.title);
    const current = targets.get(key);
    if (key && isActive(note) && (!current || note.updatedAt > current.updatedAt)) {
      targets.set(key, note);
    }
  }
  return new Map([...targets].map(([key, note]) => [key, note.id]));
}

// Aktivní poznámky, které odkazují na název poznámky
export function backlinks(notes: Note[], note: Pick<Note, 'id' | 'title'>): Note[] {
  const key = linkKey(note.title);
  // Při shodném názvu se zpětné odkazy ukazují jen u poznámky, na kterou odkaz vede
  const target = linkTargets(notes).get(key);
  if (!key || (target !== undefined && target !== note.id)) {
    return [];
  }
  return notes.filter(
    (other) => other.id !== note.id && isActive(other) && extractLinks(other.content).some((title) => linkKey(title) === key),
  );
}
