import { createNote, Note } from './note';
import { backlinks, extractLinks, linkKey, linkTargets, splitLinks } from './links';

function note(id: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, '2026-10-15T10:00:00.000Z'), ...overrides };
}

describe('linkKey', () => {
  it('ignores surrounding spaces and case', () => {
    expect(linkKey('  Úkoly NA Pátek ')).toBe('úkoly na pátek');
  });
});

describe('extractLinks', () => {
  it('finds titles inside double brackets without duplicates', () => {
    expect(extractLinks('Viz [[Nákup]] a [[ nákup ]], pak [[Porada]]')).toEqual(['Nákup', 'Porada']);
  });

  it('skips empty, multi-line and nested brackets', () => {
    expect(extractLinks('[[]] [[  ]] [[a\nb]] [[x[y]]]')).toEqual([]);
  });
});

describe('splitLinks', () => {
  it('splits a line into text and links', () => {
    expect(splitLinks('Viz [[Nákup]] a [[Porada]].')).toEqual([
      { text: 'Viz ' },
      { link: 'Nákup' },
      { text: ' a ' },
      { link: 'Porada' },
      { text: '.' },
    ]);
  });

  it('keeps a line without links as text', () => {
    expect(splitLinks('jen text [[ ]]')).toEqual([{ text: 'jen text [[ ]]' }]);
    expect(splitLinks('')).toEqual([]);
  });
});

describe('linkTargets', () => {
  it('maps titles of active notes to ids', () => {
    const targets = linkTargets([
      note('a', { title: 'Nákup' }),
      note('trash', { title: 'Koš', deletedAt: '2026-10-16T10:00:00.000Z' }),
      note('tpl', { title: 'Šablona', isTemplate: true }),
      note('empty', { title: '' }),
    ]);

    expect([...targets]).toEqual([['nákup', 'a']]);
  });

  it('prefers the most recently updated note for a shared title', () => {
    const targets = linkTargets([
      note('old', { title: 'Nákup', updatedAt: '2026-10-15T10:00:00.000Z' }),
      note('new', { title: 'nákup', updatedAt: '2026-10-16T10:00:00.000Z' }),
      note('same', { title: 'Nákup', updatedAt: '2026-10-16T10:00:00.000Z' }),
    ]);

    expect(targets.get('nákup')).toBe('new');
  });
});

describe('backlinks', () => {
  it('lists active notes linking to the title', () => {
    const target = note('t', { title: 'Nákup', content: 'Nákup\n[[Nákup]]' });
    const notes = [
      target,
      note('a', { content: 'viz [[ nákup ]]' }),
      note('b', { content: 'viz [[Porada]]' }),
      note('trash', { content: '[[Nákup]]', deletedAt: '2026-10-16T10:00:00.000Z' }),
      note('tpl', { content: '[[Nákup]]', isTemplate: true }),
    ];

    expect(backlinks(notes, target).map((n) => n.id)).toEqual(['a']);
  });

  it('lists links only for the note the title resolves to', () => {
    const older = note('old', { title: 'Nákup', updatedAt: '2026-10-14T10:00:00.000Z' });
    const newer = note('new', { title: 'Nákup', updatedAt: '2026-10-16T10:00:00.000Z' });
    const notes = [older, newer, note('a', { content: '[[Nákup]]' })];

    expect(backlinks(notes, older)).toEqual([]);
    expect(backlinks(notes, newer).map((n) => n.id)).toEqual(['a']);
  });

  it('finds nothing for a note without a title', () => {
    expect(backlinks([note('a', { content: '[[x]]' })], { id: 'n', title: '' })).toEqual([]);
  });
});
