// Starší znění poznámky; ukládá se jen v zařízení, do zálohy nejde
export interface NoteVersion {
  id: string;
  noteId: string;
  // Markdown
  content: string;
  // Čas, kdy znění platilo (ISO 8601)
  createdAt: string;
}

// Nová verze vznikne, když se poznámka upravuje po pauze aspoň takhle dlouhé
export const VERSION_PAUSE_MS = 2 * 60 * 1000;
// Počet uchovaných verzí jedné poznámky
export const MAX_VERSIONS = 20;
