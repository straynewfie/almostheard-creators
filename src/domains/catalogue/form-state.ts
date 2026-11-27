export type FormState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

export const emptyFormState: FormState = { error: null, fieldErrors: {} };

export function invalid(fieldErrors: Record<string, string>, error?: string): FormState {
  return {
    error: error ?? "Check the highlighted fields.",
    fieldErrors,
  };
}
