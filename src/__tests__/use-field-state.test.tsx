import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  Control,
  NO_FIELD_ERRORS,
  useFieldObject,
  useFieldState,
  useForm,
} from '..';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

type Address = {city: string};

const Section = ({control}: {control: Control<Address>}) => {
  const {fields} = useFieldObject({control});
  const {errors, isDirty} = useFieldState(control);
  return (
    <div>
      <TextField
        name="city"
        parentControl={fields.city.control}
        validate={value =>
          value.length > 0 ? NO_FIELD_ERRORS : new Set([{message: 'Required'}])
        }
      />
      {isDirty ? <p>Address dirty</p> : null}
      {errors.size > 0 ? <p>Address invalid</p> : null}
      <button onClick={() => control.resetToInitial()} title="reset address" />
    </div>
  );
};

const Form = () => {
  const {control} = useForm<{name: string; address: Address}>({
    initialValue: {name: '', address: {city: ''}},
  });
  const {fields} = useFieldObject({control});
  return (
    <div>
      <TextField name="name" parentControl={fields.name.control} />
      <Section control={fields.address.control} />
    </div>
  );
};

describe('useFieldState', () => {
  it('reports a composite dirty when a field within it changes', async () => {
    render(<Form />);

    await user.type(screen.getByTestId('input-city'), 'Oslo');

    expect(screen.getByText('Address dirty')).toBeTruthy();
  });

  it('does not report a composite dirty for a change elsewhere', async () => {
    render(<Form />);

    await user.type(screen.getByTestId('input-name'), 'Ada');

    expect(screen.queryByText('Address dirty')).toBeNull();
  });

  it('reports a composite clean again after it is reset', async () => {
    render(<Form />);

    await user.type(screen.getByTestId('input-city'), 'Oslo');
    await user.click(screen.getByRole('button', {name: 'reset address'}));

    expect(screen.queryByText('Address dirty')).toBeNull();
  });

  it('aggregates the errors of the fields within a composite', async () => {
    render(<Form />);

    await user.type(screen.getByTestId('input-city'), 'O');
    await user.clear(screen.getByTestId('input-city'));

    expect(screen.getByText('Address invalid')).toBeTruthy();
  });
});
