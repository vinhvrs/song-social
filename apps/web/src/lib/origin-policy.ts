/**
 * Next normalizes loopback URL hostnames to `localhost`, so use the actual Host
 * header with the request scheme. The deployment proxy must preserve Host and
 * supply Next's external scheme. Never trust an arbitrary X-Forwarded-Host.
 */
export function isSameRequestOrigin(
  origin: string | null,
  host: string | null,
  protocol: string,
): boolean {
  if (!origin || !host || !/^https?:$/.test(protocol)) return false;
  if (/[\s/\\@?#,]/.test(host)) return false;
  try {
    const supplied = new URL(origin);
    // A browser Origin is serialized as scheme://host[:port], without a path.
    if (supplied.origin !== origin) return false;
    const expected = new URL(`${protocol}//${host}`);
    return supplied.origin === expected.origin;
  } catch {
    return false;
  }
}
