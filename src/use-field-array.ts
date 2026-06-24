import React from 'react';

import {
  Control,
  FieldRef,
  FieldRefSetValue,
  InternalFieldState,
  ResetOptions,
} from './control';
import {
  FieldError,
  fieldErrorSetsDeepEqual,
  NO_FIELD_ERRORS,
} from './field-errors';
import {useEventCallback} from './use-event-callback';
import {unionMapValues, unionSets} from './utils';

// -----------------------------------------------------------------------------
// BooleanArray

// Value class tracking which array elements are true.
class BooleanArray {
  private bits: boolean[];

  /** Number of elements that are `true`. */
  private numTrue: number;

  private constructor(bits: boolean[], numTrue: number) {
    this.bits = bits;
    this.numTrue = numTrue;
  }

  /**
   * Create a new array of the given length with all elements set to `false`.
   *
   * @param length The length of the new array.
   */
  static fromLength(length: number): BooleanArray {
    return new BooleanArray(new Array<boolean>(length).fill(false), 0);
  }

  concat(other: BooleanArray): BooleanArray {
    const bits = this.bits.concat(other.bits);
    return new BooleanArray(bits, this.numTrue + other.numTrue);
  }

  set(index: number, value: boolean): BooleanArray {
    // Optimization: no need to create a new object if the value hasn't changed:
    if (this.bits[index] === value) {
      return this;
    }
    const bits = this.bits.map((v, i) => (i === index ? value : v));
    // Optimization: the case were the old and new values are the same is
    // handled above.
    const numTrue = this.numTrue + (value && !this.bits[index] ? +1 : -1);
    return new BooleanArray(bits, numTrue);
  }

  get(index: number): boolean {
    return this.bits[index];
  }

  push(value: boolean): BooleanArray {
    return new BooleanArray(
      [...this.bits, value],
      this.numTrue + (value ? 1 : 0),
    );
  }

  remove(index: number): BooleanArray {
    const bits = this.bits.filter((_, i) => i !== index);
    const numTrue = this.bits[index] ? this.numTrue - 1 : this.numTrue;
    return new BooleanArray(bits, numTrue);
  }

  slice(start: number, end: number): BooleanArray {
    const bits = this.bits.slice(start, end);
    return new BooleanArray(bits, bits.filter(v => v).length);
  }

  /** Is at least one element true? */
  get isAnyTrue(): boolean {
    return this.numTrue > 0;
  }
}

// -----------------------------------------------------------------------------
// ErrorArray

// Optimization: we use a singleton for the empty error set to avoid creating
// new objects all the time.
const EMPTY_ERROR_ARRAY_MAP: Map<number, Set<FieldError>> = new Map();

// Value class tracking errors for each element in an array and the combined set
// of errors.
class ErrorArray {
  // Sparse representation of an array where only non-empty sets are stored.
  //
  // The representation is sparse as we expect most elements to not have errors.
  // The map key is the index of the element in the array.
  //
  // TODO(tibbe): Consider implementing O(1) shrinking using `slice` by allowing
  // `errors.size >= length` and making sure to use `length` to filter out keys
  // outsize 0 <= index < length when accessing the map elements.
  private errors: Map<number, Set<FieldError>>;

  // The length of the array.
  private length: number;

  /** Union of `errors`. */
  private combined: Set<FieldError>;

  private constructor(
    errors: Map<number, Set<FieldError>>,
    length: number,
    combined: Set<FieldError>,
  ) {
    this.errors = errors;
    this.length = length;
    this.combined = combined;
  }

  static fromLength(length: number): ErrorArray {
    return new ErrorArray(EMPTY_ERROR_ARRAY_MAP, length, NO_FIELD_ERRORS);
  }

  concat(other: ErrorArray): ErrorArray {
    // Optimization 1: If one of the arrays is empty, the result is the other.
    // Optimization 2: If one of the arrays has no errors, the result is the
    // other but the length is the sum of the two.
    if (other.length === 0) {
      return this;
    } else if (this.length === 0) {
      return other;
    } else if (this.errors.size === 0) {
      return new ErrorArray(
        other.errors,
        this.length + other.length,
        other.combined,
      );
    } else if (other.errors.size === 0) {
      return new ErrorArray(
        this.errors,
        this.length + other.length,
        this.combined,
      );
    }

    const errors = new Map(this.errors);
    other.errors.forEach((value, key) => {
      errors.set(key + this.length, value);
    });
    return new ErrorArray(
      errors,
      this.length + other.length,
      unionMapValues(errors),
    );
  }

  set(index: number, value: Set<FieldError>): ErrorArray {
    // Optimization: no need to create a new object if the value hasn't changed.
    const prevValue = this.errors.get(index);
    if (prevValue === value || (prevValue === undefined && value.size === 0)) {
      return this;
    }

    const errors = new Map(this.errors);
    if (value.size > 0) {
      errors.set(index, value);
    } else {
      errors.delete(index);
    }

    const combined = unionMapValues(errors);
    return new ErrorArray(errors, this.length, combined);
  }

  get(index: number): Set<FieldError> {
    return this.errors.get(index) ?? NO_FIELD_ERRORS;
  }

  push(value: Set<FieldError>): ErrorArray {
    let errors = this.errors;
    if (value.size > 0) {
      errors = new Map(this.errors);
      errors.set(this.length, value);
    }
    return new ErrorArray(
      errors,
      this.length + 1,
      // Optimization: if the new value is empty, the combined errors are the
      // same as before.
      value.size > 0 ? new Set([...this.combined, ...value]) : this.combined,
    );
  }

  remove(index: number): ErrorArray {
    if (this.errors.size === 0) {
      return ErrorArray.fromLength(this.length - 1);
    }

    let hasRemovedError = false;
    let hasShiftedError = false;
    for (const key of this.errors.keys()) {
      if (key === index) {
        hasRemovedError = true;
      } else if (key > index) {
        hasShiftedError = true;
      }
    }

    if (!hasRemovedError && !hasShiftedError) {
      return new ErrorArray(this.errors, this.length - 1, this.combined);
    }

    const errors = new Map<number, Set<FieldError>>();
    this.errors.forEach((value, key) => {
      if (key < index) {
        errors.set(key, value);
      } else if (key > index) {
        errors.set(key - 1, value);
      }
    });

    return new ErrorArray(
      errors,
      this.length - 1,
      hasRemovedError ? unionMapValues(errors) : this.combined,
    );
  }

  slice(start: number, end: number): ErrorArray {
    const errors = new Map<number, Set<FieldError>>();
    for (let i = start; i < end; i++) {
      const value = this.errors.get(i);
      if (value !== undefined) {
        errors.set(i, value);
      }
    }
    return new ErrorArray(errors, end - start, unionMapValues(errors));
  }

  /** Is at least one element dirty? */
  get allErrors(): Set<FieldError> {
    return this.combined;
  }
}

// -----------------------------------------------------------------------------
// useFieldArray

export type UseFieldArrayProps<T> = {
  /**
   * The {@link Control} object from the parent.
   */
  control: Control<T[]>;

  /**
   * Validation function that validates the field value.
   *
   * For efficiency reasons it's important to return {@link NO_FIELD_ERRORS} if
   * the value is valid, rather than a new empty {@link Set}. Returning a new
   * empty set also works but might cause more re-renders.
   *
   * Use this for array-level validation, such as checking the length of the
   * array. Child field validation is handled by each child control.
   *
   * @param value The value to validate.
   * @returns A set of errors. If the set is empty the value is considered
   * valid.
   */
  validate?: (value: T[]) => Set<FieldError>;
};

export type UseFieldArrayField<T> = {
  /**
   * Control object to pass to the children.
   */
  control: Control<T>;
};

export type UseFieldArrayReturn<T> = {
  /**
   * Append a child to the array.
   *
   * @param initialItemValue The initial value of the child.
   */
  append: (initialItemValue: T) => void;

  /**
   * Current validation errors of the array.
   *
   * This does not include errors of the child fields.
   *
   * If empty the field is valid.
   */
  errors: Set<FieldError>;

  /**
   * The current children.
   */
  fields: UseFieldArrayField<T>[];

  /**
   * Remove a child from the array.
   *
   * @param index The index of the field to remove.
   */
  remove: (index: number) => void;
};

/**
 * Combine child forms into an array.
 *
 * Validation: the field array is valid if all its children are valid and the
 * array field itself is valid (see {@link UseFieldArrayProps.validate}). The
 * {@link FieldError}s from the children are combined into a single field error
 * {@link Set}.
 *
 * Dirty state: the field array is considered dirty if any of its children is
 * considered dirty or if the current length of the array is different from its
 * initial length.
 *
 * When {@link FieldRef.reset} is called and
 * {@link ResetOptions.keepDirtyValues} is `true`
 * - the array field will keep its current length, if it is different from the
 *   length of the initial value, and
 * - reset each child using their {@link FieldRef.reset} method.
 */
export const useFieldArray = <T>({
  control,
  validate,
}: UseFieldArrayProps<T>): UseFieldArrayReturn<T> => {
  const {onChange, ref, initialValue, value, validationMode} = control;

  // Cached values of child fields:
  // - `dirtyBits` is a boolean array that tracks which elements are dirty and
  //   whether any element is dirty.
  // - `fieldErrors` is an array of sets of errors for each element in the array
  //   and the combined set of errors for all elements.
  const [dirtyBits, setDirtyBits] = React.useState<BooleanArray>(() =>
    BooleanArray.fromLength(initialValue.length),
  );
  const [fieldErrors, setFieldErrors] = React.useState<ErrorArray>(() =>
    ErrorArray.fromLength(initialValue.length),
  );
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const dirtyBitsRef = React.useRef(dirtyBits);
  dirtyBitsRef.current = dirtyBits;
  const fieldErrorsRef = React.useRef(fieldErrors);
  fieldErrorsRef.current = fieldErrors;

  // Refs to the child fields.
  const childRefs = React.useRef<Array<FieldRef<T> | null>>(
    null as unknown as Array<FieldRef<T> | null>,
  );
  if (childRefs.current === null) {
    childRefs.current = new Array(initialValue.length).fill(null);
  }

  // Dirty state:
  const isDirty = React.useMemo(
    () => value.length !== initialValue.length || dirtyBits.isAnyTrue,
    [value.length, initialValue.length, dirtyBits.isAnyTrue],
  );

  // Validation state:
  //
  // These are only the errors of the field array itself (i.e. the result of
  // calling `validate`). The errors of the children are stored in `fieldErrors`
  // and are combined with `errors` when notifying the parent.
  //
  // Validation is event-driven (happens when e.g. `append` or `remove` is
  // called).
  const [errors, setErrors] = React.useState(NO_FIELD_ERRORS);

  // Notify parent of changes:
  React.useEffect(
    () =>
      onChange(value, {
        isDirty,
        errors: unionSets([errors, fieldErrors.allErrors]),
      }),
    [value, isDirty, errors, onChange, fieldErrors.allErrors],
  );

  // Optimization: we keep track of the previous errors and only return a
  // different object if re-validating returns a different set of errors.
  // This will make re-renders less likely.
  const prevErrors = React.useRef(NO_FIELD_ERRORS);

  const validateAndSetErrors = React.useCallback(
    (val: T[]) => {
      // Compute new state:
      let newErrors = validate?.(val) ?? NO_FIELD_ERRORS;
      // See comment on `prevErrors`.
      newErrors = fieldErrorSetsDeepEqual(newErrors, prevErrors.current)
        ? prevErrors.current
        : newErrors;

      // Update state:
      prevErrors.current = newErrors;
      setErrors(newErrors);
      return newErrors;
    },
    [validate],
  );

  type OnChangeItem = (
    newItemValue: T,
    fieldState: InternalFieldState,
    index: number,
  ) => void;
  const onChangeItem: OnChangeItem = useEventCallback(
    (newItemValue, {isDirty, errors: newItemErrors}, index) => {
      const currentValue = valueRef.current;
      const currentDirtyBits = dirtyBitsRef.current;
      const currentFieldErrors = fieldErrorsRef.current;

      // Optimization: don't do anything if nothing changed.
      const errors = currentFieldErrors.get(index);
      if (
        newItemValue === currentValue[index] &&
        isDirty === currentDirtyBits.get(index) &&
        (newItemErrors === errors ||
          (newItemErrors.size === 0 && errors.size === 0))
      ) {
        return;
      }

      const newValue = currentValue.map((v, i) =>
        i === index ? newItemValue : v,
      );
      const newDirtyBits = currentDirtyBits.set(index, isDirty);
      const newFieldErrors = currentFieldErrors.set(index, newItemErrors);
      valueRef.current = newValue;
      dirtyBitsRef.current = newDirtyBits;
      fieldErrorsRef.current = newFieldErrors;
      setDirtyBits(newDirtyBits);
      setFieldErrors(newFieldErrors);
      const newErrors = validateAndSetErrors(newValue);
      const allErrors = unionSets([newErrors, newFieldErrors.allErrors]);
      onChange(newValue, {
        isDirty:
          newValue.length !== initialValue.length || newDirtyBits.isAnyTrue,
        errors: allErrors,
      });
    },
  );

  const fields = React.useMemo<UseFieldArrayField<T>[]>(
    () =>
      value.map((v, index) => ({
        control: {
          onChange: (...args) => onChangeItem(...args, index),
          ref: (childRef: FieldRef<T>) => {
            // If the child has been removed since `fields` was created ignore
            // any attempts to set the ref.
            if (index < childRefs.current.length) {
              childRefs.current[index] = childRef;
            }
          },
          // TODO(tibbe): Should we instead have an `initialItemValue` prop on
          // `useFieldArray`.
          initialValue: initialValue[index] ?? v,
          value: v,
          validationMode,
        },
      })),
    [initialValue, onChangeItem, validationMode, value],
  );

  const reset = React.useCallback(
    (newValue?: T[], options?: ResetOptions): T[] => {
      const {keepDirtyValues = false} = options || {};
      let nextValue = newValue ?? initialValue;
      const currentValue = valueRef.current;
      const isArrayLenDirty = currentValue.length !== initialValue.length;
      const keepValue = keepDirtyValues && isArrayLenDirty;
      if (!keepValue) {
        setErrors(NO_FIELD_ERRORS);
      }
      if (keepValue) {
        // To keep the current length we might need to shorten or extend the
        // new value.
        if (currentValue.length > nextValue.length) {
          // `undefined` here will cause the child to be reset to its internally
          // stored initial value (e.g. the one passed to `append`)
          nextValue = nextValue.concat(
            new Array(currentValue.length - nextValue.length).fill(undefined),
          );
        } else if (currentValue.length < nextValue.length) {
          nextValue = nextValue.slice(0, currentValue.length);
        }
      }

      const clearedDirtyBits = BooleanArray.fromLength(nextValue.length);
      const clearedFieldErrors = ErrorArray.fromLength(nextValue.length);
      dirtyBitsRef.current = clearedDirtyBits;
      fieldErrorsRef.current = clearedFieldErrors;
      setDirtyBits(clearedDirtyBits);
      setFieldErrors(clearedFieldErrors);
      if (nextValue.length < childRefs.current.length) {
        childRefs.current = childRefs.current.slice(0, nextValue.length);
      } else if (nextValue.length > childRefs.current.length) {
        childRefs.current = [
          ...childRefs.current,
          ...new Array(nextValue.length - currentValue.length).fill(null),
        ];
      }

      const updatedValue = childRefs.current.map(
        (childRef, index) =>
          childRef?.reset(newValue && nextValue[index], options) ??
          nextValue[index],
        options,
      );
      valueRef.current = updatedValue;
      return updatedValue;
    },
    [initialValue],
  );

  const setValueMethod: FieldRefSetValue<T[]> = React.useCallback(
    (newValue: T[], options) => {
      const currentValue = valueRef.current;
      const currentDirtyBits = dirtyBitsRef.current;
      const currentFieldErrors = fieldErrorsRef.current;

      // Optimization: don't do anything if nothing changed.
      if (newValue === currentValue) {
        return;
      }

      let newDirtyBits = currentDirtyBits;
      let newFieldErrors = currentFieldErrors;

      if (newValue.length > currentValue.length) {
        const numToAdd = newValue.length - currentValue.length;
        childRefs.current = [
          ...childRefs.current,
          ...new Array(numToAdd).fill(null),
        ];
        newDirtyBits = currentDirtyBits.concat(
          BooleanArray.fromLength(numToAdd),
        );
        newFieldErrors = currentFieldErrors.concat(
          ErrorArray.fromLength(numToAdd),
        );
      } else if (newValue.length < currentValue.length) {
        childRefs.current = childRefs.current.slice(0, newValue.length);
        newDirtyBits = currentDirtyBits.slice(0, newValue.length);
        newFieldErrors = currentFieldErrors.slice(0, newValue.length);
      }

      valueRef.current = newValue;
      dirtyBitsRef.current = newDirtyBits;
      fieldErrorsRef.current = newFieldErrors;
      setDirtyBits(newDirtyBits);
      setFieldErrors(newFieldErrors);

      const newErrors = validateAndSetErrors(newValue);
      const allErrors = unionSets([newErrors, newFieldErrors.allErrors]);

      // We can't rely on future calls to `onChangeItem` to propagate the change
      // as if we e.g. remove all rows we won't get any calls.
      onChange(newValue, {
        isDirty:
          newValue.length !== initialValue.length || newDirtyBits.isAnyTrue,
        errors: allErrors,
      });

      // If we added new children some of the refs might be null. These new
      // children will be initialized to the correct value when they are created
      // through `initialValue`.
      for (let i = 0; i < newValue.length; i++) {
        childRefs.current[i]?.setValue(newValue[i], options);
      }
    },
    [initialValue.length, onChange, validateAndSetErrors],
  );

  const validateMethod = React.useCallback(() => {
    const newErrors = validateAndSetErrors(valueRef.current);
    return unionSets([
      newErrors,
      ...childRefs.current.map(
        childRef => childRef?.validate() ?? NO_FIELD_ERRORS,
      ),
    ]);
  }, [validateAndSetErrors]);

  React.useImperativeHandle(
    ref,
    () => ({reset, setValue: setValueMethod, validate: validateMethod}),
    [reset, setValueMethod, validateMethod],
  );

  const append = React.useCallback(
    (initialItemValue: T) => {
      const currentValue = valueRef.current;
      const currentDirtyBits = dirtyBitsRef.current;
      const currentFieldErrors = fieldErrorsRef.current;
      const newValue = [...currentValue, initialItemValue];
      const newDirtyBits = currentDirtyBits.push(false);
      const newFieldErrors = currentFieldErrors.push(NO_FIELD_ERRORS);
      valueRef.current = newValue;
      dirtyBitsRef.current = newDirtyBits;
      fieldErrorsRef.current = newFieldErrors;
      setDirtyBits(newDirtyBits);
      setFieldErrors(newFieldErrors);
      childRefs.current = [...childRefs.current, null];
      const newErrors = validateAndSetErrors(newValue);
      const allErrors = unionSets([newErrors, newFieldErrors.allErrors]);

      onChange(newValue, {
        isDirty:
          newValue.length !== initialValue.length || newDirtyBits.isAnyTrue,
        errors: allErrors,
      });
    },
    [initialValue.length, onChange, validateAndSetErrors],
  );

  const remove = React.useCallback(
    (index: number) => {
      const currentValue = valueRef.current;

      // Optimization: don't do anything if the index is out of bounds.
      if (index < 0 || index >= currentValue.length) {
        return;
      }
      const currentDirtyBits = dirtyBitsRef.current;
      const currentFieldErrors = fieldErrorsRef.current;
      const newValue = currentValue.filter((_, i) => i !== index);
      const newDirtyBits = currentDirtyBits.remove(index);
      const newFieldErrors = currentFieldErrors.remove(index);
      valueRef.current = newValue;
      dirtyBitsRef.current = newDirtyBits;
      fieldErrorsRef.current = newFieldErrors;
      setDirtyBits(newDirtyBits);
      setFieldErrors(newFieldErrors);
      childRefs.current = childRefs.current.filter((_, i) => i !== index);
      const newErrors = validateAndSetErrors(newValue);
      const allErrors = unionSets([newErrors, newFieldErrors.allErrors]);

      onChange(newValue, {
        isDirty:
          newValue.length !== initialValue.length || newDirtyBits.isAnyTrue,
        errors: allErrors,
      });
    },
    [initialValue.length, onChange, validateAndSetErrors],
  );

  return React.useMemo(
    () => ({append, errors, fields, remove}),
    [append, errors, fields, remove],
  );
};
