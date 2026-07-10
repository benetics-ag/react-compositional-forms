/**
 * Describing a kind of form.
 *
 * A *form* is a value being edited at one position in a form tree: the whole
 * record at the root, an object partway down, an array, a single text field at a
 * leaf. To support a kind of value — a `Set`, a `Map`, a date, a domain object —
 * write a {@link FormDescriptor} for it and register it on the form with
 * `form.internal.register(descriptor)`.
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
 * A composite decomposes into and builds from `(key, child)` pairs, so any
 * container fits: an array uses its indices as keys, an object its property
 * names, a `Map` its keys. `decompose` and `build` must round-trip — building
 * from what `decompose` produced returns an equal value.
 */

import type {FieldErrors} from '../field-errors';
import {Json} from './path';

/** Validate a value, returning its errors (empty when valid). */
export type Validator<T> = (value: T) => FieldErrors;

/** Decide whether two leaf values are equal, for its dirtiness check. */
export type Equals<T> = (a: T, b: T) => boolean;

/**
 * One child a composite decomposes into: its `key` and its `read`. The `key` is
 * the child's identity under its parent — any JSON value. `read` projects the
 * child's value out of a parent value; it is written against the key, not a
 * captured value, so the same {@link ChildRef} reads its child out of any parent
 * value of that shape, not only the one it was decomposed from.
 */
export type ChildRef<T, Key extends Json, Child> = {
  readonly key: Key;
  readonly read: (parentValue: T) => Child;
};

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
  readonly equals?: Equals<T>;

  /** Validate the value, returning its errors (empty when valid). */
  readonly validate?: Validator<T>;
};

/**
 * A form whose value is a container of child forms, each under a JSON key.
 *
 * `decompose` takes a value apart into its `(key, read)` children; `build`
 * assembles a value from `(key, child)` pairs. The two must round-trip.
 * Dirtiness and reset derive from these plus the key structure — a composite is
 * dirty when a child is or its key set differs from its initial — so it supplies
 * no `equals` of its own.
 *
 * `Key` and `Child` are the container's key and element types — `number`/`T` for
 * an array of `T`, `K`/`V` for a `Map<K, V>`. A heterogeneous container (an
 * object whose properties differ in type) uses `Child = unknown`.
 *
 * @example
 * // An object that splits into its keys and rebuilds from them:
 * const objectForm: Composite<Record<string, unknown>, string, unknown> = {
 *   decompose: obj =>
 *     Object.keys(obj).map(k => ({key: k, read: o => o[k]})),
 *   build: entries => Object.fromEntries(entries),
 * };
 */
export type Composite<T, Key extends Json, Child> = {
  /** Take a value apart into its children, each a `(key, read)` pair. */
  readonly decompose: (value: T) => Iterable<ChildRef<T, Key, Child>>;

  /**
   * Assemble a value from `(key, child)` pairs. The pairs' key set may differ
   * from any current value's — a reset can add or drop an element — so `build`
   * reconstructs from the pairs it is given rather than editing a value in place.
   */
  readonly build: (children: Iterable<readonly [Key, Child]>) => T;

  /** Validate the value, returning its errors (empty when valid). */
  readonly validate?: Validator<T>;
};

/**
 * What a combinator tells the library about one kind of form: a {@link Leaf} or a
 * {@link Composite}. `FormDescriptor` erases the container's key and element types
 * to `Json`/`unknown` — one type spans forms of every shape — while a combinator
 * writes a `Leaf` or `Composite` at its precise `Key`/`Child` types and registers
 * that.
 */
export type FormDescriptor<T = unknown> = Leaf<T> | Composite<T, Json, unknown>;

/** Whether a descriptor describes a {@link Composite} (has children). */
export function isComposite<T>(
  descriptor: FormDescriptor<T>,
): descriptor is Composite<T, Json, unknown> {
  return 'decompose' in descriptor;
}
