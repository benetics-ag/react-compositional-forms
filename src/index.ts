// # Todos
//
// - Pass a `ref` argument inside `fieldState` in `onChange` and make that ref
//   easily accessible through the `useForm` hook. `useForm` should return a
//   value that has the same structure as `value` but with the leaf type
//   replaced by `Ref<T>`.

// # Implementation notes
//
// Performance optimizations used throughout the code:
//
// - The ref initialization pattern from
//   https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents
//   to avoid unnecessary recomputation on every render.

export {type Form as Control} from './form';
export {type FieldError, NO_FIELD_ERRORS} from './field-errors';
export {type ValidationMode} from './internal/store';
export {
  type UseFieldField as FieldControl,
  type UseFieldFieldState as FieldState,
  useField,
  type UseFieldProps,
  type UseFieldReturn,
} from './use-field';
export {
  useFieldArray,
  type UseFieldArrayField,
  type UseFieldArrayProps,
  type UseFieldArrayReturn,
} from './use-field-array';
export {
  useFieldObject,
  type UseFieldObjectField,
  type UseFieldObjectProps,
  type UseFieldObjectReturn,
} from './use-field-object';
export {
  type FormState,
  type SubmitErrorHandler,
  type SubmitHandler,
  useForm,
  type UseFormGetValues,
  type UseFormHandleSubmit,
  type UseFormProps,
  type UseFormReturn,
  type UseFormSetValue,
} from './use-form';
export * as validation from './validation';
