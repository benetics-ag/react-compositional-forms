import type {FieldErrors} from '..';

export function stringifyErrors(errors: FieldErrors): string {
  return [...errors].map(e => e.message).join(', ');
}
