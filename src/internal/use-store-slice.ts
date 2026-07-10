/**
 * The React bindings between a form's store and a component.
 *
 * {@link useFormSlice} subscribes a component to a derived view of one form and
 * re-renders it only when that view changes; {@link useRegisterDescriptor}
 * keeps a form's descriptor registered with the store for as long as the
 * component is mounted. The hooks in the public API are built on these two.
 */

import React from 'react';

import type {FieldErrors} from '../field-errors';
import {fieldErrorSetsDeepEqual} from '../field-errors';
import {Form} from '../form';
import {ChildRef, Composite, FormDescriptor, Leaf} from './form-descriptor';
import {Json, keyOf} from './path';
import {Snapshot} from './store';

/**
 * Subscribe to a value derived from a form, re-rendering only when that value
 * changes by `isEqual`. `project` reads from the current snapshot; its result is
 * cached and re-derived only when the snapshot changes. Because an unedited
 * subtree keeps its references across snapshots, a projection over a part the
 * edit didn't touch compares equal and the component is left alone.
 */
export function useFormSlice<T, S>(
  form: Form<T>,
  project: () => S,
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
    // The cached slice is valid only while both the snapshot and the form it
    // was projected from are unchanged. Rebinding to a different form (a new
    // position in the tree) with no intervening store edit leaves the snapshot
    // identical, so the snapshot alone cannot detect the change.
    if (prev && prev.snapshot === snapshot && prev.form === form) {
      return prev.value;
    }
    const value = project();
    if (prev && isEqual(prev.value, value)) {
      last.current = {snapshot, form, value: prev.value};
      return prev.value;
    }
    last.current = {snapshot, form, value};
    return value;
  };
  return React.useSyncExternalStore(store.subscribe, getSlice, getSlice);
}

/**
 * Build a `Form` handle for each child of a composite from its `decompose` and
 * `build`.
 *
 * Each child's read is its {@link ChildRef.read}; its write rebuilds the parent
 * with that one child replaced — decompose the parent, swap the child at its
 * key, build. Both run against the live parent value, so a handle stays correct
 * as the value changes.
 */
export function childForms<T, Key extends Json, Child>(
  form: Form<T>,
  decompose: (value: T) => Iterable<ChildRef<T, Key, Child>>,
  build: (children: Iterable<readonly [Key, Child]>) => T,
  value: T,
): {key: Key; control: Form<Child>}[] {
  return [...decompose(value)].map(ref => {
    const pathKey = keyOf([ref.key]);
    return {
      key: ref.key,
      control: form.internal.child<Child>(ref.key, ref.read, (parent, child) =>
        build(
          [...decompose(parent)].map(
            r =>
              [
                r.key,
                keyOf([r.key]) === pathKey ? child : r.read(parent),
              ] as const,
          ),
        ),
      ),
    };
  });
}

/** Deep-equal comparison for error sets, for use as a slice `isEqual`. */
export function errorSetsEqual(a: FieldErrors, b: FieldErrors): boolean {
  return fieldErrorSetsDeepEqual(a, b);
}

/**
 * Keep `descriptor` registered for `form` while the component is mounted, and
 * unregister it on unmount. A `null` descriptor registers nothing. The
 * descriptor is re-registered after every commit, so a validator that closes
 * over fresh props replaces the one from the previous render.
 */
export function useRegisterDescriptor<
  T,
  Key extends Json = Json,
  Child = unknown,
>(form: Form<T>, descriptor: Leaf<T> | Composite<T, Key, Child> | null): void {
  // Re-register every render so a validator closing over fresh props replaces
  // the previous one. No cleanup here: re-registration overwrites in place, and
  // tearing the registration down between renders would unregister the form on
  // every commit. The descriptor is stored with its container's key/element
  // types erased, so cast to the erased form the store holds.
  React.useLayoutEffect(() => {
    if (!descriptor) return;
    form.internal.register(descriptor as unknown as FormDescriptor<T>);
  });

  // Unregister on a true unmount only — a `[]` effect, so it does not fire
  // between renders. This drops the form's stale errors, so a field removed while
  // invalid can't keep the form invalid.
  const {store, path} = form.internal;
  React.useLayoutEffect(
    () => () => store.unregister(path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
