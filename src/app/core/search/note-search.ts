import MiniSearch from 'minisearch';
import { Note } from '../model/note';

export interface ParsedQuery {
  text: string;
  tags: string[];
}

// Malá písmena bez diakritiky
export function normalizeTerm(term: string): string {
  return term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Slova s # jsou tagy, zbytek fulltext
export function parseQuery(query: string): ParsedQuery {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const isTag = (word: string) => word.length > 1 && word.startsWith('#');
  return {
    text: words.filter((word) => !isTag(word)).join(' '),
    tags: words.filter(isTag).map((word) => normalizeTerm(word.slice(1))),
  };
}

// Hledání v `candidates`: s textem podle relevance, jinak v jejich pořadí
export type NoteSearch = (query: string, candidates: Note[]) => Note[];

export function createNoteSearch(notes: Note[]): NoteSearch {
  const index = new MiniSearch<Note>({
    fields: ['title', 'content', 'tags'],
    processTerm: normalizeTerm,
    searchOptions: {
      boost: { title: 2, tags: 2 },
      prefix: true,
      fuzzy: (term) => (term.length >= 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  index.addAll(notes);

  return (query, candidates) => {
    const { text, tags } = parseQuery(query);
    const byId = new Map(candidates.map((note) => [note.id, note]));
    const matches = text
      ? index.search(text).flatMap((result) => byId.get(result.id) ?? [])
      : candidates;
    return matches.filter((note) => tags.every((tag) => note.tags.some((noteTag) => normalizeTerm(noteTag) === tag)));
  };
}
