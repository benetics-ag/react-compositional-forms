import React from 'react';

import {
  Control,
  FieldRef,
  FieldRefSetValue,
  InternalFieldState,
  ResetOptions,
} from './control';
import {FieldError, NO_FIELD_ERRORS} from './field-errors';
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
    const prevValue = this.errors.get(index);

    // Optimization: no need to create a new object if the value hasn't changed.
    if (prevValue === undefined) {
      return this;
    }

    const errors = new Map(this.errors);
    errors.delete(index);

    return new ErrorArray(errors, this.length, unionMapValues(errors));
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
 * Validation: the field array is considered valid if all its children are
 * considered valid. The {@link FieldError}s from the children are combined into
 * a single field error {@link Set}.
 *
 * Dirty state: the field array is considered dirty if any of its children is
 * considered dirty or if the current length of the array is different from its
 * initial length.
 */
export const useFieldArray = <T>({
  control,
}: UseFieldArrayProps<T>): UseFieldArrayReturn<T> => {
  const {context, onChange, ref, initialValue, value, validationMode} = control;

  // Cached values of child fields:
  // - `dirtyBits` is a boolean array that tracks which elements are dirty and
  //   whether any element is dirty.
  // - `fieldErrors` is an array of sets of errors for each element in the array
  //   and the combined set of errors
  //
  // Any update to these arrays must be propagated to the parent via `onChange`
  // as optimizations (e.g. in `onChangeItem`) relies on it.
  const dirtyBits = React.useRef<BooleanArray>(null as unknown as BooleanArray);
  if (dirtyBits.current === null) {
    dirtyBits.current = BooleanArray.fromLength(initialValue.length);
  }
  const fieldErrors = React.useRef<ErrorArray>(null as unknown as ErrorArray);
  if (fieldErrors.current === null) {
    fieldErrors.current = ErrorArray.fromLength(initialValue.length);
  }

  // Refs to the child fields.
  const childRefs = React.useRef<Array<FieldRef<T> | null>>(
    null as unknown as Array<FieldRef<T> | null>,
  );
  if (childRefs.current === null) {
    childRefs.current = new Array(initialValue.length).fill(null);
  }

  type OnChangeItem = (
    newValue: T,
    fieldState: InternalFieldState,
    index: number,
  ) => void;
  const onChangeItem: OnChangeItem = useEventCallback(
    (newItemValue, {isDirty, errors: newErrors}, index) => {
      // Optimization: don't do anything if nothing changed.
      const errors = fieldErrors.current.get(index);
      if (
        newItemValue === value[index] &&
        isDirty === dirtyBits.current.get(index) &&
        (newErrors === errors || (newErrors.size === 0 && errors.size === 0))
      ) {
        return;
      }

      const newValue = value.map((v, i) => (i === index ? newItemValue : v));
      dirtyBits.current = dirtyBits.current.set(index, isDirty);
      fieldErrors.current = fieldErrors.current.set(index, newErrors);
      onChange(
        newValue,
        {
          isDirty:
            newValue.length !== initialValue.length ||
            dirtyBits.current.isAnyTrue,
          errors: fieldErrors.current.allErrors,
        },
        context,
      );
    },
  );

  const fields = React.useMemo<UseFieldArrayField<T>[]>(
    () =>
      value.map((v, index) => ({
        control: {
          context: index,
          onChange: onChangeItem,
          ref: (childRef: FieldRef<T>) => {
            childRefs.current[index] = childRef;
          },
          // TODO(tibbe): Should we instead have an `initialItemValue` prop on
          // `useFieldArray`.
          initialValue: initialValue[index] ?? value[index],
          value: value[index],
          validationMode,
        },
      })),
    [initialValue, onChangeItem, validationMode, value],
  );

  const reset = React.useCallback(
    (newValue?: T[], options?: ResetOptions) => {
      const {keepDirtyValues = false} = options || {};
      const nextValue = newValue ?? initialValue;
      const isDirty =
        value.length !== nextValue.length || dirtyBits.current.isAnyTrue;
      const keepValue = keepDirtyValues && isDirty;
      if (!keepValue) {
        dirtyBits.current = BooleanArray.fromLength(nextValue.length);
        fieldErrors.current = ErrorArray.fromLength(nextValue.length);
        if (nextValue.length < value.length) {
          childRefs.current = childRefs.current.slice(0, nextValue.length);
        } else if (nextValue.length > value.length) {
          childRefs.current = [
            ...childRefs.current,
            ...new Array(nextValue.length - value.length).fill(null),
          ];
        }

        // Since we changed e.g. `dirtyBits` we need to notify the parent as
        // otherwise optimizations in e.g. `onChangeItem` that assume that the
        // current state corresponds to what has been communicated to the parent
        // aren't valid.
        onChange(
          nextValue,
          {
            isDirty: dirtyBits.current.isAnyTrue,
            errors: fieldErrors.current.allErrors,
          },
          context,
        );

        childRefs.current.forEach((childRef, index) =>
          childRef?.reset(nextValue[index]),
        );
      }
    },
    [context, initialValue, onChange, value.length],
  );

  const setValueMethod: FieldRefSetValue<T[]> = React.useCallback(
    (newValue: T[], options) => {
      // Optimization: don't do anything if nothing changed.
      if (newValue === value) {
        return;
      }

      if (newValue.length > value.length) {
        const numToAdd = newValue.length - value.length;
        childRefs.current = [
          ...childRefs.current,
          ...new Array(numToAdd).fill(null),
        ];
        dirtyBits.current = dirtyBits.current.concat(
          BooleanArray.fromLength(numToAdd),
        );
        fieldErrors.current = fieldErrors.current.concat(
          ErrorArray.fromLength(numToAdd),
        );
      } else if (newValue.length < value.length) {
        childRefs.current = childRefs.current.slice(0, newValue.length);
        dirtyBits.current = dirtyBits.current.slice(0, newValue.length);
        fieldErrors.current = fieldErrors.current.slice(0, newValue.length);
      }

      // We can't rely on future calls to `onChangeItem` to propagate the change
      // as if we e.g. remove all rows we won't get any calls.
      onChange(
        newValue,
        {
          isDirty:
            newValue.length !== initialValue.length ||
            dirtyBits.current.isAnyTrue,
          errors: fieldErrors.current.allErrors,
        },
        context,
      );

      // If we added new children some of the refs might be null. These new
      // children will be initialized to the correct value when they are created
      // through `initialValue`.
      for (let i = 0; i < newValue.length; i++) {
        childRefs.current[i]?.setValue(newValue[i], options);
      }
    },
    [context, initialValue.length, onChange, value],
  );

  const validateMethod = React.useCallback(
    () =>
      unionSets(
        childRefs.current.map(
          childRef => childRef?.validate() ?? NO_FIELD_ERRORS,
        ),
      ),
    [],
  );

  React.useImperativeHandle(
    ref,
    () => ({reset, setValue: setValueMethod, validate: validateMethod}),
    [reset, setValueMethod, validateMethod],
  );

  const append = React.useCallback(
    (initialItemValue: T) => {
      const newValue = [...value, initialItemValue];
      dirtyBits.current = dirtyBits.current.push(false);
      fieldErrors.current = fieldErrors.current.push(NO_FIELD_ERRORS);
      childRefs.current = [...childRefs.current, null];
      onChange(
        newValue,
        {
          isDirty:
            newValue.length !== initialValue.length ||
            dirtyBits.current.isAnyTrue,
          errors: fieldErrors.current.allErrors,
        },
        context,
      );
    },
    [context, initialValue.length, onChange, value],
  );

  const remove = React.useCallback(
    (index: number) => {
      // Optimization: don't do anything if the index is out of bounds.
      if (index < 0 || index >= value.length) {
        return;
      }
      const newValue = value.filter((_, i) => i !== index);
      dirtyBits.current = dirtyBits.current.remove(index);
      fieldErrors.current = fieldErrors.current.remove(index);
      childRefs.current.filter((_, i) => i !== index);
      onChange(
        newValue,
        {
          isDirty:
            newValue.length !== initialValue.length ||
            dirtyBits.current.isAnyTrue,
          errors: fieldErrors.current.allErrors,
        },
        context,
      );
    },
    [context, initialValue.length, onChange, value],
  );

  return React.useMemo(
    () => ({append, fields, remove}),
    [append, fields, remove],
  );
};
