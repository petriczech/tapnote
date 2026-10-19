import { createNote, Note } from '../model/note';
import { createNoteSearch, normalizeTerm, parseQuery } from './note-search';

function note(id: string, title: string, content = '', tags: string[] = []): Note {
  return { ...createNote(id, '2026-10-15T10:00:00.000Z'), title, content, tags };
}

const notes: Note[] = [
  note('shopping', 'Nákup', 'čokoláda, mléko, chleba', ['domov']),
  note('meeting', 'Porada', 'termín projektu a nákup licencí', ['práce']),
  note('trip', 'Výlet na Sněžku', 'batoh, svačina'),
  note('recipe', 'Recept', 'čokoládový dort', ['úkol']),
];
const search = createNoteSearch(notes);
const ids = (query: string, candidates = notes) => search(query, candidates).map((n) => n.id);

describe('normalizeTerm', () => {
  it('drops diacritics and case', () => {
    expect(normalizeTerm('ČOKOLÁDA Žluťoučký')).toBe('cokolada zlutoucky');
  });
});

describe('parseQuery', () => {
  it('splits tags from text', () => {
    expect(parseQuery('  #Domov mléko  #úkol chleba ')).toEqual({ text: 'mléko chleba', tags: ['domov', 'ukol'] });
  });

  it('keeps a lone # as text', () => {
    expect(parseQuery('#')).toEqual({ text: '#', tags: [] });
  });
});

describe('createNoteSearch', () => {
  it('ignores diacritics', () => {
    expect(ids('cokolada')).toEqual(['shopping']);
  });

  it('matches a word prefix', () => {
    expect(ids('sněž')).toEqual(['trip']);
  });

  it('tolerates a typo in longer words', () => {
    expect(ids('porda')).toEqual(['meeting']);
  });

  it('does not fuzz short words', () => {
    expect(ids('mlk')).toEqual([]);
  });

  it('requires all words', () => {
    expect(ids('nákup licencí')).toEqual(['meeting']);
  });

  it('ranks title matches first', () => {
    expect(ids('nákup')).toEqual(['shopping', 'meeting']);
  });

  it('filters by tag without text in candidate order', () => {
    expect(ids('#ukol')).toEqual(['recipe']);
    expect(ids('#domov #práce')).toEqual([]);
  });

  it('combines tags with text', () => {
    expect(ids('#práce nákup')).toEqual(['meeting']);
  });

  it('searches only the candidates', () => {
    expect(ids('nákup', [notes[1]])).toEqual(['meeting']);
  });

  it('searches tags as text', () => {
    expect(ids('domov')).toEqual(['shopping']);
  });
});
