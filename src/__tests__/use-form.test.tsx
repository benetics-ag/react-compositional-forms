import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {useFieldObject, useForm} from '..';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

describe('useForm', () => {
  describe('reset', () => {
    it('resets to new initial value when no field is mounted', async () => {
      const Form = () => {
        const {reset, value} = useForm({initialValue: 'initial'});

        return (
          <div>
            <button onClick={() => reset('reset')} title="reset" />
            <p>Form: {JSON.stringify(value)}</p>
          </div>
        );
      };

      render(<Form />);

      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByText('Form: "reset"')).toBeTruthy();
    });

    it('resets an optional field to a literal undefined', async () => {
      // `reset(value)` writes exactly `value`; `undefined` is a value, not a
      // "reset to initial" sentinel.
      const Form = () => {
        const {reset, value} = useForm<string | undefined>({
          initialValue: 'x',
        });

        return (
          <div>
            <button onClick={() => reset(undefined)} title="clear" />
            <p>Value: {String(value)}</p>
          </div>
        );
      };

      render(<Form />);

      expect(screen.getByText('Value: x')).toBeTruthy();

      await user.click(screen.getByRole('button', {name: 'clear'}));

      expect(screen.getByText('Value: undefined')).toBeTruthy();
    });

    it('resetToInitial restores the initial value', async () => {
      const Form = () => {
        const {resetToInitial, setValue, value} = useForm({
          initialValue: 'initial',
        });

        return (
          <div>
            <button onClick={() => setValue('changed')} title="change" />
            <button onClick={() => resetToInitial()} title="revert" />
            <p>Form: {JSON.stringify(value)}</p>
          </div>
        );
      };

      render(<Form />);

      await user.click(screen.getByRole('button', {name: 'change'}));
      expect(screen.getByText('Form: "changed"')).toBeTruthy();

      await user.click(screen.getByRole('button', {name: 'revert'}));
      expect(screen.getByText('Form: "initial"')).toBeTruthy();
    });
  });

  it('applies consecutive sibling setValue updates together', async () => {
    // Two functional-updater writes in one handler must both survive: each reads
    // the latest value, so the second does not clobber the first.
    const Form = () => {
      const {control, setValue, value} = useForm({
        initialValue: {name: {first: '', last: ''}},
      });
      const {fields} = useFieldObject({control});
      const {fields: nameFields} = useFieldObject({
        control: fields.name.control,
      });

      return (
        <div>
          <TextField name="first" parentControl={nameFields.first.control} />
          <TextField name="last" parentControl={nameFields.last.control} />
          <button
            onClick={() => {
              setValue(prev => ({...prev, name: {...prev.name, first: 'Ada'}}));
              setValue(prev => ({
                ...prev,
                name: {...prev.name, last: 'Lovelace'},
              }));
            }}
            title="set full name"
          />
          <p>Form: {JSON.stringify(value)}</p>
        </div>
      );
    };

    render(<Form />);

    await user.click(screen.getByRole('button', {name: 'set full name'}));

    expect(screen.getByTestId('input-first')).toHaveValue('Ada');
    expect(screen.getByTestId('input-last')).toHaveValue('Lovelace');
    expect(
      screen.getByText('Form: {"name":{"first":"Ada","last":"Lovelace"}}'),
    ).toBeTruthy();
  });

  it('keeps working under StrictMode', async () => {
    // StrictMode double-invokes render and mount effects; descriptor
    // registration and subscription must stay correct (no double-registration,
    // stale state, or loops).
    const Form = () => {
      const {control, value} = useForm({initialValue: {a: ''}});
      const {fields} = useFieldObject({control});

      return (
        <div>
          <TextField name="a" parentControl={fields.a.control} />
          <p>Form: {JSON.stringify(value)}</p>
        </div>
      );
    };

    render(
      <React.StrictMode>
        <Form />
      </React.StrictMode>,
    );

    await user.type(screen.getByTestId('input-a'), 'x');

    expect(screen.getByText('Form: {"a":"x"}')).toBeTruthy();
  });
});
