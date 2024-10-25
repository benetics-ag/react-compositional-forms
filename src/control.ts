// -----------------------------------------------------------------------------
// Control

import {FieldError} from './field-errors';

export type InternalFieldState = {
  errors: Set<FieldError>;
  isDirty: boolean;
};

type ControlOnChange<T, C> = (
  newValue: T,
  fieldState: InternalFieldState,
  context: C,
) => void;

export type ResetOptions = {
  /** If true keep values in fields that were dirty before the reset. */
  keepDirtyValues: boolean;
};

export type SetValueOptions = {
  /**
   * Which event to mimic.
   *
   * - If `onChange` then the value will be changed as-if `onChange` was called.
   * - If `onBlur` then the value will be changed as-if `onChange` was called
   *   followed by a call to `onBlur`.
   * - If `set` then the value will simply be set and no validation will happen.
   *   The `dirty` state is still updated.
   *
   * @default 'onChange'
   */
  mode?: 'onChange' | 'onBlur' | 'set';
};

export type FieldRefSetValue<T> = (value: T, options?: SetValueOptions) => void;

/**
 * Imperative API for a field.
 */
export type FieldRef<T> = {
  /**
   * Reset the field and any child fields to their initial value.
   *
   * If `value` is provided, the initial value is first set to `value`.
   */
  reset: (value?: T, options?: ResetOptions) => void;

  /**
   * Set the value of the field.
   *
   * Triggers a validation of the field.
   *
   * @param value the new value of the field.
   */
  setValue: FieldRefSetValue<T>;

  /**
   * Trigger a validation of the field.
   *
   * @returns The set of errors after validation.
   */
  validate: () => void;
};

// TODO(tibbe): Ideally we'd use existential quantification instead of `any` in
// the definition of `Control` for improved type safety but TypeScript doesn't
// support that yet (https://github.com/Microsoft/TypeScript/issues/14466).
// Ideally we'd write something like:
//
// export type Control<T> = <exists C>{
//   context: C;
//   onChange: ControlOnChange<T, C>;
//   // ...
// };
//
// `C` being the existential type variable.
//
// There is a workaround using continuations
// (https://github.com/Microsoft/TypeScript/issues/14466#issuecomment-338045331)
// but it's not very readable and introduces an additional wrapping function
// that that might or might not interfer with `React.memo`.

/**
 * Internal form state used to connect parent and child forms.
 *
 * All fields on this type should be considered private and subject to change.
 */
export type Control<T> = {
  /** An opaque context that should be passed to {@link Control.onChange}. */
  context: any;

  /** Called by child to tell parent its state has changed. */
  onChange: ControlOnChange<T, any>;

  /** A ref for the child to set */
  ref?: React.Ref<FieldRef<T>>;

  /** The initial value of the child field in the form. */
  initialValue: T;

  /** See {@link UseFormProps.mode} */
  validationMode: 'onBlur' | 'onChange';
};
