import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createNote } from '../model/note';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../storage/testing/in-memory-tasks-repository';
import { BackupExport } from './backup-export';
import { LAST_BACKUP_KEY } from './notes-backup';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: vi.fn() },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

describe('BackupExport', () => {
  const now = new Date('2026-10-28T10:00:00.000Z');
  let backup: BackupExport;

  beforeEach(async () => {
    localStorage.removeItem(LAST_BACKUP_KEY);
    vi.mocked(Filesystem.writeFile).mockReset().mockResolvedValue({ uri: 'file:///cache/zaloha.json' });
    vi.mocked(Share.share).mockReset().mockResolvedValue({ activityType: 'com.google.android.apps.docs' });
    const notes = new InMemoryNotesRepository();
    await notes.bulkPut([createNote('a', '2026-10-15T10:00:00.000Z')]);
    TestBed.configureTestingModule({
      providers: [
        { provide: NotesRepository, useValue: notes },
        { provide: TasksRepository, useValue: new InMemoryTasksRepository() },
        { provide: CategoriesRepository, useValue: new InMemoryCategoriesRepository() },
      ],
    });
    backup = TestBed.inject(BackupExport);
  });

  describe('on Android', () => {
    beforeEach(() => vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true));

    it('writes the backup to the cache, opens the share sheet and remembers the backup', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      expect(await backup.download(now)).toBe(true);

      const options = vi.mocked(Filesystem.writeFile).mock.calls[0][0];
      expect(options).toEqual({ path: (await backup.createFile(now)).name, data: expect.any(String), directory: 'CACHE', encoding: 'utf8' });
      expect(JSON.parse(options.data as string).notes.map((note: { id: string }) => note.id)).toEqual(['a']);
      expect(Share.share).toHaveBeenCalledWith({ files: ['file:///cache/zaloha.json'], title: 'Záloha Tapnote' });
      expect(click).not.toHaveBeenCalled();
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(now.toISOString());
    });

    it('treats a dismissed share sheet as no backup', async () => {
      vi.mocked(Share.share).mockRejectedValue(new Error('Share canceled'));

      expect(await backup.download(now)).toBe(false);

      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
    });

    it('reports other share failures', async () => {
      vi.mocked(Share.share).mockRejectedValue(new Error('only file urls are supported'));

      await expect(backup.download(now)).rejects.toThrow('only file urls are supported');
      expect(localStorage.getItem(LAST_BACKUP_KEY)).toBeNull();
    });
  });

  it('downloads through a link on the web without the native plugins', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    URL.createObjectURL = vi.fn(() => 'blob:zaloha');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(await backup.download(now)).toBe(true);

    expect(click).toHaveBeenCalledTimes(1);
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(now.toISOString());
  });
});
