/**
 * The two structural walks over a value tree.
 *
 * Both walks recurse through a form's children using its {@link FormDescriptor}.
 * {@link walkValue} computes which forms are dirty;
 * {@link rebuildKeepDirty} rebuilds a subtree's value for a `keepDirtyValues`
 * reset.
 *
 * A form's *baseline* is the value its dirtiness is measured against — normally
 * its initial value, but a frozen value for an element grown past the initial
 * structure (see {@link walkValue}).
 */

import {FormDescriptor} from './form-descriptor';
import {childPath, keyOf, Path, PathKey, ROOT} from './path';

/** The descriptor registered for the form at `path`, if any. */
export type DescriptorAt = (path: Path) => FormDescriptor | undefined;

/** The dirty set and updated frozen baselines a dirty walk produces. */
export type WalkResult = {
  /** The path key of every form that differs from its baseline. */
  readonly dirtyPrefixes: ReadonlySet<PathKey>;

  /** The frozen baselines, extended with any elements grown since the input. */
  readonly frozenInitials: ReadonlyMap<PathKey, unknown>;
};

/**
 * A form's own equality, ignoring its children: the `equals` its descriptor
 * declares, or `Object.is` when it declares none — including before the form's
 * descriptor has registered.
 */
function ownEquals(
  desc: FormDescriptor | undefined,
): (a: unknown, b: unknown) => boolean {
  return desc?.equals ?? Object.is;
}

/**
 * Find every dirty form in a value tree, extending the frozen baselines as new
 * collection elements appear.
 *
 * A form is dirty when its own value differs from its baseline (by its descriptor
 * rule) or when any descendant is dirty. A leaf within the initial structure
 * measures against its slot in `initialValue`; a leaf present in the value but
 * absent from the initial structure — a freshly grown collection element — has no
 * such slot, so its first-seen value is frozen as its baseline and added to the
 * returned frozen map. A grown element is therefore clean until later edited,
 * while its container is dirty in its own right (an array's length differs).
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
  // position has no initial slot to measure against, so its first-seen value is
  // frozen as its baseline (born clean, dirty once edited). The root is never
  // grown, and a position present in the initial structure measures against its
  // initial value even when that value is `undefined`.
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
    const children = desc?.decompose?.(v) ?? [];
    // The child segments the baseline holds. A child of `v` whose segment is
    // absent here has grown past the initial structure.
    const baselineSegments = new Set(
      (baseline == null ? undefined : desc?.decompose?.(baseline))?.map(ref =>
        keyOf([ref.segment]),
      ) ?? [],
    );
    let childrenDirty = false;
    for (const ref of children) {
      const childGrown = !baselineSegments.has(keyOf([ref.segment]));
      if (
        walk(
          ref.read(v),
          childGrown ? undefined : ref.read(baseline),
          childPath(path, ref.segment),
          childGrown,
        )
      ) {
        childrenDirty = true;
      }
    }

    const isDirty = !ownEquals(desc)(v, baseline) || childrenDirty;
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
 * @param oldValue The form's current value.
 * @param oldInitial The form's current initial value.
 * @param resetValue The value the form is being reset to.
 * @param path The form's path.
 * @param descriptorAt Look up the descriptor registered at a path.
 * @param frozen The frozen baselines a grown element measures against.
 * @returns The merged value: the current value at each dirty form, the reset
 *   value at each clean one.
 */
export function rebuildKeepDirty(
  oldValue: unknown,
  oldInitial: unknown,
  resetValue: unknown,
  path: Path,
  descriptorAt: DescriptorAt,
  frozen: ReadonlyMap<PathKey, unknown>,
): unknown {
  const desc = descriptorAt(path);

  // A grown element's baseline is its frozen value, not the (absent) initial.
  const baseline = frozen.has(keyOf(path))
    ? frozen.get(keyOf(path))
    : oldInitial;
  const children = desc?.decompose?.(oldValue) ?? [];

  if (children.length === 0) {
    // Leaf: keep its current value when dirty against its baseline, else reset.
    return ownEquals(desc)(oldValue, baseline) ? resetValue : oldValue;
  }

  // An untouched subtree has nothing dirty to keep, so it takes the reset whole.
  if (Object.is(oldValue, oldInitial)) return resetValue;

  if (desc?.rebuild) {
    return desc.rebuild(
      oldValue,
      oldInitial,
      resetValue,
      (segment, childOld, childInit, childReset) =>
        rebuildKeepDirty(
          childOld,
          childInit,
          childReset,
          childPath(path, segment),
          descriptorAt,
          frozen,
        ),
    );
  }

  // A composite with no rebuild rule can't merge children, so it keeps or resets
  // as a whole, comparing against its baseline by its own equality.
  return ownEquals(desc)(oldValue, baseline) ? resetValue : oldValue;
}
