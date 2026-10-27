import type { SyncedCollection } from '../../model/outbox-entry';
import type { RemoteListener, RemoteRecord, RemoteWrite, SyncRemote } from '../firebase-firestore';

interface StoredDoc {
  record: RemoteRecord;
  // Serverový čas jako kurzor (řaditelný text)
  serverUpdatedAt: string;
}

interface Subscriber {
  collection: SyncedCollection;
  cursor: string | null;
  listener: RemoteListener;
  // Dokumenty ve výsledku dotazu a jejich serverový čas (snímek obsahuje jen změny od minula)
  seen: Map<string, string>;
}

// Falešný Firestore pro unit testy: bez sítě, serverový čas je počítadlo (jeden pro celou dávku),
// posluchači dostávají změny hned, pokud se snímky nezadržují (`holdSnapshots`)
export class FakeSyncRemote implements SyncRemote {
  readonly docs: Record<SyncedCollection, Map<string, StoredDoc>> = { notes: new Map(), tasks: new Map(), categories: new Map() };
  readonly commits: RemoteWrite[][] = [];
  /** Chyba, kterou vyhodí každé čtení i zápis (např. { code: 'permission-denied' }). */
  failWith: unknown = null;
  /** Chyba jen pro zápisy (čtení projde). */
  failCommitWith: unknown = null;
  /** Chyba jen pro deleteAll (smazání dat v cloudu). */
  failDeleteWith: unknown = null;
  /** Kód chyby pro zápis daného záznamu; dávka s takovým záznamem selže celá jako ve Firestore. */
  rejectWrite: ((write: RemoteWrite) => string | null) | null = null;
  /** Dokud je vyplněný, commit čeká na jeho splnění (zápis „na cestě“). */
  gate: Promise<void> | null = null;
  /** Snímky posluchačů se zadrží do `releaseSnapshots()` (pomalá síť po startu). */
  holdSnapshots = false;
  /** Server nedostupný: posluchači dostávají jen snímky z cache (prázdné, bez kurzoru). */
  offline = false;
  private clock = 0;
  private readonly subscribers = new Set<Subscriber>();
  private readonly held = new Set<Subscriber>();

  private tick(): string {
    this.clock += 1;
    return String(this.clock).padStart(12, '0');
  }

  /** Zápis z jiného zařízení (záznam i náhrobek): uloží se a pošle posluchačům. */
  serverWrite(collection: SyncedCollection, record: RemoteRecord): void {
    this.docs[collection].set(record.id, { record, serverUpdatedAt: this.tick() });
    this.notify(collection);
  }

  releaseSnapshots(): void {
    this.holdSnapshots = false;
    const held = [...this.held];
    this.held.clear();
    held.filter((subscriber) => this.subscribers.has(subscriber)).forEach((subscriber) => this.deliver(subscriber));
  }

  /** Chyba posluchače dané kolekce (např. zrušený dotaz). */
  failListener(collection: SyncedCollection, error: unknown): void {
    [...this.subscribers].filter((subscriber) => subscriber.collection === collection).forEach((subscriber) => subscriber.listener.error(error));
  }

  /** Počet aktivních posluchačů. */
  get listeners(): number {
    return this.subscribers.size;
  }

  async fetchAll(collection: SyncedCollection): Promise<{ records: RemoteRecord[]; cursor: string | null }> {
    this.check(this.failWith);
    const docs = [...this.docs[collection].values()];
    return { records: docs.map((item) => item.record), cursor: docs.map((item) => item.serverUpdatedAt).sort().at(-1) ?? null };
  }

  async commit(writes: RemoteWrite[]): Promise<void> {
    this.check(this.failWith ?? this.failCommitWith);
    // Limit dávky Firestore
    if (writes.length > 500) {
      throw { code: 'invalid-argument' };
    }
    const rejected = writes.map((write) => this.rejectWrite?.(write)).find((code) => code);
    if (rejected) {
      throw { code: rejected };
    }
    await this.gate;
    this.commits.push(writes);
    const serverUpdatedAt = this.tick();
    writes.forEach((write) => this.docs[write.collection].set(write.id, { record: write.record, serverUpdatedAt }));
    new Set(writes.map((write) => write.collection)).forEach((collection) => this.notify(collection));
  }

  async deleteAll(): Promise<void> {
    this.check(this.failWith ?? this.failDeleteWith);
    Object.values(this.docs).forEach((docs) => docs.clear());
  }

  listen(collection: SyncedCollection, cursor: string | null, listener: RemoteListener): () => void {
    const subscriber: Subscriber = { collection, cursor, listener, seen: new Map() };
    this.subscribers.add(subscriber);
    if (this.failWith) {
      listener.error(this.failWith);
    } else {
      this.deliver(subscriber);
    }
    return () => this.subscribers.delete(subscriber);
  }

  private check(error: unknown): void {
    if (error) {
      throw error;
    }
  }

  private notify(collection: SyncedCollection): void {
    [...this.subscribers].filter((subscriber) => subscriber.collection === collection).forEach((subscriber) => this.deliver(subscriber));
  }

  // Jako onSnapshot: nové a změněné dokumenty po kurzoru; kurzor = nejvyšší serverový čas ve výsledku
  private deliver(subscriber: Subscriber): void {
    if (this.holdSnapshots) {
      this.held.add(subscriber);
      return;
    }
    if (this.offline) {
      subscriber.listener.changes([], false, null);
      return;
    }
    const docs = [...this.docs[subscriber.collection].values()].filter(
      (item) => subscriber.cursor === null || item.serverUpdatedAt > subscriber.cursor,
    );
    const records = docs.filter((item) => subscriber.seen.get(item.record.id) !== item.serverUpdatedAt).map((item) => item.record);
    subscriber.seen = new Map(docs.map((item) => [item.record.id, item.serverUpdatedAt]));
    subscriber.listener.changes(records, true, [...subscriber.seen.values()].sort().at(-1) ?? null);
  }
}
