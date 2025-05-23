// -----------------------------------------------------------------------------
// Control

import {FieldError} from './field-errors';

export type InternalFieldState = {
  errors: Set<FieldError>;
  isDirty: boolean;
};

export type ControlOnChange<T> = (
  newValue: T,
  fieldState: InternalFieldState,
) => void;

export type ResetOptions = {
  /**
   * If `true`, don't reset dirty fields' `value` and `errors`.
   *
   * The field's `initialValue` will still be reset. If the `initialValue` is
   * different from the current `value` the field will be marked as dirty.
   *
   * Kept values also keep their errors.
   */
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
   * Reset fields have no errors, just like when the form is first created.
   *
   * If `value` is provided, the initial value is first set to `value`.
   *
   * @returns The new value of the field.
   */
  reset: (value?: T, options?: ResetOptions) => T;

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

/**
 * Internal form state used to connect parent and child forms.
 *
 * All fields on this type should be considered private and subject to change.
 */
export type Control<T> = {
  /** Called by child to tell parent its state has changed. */
  onChange: ControlOnChange<T>;

  /** A ref for the child to set */
  ref?: React.Ref<FieldRef<T>>;

  /** The initial value of the child field in the form. */
  initialValue: T;

  /** See {@link UseFormProps.mode} */
  validationMode: 'onBlur' | 'onChange';

  /** The current value of the child field in the form. */
  value: T;
};
