/** A field validation error. */
export type FieldError = {
  /** An optional, human readable error message. */
  message?: string;
};

/** Public error collection type exposed by the library. */
export type FieldErrors = ReadonlySet<FieldError>;

/**
 * Stable value for an empty set of errors.
 *
 * Used to have all empty error sets share the same object and thus reduce
 * re-renders.
 *
 * N.B. This set must not be mutated.
 */
export const NO_FIELD_ERRORS: FieldErrors = new Set();

// -----------------------------------------------------------------------------
// fieldErrorSetsDeepEqual

function fieldErrorDeepEqual(errorA: FieldError, errorB: FieldError): boolean {
  if (errorA === errorB) {
    return true;
  }
  return errorA.message === errorB.message;
}

export function fieldErrorSetsDeepEqual(
  setA: FieldErrors,
  setB: FieldErrors,
): boolean {
  if (setA === setB) {
    return true;
  }

  if (setA.size !== setB.size) {
    return false;
  }

  // O(n^2) but n is small.
  for (const a of setA) {
    if (!Array.from(setB).some(b => fieldErrorDeepEqual(a, b))) {
      return false;
    }
  }

  return true;
}
