/**
 * The two structural walks over a value tree.
 *
 * Both walks recurse through a composite's children using its {@link
 * FormDescriptor}: they decompose each value tree they visit into `(key, child)`
 * pairs and align those pairs by key. {@link walkValue} computes which forms are
 * dirty; {@link rebuildKeepDirty} rebuilds a subtree's value for a
 * `keepDirtyValues` reset.
 *
 * A form's *baseline* is the value its dirtiness is measured against — normally
 * its initial value, but a frozen value for an element grown past the initial
 * structure (see {@link walkValue}).
 *
 * Absence — a position one tree holds and another lacks — is decided by key-set
 * membership, never by a sentinel value. {@link walkValue} freezes a grown
 * element and measures it against its own frozen value; {@link rebuild} carries a
 * missing initial or reset value as an absent {@link Slot}. So a leaf's `equals`
 * and a composite's `build` are only ever handed real values of the form's type,
 * never an `undefined` standing in for a missing position.
 */

import {Composite, FormDescriptor, isComposite} from './form-descriptor';
import {childPath, keyOf, Path, PathKey, ROOT, Segment} from './path';

/** The descriptor registered for the form at `path`, if any. */
export type DescriptorAt = (path: Path) => FormDescriptor | undefined;

/** The dirty set and updated frozen baselines a dirty walk produces. */
export type WalkResult = {
  /** The path key of every form that differs from its baseline. */
  readonly dirtyPrefixes: ReadonlySet<PathKey>;

  /** The frozen baselines, extended with any elements grown since the input. */
  readonly frozenInitials: ReadonlyMap<PathKey, unknown>;
};

/** A position a value tree either fills (`present`) or lacks. */
type Slot =
  | {readonly present: true; readonly value: unknown}
  | {readonly present: false};
const present = (value: unknown): Slot => ({present: true, value});
const ABSENT: Slot = {present: false};

/** Whether a leaf's own value is unchanged: its `equals`, or `Object.is`. */
function leafEquals(
  desc: FormDescriptor | undefined,
): (a: unknown, b: unknown) => boolean {
  return (desc && !isComposite(desc) && desc.equals) || Object.is;
}

/**
 * A composite's children keyed by their flattened path key, each carrying its
 * original segment (for descent and reconstruction) and its value.
 *
 * `null`/`undefined` isn't given dirtiness meaning here — that stays structural,
 * by key set. It's just not a container to take apart, so it yields no children;
 * a position that goes from `null` to a populated value reads as a grown key set.
 */
function childrenByKey(
  desc: Composite<unknown, Segment, unknown>,
  value: unknown,
): Map<PathKey, {segment: Segment; value: unknown}> {
  const out = new Map<PathKey, {segment: Segment; value: unknown}>();
  if (value == null) return out;
  for (const ref of desc.decompose(value)) {
    out.set(keyOf([ref.key]), {segment: ref.key, value: ref.read(value)});
  }
  return out;
}

/** Whether two child maps hold the same set of keys. */
function sameKeys(
  a: ReadonlyMap<PathKey, unknown>,
  b: ReadonlyMap<PathKey, unknown>,
): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/**
 * Find every dirty form in a value tree, extending the frozen baselines as new
 * collection elements appear.
 *
 * A leaf is dirty when its own value differs from its baseline by its `equals`. A
 * composite is dirty when any child is dirty or its key set differs from its
 * baseline's (an element grown or dropped). A child present in the value but
 * absent from the baseline structure — a freshly grown collection element — has
 * no baseline to measure against, so its first-seen value is frozen as its
 * baseline and added to the returned frozen map; it is therefore clean until
 * later edited, while its container is dirty in its own right.
 *
 * @param value The current value tree.
 * @param initialValue The initial value tree.
 * @param descriptorAt Look up the descriptor registered at a path.
 * @param prevFrozen The frozen baselines carried from the previous snapshot.
 * @returns The set of dirty path keys, and the frozen baselines extended with
 *   any elements grown since `prevFrozen`.
 */
export function walkValue(
  value: unknown,
  initialValue: unknown,
  descriptorAt: DescriptorAt,
  prevFrozen: ReadonlyMap<PathKey, unknown>,
): WalkResult {
  const dirty = new Set<PathKey>();
  let frozen = prevFrozen;
  const freeze = (k: PathKey, v: unknown) => {
    if (frozen === prevFrozen) frozen = new Map(prevFrozen);
    (frozen as Map<PathKey, unknown>).set(k, v);
  };

  // `grown` marks a position with no counterpart in the initial structure — a
  // collection element appended past its parent's initial children. Such a
  // position has no baseline to measure against, so its first-seen value is
  // frozen as its baseline (born clean, dirty once edited). The root is never
  // grown.
  const walk = (
    v: unknown,
    iv: unknown,
    path: Path,
    grown: boolean,
  ): boolean => {
    const fk = keyOf(path);
    let baseline = iv;
    if (frozen.has(fk)) {
      baseline = frozen.get(fk);
    } else if (grown) {
      freeze(fk, v);
      baseline = v;
    }

    if (Object.is(v, baseline)) return false; // unchanged subtree: O(1) prune

    const desc = descriptorAt(path);
    if (desc === undefined || !isComposite(desc)) {
      const isDirty = !leafEquals(desc)(v, baseline);
      if (isDirty) dirty.add(fk);
      return isDirty;
    }

    const current = childrenByKey(desc, v);
    const base = childrenByKey(desc, baseline);
    let childrenDirty = false;
    for (const [ck, {segment, value: childValue}] of current) {
      const childGrown = !base.has(ck);
      if (
        walk(
          childValue,
          // A grown child has no entry in `base`; the recursion freezes it and
          // derives its own baseline, so the value passed here is a placeholder
          // it overrides.
          childGrown ? childValue : base.get(ck)!.value,
          childPath(path, segment),
          childGrown,
        )
      ) {
        childrenDirty = true;
      }
    }

    // Own dirtiness of a composite is a change in its key set — an element grown
    // or dropped since its baseline.
    const isDirty = !sameKeys(current, base) || childrenDirty;
    if (isDirty) dirty.add(fk);
    return isDirty;
  };
  walk(value, initialValue, ROOT, false);
  return {dirtyPrefixes: dirty, frozenInitials: frozen};
}

/**
 * Build the value a `keepDirtyValues` reset should give a subtree: each form
 * within it contributes its current value where dirty against its baseline, or
 * the reset value where clean.
 *
 * `initial` and `reset` are {@link Slot}s, so a position one tree lacks is marked
 * absent rather than filled with a fabricated value. A form present in the
 * current value but absent from the initial structure — a grown collection
 * element — is a dirty addition kept whole; the walk re-freezes its baseline to
 * its kept value. Because absent positions are settled by key-set membership, a
 * leaf's `equals` is only ever called with two real values of its type.
 *
 * @param value The form's current value; always present, since only positions
 *   present in the current value are recursed into.
 * @param initial The form's initial value, absent when it grew past the initial
 *   structure.
 * @param reset The value the form is being reset to, absent where the reset does
 *   not reach.
 * @param path The form's path.
 * @param descriptorAt Look up the descriptor registered at a path.
 * @param frozen The frozen baselines a grown element measures against.
 * @returns The merged value: the current value at each dirty form, the reset
 *   value at each clean one.
 */
function rebuild(
  value: unknown,
  initial: Slot,
  reset: Slot,
  path: Path,
  descriptorAt: DescriptorAt,
  frozen: ReadonlyMap<PathKey, unknown>,
): unknown {
  const desc = descriptorAt(path);
  const fk = keyOf(path);

  // The baseline dirtiness is measured against: a grown element's frozen value,
  // else its initial. A position with neither — present in the current value but
  // absent from the initial structure and not yet frozen — is a brand-new
  // addition with nothing to merge against, kept whole.
  const baseline: Slot = frozen.has(fk) ? present(frozen.get(fk)) : initial;
  if (!baseline.present) return value;

  if (desc === undefined || !isComposite(desc)) {
    // Leaf: keep its current value when dirty against its baseline; when clean,
    // take the reset value, or keep the current value where the reset omits this
    // position. `equals` sees two real values — never an absent one.
    if (!leafEquals(desc)(value, baseline.value)) return value;
    return reset.present ? reset.value : value;
  }

  // An untouched subtree has nothing dirty to keep, so it takes the reset whole
  // (or stays as it is where the reset omits it).
  if (Object.is(value, baseline.value)) {
    return reset.present ? reset.value : value;
  }

  const current = childrenByKey(desc, value);
  const base = childrenByKey(desc, baseline.value);
  const resetChildren = reset.present
    ? childrenByKey(desc, reset.value)
    : undefined;

  // The rebuilt key set is the current one when the composite grew or shrank
  // (its own structure is dirty and wins), else the reset's (its structure wins
  // where the subtree kept its shape).
  const ownDirty = !sameKeys(current, base);
  const source = !ownDirty && resetChildren ? resetChildren : current;

  const merged: [Segment, unknown][] = [];
  for (const [ck, {segment, value: fromSource}] of source) {
    const inCurrent = current.get(ck);
    if (inCurrent === undefined) {
      // Present only in the reset (the reset added it): take the reset value.
      merged.push([segment, fromSource]);
      continue;
    }
    const childInitial: Slot = base.has(ck)
      ? present(base.get(ck)!.value)
      : ABSENT;
    const childReset: Slot = resetChildren?.has(ck)
      ? present(resetChildren.get(ck)!.value)
      : ABSENT;
    merged.push([
      inCurrent.segment,
      rebuild(
        inCurrent.value,
        childInitial,
        childReset,
        childPath(path, inCurrent.segment),
        descriptorAt,
        frozen,
      ),
    ]);
  }
  return desc.build(merged);
}

/**
 * Build the value a `keepDirtyValues` reset gives the subtree at `path`, from its
 * current value, initial value, and reset value. See {@link rebuild}.
 */
export function rebuildKeepDirty(
  value: unknown,
  initialValue: unknown,
  resetValue: unknown,
  path: Path,
  descriptorAt: DescriptorAt,
  frozen: ReadonlyMap<PathKey, unknown>,
): unknown {
  return rebuild(
    value,
    present(initialValue),
    present(resetValue),
    path,
    descriptorAt,
    frozen,
  );
}
