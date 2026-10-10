/** Runs once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { startAutoBackup } = await import("./lib/auto-backup");
    startAutoBackup();
  }
}
