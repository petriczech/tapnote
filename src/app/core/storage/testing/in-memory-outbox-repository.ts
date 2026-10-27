import { BehaviorSubject, Observable } from 'rxjs';
import { OutboxEntry } from '../../model/outbox-entry';
import { OutboxRepository } from '../outbox-repository';

// Testovací náhrada DexieOutboxRepository; položky se do fronty přidávají přes `add`
export class InMemoryOutboxRepository extends OutboxRepository {
  readonly entries = new Map<string, OutboxEntry>();
  private readonly size = new BehaviorSubject(0);

  add(entry: OutboxEntry): void {
    this.entries.set(`${entry.collection}/${entry.id}`, entry);
    this.size.next(this.entries.size);
  }

  async pending(): Promise<OutboxEntry[]> {
    return [...this.entries.values()];
  }

  count(): Observable<number> {
    return this.size;
  }

  async remove(entries: OutboxEntry[]): Promise<void> {
    for (const entry of entries) {
      const key = `${entry.collection}/${entry.id}`;
      const current = this.entries.get(key);
      if (current?.at === entry.at && current.op === entry.op) {
        this.entries.delete(key);
      }
    }
    this.size.next(this.entries.size);
  }

  async enqueue(entries: OutboxEntry[]): Promise<void> {
    entries.forEach((entry) => this.add(entry));
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.size.next(0);
  }

  applyRemote(write: () => Promise<void>): Promise<void> {
    return write();
  }
}
