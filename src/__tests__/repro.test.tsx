import React from 'react';

import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {useFieldArray, useForm, useFieldObject} from '..';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

/** This test contains repros for bugs that have appeared in the wild. */
describe('repros', () => {
  // TODO(tibbe): Figure out if we can express this as a property in the regulat
  // use-field-array.test.tsx file.
  it('onChangeItem propagates dirty state and errors', async () => {
    const Form = () => {
      const {
        control,
        formState: {isDirty: formIsDirty},
      } = useForm<{rows: string[]}>({initialValue: {rows: []}});

      const {fields: recordFields} = useFieldObject({control});
      const {append, fields} = useFieldArray({
        control: recordFields.rows.control,
      });

      return (
        <div>
          {fields.map(({control: controlField}, index) => (
            <TextField
              key={index}
              name={index.toString()}
              parentControl={controlField}
            />
          ))}
          <button onClick={() => append('')} title="add row" />
          {formIsDirty ? <p>Form dirty</p> : null}
        </div>
      );
    };

    render(<Form />);

    await user.click(screen.getByRole('button', {name: 'add row'}));
    expect(screen.getByText('Form dirty')).toBeTruthy();

    await user.type(screen.getByTestId('input-0'), '1');

    expect(screen.queryByText('Field 0-a dirty')).toBeNull();
    expect(screen.getByText('Form dirty')).toBeTruthy();
  });
});
