export function resetLocalStorage() {
  window.localStorage.clear();
}

export function seedLocalStorage(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
