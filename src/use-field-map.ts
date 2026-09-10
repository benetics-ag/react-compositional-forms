import React from 'react';

import type {FieldErrors} from './field-errors';
import {Form} from './form';
import {expectMap, expectMapKey} from './internal/expect-value';
import {Composite} from './internal/form-descriptor';
import {JsonPrimitive} from './internal/path';
import {useComposite} from './use-composite';

export type UseFieldMapProps<K extends JsonPrimitive, V> = {
  /** Parent control. */
  control: Form<Map<K, V>>;

  /**
   * Validation function for the map as a whole — its size, say. Each entry
   * validates itself through its own control.
   */
  validate?: (value: Map<K, V>) => FieldErrors;
};

export type UseFieldMapField<V> = {
  /** Child control. */
  control: Form<V>;
};

export type UseFieldMapReturn<K extends JsonPrimitive, V> = {
  /** The control for each entry, in the map's iteration order. */
  fields: ReadonlyMap<K, UseFieldMapField<V>>;

  /** The map's own validation errors, excluding its entries'. */
  errors: FieldErrors;

  /** Add an entry, or replace the value of an existing one. */
  set: (key: K, value: V) => void;

  /** Remove the entry at `key`, if any. */
  delete: (key: K) => void;

  /** Remove every entry. */
  clear: () => void;
};

const decompose = <K extends JsonPrimitive, V>(
  value: Map<K, V>,
): Iterable<readonly [K, V]> => {
  expectMap('useFieldMap', value);
  for (const key of value.keys()) expectMapKey('useFieldMap', key);
  return value.entries();
};

const build = <K extends JsonPrimitive, V>(
  children: Iterable<readonly [K, V]>,
): Map<K, V> => new Map(children);

/**
 * Decompose a map form into one form per entry. The map is dirty when any entry
 * is dirty or its key set differs from the initial one; an entry added past the
 * initial key set is itself clean until edited, even while the map is dirty for
 * having grown. Keys are strings, finite numbers, booleans, or `null`.
 */
export const useFieldMap = <K extends JsonPrimitive, V>({
  control: form,
  validate,
}: UseFieldMapProps<K, V>): UseFieldMapReturn<K, V> => {
  const descriptor: Composite<Map<K, V>, K, V> = {decompose, build, validate};
  const {children, errors} = useComposite(form, descriptor);

  const fields = React.useMemo(
    () => new Map(children.map(({key, control}) => [key, {control}] as const)),
    [children],
  );

  const set = React.useCallback(
    (key: K, value: V) => {
      form.setValue(prev => new Map(prev).set(key, value), 'subtree');
    },
    [form],
  );

  const del = React.useCallback(
    (key: K) => {
      form.internal.restructure<K>(prev => {
        if (!prev.has(key)) return null;
        const next = new Map(prev);
        next.delete(key);
        return {value: next, remap: k => (k === key ? null : k)};
      });
    },
    [form],
  );

  const clear = React.useCallback(() => {
    form.internal.restructure<K>(prev =>
      prev.size === 0 ? null : {value: new Map(), remap: () => null},
    );
  }, [form]);

  return {clear, delete: del, errors, fields, set};
};
