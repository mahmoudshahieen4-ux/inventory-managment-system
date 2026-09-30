/** Removes pasted whitespace without changing a signed token's case or bytes. */
export function formatLicenseKey(raw: string): string {
  return raw.trim().replace(/\s+/g, '')
}
