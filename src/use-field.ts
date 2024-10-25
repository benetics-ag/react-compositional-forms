import React from 'react';

import {
  Control,
  FieldRefSetValue,
  ResetOptions,
  SetValueOptions,
} from './control';
import {FieldError, NO_FIELD_ERRORS} from './field-errors';
import {useEventCallback} from './use-event-callback';

// -----------------------------------------------------------------------------
// fieldErrorSetsDeepEqual

function fieldErrorDeepEqual(errorA: FieldError, errorB: FieldError): boolean {
  if (errorA === errorB) {
    return true;
  }
  return errorA.message === errorB.message;
}

function fieldErrorSetsDeepEqual(
  setA: Set<FieldError>,
  setB: Set<FieldError>,
): boolean {
  if (setA === setB) {
    return true;
  }

  if (setA.size !== setB.size) {
    return false;
  }

  // O(n^2) but n is small.
  for (const a of setA) {
    if (!Array.from(setB).some(b => fieldErrorDeepEqual(a, b))) {
      return false;
    }
  }

  return true;
}

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
   * rendered.
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
  control,
  validate,
}: UseFieldProps<T>): UseFieldReturn<T> => {
  const {
    context,
    onChange,
    ref,
    initialValue: controlInitialValue,
    validationMode,
  } = control;

  // On `reset` we might change the initial value and thus we need a local copy.
  const [initialValue, setInitialValue] = React.useState(controlInitialValue);

  // The current value of the field.
  const [value, setValue] = React.useState(initialValue);

  // Dirty state:
  const isDirty = React.useMemo(
    () => value !== initialValue,
    [value, initialValue],
  );

  // Validation state:
  //
  // Validation is event-driven (happens e.g. when `field.onChange` is called).
  const [errors, setErrors] = React.useState(NO_FIELD_ERRORS);

  // Notify parent of changes:
  React.useEffect(
    () => onChange(value, {isDirty, errors}, context),
    [value, isDirty, errors, context, onChange],
  );

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

  const wrappedOnChange = useEventCallback((newValue: T) => {
    // Optimization: don't do anything if the value hasn't changed.
    if (newValue === value) {
      return;
    }

    if (validationMode === 'onChange') {
      validateAndSetErrors(newValue);
    }
    setValue(newValue);
  });

  const reset = React.useCallback(
    (newInitialValue?: T, options?: ResetOptions) => {
      // TODO(tibbe): Is there a possible optimization if `newInitialValue` is
      // the same as `value` and/or `initialValue`?
      const {keepDirtyValues = false} = options || {};
      let nextInitialValue = initialValue;
      if (newInitialValue !== undefined) {
        nextInitialValue = newInitialValue;
        setInitialValue(nextInitialValue);
      }
      const keepValue = keepDirtyValues && isDirty;
      if (!keepValue) {
        setErrors(NO_FIELD_ERRORS);
        setValue(nextInitialValue);
      }
    },
    [initialValue, isDirty],
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
          wrappedOnChange(newValue);
          break;
        case 'set':
          setValue(newValue);
          break;
      }
    },
    [wrappedOnChange],
  );

  React.useImperativeHandle(
    ref,
    () => ({reset, setValue: setValueMethod, validate: validateMethod}),
    [reset, setValueMethod, validateMethod],
  );

  const field = React.useMemo(
    () => ({onBlur, onChange: wrappedOnChange, value}),
    [onBlur, wrappedOnChange, value],
  );

  const fieldState = React.useMemo(
    () => ({errors, isDirty}),
    [errors, isDirty],
  );

  return React.useMemo(() => ({field, fieldState}), [field, fieldState]);
};
