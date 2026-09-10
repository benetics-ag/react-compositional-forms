import React from 'react';
import {act, render} from '@testing-library/react';
import '@testing-library/jest-dom';

import {Control, useField, useFieldArray, useFieldObject, useForm} from '..';
import {renderQuietly} from '../test-helpers/render-quietly';

type Address = {city: string};

const AddressFields = ({control}: {control: Control<Address>}) => {
  const {fields} = useFieldObject({control});
  useField({control: fields.city.control});
  return null;
};

const Tags = ({control}: {control: Control<string[]>}) => {
  useFieldArray({control});
  return null;
};

describe('a combinator handed a form of another type', () => {
  it('useFieldObject names the value it received instead of a plain object', () => {
    const Form = () => {
      const {control} = useForm<{address: Address | undefined}>({
        initialValue: {address: undefined},
      });
      const {fields} = useFieldObject({control});
      return (
        // @ts-expect-error a Form<Address | undefined> is not a Form<Address>.
        <AddressFields control={fields.address.control} />
      );
    };

    expect(() => renderQuietly(<Form />)).toThrow(
      /useFieldObject.*plain object.*undefined/,
    );
  });

  it('useFieldObject rejects an array', () => {
    const Form = () => {
      const {control} = useForm<{address: Address | string[]}>({
        initialValue: {address: ['x']},
      });
      const {fields} = useFieldObject({control});
      return (
        // @ts-expect-error a Form<Address | string[]> is not a Form<Address>.
        <AddressFields control={fields.address.control} />
      );
    };

    expect(() => renderQuietly(<Form />)).toThrow(/useFieldObject.*an array/);
  });

  it('useFieldObject rejects a class instance', () => {
    class Point {
      constructor(public x = 0) {}
    }
    const PointFields = ({control}: {control: Control<Point>}) => {
      // @ts-expect-error a class instance is not a plain object.
      useFieldObject({control});
      return null;
    };
    const Form = () => {
      const {control} = useForm<{p: Point}>({initialValue: {p: new Point()}});
      const {fields} = useFieldObject({control});
      return <PointFields control={fields.p.control} />;
    };

    expect(() => renderQuietly(<Form />)).toThrow(
      /useFieldObject.*instance of Point/,
    );
  });

  it('useFieldArray names the value it received instead of an array', () => {
    const Form = () => {
      const {control} = useForm<{tags: string[] | undefined}>({
        initialValue: {tags: undefined},
      });
      const {fields} = useFieldObject({control});
      return (
        // @ts-expect-error a Form<string[] | undefined> is not a Form<string[]>.
        <Tags control={fields.tags.control} />
      );
    };

    expect(() => renderQuietly(<Form />)).toThrow(
      /useFieldArray.*an array.*undefined/,
    );
  });

  it('a mounted composite whose value is replaced by undefined reports it on the write', () => {
    let root: Control<{address: Address}> | undefined;
    const Form = () => {
      const {control} = useForm<{address: Address}>({
        initialValue: {address: {city: ''}},
      });
      root = control;
      const {fields} = useFieldObject({control});
      return <AddressFields control={fields.address.control} />;
    };
    render(<Form />);

    expect(() =>
      act(() => {
        // @ts-expect-error `undefined` is not an Address.
        root?.setValue({address: undefined});
      }),
    ).toThrow(/useFieldObject.*plain object.*undefined/);
  });
});
