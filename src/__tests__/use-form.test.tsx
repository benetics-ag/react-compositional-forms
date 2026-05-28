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
});
