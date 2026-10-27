import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const rules = readFileSync('firestore.rules', 'utf8');
// Testovací uid z allowlistu ve `firestore.rules`.
const OWNER = 'emulator-owner';
const record = (id: string) => ({ id, updatedAt: '2026-10-27T10:00:00.000Z' });

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tapnote',
    // Host a port emulátoru se čtou z FIRESTORE_EMULATOR_HOST, který nastaví `emulators:exec`.
    firestore: { rules },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore.rules', () => {
  it.each(['notes', 'tasks', 'categories'])('vlastník čte, zapisuje a maže %s', async (collection) => {
    const db = env.authenticatedContext(OWNER).firestore();
    const path = `users/${OWNER}/${collection}/a1`;
    await assertSucceeds(setDoc(doc(db, path), record('a1')));
    await assertSucceeds(getDoc(doc(db, path)));
    await assertSucceeds(deleteDoc(doc(db, path)));
  });

  it('jiný uid nemá přístup k datům vlastníka', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/notes/a1`), record('a1'));
    });
    const db = env.authenticatedContext('stranger').firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/notes/a1`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/notes/a1`), record('a1')));
  });

  it.each(['notes', 'tasks', 'categories'])('vlastník načte celou kolekci %s, jiný uid ne', async (coll) => {
    const owner = env.authenticatedContext(OWNER).firestore();
    const stranger = env.authenticatedContext('stranger').firestore();
    await assertSucceeds(getDocs(collection(owner, `users/${OWNER}/${coll}`)));
    await assertFails(getDocs(collection(stranger, `users/${OWNER}/${coll}`)));
  });

  it('částečná úprava s platným updatedAt projde, s číslem ne', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/notes/a1`), record('a1'));
    });
    const db = env.authenticatedContext(OWNER).firestore();
    const ref = doc(db, `users/${OWNER}/notes/a1`);
    await assertSucceeds(updateDoc(ref, { title: 'x', updatedAt: '2026-10-27T11:00:00.000Z' }));
    await assertFails(updateDoc(ref, { updatedAt: 2 }));
  });

  it('jiný uid nesmaže dokument vlastníka', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER}/notes/a1`), record('a1'));
    });
    const db = env.authenticatedContext('stranger').firestore();
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/notes/a1`)));
  });

  it('dotaz přes collectionGroup je zakázaný', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(getDocs(collectionGroup(db, 'notes')));
  });

  it('nepřihlášený nemá přístup', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/notes/a1`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/notes/a1`), record('a1')));
  });

  it('uid mimo allowlist nemá přístup ani do vlastní větve', async () => {
    const db = env.authenticatedContext('stranger').firestore();
    await assertFails(setDoc(doc(db, 'users/stranger/notes/a1'), record('a1')));
    await assertFails(getDoc(doc(db, 'users/stranger/notes/a1')));
  });

  it('neznámá kolekce je zakázaná', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, `users/${OWNER}/settings/a1`), record('a1')));
    await assertFails(setDoc(doc(db, `users/${OWNER}`), record(OWNER)));
    await assertFails(setDoc(doc(db, 'other/a1'), record('a1')));
  });

  it('nesoulad id s id dokumentu je odmítnut', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, `users/${OWNER}/notes/a1`), record('b2')));
  });

  it('updatedAt jiného typu než řetězec je odmítnut', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, `users/${OWNER}/notes/a1`), { id: 'a1', updatedAt: 1 }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/notes/a1`), { id: 'a1' }));
  });
});
