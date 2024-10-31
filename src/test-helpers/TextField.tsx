import React from 'react';

import {Control, FieldError, useField} from '..';
import {stringifyErrors} from './stringify-errors';

export type TextFieldProps = {
  name: string;
  parentControl: Control<string>;
  validate?: (value: string) => Set<FieldError>;
};

const TextField = ({name, parentControl, validate}: TextFieldProps) => {
  const {
    fieldState: {errors, isDirty},
    field: {onBlur, onChange, value},
  } = useField({
    control: parentControl,
    validate,
  });

  return (
    <div>
      <input
        onBlur={onBlur}
        onChange={e => onChange(e.target.value)}
        value={value}
        data-testid={`input-${name}`}
      />
      {isDirty ? <p>Field {name} dirty</p> : null}
      {errors.size > 0 ? (
        <p>
          Field {name} errors: {stringifyErrors(errors)}
        </p>
      ) : null}
    </div>
  );
};

export default TextField;
