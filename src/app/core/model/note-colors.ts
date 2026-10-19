// Barvy poznámek; ukládá se jméno, odstín určuje vzhled (--note-<id> v styles.scss)
export const NOTE_COLORS = [
  { id: 'yellow', label: 'Žlutá' },
  { id: 'blue', label: 'Modrá' },
  { id: 'green', label: 'Zelená' },
  { id: 'red', label: 'Červená' },
  { id: 'purple', label: 'Fialová' },
  { id: 'gray', label: 'Šedá' },
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number]['id'];

export function isNoteColor(value: unknown): value is NoteColor {
  return NOTE_COLORS.some((color) => color.id === value);
}

// CSS proměnná s odstínem, neznámá barva (např. z importu) = bez barvy
export function noteColorVar(color: string | undefined): string | null {
  return isNoteColor(color) ? `var(--note-${color})` : null;
}
