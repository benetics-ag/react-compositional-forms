import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  FieldError,
  NO_FIELD_ERRORS,
  useField,
  useFieldObject,
  useForm,
} from '..';
import type {TestProps} from '../test-helpers/types';
import {stringifyErrors} from '../test-helpers/stringify-errors';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

const FieldTest = ({
  initialValue = '',
  onFormStateChange = undefined,
  resetNewInitialValue = '',
  validate = value =>
    value.length > 0 ? NO_FIELD_ERRORS : new Set([{message: 'Required'}]),
  mode = 'onChange',
  setValueMode = 'onChange',
}: TestProps<string>) => {
  const {
    control,
    formState,
    formState: {errors: formErrors, isDirty: formIsDirty, isValid: formIsValid},
    handleSubmit,
    reset,
    resetToInitial,
    setValue,
    value: formValue,
  } = useForm<string>({initialValue, mode});

  React.useEffect(() => {
    onFormStateChange?.(formState);
  }, [formErrors, formIsDirty, formIsValid, formState, onFormStateChange]);

  const [submitStatus, setSubmitStatus] = React.useState<
    'success' | 'failure' | null
  >(null);
  const onSuccess = React.useCallback(() => setSubmitStatus('success'), []);
  const onInvalid = React.useCallback(() => setSubmitStatus('failure'), []);

  const {
    fieldState: {errors, isDirty},
    field: {onBlur, onChange, value},
  } = useField({control, validate});

  return (
    <div>
      <div>
        <input
          onBlur={onBlur}
          onChange={e => onChange(e.target.value)}
          value={value}
          data-testid="input"
        />
        {isDirty ? <p>Dirty</p> : null}
        {errors.size > 0 ? <p>Errors: {stringifyErrors(errors)}</p> : null}
      </div>
      <button
        onClick={() =>
          resetNewInitialValue === undefined
            ? resetToInitial()
            : reset(resetNewInitialValue)
        }
        title="reset"
      />
      <button
        onClick={() => resetToInitial({keepDirtyValues: true})}
        title="reset non-dirty"
      />
      <button onClick={() => reset('1')} title="reset with new default" />
      <button
        onClick={() => setValue('1', {mode: setValueMode})}
        title="set value"
      />
      <button
        onClick={() => setValue('', {mode: setValueMode})}
        title="clear value"
      />
      <button onClick={handleSubmit(onSuccess, onInvalid)} title="submit" />
      <p>Form: {JSON.stringify(formValue)}</p>
      {formIsDirty ? <p>Form dirty</p> : null}
      {formIsValid ? <p>Form valid</p> : null}
      {formErrors ? <p>Form errors: {stringifyErrors(formErrors)}</p> : null}
      {submitStatus === 'success' ? (
        <p>Submit success</p>
      ) : submitStatus === 'failure' ? (
        <p>Submit failure</p>
      ) : null}
      {formState.isSubmitSuccessful ? <p>Form submit successful</p> : null}
    </div>
  );
};

describe('Field', () => {
  describe('initial state', () => {
    it('has initial value', () => {
      render(<FieldTest />);

      expect(screen.getByTestId('input')).toHaveValue('');
      expect(screen.getByText('Form: ""')).toBeTruthy();
    });

    it('has clean state', () => {
      render(<FieldTest />);

      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('has valid state', () => {
      render(<FieldTest />);

      expect(screen.queryByText('Errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });
  });

  describe('onBlur', () => {
    it('validates', async () => {
      render(<FieldTest mode="onBlur" />);

      await user.type(screen.getByTestId('input'), '1');

      // Goes from invalid to valid:
      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.clear(screen.getByTestId('input'));
      await user.tab(); // Cause blur

      // Goes from valid to invalid:
      expect(screen.getByText('Errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });
  });

  describe('onChange', () => {
    it('updates value', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');

      expect(screen.getByTestId('input')).toHaveValue('1');
      expect(screen.getByText('Form: "1"')).toBeTruthy();
    });

    it('updates dirty state', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');

      // Goes from clean to dirty:
      expect(screen.getByText('Dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();

      await user.clear(screen.getByTestId('input'));

      // Goes from dirty to clean:
      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('validates', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');

      // Goes from invalid to valid:
      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.clear(screen.getByTestId('input'));

      // Goes from valid to invalid:
      expect(screen.getByText('Errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });

    it('reuses state if unchanged', async () => {
      let numCalls = 0;
      let prevErrors: ReadonlySet<FieldError> | undefined;
      render(
        <FieldTest
          onFormStateChange={formState => {
            if (
              prevErrors !== undefined &&
              prevErrors.size === formState.errors.size
            ) {
              expect(formState.errors).toBe(prevErrors);
            }
            prevErrors = formState.errors;
            numCalls++;
          }}
          validate={value =>
            value.length > 0
              ? // New object on each call:
                new Set([{message: 'Must be empty'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      // The form value goes through the following states:
      // 1. '' (initial)
      // 2. '1'
      // 3. '2'
      //
      // However since both state (2) and (3) are invalid we only expect the form
      // state to go through two states:
      // 1. Valid (initial)
      // 2. Invalid

      // Goes from valid to invalid:
      await user.type(screen.getByTestId('input'), '1');
      // Goes from invalid to invalid:
      await user.type(screen.getByTestId('input'), '2');

      expect(numCalls).toBe(2);
    });
  });

  describe('setValue', () => {
    it('updates dirty state', async () => {
      render(<FieldTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      // Goes from clean to dirty:
      expect(screen.getByText('Dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();

      await user.click(screen.getByRole('button', {name: 'clear value'}));

      // Goes from dirty to clean:
      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('updates value', async () => {
      render(<FieldTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input')).toHaveValue('1');
    });

    it('validates', async () => {
      render(<FieldTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.click(screen.getByRole('button', {name: 'clear value'}));

      // Goes from valid to invalid:
      expect(screen.getByText('Errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });
  });

  describe('reset', () => {
    it('resets to initial value', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input')).toHaveValue('');
      expect(screen.getByText('Form: ""')).toBeTruthy();
    });

    it('resets to clean state', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('resets to valid state', async () => {
      render(<FieldTest initialValue="1" />);

      // Make the field invalid:
      await user.clear(screen.getByTestId('input'));
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('can update initial value', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');
      await user.click(
        screen.getByRole('button', {name: 'reset with new default'}),
      );

      expect(screen.getByTestId('input')).toHaveValue('1');

      // A reset form should be clean:
      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('can keep dirty value', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByTestId('input')).toHaveValue('1');

      // Should preserve dirty value and thus dirty state:
      expect(screen.getByText('Dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });
  });

  describe('validate', () => {
    it('triggers validation', async () => {
      render(<FieldTest />);

      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.getByText('Errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
      expect(screen.getByText('Submit failure')).toBeTruthy();

      await user.type(screen.getByTestId('input'), '1');
      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.queryByText('Errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
      expect(screen.getByText('Submit success')).toBeTruthy();
    });
  });

  // TODO(tibbe): Move this to its own useForm test.
  describe('handleSubmit', () => {
    it('marks submit as unsuccessful on validation error', async () => {
      render(<FieldTest />);

      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.queryByText('Form submit successful')).toBeNull();
    });
  });

  it('preserves both sibling leaf onChange updates in the same tick', async () => {
    // Two sibling leaves' onChange called in one handler must both survive.
    const Form = () => {
      const {control, value} = useForm({
        initialValue: {first: '', last: ''},
      });
      const {fields} = useFieldObject({control});
      const first = useField({control: fields.first.control});
      const last = useField({control: fields.last.control});

      return (
        <div>
          <button
            onClick={() => {
              first.field.onChange('Ada');
              last.field.onChange('Lovelace');
            }}
            title="set both"
          />
          <p>Form: {JSON.stringify(value)}</p>
        </div>
      );
    };

    render(<Form />);

    await user.click(screen.getByRole('button', {name: 'set both'}));

    expect(
      screen.getByText('Form: {"first":"Ada","last":"Lovelace"}'),
    ).toBeTruthy();
  });

  it('reports dirty after editing a field whose initial value is undefined', async () => {
    // A leaf present in the initial structure with an `undefined` initial value
    // (here the whole form) is not a grown collection element: editing it makes
    // it dirty, like any other field.
    const Comp = () => {
      const {control} = useForm<string | undefined>({initialValue: undefined});
      const {field, fieldState} = useField<string | undefined>({control});
      return (
        <div>
          <input
            data-testid="input"
            value={field.value ?? ''}
            onChange={e => field.onChange(e.target.value)}
          />
          <p>{fieldState.isDirty ? 'dirty' : 'clean'}</p>
        </div>
      );
    };

    render(<Comp />);

    expect(screen.getByText('clean')).toBeTruthy();

    await user.type(screen.getByTestId('input'), 'x');

    expect(screen.getByText('dirty')).toBeTruthy();
  });

  it('treats a content-equal onChange as a no-op under a custom equalsFn', async () => {
    // The no-op guard must use the field's own equality, not reference identity,
    // so a fresh-but-equal value neither writes nor re-validates.
    let validateCalls = 0;
    const Comp = () => {
      const {control} = useForm<{n: number}>({initialValue: {n: 1}});
      const {field} = useField<{n: number}>({
        control,
        equalsFn: (a, b) => a.n === b.n,
        validate: () => {
          validateCalls++;
          return NO_FIELD_ERRORS;
        },
      });
      return (
        <div>
          <p>{`n=${field.value.n}`}</p>
          <button title="same" onClick={() => field.onChange({n: 1})} />
        </div>
      );
    };

    render(<Comp />);

    const before = validateCalls;
    await user.click(screen.getByRole('button', {name: 'same'}));

    expect(validateCalls).toBe(before);
  });

  it('reads the bound control after the control prop changes with no store edit', async () => {
    // Swapping which control a field is bound to, without any intervening store
    // mutation, must show the newly-bound position's value, not a cached slice.
    const Comp = () => {
      const {control} = useForm({initialValue: {a: 'av', b: 'bv'}});
      const {fields} = useFieldObject({control});
      const [which, setWhich] = React.useState<'a' | 'b'>('a');
      const {field} = useField({control: fields[which].control});
      return (
        <div>
          <p>value: {field.value}</p>
          <button
            title="toggle"
            onClick={() => setWhich(w => (w === 'a' ? 'b' : 'a'))}
          />
        </div>
      );
    };

    render(<Comp />);

    expect(screen.getByText('value: av')).toBeTruthy();

    await user.click(screen.getByRole('button', {name: 'toggle'}));

    expect(screen.getByText('value: bv')).toBeTruthy();
  });
});
