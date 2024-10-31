/**
 * Helpers for constructing validation functions for common cases.
 */

import {FieldError, NO_FIELD_ERRORS} from './field-errors';

type ValueMessage<T> = {
  value: T;
  message: string;
};

type Rule<T> = T | ValueMessage<T>;

// Optimization: share a singleton empty object to avoid creating a new object
// every time an error has no message.
const NO_MESSAGE_FIELD_ERROR: FieldError = {};

// -----------------------------------------------------------------------------
// arrayRules

type ArrayRules = {
  /** Require that the array is not empty. */
  required?: Rule<boolean>;
};

export const arrayRules = <T>({required}: ArrayRules) => {
  const validate = (value: T[]) => {
    const errors = new Set<FieldError>();

    // required
    if (required && (typeof required === 'boolean' || required.value)) {
      if (value.length === 0) {
        if (typeof required === 'object' && required.message) {
          errors.add({message: required.message});
        } else {
          errors.add(NO_MESSAGE_FIELD_ERROR);
        }
      }
    }

    if (errors.size === 0) {
      // Optimization: if there are no errors, return a singleton set instead of
      // the empty set for faster comparison by object identity.
      return NO_FIELD_ERRORS;
    }
    return errors;
  };

  return validate;
};

// -----------------------------------------------------------------------------
// stringRules

type StringRules = {
  maxLength?: Rule<number>;
  minLength?: Rule<number>;
  pattern?: Rule<RegExp>;
  required?: Rule<boolean>;
};

export const stringRules = ({
  maxLength,
  minLength,
  pattern,
  required,
}: StringRules) => {
  const validate = (value: string) => {
    // Any maxLength value must be greater than or equal to the value of
    // minLength, if present.
    if (maxLength && minLength) {
      const max = typeof maxLength === 'number' ? maxLength : maxLength.value;
      const min = typeof minLength === 'number' ? minLength : minLength.value;
      if (max < min) {
        throw new Error('maxLength must be greater than or equal to minLength');
      }
    }

    const errors = new Set<FieldError>();

    // required
    if (required && (typeof required === 'boolean' || required.value)) {
      if (value.length === 0) {
        if (typeof required === 'object' && required.message) {
          errors.add({message: required.message});
        } else {
          errors.add(NO_MESSAGE_FIELD_ERROR);
        }
      }
    }

    // If the field is required but empty we only want to add one error as
    // showing an error about the format of a field that's not filled out isn't
    // helpful to the user.
    if (value.length > 0) {
      // maxLength
      if (maxLength && (typeof maxLength === 'number' || maxLength.value)) {
        const max = typeof maxLength === 'number' ? maxLength : maxLength.value;
        if (value.length > max) {
          if (typeof maxLength === 'object' && maxLength.message) {
            errors.add({message: maxLength.message});
          } else {
            errors.add(NO_MESSAGE_FIELD_ERROR);
          }
        }
      }

      // minLength
      if (minLength && (typeof minLength === 'number' || minLength.value)) {
        const min = typeof minLength === 'number' ? minLength : minLength.value;
        if (value.length < min) {
          if (typeof minLength === 'object' && minLength.message) {
            errors.add({message: minLength.message});
          } else {
            errors.add(NO_MESSAGE_FIELD_ERROR);
          }
        }
      }

      // pattern
      if (pattern) {
        if (pattern instanceof RegExp) {
          if (!pattern.test(value)) {
            errors.add(NO_MESSAGE_FIELD_ERROR);
          }
        } else {
          if (!pattern.value.test(value)) {
            if (pattern.message) {
              errors.add({message: pattern.message});
            } else {
              errors.add(NO_MESSAGE_FIELD_ERROR);
            }
          }
        }
      }
    }

    if (errors.size === 0) {
      // Optimization: if there are no errors, return a singleton set instead of
      // the empty set for faster comparison by object identity.
      return NO_FIELD_ERRORS;
    }
    return errors;
  };

  return validate;
};

/**
 * Returns an arbitrary error from the set of errors, if any.
 *
 * @param errors The set of errors.
 * @returns An arbitrary error from the set of errors, if any.
 */
export function someError(errors: Set<FieldError>): FieldError | undefined {
  return errors.values().next().value;
}
