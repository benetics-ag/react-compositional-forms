/** A composite's children, indexed by key. */

import {Composite} from './form-descriptor';
import {Json, keyOf, PathKey, Segment} from './path';

/** One child of a composite: its key under the parent, and its value. */
export type Child = {readonly key: Segment; readonly value: unknown};

/** A composite's children by flattened key, in `decompose` order. */
export type Children = ReadonlyMap<PathKey, Child>;

type Decompose = Composite<unknown, Json, unknown>['decompose'];

const tables = new WeakMap<
  object,
  {readonly decompose: Decompose; readonly table: Children}
>();

/**
 * The children of `value` under `descriptor`.
 *
 * @param descriptor The composite that takes `value` apart.
 * @param value The composite's value.
 * @returns The children by key, in decomposition order.
 */
export function childrenOf(
  descriptor: Composite<unknown, Json, unknown>,
  value: unknown,
): Children {
  if (value === null || typeof value !== 'object') {
    return decompose(descriptor, value);
  }

  const cached = tables.get(value);
  if (cached !== undefined && cached.decompose === descriptor.decompose) {
    return cached.table;
  }
  const table = decompose(descriptor, value);
  tables.set(value, {decompose: descriptor.decompose, table});
  return table;
}

function decompose(
  descriptor: Composite<unknown, Json, unknown>,
  value: unknown,
): Children {
  const out = new Map<PathKey, Child>();
  for (const [key, child] of descriptor.decompose(value)) {
    out.set(keyOf([key]), {key, value: child});
  }
  return out;
}
