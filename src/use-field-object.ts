import React from 'react';

import {Form} from './form';
import {ChildRef, Composite} from './internal/form-descriptor';
import {
  childForms,
  useFormSlice,
  useRegisterDescriptor,
} from './internal/use-store-slice';

export type UseFieldObjectProps<O extends object> = {
  /** Parent control. */
  control: Form<O>;
};

export type UseFieldObjectField<T> = {
  /** Child control. */
  control: Form<T>;
};

export type UseFieldObjectReturn<O extends object> = {
  /** A {@link Control} object for each child field. */
  fields: {[P in keyof O]: UseFieldObjectField<O[P]>};
};

// The object as a container keyed by property name. Hoisted to module scope
// (they close over nothing) so the `fields` memo can depend on just
// [form, value] — inline definitions would be new references each render and
// rebuild it every time.
const decompose = <O extends {[prop: string]: unknown}>(
  value: O,
): ChildRef<O, string, unknown>[] =>
  Object.keys(value).map(k => ({key: k, read: o => o[k]}));

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
  useRegisterDescriptor(form, descriptor);

  // Re-render when this object's own value reference changes (a change anywhere
  // in its subtree); a sibling subtree's edit leaves it untouched.
  const value = useFormSlice(form, () => form.value, Object.is);

  const fields = React.useMemo(() => {
    const out: Record<string, UseFieldObjectField<unknown>> = {};
    for (const {key, control} of childForms(form, decompose, build, value)) {
      out[key] = {control};
    }
    // The children are typed `unknown` in the shared derivation; an object's
    // per-key value types are recovered by this return type.
    return out as {[P in keyof O]: UseFieldObjectField<O[P]>};
  }, [form, value]);

  return {fields};
};
