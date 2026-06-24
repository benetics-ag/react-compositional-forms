import React from 'react';

import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {NO_FIELD_ERRORS, useFieldArray, useForm, useFieldObject} from '..';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

/** This test contains repros for bugs that have appeared in the wild. */
describe('repros', () => {
  it('consecutive sibling setValue updates applied together on the next rerender', async () => {
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
              setValue(prev => ({
                ...prev,
                name: {...prev.name, first: 'Ada'},
              }));
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

  it('preserves both sibling child onChange updates in the same tick', async () => {
    const Form = () => {
      const {control, value} = useForm({
        initialValue: {name: {first: '', last: ''}},
      });

      const {fields} = useFieldObject({control});
      const {fields: nameFields} = useFieldObject({
        control: fields.name.control,
      });

      return (
        <div>
          <button
            onClick={() => {
              nameFields.first.control.onChange('Ada', {
                isDirty: true,
                errors: NO_FIELD_ERRORS,
              });
              nameFields.last.control.onChange('Lovelace', {
                isDirty: true,
                errors: NO_FIELD_ERRORS,
              });
            }}
            title="child sibling updates"
          />
          <p>Form: {JSON.stringify(value)}</p>
        </div>
      );
    };

    render(<Form />);

    await user.click(
      screen.getByRole('button', {name: 'child sibling updates'}),
    );

    expect(
      screen.getByText('Form: {"name":{"first":"Ada","last":"Lovelace"}}'),
    ).toBeTruthy();
  });

  it('preserves both sibling array child onChange updates in the same tick', async () => {
    const Form = () => {
      const {control, value} = useForm({
        initialValue: {rows: ['', '']},
      });

      const {fields: recordFields} = useFieldObject({control});
      const {fields} = useFieldArray({
        control: recordFields.rows.control,
      });

      return (
        <div>
          <button
            onClick={() => {
              fields[0].control.onChange('Ada', {
                isDirty: true,
                errors: NO_FIELD_ERRORS,
              });
              fields[1].control.onChange('Lovelace', {
                isDirty: true,
                errors: NO_FIELD_ERRORS,
              });
            }}
            title="array child sibling updates"
          />
          <p>Form: {JSON.stringify(value)}</p>
        </div>
      );
    };

    render(<Form />);

    await user.click(
      screen.getByRole('button', {name: 'array child sibling updates'}),
    );

    expect(screen.getByText('Form: {"rows":["Ada","Lovelace"]}')).toBeTruthy();
  });

  // TODO(tibbe): Figure out if we can express this as a property in the regular
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
