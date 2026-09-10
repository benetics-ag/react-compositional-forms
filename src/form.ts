/**
 * A handle to one value being edited at a position in a form tree — the whole
 * value at the root, or an object, array, or leaf within it.
 *
 * A handle names a position, not the value that stood there when it was made:
 * any two handles to one position are interchangeable. A position can cease to
 * exist, after which operations on a handle to it do nothing, and binding a
 * component to such a handle is an error.
 */

import type {FieldErrors} from './field-errors';
import {Composite, FormDescriptor} from './internal/form-descriptor';
import {pathOfSteps, step, Steps} from './internal/lens';
import {Json, Path} from './internal/path';
import {Slot} from './internal/slot';
import {
  FormStore,
  Registration,
  Restructure,
  ValidateScope,
  ValidationMode,
} from './internal/store';

export type {Registration, Restructure} from './internal/store';

export type ResetOptions = {
  /**
   * Keep the value and errors of every form in the subtree that differs from
   * its initial value; only the rest take the reset value.
   */
  keepDirtyValues?: boolean;
};

export interface Form<T> {
  /** When this form's validators run. */
  readonly validationMode: ValidationMode;

  /**
   * Write this form's value, either directly or as a function of its latest
   * value. `validateScope` selects how far validation runs.
   */
  setValue(next: T | ((prev: T) => T), validateScope?: ValidateScope): void;

  /** Write this form's initial value (the dirtiness baseline). */
  setInitialValue(next: T): void;

  /**
   * Signal a blur at this form. In `onBlur` validation mode this validates this
   * form and its ancestors; in `onChange` mode it does nothing.
   */
  onBlur(): void;

  /**
   * Reset this subtree to `value` — any value, including `undefined` — making it
   * the new initial value and clearing the subtree's errors.
   */
  reset(value: T, options?: ResetOptions): void;

  /**
   * Reset this subtree to its current initial value, clearing the subtree's
   * errors.
   */
  resetToInitial(options?: ResetOptions): void;

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
 * The surface a combinator uses to implement a form type, reached through
 * {@link Form.internal}.
 */
export interface FormInternal<T> {
  /** The store backing the root this form belongs to. */
  readonly store: FormStore;

  /** This form's position in the tree. */
  readonly path: Path;

  /** This form's current value, or absent when its position is gone. */
  read(): Slot<T>;

  /** Whether this form's subtree differs from its initial value. */
  isDirty(): boolean;

  /** The errors at and below this form. */
  errors(): FieldErrors;

  /** This form's own errors, excluding its descendants'. */
  ownErrors(): FieldErrors;

  /**
   * A `Form` for each child `descriptor` decomposes `value` into, in
   * decomposition order.
   */
  children<Key extends Json, Child>(
    descriptor: Composite<T, Key, Child>,
    value: T,
  ): readonly {readonly key: Key; readonly control: Form<Child>}[];

  /**
   * Declare how this form behaves; see {@link FormDescriptor}. A form has one
   * declaration per {@link Registration}, and its latest is the one in force.
   */
  register(descriptor: FormDescriptor<T>, registration: Registration): void;

  /**
   * Withdraw the declaration made through `registration`, wherever the form has
   * moved to since. A declaration another registration has replaced it with
   * stands.
   */
  unregister(registration: Registration): void;
  /**
   * Replace this composite's value and say where its children went, as one
   * edit. `edit` is given the latest value and returns the replacement together
   * with a `remap` from each existing child's key to the key it holds now, or to
   * `null` where the child is gone; returning `null` instead leaves the form
   * untouched. Each surviving child keeps its declaration, errors, and initial
   * value at its new key, and a child that is gone keeps none of them.
   *
   * @example
   * // Drop element `i`, shifting those after it down one:
   * form.internal.restructure<number>(prev => ({
   *   value: prev.filter((_, j) => j !== i),
   *   remap: j => (j < i ? j : j === i ? null : j - 1),
   * }));
   */
  restructure<Key extends Json>(
    edit: (prev: T) => Restructure<T, Key> | null,
  ): void;
}

// A position's type comes from the composite that decomposed into it, which the
// store does not track: it holds every position as `unknown`.
function typed<T>(slot: Slot): Slot<T> {
  return slot as Slot<T>;
}

function isUpdater<T>(next: T | ((prev: T) => T)): next is (prev: T) => T {
  return typeof next === 'function';
}

/**
 * The handle for the position `steps` leads to: one step per composite descended
 * through, each naming the child taken from it. The root of `store` is the
 * position no steps lead to.
 */
export function makeForm<T>(store: FormStore, steps: Steps): Form<T> {
  const path = pathOfSteps(steps);
  const read = () => typed<T>(store.readAt(steps));

  return {
    get validationMode() {
      return store.mode;
    },

    setValue(next, validateScope = 'up') {
      if (isUpdater(next)) {
        const current = read();
        if (!current.present) return;
        store.setValue(steps, next(current.value), validateScope);
      } else {
        store.setValue(steps, next, validateScope);
      }
    },
    setInitialValue(next) {
      store.setInitialValue(steps, next);
    },
    onBlur() {
      store.onBlur(steps);
    },
    reset(value, options) {
      store.resetForm(steps, value, options?.keepDirtyValues ?? false);
    },
    resetToInitial(options) {
      store.resetToInitial(steps, options?.keepDirtyValues ?? false);
    },
    validate() {
      return store.validateSubtree(path);
    },

    internal: {
      store,
      path,
      read,
      isDirty() {
        return store.isDirtyAt(path);
      },
      errors() {
        return store.aggregateErrorsAt(path);
      },
      ownErrors() {
        return store.ownErrorsAt(path);
      },
      children<Key extends Json, Child>(
        descriptor: Composite<T, Key, Child>,
        value: T,
      ) {
        const out: {key: Key; control: Form<Child>}[] = [];
        for (const [key] of descriptor.decompose(value)) {
          out.push({
            key,
            control: makeForm<Child>(store, [...steps, step(key, descriptor)]),
          });
        }
        return out;
      },
      register(descriptor, registration) {
        store.register(steps, descriptor, registration);
      },
      unregister(registration) {
        store.unregister(registration);
      },
      restructure(edit) {
        const current = read();
        if (!current.present) return;
        const next = edit(current.value);
        if (next === null) return;
        store.restructure(steps, next);
      },
    },
  };
}

export function createRootForm<T>(
  initialValue: T,
  mode: ValidationMode,
): Form<T> {
  return makeForm<T>(new FormStore(initialValue, mode), []);
}
