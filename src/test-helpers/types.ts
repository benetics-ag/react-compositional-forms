import {FieldError, FormState} from '..';

/** Allows for configuring the test behavior (e.g. buttons). */
export type TestProps<T> = {
  /**
   * Initial value passed to `useForm`.
   */
  initialValue?: T;

  /**
   * Called when the form state changes.
   *
   * The state is considered changed if `shallowEqual(formState, prevFormState)`
   * is false.
   */
  onFormStateChange?: (formState: FormState) => void;

  /**
   * New inital value passed to `reset` when the "reset" button is pressed.
   */
  resetNewInitialValue?: T;

  /**
   * Value passed to `setValue` when the "set value" button is pressed.
   */
  setValueValue?: T;

  setValueMode?: 'onBlur' | 'onChange' | 'set';

  validate?: (value: T) => Set<FieldError>;

  mode?: 'onBlur' | 'onChange';
};
