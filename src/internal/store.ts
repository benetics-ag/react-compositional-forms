/**
 * The single store backing one root form, and the hub all edits flow through.
 *
 * The store owns a form's mutable state: the current value tree, the initial
 * value tree, each form's own (non-aggregated) errors, and the frozen baselines.
 * It exposes that state as an immutable {@link Snapshot} for React to subscribe
 * to. Every edit —
 * a write, a blur, a reset, a reindex — runs through one of the mutation methods,
 * which validate as the edit's scope requires, then `commit` a new snapshot and
 * notify subscribers.
 *
 * The store learns how each form behaves from the descriptors combinators
 * register with it; its dirty and reset walks consult that registry.
 */

import type {FieldErrors} from '../field-errors';
import {FieldError, NO_FIELD_ERRORS} from '../field-errors';
import {aggregateErrors, keepDirtyErrors, withEntry} from './errors';
import {
  childPath,
  clearUnder,
  isDescendantOrSelf,
  isStrictDescendant,
  keyOf,
  Path,
  pathOf,
  PathKey,
  prefixesOf,
  remapUnder,
  ROOT,
  Segment,
  segmentsEqual,
} from './path';
import {FormDescriptor, isComposite} from './form-descriptor';
import {DescriptorAt, rebuildKeepDirty, walkValue} from './traversal';

/** When a form's validators run: on every change, or only on blur. */
export type ValidationMode = 'onChange' | 'onBlur';

/**
 * How far validation runs after a write:
 *
 *   - `none` — skip validation.
 *   - `up` — validate the written form and its ancestors (a leaf edit, or an
 *     array gaining or losing an element, re-checks every rule above it).
 *   - `subtree` — validate the written form, its ancestors, and every descendant
 *     (a write that replaces a whole composite re-checks each child it replaced).
 */
export type ValidateScope = 'none' | 'up' | 'subtree';

/**
 * The whole form tree's state at one instant, replaced wholesale on every edit.
 * The store hands the latest snapshot to React's `useSyncExternalStore`, which
 * re-renders a subscriber when the slice it reads differs. Because a new snapshot
 * reuses the references of unedited subtrees, a subscriber reading an untouched
 * part gets back the same reference and skips re-rendering.
 *
 * The value trees are typed `unknown`: one store holds a whole tree of
 * heterogeneous values keyed by path, so there is no single `T` to parameterize
 * over. Each Form handle re-attaches the concrete type at its path via `read`.
 */
export type Snapshot = {
  /** The current value tree. */
  readonly value: unknown;

  /** The baseline value tree that dirtiness is measured against. */
  readonly initialValue: unknown;

  /** Each form's own (non-aggregated) validation errors, keyed by path. */
  readonly ownErrors: ReadonlyMap<PathKey, FieldErrors>;

  /**
   * Baselines for elements (leaf or composite) grown past the initial structure,
   * which have no slot in `initialValue` to compare against; see {@link walkValue}.
   *
   * These are held apart from `initialValue` rather than folded into it: a grown
   * element's own value is clean (it equals its frozen baseline) while its
   * container is dirty (its length differs from its initial length). Folding the
   * element into `initialValue` would raise the container's initial length to
   * match its current length and so hide that the container changed.
   */
  readonly frozenInitials: ReadonlyMap<PathKey, unknown>;

  /** The path key of every form that differs from its baseline. */
  readonly dirtyPrefixes: ReadonlySet<PathKey>;
};

type RegisteredForm = {
  read: (root: unknown) => unknown;
  descriptor: FormDescriptor;
};

export class FormStore {
  readonly mode: ValidationMode;
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();
  private readonly forms = new Map<PathKey, RegisteredForm>();

  constructor(initialValue: unknown, mode: ValidationMode) {
    this.mode = mode;
    const r = walkValue(
      initialValue,
      initialValue,
      this.descriptorAt,
      new Map(),
    );
    this.snapshot = {
      value: initialValue,
      initialValue,
      ownErrors: new Map(),
      frozenInitials: r.frozenInitials,
      dirtyPrefixes: r.dirtyPrefixes,
    };
  }

  private descriptorAt: DescriptorAt = path =>
    this.forms.get(keyOf(path))?.descriptor;

  // --- subscription ---------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  /**
   * Install a new snapshot from a mutation's results and notify subscribers.
   *
   * `partial` carries only the fields the mutation changed; a field absent from
   * `partial` is inherited from the current snapshot, since most edits touch one
   * or two. Absence is by key, so passing `value: undefined` still sets it.
   * The dirty set and frozen baselines are not passed in — `commit` recomputes
   * them by walking the value tree whenever the value, initial value, or seeded
   * frozen baselines changed, so they always reflect the committed value.
   *
   * A commit that changes nothing is a no-op: no snapshot is installed and no
   * subscriber is notified.
   */
  private commit(partial: Partial<Snapshot>): void {
    const prev = this.snapshot;
    // Inherit by field *presence*, not by `?? prev`: the value and initial value
    // are `unknown` and may legitimately be `undefined` or `null`, which a `??`
    // would mistake for "field omitted" and silently drop.
    const value = 'value' in partial ? partial.value : prev.value;
    const initialValue =
      'initialValue' in partial ? partial.initialValue : prev.initialValue;
    const ownErrors = partial.ownErrors ?? prev.ownErrors;
    // A caller may seed the frozen baselines (reset clears a subtree; reindex
    // shifts keys); the walk extends it with any newly-grown leaves.
    const baseFrozen = partial.frozenInitials ?? prev.frozenInitials;

    // Short-circuit an unchanged commit so subscribers don't re-render.
    if (
      value === prev.value &&
      initialValue === prev.initialValue &&
      ownErrors === prev.ownErrors &&
      baseFrozen === prev.frozenInitials
    ) {
      return;
    }

    let dirtyPrefixes = prev.dirtyPrefixes;
    let frozenInitials = baseFrozen;
    if (
      value !== prev.value ||
      initialValue !== prev.initialValue ||
      baseFrozen !== prev.frozenInitials
    ) {
      const r = walkValue(value, initialValue, this.descriptorAt, baseFrozen);
      dirtyPrefixes = r.dirtyPrefixes;
      frozenInitials = r.frozenInitials;
    }

    this.snapshot = {
      value,
      initialValue,
      ownErrors,
      frozenInitials,
      dirtyPrefixes,
    };
    for (const l of this.listeners) l();
  }

  // --- form registration ----------------------------------------------------

  /**
   * Record how the form at `path` behaves, so the walks and validation can find
   * it. `read` extracts the form's value from a root value; `descriptor`
   * declares its structure and rules. Re-registering replaces the previous
   * descriptor, so a validator closing over fresh props takes effect.
   */
  register(
    path: Path,
    read: (root: unknown) => unknown,
    descriptor: FormDescriptor,
  ): void {
    this.forms.set(keyOf(path), {read, descriptor});
  }

  /**
   * Forget the form at `path` and drop its own errors; the walks and validation
   * no longer consult it. Dropping the errors stops an unmounted form's stale
   * error from aggregating into its ancestors and holding the whole form invalid.
   */
  unregister(path: Path): void {
    this.forms.delete(keyOf(path));
    this.commit({
      ownErrors: withEntry(
        this.snapshot.ownErrors,
        keyOf(path),
        NO_FIELD_ERRORS,
      ),
    });
  }

  // --- validation cascade ---------------------------------------------------

  // Re-run the validator at `path` and at every ancestor against `rootValue`, so
  // a child's value reaching its parent re-checks each rule that spans it (an
  // array's length rule, an object's cross-field rule).
  private validateUp(
    ownErrors: ReadonlyMap<PathKey, FieldErrors>,
    path: Path,
    rootValue: unknown,
  ): ReadonlyMap<PathKey, FieldErrors> {
    for (const pk of prefixesOf(path)) {
      const form = this.forms.get(keyOf(pk));
      if (form?.descriptor.validate) {
        ownErrors = withEntry(
          ownErrors,
          keyOf(pk),
          form.descriptor.validate(form.read(rootValue)),
        );
      }
    }
    return ownErrors;
  }

  // Whether `path` still resolves to a value in `root`, following the registered
  // decompositions from the root down. A removed collection element stays
  // registered until its component unmounts a tick later, so its path can
  // outlive its value; validating it would read against a value that is gone.
  private isLive(path: Path, root: unknown): boolean {
    let cur: unknown = root;
    let prefix: Path = ROOT;
    for (const seg of path) {
      const desc = this.descriptorAt(prefix);
      if (desc === undefined || !isComposite(desc)) return false;
      let next: unknown;
      let matched = false;
      for (const ref of desc.decompose(cur)) {
        if (segmentsEqual(ref.key, seg)) {
          next = ref.read(cur);
          matched = true;
          break;
        }
      }
      if (!matched) return false;
      cur = next;
      prefix = childPath(prefix, seg);
    }
    return true;
  }

  // Re-run the validators at `path`, at every ancestor, and at every live
  // descendant against `rootValue`, so replacing a whole composite re-checks each
  // child it replaced. A descendant whose value is gone has its stale error
  // cleared instead.
  private validateSubtreeAndUp(
    ownErrors: ReadonlyMap<PathKey, FieldErrors>,
    path: Path,
    rootValue: unknown,
  ): ReadonlyMap<PathKey, FieldErrors> {
    for (const [key, form] of this.forms) {
      if (!form.descriptor.validate) continue;
      const np = pathOf(key);
      const inSubtree = isDescendantOrSelf(np, path);
      const onAncestorChain = isDescendantOrSelf(path, np);
      if (!inSubtree && !onAncestorChain) continue;
      if (inSubtree && !this.isLive(np, rootValue)) {
        ownErrors = withEntry(ownErrors, key, NO_FIELD_ERRORS);
        continue;
      }
      ownErrors = withEntry(
        ownErrors,
        key,
        form.descriptor.validate(form.read(rootValue)),
      );
    }
    return ownErrors;
  }

  // --- mutations (event time; read the latest snapshot) ---------------------

  /**
   * Replace the whole value tree with `newRootValue` and validate as far as
   * `scope` directs ({@link ValidateScope}). `path` is the form that was written:
   * `up` re-validates it and its ancestors, `subtree` also re-validates its
   * descendants, `none` skips validation. The new value is the basis of the next
   * snapshot's dirty walk.
   */
  setValue(path: Path, newRootValue: unknown, scope: ValidateScope): void {
    let ownErrors = this.snapshot.ownErrors;
    if (scope === 'up') {
      ownErrors = this.validateUp(ownErrors, path, newRootValue);
    } else if (scope === 'subtree') {
      ownErrors = this.validateSubtreeAndUp(ownErrors, path, newRootValue);
    }
    this.commit({value: newRootValue, ownErrors});
  }

  /**
   * Replace the initial value tree with `newRootInitialValue`, moving the
   * baseline that dirtiness is measured against. The current value is left as it
   * is, so a form clean before the change may read dirty after it, or the reverse.
   */
  setInitialValue(newRootInitialValue: unknown): void {
    this.commit({initialValue: newRootInitialValue});
  }

  /**
   * Signal that the form at `path` was blurred. In `onBlur` mode this validates
   * the form and its ancestors against the current value; in `onChange` mode it
   * does nothing, since those forms validate on every write.
   */
  onBlur(path: Path): void {
    if (this.mode !== 'onBlur') return;
    const ownErrors = this.validateUp(
      this.snapshot.ownErrors,
      path,
      this.snapshot.value,
    );
    this.commit({ownErrors});
  }

  /**
   * Reset the subtree at `path` to `resetSlice`, making it the subtree's new
   * initial value and clearing its errors. `read` extracts the subtree from a
   * root value and `write` produces a new root with the subtree replaced.
   *
   * `keepDirtyValues` chooses what becomes of the subtree's current value:
   *
   *   - `false` — the current value is replaced by `resetSlice`, so the subtree
   *     becomes clean.
   *   - `true` — each form within the subtree that is dirty against its current
   *     baseline keeps its value; each clean form takes the reset value. A form
   *     that kept its value stays dirty (and keeps its error); a form taken back
   *     to the reset value becomes clean.
   */
  resetForm(
    path: Path,
    read: (root: unknown) => unknown,
    write: (root: unknown, slice: unknown) => unknown,
    resetSlice: unknown,
    keepDirtyValues: boolean,
  ): void {
    const snap = this.snapshot;
    const newInitialRoot = write(snap.initialValue, resetSlice);

    if (!keepDirtyValues) {
      const newValueRoot = write(snap.value, resetSlice);
      this.commit({
        value: newValueRoot,
        initialValue: newInitialRoot,
        ownErrors: clearUnder(snap.ownErrors, path),
        // Drop the subtree's frozen baselines; the walk re-establishes any that
        // the reset value still grows past its (new) initial.
        frozenInitials: clearUnder(snap.frozenInitials, path),
      });
      return;
    }

    // keepDirtyValues: decide keep-vs-reset against the OLD baselines, then drop
    // and let the walk re-freeze kept-grown elements at their kept values.
    const newSlice = rebuildKeepDirty(
      read(snap.value),
      read(snap.initialValue),
      resetSlice,
      path,
      this.descriptorAt,
      snap.frozenInitials,
    );
    const newValueRoot = write(snap.value, newSlice);
    const clearedFrozen = clearUnder(snap.frozenInitials, path);
    const newDirty = walkValue(
      newValueRoot,
      newInitialRoot,
      this.descriptorAt,
      clearedFrozen,
    ).dirtyPrefixes;
    this.commit({
      value: newValueRoot,
      initialValue: newInitialRoot,
      ownErrors: keepDirtyErrors(snap.ownErrors, path, newDirty),
      frozenInitials: clearedFrozen,
    });
  }

  /**
   * Reindex the children of the form at `path` after they were reordered or
   * removed. `remap` maps a child's old segment to its new segment, or `null` to
   * drop it; the matching errors and frozen baselines follow each child to its new
   * position. The descriptor registrations under `path` are discarded, since the
   * moved children re-register on their next render.
   */
  remapChildren(path: Path, remap: (segment: Segment) => Segment | null): void {
    for (const key of [...this.forms.keys()]) {
      if (isStrictDescendant(pathOf(key), path)) this.forms.delete(key);
    }
    this.commit({
      ownErrors: remapUnder(this.snapshot.ownErrors, path, remap),
      frozenInitials: remapUnder(this.snapshot.frozenInitials, path, remap),
    });
  }

  /**
   * Validate every form at or below `path` against the current value and record
   * the results. Returns the union of the errors found, or
   * {@link NO_FIELD_ERRORS} when the subtree is valid.
   */
  validateSubtree(path: Path): FieldErrors {
    let ownErrors = this.snapshot.ownErrors;
    const all = new Set<FieldError>();
    for (const [key, form] of this.forms) {
      if (!form.descriptor.validate) continue;
      const np = pathOf(key);
      if (!isDescendantOrSelf(np, path)) continue;
      // A form whose value is gone — a removed or shrunk-past element still
      // registered for a tick — has its stale error cleared instead of being
      // validated against a value that no longer exists.
      if (!this.isLive(np, this.snapshot.value)) {
        ownErrors = withEntry(ownErrors, key, NO_FIELD_ERRORS);
        continue;
      }
      const errs = form.descriptor.validate(form.read(this.snapshot.value));
      ownErrors = withEntry(ownErrors, key, errs);
      for (const e of errs) all.add(e);
    }
    this.commit({ownErrors});
    return all.size > 0 ? all : NO_FIELD_ERRORS;
  }

  // --- reads ----------------------------------------------------------------

  /** Union of own errors at and below `path`. */
  aggregateErrorsAt(path: Path): FieldErrors {
    return aggregateErrors(this.snapshot.ownErrors, path);
  }

  /** This form's own errors only (excludes descendants). */
  ownErrorsAt(path: Path): FieldErrors {
    return this.snapshot.ownErrors.get(keyOf(path)) ?? NO_FIELD_ERRORS;
  }
}
