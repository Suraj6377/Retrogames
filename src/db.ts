import { openDB, IDBPDatabase } from 'idb';
import { GameROM } from './types';

export type { GameROM };

const DB_NAME = 'nes-vault-db';
const STORE_NAME = 'roms';
const SAVE_STATE_STORE = 'save_states';

export async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE_STATE_STORE)) {
        db.createObjectStore(SAVE_STATE_STORE, { keyPath: 'gameId' });
      }
    },
  });
}

export async function saveROM(game: GameROM) {
  const db = await initDB();
  await db.put(STORE_NAME, game);
}

export async function getAllROMs(): Promise<GameROM[]> {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function deleteROM(id: string) {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
  // Also delete save state if it exists
  await db.delete(SAVE_STATE_STORE, id);
}

export async function saveGameState(gameId: string, state: any) {
  const db = await initDB();
  await db.put(SAVE_STATE_STORE, { gameId, state, timestamp: Date.now() });
}

export async function getGameState(gameId: string) {
  const db = await initDB();
  return db.get(SAVE_STATE_STORE, gameId);
}
