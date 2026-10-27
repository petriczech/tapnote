import { TestBed } from '@angular/core/testing';
import { Category } from '../model/category';
import { createNote, Note } from '../model/note';
import { OutboxEntry } from '../model/outbox-entry';
import { createTask } from '../model/task';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { OutboxRepository } from '../storage/outbox-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { InMemoryOutboxRepository } from '../storage/testing/in-memory-outbox-repository';
import { InMemoryTasksRepository } from '../storage/testing/in-memory-tasks-repository';
import { AUTH_API_LOADER, AUTH_SESSION_KEY } from './auth.service';
import { CATCH_UP_TIMEOUT_MS, PUSH_DELAY_MS, RETRY_MIN_MS, SYNC_MARKER_PREFIX, SYNC_REMOTE_LOADER, SyncService } from './sync.service';
import { FakeAuthApi } from './testing/fake-auth-api';
import { FakeSyncRemote } from './testing/fake-sync-remote';

const UID = 'uid-1';
const T1 = '2026-10-27T10:00:00.000Z';
const T2 = '2026-10-27T11:00:00.000Z';
const T3 = '2026-10-27T12:00:00.000Z';

function note(id: string, updatedAt: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, T1), title: id, updatedAt, ...overrides };
}

function category(id: string, updatedAt: string): Category {
  return { id, name: id, icon: 'home', color: 'green', order: 0, createdAt: T1, updatedAt };
}

describe('SyncService', () => {
  let auth: FakeAuthApi;
  let remote: FakeSyncRemote;
  let notes: InMemoryNotesRepository;
  let tasks: InMemoryTasksRepository;
  let categories: InMemoryCategoriesRepository;
  let outbox: InMemoryOutboxRepository;
  let loads: number;

  function create(): SyncService {
    TestBed.configureTestingModule({
      providers: [
        { provide: AUTH_API_LOADER, useValue: () => Promise.resolve(auth) },
        { provide: SYNC_REMOTE_LOADER, useValue: () => (loads++, Promise.resolve(() => remote)) },
        { provide: NotesRepository, useValue: notes },
        { provide: TasksRepository, useValue: tasks },
        { provide: CategoriesRepository, useValue: categories },
        { provide: OutboxRepository, useValue: outbox },
      ],
    });
    const sync = TestBed.inject(SyncService);
    TestBed.tick();
    return sync;
  }

  async function started(): Promise<SyncService> {
    const sync = create();
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    return sync;
  }

  // Místní úprava: zápis do repozitáře a do fronty (v aplikaci to dělá middleware Dexie)
  let tick = 0;
  async function edit(record: Note): Promise<void> {
    await notes.put(record);
    outbox.add({ collection: 'notes', id: record.id, op: 'put', at: `2026-10-27T13:00:00.${String(++tick).padStart(3, '0')}Z` });
  }

  const marker = () => JSON.parse(localStorage.getItem(SYNC_MARKER_PREFIX + UID) ?? 'null');
  const remoteNote = (id: string) => remote.docs.notes.get(id)?.record;
  const markInitialized = () => localStorage.setItem(SYNC_MARKER_PREFIX + UID, JSON.stringify({ initialized: true, cursors: {} }));

  beforeEach(() => {
    localStorage.setItem(AUTH_SESSION_KEY, '1');
    auth = new FakeAuthApi({ uid: UID, email: 'petr@example.com' });
    remote = new FakeSyncRemote();
    notes = new InMemoryNotesRepository();
    tasks = new InMemoryTasksRepository();
    categories = new InMemoryCategoriesRepository();
    outbox = new InMemoryOutboxRepository();
    loads = 0;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does nothing without a signed-in user', async () => {
    auth = new FakeAuthApi(null);
    const sync = create();
    await Promise.resolve();

    expect(sync.state()).toBe('off');
    expect(loads).toBe(0);
  });

  it('merges local and remote data on the first sign-in: newer wins both ways, equal keeps local, nothing is deleted', async () => {
    await notes.bulkPut([
      note('local-only', T1),
      note('local-newer', T2, { content: 'místní' }),
      note('remote-newer', T1, { content: 'místní' }),
      note('equal', T2, { content: 'místní' }),
    ]);
    await tasks.put(createTask('t', 'Úkol', T1));
    remote.serverWrite('notes', note('remote-only', T1));
    remote.serverWrite('notes', note('local-newer', T1, { content: 'vzdálená' }));
    remote.serverWrite('notes', note('remote-newer', T3, { content: 'vzdálená' }));
    remote.serverWrite('notes', note('equal', T2, { content: 'vzdálená' }));
    remote.serverWrite('categories', category('c', T1));
    // Dřívější místní změny ve frontě pokryje nahrání všech záznamů
    outbox.add({ collection: 'notes', id: 'local-only', op: 'put', at: T1 });

    await started();

    expect((await notes.getAll()).map((item) => `${item.id}:${item.content}`).sort()).toEqual([
      'equal:místní',
      'local-newer:místní',
      'local-only:',
      'remote-newer:vzdálená',
      'remote-only:',
    ]);
    expect((await categories.getAll()).map((item) => item.id)).toEqual(['c']);
    expect(remoteNote('local-newer')).toMatchObject({ content: 'místní' });
    expect(remoteNote('equal')).toMatchObject({ content: 'vzdálená' });
    expect(remote.docs.tasks.get('t')?.record).toMatchObject({ title: 'Úkol' });
    expect(remote.commits.flat().map((write) => `${write.collection}/${write.id}`).sort()).toEqual([
      'notes/local-newer',
      'notes/local-only',
      'tasks/t',
    ]);
    expect(await outbox.pending()).toEqual([]);
    expect(marker()).toMatchObject({ initialized: true, cursors: { notes: expect.any(String), categories: expect.any(String) } });
  });


  it('merges tombstones on the first sign-in: a later remote delete removes the local record, an older one is outvoted', async () => {
    await notes.bulkPut([note('deleted-later', T1), note('edited-later', T3)]);
    remote.serverWrite('notes', { id: 'deleted-later', deleted: true, updatedAt: T2 });
    remote.serverWrite('notes', { id: 'edited-later', deleted: true, updatedAt: T2 });
    remote.serverWrite('notes', { id: 'only-remote', deleted: true, updatedAt: T2 });

    await started();

    expect([...notes.notes.keys()]).toEqual(['edited-later']);
    expect(remoteNote('edited-later')).toEqual(note('edited-later', T3));
    expect(remote.commits.flat().map((write) => write.id)).toEqual(['edited-later']);
  });

  it('does not download a record deleted on this device before the first sync and sends a tombstone', async () => {
    remote.serverWrite('notes', note('purged', T1));
    outbox.add({ collection: 'notes', id: 'purged', op: 'delete', at: T2 });

    await started();

    expect(await notes.get('purged')).toBeUndefined();
    expect(remoteNote('purged')).toEqual({ id: 'purged', deleted: true, updatedAt: T2 });
    expect(await outbox.pending()).toEqual([]);
  });

  it('skips the full merge once the account is initialized on this device', async () => {
    markInitialized();
    const fetchAll = vi.spyOn(remote, 'fetchAll');

    await started();

    expect(fetchAll).not.toHaveBeenCalled();
  });

  it('treats an invalid marker as an uninitialized account', async () => {
    localStorage.setItem(SYNC_MARKER_PREFIX + UID, JSON.stringify({ initialized: 'yes', cursors: { notes: 5 } }));
    const fetchAll = vi.spyOn(remote, 'fetchAll');

    await started();

    expect(fetchAll).toHaveBeenCalledTimes(3);
    expect(marker()).toMatchObject({ initialized: true });
  });

  it('pulls the server state before pushing, so an older offline edit does not overwrite a newer remote version', async () => {
    markInitialized();
    // Úprava v zařízení offline (T2), mezitím novější verze z jiného zařízení (T3)
    await edit(note('a', T2, { content: 'offline' }));
    remote.serverWrite('notes', note('a', T3, { content: 'novější' }));
    remote.holdSnapshots = true;

    const sync = create();
    await vi.waitFor(() => expect(remote.listeners).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(remote.commits).toEqual([]);

    remote.releaseSnapshots();
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(remoteNote('a')).toMatchObject({ content: 'novější' });
    expect(notes.notes.get('a')?.content).toBe('novější');
  });

  it('pushes the queue as full records and tombstones, then removes only unchanged entries', async () => {
    markInitialized();
    await notes.put(note('a', T1));
    outbox.add({ collection: 'notes', id: 'a', op: 'put', at: T1 });
    outbox.add({ collection: 'tasks', id: 'gone', op: 'delete', at: T2 });
    let release = () => undefined as void;
    remote.gate = new Promise((resolve) => (release = resolve));

    const sync = create();
    await vi.waitFor(() => expect(remote.listeners).toBe(3));
    await vi.waitFor(() => expect(sync.state()).toBe('syncing'));
    // Úprava během odesílání zůstane ve frontě
    await edit(note('a', T2, { content: 'novější' }));
    release();
    await vi.waitFor(() => expect(remote.commits).toHaveLength(1));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));

    expect(remote.commits[0]).toEqual([
      { collection: 'notes', id: 'a', record: note('a', T1) },
      { collection: 'tasks', id: 'gone', record: { id: 'gone', deleted: true, updatedAt: T2 } },
    ]);
    expect((await outbox.pending()).map((entry) => entry.id)).toEqual(['a']);
    expect(sync.lastSyncedAt()).not.toBeNull();
  });

  it('debounces pushes of new changes', async () => {
    markInitialized();
    const sync = await started();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await edit(note('a', T1));
    await edit(note('a', T2));
    expect(sync.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(PUSH_DELAY_MS - 100);
    expect(remote.commits).toEqual([]);

    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();
    await vi.waitFor(() => expect(remoteNote('a')).toEqual(note('a', T2)));
    expect(remote.commits).toHaveLength(1);
    await vi.waitFor(() => expect(sync.pending()).toBe(0));
  });

  it('pushes in batches of at most 500 writes and about 8 MiB', async () => {
    markInitialized();
    const many = Array.from({ length: 501 }, (_, index) => note(`n${index}`, T1));
    const large = ['x', 'y', 'z'].map((id) => note(id, T1, { content: 'ř'.repeat(1_600_000) }));
    await notes.bulkPut([...many, ...large]);
    [...many, ...large].forEach((item) => outbox.add({ collection: 'notes', id: item.id, op: 'put', at: T1 }));

    await started();

    // 'ř' má v UTF-8 2 bajty: dva velké záznamy (2 × 3,2 MB) se do dávky vejdou, třetí ne
    expect(remote.commits.map((batch) => batch.length)).toEqual([500, 3, 1]);
    expect(await outbox.pending()).toEqual([]);
  });

  it.each(['invalid-argument', 'permission-denied'])('skips a record the server rejects with %s, sends the rest and reports an error', async (code) => {
    markInitialized();
    await notes.bulkPut([note('a', T1), note('bad', T1), note('b', T1)]);
    ['a', 'bad', 'b'].forEach((id) => outbox.add({ collection: 'notes', id, op: 'put', at: T1 }));
    remote.rejectWrite = (write) => (write.id === 'bad' ? code : null);

    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(remoteNote('a')).toBeDefined();
    expect(remoteNote('b')).toBeDefined();
    expect(remoteNote('bad')).toBeUndefined();
    expect((await outbox.pending()).map((entry) => entry.id)).toEqual(['bad']);
    // Odmítnutý zápis není zamítnutý účet: příjem dál běží
    expect(remote.listeners).toBe(3);
  });

  it('sends a rejected record on its own afterwards so the other changes stay one batch', async () => {
    markInitialized();
    await notes.bulkPut([note('a', T1), note('bad', T1)]);
    ['a', 'bad'].forEach((id) => outbox.add({ collection: 'notes', id, op: 'put', at: T1 }));
    remote.rejectWrite = (write) => (write.id === 'bad' ? 'invalid-argument' : null);
    const sync = create();
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.rejected()).toBe(1);
    const commit = vi.spyOn(remote, 'commit');

    await edit(note('a', T2));
    await notes.put(note('b', T2));
    outbox.add({ collection: 'notes', id: 'b', op: 'put', at: T2 });
    await vi.waitFor(() => expect(remoteNote('b')).toBeDefined(), { timeout: PUSH_DELAY_MS + 1000 });
    await vi.waitFor(() => expect(sync.state()).toBe('error'));

    expect(commit.mock.calls.map(([writes]) => writes.map((write) => write.id))).toEqual([['a', 'b'], ['bad']]);
    expect(sync.rejected()).toBe(1);

    // Po opravě se odešle a chyba zmizí
    remote.rejectWrite = null;
    dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(sync.rejected()).toBe(0);
    expect(remoteNote('bad')).toBeDefined();
  });

  it('queues a record the first sync could not upload so it is retried after a fix', async () => {
    await notes.bulkPut([note('good', T1), note('bad', T1)]);
    remote.rejectWrite = (write) => (write.id === 'bad' ? 'invalid-argument' : null);

    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(sync.rejected()).toBe(1);
    expect(remoteNote('good')).toBeDefined();
    expect((await outbox.pending()).map((entry) => `${entry.id}:${entry.op}`)).toEqual(['bad:put']);
    expect(marker()).toMatchObject({ initialized: true });

    remote.rejectWrite = null;
    dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(remoteNote('bad')).toBeDefined();
    expect(await outbox.pending()).toEqual([]);
  });

  it('settles the run once when a listener fails while the others still catch up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    markInitialized();
    remote.holdSnapshots = true;
    const sync = create();
    await vi.waitFor(() => expect(remote.listeners).toBe(3));

    remote.failListener('tasks', { code: 'internal' });
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(remote.listeners).toBe(0);

    // Jedno ohlášení chyby = první opakování po 30 s (dvojí by odstup zdvojnásobilo)
    remote.holdSnapshots = false;
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(remote.listeners).toBe(3);
  });

  it('reports offline while the server only answers from cache and retries after the catch-up timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    markInitialized();
    remote.offline = true;
    await edit(note('a', T1));
    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('offline'));
    expect(remote.listeners).toBe(3);
    await vi.advanceTimersByTimeAsync(CATCH_UP_TIMEOUT_MS);
    expect(remote.listeners).toBe(0);
    expect(sync.state()).toBe('offline');
    expect(remote.commits).toEqual([]);

    remote.offline = false;
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(remoteNote('a')).toEqual(note('a', T1));
  });

  it('applies newer remote changes and ignores older and invalid ones without pushing them back', async () => {
    markInitialized();
    await notes.put(note('a', T2, { content: 'místní' }));
    await started();

    remote.serverWrite('notes', note('a', T1, { content: 'starší' }));
    remote.serverWrite('notes', { id: 'broken', updatedAt: T3 });
    remote.serverWrite('notes', note('b', T1));
    await vi.waitFor(() => expect(notes.notes.has('b')).toBe(true));
    expect((await notes.get('a'))?.content).toBe('místní');
    expect(notes.notes.has('broken')).toBe(false);

    remote.serverWrite('notes', note('a', T3, { content: 'novější' }));
    await vi.waitFor(() => expect(notes.notes.get('a')?.content).toBe('novější'));
    expect(remote.commits).toEqual([]);
  });

  it('propagates soft deletes and tombstones from another device, but keeps a record changed after the tombstone', async () => {
    markInitialized();
    await started();
    remote.serverWrite('notes', note('soft', T1));
    remote.serverWrite('notes', note('hard', T1));
    remote.serverWrite('categories', category('c', T1));
    await vi.waitFor(() => expect(notes.notes.size).toBe(2));
    await notes.put(note('kept', T3));

    remote.serverWrite('notes', note('soft', T2, { deletedAt: T2 }));
    remote.serverWrite('notes', { id: 'hard', deleted: true, updatedAt: T2 });
    remote.serverWrite('notes', { id: 'kept', deleted: true, updatedAt: T2 });
    remote.serverWrite('categories', { id: 'c', deleted: true, updatedAt: T2 });

    await vi.waitFor(() => expect(categories.categories.has('c')).toBe(false));
    expect(notes.notes.has('hard')).toBe(false);
    expect(notes.notes.has('kept')).toBe(true);
    expect((await notes.get('soft'))?.deletedAt).toBe(T2);
  });

  it('lets a newer remote edit win over an older delete waiting in the queue (F3)', async () => {
    markInitialized();
    remote.serverWrite('notes', note('a', T3, { content: 'novější' }));
    outbox.add({ collection: 'notes', id: 'a', op: 'delete', at: T2 });

    const sync = await started();

    expect(notes.notes.get('a')?.content).toBe('novější');
    expect(remoteNote('a')).toMatchObject({ content: 'novější' });
    expect(remote.commits).toEqual([]);
    expect(await outbox.pending()).toEqual([]);
    expect(sync.state()).toBe('idle');
  });

  it('sends the live record for a queued delete when the record exists again', async () => {
    markInitialized();
    await notes.put(note('a', T3));
    outbox.add({ collection: 'notes', id: 'a', op: 'delete', at: T2 });

    await started();

    expect(remote.commits).toEqual([[{ collection: 'notes', id: 'a', record: note('a', T3) }]]);
  });

  it('drops a queued edit of a record removed by a remote tombstone instead of sending another tombstone', async () => {
    markInitialized();
    outbox.add({ collection: 'notes', id: 'gone', op: 'put', at: T1 });

    await started();

    expect(remote.commits).toEqual([]);
    expect(await outbox.pending()).toEqual([]);
  });

  it('does not resurrect a record deleted in the queue after the remote version', async () => {
    markInitialized();
    remote.serverWrite('notes', note('a', T1));
    outbox.add({ collection: 'notes', id: 'a', op: 'delete', at: T2 });

    const sync = await started();

    expect(notes.notes.has('a')).toBe(false);
    expect(remoteNote('a')).toEqual({ id: 'a', deleted: true, updatedAt: T2 });
    expect(sync.state()).toBe('idle');
  });

  it('advances the cursor from server snapshots and resumes from it', async () => {
    markInitialized();
    await started();
    remote.serverWrite('notes', note('a', T1));
    await vi.waitFor(() => expect(marker().cursors.notes).toBeDefined());
    const cursor = marker().cursors.notes;

    // Nová relace (po reloadu) dostane jen změny po kurzoru
    TestBed.resetTestingModule();
    notes.notes.clear();
    remote.serverWrite('notes', note('b', T1));
    await started();

    await vi.waitFor(() => expect(notes.notes.has('b')).toBe(true));
    expect(notes.notes.has('a')).toBe(false);
    expect(marker().cursors.notes > cursor).toBe(true);
  });

  it('re-subscribes from the saved cursor after a snapshot could not be applied', async () => {
    markInitialized();
    const sync = await started();
    const bulkPut = vi.spyOn(notes, 'bulkPut').mockRejectedValueOnce(new Error('disk full'));

    remote.serverWrite('notes', note('a', T1));
    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(remote.listeners).toBe(0);
    // Další změna jinde nesmí posunout kurzor přes nezapracovaný snímek
    remote.serverWrite('notes', note('b', T1));
    expect(marker().cursors.notes).toBeUndefined();

    dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect([...notes.notes.keys()].sort()).toEqual(['a', 'b']);
    expect(bulkPut).toHaveBeenCalledTimes(2);
  });

  it('retries after an error with a growing delay and resets it after success', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    markInitialized();
    remote.failCommitWith = { code: 'internal' };
    outbox.add({ collection: 'notes', id: 'a', op: 'delete', at: T1 });
    const commit = vi.spyOn(remote, 'commit');
    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
    expect(commit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    // Druhý pokus až po dvojnásobku
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    expect(commit).toHaveBeenCalledTimes(2);

    remote.failCommitWith = null;
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it('stops with the state denied when reading is not allowed', async () => {
    remote.failWith = { code: 'permission-denied' };
    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('denied'));
    expect(remote.listeners).toBe(0);
    expect(marker()).toBeNull();
  });

  it('stops with the state denied when the listener is refused for an initialized account', async () => {
    markInitialized();
    remote.failWith = { code: 'permission-denied' };
    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('denied'));
    expect(remote.listeners).toBe(0);
  });

  it('reports other errors as error', async () => {
    remote.failWith = { code: 'internal' };
    const sync = create();

    await vi.waitFor(() => expect(sync.state()).toBe('error'));
  });

  it('stops on sign-out and keeps local data and the queue', async () => {
    markInitialized();
    await notes.put(note('a', T1));
    const sync = await started();
    outbox.add({ collection: 'notes', id: 'a', op: 'put', at: T2 } satisfies OutboxEntry);

    await auth.signOut();
    TestBed.tick();

    expect(sync.state()).toBe('off');
    expect(remote.listeners).toBe(0);
    expect(notes.notes.has('a')).toBe(true);
    expect(await outbox.pending()).toHaveLength(1);
  });

  it('forgets the marker and cursors on sign-out so the next sign-in merges again', async () => {
    markInitialized();
    localStorage.setItem(SYNC_MARKER_PREFIX + 'other', JSON.stringify({ initialized: true, cursors: {} }));
    await started();
    expect(marker()).not.toBeNull();

    await auth.signOut();
    TestBed.tick();

    expect(marker()).toBeNull();
    expect(localStorage.getItem(SYNC_MARKER_PREFIX + 'other')).not.toBeNull();
  });
});
