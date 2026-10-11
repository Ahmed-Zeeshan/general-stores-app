/** Pakistani CNIC helpers (shared by the server and the pages). */

/** "35202-1234567-1" from any way of typing the 13 digits, or null if it is not 13 digits. */
export function cnicOrNull(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}
