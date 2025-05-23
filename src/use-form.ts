import React from 'react';

import {
  Control,
  FieldRef,
  InternalFieldState,
  ResetOptions,
  SetValueOptions,
} from './control';
import {FieldError, NO_FIELD_ERRORS} from './field-errors';
import {useEventCallback} from './use-event-callback';

// -----------------------------------------------------------------------------
// useForm

export type UseFormProps<T> = {
  /** The initial value of the form. */
  initialValue: T;

  /**
   * Validation strategy.
   *
   * - `"onBlur"`: Validation is triggered on the `onBlur` event.
   * - `"onChange"`: Validation is triggered on the `onChange` event.
   *
   * @default "onChange"
   */
  mode?: 'onBlur' | 'onChange';
};

export type FormState = {
  /**
   * The current validation errors of the form.
   *
   * Empty if the form is valid.
   */
  errors: Set<FieldError>;

  /** True if any field is dirty, otherwise false. */
  isDirty: boolean;

  /**
   * Set to `true` after the form is submitted.
   *
   * Will remain `true` until the `reset` method is invoked. */
  isSubmitted: boolean;

  /**
   * Indicate the form was successfully submitted without any errors.
   *
   * Both validation errors and exceptions raised by the `onValid` argument to
   * `handleSubmit` count as errors.
   *
   * Initially `false` and set after each call to `handleSubmit`.
   */
  isSubmitSuccessful: boolean;

  /** True if the form is currently submitting, otherwise false. */
  isSubmitting: boolean;

  /** True if `errors.size === 0`, otherwise false. */
  isValid: boolean;
};

export type UseFormGetValues<T> = () => T;

export type SubmitHandler<T> = (
  data: T,
  event?: React.BaseSyntheticEvent,
) => void | Promise<void>;

export type SubmitErrorHandler = (
  /** Non-empty set of validation errors. */
  errors: Set<FieldError>,
  event?: React.BaseSyntheticEvent,
) => void | Promise<void>;

export type UseFormHandleSubmit<T> = (
  /** Function called if the form state is valid. */
  onValid: SubmitHandler<T>,

  /** Function called if the form state is invalid. */
  onInvalid?: SubmitErrorHandler,
) => (e?: React.BaseSyntheticEvent) => Promise<void>;

/**
 * Setter for the form value.
 *
 * Can either be used to set the value directly or to update the value based on
 * the previous value.
 */
export type UseFormSetValue<T> = (
  newValue: T | ((prevValue: T) => T),
  options?: SetValueOptions,
) => void;

export type UseFormReturn<T> = {
  /** Passed to a field to connect it to the form. */
  control: Control<T>;

  /** The current state of the form. */
  formState: FormState;

  /**
   * Equivalent of `value`.
   *
   * TODO(tibbe): Remove.
   */
  getValues: UseFormGetValues<T>;

  /**
   * Function that creates a function that can be used to submit the form.
   *
   * When the returned function is called, validation is performed on all fields
   * and if all fields are valid, the `onValid` function is called with the
   * current value of the form. If any field is invalid, the `onInvalid`
   * function is called with the set of errors.
   */
  handleSubmit: UseFormHandleSubmit<T>;

  /** Reset the form to its intial value. */
  reset: (value?: T, options?: ResetOptions) => void;

  /** Set the value of the form. */
  setValue: UseFormSetValue<T>;

  /** Manually trigger validation of all fields. */
  trigger: () => void;

  /** The current value of the form. */
  value: T;
};

export const useForm = <T>({
  initialValue: initialInitialValue,
  mode = 'onChange',
}: UseFormProps<T>): UseFormReturn<T> => {
  const [value, setValue] = React.useState(initialInitialValue);
  const [isDirty, setIsDirty] = React.useState(false);
  const [errors, setErrors] = React.useState(NO_FIELD_ERRORS);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);
  const [isSubmitSuccessful, setIsSubmitSuccessful] = React.useState(false);
  const isValid = React.useMemo(() => errors.size === 0, [errors]);
  // On `reset` we might change the initial value and thus we need a local copy.
  const [initialValue, setInitialValue] = React.useState(initialInitialValue);

  type OnChange = (newValue: T, newFieldState: InternalFieldState) => void;
  const onChange: OnChange = React.useCallback(
    (newValue, {isDirty: newIsDirty, errors: newErrors}) => {
      setValue(newValue);
      setIsDirty(newIsDirty);
      setErrors(newErrors);
    },
    [],
  );

  const ref = React.useRef<FieldRef<T> | null>(null);
  const control = React.useMemo(
    () => ({
      onChange,
      ref,
      initialValue,
      value,
      validationMode: mode,
    }),
    [onChange, initialValue, value, mode],
  );

  const setValueMethod: UseFormSetValue<T> = React.useCallback(
    (newValueOrFn, options) => {
      const newValue =
        typeof newValueOrFn === 'function'
          ? (newValueOrFn as (prevValue: T) => T)(value)
          : newValueOrFn;
      // Workaround: we might see multiple calls to `setValue` before the child
      // responds with `onChange` in case the leaf `Field` hasn't been created
      // yet. We need to update the value immediately.
      setValue(newValue);
      ref.current?.setValue(newValue, options);
    },
    [value],
  );

  const getValues = React.useCallback(() => value, [value]);

  const handleSubmit: UseFormHandleSubmit<T> = React.useCallback(
    (onValid, onInvalid) => async (e?: React.BaseSyntheticEvent) => {
      setIsSubmitting(true);
      setIsSubmitSuccessful(false);
      try {
        if (e) {
          e.preventDefault?.();
          e.persist?.();
        }
        const allErrors = ref.current?.validate() ?? NO_FIELD_ERRORS;
        if (allErrors.size === 0) {
          await onValid(value, e);
          setIsSubmitSuccessful(true);
        } else if (onInvalid) {
          await onInvalid(allErrors, e);
        }
      } finally {
        setIsSubmitting(false);
        setIsSubmitted(true);
      }
    },
    [value],
  );

  const reset = useEventCallback((newValue?: T, options?: ResetOptions) => {
    setIsSubmitted(false);
    setIsSubmitSuccessful(false);
    if (newValue !== undefined) {
      setInitialValue(newValue);
    }
    const updatedValue = ref.current?.reset(newValue, options) ?? initialValue;
    setValue(updatedValue);
  });

  const formState = React.useMemo(
    () => ({
      errors,
      isDirty,
      isSubmitted,
      isSubmitSuccessful,
      isSubmitting,
      isValid,
    }),
    [errors, isDirty, isSubmitSuccessful, isSubmitted, isSubmitting, isValid],
  );

  const trigger = React.useCallback(() => {
    ref.current?.validate();
  }, []);

  return React.useMemo(
    () => ({
      control,
      formState,
      getValues,
      handleSubmit,
      reset,
      setValue: setValueMethod,
      trigger,
      value,
    }),
    [
      control,
      formState,
      getValues,
      handleSubmit,
      reset,
      setValueMethod,
      trigger,
      value,
    ],
  );
};
