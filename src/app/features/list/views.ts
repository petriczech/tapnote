import { NotesView } from '../../core/model/note-query';

export const VIEWS: { view: NotesView; label: string; empty: string; icon: string }[] = [
  {
    view: 'notes',
    label: 'Poznámky',
    empty: 'Zatím žádné poznámky',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  },
  {
    view: 'archive',
    label: 'Archiv',
    empty: 'Archiv je prázdný',
    icon: 'm20.54 5.23-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5 6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z',
  },
  {
    view: 'trash',
    label: 'Koš',
    empty: 'Koš je prázdný',
    icon: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  },
];
