import { inject, Service } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { createExport, exportFileName, writeLastBackup } from './notes-backup';

const REVOKE_DELAY_MS = 60_000;
// Zpráva, kterou plugin Share na Androidu odmítne zavřenou nabídku sdílení
const SHARE_CANCELED = 'Share canceled';

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

  // Stažení souboru zálohy; čas poslední zálohy se zapamatuje. Vrací false, když se na Androidu zavře nabídka sdílení
  async download(now: Date): Promise<boolean> {
    const file = await this.createFile(now);
    if (Capacitor.isNativePlatform()) {
      // WebView odkaz ke stažení ignoruje: soubor se zapíše do mezipaměti a nabídne se systémovým sdílením (Disk, Soubory…).
      // Pluginy se načítají až tady, web je do balíčku nepotřebuje
      const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const { uri } = await Filesystem.writeFile({ path: file.name, data: await file.text(), directory: Directory.Cache, encoding: Encoding.UTF8 });
      try {
        await Share.share({ files: [uri], title: 'Záloha Tapnote' });
      } catch (error) {
        // Zavřená nabídka sdílení není chyba ani záloha
        if (error instanceof Error && error.message === SHARE_CANCELED) {
          return false;
        }
        throw error;
      }
    } else {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      // Safari a WebView čtou soubor až po kliknutí, proto se URL uvolní později
      setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    }
    writeLastBackup(now);
    return true;
  }
}
