import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {NO_FIELD_ERRORS, useFieldArray, useForm} from '..';
import type {TestProps} from '../test-helpers/types';
import {stringifyErrors} from '../test-helpers/stringify-errors';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

const ArrayTest = ({
  initialValue = [''],
  resetNewInitialValue = undefined,
  setValueValue = ['1'],
  validate,
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

  const {append, errors, fields, remove} = useFieldArray({
    control: controlForm,
    validate,
  });

  return (
    <div>
      {fields.map(({control: controlField}, index) => (
        <div key={index}>
          <TextField
            name={index.toString()}
            parentControl={controlField}
            validate={value =>
              value.length > 0
                ? NO_FIELD_ERRORS
                : new Set([{message: 'Required'}])
            }
          />
          <button onClick={() => remove(index)} title={`remove row ${index}`} />
        </div>
      ))}
      <button onClick={() => append('')} title="add row" />
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
      {errors.size > 0 ? <p>Array errors: {stringifyErrors(errors)}</p> : null}
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
      render(
        <ArrayTest
          validate={value =>
            value.length === 0
              ? new Set([{message: 'Too few elements'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Array errors: Too few elements')).toBeNull();
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
      render(
        <ArrayTest
          initialValue={['1']}
          validate={value =>
            value[0] !== '11'
              ? new Set([{message: 'Field 0 must be "11"'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      await user.type(screen.getByTestId('input-0'), '1');

      // Goes from invalid to valid:
      expect(screen.queryByText('Array errors: Too many elements')).toBeNull();
      expect(screen.queryByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();

      await user.type(screen.getByTestId('input-0'), '1');

      // Goes from valid to invalid:
      expect(
        screen.getByText('Array errors: Field 0 must be "11"'),
      ).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(
        screen.getByText('Form errors: Field 0 must be "11"'),
      ).toBeTruthy();
    });

    it('validates elements', async () => {
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

    it('validates', async () => {
      render(
        <ArrayTest
          initialValue={[]}
          validate={value =>
            value.length > 1
              ? new Set([{message: 'Too many elements'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      await user.click(screen.getByRole('button', {name: 'add row'}));

      // Goes from invalid to valid:
      expect(screen.queryByText('Array errors: Too many elements')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Too many elements')).toBeNull();

      await user.click(screen.getByRole('button', {name: 'add row'}));

      // Goes from valid to invalid:
      expect(screen.getByText('Array errors: Too many elements')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Too many elements')).toBeTruthy();
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

  describe('setValue', () => {
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

    it('validates elements on same length value', async () => {
      render(<ArrayTest setValueValue={['1']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('validates elements on longer value', async () => {
      render(<ArrayTest setValueValue={['1', '2']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Field 1 errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('validates elements on shorter value', async () => {
      render(<ArrayTest setValueValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Form valid')).toBeTruthy();
    });

    it('validates on same length', async () => {
      render(
        <ArrayTest
          initialValue={['1']}
          setValueValue={[]}
          validate={value =>
            value.length !== 1
              ? new Set([{message: 'Not one element'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Array errors: Not one element')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Not one element')).toBeTruthy();
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

      expect(screen.getByText('Field 0 dirty')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('updates row valid state', async () => {
      render(<ArrayTest initialValue={['1']} setValueValue={['']} />);

      await user.click(screen.getByRole('button', {name: 'set value'}));

      expect(screen.getByText('Field 0 errors: Required')).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
    });

    it('removes row', async () => {
      render(<ArrayTest />);

      await user.click(
        screen.getByRole('button', {name: 'set value with no rows'}),
      );

      expect(screen.getByText('Form: []')).toBeTruthy();
    });

    it('removes the correct row', async () => {
      render(<ArrayTest initialValue={[]} />);

      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'add row'}));
      await user.type(screen.getByTestId('input-1'), '2');
      await user.click(screen.getByRole('button', {name: 'remove row 0'}));

      expect(screen.queryByTestId('input-1')).toBeNull();
      expect(screen.getByTestId('input-0')).toHaveValue('2');
      expect(screen.getByText('Form: ["2"]')).toBeTruthy();
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
    it('resets to initial value', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input-0')).toHaveValue('');
      expect(screen.getByText('Form: [""]')).toBeTruthy();
    });

    it('resets to clean state', async () => {
      render(<ArrayTest />);

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Field 0 dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('resets to valid state', async () => {
      render(
        <ArrayTest
          initialValue={['1']}
          resetNewInitialValue={['']}
          validate={value =>
            value.length !== 1
              ? new Set([{message: 'Not one element'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      // Make the field invalid:
      await user.clear(screen.getByTestId('input-0'));
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(screen.queryByText('Array errors: Not one element')).toBeNull();
      expect(screen.queryByText('Form valid')).toBeTruthy();
      expect(
        screen.queryByText('Form errors: Not one element, Required'),
      ).toBeNull();
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
      render(
        <ArrayTest
          validate={value =>
            value[0] !== '1'
              ? new Set([{message: 'Field 0 must be "1"'}])
              : NO_FIELD_ERRORS
          }
        />,
      );

      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.getByText('Field 0 errors: Required')).toBeTruthy();
      expect(
        screen.getByText('Form errors: Field 0 must be "1", Required'),
      ).toBeTruthy();
      expect(
        screen.getByText('Array errors: Field 0 must be "1"'),
      ).toBeTruthy();
      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Submit failure')).toBeTruthy();

      await user.type(screen.getByTestId('input-0'), '1');
      await user.click(screen.getByRole('button', {name: 'submit'}));

      expect(screen.queryByText('Field 0 errors: Required')).toBeNull();
      expect(
        screen.queryByText('Array errors: Field 0 must be "1"'),
      ).toBeNull();
      expect(
        screen.queryByText('Form errors: Field 0 must be "1", Required'),
      ).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.getByText('Submit success')).toBeTruthy();
    });
  });
});
