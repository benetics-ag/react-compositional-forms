/**
 * The React bindings between a form's store and a component.
 *
 * {@link useFormSlice} subscribes a component to a view derived from one form
 * and re-renders it only when that view changes; {@link useRegisterDescriptor}
 * keeps a form's descriptor registered with the store for as long as the
 * component is mounted. The hooks in the public API are built on these two.
 */

import React from 'react';

import type {FieldErrors} from '../field-errors';
import {fieldErrorSetsDeepEqual} from '../field-errors';
import {Form} from '../form';
import {FormDescriptor} from './form-descriptor';
import {Registration, Snapshot} from './store';

/** A form's state as one render sees it. */
export type FormView<T> = {
  /** The form's current value. */
  readonly value: T;

  /** Whether the form's subtree differs from its initial value. */
  readonly isDirty: boolean;

  /** The errors at and below the form. */
  readonly errors: FieldErrors;

  /** The form's own errors, excluding its descendants'. */
  readonly ownErrors: FieldErrors;
};

// Getters, so a projection pays only for the members it reads.
class View<T> implements FormView<T> {
  constructor(
    private readonly form: Form<T>,
    readonly value: T,
  ) {}

  get isDirty(): boolean {
    return this.form.internal.isDirty();
  }

  get errors(): FieldErrors {
    return this.form.internal.errors();
  }

  get ownErrors(): FieldErrors {
    return this.form.internal.ownErrors();
  }
}

/**
 * Subscribe the calling component to a projection of a form's state, and
 * re-render it only when that projection changes by `isEqual`. An edit
 * elsewhere in the tree leaves a projection unchanged, so the component is left
 * alone.
 *
 * A component may outlive the position it projects from: the last projection
 * stands until it unmounts. Mounting with a position the tree does not hold is
 * an error, since there is nothing to project.
 */
export function useFormSlice<T, S>(
  form: Form<T>,
  project: (view: FormView<T>) => S,
  isEqual: (a: S, b: S) => boolean,
): S {
  const {store} = form.internal;
  const last = React.useRef<{
    snapshot: Snapshot;
    form: Form<T>;
    value: S;
  } | null>(null);
  const getSlice = (): S => {
    const snapshot = store.getSnapshot();
    const prev = last.current;
    // Rebinding to another position between renders changes the projection
    // without changing the snapshot.
    if (prev && prev.snapshot === snapshot && prev.form === form) {
      return prev.value;
    }
    const slot = form.internal.read();
    if (!slot.present) {
      if (prev === null) {
        throw new Error(
          `A component mounted with a Control whose position ` +
            `${JSON.stringify(form.internal.path)} the form tree no longer holds.`,
        );
      }
      last.current = {snapshot, form, value: prev.value};
      return prev.value;
    }
    const value = project(new View(form, slot.value));
    if (prev && isEqual(prev.value, value)) {
      last.current = {snapshot, form, value: prev.value};
      return prev.value;
    }
    last.current = {snapshot, form, value};
    return value;
  };
  return React.useSyncExternalStore(store.subscribe, getSlice, getSlice);
}

/** Deep-equal comparison for error sets, for use as a slice `isEqual`. */
export function errorSetsEqual(a: FieldErrors, b: FieldErrors): boolean {
  return fieldErrorSetsDeepEqual(a, b);
}

/** Equality of a form's derived state, for use as a slice `isEqual`. */
export function fieldStateEqual(
  a: {readonly isDirty: boolean; readonly errors: FieldErrors},
  b: {readonly isDirty: boolean; readonly errors: FieldErrors},
): boolean {
  return a.isDirty === b.isDirty && errorSetsEqual(a.errors, b.errors);
}

/**
 * Declare `descriptor` for `form` on the calling component's behalf, for as long
 * as it stays mounted: the descriptor of its latest render is the one in force,
 * and `null` declares nothing. The declaration is withdrawn when the component
 * unmounts, whatever position the form has moved to by then.
 */
export function useRegisterDescriptor<T>(
  form: Form<T>,
  descriptor: FormDescriptor<T> | null,
): void {
  const held = React.useRef<Registration | null>(null);
  const registration = (held.current ??= new Registration());

  // Unconditionally, since a descriptor closes over the props of the render it
  // came from.
  React.useLayoutEffect(() => {
    if (descriptor) form.internal.register(descriptor, registration);
    else form.internal.unregister(registration);
  });

  React.useLayoutEffect(
    () => () => form.internal.unregister(registration),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
