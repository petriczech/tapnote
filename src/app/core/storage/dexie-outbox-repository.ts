import { inject, Injectable } from '@angular/core';
import { Dexie, liveQuery } from 'dexie';
import { from, Observable } from 'rxjs';
import { OutboxEntry } from '../model/outbox-entry';
import { untrackedTransactions } from './outbox-middleware';
import { OutboxRepository } from './outbox-repository';
import { TapnoteDb } from './tapnote-db';

@Injectable()
export class DexieOutboxRepository extends OutboxRepository {
  private readonly db = inject(TapnoteDb);

  pending(): Promise<OutboxEntry[]> {
    return this.db.outbox.toArray();
  }

  count(): Observable<number> {
    return from(liveQuery(() => this.db.outbox.count()));
  }

  remove(entries: OutboxEntry[]): Promise<void> {
    return this.db.transaction('rw', this.db.outbox, async () => {
      const current = await this.db.outbox.bulkGet(entries.map((entry): [string, string] => [entry.collection, entry.id]));
      const unchanged = entries.filter((entry, index) => current[index]?.at === entry.at && current[index]?.op === entry.op);
      await this.db.outbox.bulkDelete(unchanged.map((entry): [string, string] => [entry.collection, entry.id]));
    });
  }

  clear(): Promise<void> {
    return this.db.outbox.clear();
  }

  async enqueue(entries: OutboxEntry[]): Promise<void> {
    await this.db.outbox.bulkPut(entries);
  }

  // Vlastní transakce nejvyšší úrovně: uvnitř vnější transakce by Dexie použil její IDB transakci
  // a z fronty by vypadly i místní zápisy vnější transakce. Tabulka outbox ve schématu transakce Dexie
  // není (přidává ji až middleware), proto se v `write` nedá číst ani zapisovat přes `db.outbox`.
  applyRemote(write: () => Promise<void>): Promise<void> {
    if (Dexie.currentTransaction) {
      return Promise.reject(new Error('applyRemote nesmí běžet uvnitř jiné transakce'));
    }
    return this.db.transaction('rw', [this.db.notes, this.db.tasks, this.db.categories], (tx) => {
      untrackedTransactions.add(tx.idbtrans);
      return write();
    });
  }
}
