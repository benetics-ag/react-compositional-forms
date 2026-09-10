import React from 'react';

import type {FieldErrors} from './field-errors';
import {Form} from './form';
import {expectArray} from './internal/expect-value';
import {Composite} from './internal/form-descriptor';
import {useComposite} from './use-composite';

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

const decompose = <T>(value: T[]): Iterable<readonly [number, T]> => {
  expectArray('useFieldArray', value);
  return value.map((x, i) => [i, x] as const);
};

const build = <T>(children: Iterable<readonly [number, T]>): T[] => {
  const out: T[] = [];
  for (const [i, x] of children) out[i] = x;
  return out;
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
  const descriptor: Composite<T[], number, T> = {decompose, build, validate};
  const {children, errors} = useComposite(form, descriptor);

  const fields = React.useMemo(
    () => children.map(({control}) => ({control})),
    [children],
  );

  const append = React.useCallback(
    (initialItemValue: T) => {
      form.setValue(prev => [...prev, initialItemValue], 'up');
    },
    [form],
  );

  const remove = React.useCallback(
    (index: number) => {
      form.internal.restructure<number>(prev => {
        if (index < 0 || index >= prev.length) return null;
        return {
          value: prev.filter((_, i) => i !== index),
          remap: i => (i < index ? i : i === index ? null : i - 1),
        };
      });
    },
    [form],
  );

  return {append, errors, fields, remove};
};
