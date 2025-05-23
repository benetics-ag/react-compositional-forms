import React from 'react';

import {
  Control,
  FieldRefSetValue,
  ResetOptions,
  SetValueOptions,
} from './control';
import {
  FieldError,
  fieldErrorSetsDeepEqual,
  NO_FIELD_ERRORS,
} from './field-errors';
import {useEventCallback} from './use-event-callback';

// -----------------------------------------------------------------------------
// useField

/**
 * Functions to connect to the input element.
 */
export type UseFieldField<T> = {
  /**
   * Called when the field loses focus.
   *
   * Typically assigned to the `onBlur` prop of an input element.
   */
  onBlur: () => void;

  /**
   * Updates the fields value.
   *
   * Typically assigned to the `onChange` prop of an input element.
   */
  onChange: (newValue: T) => void;

  /**
   * The current value of the field.
   *
   * Typically assigned to the `value` prop of an input element.
   */
  value: T;
};

/** The current state of the field. */
export type UseFieldFieldState = {
  /**
   * Current validation errors of the field.
   *
   * If empty the field is valid.
   */
  errors: Set<FieldError>;

  /**
   * Is the field dirty?
   *
   * A field is considered dirty if its value has changed since it was first
   * rendered, when compared using {@link UseFieldProps.equalsFn}.
   */
  isDirty: boolean;
};

export type UseFieldReturn<T> = {
  /** Functions to connect to the input element. */
  field: UseFieldField<T>;

  /** The current state of the field. */
  fieldState: UseFieldFieldState;
};

export type UseFieldProps<T> = {
  /**
   * Function used to compare the initial value to the current value.
   *
   * Use to decide whether the field is dirty. Defaults to {@link Object.is}.
   *
   * @param val1 The first value.
   * @param val2 The second value.
   * @returns `true` if the values are equal, otherwise `false`.
   */
  equalsFn?: (val1: T, val2: T) => boolean;

  /** Parent form control object. */
  control: Control<T>;

  /**
   * Validation function that validates the field value.
   *
   * For efficiency reasons it's important to return {@link NO_FIELD_ERRORS} if
   * the value is valid, rather than a new empty {@link Set}. Returning a new
   * empty set also works but might cause more re-renders.
   *
   * @param value The value to validate.
   * @returns A set of errors. If the set is empty the value is considered
   * valid.
   */
  validate?: (value: T) => Set<FieldError>;
};

/**
 * Create a field linked to some input element.
 *
 * Validation: the field is considered valid if the
 * {@link UseFieldProps.validate} function returns an empty {@link Set}. The
 * field is considered valid until the `validate` function is first called. When
 * the validation function is called depends on the validation mode set on the
 * form (e.g. it might be called the first time `onChange` or `onBlur` is
 * called, depending on the validation mode).
 *
 * Dirty state: the field is considered dirty if its value has changed from its
 * initial value.
 */
export const useField = <T>({
  equalsFn = Object.is,
  control,
  validate,
}: UseFieldProps<T>): UseFieldReturn<T> => {
  const {onChange, ref, initialValue, value, validationMode} = control;
  const firstRender = React.useRef(true);

  // Dirty state:
  const isDirty = React.useMemo(
    () => !equalsFn(value, initialValue),
    [equalsFn, value, initialValue],
  );

  // Validation state:
  //
  // Validation is event-driven (happens e.g. when `field.onChange` is called).
  const [errors, setErrors] = React.useState(NO_FIELD_ERRORS);

  // Notify parent of changes:
  React.useEffect(() => {
    // `useEffect` is called after the first render, so we need to skip the
    // first render to avoid calling `onChange` with the initial value. While
    // not incorrect it can cause unnecessary re-renders and can be confusing.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onChange(value, {isDirty, errors});
  }, [value, isDirty, errors, onChange]);

  // Optimization: we keep track of the previous errors and only return a
  // different object if re-validating returns a different set of errors.
  // This will make re-renders less likely.
  const prevErrors = React.useRef(NO_FIELD_ERRORS);

  const validateAndSetErrors = React.useCallback(
    (val: T) => {
      // Compute new state:
      let newErrors = validate?.(val) ?? NO_FIELD_ERRORS;
      // See comment on `prevErrors`.
      newErrors = fieldErrorSetsDeepEqual(newErrors, prevErrors.current)
        ? prevErrors.current
        : newErrors;

      // Update state:
      prevErrors.current = newErrors;
      setErrors(newErrors);
      return newErrors;
    },
    [validate],
  );

  const onBlur = useEventCallback(() => {
    if (validationMode === 'onBlur') {
      validateAndSetErrors(value);
    }
  });

  /**
   * The `onChange` handler that should be passed to the input element.
   */
  const fieldOnChange = useEventCallback((newValue: T) => {
    // Optimization: don't do anything if the value hasn't changed.
    if (Object.is(newValue, value)) {
      return;
    }

    let newErrors = errors;
    if (validationMode === 'onChange') {
      newErrors = validateAndSetErrors(newValue);
    }
    onChange(newValue, {
      isDirty: !equalsFn(newValue, initialValue),
      errors: newErrors,
    });
  });

  const reset = React.useCallback(
    (newValue: T = initialValue, options?: ResetOptions) => {
      const {keepDirtyValues = false} = options || {};
      const keepValue = keepDirtyValues && isDirty;
      if (!keepValue) {
        setErrors(NO_FIELD_ERRORS);
      }
      return keepValue ? value : newValue;
    },
    [initialValue, isDirty, value],
  );

  const validateMethod = React.useCallback(
    () => validateAndSetErrors(value),
    [validateAndSetErrors, value],
  );

  const setValueMethod: FieldRefSetValue<T> = React.useCallback(
    (newValue: T, options?: SetValueOptions) => {
      const {mode = 'onChange'} = options || {};
      switch (mode) {
        case 'onBlur':
          // TODO(tibbe): Implement `onBlur`-triggered validation.
          break;
        case 'onChange':
          validateAndSetErrors(newValue);
          break;
        case 'set':
          break;
      }
    },
    [validateAndSetErrors],
  );

  React.useImperativeHandle(
    ref,
    () => ({reset, setValue: setValueMethod, validate: validateMethod}),
    [reset, setValueMethod, validateMethod],
  );

  const field = React.useMemo(
    () => ({onBlur, onChange: fieldOnChange, value}),
    [onBlur, fieldOnChange, value],
  );

  const fieldState = React.useMemo(
    () => ({errors, isDirty}),
    [errors, isDirty],
  );

  return React.useMemo(() => ({field, fieldState}), [field, fieldState]);
};
