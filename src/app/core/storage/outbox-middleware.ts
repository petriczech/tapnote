import { DBCore, DBCoreMutateRequest, DBCoreTransaction, Middleware } from 'dexie';
import { OutboxEntry, SYNCED_COLLECTIONS, SyncedCollection } from '../model/outbox-entry';

// Transakce, jejichž zápisy do fronty nejdou (příchozí změny ze synchronizace)
export const untrackedTransactions = new WeakSet<DBCoreTransaction>();

const synced = new Set<string>(SYNCED_COLLECTIONS);
let lastAt = 0;

// Čas změny roste i při dvou zápisech ve stejné milisekundě, aby odebrání z fronty nepřehlédlo novější úpravu
function nextAt(): string {
  lastAt = Math.max(Date.now(), lastAt + 1);
  return new Date(lastAt).toISOString();
}

// Každý zápis poznámek, úkolů a kategorií se zařadí do fronty ve stejné transakci jako samotný zápis,
// takže zachytí všechny cesty (put, update, mazání, purgeTrash, import) bez úprav repozitářů
export const outboxMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'Outbox',
  create: (down) => ({
    ...down,
    // Zapisovací transakce nad synchronizovanou tabulkou se rozšíří o frontu
    transaction: (stores, mode, options) =>
      down.transaction(
        mode === 'readwrite' && stores.some((store) => synced.has(store)) && !stores.includes('outbox') ? [...stores, 'outbox'] : stores,
        mode,
        options,
      ),
    table: (name) => {
      const table = down.table(name);
      if (!synced.has(name)) {
        return table;
      }
      const primaryKey = table.schema.primaryKey;
      const collection = name as SyncedCollection;
      // Řetězí se přes then na promisech Dexie (ne async/await), aby transakce zůstala aktivní
      const tracked = (req: Exclude<DBCoreMutateRequest, { type: 'deleteRange' }>) => {
        const keys: string[] = req.type === 'delete' ? req.keys : (req.keys ?? req.values.map((value) => primaryKey.extractKey?.(value)));
        const op: OutboxEntry['op'] = req.type === 'delete' ? 'delete' : 'put';
        return table.mutate(req).then((result) => {
          const values = keys.filter((_, index) => !result.failures[index]).map((id): OutboxEntry => ({ collection, id, op, at: nextAt() }));
          return values.length === 0 ? result : down.table('outbox').mutate({ type: 'put', trans: req.trans, values }).then(() => result);
        });
      };
      return {
        ...table,
        mutate: (req) => {
          // Upgrade databáze ani příchozí změny se do fronty nezapisují
          if ((req.trans as IDBTransaction).mode === 'versionchange' || untrackedTransactions.has(req.trans)) {
            return table.mutate(req);
          }
          // Mazání rozsahem (clear) nezná klíče, proto se nejdřív načtou a smažou se po jednom klíči
          if (req.type === 'deleteRange') {
            return table
              .query({ trans: req.trans, values: false, query: { index: primaryKey, range: req.range } })
              .then(({ result }) => tracked({ type: 'delete', trans: req.trans, keys: result }));
          }
          return tracked(req);
        },
      };
    },
  }),
};
