import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {Field, FieldError, NO_FIELD_ERRORS, useForm} from '..';
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

  return (
    <div>
      <Field
        control={control}
        render={({
          fieldState: {errors, isDirty},
          field: {onBlur, onChange, value},
        }) => (
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
        )}
        validate={validate}
      />
      <button onClick={() => reset(resetNewInitialValue)} title="reset" />
      <button
        onClick={() => reset(undefined, {keepDirtyValues: true})}
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
      let prevErrors: Set<FieldError> | undefined;
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
});
