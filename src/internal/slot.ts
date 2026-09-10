/**
 * A position a value tree either fills or lacks. Absence is a fact about the
 * tree's structure — a key its container does not hold — never a value standing
 * in for one.
 */
export type Slot<T = unknown> =
  | {readonly present: true; readonly value: T}
  | {readonly present: false};

export function present<T>(value: T): Slot<T> {
  return {present: true, value};
}

export const ABSENT: Slot<never> = {present: false};
