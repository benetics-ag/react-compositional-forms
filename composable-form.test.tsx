import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  Control,
  Field,
  FieldArray,
  FieldArrayRenderProps,
  FieldError,
  FieldObject,
  FieldObjectRenderProps,
  FieldRenderProps,
  FormState,
  NO_FIELD_ERRORS,
  useForm,
} from './src';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

function stringifyErrors(errors: Set<FieldError>): string {
  return [...errors].map(e => e.message).join(', ');
}

/** Allows for configuring the test behavior (e.g. buttons). */
type TestProps<T> = {
  /**
   * Initial value passed to `useForm`.
   */
  initialValue?: T;

  /**
   * Called when the form state changes.
   *
   * The state is considered changed if `shallowEqual(formState, prevFormState)`
   * is false.
   */
  onFormStateChange?: (formState: FormState) => void;

  /**
   * New inital value passed to `reset` when the "reset" button is pressed.
   */
  resetNewInitialValue?: T;

  /**
   * Value passed to `setValue` when the "set value" button is pressed.
   */
  setValueValue?: T;

  setValueMode?: 'onBlur' | 'onChange' | 'set';

  validate?: (value: T) => Set<FieldError>;

  mode?: 'onBlur' | 'onChange';
};

// -----------------------------------------------------------------------------
// Field

const FieldTest = ({
  initialValue = '',
  onFormStateChange = undefined,
  resetNewInitialValue = '',
  validate = value =>
    value.length > 0 ? NO_FIELD_ERRORS : new Set([{message: 'Required'}]),
  mode = 'onChange',
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
      <button onClick={() => setValue('1')} title="set value" />
      <button onClick={() => setValue('')} title="clear value" />
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

  describe('setState', () => {
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
    it('updates value', async () => {
      render(<FieldTest />);

      await user.type(screen.getByTestId('input'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input')).toHaveValue('');

      // A reset form should be clean:
      expect(screen.queryByText('Dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
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

    it('validates', async () => {
      render(<FieldTest initialValue="1" resetNewInitialValue="" />);

      // Make the field invalid:
      await user.clear(screen.getByTestId('input'));

      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should be valid:
      expect(screen.queryByText('Errors:')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
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
});

// -----------------------------------------------------------------------------
// FieldArray

const ArrayTest = ({
  initialValue = [''],
  resetNewInitialValue = undefined,
  setValueValue = ['1'],
}: TestProps<string[]>) => {
  const {
    control: controlForm,
    formState: {errors: formErrors, isDirty: formIsDirty, isValid: formIsValid},
    handleSubmit,
    reset,
    setValue,
    value: formValue,
  } = useForm<string[]>({initialValue});

  const [submitStatus, setSubmitStatus] = React.useState<
    'success' | 'failure' | null
  >(null);
  const onSuccess = React.useCallback(() => setSubmitStatus('success'), []);
  const onInvalid = React.useCallback(() => setSubmitStatus('failure'), []);

  return (
    <div>
      <FieldArray
        control={controlForm}
        render={({append, fields, remove}) => (
          <div>
            {fields.map(({control: controlField}, index) => (
              <Field
                key={index}
                control={controlField}
                render={({
                  fieldState: {errors, isDirty},
                  field: {onBlur, onChange, value},
                }) => (
                  <div>
                    <input
                      onBlur={onBlur}
                      onChange={e => onChange(e.target.value)}
                      value={value}
                      data-testid={`input-${index}`}
                    />
                    <button
                      onClick={() => remove(index)}
                      title={`remove row ${index}`}
                    />
                    {isDirty ? <p>Field {index} dirty</p> : null}
                    {errors.size > 0 ? (
                      <p>
                        Field {index} errors: {stringifyErrors(errors)}
                      </p>
                    ) : null}
                  </div>
                )}
                validate={value =>
                  value.length > 0
                    ? NO_FIELD_ERRORS
                    : new Set([{message: 'Required'}])
                }
              />
            ))}
            <button onClick={() => append('')} title="add row" />
          </div>
        )}
      />
      <button onClick={() => reset(resetNewInitialValue)} title="reset" />
      <button
        onClick={() => reset(undefined, {keepDirtyValues: true})}
        title="reset non-dirty"
      />
      <button onClick={() => setValue(setValueValue)} title="set value" />
      <button
        onClick={() => setValue(['1', '2'])}
        title="set value with two rows"
      />
      <button onClick={() => setValue([])} title="set value with no rows" />
      <button onClick={() => setValue([''])} title="clear value" />
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
    </div>
  );
};

describe('FieldArray', () => {
  describe('initial state', () => {
    it('has initial value', () => {
      render(<ArrayTest />);

      expect(screen.getByTestId('input-0')).toHaveValue('');
      expect(screen.getByText('Form: [""]')).toBeTruthy();
    });

    it('has clean state', () => {
      render(<ArrayTest />);

      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('has valid state', () => {
      render(<FieldTest />);

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });
  });

  describe('onChange', () => {
    it('updates value', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Form: ["1"]')).toBeTruthy();
    });

    it('updates dirty state', async () => {
      // The first element should go from clean to dirty and back and the second
      // element should stay clean.
      render(<ArrayTest initialValue={['', '']} />);

      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Field 1 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      await user.type(screen.getByTestId('input-0'), '1');

      expect(screen.getByText('Field 0 dirty')).toBeTruthy();
      expect(screen.queryByText('Field 1 dirty')).toBeNull();
      expect(screen.getByText('Form dirty')).toBeTruthy();

      await user.clear(screen.getByTestId('input-0'));

      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Field 1 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('validates', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');

      // Goes from invalid to valid:
      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.clear(screen.getByTestId('input-0'));

      // Goes from valid to invalid:
      expect(screen.getByText('Field 0 errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });
  });

  describe('append', () => {
    it('adds row with initial value', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'add row'}));

      expect(screen.getByTestId('input-1')).toHaveValue('');
      expect(screen.getByText('Form: ["",""]')).toBeTruthy();
    });

    it('adds row as clean', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      expect(screen.queryByText('Field 1 dirty')).toBeNull();
    });

    it('adds row as valid', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      expect(screen.queryByText('Field 1 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('marks dirty if longer than initial', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'add row'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('marks dirty if shorter than initial', async () => {
      render(<ArrayTest initialValue={['', '']} />);

      await user.click(screen.getByRole('button', {name: 'remove row 1'}));
      await user.click(screen.getByRole('button', {name: 'remove row 0'}));
      await user.click(screen.getByRole('button', {name: 'add row'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('marks clean if same length as initial', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'remove row 0'}));
      await user.click(screen.getByRole('button', {name: 'add row'}));

      expect(screen.queryByText('Form dirty')).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes row', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'remove row 0'}));

      expect(screen.getByText('Form: []')).toBeTruthy();
    });

    it('marks dirty if longer than initial', async () => {
      render(<ArrayTest initialValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.click(screen.getByRole('button', {name: 'remove row 1'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('marks dirty if shorter than initial', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'remove row 0'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('marks clean if same length as initial', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.click(screen.getByRole('button', {name: 'remove row 0'}));

      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('validates', async () => {
      render(<ArrayTest initialValue={['1']} />);

      // Make row invalid:
      await user.clear(screen.getByTestId('input-0'));

      // Goes from invalid to valid:
      await user.click(screen.getByRole('button', {name: 'remove row 0'}));

      expect(screen.getByText('Form valid')).toBeTruthy();
    });
  });

  describe('setState', () => {
    it('updates value on same length value', async () => {
      render(<ArrayTest setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Form: ["1"]')).toBeTruthy();
    });

    it('updates value on longer value', async () => {
      render(<ArrayTest setValueValue={['1', '2']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByTestId('input-1')).toHaveValue('2');
      expect(screen.getByText('Form: ["1","2"]')).toBeTruthy();
    });

    it('updates value on shorter value', async () => {
      render(<ArrayTest setValueValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Form: []')).toBeTruthy();
    });

    it('validates on same length value', async () => {
      render(<ArrayTest setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('validates on longer value', async () => {
      render(<ArrayTest setValueValue={['1', '2']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Field 1 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('validates on shorter value', async () => {
      render(<ArrayTest setValueValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('adds row with initial value', async () => {
      render(<ArrayTest initialValue={[]} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('');
      expect(screen.getByText('Form: [""]')).toBeTruthy();
    });

    it('adds row as clean', async () => {
      render(<ArrayTest initialValue={[]} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 dirty')).toBeNull();
    });

    it('adds row as valid', async () => {
      render(<ArrayTest initialValue={[]} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('updates row value', async () => {
      render(<ArrayTest initialValue={['']} setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Form: ["1"]')).toBeTruthy();
    });

    it('updates row dirty state', async () => {
      render(<ArrayTest initialValue={['']} setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Form: ["1"]')).toBeTruthy();
    });

    it('updates row valid state', async () => {
      render(<ArrayTest initialValue={['']} setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Form: ["1"]')).toBeTruthy();
    });

    it('removes row', async () => {
      render(<ArrayTest />);

      await user.click(
        screen.getByRole('button', {name: 'set value with no rows'}),
      );

      expect(screen.getByText('Form: []')).toBeTruthy();
    });

    it('marks dirty if longer than initial', async () => {
      render(<ArrayTest initialValue={[]} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    // Validate if shorter than initial (i.e. remove invalid row)

    it('marks dirty if shorter than initial', async () => {
      render(<ArrayTest initialValue={['']} setValueValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('marks clean if same length as initial', async () => {
      render(<ArrayTest initialValue={['']} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Form dirty')).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input-0')).toHaveValue('');
      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('resets with new same length initial value', async () => {
      render(<ArrayTest resetNewInitialValue={['1']} />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should be clean:
      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('resets with new longer initial value', async () => {
      render(<ArrayTest resetNewInitialValue={['1', '2']} />);

      await user.type(screen.getByTestId('input-0'), '3');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should be clean:
      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.getByTestId('input-1')).toHaveValue('2');
      expect(screen.queryByText('Field 1 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('resets with new shorter initial value', async () => {
      render(<ArrayTest resetNewInitialValue={[]} />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should be clean:
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('can keep dirty value of same length', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByTestId('input-0')).toHaveValue('1');
      expect(screen.getByText('Field 0 dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('can keep dirty longer value', async () => {
      render(<ArrayTest initialValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByTestId('input-0')).toHaveValue('');
      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('can keep dirty shorter value', async () => {
      render(<ArrayTest initialValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'remove row 0'}));
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });
  });

  describe('validate', () => {
    it('triggers validation', async () => {
      render(<ArrayTest />);

      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.getByText('Field 0 errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Submit failure')).toBeTruthy();

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.getByText('Submit success')).toBeTruthy();
    });
  });
});

// -----------------------------------------------------------------------------
// FieldObject

const ObjectTest = ({
  initialValue = {a: '', b: ''},
  resetNewInitialValue = undefined,
  setValueMode = 'onChange',
  mode = 'onChange',
}: TestProps<{a: string; b: string}>) => {
  const {
    formState: {errors: formErrors, isDirty: formIsDirty, isValid: formIsValid},
    control: controlForm,
    handleSubmit,
    reset,
    setValue,
    value: formValue,
  } = useForm({initialValue, mode});

  const [submitStatus, setSubmitStatus] = React.useState<
    'success' | 'failure' | null
  >(null);
  const onSuccess = React.useCallback(() => setSubmitStatus('success'), []);
  const onInvalid = React.useCallback(() => setSubmitStatus('failure'), []);

  return (
    <div>
      <FieldObject
        control={controlForm}
        render={({fields}) => (
          <div>
            <Field
              control={fields.a.control}
              render={({
                fieldState: {errors, isDirty},
                field: {onBlur, onChange, value},
              }) => (
                <div>
                  <input
                    onBlur={onBlur}
                    onChange={e => onChange(e.target.value)}
                    value={value}
                    data-testid="input-a"
                  />
                  {isDirty ? <p>Field a dirty</p> : null}
                  {errors.size > 0 ? (
                    <p>Field a errors: {stringifyErrors(errors)}</p>
                  ) : null}
                </div>
              )}
              validate={value =>
                value.length > 0
                  ? NO_FIELD_ERRORS
                  : new Set([{message: 'Required'}])
              }
            />
            <Field
              control={fields.b.control}
              render={({
                fieldState: {errors, isDirty},
                field: {onChange, value},
              }) => (
                <div>
                  <input
                    onChange={e => onChange(e.target.value)}
                    value={value}
                    data-testid="input-b"
                  />
                  {isDirty ? <p>Field b dirty</p> : null}
                  {errors.size > 0 ? (
                    <p>Field b errors: {stringifyErrors(errors)}</p>
                  ) : null}
                </div>
              )}
            />
          </div>
        )}
      />
      <button onClick={() => reset(resetNewInitialValue)} title="reset" />
      <button
        onClick={() => reset(undefined, {keepDirtyValues: true})}
        title="reset non-dirty"
      />
      <button
        onClick={() =>
          setValue(prev => ({...prev, a: '1'}), {
            mode: setValueMode,
          })
        }
        title="set value"
      />
      <button
        onClick={() =>
          setValue(() => ({a: '', b: ''}), {
            mode: setValueMode,
          })
        }
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
    </div>
  );
};

describe('FieldObject', () => {
  describe('initial state', () => {
    it('has initial value', () => {
      render(<ObjectTest />);

      expect(screen.getByTestId('input-a')).toHaveValue('');
      expect(screen.getByTestId('input-b')).toHaveValue('');
    });

    it('has clean state', () => {
      render(<ObjectTest />);

      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('has valid state', () => {
      render(<ObjectTest />);

      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });
  });

  describe('onChange', () => {
    it('updates value', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');

      expect(screen.getByTestId('input-a')).toHaveValue('1');
      expect(screen.getByText('Form: {"a":"1","b":""}')).toBeTruthy();
    });

    it('updates dirty state', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');

      expect(screen.getByText('Field a dirty')).toBeTruthy();
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.getByText('Form dirty')).toBeTruthy();

      await user.clear(screen.getByTestId('input-a'));

      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('validates', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');

      // Goes from invalid to valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.clear(screen.getByTestId('input-a'));

      // Goes from valid to invalid:
      expect(screen.getByText('Field a errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });
  });

  describe('setState', () => {
    it('updates value', async () => {
      render(<ObjectTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByTestId('input-a')).toHaveValue('1');
      expect(screen.getByText('Form: {"a":"1","b":""}')).toBeTruthy();
    });

    it('updates dirty state', async () => {
      render(<ObjectTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Field a dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('validates', async () => {
      render(<ObjectTest />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      // Goes from invalid to valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.click(screen.getByRole('button', {name: 'clear value'}));

      // Goes from valid to invalid:
      expect(screen.getByText('Field a errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });

    it('can skip validation', async () => {
      render(<ObjectTest initialValue={{a: '1', b: '2'}} setValueMode="set" />);

      await user.click(screen.getByRole('button', {name: 'clear value'}));

      // Stays valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input-a')).toHaveValue('');
      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('resets with new initial value', async () => {
      render(<ObjectTest resetNewInitialValue={{a: '3', b: '4'}} />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should be clean:
      expect(screen.getByTestId('input-a')).toHaveValue('3');
      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.getByTestId('input-b')).toHaveValue('4');
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.queryByText('Field b errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('can keep dirty value', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByTestId('input-a')).toHaveValue('1');
      expect(screen.getByText('Field a dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });
  });

  describe('validate', () => {
    it('triggers validation', async () => {
      render(<ObjectTest />);

      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.getByText('Submit failure')).toBeTruthy();

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.getByText('Submit success')).toBeTruthy();
    });
  });
});

// -----------------------------------------------------------------------------
// Load test

// Each row has 10 fields:
type Row = {
  a: string;
  b: string;
  c: string;
  d: string;
  e: string;
  f: string;
  g: string;
  h: string;
  i: string;
  j: string;
};

const TextField = ({
  control,
  testID,
}: {
  control: Control<string>;
  testID?: string;
}) => {
  const renderField = React.useCallback(
    ({field: {onChange, value}}: FieldRenderProps<string>) => (
      <input
        onChange={e => onChange(e.target.value)}
        value={value}
        data-testid={testID}
      />
    ),
    [testID],
  );
  const validate = React.useCallback(
    (value: string) =>
      value.length > 0 ? NO_FIELD_ERRORS : new Set([{message: 'Required'}]),
    [],
  );

  return <Field control={control} render={renderField} validate={validate} />;
};

const Record = ({control, testID}: {control: Control<Row>; testID: string}) => {
  const renderObject = React.useCallback(
    ({fields}: FieldObjectRenderProps<Row>) => (
      <div>
        {Object.entries(fields).map(([key, {control: controlField}]) => (
          <TextField
            key={key}
            control={controlField}
            testID={`${testID}-${key}`}
          />
        ))}
      </div>
    ),
    [testID],
  );

  return <FieldObject control={control} render={renderObject} />;
};

const LoadTest = () => {
  const {
    control: controlForm,
    formState: {isDirty: formIsDirty},
  } = useForm<Row[]>({
    initialValue: [],
  });

  const renderRows = React.useCallback(
    ({append, fields}: FieldArrayRenderProps<Row>) => (
      <div>
        {fields.map(({control: controlRow}, index) => (
          <Record control={controlRow} key={index} testID={`input-${index}`} />
        ))}
        <button
          onClick={() =>
            append({
              a: 'hello world 1!',
              b: 'hello world 2!',
              c: 'hello world 3!',
              d: 'hello world 4!',
              e: 'hello world 5!',
              f: 'hello world 6!',
              g: 'hello world 7!',
              h: 'hello world 8!',
              i: 'hello world 9!',
              j: 'hello world 10!',
            })
          }
          title="add row"
        />
      </div>
    ),
    [],
  );

  return (
    <div>
      <FieldArray control={controlForm} render={renderRows} />
      {formIsDirty ? <p>Form dirty</p> : null}
    </div>
  );
};

describe('load test', () => {
  it('performs well with a large number of fields', async () => {
    // Adds a total of 1000 fields, spread across 100 array elements.
    render(<LoadTest />);

    const numRows = 100;
    for (let i = 0; i < numRows; i++) {
      await user.click(screen.getByRole('button', {name: 'add row'}));
    }

    expect(screen.getByTestId(`input-${numRows - 1}-j`)).toHaveValue(
      'hello world 10!',
    );
  });
});
