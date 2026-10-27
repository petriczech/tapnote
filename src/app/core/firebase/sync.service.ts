import { computed, DestroyRef, effect, inject, InjectionToken, Service, signal, untracked } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { isCategory } from '../model/category';
import { isNote } from '../model/note';
import { OutboxEntry, SYNCED_COLLECTIONS, SyncedCollection } from '../model/outbox-entry';
import { isTask } from '../model/task';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { OutboxRepository } from '../storage/outbox-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { AuthService } from './auth.service';
import type { RemoteRecord, RemoteWrite, SyncRemote } from './firebase-firestore';

/** Firestore se načítá líně jako samostatný chunk; token kvůli unit testům s falešným vzdáleným úložištěm. */
export const SYNC_REMOTE_LOADER = new InjectionToken<() => Promise<(uid: string) => SyncRemote>>('SYNC_REMOTE_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./firebase-firestore').then((module) => module.createSyncRemote),
});

export type SyncState = 'off' | 'syncing' | 'idle' | 'offline' | 'denied' | 'error';

/** Stav synchronizace účtu v tomto zařízení: `tapnote.sync.<uid>`. */
export const SYNC_MARKER_PREFIX = 'tapnote.sync.';
/** Odesílání se odkládá, aby průběžné ukládání při psaní nebylo zápisem za každý stisk klávesy. */
export const PUSH_DELAY_MS = 2000;
/** Opakování po chybě (offline podle serveru, interní chyba): 30 s, pak dvojnásobek až do 5 min. */
export const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;
/** Nejdelší čekání na první snímek ze serveru (připojení hlášené prohlížečem, ale server nedostupný). */
export const CATCH_UP_TIMEOUT_MS = 20_000;
// Limity dávky zápisů Firestore: 500 zápisů a 10 MiB na požadavek (s rezervou na serverUpdatedAt a obálku)
const BATCH_SIZE = 500;
const BATCH_BYTES = 8 * 1024 * 1024;
// Zápis, který server odmítl kvůli samotnému záznamu (neplatný, příliš velký, zakázaný rules); ostatní neblokuje
const REJECTED_CODES = ['invalid-argument', 'permission-denied', 'failed-precondition'];

// Proběhlo první sloučení a kurzory příjmu (nejvyšší potvrzený serverUpdatedAt) po kolekcích
interface SyncMarker {
  initialized: boolean;
  cursors: Partial<Record<SyncedCollection, string>>;
}

interface Session {
  uid: string;
  remote?: Promise<SyncRemote>;
  listening: boolean;
  // Sada posluchačů; po chybě nebo nezapracovaném snímku se zahodí a založí znovu od uloženého kurzoru
  generation?: object;
  unsubscribes: (() => void)[];
  // Dorovnání příjmu před odesláním ještě běží: chybu pak hlásí run() (zamítnutím `tear`), ne posluchač
  catchingUp: boolean;
  tear?: (error: unknown) => void;
  dropped?: unknown;
  catchUpTimer?: ReturnType<typeof setTimeout>;
  // Záznamy, které server odmítl (`kolekce/id`); posílají se samostatně, aby nezdržovaly ostatní
  rejected: Set<string>;
  busy?: Promise<void>;
  again: boolean;
  timer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
  retryDelay: number;
  count?: Subscription;
  pulls: Promise<void>;
}

interface LocalStore {
  all(): Promise<RemoteRecord[]>;
  get(id: string): Promise<RemoteRecord | undefined>;
  bulkPut(records: RemoteRecord[]): Promise<void>;
  delete(id: string): Promise<void>;
  valid(value: unknown): boolean;
}

// Poškozená nebo cizí hodnota se bere jako neinicializovaný účet (proběhne znovu sloučení, nic se neztratí)
function isMarker(value: unknown): value is SyncMarker {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { initialized, cursors } = value as Record<string, unknown>;
  return (
    typeof initialized === 'boolean' &&
    typeof cursors === 'object' &&
    cursors !== null &&
    !Array.isArray(cursors) &&
    Object.entries(cursors).every(([key, cursor]) => (SYNCED_COLLECTIONS as readonly string[]).includes(key) && typeof cursor === 'string')
  );
}

function readMarker(uid: string): SyncMarker {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SYNC_MARKER_PREFIX + uid) ?? 'null');
    return isMarker(value) ? value : { initialized: false, cursors: {} };
  } catch {
    return { initialized: false, cursors: {} };
  }
}

function writeMarker(uid: string, marker: SyncMarker): void {
  try {
    localStorage.setItem(SYNC_MARKER_PREFIX + uid, JSON.stringify(marker));
  } catch {
    // Bez úložiště proběhne sloučení příště znovu (nic se neztratí, jen víc čtení)
  }
}

function removeMarker(uid: string): void {
  try {
    localStorage.removeItem(SYNC_MARKER_PREFIX + uid);
  } catch {
    // Bez úložiště marker ani není
  }
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

// Dávky podle počtu i odhadnuté velikosti (JSON v UTF-8); příliš velký záznam jde sám a odmítne ho server
function batches(writes: RemoteWrite[]): RemoteWrite[][] {
  const encoder = new TextEncoder();
  const result: RemoteWrite[][] = [];
  let current: RemoteWrite[] = [];
  let bytes = 0;
  for (const write of writes) {
    const size = encoder.encode(JSON.stringify(write.record)).length;
    if (current.length > 0 && (current.length === BATCH_SIZE || bytes + size > BATCH_BYTES)) {
      result.push(current);
      current = [];
      bytes = 0;
    }
    current.push(write);
    bytes += size;
  }
  return current.length > 0 ? [...result, current] : result;
}

const keyOf = (item: { collection: SyncedCollection; id: string }) => `${item.collection}/${item.id}`;

// Synchronizace poznámek, úkolů a kategorií s Firestore (S6): první sloučení, příjem změn a odesílání fronty.
// Běží jen na webu a jen pro přihlášeného uživatele; Dexie zůstává hlavním úložištěm.
@Service()
export class SyncService {
  private readonly auth = inject(AuthService);
  private readonly outbox = inject(OutboxRepository);
  private readonly load = inject(SYNC_REMOTE_LOADER);
  private readonly notes = inject(NotesRepository);
  private readonly tasks = inject(TasksRepository);
  private readonly categories = inject(CategoriesRepository);
  private readonly stores: Record<SyncedCollection, LocalStore> = {
    notes: {
      all: () => this.notes.getAll(),
      get: (id) => this.notes.get(id),
      bulkPut: (records) => this.notes.bulkPut(records.filter(isNote)),
      delete: (id) => this.notes.delete(id),
      valid: isNote,
    },
    tasks: {
      all: () => this.tasks.getAll(),
      get: (id) => this.tasks.get(id),
      bulkPut: (records) => this.tasks.bulkPut(records.filter(isTask)),
      delete: (id) => this.tasks.delete(id),
      valid: isTask,
    },
    categories: {
      all: () => this.categories.getAll(),
      get: async (id) => (await this.categories.getAll()).find((item) => item.id === id),
      bulkPut: (records) => this.categories.bulkPut(records.filter(isCategory)),
      delete: (id) => this.categories.delete(id),
      valid: isCategory,
    },
  };
  private session: Session | undefined;

  readonly state = signal<SyncState>('off');
  /** Čas posledního úspěšného odeslání nebo potvrzeného příjmu (ISO). */
  readonly lastSyncedAt = signal<string | null>(null);
  /** Počet změn čekajících na odeslání. */
  readonly pending = signal(0);
  /** Počet záznamů, které server odmítl (zůstávají ve frontě, stav je 'error'). */
  readonly rejected = signal(0);

  private readonly onOnline = () => this.session && this.request(this.session);
  private readonly onOffline = () => this.session && this.state.set('offline');
  // Při odchodu ze záložky se fronta zkusí odeslat hned (bez záruky, že to stihne)
  private readonly onVisibility = () => document.visibilityState === 'hidden' && this.session && this.request(this.session);

  constructor() {
    // Android se přihlašuje nativně až v S4, do té doby synchronizace na něm neběží
    if (Capacitor.isNativePlatform()) {
      return;
    }
    inject(DestroyRef).onDestroy(() => this.stop('off'));
    const uid = computed(() => this.auth.user()?.uid ?? null);
    effect(() => {
      const current = uid();
      untracked(() => (current ? this.start(current) : this.signOut()));
    });
  }

  /** Synchronizace hned (tlačítko „Synchronizovat teď“); bez přihlášení nebo po zamítnutí nic nedělá. */
  syncNow(): void {
    if (this.session) {
      this.request(this.session);
    }
  }

  /**
   * Smazání dat účtu ve Firestore (F7): synchronizace se zastaví, smažou se vzdálené kolekce, marker a fronta
   * tohoto zařízení a účet se odhlásí. Místní data zůstávají; příští přihlášení proběhne jako první sloučení.
   */
  async deleteCloud(): Promise<void> {
    const session = this.session;
    if (!session) {
      throw new Error('signed out');
    }
    const { uid } = session;
    const remote = session.remote ?? this.load().then((create) => create(uid));
    this.stop('off');
    // Rozběhnutý zápis se nechá doběhnout, aby nepřistál až po smazání
    await session.busy;
    try {
      await (await remote).deleteAll();
      removeMarker(uid);
      await this.outbox.clear();
      await this.auth.signOut();
    } catch (error) {
      // Cloud může zůstat smazaný jen zčásti: bez markeru proběhne další běh jako první sloučení a chybějící
      // záznamy se znovu nahrají; synchronizace se obnoví, pokud je účet stále přihlášený
      removeMarker(uid);
      if (this.auth.user()?.uid === uid) {
        this.start(uid);
      }
      throw error;
    }
  }

  // Odhlášení smaže marker i s kurzory, aby další přihlášení proběhlo jako první sloučení (S7); fronta zůstává
  private signOut(): void {
    const uid = this.session?.uid;
    this.stop('off');
    if (uid) {
      removeMarker(uid);
    }
  }

  private start(uid: string): void {
    if (this.session?.uid === uid) {
      return;
    }
    this.stop('off');
    const session: Session = {
      uid,
      listening: false,
      unsubscribes: [],
      catchingUp: false,
      rejected: new Set(),
      again: false,
      retryDelay: 0,
      pulls: Promise.resolve(),
    };
    this.session = session;
    session.count = this.outbox.count().subscribe((count) => {
      this.pending.set(count);
      if (count > 0) {
        this.schedule(session);
      }
    });
    addEventListener('online', this.onOnline);
    addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.request(session);
  }

  // Odhlášení, zamítnutý přístup: posluchače a časovače se zastaví, místní data i fronta zůstávají (F6)
  private stop(state: SyncState): void {
    const session = this.session;
    if (session) {
      this.session = undefined;
      clearTimeout(session.timer);
      clearTimeout(session.retryTimer);
      session.count?.unsubscribe();
      this.unlisten(session, new Error('stopped'));
      removeEventListener('online', this.onOnline);
      removeEventListener('offline', this.onOffline);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.rejected.set(0);
    // Čas poslední synchronizace patří ukončené relaci (jiný účet, smazaný cloud)
    this.lastSyncedAt.set(null);
    this.state.set(state);
  }

  private active(session: Session): boolean {
    return this.session === session;
  }

  private schedule(session: Session): void {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => this.request(session), PUSH_DELAY_MS);
  }

  // Jeden běh najednou; požadavek během běhu se provede hned po něm
  private request(session: Session): void {
    if (!this.active(session)) {
      return;
    }
    if (!navigator.onLine) {
      this.state.set('offline');
      return;
    }
    if (session.busy) {
      session.again = true;
      return;
    }
    clearTimeout(session.timer);
    clearTimeout(session.retryTimer);
    session.busy = this.run(session).finally(() => {
      session.busy = undefined;
      if (session.again) {
        session.again = false;
        this.request(session);
      }
    });
  }

  private async run(session: Session): Promise<void> {
    this.state.set('syncing');
    try {
      // Nenačtený chunk (offline) se při dalším běhu zkusí znovu
      session.remote ??= this.load()
        .then((create) => create(session.uid))
        .catch((error: unknown) => {
          session.remote = undefined;
          throw error;
        });
      const remote = await session.remote;
      if (!readMarker(session.uid).initialized) {
        await this.firstSync(session, remote);
      }
      // Fronta se odešle až po zapracování změn ze serveru, jinak by starší úprava z doby offline přepsala
      // novější verzi z jiného zařízení
      if (this.active(session) && !session.listening) {
        await this.listen(session, remote);
      }
      if (!this.active(session) || !session.listening) {
        return;
      }
      await this.push(session, remote);
      if (this.active(session)) {
        session.retryDelay = 0;
        // Odmítnuté záznamy zůstávají ve frontě a stav ukáže chybu
        this.rejected.set(session.rejected.size);
        this.state.set(session.rejected.size > 0 ? 'error' : 'idle');
        this.lastSyncedAt.set(new Date().toISOString());
      }
    } catch (error) {
      this.fail(session, error);
    }
  }

  private fail(session: Session, error: unknown): void {
    if (!this.active(session)) {
      return;
    }
    const code = errorCode(error);
    // Zamítnuté čtení = účet mimo allowlist: synchronizace se zastaví, dokud se nepřihlásí jiný účet.
    // Zamítnutý zápis sem nedojde, send() ho bere jako odmítnutý záznam.
    if (code === 'permission-denied') {
      this.stop('denied');
      return;
    }
    this.state.set(code === 'unavailable' || !navigator.onLine ? 'offline' : 'error');
    // Bez připojení podle prohlížeče se čeká na událost online, jinak opakování s rostoucím odstupem
    if (navigator.onLine) {
      session.retryDelay = Math.min(session.retryDelay > 0 ? session.retryDelay * 2 : RETRY_MIN_MS, RETRY_MAX_MS);
      clearTimeout(session.retryTimer);
      session.retryTimer = setTimeout(() => this.request(session), session.retryDelay);
    }
  }

  // První přihlášení účtu v tomto zařízení (F5): sloučení podle novějšího updatedAt, nic se nemaže kromě
  // záznamů smazaných jinde později, než se tady naposledy změnily (náhrobek)
  private async firstSync(session: Session, remote: SyncRemote): Promise<void> {
    const queued = await this.outbox.pending();
    const uploads: RemoteWrite[] = [];
    const cursors: SyncMarker['cursors'] = {};
    for (const collection of SYNCED_COLLECTIONS) {
      const [{ records, cursor }, local] = await Promise.all([remote.fetchAll(collection), this.stores[collection].all()]);
      const remoteById = new Map(records.map((record) => [record.id, record]));
      for (const record of local) {
        const stored = remoteById.get(record.id);
        // Shodný čas = ponechá se místní verze a nic se neposílá
        if (!stored || record.updatedAt > stored.updatedAt) {
          uploads.push({ collection, id: record.id, record });
        }
      }
      await this.apply(collection, records);
      if (cursor) {
        cursors[collection] = cursor;
      }
    }
    await this.send(session, remote, uploads, async () => undefined);
    // Ve frontě zůstanou smazání, odmítnuté záznamy a změny z doby sloučení
    await this.outbox.remove(queued.filter((entry) => entry.op === 'put' && !session.rejected.has(keyOf(entry))));
    // Odmítnutý záznam bez položky ve frontě se do ní zařadí, aby se po opravě odeslal (jinak by se už nezkusil)
    const queuedKeys = new Set(queued.map(keyOf));
    const at = new Date().toISOString();
    const missing = uploads.filter((write) => session.rejected.has(keyOf(write)) && !queuedKeys.has(keyOf(write)));
    if (missing.length > 0) {
      await this.outbox.enqueue(missing.map(({ collection, id }): OutboxEntry => ({ collection, id, op: 'put', at })));
    }
    if (this.active(session)) {
      writeMarker(session.uid, { initialized: true, cursors });
    }
  }

  // Odeslání fronty; odmítnuté záznamy zůstávají ve frontě
  private async push(session: Session, remote: SyncRemote): Promise<void> {
    const entries = await this.outbox.pending();
    const writes = await Promise.all(entries.map((entry) => this.write(entry)));
    // Úprava záznamu, který mezitím smazal náhrobek z jiného zařízení, se zahodí (druhý náhrobek by byl starší)
    const stale = entries.filter((_, index) => writes[index] === null);
    if (stale.length > 0) {
      await this.outbox.remove(stale);
    }
    const byKey = new Map(entries.map((entry) => [keyOf(entry), entry]));
    // Z fronty se po každé dávce odeberou jen položky, které se mezitím nezměnily
    const sent = (batch: RemoteWrite[]) => this.outbox.remove(batch.map((write) => byKey.get(keyOf(write))).filter((entry) => entry !== undefined));
    await this.send(
      session,
      remote,
      writes.filter((write) => write !== null),
      sent,
    );
  }

  // Posílá se vždy aktuální záznam ze zařízení; náhrobek s časem smazání z fronty jen u smazaného záznamu
  private async write(entry: OutboxEntry): Promise<RemoteWrite | null> {
    const { collection, id } = entry;
    const record = await this.stores[collection].get(id);
    if (record) {
      return { collection, id, record };
    }
    return entry.op === 'delete' ? { collection, id, record: { id, deleted: true, updatedAt: entry.at } } : null;
  }

  // Dávka s odmítnutým záznamem se zopakuje po jednom, aby jeden vadný záznam neblokoval ostatní; dříve
  // odmítnuté záznamy se posílají rovnou samostatně, aby běžné odeslání zůstalo jednou dávkou
  private async send(session: Session, remote: SyncRemote, writes: RemoteWrite[], sent: (batch: RemoteWrite[]) => Promise<void>): Promise<void> {
    const known = writes.filter((write) => session.rejected.has(keyOf(write)));
    const groups = [...batches(writes.filter((write) => !session.rejected.has(keyOf(write)))), ...known.map((write) => [write])];
    for (const batch of groups) {
      if (!this.active(session)) {
        return;
      }
      try {
        await this.commit(session, remote, batch, sent);
      } catch (error) {
        if (!REJECTED_CODES.includes(errorCode(error))) {
          throw error;
        }
        if (batch.length === 1) {
          session.rejected.add(keyOf(batch[0]));
          continue;
        }
        for (const write of batch) {
          try {
            await this.commit(session, remote, [write], sent);
          } catch (single) {
            if (!REJECTED_CODES.includes(errorCode(single))) {
              throw single;
            }
            session.rejected.add(keyOf(write));
          }
        }
      }
    }
  }

  private async commit(session: Session, remote: SyncRemote, batch: RemoteWrite[], sent: (batch: RemoteWrite[]) => Promise<void>): Promise<void> {
    await remote.commit(batch);
    batch.forEach((write) => session.rejected.delete(keyOf(write)));
    await sent(batch);
  }

  // Splní se, až všechny kolekce dostanou první snímek ze serveru a ten se zapracuje; zamítne se, když se
  // posluchače mezitím zahodí (chyba, odhlášení) nebo server do CATCH_UP_TIMEOUT_MS neodpoví
  private listen(session: Session, remote: SyncRemote): Promise<void> {
    const generation = {};
    session.listening = true;
    session.generation = generation;
    session.catchingUp = true;
    session.dropped = undefined;
    const torn = new Promise<never>((_, reject) => (session.tear = reject));
    session.catchUpTimer = setTimeout(() => this.unlisten(session, { code: 'unavailable' }), CATCH_UP_TIMEOUT_MS);
    const { cursors } = readMarker(session.uid);
    const ready = SYNCED_COLLECTIONS.map(
      (collection) =>
        // Chybu hlásí `torn` (unlisten), ne jednotlivé kolekce
        new Promise<void>((resolve) => {
          let settled = false;
          const unsubscribe = remote.listen(collection, cursors[collection] ?? null, {
            changes: (records, fromServer, cursor) => {
              if (session.generation !== generation) {
                return;
              }
              // Snímky se zpracují postupně, aby kurzor rostl ve stejném pořadí jako zápisy
              session.pulls = session.pulls
                .then(() => this.pull(session, generation, collection, records, fromServer ? cursor : null))
                .catch((error: unknown) => {
                  // Nezapracovaný snímek: posluchače se zahodí, aby další snímek neposunul kurzor přes něj;
                  // další běh je založí znovu od uloženého kurzoru
                  if (session.generation === generation) {
                    this.drop(session, error);
                  }
                });
              if (fromServer && !settled) {
                settled = true;
                resolve();
              } else if (!fromServer && !settled && this.active(session)) {
                // Snímek jen z cache: server zatím neodpovídá
                this.state.set('offline');
              }
            },
            error: (error) => {
              if (session.generation === generation) {
                this.drop(session, error);
              }
            },
          });
          session.unsubscribes.push(unsubscribe);
        }),
    );
    return Promise.race([Promise.all(ready), torn])
      .then(() => session.pulls)
      .then(() => {
        // Selhaný příjem během dorovnání posluchače zahodil; run() pak nic neodešle a chybu ohlásí jednou
        if (session.generation !== generation) {
          throw session.dropped;
        }
        session.catchingUp = false;
        clearTimeout(session.catchUpTimer);
      });
  }

  // Chyba posluchače nebo příjmu: během dorovnání ji ohlásí run() (jednou), jinak se ohlásí hned
  private drop(session: Session, error: unknown): void {
    const catchingUp = session.catchingUp;
    session.dropped = error;
    this.unlisten(session, error);
    if (!catchingUp) {
      this.fail(session, error);
    }
  }

  private unlisten(session: Session, error: unknown): void {
    session.unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    session.listening = false;
    session.generation = undefined;
    session.catchingUp = false;
    clearTimeout(session.catchUpTimer);
    session.tear?.(error);
    session.tear = undefined;
  }

  private async pull(session: Session, generation: object, collection: SyncedCollection, records: RemoteRecord[], cursor: string | null): Promise<void> {
    if (session.generation !== generation) {
      return;
    }
    if (records.length > 0) {
      await this.apply(collection, records);
    }
    if (cursor && session.generation === generation) {
      const marker = readMarker(session.uid);
      const current = marker.cursors[collection];
      if (!current || cursor > current) {
        writeMarker(session.uid, { ...marker, cursors: { ...marker.cursors, [collection]: cursor } });
      }
      this.lastSyncedAt.set(new Date().toISOString());
    }
  }

  // Příchozí záznam se uloží jen novější než místní (F3, celý záznam) a ne, když místní čeká ve frontě na smazání;
  // náhrobek smaže místní záznam, který se od smazání nezměnil. Zápis se do fronty nezařadí.
  private async apply(collection: SyncedCollection, records: RemoteRecord[]): Promise<void> {
    const store = this.stores[collection];
    // Frontu nejde číst uvnitř applyRemote (není ve schématu transakce), proto těsně před ním
    const deleting = new Map(
      (await this.outbox.pending()).filter((entry) => entry.collection === collection && entry.op === 'delete').map((entry) => [entry.id, entry]),
    );
    // Smazání v zařízení přebije jen starší vzdálenou verzi; novější verze z jiného zařízení vyhraje (F3)
    // a zastaralé smazání se z fronty odebere
    const outvoted: OutboxEntry[] = [];
    await this.outbox.applyRemote(async () => {
      const local = new Map((await store.all()).map((record) => [record.id, record]));
      const upserts: RemoteRecord[] = [];
      const removals: string[] = [];
      for (const record of records) {
        const stored = local.get(record.id);
        if (record.deleted === true) {
          if (stored && record.updatedAt >= stored.updatedAt) {
            removals.push(record.id);
          }
        } else if (store.valid(record) && (!stored || record.updatedAt > stored.updatedAt)) {
          const deleted = deleting.get(record.id);
          if (deleted && record.updatedAt <= deleted.at) {
            continue;
          }
          upserts.push(record);
          if (deleted) {
            outvoted.push(deleted);
          }
        }
      }
      if (upserts.length > 0) {
        await store.bulkPut(upserts);
      }
      for (const id of removals) {
        await store.delete(id);
      }
    });
    if (outvoted.length > 0) {
      await this.outbox.remove(outvoted);
    }
  }
}
