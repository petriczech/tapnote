import { isDevMode } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  Firestore,
  getDocsFromServer,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { SyncedCollection } from '../model/outbox-entry';
import { emulatorPorts, firebaseConfig } from './firebase.config';

// Jediný modul, který staticky importuje Firestore; SyncService ho načítá přes import() jako samostatný chunk.
// V unit testech se místo něj podstrkuje falešné SyncRemote (token SYNC_REMOTE_LOADER).

/**
 * Záznam tak, jak ho drží Dexie (bez `serverUpdatedAt`), nebo náhrobek trvale smazaného záznamu
 * `{ id, deleted: true, updatedAt }`, aby se smazání dozvěděla i zařízení, která zrovna neposlouchají.
 */
export interface RemoteRecord {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}

/** Zápis do vzdálené kopie: celý záznam, nebo náhrobek. */
export interface RemoteWrite {
  collection: SyncedCollection;
  id: string;
  record: RemoteRecord;
}

export interface RemoteListener {
  // `fromServer` = potvrzený stav ze serveru (ne z cache); jen z něj se bere kurzor
  changes(records: RemoteRecord[], fromServer: boolean, cursor: string | null): void;
  error(error: unknown): void;
}

export interface SyncRemote {
  /** Všechny dokumenty kolekce ze serveru a kurzor (nejvyšší `serverUpdatedAt`). */
  fetchAll(collection: SyncedCollection): Promise<{ records: RemoteRecord[]; cursor: string | null }>;
  /** Jedna dávka zápisů (nejvýš 500 a 10 MiB); splní se po potvrzení serverem. */
  commit(writes: RemoteWrite[]): Promise<void>;
  /** Sleduje dokumenty změněné po `cursor`; vrací odhlášení. */
  listen(collection: SyncedCollection, cursor: string | null, listener: RemoteListener): () => void;
}

// Firestore se inicializuje jednou na aplikaci (initializeFirestore nejde volat dvakrát)
let firestore: Firestore | undefined;

function getFirestore(): Firestore {
  if (!firestore) {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    // Data drží Dexie, proto jen paměťová cache (bez persistentLocalCache a jejích potíží s víc záložkami)
    firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
    // Dev build (ng serve, e2e) míří na Firestore emulátor projektu demo-tapnote
    if (isDevMode()) {
      connectFirestoreEmulator(firestore, '127.0.0.1', emulatorPorts.firestore);
    }
  }
  return firestore;
}

// Kurzor jako text řaditelný porovnáním řetězců: sekundy a nanosekundy s pevnou šířkou
function toCursor(value: unknown): string | null {
  return value instanceof Timestamp ? `${String(value.seconds).padStart(12, '0')}.${String(value.nanoseconds).padStart(9, '0')}` : null;
}

function fromCursor(cursor: string): Timestamp {
  const [seconds, nanoseconds] = cursor.split('.').map(Number);
  return new Timestamp(seconds, nanoseconds);
}

function maxCursor(cursors: (string | null)[]): string | null {
  return cursors.reduce<string | null>((max, cursor) => (cursor !== null && (max === null || cursor > max) ? cursor : max), null);
}

// Serverový čas zůstává jen ve Firestore, do Dexie se neukládá
function toRecord(data: Record<string, unknown>): RemoteRecord {
  const record = { ...data };
  delete record['serverUpdatedAt'];
  return record as unknown as RemoteRecord;
}

// Firestore odmítá undefined a rules nechtějí null u volitelných polí, proto se taková pole vynechají
function withoutUndefined(record: RemoteRecord): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

export function createSyncRemote(uid: string): SyncRemote {
  const db = getFirestore();
  const path = (name: SyncedCollection) => collection(db, 'users', uid, name);
  return {
    fetchAll: async (name) => {
      const snapshot = await getDocsFromServer(path(name));
      return {
        records: snapshot.docs.map((item) => toRecord(item.data())),
        cursor: maxCursor(snapshot.docs.map((item) => toCursor(item.get('serverUpdatedAt')))),
      };
    },
    commit: (writes) => {
      const batch = writeBatch(db);
      for (const write of writes) {
        batch.set(doc(path(write.collection), write.id), { ...withoutUndefined(write.record), serverUpdatedAt: serverTimestamp() });
      }
      return batch.commit();
    },
    listen: (name, cursor, listener) => {
      const changed = query(
        path(name),
        ...(cursor === null ? [] : [where('serverUpdatedAt', '>', fromCursor(cursor))]),
        orderBy('serverUpdatedAt'),
      );
      return onSnapshot(
        changed,
        (snapshot) => {
          // Místní ozvěna vlastních zápisů (hasPendingWrites) se přeskočí, data už v Dexie jsou. Odebrání z výsledku
          // nastává jen u ozvěny (dokument s čekajícím serverovým časem z dotazu na chvíli vypadne); smazání
          // přichází jako náhrobek, proto se odebrání ignoruje
          const records = snapshot
            .docChanges()
            .filter((change) => change.type !== 'removed' && !change.doc.metadata.hasPendingWrites)
            .map((change) => toRecord(change.doc.data()));
          const confirmed = snapshot.docs.filter((item) => !item.metadata.hasPendingWrites);
          const fromServer = !snapshot.metadata.fromCache;
          listener.changes(records, fromServer, fromServer ? maxCursor(confirmed.map((item) => toCursor(item.get('serverUpdatedAt')))) : null);
        },
        (error) => listener.error(error),
      );
    },
  };
}
