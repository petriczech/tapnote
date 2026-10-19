import { isNoteColor, noteColorVar } from './note-colors';

describe('note colors', () => {
  it('recognizes palette colors only', () => {
    expect(isNoteColor('yellow')).toBe(true);
    expect(isNoteColor('#ff0')).toBe(false);
    expect(isNoteColor(undefined)).toBe(false);
  });

  it('maps a color to its CSS variable', () => {
    expect(noteColorVar('green')).toBe('var(--note-green)');
    expect(noteColorVar('red; background: url(x)')).toBeNull();
    expect(noteColorVar(undefined)).toBeNull();
  });
});
