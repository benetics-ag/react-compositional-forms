import React from 'react';

import type {FieldErrors} from './field-errors';
import {Form} from './form';
import {Composite} from './internal/form-descriptor';
import {Json} from './internal/path';
import {
  errorSetsEqual,
  useFormSlice,
  useRegisterDescriptor,
} from './internal/use-store-slice';

/** One child of a composite: its key, and the `Form` to hand its component. */
export type CompositeChild<Key, Child> = {
  readonly key: Key;
  readonly control: Form<Child>;
};

export type UseCompositeReturn<Key, Child> = {
  /** A child for each `(key, child)` pair the descriptor decomposes the value into, in that order. */
  readonly children: readonly CompositeChild<Key, Child>[];

  /** The composite's own validation errors, excluding its children's. */
  readonly errors: FieldErrors;
};

/**
 * Bind a composite form to a component: `descriptor` describes the form for as
 * long as the component stays mounted, and the calling component re-renders
 * when the form's children or its own errors change.
 *
 * `descriptor.decompose` and `descriptor.build` must keep their identities
 * across renders; define them outside the component.
 */
export function useComposite<T, Key extends Json, Child>(
  form: Form<T>,
  descriptor: Composite<T, Key, Child>,
): UseCompositeReturn<Key, Child> {
  useRegisterDescriptor(form, descriptor);

  const value = useFormSlice(form, view => view.value, Object.is);
  const {decompose, build} = descriptor;
  const structure = React.useMemo<Composite<T, Key, Child>>(
    () => ({decompose, build}),
    [decompose, build],
  );
  const children = React.useMemo(
    () => form.internal.children(structure, value),
    [form, structure, value],
  );

  const errors = useFormSlice(form, view => view.ownErrors, errorSetsEqual);

  return {children, errors};
}
