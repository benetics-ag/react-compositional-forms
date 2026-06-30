import React from 'react';

import {Form} from './form';
import {FormDescriptor} from './internal/form-descriptor';
import {useFormSlice, useRegisterDescriptor} from './internal/use-store-slice';

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

/**
 * Decompose an object form into one form per key. The object is dirty when
 * any child is dirty; it carries no validation of its own (children validate
 * themselves).
 */
export const useFieldObject = <O extends {[prop: string]: unknown}>({
  control: form,
}: UseFieldObjectProps<O>): UseFieldObjectReturn<O> => {
  const descriptor: FormDescriptor<O> = {
    // Iterate keys, not Object.entries: `read` projects from whatever object the
    // walk passes it — the current value or the baseline — not from `v`.
    decompose: v => Object.keys(v).map(k => ({segment: k, read: o => o[k]})),
    // An object carries no own value beyond its children, so it is dirty only
    // when a child is.
    equals: () => true,
    rebuild: (old, init, reset, recurse) => {
      // The rebuilt object takes the reset value's key set: a key the reset
      // adds appears, a key it drops is gone, a key in both is rebuilt from its
      // child. With no reset value at this position, keep the current keys.
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(reset ?? old)) {
        out[k] = recurse(k, old[k], init?.[k], reset?.[k]);
      }
      return out as O;
    },
  };
  useRegisterDescriptor(form, descriptor);

  // Re-render when this object's own value reference changes (a change anywhere
  // in its subtree); a sibling subtree's edit leaves it untouched.
  const value = useFormSlice(form, () => form.value, Object.is);

  const fields = React.useMemo(() => {
    const out = {} as {[P in keyof O]: UseFieldObjectField<O[P]>};
    for (const key of Object.keys(value) as (keyof O & string)[]) {
      out[key] = {
        control: form.internal.child(
          key,
          o => o[key],
          (o, s) => ({...o, [key]: s}),
        ),
      };
    }
    return out;
    // Each child form is a pure key projection; rebuild when the form
    // identity or the value changes.
  }, [form, value]);

  return {fields};
};
