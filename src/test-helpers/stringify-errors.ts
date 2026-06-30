import {FieldError} from '..';

export function stringifyErrors(errors: ReadonlySet<FieldError>): string {
  return [...errors].map(e => e.message).join(', ');
}
