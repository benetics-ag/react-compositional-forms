/**
 * Reading and writing one position of a value tree, named by the steps that
 * lead to it from the root.
 *
 * A position the initial value tree does not reach — one its container gained
 * later — has its initial value among the frozen baselines instead. Both
 * readers and writers of an initial value honour that, so such a position's
 * initial value can be set without touching the shape of the initial tree.
 */

import {childrenOf} from './children';
import {Composite} from './form-descriptor';
import {Json, keyOf, Path, PathKey, Segment} from './path';
import {ABSENT, present, Slot} from './slot';

/** One step from a composite to a child: the composite, and the child's key under it. */
export type Step = {
  readonly key: Segment;

  /** `keyOf([key])`, the child's key in its parent's children table. */
  readonly pathKey: PathKey;
  readonly descriptor: Composite<unknown, Json, unknown>;
};

/** The step to the child at `key` under a composite. */
export function step(
  key: Segment,
  descriptor: Composite<unknown, Json, unknown>,
): Step {
  return {key, pathKey: keyOf([key]), descriptor};
}

/** The steps from the root to a position; the root itself is the empty sequence. */
export type Steps = readonly Step[];

/** The path the steps trace. */
export function pathOfSteps(steps: Steps): Path {
  return steps.map(s => s.key);
}

/** The initial tree and the frozen baselines a position's initial value is read from. */
export type Baselines = {
  readonly initialValue: unknown;
  readonly frozenInitials: ReadonlyMap<PathKey, unknown>;
};

/**
 * Read the position at the end of `steps`, starting from `root` at step `from`.
 *
 * @returns The value there, or absent when some step's key is missing.
 */
export function readAlong(steps: Steps, root: unknown, from = 0): Slot {
  let current = root;
  for (let i = from; i < steps.length; i++) {
    const {pathKey, descriptor} = steps[i];
    const child = childrenOf(descriptor, current).get(pathKey);
    if (child === undefined) return ABSENT;
    current = child.value;
  }
  return present(current);
}

/**
 * Rebuild `root` with the position at the end of `steps` replaced by `next`,
 * starting from step `from`.
 *
 * @returns The rebuilt root, or absent when some step's key is missing.
 */
export function writeAlong(
  steps: Steps,
  root: unknown,
  next: unknown,
  from = 0,
): Slot {
  if (from === steps.length) return present(next);
  const {pathKey, descriptor} = steps[from];
  const table = childrenOf(descriptor, root);
  const child = table.get(pathKey);
  if (child === undefined) return ABSENT;
  const rebuilt = writeAlong(steps, child.value, next, from + 1);
  if (!rebuilt.present) return rebuilt;
  const entries: [Segment, unknown][] = [];
  for (const [k, c] of table) {
    entries.push([c.key, k === pathKey ? rebuilt.value : c.value]);
  }
  return present(descriptor.build(entries));
}

// The longest frozen prefix of `steps`: the nearest grown ancestor (or the
// position itself), whose frozen value replaces the initial tree beneath it.
function frozenPrefix(
  steps: Steps,
  frozen: ReadonlyMap<PathKey, unknown>,
): {readonly length: number; readonly key: PathKey} | undefined {
  for (let length = steps.length; length >= 1; length--) {
    const key = keyOf(pathOfSteps(steps.slice(0, length)));
    if (frozen.has(key)) return {length, key};
  }
  return undefined;
}

/** Read the initial value of the position at the end of `steps`. */
export function readInitial(steps: Steps, baselines: Baselines): Slot {
  const prefix = frozenPrefix(steps, baselines.frozenInitials);
  return prefix === undefined
    ? readAlong(steps, baselines.initialValue)
    : readAlong(steps, baselines.frozenInitials.get(prefix.key), prefix.length);
}

/**
 * Set the initial value of the position at the end of `steps` to `next`.
 *
 * @returns The updated baselines, or absent when the position is missing.
 */
export function writeInitial(
  steps: Steps,
  baselines: Baselines,
  next: unknown,
): Slot<Baselines> {
  const {initialValue, frozenInitials} = baselines;
  const prefix = frozenPrefix(steps, frozenInitials);
  if (prefix === undefined) {
    const rebuilt = writeAlong(steps, initialValue, next);
    return rebuilt.present
      ? present({initialValue: rebuilt.value, frozenInitials})
      : ABSENT;
  }
  const rebuilt = writeAlong(
    steps,
    frozenInitials.get(prefix.key),
    next,
    prefix.length,
  );
  if (!rebuilt.present) return ABSENT;
  const nextFrozen = new Map(frozenInitials);
  nextFrozen.set(prefix.key, rebuilt.value);
  return present({initialValue, frozenInitials: nextFrozen});
}
