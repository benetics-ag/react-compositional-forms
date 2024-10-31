/**
 *
 * Performance considerations:
 *
 * - Functions passed to `render` and `validate` should ideally be defined using
 *   {@link React.useCallback}.
 */

import React from 'react';

import {Control} from './control';
import {shallowEqual} from './shallow-equal';
import {useField, UseFieldProps, UseFieldReturn} from './use-field';
import {useFieldArray, UseFieldArrayReturn} from './use-field-array';
import {
  useFieldObject,
  UseFieldObjectProps,
  UseFieldObjectReturn,
} from './use-field-object';

// -----------------------------------------------------------------------------
// propsWithControlAreEqual

type WithControl<T> = {
  control: T;
};

/**
 * {@link React.memo} comparison function for components with a `control` prop.
 *
 * The `control` object sometimes gets recreated even though its contents hasn't
 * changed. This function performs a shallow comparison of the content of
 * `control` to avoid unnecessary re-renders.
 */
function propsWithControlAreEqual<T extends WithControl<object>>(
  prevProps: Readonly<T>,
  nextProps: Readonly<T>,
): boolean {
  const {control: prevControl, ...prevRest} = prevProps;
  const {control: nextControl, ...nextRest} = nextProps;
  return (
    shallowEqual(prevControl, nextControl) && shallowEqual(prevRest, nextRest)
  );
}

// -----------------------------------------------------------------------------
// Field

export type FieldRenderProps<T> = UseFieldReturn<T>;

export type FieldProps<T> = UseFieldProps<T> & {
  /**
   * Render function that renders the field.
   */
  render: (props: FieldRenderProps<T>) => React.ReactElement;
};

export const FieldImpl = <T,>({
  render,
  control,
  validate,
}: FieldProps<T>): JSX.Element => {
  return render(useField({control, validate}));
};

/**
 * Wraps a component that renders a form field.
 *
 * For efficiency reasons it's important to pass stable values as props to this
 * component.
 *
 * @example
 * const render = useCallback(
 *   ({field}) => (
 *     <input
 *       onBlur={field.onBlur}
 *       onChange={e => field.onChange(e.target.value)}
 *       value={field.value}
 *     />
 *   ),
 *   [],
 * );
 * const requiredError = useMemo(() => new Set([{message: 'Required'}]), []);
 * const validate = useCallback(
 *   (value: string) => (value.length === 0 ? requiredError : NO_FIELD_ERRORS),
 *   [],
 * );
 * return <Field control={control} render={render} validate={validate} />;
 */
export const Field = React.memo(
  FieldImpl,
  propsWithControlAreEqual,
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37087#issuecomment-656596623
) as typeof FieldImpl;

// -----------------------------------------------------------------------------
// FieldArray

export type FieldArrayRenderFieldProps<T> = {
  control: Control<T>;
};

export type FieldArrayRenderProps<T> = UseFieldArrayReturn<T>;

export type FieldArrayProps<T> = {
  control: Control<T[]>;
  render: (props: FieldArrayRenderProps<T>) => React.ReactElement;
};

const FieldArrayImpl = <T,>({
  render,
  control,
}: FieldArrayProps<T>): JSX.Element => {
  return render(useFieldArray({control}));
};

/**
 * Groups the output of multiple fields into an array.
 */
export const FieldArray = React.memo(
  FieldArrayImpl,
  propsWithControlAreEqual,
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37087#issuecomment-656596623
) as typeof FieldArrayImpl;

// -----------------------------------------------------------------------------
// FieldObject

export type FieldObjectRenderItemProps<T> = {
  control: Control<T>;
};

export type FieldObjectRenderProps<O extends object> = UseFieldObjectReturn<O>;

export type FieldObjectProps<O extends object> = UseFieldObjectProps<O> & {
  render: (props: FieldObjectRenderProps<O>) => React.ReactElement;
};

const FieldObjectImpl = <O extends {[prop: string]: unknown}>({
  render,
  control,
}: FieldObjectProps<O>): JSX.Element => {
  return render(useFieldObject({control}));
};

/**
 * Groups the output of multiple fields into an object.
 */
export const FieldObject = React.memo(
  FieldObjectImpl,
  propsWithControlAreEqual,
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/37087#issuecomment-656596623
) as typeof FieldObjectImpl;
