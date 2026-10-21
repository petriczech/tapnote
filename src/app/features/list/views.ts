import { NotesView } from '../../core/model/note-query';

// icon = název z core/icons/icons.ts (Regular v liště, Bold v prázdném stavu)
export const VIEWS: { view: NotesView; label: string; empty: string; icon: 'notes' | 'archive' | 'trash' }[] = [
  {
    view: 'notes',
    label: 'Poznámky',
    empty: 'Zatím žádné poznámky',
    icon: 'notes',
  },
  {
    view: 'archive',
    label: 'Archiv',
    empty: 'Archiv je prázdný',
    icon: 'archive',
  },
  {
    view: 'trash',
    label: 'Koš',
    empty: 'Koš je prázdný',
    icon: 'trash',
  },
];
