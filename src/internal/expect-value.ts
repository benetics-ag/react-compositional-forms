/**
 * A combinator applies only to a form whose value is of the kind it decomposes.
 * These report a value of any other kind, naming the combinator and what it was
 * given, in place of failing later on a value it cannot take apart.
 */

import {JsonPrimitive} from './path';

/** A short noun phrase for `value`, for error messages. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'function':
      return 'a function';
    case 'object': {
      const proto: unknown = Object.getPrototypeOf(value);
      if (proto === Object.prototype || proto === null) return 'a plain object';
      const name =
        typeof proto === 'object' &&
        proto !== null &&
        'constructor' in proto &&
        typeof proto.constructor === 'function'
          ? proto.constructor.name
          : '';
      return name === '' ? 'an object' : `an instance of ${name}`;
    }
    default:
      return `a ${typeof value}`;
  }
}

function mismatch(combinator: string, expected: string, value: unknown): Error {
  const hint =
    value instanceof Map && expected !== 'a Map'
      ? ' A Map is decomposed by useFieldMap.'
      : '';
  return new Error(
    `${combinator} decomposes ${expected}, but the form's value is ` +
      `${describeValue(value)}. A combinator applies only to a form of its own type.${hint}`,
  );
}

/** Throw unless `value` is a `Map`. */
export function expectMap(
  combinator: string,
  value: unknown,
): asserts value is ReadonlyMap<unknown, unknown> {
  if (value instanceof Map) return;
  throw mismatch(combinator, 'a Map', value);
}

/** Throw unless `key` is a JSON scalar — a finite number, if a number. */
export function expectMapKey(
  combinator: string,
  key: unknown,
): asserts key is JsonPrimitive {
  switch (typeof key) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (Number.isFinite(key)) return;
      break;
    default:
      if (key === null) return;
  }
  throw new Error(
    `${combinator} keys are strings, finite numbers, booleans, or null, but ` +
      `the map holds the key ${describeValue(key)}.`,
  );
}

/** Throw unless `value` is a plain object (prototype `Object.prototype` or `null`). */
export function expectPlainObject(
  combinator: string,
  value: unknown,
): asserts value is {[key: string]: unknown} {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) return;
  }
  throw mismatch(combinator, 'a plain object', value);
}

/** Throw unless `value` is an array. */
export function expectArray(
  combinator: string,
  value: unknown,
): asserts value is readonly unknown[] {
  if (Array.isArray(value)) return;
  throw mismatch(combinator, 'an array', value);
}
