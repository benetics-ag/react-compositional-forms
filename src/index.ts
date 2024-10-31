/**
 *
 * Performance considerations:
 *
 * - When calling `setState` try to preserve as much of the previous state as
 *   possible, for example by using the overload that accepts a function to
 *   modify the existing state.
 */

// # Todos
//
// - Pass a `ref` argument inside `fieldState` in `onChange` and make that ref
//   easily accesible through the `useForm` hook. `useForm` should return a
//   value that has the same structure as `value` but with the leaf type
//   replaced by `Ref<T>`.

// # Implementation notes
//
// Performance optimizations used throughout the code:
//
// - The ref initialization pattern from
//   https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents
//   to avoid unneccesary recomputation on every render.

export {type Control} from './control';
export {type FieldError, NO_FIELD_ERRORS} from './field-errors';
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
