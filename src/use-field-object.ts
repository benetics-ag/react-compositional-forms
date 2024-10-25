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
// BooleanObject

// Value class tracking which object elements are dirty.
class BooleanObject<K extends string> {
  private bits: Record<K, boolean>;

  /** Is at least one element in `bits` true? */
  private anyTrue: boolean;

  private constructor(bits: Record<K, boolean>, anyTrue: boolean) {
    this.bits = bits;
    this.anyTrue = anyTrue;
  }

  static fromKeys<K extends string>(keys: K[]): BooleanObject<K> {
    return new BooleanObject(
      Object.fromEntries(keys.map(k => [k, false])) as Record<K, boolean>,
      false,
    );
  }

  set(key: K, value: boolean): BooleanObject<K> {
    // Optimization: no need to create a new object if the value hasn't changed:
    if (this.bits[key] === value) {
      return this;
    }
    const bits = {...this.bits, [key]: value} as Record<K, boolean>;
    const newIsDirty =
      value || (this.anyTrue && Object.values(bits).some(v => v));
    return new BooleanObject(bits, newIsDirty);
  }

  get(key: K): boolean {
    return this.bits[key];
  }

  /** Is at least one element dirty? */
  get isAnyTrue(): boolean {
    return this.anyTrue;
  }
}

// -----------------------------------------------------------------------------
// ErrorObject

// Optimization: we use a singleton for the empty error set to avoid creating
// new objects all the time.
const EMPTY_ERROR_OBJECT_MAP: Map<string, Set<FieldError>> = new Map();

// Value class tracking which object elements are dirty.
class ErrorObject {
  // Sparse representation where only non-empty sets are stored.
  //
  // The representation is sparse as we expect most keys to not have errors.
  private errors: Map<string, Set<FieldError>>;

  // All possible keys of the object.
  private keys: string[];

  /** Is at least one element in `bits` true? */
  private combined: Set<FieldError>;

  private constructor(
    errors: Map<string, Set<FieldError>>,
    keys: string[],
    combined: Set<FieldError>,
  ) {
    this.errors = errors;
    this.keys = keys;
    this.combined = combined;
  }

  static fromKeys(keys: string[]): ErrorObject {
    return new ErrorObject(EMPTY_ERROR_OBJECT_MAP, keys, NO_FIELD_ERRORS);
  }

  set(key: string, value: Set<FieldError>): ErrorObject {
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
    return new ErrorObject(errors, this.keys, combined);
  }

  get = (key: string): Set<FieldError> =>
    this.errors.get(key) ?? NO_FIELD_ERRORS;

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
  const {
    context,
    onChange,
    ref,
    initialValue: controlInitialValue,
    validationMode,
  } = control;

  // On `reset` we might change the initial value and thus we need a local copy.
  const initialValue = React.useRef(controlInitialValue);

  // Cached values of child fields:
  // - `value` is the current value of the object.
  // - `dirtyBits` is a boolean object that tracks which elements are dirty and
  //   whether any element is dirty.
  // - `fieldErrors` is an object of sets of errors for each element in the
  //   object and the combined set of errors
  //
  // Any update to these objects must be propagated to the parent via `onChange`
  // as optimizations (e.g. in `onChangeItem`) relies on it.
  const value = React.useRef(controlInitialValue);
  const dirtyBits = React.useRef<BooleanObject<keyof O & string>>(
    null as unknown as BooleanObject<keyof O & string>,
  );
  if (dirtyBits.current === null) {
    dirtyBits.current = BooleanObject.fromKeys(
      Object.keys(controlInitialValue),
    );
  }
  const fieldErrors = React.useRef<ErrorObject>(null as unknown as ErrorObject);
  if (fieldErrors.current === null) {
    fieldErrors.current = ErrorObject.fromKeys(
      Object.keys(controlInitialValue),
    );
  }

  // Refs to the child fields.
  const childRefs = React.useRef<Record<keyof O, FieldRef<O[keyof O]> | null>>(
    null as unknown as Record<keyof O, FieldRef<O[keyof O]> | null>,
  );
  if (childRefs.current === null) {
    childRefs.current = Object.fromEntries(
      Object.keys(value).map(key => [key as keyof O, null]),
    ) as Record<keyof O, FieldRef<O[keyof O]> | null>;
  }

  type OnChangeItem = (
    newValue: O[keyof O],
    fieldState: InternalFieldState,
    key: keyof O & string,
  ) => void;
  const onChangeItem: OnChangeItem = useEventCallback(
    (newValue, {isDirty, errors: newErrors}, key) => {
      // Optimization: don't do anything if nothing changed.
      const errors = fieldErrors.current.get(key);
      if (
        newValue === value.current[key] &&
        isDirty === dirtyBits.current.get(key) &&
        (newErrors === errors || (newErrors.size === 0 && errors.size === 0))
      ) {
        return;
      }
      const newElems = {...value.current, [key]: newValue};
      value.current = newElems;
      dirtyBits.current = dirtyBits.current.set(key, isDirty);
      fieldErrors.current = fieldErrors.current.set(key, newErrors);
      onChange(
        newElems,
        {
          isDirty: dirtyBits.current.isAnyTrue,
          errors: fieldErrors.current.allErrors,
        },
        context,
      );
    },
  );

  const [fields, setFields] = React.useState<UseFieldObjectReturn<O>['fields']>(
    () =>
      Object.fromEntries(
        Object.keys(initialValue.current).map((key: keyof O) => [
          key,
          {
            control: {
              context: key,
              onChange: onChangeItem,
              ref: (childRef: FieldRef<O[keyof O]>) => {
                childRefs.current[key] = childRef;
              },
              initialValue: initialValue.current[key],
              validationMode,
            },
          },
        ]),
      ) as unknown as UseFieldObjectReturn<O>['fields'],
  );

  const reset = React.useCallback(
    (newInitialValue?: O, options?: ResetOptions) => {
      const {keepDirtyValues = false} = options || {};
      if (newInitialValue !== undefined) {
        initialValue.current = newInitialValue;
      }
      // TODO(tibbe): consider if we want do define `keepDirtyValues` in some
      // other way e.g. try to reset the elements.
      const keepValue = keepDirtyValues && dirtyBits.current.isAnyTrue;
      // TODO(tibbe): Do we need to do anything except reset the children?
      if (!keepValue) {
        dirtyBits.current = BooleanObject.fromKeys(
          Object.keys(initialValue.current),
        );
        fieldErrors.current = ErrorObject.fromKeys(
          Object.keys(initialValue.current),
        );

        value.current = initialValue.current;

        setFields(
          Object.fromEntries(
            Object.keys(initialValue.current).map((key: keyof O) => [
              key,
              {
                control: {
                  context: key,
                  onChange: onChangeItem,
                  ref: (childRef: FieldRef<O[keyof O]>) => {
                    childRefs.current[key] = childRef;
                  },
                  initialValue: initialValue.current[key],
                  validationMode,
                },
              },
            ]),
          ) as unknown as UseFieldObjectReturn<O>['fields'],
        );

        // Since we changed e.g. `dirtyBits` we need to notify the parent as
        // otherwise optimizations in e.g. `onChangeItem` that assume that the
        // current state corresponds to what has been communicated to the parent
        // aren't valid.
        onChange(
          value.current,
          {
            isDirty: false,
            errors: fieldErrors.current.allErrors,
          },
          context,
        );

        Object.entries(childRefs.current).forEach(([key, childRef]) =>
          childRef?.reset(initialValue.current[key as keyof O]),
        );
      }
    },
    [context, onChange, onChangeItem, validationMode],
  );

  const setValue: FieldRefSetValue<{[P in keyof O]: O[P]}> = React.useCallback(
    (newValue: O, options) => {
      // Optimization: don't do anything if nothing changed.
      if (newValue === value.current) {
        return;
      }

      const prevValue = value.current;
      value.current = newValue;
      Object.entries(childRefs.current).forEach(([key, childRef]) => {
        // Optimization: don't do anything if nothing changed.
        const typedKey = key as keyof O;
        const newPropValue = newValue[typedKey];
        if (newPropValue === prevValue[typedKey]) {
          return;
        }

        childRef?.setValue(newPropValue, options);
      });
    },
    [],
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
