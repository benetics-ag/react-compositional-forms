import React from 'react';

import type {FieldErrors} from './field-errors';
import {Form, createRootForm} from './form';
import {ValidationMode} from './internal/store';
import {errorSetsEqual, useFormSlice} from './internal/use-store-slice';

export type SetValueOptions = {
  /**
   * Which event to mimic. `onChange` validates the written subtree; `onBlur`
   * and `set` write the value without validating.
   *
   * @default 'onChange'
   */
  mode?: 'onChange' | 'onBlur' | 'set';
};

export type ResetOptions = {
  /** Keep dirty fields' value and errors; only clean fields take the reset value. */
  keepDirtyValues?: boolean;
};

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
  mode?: ValidationMode;
};

export type FormState = {
  /**
   * The current validation errors of the form.
   *
   * Empty if the form is valid.
   */
  errors: FieldErrors;

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
  errors: FieldErrors,
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
  control: Form<T>;

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

  /**
   * Reset the form to `value` — any value, including `undefined` — making it the
   * new initial value and clearing the form's errors.
   */
  reset: (value: T, options?: ResetOptions) => void;

  /** Reset the form to its current initial value, clearing the form's errors. */
  resetToInitial: (options?: ResetOptions) => void;

  /** Set the value of the form. */
  setValue: UseFormSetValue<T>;

  /** Manually trigger validation of all fields. */
  trigger: () => void;

  /** The current value of the form. */
  value: T;
};

export const useForm = <T>({
  initialValue,
  mode = 'onChange',
}: UseFormProps<T>): UseFormReturn<T> => {
  // The root form is created once, so it is stable for the form's lifetime.
  // Typing the ref non-null (asserted via `null!`) lets the callbacks below read
  // it without a per-use `!` and keep honestly empty dependency arrays, giving
  // those handlers a stable identity across renders.
  const rootRef = React.useRef<ReturnType<typeof createRootForm<T>>>(null!);
  if (!rootRef.current) {
    rootRef.current = createRootForm<T>(initialValue, mode);
  }
  const control = rootRef.current;

  const [submit, setSubmit] = React.useState({
    isSubmitted: false,
    isSubmitting: false,
    isSubmitSuccessful: false,
  });

  const value = useFormSlice(control, () => control.value, Object.is);
  const aggregate = useFormSlice(
    control,
    () => ({isDirty: control.isDirty, errors: control.errors}),
    (a, b) => a.isDirty === b.isDirty && errorSetsEqual(a.errors, b.errors),
  );

  const formState = React.useMemo<FormState>(
    () => ({
      errors: aggregate.errors,
      isDirty: aggregate.isDirty,
      isValid: aggregate.errors.size === 0,
      ...submit,
    }),
    [aggregate.errors, aggregate.isDirty, submit],
  );

  // The handlers read `rootRef.current` directly — the root form is stable — so
  // each closes over only the ref, keeping an empty dependency array and a
  // stable identity.
  const setValue = React.useCallback<UseFormSetValue<T>>(
    (newValueOrFn, options) => {
      const root = rootRef.current;
      const writeMode = options?.mode ?? 'onChange';
      const scope =
        writeMode === 'set' || writeMode === 'onBlur' ? 'none' : 'subtree';
      const next =
        typeof newValueOrFn === 'function'
          ? (newValueOrFn as (p: T) => T)(root.value)
          : newValueOrFn;
      root.setValue(next, scope);
    },
    [],
  );

  const getValues = React.useCallback(() => rootRef.current.value, []);

  const reset = React.useCallback((value: T, options?: ResetOptions) => {
    setSubmit({
      isSubmitted: false,
      isSubmitting: false,
      isSubmitSuccessful: false,
    });
    rootRef.current.reset(value, options?.keepDirtyValues ?? false);
  }, []);

  const resetToInitial = React.useCallback((options?: ResetOptions) => {
    setSubmit({
      isSubmitted: false,
      isSubmitting: false,
      isSubmitSuccessful: false,
    });
    rootRef.current.resetToInitial(options?.keepDirtyValues ?? false);
  }, []);

  const handleSubmit = React.useCallback(
    (onValid: SubmitHandler<T>, onInvalid?: SubmitErrorHandler) =>
      async (e?: React.BaseSyntheticEvent) => {
        const root = rootRef.current;
        setSubmit(s => ({...s, isSubmitting: true, isSubmitSuccessful: false}));
        let ok = false;
        try {
          e?.preventDefault?.();
          e?.persist?.();
          const errors = root.validate();
          if (errors.size === 0) {
            await onValid(root.value, e);
            ok = true;
          } else if (onInvalid) {
            await onInvalid(errors, e);
          }
        } finally {
          setSubmit(s => ({
            ...s,
            isSubmitting: false,
            isSubmitted: true,
            isSubmitSuccessful: ok,
          }));
        }
      },
    [],
  );

  const trigger = React.useCallback(() => {
    rootRef.current.validate();
  }, []);

  return React.useMemo(
    () => ({
      control,
      formState,
      getValues,
      handleSubmit,
      reset,
      resetToInitial,
      setValue,
      trigger,
      value,
    }),
    [
      control,
      formState,
      getValues,
      handleSubmit,
      reset,
      resetToInitial,
      setValue,
      trigger,
      value,
    ],
  );
};
