import {Form} from './form';
import {fieldStateEqual, useFormSlice} from './internal/use-store-slice';
import {UseFieldFieldState} from './use-field';

/**
 * A form's derived state: whether its subtree differs from its initial value,
 * and the validation errors at and below it. The calling component re-renders
 * when either changes.
 */
export function useFieldState<T>(control: Form<T>): UseFieldFieldState {
  return useFormSlice(
    control,
    ({isDirty, errors}) => ({isDirty, errors}),
    fieldStateEqual,
  );
}
