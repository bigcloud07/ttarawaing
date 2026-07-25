export type ReadableStorageLike = Pick<Storage, "getItem">;
export type WritableStorageLike = Pick<Storage, "setItem">;

export function readStoredValue(
  storage: ReadableStorageLike,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(
  storage: WritableStorageLike,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(
  storage: Pick<Storage, "removeItem">,
  key: string,
): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
