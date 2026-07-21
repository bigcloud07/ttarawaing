export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStoredValue(
  storage: StorageLike,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(
  storage: StorageLike,
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
