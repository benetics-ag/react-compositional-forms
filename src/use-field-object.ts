import React from 'react';

import {Form} from './form';
import {expectPlainObject} from './internal/expect-value';
import {Composite} from './internal/form-descriptor';
import {useComposite} from './use-composite';

declare const dictionaryKeys: unique symbol;

// The brand puts the pointer to `useFieldMap` into the compiler's message.
type DictionaryIsAMap = {
  readonly [dictionaryKeys]: 'a dictionary is a Map; use useFieldMap';
};
type FixedKeys<O> = string extends keyof O
  ? DictionaryIsAMap
  : number extends keyof O
    ? DictionaryIsAMap
    : unknown;

export type UseFieldObjectProps<O extends object> = {
  /** Parent control; its value's keys must be known at the type level. */
  control: Form<O> & FixedKeys<O>;
};

export type UseFieldObjectField<T> = {
  /** Child control. */
  control: Form<T>;
};

export type UseFieldObjectReturn<O extends object> = {
  /** A {@link Control} object for each child field. */
  fields: {[P in keyof O]: UseFieldObjectField<O[P]>};
};

const decompose = <O extends {[prop: string]: unknown}>(
  value: O,
): Iterable<readonly [string, unknown]> => {
  expectPlainObject('useFieldObject', value);
  return Object.entries(value);
};

const build = <O extends {[prop: string]: unknown}>(
  children: Iterable<readonly [string, unknown]>,
): O => Object.fromEntries(children) as O;

/**
 * Decompose an object form into one form per key. The object is dirty when
 * any child is dirty; it carries no validation of its own (children validate
 * themselves).
 */
export const useFieldObject = <O extends {[prop: string]: unknown}>({
  control: form,
}: UseFieldObjectProps<O>): UseFieldObjectReturn<O> => {
  const descriptor: Composite<O, string, unknown> = {decompose, build};
  const {children} = useComposite(form, descriptor);

  const fields = React.useMemo(() => {
    const out: Record<string, UseFieldObjectField<unknown>> = {};
    for (const {key, control} of children) out[key] = {control};
    // The children are typed `unknown` in the shared derivation; an object's
    // per-key value types are recovered by this return type.
    return out as {[P in keyof O]: UseFieldObjectField<O[P]>};
  }, [children]);

  return {fields};
};
