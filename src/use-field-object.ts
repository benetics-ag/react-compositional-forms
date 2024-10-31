import React from 'react';

import {
  Control,
  ControlOnChange,
  FieldRef,
  FieldRefSetValue,
  InternalFieldState,
  ResetOptions,
} from './control';
import {FieldError, NO_FIELD_ERRORS} from './field-errors';
import {useEventCallback} from './use-event-callback';
import {unionMapValues, unionSets} from './utils';

// -----------------------------------------------------------------------------
// BooleanMap

// Value class tracking which object elements are dirty.
class BooleanMap<K> {
  // Optimization: we use a singleton for the empty map to avoid creating new
  // objects all the time.
  private static readonly _EMPTY: BooleanMap<any> = new BooleanMap(
    new Map(),
    0,
  );

  // Sparse representation where only `true` values are stored. All other values
  // are assumed to be `false`.
  private bits: Map<K, boolean>;

  /** Number of elements that are `true`. */
  private numTrue: number;

  private constructor(bits: Map<K, boolean>, numTrue: number) {
    this.bits = bits;
    this.numTrue = numTrue;
  }

  static create<K>(): BooleanMap<K> {
    return this._EMPTY;
  }

  set(key: K, value: boolean): BooleanMap<K> {
    // Optimization: no need to create a new object if the value hasn't changed:
    const prevValue = this.bits.get(key) ?? false;
    if (prevValue === value) {
      return this;
    }
    const bits = new Map(this.bits);
    bits.set(key, value); // `value` must be `true` at this point
    // Optimization: the case were the old and new values are the same is
    // handled above.
    const numTrue = this.numTrue + (value && !prevValue ? +1 : -1);
    return new BooleanMap(bits, numTrue);
  }

  get(key: K): boolean {
    return this.bits.get(key) ?? false;
  }

  /** Is at least one element dirty? */
  get isAnyTrue(): boolean {
    return this.numTrue > 0;
  }
}

// -----------------------------------------------------------------------------
// ErrorMap

// Value class tracking which object elements are dirty.
class ErrorMap<K> {
  // Optimization: we use a singleton for the empty map to avoid creating new
  // objects all the time.
  private static readonly _EMPTY: ErrorMap<any> = new ErrorMap(
    new Map(),
    NO_FIELD_ERRORS,
  );

  // Sparse representation where only non-empty sets are stored.
  //
  // The representation is sparse as we expect most keys to not have errors.
  private errors: Map<K, Set<FieldError>>;

  /** Is at least one element in `bits` true? */
  private combined: Set<FieldError>;

  private constructor(
    errors: Map<K, Set<FieldError>>,
    combined: Set<FieldError>,
  ) {
    this.errors = errors;
    this.combined = combined;
  }

  static create<K>(): ErrorMap<K> {
    return ErrorMap._EMPTY;
  }

  set(key: K, value: Set<FieldError>): ErrorMap<K> {
    // Optimization: no need to create a new object if the value hasn't changed.
    const prevValue = this.errors.get(key);
    if (prevValue === value || (prevValue === undefined && value.size === 0)) {
      return this;
    }

    const errors = new Map(this.errors);
    if (value.size > 0) {
      errors.set(key, value);
    } else {
      errors.delete(key);
    }

    const combined = unionMapValues(errors);
    return new ErrorMap(errors, combined);
  }

  get = (key: K): Set<FieldError> => this.errors.get(key) ?? NO_FIELD_ERRORS;

  /** Is at least one element dirty? */
  get allErrors(): Set<FieldError> {
    return this.combined;
  }
}

// -----------------------------------------------------------------------------
// useFieldObject

export type UseFieldObjectProps<O extends object> = {
  /** Parent control. */
  control: Control<O>;
};

export type UseFieldObjectField<T> = {
  /** Child control. */
  control: Control<T>;
};

export type UseFieldObjectReturn<O extends object> = {
  /** A {@link Control} object for each child field. */
  fields: {[P in keyof O]: UseFieldObjectField<O[P]>};
};

export const useFieldObject = <O extends {[prop: string]: unknown}>({
  control,
}: UseFieldObjectProps<O>): UseFieldObjectReturn<O> => {
  const {onChange, ref, initialValue, validationMode, value} = control;

  // Cached values of child fields:
  // - `dirtyBits` is a boolean object that tracks which elements are dirty and
  //   whether any element is dirty.
  // - `fieldErrors` is an object of sets of errors for each element in the
  //   object and the combined set of errors
  //
  // Any update to these objects must be propagated to the parent via `onChange`
  // as optimizations (e.g. in `onChangeItem`) relies on it.
  const dirtyBits = React.useRef<BooleanMap<keyof O & string>>(
    null as unknown as BooleanMap<keyof O & string>,
  );
  if (dirtyBits.current === null) {
    dirtyBits.current = BooleanMap.create();
  }
  const fieldErrors = React.useRef<ErrorMap<string>>(
    null as unknown as ErrorMap<string>,
  );
  if (fieldErrors.current === null) {
    fieldErrors.current = ErrorMap.create();
  }

  // Refs to the child fields.
  const childRefs = React.useRef<Record<keyof O, FieldRef<O[keyof O]> | null>>(
    null as unknown as Record<keyof O, FieldRef<O[keyof O]> | null>,
  );
  if (childRefs.current === null) {
    childRefs.current = Object.fromEntries(
      Object.keys(initialValue).map(key => [key as keyof O, null]),
    ) as Record<keyof O, FieldRef<O[keyof O]> | null>;
  }

  type OnChangeItem = (
    newValue: O[keyof O],
    fieldState: InternalFieldState,
    key: keyof O & string,
  ) => void;
  const onChangeItem: OnChangeItem = useEventCallback(
    (newItemValue, {isDirty, errors: newErrors}, key) => {
      // Optimization: don't do anything if nothing changed.
      const errors = fieldErrors.current.get(key);
      if (
        newItemValue === value[key] &&
        isDirty === dirtyBits.current.get(key) &&
        (newErrors === errors || (newErrors.size === 0 && errors.size === 0))
      ) {
        return;
      }
      const newValue = {...value, [key]: newItemValue};
      dirtyBits.current = dirtyBits.current.set(key, isDirty);
      fieldErrors.current = fieldErrors.current.set(key, newErrors);
      onChange(newValue, {
        isDirty: dirtyBits.current.isAnyTrue,
        errors: fieldErrors.current.allErrors,
      });
    },
  );

  type ControlOnChangeArgs = Parameters<ControlOnChange<O[keyof O & string]>>;
  const fields = React.useMemo<UseFieldObjectReturn<O>['fields']>(
    () =>
      Object.fromEntries(
        Object.keys(initialValue).map((key: keyof O & string) => [
          key,
          {
            control: {
              onChange: (...args: ControlOnChangeArgs) =>
                onChangeItem(...args, key),
              ref: (childRef: FieldRef<O[keyof O]>) => {
                childRefs.current[key] = childRef;
              },
              initialValue: initialValue[key],
              validationMode,
              value: value[key],
            },
          },
        ]),
      ) as unknown as UseFieldObjectReturn<O>['fields'],
    [initialValue, onChangeItem, validationMode, value],
  );

  const reset = React.useCallback(
    (newValue?: O, options?: ResetOptions) => {
      const {keepDirtyValues = false} = options || {};
      const nextInitialValue = newValue ?? initialValue;
      const keepValue = keepDirtyValues && dirtyBits.current.isAnyTrue;
      if (!keepValue) {
        dirtyBits.current = BooleanMap.create();
        fieldErrors.current = ErrorMap.create();

        // Since we changed e.g. `dirtyBits` we need to notify the parent as
        // otherwise optimizations in e.g. `onChangeItem` that assume that the
        // current state corresponds to what has been communicated to the parent
        // aren't valid.
        onChange(nextInitialValue, {
          isDirty: false,
          errors: fieldErrors.current.allErrors,
        });

        Object.entries(childRefs.current).forEach(([key, childRef]) =>
          childRef?.reset(nextInitialValue[key as keyof O]),
        );
      }
    },
    [initialValue, onChange],
  );

  const setValue: FieldRefSetValue<{[P in keyof O]: O[P]}> = React.useCallback(
    (newValue: O, options) => {
      // Optimization: don't do anything if nothing changed.
      if (newValue === value) {
        return;
      }

      Object.entries(childRefs.current).forEach(([key, childRef]) => {
        // Optimization: don't do anything if nothing changed.
        const typedKey = key as keyof O;
        const newPropValue = newValue[typedKey];
        if (newPropValue === value[typedKey]) {
          return;
        }

        childRef?.setValue(newPropValue, options);
      });
    },
    [value],
  );

  const validateMethod = React.useCallback(
    () =>
      unionSets(
        Object.values(childRefs.current).map(
          childRef => childRef?.validate() ?? NO_FIELD_ERRORS,
        ),
      ),
    [],
  );

  React.useImperativeHandle(
    ref,
    () => ({reset, setValue, validate: validateMethod}),
    [reset, setValue, validateMethod],
  );

  return React.useMemo(() => ({fields}), [fields]);
};
