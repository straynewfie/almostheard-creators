/** A connection is usable only after the stored health check succeeded. */
export function isVerifiedStorageConnection(healthStatus: string | null | undefined): boolean {
  return healthStatus === "healthy";
}
