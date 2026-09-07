import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'fitness.session-token';

/**
 * SecureStore has no native implementation on web, so token persistence is
 * skipped there (session lives in memory only). Android/iOS persist the token
 * in the platform keychain/keystore-backed storage.
 */
const isPersistenceAvailable = Platform.OS !== 'web';

let inMemoryToken: string | null = null;

export async function loadSessionToken(): Promise<string | null> {
  if (!isPersistenceAvailable) {
    return inMemoryToken;
  }
  try {
    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveSessionToken(token: string): Promise<void> {
  if (!isPersistenceAvailable) {
    inMemoryToken = token;
    return;
  }
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch {
    // Persistence failure must never block authentication.
  }
}

export async function clearSessionToken(): Promise<void> {
  if (!isPersistenceAvailable) {
    inMemoryToken = null;
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // Ignore: the token is already unusable once removed from the store.
  }
}
