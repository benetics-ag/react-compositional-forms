import React from 'react';

import type {FieldErrors} from './field-errors';
import {Form} from './form';
import {FormDescriptor, Validator} from './internal/form-descriptor';
import {
  errorSetsEqual,
  useFormSlice,
  useRegisterDescriptor,
} from './internal/use-store-slice';

export type UseFieldArrayProps<T> = {
  /**
   * The {@link Control} object from the parent.
   */
  control: Form<T[]>;

  /**
   * Validation function that validates the field value.
   *
   * Use this for array-level validation, such as checking the length of the
   * array. Child field validation is handled by each child control.
   *
   * @param value The value to validate.
   * @returns A set of errors. If the set is empty the value is considered
   * valid.
   */
  validate?: (value: T[]) => FieldErrors;
};

export type UseFieldArrayField<T> = {
  /**
   * Control object to pass to the children.
   */
  control: Form<T>;
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
  errors: FieldErrors;

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
 * Combine child forms into an array. The array is dirty when any child is dirty
 * or its current length differs from its initial length. A child appended past
 * the initial length is itself clean (its initial value is the appended value),
 * even while the array is length-dirty. With `keepDirtyValues`, a reset keeps the
 * current length when it differs from the initial.
 */
export const useFieldArray = <T>({
  control: form,
  validate,
}: UseFieldArrayProps<T>): UseFieldArrayReturn<T> => {
  const value = useFormSlice(form, () => form.value, Object.is);
  const errors = useFormSlice(form, () => form.ownErrors, errorSetsEqual);

  const descriptor: FormDescriptor<T[]> = {
    validate: validate as Validator<T[]> | undefined,
    decompose: v => v.map((_x, i) => ({segment: i, read: a => a[i]})),
    equals: (a, b) => a.length === b.length,
    rebuild: (old, init, reset, recurse) => {
      const lengthDirty = (init?.length ?? 0) !== old.length;
      const targetLen = lengthDirty
        ? old.length
        : (reset?.length ?? old.length);
      const out: T[] = [];
      for (let i = 0; i < targetLen; i++) {
        // An element past the reset value's length keeps its current value (the
        // walk re-freezes its baseline to it).
        out[i] =
          reset && i < reset.length
            ? (recurse(i, old[i], init?.[i], reset[i]) as T)
            : old[i];
      }
      return out;
    },
  };
  useRegisterDescriptor(form, descriptor);

  const fields = React.useMemo(
    () =>
      value.map((_v, index) => ({
        control: form.internal.child(
          index,
          arr => arr[index],
          (arr, s) => {
            const next = arr.slice();
            next[index] = s;
            return next;
          },
        ),
      })),
    [form, value],
  );

  const append = React.useCallback(
    (initialItemValue: T) => {
      form.setValue([...form.value, initialItemValue], 'up');
    },
    [form],
  );

  const remove = React.useCallback(
    (index: number) => {
      const current = form.value;
      if (index < 0 || index >= current.length) return;
      // Shift per-child state down past the removed slot, then drop the value.
      form.internal.remapChildren(seg => {
        const n = seg as number;
        if (n < index) return n;
        if (n === index) return null;
        return n - 1;
      });
      form.setValue(
        current.filter((_, i) => i !== index),
        'up',
      );
    },
    [form],
  );

  return {append, errors, fields, remove};
};
