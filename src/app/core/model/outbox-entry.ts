// Kolekce, které se synchronizují (historie verzí zůstává jen v zařízení, F4)
export const SYNCED_COLLECTIONS = ['notes', 'tasks', 'categories'] as const;

export type SyncedCollection = (typeof SYNCED_COLLECTIONS)[number];

// Čekající změna jednoho záznamu; na záznam je jen jeden řádek a poslední operace vyhrává
export interface OutboxEntry {
  collection: SyncedCollection;
  id: string;
  op: 'put' | 'delete';
  // Čas poslední změny (ISO), podle něj se pozná novější úprava během odesílání
  at: string;
}
