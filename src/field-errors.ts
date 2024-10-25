/** A field validation error. */
export type FieldError = {
  /** An optional, human readable error message. */
  message?: string;
};

/**
 * Stable value for an empty set of errors.
 *
 * Used to have all empty error sets share the same object and thus reduce
 * re-renders.
 *
 * N.B. This set must not be mutated.
 */
export const NO_FIELD_ERRORS: Set<FieldError> = new Set();
