/**
 * The single store backing one root form, and the hub all edits flow through.
 *
 * The store owns a form's mutable state: the current value tree, the initial
 * value tree, each form's own (non-aggregated) errors, and the frozen baselines.
 * It exposes that state as an immutable {@link Snapshot} for React to subscribe
 * to. Every edit — a write, a blur, a reset, a restructuring — runs through one
 * of the mutation methods, which validate as the edit's scope requires, then
 * `commit` a new snapshot and notify subscribers.
 *
 * A position is addressed by the {@link Steps} that reach it from the root. An
 * edit or validation aimed at a position the latest value no longer holds does
 * nothing: the latest committed structure wins.
 *
 * The store learns how each form behaves from the descriptors combinators
 * register with it; its dirty and reset walks consult that registry.
 */

import type {FieldErrors} from '../field-errors';
import {FieldError, NO_FIELD_ERRORS} from '../field-errors';
import {childrenOf} from './children';
import {aggregateErrors, keepDirtyErrors, withEntry} from './errors';
import {FormDescriptor, isComposite} from './form-descriptor';
import {
  pathOfSteps,
  readAlong,
  readInitial,
  step,
  Steps,
  writeAlong,
  writeInitial,
} from './lens';
import {
  clearUnder,
  isDescendantOrSelf,
  isStrictDescendant,
  Json,
  keyOf,
  Path,
  pathOf,
  PathKey,
  prefixesOf,
  remapUnder,
  Segment,
  segmentsEqual,
  splitUnder,
} from './path';
import {Slot} from './slot';
import {
  DescriptorAt,
  leafEquals,
  rebuildKeepDirty,
  walkValue,
} from './traversal';

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
 * over. Each Form handle re-attaches the concrete type at its position.
 */
export type Snapshot = {
  /** The current value tree. */
  readonly value: unknown;

  /** The initial value tree that dirtiness is measured against. */
  readonly initialValue: unknown;

  /** Each form's own (non-aggregated) validation errors, keyed by path. */
  readonly ownErrors: ReadonlyMap<PathKey, FieldErrors>;

  /**
   * The initial value of each position the initial value tree does not reach —
   * one its container gained after that tree was set. Such a position is
   * measured against the value it was gained with, while its container counts
   * as changed for having gained it.
   */
  readonly frozenInitials: ReadonlyMap<PathKey, unknown>;

  /** The path key of every form that differs from its baseline. */
  readonly dirtyPrefixes: ReadonlySet<PathKey>;
};

/**
 * The identity of whoever declared a form's behaviour. Hold one per declarer:
 * declaring again through it replaces that declarer's declaration, and it is
 * what withdraws the declaration afterwards.
 */
export class Registration {
  private declare readonly brand: never;
}

/** A new value for a composite, with how its existing children moved under it. */
export type Restructure<T, Key extends Json> = {
  readonly value: T;

  /** A child's new key, or `null` when the child is gone. */
  remap(key: Key): Key | null;
};

type RegisteredForm = {
  readonly steps: Steps;
  readonly descriptor: FormDescriptor;
  readonly registration: Registration;
};

export class FormStore {
  readonly mode: ValidationMode;
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();
  private forms = new Map<PathKey, RegisteredForm>();
  private readonly registeredAt = new WeakMap<Registration, PathKey>();

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
    // `undefined` is a legal value for a form to hold, so an omitted field
    // cannot be told from a written one by its value.
    const value = 'value' in partial ? partial.value : prev.value;
    const initialValue =
      'initialValue' in partial ? partial.initialValue : prev.initialValue;
    const ownErrors = partial.ownErrors ?? prev.ownErrors;
    const baseFrozen = partial.frozenInitials ?? prev.frozenInitials;

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
   * Record how the form at `steps` behaves, so the walks and validation apply
   * its rules. The latest declaration for a position is the one in force.
   */
  register(
    steps: Steps,
    descriptor: FormDescriptor,
    registration: Registration,
  ): void {
    const key = keyOf(pathOfSteps(steps));
    this.forms.set(key, {steps, descriptor, registration});
    this.registeredAt.set(registration, key);
  }

  /**
   * Withdraw the declaration made through `registration`, wherever the form has
   * moved to since, and drop that form's own errors, so a form no longer being
   * edited cannot hold its ancestors invalid. A declaration since replaced by
   * another registration stands.
   */
  unregister(registration: Registration): void {
    const key = this.registeredAt.get(registration);
    if (key === undefined || this.forms.get(key)?.registration !== registration)
      return;
    this.forms.delete(key);
    this.registeredAt.delete(registration);
    this.commit({
      ownErrors: withEntry(this.snapshot.ownErrors, key, NO_FIELD_ERRORS),
    });
  }

  // --- validation cascade ---------------------------------------------------

  // Re-run the validator at `path` and at every ancestor against `rootValue`, so
  // a child's value reaching its parent re-checks each rule that spans it (an
  // array's length rule, an object's cross-field rule). A form whose position
  // `rootValue` lacks is skipped.
  private validateUp(
    ownErrors: ReadonlyMap<PathKey, FieldErrors>,
    path: Path,
    rootValue: unknown,
  ): ReadonlyMap<PathKey, FieldErrors> {
    for (const pk of prefixesOf(path)) {
      const form = this.forms.get(keyOf(pk));
      if (!form?.descriptor.validate) continue;
      const slot = readAlong(form.steps, rootValue);
      if (!slot.present) continue;
      ownErrors = withEntry(
        ownErrors,
        keyOf(pk),
        form.descriptor.validate(slot.value),
      );
    }
    return ownErrors;
  }

  // Re-run the validators at `path`, at every ancestor, and at every descendant
  // `rootValue` still holds, so replacing a whole composite re-checks each child
  // it replaced. A descendant whose position is gone has its stale error cleared
  // instead.
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
      const slot = readAlong(form.steps, rootValue);
      if (!slot.present) {
        if (inSubtree) ownErrors = withEntry(ownErrors, key, NO_FIELD_ERRORS);
        continue;
      }
      ownErrors = withEntry(
        ownErrors,
        key,
        form.descriptor.validate(slot.value),
      );
    }
    return ownErrors;
  }

  private validateAs(
    ownErrors: ReadonlyMap<PathKey, FieldErrors>,
    path: Path,
    rootValue: unknown,
    scope: ValidateScope,
  ): ReadonlyMap<PathKey, FieldErrors> {
    switch (scope) {
      case 'none':
        return ownErrors;
      case 'up':
        return this.validateUp(ownErrors, path, rootValue);
      case 'subtree':
        return this.validateSubtreeAndUp(ownErrors, path, rootValue);
      default:
        return scope satisfies never;
    }
  }

  // --- mutations (event time; read the latest snapshot) ---------------------

  /**
   * Write `next` at `steps` and validate as far as `scope` directs
   * ({@link ValidateScope}). A value equal to the current one under the form's
   * own equality is not a change: nothing is committed or validated. Writing a
   * position the value no longer holds does nothing.
   */
  setValue(steps: Steps, next: unknown, scope: ValidateScope): void {
    const current = readAlong(steps, this.snapshot.value);
    if (!current.present) return;
    const path = pathOfSteps(steps);
    if (leafEquals(this.descriptorAt(path))(next, current.value)) return;
    const rebuilt = writeAlong(steps, this.snapshot.value, next);
    if (!rebuilt.present) return;
    this.commit({
      value: rebuilt.value,
      ownErrors: this.validateAs(
        this.snapshot.ownErrors,
        path,
        rebuilt.value,
        scope,
      ),
    });
  }

  /**
   * Replace the composite at `steps` with `edit.value`, moving each existing
   * child's registration, own errors, and frozen baseline to the key
   * `edit.remap` gives it; a child it maps to `null` loses all three. Validates
   * the composite and its ancestors.
   */
  restructure(steps: Steps, edit: Restructure<unknown, Segment>): void {
    const snap = this.snapshot;
    const rebuilt = writeAlong(steps, snap.value, edit.value);
    if (!rebuilt.present || rebuilt.value === snap.value) return;
    const path = pathOfSteps(steps);
    const forms = new Map<PathKey, RegisteredForm>();
    for (const [key, form] of this.forms) {
      const formPath = pathOf(key);
      if (!isStrictDescendant(formPath, path)) {
        forms.set(key, form);
        continue;
      }
      const {seg, tail} = splitUnder(formPath, path);
      const moved = edit.remap(seg);
      if (moved === null) {
        this.registeredAt.delete(form.registration);
        continue;
      }
      const movedKey = keyOf([...path, moved, ...tail]);
      forms.set(movedKey, {
        ...form,
        steps: form.steps.map((s, i) =>
          i === path.length ? step(moved, s.descriptor) : s,
        ),
      });
      this.registeredAt.set(form.registration, movedKey);
    }
    this.forms = forms;
    const remap = (key: Segment) => edit.remap(key);
    this.commit({
      value: rebuilt.value,
      ownErrors: this.validateUp(
        remapUnder(snap.ownErrors, path, remap),
        path,
        rebuilt.value,
      ),
      frozenInitials: this.baselinesAfter(steps, edit, snap),
    });
  }

  // The initial values in force once `edit` has moved the children of the
  // composite at `steps`. A child that moved is measured against the initial
  // value it had before the move, which the initial value tree still holds at
  // its old key, so that value is frozen at its new one.
  private baselinesAfter(
    steps: Steps,
    edit: Restructure<unknown, Segment>,
    snap: Snapshot,
  ): ReadonlyMap<PathKey, unknown> {
    const path = pathOfSteps(steps);
    const frozen = new Map(
      remapUnder(snap.frozenInitials, path, key => edit.remap(key)),
    );
    const descriptor = this.descriptorAt(path);
    if (descriptor === undefined || !isComposite(descriptor)) return frozen;
    const composite = readAlong(steps, snap.value);
    if (!composite.present) return frozen;

    for (const {key} of childrenOf(descriptor, composite.value).values()) {
      const moved = edit.remap(key);
      if (moved === null || segmentsEqual(moved, key)) continue;
      const movedKey = keyOf([...path, moved]);
      if (frozen.has(movedKey)) continue;
      const initial = readInitial([...steps, step(key, descriptor)], snap);
      if (initial.present) frozen.set(movedKey, initial.value);
    }
    return frozen;
  }

  /**
   * Set the initial value at `steps` to `next`, moving the baseline that
   * dirtiness is measured against. The current value is left as it is, so a form
   * clean before the change may read dirty after it, or the reverse.
   */
  setInitialValue(steps: Steps, next: unknown): void {
    const baselines = writeInitial(steps, this.snapshot, next);
    if (!baselines.present) return;
    const {initialValue, frozenInitials} = baselines.value;
    this.commit({
      initialValue,
      frozenInitials: remapUnder(
        frozenInitials,
        pathOfSteps(steps),
        () => null,
      ),
    });
  }

  /**
   * Signal that the form at `steps` was blurred. In `onBlur` mode this validates
   * the form and its ancestors against the current value; in `onChange` mode
   * those forms validate on every write, so it does nothing. Blurring a position
   * the value no longer holds does nothing.
   */
  onBlur(steps: Steps): void {
    if (this.mode !== 'onBlur') return;
    if (!readAlong(steps, this.snapshot.value).present) return;
    const ownErrors = this.validateUp(
      this.snapshot.ownErrors,
      pathOfSteps(steps),
      this.snapshot.value,
    );
    this.commit({ownErrors});
  }

  /**
   * Reset the subtree at `steps` to `resetSlice`, making it the subtree's new
   * initial value and clearing its errors.
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
  resetForm(steps: Steps, resetSlice: unknown, keepDirtyValues: boolean): void {
    const snap = this.snapshot;
    const current = readAlong(steps, snap.value);
    if (!current.present) return;
    const baselines = writeInitial(steps, snap, resetSlice);
    if (!baselines.present) return;
    const path = pathOfSteps(steps);
    // The reset value is the subtree's whole new baseline, so anything frozen
    // below the position is superseded; the walk re-freezes what still grows
    // past it.
    const frozenInitials = remapUnder(
      baselines.value.frozenInitials,
      path,
      () => null,
    );

    if (!keepDirtyValues) {
      const rebuilt = writeAlong(steps, snap.value, resetSlice);
      if (!rebuilt.present) return;
      this.commit({
        value: rebuilt.value,
        initialValue: baselines.value.initialValue,
        ownErrors: clearUnder(snap.ownErrors, path),
        frozenInitials,
      });
      return;
    }

    // Decide keep-vs-reset against the baselines in force before the reset.
    const newSlice = rebuildKeepDirty(
      current.value,
      readInitial(steps, snap),
      resetSlice,
      path,
      this.descriptorAt,
      snap.frozenInitials,
    );
    const rebuilt = writeAlong(steps, snap.value, newSlice);
    if (!rebuilt.present) return;
    const newDirty = walkValue(
      rebuilt.value,
      baselines.value.initialValue,
      this.descriptorAt,
      frozenInitials,
    ).dirtyPrefixes;
    this.commit({
      value: rebuilt.value,
      initialValue: baselines.value.initialValue,
      ownErrors: keepDirtyErrors(snap.ownErrors, path, newDirty),
      frozenInitials,
    });
  }

  /** Reset the subtree at `steps` to its current initial value; see {@link resetForm}. */
  resetToInitial(steps: Steps, keepDirtyValues: boolean): void {
    const initial = readInitial(steps, this.snapshot);
    if (!initial.present) return;
    this.resetForm(steps, initial.value, keepDirtyValues);
  }

  /**
   * Validate every form at or below `path` that the current value holds and
   * record the results; a form whose position is gone has its stale error
   * cleared instead. Returns the union of the errors found, or
   * {@link NO_FIELD_ERRORS} when the subtree is valid.
   */
  validateSubtree(path: Path): FieldErrors {
    let ownErrors = this.snapshot.ownErrors;
    const all = new Set<FieldError>();
    for (const [key, form] of this.forms) {
      if (!form.descriptor.validate) continue;
      const np = pathOf(key);
      if (!isDescendantOrSelf(np, path)) continue;
      const slot = readAlong(form.steps, this.snapshot.value);
      if (!slot.present) {
        ownErrors = withEntry(ownErrors, key, NO_FIELD_ERRORS);
        continue;
      }
      const errs = form.descriptor.validate(slot.value);
      ownErrors = withEntry(ownErrors, key, errs);
      for (const e of errs) all.add(e);
    }
    this.commit({ownErrors});
    return all.size > 0 ? all : NO_FIELD_ERRORS;
  }

  // --- reads ----------------------------------------------------------------

  /** The current value at `steps`, or absent when the position is gone. */
  readAt(steps: Steps): Slot {
    return readAlong(steps, this.snapshot.value);
  }

  /** The initial value at `steps`, or absent when the position is gone. */
  readInitialAt(steps: Steps): Slot {
    return readInitial(steps, this.snapshot);
  }

  /** Whether the form at `path` differs from its baseline. */
  isDirtyAt(path: Path): boolean {
    return this.snapshot.dirtyPrefixes.has(keyOf(path));
  }

  /** Union of own errors at and below `path`. */
  aggregateErrorsAt(path: Path): FieldErrors {
    return aggregateErrors(this.snapshot.ownErrors, path);
  }

  /** This form's own errors only (excludes descendants). */
  ownErrorsAt(path: Path): FieldErrors {
    return this.snapshot.ownErrors.get(keyOf(path)) ?? NO_FIELD_ERRORS;
  }
}
