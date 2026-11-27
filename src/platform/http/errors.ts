/** Client-facing failures stay generic. Validation messages are produced by our code. */

const UNIQUE = "That value is already in use.";
const GENERIC = "The change could not be saved.";

export function catalogueWriteError(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "23505") return UNIQUE;
  if (code === "23503") {
    return "That item is still connected to another part of the catalogue.";
  }
  if (code === "42501" || code === "PGRST301") {
    return "You do not have permission to change that.";
  }
  return GENERIC;
}

export function genericFailure(kind: "load" | "save" | "auth"): string {
  if (kind === "load") return "The page could not be loaded.";
  if (kind === "auth") return "Sign-in could not be completed.";
  return GENERIC;
}
