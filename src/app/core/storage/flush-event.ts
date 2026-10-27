// Událost na window před zavřením databáze; posluchač přidá do `detail` slib uložení rozepsaných změn.
// Samostatně bez importu dexie (testy s fake-indexeddb ho musí načíst jako první)
export const FLUSH_EVENT = 'tapnote-flush';
// Nejdelší čekání na uložení před zavřením databáze
export const FLUSH_TIMEOUT_MS = 2000;
