import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {NO_FIELD_ERRORS, useFieldObject, useForm} from '..';
import type {TestProps} from '../test-helpers/types';
import {stringifyErrors} from '../test-helpers/stringify-errors';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

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
    resetToInitial,
    setValue,
    value: formValue,
  } = useForm({initialValue, mode});

  const [submitStatus, setSubmitStatus] = React.useState<
    'success' | 'failure' | null
  >(null);
  const onSuccess = React.useCallback(() => setSubmitStatus('success'), []);
  const onInvalid = React.useCallback(() => setSubmitStatus('failure'), []);

  const {fields} = useFieldObject({control: controlForm});

  return (
    <div>
      <div>
        <TextField
          name="a"
          parentControl={fields.a.control}
          validate={value =>
            value.length > 0
              ? NO_FIELD_ERRORS
              : new Set([{message: 'Required'}])
          }
        />
        <TextField name="b" parentControl={fields.b.control} />
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
        onClick={() =>
          resetNewInitialValue === undefined
            ? resetToInitial({keepDirtyValues: true})
            : reset(resetNewInitialValue, {keepDirtyValues: true})
        }
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

// A form whose object value can change which keys it holds. The rendered fields
// follow `useFieldObject`'s `fields` — one control per key of the current value
// — and the key set is changed from outside by resetting to `resetTo`.
const DynamicObjectTest = ({
  initialValue,
  resetTo,
  keepDirtyValues = false,
}: {
  initialValue: Record<string, string>;
  resetTo: Record<string, string>;
  keepDirtyValues?: boolean;
}) => {
  const init = React.useRef(initialValue);
  const {control, reset, value} = useForm<Record<string, string>>({
    initialValue: init.current,
  });
  const {fields} = useFieldObject({control});

  return (
    <div>
      {Object.keys(fields).map(key => (
        <TextField key={key} name={key} parentControl={fields[key].control} />
      ))}
      <button onClick={() => reset(resetTo, {keepDirtyValues})} title="reset" />
      <p>keys: {Object.keys(fields).join(',')}</p>
      <p>Form: {JSON.stringify(value)}</p>
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

  describe('setValue', () => {
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
    it('resets to initial value', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByTestId('input-a')).toHaveValue('');
      expect(screen.getByText('Form: {"a":"","b":""}')).toBeTruthy();
    });

    it('resets to clean state', async () => {
      render(<ObjectTest />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();
    });

    it('resets to valid state', async () => {
      render(<ObjectTest initialValue={{a: '1', b: ''}} />);

      await user.clear(screen.getByTestId('input-a'));
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('resets with new initial value', async () => {
      render(<ObjectTest resetNewInitialValue={{a: '3', b: '4'}} />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // A reset form should have the new initial value:
      expect(screen.getByTestId('input-a')).toHaveValue('3');
      expect(screen.getByTestId('input-b')).toHaveValue('4');

      // A reset form should be clean:
      expect(screen.queryByText('Field a dirty')).toBeNull();
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.queryByText('Form dirty')).toBeNull();

      // A reset form should be valid:
      expect(screen.queryByText('Field a errors: Required')).toBeNull();
      expect(screen.queryByText('Field b errors: Required')).toBeNull();
      expect(screen.getByText('Form valid')).toBeTruthy();
      expect(screen.queryByText('Form errors: Required')).toBeNull();
    });

    it('can keep dirty value', async () => {
      render(<ObjectTest resetNewInitialValue={{a: '2', b: '3'}} />);

      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByTestId('input-a')).toHaveValue('1');
      expect(screen.getByTestId('input-b')).toHaveValue('3');
      expect(screen.getByText('Form: {"a":"1","b":"3"}')).toBeTruthy();
    });

    it('can keep dirty value state', async () => {
      render(<ObjectTest />);

      // Goes from clean to dirty:
      await user.type(screen.getByTestId('input-a'), '1');
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.getByText('Field a dirty')).toBeTruthy();
      expect(screen.queryByText('Field b dirty')).toBeNull();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('can keep dirty value errors', async () => {
      render(<ObjectTest initialValue={{a: '1', b: ''}} />);

      // Goes from valid to invalid:
      await user.clear(screen.getByTestId('input-a'));
      await user.click(screen.getByRole('button', {name: 'reset non-dirty'}));

      expect(screen.queryByText('Form valid')).toBeNull();
      expect(screen.getByText('Form errors: Required')).toBeTruthy();
    });
  });

  // `fields` holds one control per key of the form's current value, so when a
  // reset changes that key set the fields follow it: a key the reset adds gains
  // a control at the reset value, a key it drops loses its control. A
  // `keepDirtyValues` reset still keeps edits to the keys that survive.
  describe('changing keys', () => {
    it('grows the field set to match a reset that adds keys', async () => {
      render(
        <DynamicObjectTest
          initialValue={{a: ''}}
          resetTo={{a: '', b: ''}}
          keepDirtyValues
        />,
      );

      // Edit `a` so the form is dirty when the key set changes.
      await user.type(screen.getByTestId('input-a'), 'x');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // The added key gains a control at the reset value, and `a` keeps its edit.
      expect(screen.getByText('keys: a,b')).toBeTruthy();
      expect(screen.getByTestId('input-a')).toHaveValue('x');
      expect(screen.getByTestId('input-b')).toHaveValue('');
      expect(screen.getByText('Form: {"a":"x","b":""}')).toBeTruthy();
    });

    it('shrinks the field set to match a reset that drops keys', async () => {
      render(
        <DynamicObjectTest
          initialValue={{a: '', b: ''}}
          resetTo={{a: ''}}
          keepDirtyValues
        />,
      );

      // Edit `a` so the form is dirty when the key set changes.
      await user.type(screen.getByTestId('input-a'), 'x');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      // The dropped key loses its control, and `a` keeps its edit.
      expect(screen.getByText('keys: a')).toBeTruthy();
      expect(screen.queryByTestId('input-b')).toBeNull();
      expect(screen.getByTestId('input-a')).toHaveValue('x');
      expect(screen.getByText('Form: {"a":"x"}')).toBeTruthy();
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

  // A field unmounted by conditional rendering (not removed through the array
  // API) must not leave its last validation error behind: the error belongs to
  // a field that is gone, and would otherwise keep the form invalid forever.
  describe('conditional unmount', () => {
    it("drops a hidden invalid field's error so the form becomes valid", async () => {
      const Comp = () => {
        const {control, formState, handleSubmit} = useForm<{
          a: string;
          b: string;
        }>({initialValue: {a: '', b: 'ok'}});
        const {fields} = useFieldObject({control});
        const [showA, setShowA] = React.useState(true);
        return (
          <div>
            {showA ? (
              <TextField
                name="a"
                parentControl={fields.a.control}
                validate={v =>
                  v.length > 0
                    ? NO_FIELD_ERRORS
                    : new Set([{message: 'Required'}])
                }
              />
            ) : null}
            <TextField name="b" parentControl={fields.b.control} />
            <button
              onClick={handleSubmit(
                () => {},
                () => {},
              )}
              title="submit"
            />
            <button onClick={() => setShowA(false)} title="hide a" />
            <p>{formState.isValid ? 'valid' : 'invalid'}</p>
          </div>
        );
      };

      render(<Comp />);

      // Validate while `a` is empty: the form is invalid.
      await user.click(screen.getByRole('button', {name: 'submit'}));
      expect(screen.getByText('invalid')).toBeTruthy();

      // Hiding `a` unmounts it; its stale error must not keep the form invalid.
      await user.click(screen.getByRole('button', {name: 'hide a'}));
      expect(screen.getByText('valid')).toBeTruthy();
    });
  });
});
