import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {useForm} from '..';

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
  });

  describe('setValue', () => {
    it('keeps earlier sibling writes from consecutive functional updates', async () => {
      const Form = () => {
        const {setValue, value} = useForm({
          initialValue: {firstName: '', lastName: ''},
        });

        return (
          <div>
            <button
              onClick={() => {
                setValue(prev => ({...prev, firstName: 'Ada'}));
                setValue(prev => ({...prev, lastName: 'Lovelace'}));
              }}
              title="set sibling values"
            />
            <p>Form: {JSON.stringify(value)}</p>
          </div>
        );
      };

      render(<Form />);

      await user.click(
        screen.getByRole('button', {name: 'set sibling values'}),
      );

      expect(
        screen.getByText('Form: {"firstName":"Ada","lastName":"Lovelace"}'),
      ).toBeTruthy();
    });
  });
});
