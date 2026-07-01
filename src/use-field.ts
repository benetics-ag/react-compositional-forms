import type {FieldErrors} from './field-errors';
import {Form} from './form';
import {Equals, FormDescriptor, Validator} from './internal/form-descriptor';
import {
  errorSetsEqual,
  useFormSlice,
  useRegisterDescriptor,
} from './internal/use-store-slice';

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
   * Updates the field's value.
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
  errors: FieldErrors;

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
  control: Form<T>;

  /**
   * Validation function that validates the field value.
   *
   * @param value The value to validate.
   * @returns A set of errors. If the set is empty the value is considered
   * valid.
   */
  validate?: (value: T) => FieldErrors;
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
  control: form,
  validate,
}: UseFieldProps<T>): UseFieldReturn<T> => {
  // Contribute this leaf's validator and (non-default) equality. A pure-default
  // leaf registers nothing — the walk's reference compare is already its rule.
  const customEquals = equalsFn !== Object.is;
  const descriptor: FormDescriptor<T> | null =
    validate || customEquals
      ? {
          validate: validate as Validator<T> | undefined,
          ...(customEquals ? {equals: equalsFn as Equals<T>} : {}),
        }
      : null;
  useRegisterDescriptor(form, descriptor);

  const slice = useFormSlice(
    form,
    () => ({
      value: form.value,
      isDirty: form.isDirty,
      errors: form.errors,
    }),
    (a, b) =>
      Object.is(a.value, b.value) &&
      a.isDirty === b.isDirty &&
      errorSetsEqual(a.errors, b.errors),
  );

  return {
    field: {
      value: slice.value,
      onChange: next => {
        // Write only when the value actually changes, by the field's own
        // equality — a value equal under `equalsFn` is not a change.
        if (equalsFn(next, form.value)) return;
        form.setValue(next, form.validationMode === 'onChange' ? 'up' : 'none');
      },
      onBlur: () => form.onBlur(),
    },
    fieldState: {
      isDirty: slice.isDirty,
      errors: slice.errors,
    },
  };
};
