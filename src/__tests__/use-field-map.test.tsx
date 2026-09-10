import React from 'react';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';

import {
  Control,
  type FieldErrors,
  NO_FIELD_ERRORS,
  useFieldMap,
  useFieldObject,
  useForm,
} from '..';
import {renderQuietly} from '../test-helpers/render-quietly';
import {stringifyErrors} from '../test-helpers/stringify-errors';
import TextField from '../test-helpers/TextField';

jest.useFakeTimers();
const user = userEvent.setup({advanceTimers: jest.advanceTimersByTime});

const MapTest = ({
  initialValue = new Map([['a', '']]),
  resetTo,
  keepDirtyValues = false,
  validate,
}: {
  initialValue?: Map<string, string>;
  resetTo?: Map<string, string>;
  keepDirtyValues?: boolean;
  validate?: (value: Map<string, string>) => FieldErrors;
}) => {
  const init = React.useRef(initialValue);
  const {
    control,
    formState: {isDirty: formIsDirty, isValid: formIsValid},
    reset,
    value,
  } = useForm<Map<string, string>>({initialValue: init.current});
  const {
    clear,
    delete: del,
    errors,
    fields,
    set,
  } = useFieldMap({
    control,
    validate,
  });

  return (
    <div>
      {[...fields].map(([key, {control: controlField}]) => (
        <div key={key}>
          <TextField
            name={key}
            parentControl={controlField}
            validate={value =>
              value.length > 0
                ? NO_FIELD_ERRORS
                : new Set([{message: 'Required'}])
            }
          />
          <button onClick={() => del(key)} title={`delete ${key}`} />
        </div>
      ))}
      <button onClick={() => set('new', 'v')} title="set new" />
      <button onClick={() => set('a', 'replaced')} title="replace a" />
      <button onClick={() => set('a', '')} title="blank a" />
      <button onClick={() => clear()} title="clear" />
      <button
        onClick={() => reset(resetTo ?? init.current, {keepDirtyValues})}
        title="reset"
      />
      <p>keys: {[...fields.keys()].join(',')}</p>
      <p>Form: {JSON.stringify([...value])}</p>
      {formIsDirty ? <p>Form dirty</p> : null}
      {formIsValid ? <p>Form valid</p> : null}
      {errors.size > 0 ? <p>Map errors: {stringifyErrors(errors)}</p> : null}
    </div>
  );
};

// A dictionary — an index-signature type — is a Map to this library, so
// `useFieldObject` rejects it when the file is type-checked.
const Dictionary = ({control}: {control: Control<Record<string, string>>}) => {
  // @ts-expect-error a dictionary's keys come and go; that is a Map.
  useFieldObject({control});
  return null;
};
void Dictionary;

describe('FieldMap', () => {
  describe('initial state', () => {
    it('has a field per key, in insertion order', () => {
      render(
        <MapTest
          initialValue={
            new Map([
              ['b', ''],
              ['a', ''],
            ])
          }
        />,
      );

      expect(screen.getByText('keys: b,a')).toBeTruthy();
    });

    it('has clean state', () => {
      render(<MapTest />);

      expect(screen.queryByText('Form dirty')).toBeNull();
    });
  });

  describe('onChange', () => {
    it('updates the value under the key', async () => {
      render(<MapTest />);

      await user.type(screen.getByTestId('input-a'), 'x');

      expect(screen.getByText('Form: [["a","x"]]')).toBeTruthy();
    });
  });

  describe('set', () => {
    it('adds a key with the given value', async () => {
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'set new'}));

      expect(screen.getByText('keys: a,new')).toBeTruthy();
      expect(screen.getByTestId('input-new')).toHaveValue('v');
    });

    it('adds the key clean while the map is dirty for having grown', async () => {
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'set new'}));

      expect(screen.queryByText('Field new dirty')).toBeNull();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('replaces the value of an existing key', async () => {
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'replace a'}));

      expect(screen.getByTestId('input-a')).toHaveValue('replaced');
      expect(screen.getByText('Field a dirty')).toBeTruthy();
    });

    it('validates a replaced entry', async () => {
      render(<MapTest initialValue={new Map([['a', 'x']])} />);

      await user.click(screen.getByRole('button', {name: 'blank a'}));

      expect(screen.getByText('Field a errors: Required')).toBeTruthy();
    });
  });

  describe('delete', () => {
    it('removes the key', async () => {
      render(
        <MapTest
          initialValue={
            new Map([
              ['a', ''],
              ['b', ''],
            ])
          }
        />,
      );

      await user.click(screen.getByRole('button', {name: 'delete a'}));

      expect(screen.getByText('keys: b')).toBeTruthy();
      expect(screen.queryByTestId('input-a')).toBeNull();
    });

    it('marks the map dirty', async () => {
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'delete a'}));

      expect(screen.getByText('Form dirty')).toBeTruthy();
    });

    it('adds a deleted key back clean at the value it is added with', async () => {
      // `new` is added (clean at 'v'), deleted, and added again at 'v': it is
      // measured against the value it was last added with, not a stale one.
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'set new'}));
      await user.type(screen.getByTestId('input-new'), 'x');
      await user.click(screen.getByRole('button', {name: 'delete new'}));
      await user.click(screen.getByRole('button', {name: 'set new'}));

      expect(screen.getByTestId('input-new')).toHaveValue('v');
      expect(screen.queryByText('Field new dirty')).toBeNull();
    });
  });

  describe('clear', () => {
    it('removes every key', async () => {
      render(<MapTest />);

      await user.click(screen.getByRole('button', {name: 'clear'}));

      expect(screen.getByText('keys:')).toBeTruthy();
      expect(screen.getByText('Form dirty')).toBeTruthy();
    });
  });

  describe('validate', () => {
    it('validates the map', async () => {
      render(
        <MapTest
          validate={value =>
            value.size >= 2
              ? NO_FIELD_ERRORS
              : new Set([{message: 'At least two'}])
          }
        />,
      );

      await user.type(screen.getByTestId('input-a'), 'x');
      expect(screen.getByText('Map errors: At least two')).toBeTruthy();

      await user.click(screen.getByRole('button', {name: 'set new'}));
      expect(screen.queryByText(/Map errors/)).toBeNull();
    });
  });

  describe('reset', () => {
    it('grows the field set to match a reset that adds keys', async () => {
      render(
        <MapTest
          initialValue={new Map([['a', '']])}
          resetTo={
            new Map([
              ['a', ''],
              ['b', ''],
            ])
          }
          keepDirtyValues
        />,
      );

      // Edit `a` so the form is dirty when the key set changes.
      await user.type(screen.getByTestId('input-a'), 'x');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByText('keys: a,b')).toBeTruthy();
      expect(screen.getByTestId('input-a')).toHaveValue('x');
      expect(screen.getByTestId('input-b')).toHaveValue('');
    });

    it('shrinks the field set to match a reset that drops keys', async () => {
      render(
        <MapTest
          initialValue={
            new Map([
              ['a', ''],
              ['b', ''],
            ])
          }
          resetTo={new Map([['a', '']])}
          keepDirtyValues
        />,
      );

      await user.type(screen.getByTestId('input-a'), 'x');
      await user.click(screen.getByRole('button', {name: 'reset'}));

      expect(screen.getByText('keys: a')).toBeTruthy();
      expect(screen.queryByTestId('input-b')).toBeNull();
      expect(screen.getByTestId('input-a')).toHaveValue('x');
    });
  });

  describe('keys', () => {
    it('tells a number key from the same digits as a string', () => {
      const Form = () => {
        const {control} = useForm<Map<string | number, string>>({
          initialValue: new Map<string | number, string>([
            [1, 'number'],
            ['1', 'string'],
          ]),
        });
        const {fields} = useFieldMap({control});
        return (
          <div>
            {[...fields].map(([key, {control: c}]) => (
              <TextField
                key={`${typeof key}-${key}`}
                name={`${typeof key}-${key}`}
                parentControl={c}
              />
            ))}
          </div>
        );
      };

      render(<Form />);

      expect(screen.getByTestId('input-number-1')).toHaveValue('number');
      expect(screen.getByTestId('input-string-1')).toHaveValue('string');
    });

    it('rejects a number key that is not finite', () => {
      const Form = () => {
        const {control} = useForm<Map<number, string>>({
          initialValue: new Map([[NaN, 'x']]),
        });
        useFieldMap({control});
        return null;
      };

      expect(() => renderQuietly(<Form />)).toThrow(/useFieldMap.*finite/);
    });
  });

  describe('type mismatches', () => {
    it('names the value it received instead of a Map', () => {
      const Fields = ({control}: {control: Control<Map<string, string>>}) => {
        useFieldMap({control});
        return null;
      };
      const Form = () => {
        const {control} = useForm<{m: Map<string, string> | undefined}>({
          initialValue: {m: undefined},
        });
        const {fields} = useFieldObject({control});
        return (
          // @ts-expect-error a Form<Map | undefined> is not a Form<Map>.
          <Fields control={fields.m.control} />
        );
      };

      expect(() => renderQuietly(<Form />)).toThrow(
        /useFieldMap.*a Map.*undefined/,
      );
    });

    it('useFieldObject handed a Map points at useFieldMap', () => {
      const Fields = ({control}: {control: Control<{a: string}>}) => {
        useFieldObject({control});
        return null;
      };
      const Form = () => {
        const {control} = useForm<{m: Map<string, string> | {a: string}}>({
          initialValue: {m: new Map([['a', '']])},
        });
        const {fields} = useFieldObject({control});
        return (
          // @ts-expect-error a Form<Map | {a: string}> is not a Form<{a: string}>.
          <Fields control={fields.m.control} />
        );
      };

      expect(() => renderQuietly(<Form />)).toThrow(/useFieldMap/);
    });
  });
});
