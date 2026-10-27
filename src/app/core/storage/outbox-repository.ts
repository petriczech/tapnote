import { Observable } from 'rxjs';
import { OutboxEntry } from '../model/outbox-entry';

export abstract class OutboxRepository {
  // Čekající změny k odeslání
  abstract pending(): Promise<OutboxEntry[]>;
  // Počet čekajících změn, mění se s každým zápisem
  abstract count(): Observable<number>;
  // Odeberou se jen položky, které se mezitím nezměnily (novější úprava během odesílání zůstane ve frontě)
  abstract remove(entries: OutboxEntry[]): Promise<void>;
  abstract clear(): Promise<void>;
  // Ruční zařazení (záznam, který první synchronizace nenahrála a nemá ve frontě položku)
  abstract enqueue(entries: OutboxEntry[]): Promise<void>;
  // Zápisy uvnitř `write` (příchozí změny ze synchronizace) se do fronty nezařadí
  abstract applyRemote(write: () => Promise<void>): Promise<void>;
}
