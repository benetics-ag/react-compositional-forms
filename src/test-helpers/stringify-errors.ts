import {FieldError} from '..';

export function stringifyErrors(errors: Set<FieldError>): string {
  return [...errors].map(e => e.message).join(', ');
}
