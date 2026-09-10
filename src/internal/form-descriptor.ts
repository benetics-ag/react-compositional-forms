/**
 * Describing a kind of form.
 *
 * A *form* is a value being edited at one position in a form tree: the whole
 * record at the root, an object partway down, an array, a single text field at a
 * leaf. Supporting a kind of value — a `Set`, a `Map`, a date, a domain object —
 * means writing a {@link FormDescriptor} for it: a {@link Composite} for a
 * container of child forms, a {@link Leaf} for a value edited whole.
 *
 * A form is either a {@link Leaf} or a {@link Composite}:
 *
 *   - A **Leaf** is edited as one opaque value. It says only how two of its
 *     values compare ({@link Leaf.equals}) and, optionally, whether a value is
 *     valid ({@link Leaf.validate}).
 *   - A **Composite** is a container of child forms, each under a JSON key. It
 *     says how a value takes apart into `(key, child)` pairs ({@link
 *     Composite.decompose}) and how such pairs assemble back into a value
 *     ({@link Composite.build}). Its dirtiness, validity, and reset all derive
 *     from its children plus that key structure; it needs no own equality,
 *     because a composite is dirty exactly when a child is or its key set has
 *     changed.
 *
 * The members are declared in method syntax so that a descriptor written at its
 * precise types is assignable to the erased `FormDescriptor` the store holds
 * for every form at once.
 */

import type {FieldErrors} from '../field-errors';
import {Json} from './path';

/**
 * A form edited as one opaque value, with no children.
 *
 * @example
 * // A Date leaf, dirty when the instant changes:
 * const dateForm: Leaf<Date> = {
 *   equals: (a, b) => a.getTime() === b.getTime(),
 * };
 */
export type Leaf<T> = {
  /**
   * Whether two of this leaf's values are equal, for its dirtiness check.
   * Defaults to `Object.is`. Override for a value compared by more than
   * reference — a `Date`, a `Set` held opaque, a domain object.
   */
  equals?(a: T, b: T): boolean;

  /** Validate the value, returning its errors (empty when valid). */
  validate?(value: T): FieldErrors;
};

/**
 * A form whose value is a container of child forms, each under a JSON key.
 *
 * `decompose` takes a value apart into its `(key, child)` pairs; `build`
 * assembles a value from such pairs. The two must round-trip: building from what
 * `decompose` produced returns an equal value. A child's identity is its key,
 * compared by JSON structure, so a container's children must have distinct keys.
 *
 * `Key` and `Child` are the container's key and element types — `number`/`T` for
 * an array of `T`, `K`/`V` for a `Map<K, V>`. A heterogeneous container (an
 * object whose properties differ in type) uses `Child = unknown`.
 *
 * @example
 * // An object that splits into its properties and rebuilds from them:
 * const objectForm: Composite<Record<string, unknown>, string, unknown> = {
 *   decompose: obj => Object.entries(obj),
 *   build: entries => Object.fromEntries(entries),
 * };
 */
export type Composite<T, Key extends Json, Child> = {
  /** Take a value apart into its `(key, child)` pairs. */
  decompose(value: T): Iterable<readonly [Key, Child]>;

  /**
   * Assemble a value from `(key, child)` pairs. The pairs' key set may differ
   * from any current value's — a reset can add or drop an element — so `build`
   * reconstructs from the pairs it is given rather than editing a value in place.
   */
  build(children: Iterable<readonly [Key, Child]>): T;

  /** Validate the value, returning its errors (empty when valid). */
  validate?(value: T): FieldErrors;
};

/**
 * What a combinator tells the library about one kind of form: a {@link Leaf} or a
 * {@link Composite}. The default type parameters are the erased form the store
 * holds, spanning forms of every shape.
 */
export type FormDescriptor<T = unknown> = Leaf<T> | Composite<T, Json, unknown>;

/** Whether a descriptor describes a {@link Composite} (has children). */
export function isComposite<T>(
  descriptor: FormDescriptor<T>,
): descriptor is Composite<T, Json, unknown> {
  return 'decompose' in descriptor;
}
