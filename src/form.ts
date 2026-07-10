/**
 * A handle to one value being edited at a position in a form tree — the whole
 * value at the root, or an object, array, or leaf within it. Read its current
 * value and derived state (errors, dirtiness) through the getters; write it,
 * reset it, and validate it through the methods.
 *
 * A `Form` is a lightweight handle, not a stateful object: recreate it as often
 * as you like (a fresh one per render is fine) and hold several to the same
 * position at once. Extending the library with new form types goes through
 * {@link Form.internal}.
 */

import type {FieldErrors} from './field-errors';
import {childPath, keyOf, Path, ROOT, Segment} from './internal/path';
import {FormDescriptor} from './internal/form-descriptor';
import {FormStore, ValidateScope, ValidationMode} from './internal/store';

export interface Form<T> {
  /** This form's current value. */
  readonly value: T;

  /** This form's initial value; dirtiness is difference from it. */
  readonly initialValue: T;

  /** Whether this form's subtree differs from its initial value. */
  readonly isDirty: boolean;

  /** The errors at and below this form. */
  readonly errors: FieldErrors;

  /** This form's own errors, excluding its descendants'. */
  readonly ownErrors: FieldErrors;

  /** When this form's validators run. */
  readonly validationMode: ValidationMode;

  /** Write this form's value; `validateScope` selects how far validation runs. */
  setValue(next: T, validateScope?: ValidateScope): void;

  /** Write this form's initial value (the dirtiness baseline). */
  setInitialValue(next: T): void;

  /**
   * Signal a blur at this form. In `onBlur` validation mode this validates this
   * form and its ancestors; in `onChange` mode it does nothing.
   */
  onBlur(): void;

  /**
   * Reset this subtree to `value` — any value, including `undefined` — making it
   * the new initial value and clearing the subtree's errors; returns `value`.
   */
  reset(value: T, keepDirtyValues: boolean): T;

  /**
   * Reset this subtree to its current initial value, clearing the subtree's
   * errors; returns that value.
   */
  resetToInitial(keepDirtyValues: boolean): T;

  /** Validate this form's subtree now; returns the aggregate errors. */
  validate(): FieldErrors;

  /**
   * Only needed when extending the library with new form types: the surface a
   * combinator uses to decompose this form into children and declare how it
   * behaves. Code that only reads and writes a form ignores this.
   */
  readonly internal: FormInternal<T>;
}

/**
 * The privileged surface a combinator uses to implement a form type, reached
 * through {@link Form.internal}. Not part of the everyday read/write API.
 */
export interface FormInternal<T> {
  /** The store backing the root this form belongs to. */
  readonly store: FormStore;

  /** This form's position in the tree. */
  readonly path: Path;

  /**
   * Build the `Form` for the child at `key`. A combinator calls this to hand
   * each of its children a `Form` of its own: `read` extracts the child's value
   * from this form's value, and `write` produces a new value of this form with
   * one child's value replaced. The child lives one level deeper in the tree.
   */
  child<S>(key: Segment, read: (t: T) => S, write: (t: T, s: S) => T): Form<S>;

  /**
   * Declare how this form behaves — its validator, value equality, and how it
   * decomposes into children. A combinator calls this to teach the store about
   * the kind of form it implements; see {@link FormDescriptor}.
   */
  register(descriptor: FormDescriptor<T>): void;

  /** Reindex this form's children by mapping each key to its new key (or `null` to drop). */
  remapChildren(remap: (key: Segment) => Segment | null): void;
}

export function makeForm<T>(
  store: FormStore,
  path: Path,
  read: (root: unknown) => T,
  write: (root: unknown, value: T) => unknown,
): Form<T> {
  return {
    get value() {
      return read(store.getSnapshot().value);
    },
    get initialValue() {
      return read(store.getSnapshot().initialValue);
    },
    get isDirty() {
      return store.getSnapshot().dirtyPrefixes.has(keyOf(path));
    },
    get errors() {
      return store.aggregateErrorsAt(path);
    },
    get ownErrors() {
      return store.ownErrorsAt(path);
    },
    get validationMode() {
      return store.mode;
    },

    setValue(next, validateScope = 'up') {
      const root = store.getSnapshot().value;
      store.setValue(path, write(root, next), validateScope);
    },
    setInitialValue(next) {
      const root = store.getSnapshot().initialValue;
      store.setInitialValue(write(root, next));
    },
    onBlur() {
      store.onBlur(path);
    },
    reset(value, keepDirtyValues) {
      store.resetForm(
        path,
        read as (root: unknown) => unknown,
        write as (root: unknown, s: unknown) => unknown,
        value,
        keepDirtyValues,
      );
      return value;
    },
    resetToInitial(keepDirtyValues) {
      const value = read(store.getSnapshot().initialValue);
      store.resetForm(
        path,
        read as (root: unknown) => unknown,
        write as (root: unknown, s: unknown) => unknown,
        value,
        keepDirtyValues,
      );
      return value;
    },
    validate() {
      return store.validateSubtree(path);
    },

    internal: {
      store,
      path,
      child(key, childRead, childWrite) {
        return makeForm(
          store,
          childPath(path, key),
          root => childRead(read(root)),
          (root, s) => write(root, childWrite(read(root), s)),
        );
      },
      register(descriptor) {
        store.register(
          path,
          read as (root: unknown) => unknown,
          descriptor as unknown as FormDescriptor,
        );
      },
      remapChildren(remap) {
        store.remapChildren(path, remap);
      },
    },
  };
}

export function createRootForm<T>(
  initialValue: T,
  mode: ValidationMode,
): Form<T> {
  const store = new FormStore(initialValue, mode);
  return makeForm<T>(
    store,
    ROOT,
    root => root as T,
    (_root, v) => v,
  );
}
