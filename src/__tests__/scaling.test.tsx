import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  Control,
  Field,
  FieldArray,
  FieldArrayRenderProps,
  FieldObject,
  FieldObjectRenderProps,
  FieldRenderProps,
  NO_FIELD_ERRORS,
  useForm,
} from '..';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

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
