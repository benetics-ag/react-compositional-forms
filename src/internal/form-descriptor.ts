/**
 * Describing a kind of form.
 *
 * A *form* is a value being edited at one position in a form tree: the whole
 * record at the root, an object partway down, an array, a single text field at a
 * leaf. To support a kind of value — an object, an array, a `Set`, a date, a
 * domain object — write a {@link FormDescriptor} for it and register it on the
 * form with `form.internal.register(descriptor)`.
 *
 * A descriptor answers, for one form:
 *
 *   - Whether the form decomposes into child forms, and into which.
 *     ({@link FormDescriptor.decompose}.) A form with children is a *composite*; a
 *     form with none is a *leaf*. Editing, validation, and reset reach a child
 *     through its parent's decomposition.
 *   - Whether the form's own value is unchanged, apart from its children — value
 *     equality for a leaf, structural identity for a collection (an array's
 *     length, a map's keys). ({@link FormDescriptor.equals}.)
 *   - How to rebuild the value when only part of it is reset.
 *     ({@link FormDescriptor.rebuild}.)
 *   - Whether the value is valid. ({@link FormDescriptor.validate}.)
 *
 * See {@link FormDescriptor} for a worked example.
 */

import {FieldError} from '../field-errors';
import {Segment} from './path';

/** Validate a value, returning its errors (empty when valid). */
export type Validator<T> = (value: T) => Set<FieldError>;

/** Decide whether two values of a form are equal, for its dirtiness check. */
export type Equals<T> = (a: T, b: T) => boolean;

/**
 * One child a composite form decomposes into: its `segment`, the child's identity
 * under its parent, and `read`, which extracts the child's value from the
 * parent's value.
 *
 * `T` is the parent value's type. It appears only in `read`'s parameter — the
 * child's value type is erased to `unknown` — so that `decompose: (value: T) =>
 * ChildRef<T>[]` types each `read` to receive the value it decomposed.
 */
export type ChildRef<T = unknown> = {
  readonly segment: Segment;
  readonly read: (parentValue: T) => unknown;
};

/**
 * What a combinator tells the library about one kind of form. The fields are
 * independent and all optional: supplying none describes a plain leaf compared
 * with `Object.is`; a leaf overrides `equals`/`validate` as needed; a composite
 * additionally supplies `decompose` and `rebuild`. The library reads `decompose`
 * to tell leaf from composite and does not enforce the pairing, so supplying a
 * coherent set is the combinator's responsibility.
 *
 * @example
 * // A leaf holding a Date, dirty when the instant changes:
 * const dateForm: FormDescriptor<Date> = {
 *   equals: (a, b) => a.getTime() === b.getTime(),
 * };
 *
 * @example
 * // A composite: an object that splits into its keys and rebuilds from them.
 * const objectForm: FormDescriptor<Record<string, unknown>> = {
 *   decompose: obj =>
 *     Object.keys(obj).map(k => ({segment: k, read: o => o[k]})),
 *   equals: () => true, // no own value beyond its children
 *   rebuild: (current, initial, reset, child) => {
 *     // Take the reset value's key set, falling back to the current keys when
 *     // there is no reset value at this position.
 *     const out: Record<string, unknown> = {};
 *     for (const k of Object.keys(reset ?? current)) {
 *       out[k] = child(k, current[k], initial?.[k], reset?.[k]);
 *     }
 *     return out;
 *   },
 * };
 */
export interface FormDescriptor<T = unknown> {
  /**
   * The form's child forms, extracted from its value. A leaf omits this (or
   * returns no children); a composite returns one {@link ChildRef} per child.
   */
  readonly decompose?: (value: T) => readonly ChildRef<T>[];

  /**
   * This form's own equality, ignoring its children: whether two of its values
   * are the same apart from anything the children own. Defaults to `Object.is`.
   *
   * A leaf overrides it for a value compared by more than reference — a `Set`, a
   * `Date`, a domain object. A composite must override it too: an object
   * carrying no own value beyond its children uses `() => true`; a collection
   * uses its structural identity — an array its length, a map its key set. (A
   * composite's value object is rebuilt on each edit, so the default `Object.is`
   * would never hold.)
   */
  readonly equals?: Equals<T>;

  /**
   * Rebuild the form's value for a partial (`keepDirtyValues`) reset, in which a
   * changed child keeps its current value and an unchanged child takes the reset
   * value. Reconstruct the value from the children, deciding each one with
   * `child(segment, childCurrent, childInitial, childReset)` — which applies the
   * same keep-or-reset rule one level down and returns that child's value.
   * `initialValue` and `resetValue` are `undefined` when the form has none.
   */
  readonly rebuild?: (
    value: T,
    initialValue: T | undefined,
    resetValue: T | undefined,
    child: (
      segment: Segment,
      childCurrent: unknown,
      childInitial: unknown,
      childReset: unknown,
    ) => unknown,
  ) => T;

  /** Validate the form's value, returning its errors (empty when valid). */
  readonly validate?: Validator<T>;
}
