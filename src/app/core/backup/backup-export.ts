import { inject, Service } from '@angular/core';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { createExport, exportFileName, writeLastBackup } from './notes-backup';

const REVOKE_DELAY_MS = 60_000;

// Export zálohy sdílený Nastavením › Záloha a nabídkou zálohy před prvním sloučením v Synchronizaci
@Service()
export class BackupExport {
  private readonly notes = inject(NotesRepository);
  private readonly tasks = inject(TasksRepository);
  private readonly categories = inject(CategoriesRepository);

  // Soubor zálohy všech poznámek, úkolů a kategorií
  async createFile(now: Date): Promise<File> {
    const data = {
      notes: await this.notes.getAll(),
      tasks: await this.tasks.getAll(),
      categories: await this.categories.getAll(),
    };
    const json = JSON.stringify(createExport(data, now), null, 2);
    return new File([json], exportFileName(now), { type: 'application/json' });
  }

  // Stažení souboru zálohy; čas poslední zálohy se zapamatuje
  async download(now: Date): Promise<void> {
    const file = await this.createFile(now);
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    // Safari a WebView čtou soubor až po kliknutí, proto se URL uvolní později
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    writeLastBackup(now);
  }
}
