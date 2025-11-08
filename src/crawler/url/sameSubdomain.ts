export function sameSubdomain(a: string | URL, b: string | URL): boolean {
  try {
    const aUrl = typeof a === 'string' ? new URL(a) : a;
    const bUrl = typeof b === 'string' ? new URL(b) : b;
    return aUrl.hostname.toLowerCase() === bUrl.hostname.toLowerCase();
  } catch {
    return false;
  }
}
