/** Browser-only storage for the app API Bearer token (production auth). */

export const BROWSER_API_KEY_STORAGE = "shcontent_api_key";

export function getBrowserApiKey(): string {
  try {
    return localStorage.getItem(BROWSER_API_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setBrowserApiKey(value: string): void {
  try {
    const trimmed = value.trim();
    if (!trimmed) {
      localStorage.removeItem(BROWSER_API_KEY_STORAGE);
    } else {
      localStorage.setItem(BROWSER_API_KEY_STORAGE, trimmed);
    }
  } catch {
    // private mode / blocked storage
  }
}
