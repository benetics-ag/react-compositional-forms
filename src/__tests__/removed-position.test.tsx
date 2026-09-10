import React from 'react';
import {act, render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  Control,
  NO_FIELD_ERRORS,
  useField,
  useFieldArray,
  useFieldObject,
  useForm,
} from '..';
import {renderQuietly} from '../test-helpers/render-quietly';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

type Row = {n: string};

const required = (value: string) =>
  value.length > 0 ? NO_FIELD_ERRORS : new Set([{message: 'Required'}]);

const RowFields = ({control, name}: {control: Control<Row>; name: string}) => {
  const {fields} = useFieldObject({control});
  return (
    <TextField
      name={name}
      parentControl={fields.n.control}
      validate={required}
    />
  );
};

/**
 * Rows whose React key follows the row rather than its index, so a removed row
 * leaves its surviving siblings' components mounted at new positions.
 */
const Table = ({
  onRows,
  ids: initialIds,
}: {
  onRows?: (controls: Control<Row>[]) => void;
  ids: string[];
}) => {
  const {control, formState} = useForm<Row[]>({
    initialValue: initialIds.map(id => ({n: id})),
  });
  const {fields, remove} = useFieldArray({control});
  const [ids, setIds] = React.useState(initialIds);
  const [shown, setShown] = React.useState(true);
  onRows?.(fields.map(({control: rowControl}) => rowControl));

  return (
    <div>
      {shown ? (
        fields.map(({control: rowControl}, i) => (
          <RowFields key={ids[i]} control={rowControl} name={ids[i]} />
        ))
      ) : (
        <span>rows hidden</span>
      )}
      <button
        onClick={() => {
          remove(0);
          setIds(prev => prev.slice(1));
        }}
        title="remove the first row"
      />
      <button onClick={() => setShown(false)} title="hide the rows" />
      <p data-testid="error-count">{formState.errors.size}</p>
    </div>
  );
};

describe('a position the form tree no longer holds', () => {
  it("clears a moved row's errors when its component unmounts", async () => {
    render(<Table ids={['A', 'B']} />);
    await user.clear(screen.getByTestId('input-B'));
    expect(screen.getByTestId('error-count')).toHaveTextContent('1');

    // B's component stays mounted and moves down into row 0.
    await user.click(
      screen.getByRole('button', {name: 'remove the first row'}),
    );
    await user.click(screen.getByRole('button', {name: 'hide the rows'}));

    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
  });

  it('ignores a write aimed at a position that is gone', async () => {
    let rows: Control<Row>[] = [];
    render(<Table ids={['A', 'B']} onRows={controls => (rows = controls)} />);
    // The last position, which the array no longer reaches once it shrinks.
    const gone = rows[1];

    await user.click(
      screen.getByRole('button', {name: 'remove the first row'}),
    );
    await act(async () => gone.setValue({n: 'written'}));

    expect(screen.getByTestId('input-B')).toHaveValue('B');
  });

  it('reports a component that mounts with a control for a position that is gone', async () => {
    let rows: Control<Row>[] = [];
    render(<Table ids={['A', 'B']} onRows={controls => (rows = controls)} />);
    const gone = rows[1];
    await user.click(
      screen.getByRole('button', {name: 'remove the first row'}),
    );

    const Detail = ({control}: {control: Control<Row>}) => {
      const {fields} = useFieldObject({control});
      const {
        field: {value},
      } = useField({control: fields.n.control});
      return <p>{value}</p>;
    };

    expect(() => renderQuietly(<Detail control={gone} />)).toThrow(
      /no longer holds/,
    );
  });
});
