---
status: accepted
---

# A per-root external store, read via `useSyncExternalStore`, traversed by combinator descriptors

## Context

[ADR-0001](0001-compositional-form-architecture.md) forbids three user-observable
failures — zombie children, stale state, tearing — and requires composition stay
open-closed (a new form type is new code, never a core edit). Both requirements
pull against React's defaults.

The intuitive React implementation — each form holds its own `useState`,
value flows down as props, changes bubble up through callbacks — cannot meet them.
State spread across components does not compose within a single event: two writes
in one tick read the same stale render snapshot and clobber each other. Forcing it
to compose (mirroring each value into a `useRef`, or having parents reach into
children imperatively) is fragile to maintain and still tears under concurrent
rendering. The shipped `src/` is this design.

## Decision

A form's state — value, initial value, and per-form errors — lives in **one mutable
store per root form**, which components read through **`useSyncExternalStore`**. The
store is the single source of truth; React keeps no copy of it. Writes mutate the
store synchronously and commit a new immutable snapshot, so successive writes in one
tick compose against the latest value (no stale state) and every subscriber in a
commit observes one snapshot (no tearing).

The store's whole-tree operations — the dirty computation and the `keepDirtyValues`
reset — **dispatch to a descriptor each combinator registers for its own form**
(its equality, how it decomposes into children, its structural dirty rule, its
reset rule), never to a built-in switch over array/object/map. A new container
type is therefore a new combinator file, with no edit to the core.

## Considered options

- **Per-form `useState` with push aggregation** (the shipped `src/`). Rejected:
  cross-form writes do not compose in a tick (stale state), and the fixes are
  fragile and still tear under concurrent rendering.
- **A store, but the dirty/reset walks `switch` on built-in types** (no
  descriptors). Tear-free and simpler, but a new type requires editing the core —
  fails ADR-0001's open-closed rule.
- **A store with central value but dirty pushed bottom-up** (no central dirty
  walk). Rejected: it adds an extra render pass per nesting level on every edit,
  grows the combinator surface, and *still* needs the registry — paying a
  measurable end-to-end slowdown for a sub-millisecond, imperceptible dirty
  speedup.
- **An atom library's "tear briefly, keep time-slicing" model** (Jotai-style)
  instead of `useSyncExternalStore`. Rejected: a form showing two values for one
  field, even for a frame, risks submitting a value the user never saw. The cost of
  `useSyncExternalStore` — store writes opt out of time-slicing — is irrelevant
  here because form writes are urgent, never transitions.

## Consequences

- A **central form registry is intrinsic**, not a quirk of the descriptor choice:
  once the value is centrally owned and the core may not switch on type, the
  central traversal must look up each form's rules. A switch-based store would need
  the same registry anyway, for validators and custom equality. The authoring
  surface stays `Form → Form` — a combinator describes only its own form and refers
  to no other.
- Dirty is recomputed by a walk each commit — O(changed spine), and O(width) for a
  single edit in a very wide array. Negligible for ordinary forms; if one ever
  needs it, a descendant-dirty counter in the store restores O(1) without changing
  the combinator surface.
- This uses `useSyncExternalStore`, the seam React provides for external state. It
  is not re-implementing React: React offers neither fine-grained store
  subscription nor tree aggregation, and the dirty/valid algebra is domain logic no
  framework supplies.
