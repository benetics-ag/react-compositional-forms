import React from 'react';

import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {Control, useField, useFieldArray, useFieldObject, useForm} from '..';
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

  // Issue #32: a child appended past the initial length takes its appended value
  // as its initial value, at every depth beneath it.
  it('resets a cell under an appended table row to the appended value', async () => {
    type Row = {name: string};

    const Cell = ({
      control,
      name,
    }: {
      control: Control<string>;
      name: string;
    }) => {
      const {
        field: {onChange, value},
        fieldState: {isDirty},
      } = useField({control});
      return (
        <div>
          <input
            data-testid={`input-${name}`}
            onChange={e => onChange(e.target.value)}
            value={value}
          />
          {isDirty ? <p>Cell {name} dirty</p> : null}
          <button
            onClick={() => control.resetToInitial()}
            title={`reset ${name}`}
          />
        </div>
      );
    };

    const RowFields = ({
      control,
      index,
    }: {
      control: Control<Row>;
      index: number;
    }) => {
      const {fields} = useFieldObject({control});
      return <Cell control={fields.name.control} name={index.toString()} />;
    };

    const Form = () => {
      const {
        control,
        formState: {isDirty: formIsDirty},
      } = useForm<{rows: Row[]}>({initialValue: {rows: [{name: 'a'}]}});

      const {fields: recordFields} = useFieldObject({control});
      const {append, fields} = useFieldArray({
        control: recordFields.rows.control,
      });

      return (
        <div>
          {fields.map(({control: rowControl}, index) => (
            <RowFields key={index} control={rowControl} index={index} />
          ))}
          <button onClick={() => append({name: 'new'})} title="add row" />
          {formIsDirty ? <p>Form dirty</p> : null}
        </div>
      );
    };

    render(<Form />);

    await user.click(screen.getByRole('button', {name: 'add row'}));
    expect(screen.queryByText('Cell 1 dirty')).toBeNull();
    expect(screen.getByText('Form dirty')).toBeTruthy();

    await user.type(screen.getByTestId('input-1'), 'x');
    expect(screen.getByText('Cell 1 dirty')).toBeTruthy();

    await user.click(screen.getByRole('button', {name: 'reset 1'}));
    expect(screen.getByTestId('input-1')).toHaveValue('new');
    expect(screen.queryByText('Cell 1 dirty')).toBeNull();
    expect(screen.getByText('Form dirty')).toBeTruthy();
  });
});
