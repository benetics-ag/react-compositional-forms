# react-compositional-forms

A React library that models a form as an algebra of `Form<T>` — one
abstraction representing the form state for a value of type `T` at any
position in a form tree. Composite Forms decompose into smaller Forms of
the constituent types; a single root operation seeds the tree, and a
single leaf operation binds a Form to an input element.

## Language

### The abstraction

**Form<T>**:
The single domain type. Represents form state for a value of type `T` — its
current **Value**, its **Initial Value**, whether it is **Dirty**, the
**Validation Errors** it carries, and the callback by which changes
propagate. Every position in a form tree is a `Form<X>` for the
appropriate `X`; there is no separate "field" type.
_Avoid_: Field type, Form state, Field state

**Leaf** / **Composite**:
The two kinds of Form, told apart structurally by whether the Form decomposes
into child Forms. A **Leaf** has no children; it is **Dirty** when its **Value**
differs from its **Initial Value** under its own equality. A **Composite**
decomposes into child Forms via a **Form combinator**; its Dirty and Valid state
compose from its children's, combined with its own structural rule. The
distinction is a property of how a value is modeled, not of its runtime type: a
`Set` edited as one opaque value is a Leaf, while a `Set` whose members are
themselves Forms is a Composite.
_Avoid_: Node (say Form, or Leaf / Composite), Interior node (say Composite),
Scalar (say Leaf)

### Operations on Form

**Form combinator**:
A function that takes a `Form<T>` and returns smaller `Form`s of the
constituent types of `T`. Each combinator handles one container shape
(array, object, map) and produces its decomposition.
_Avoid_: Field combinator, Composite operator, Form transformer

**Array combinator** (`useFieldArray`):
The **Form combinator** for arrays: `Form<T[]> → Form<T>[]`. Decomposes a
Form of an array into one Form per element, plus operations for changing
the array's length.
_Avoid_: List combinator, Collection combinator

**Object combinator** (`useFieldObject`):
The **Form combinator** for objects: `Form<O> → {[K in keyof O]: Form<O[K]>}`.
Decomposes a Form of an object into one Form per property. The set of
keys is fixed at construction time.
_Avoid_: Record combinator, Group combinator

**Map combinator** (`useFieldMap`, planned):
The **Form combinator** for maps: `Form<Map<K, V>> → Map<K, Form<V>>`.
Decomposes a Form of a map into one Form per key, with operations for
adding and removing keys. Listed so the algebra is visible; not yet
implemented.
_Avoid_: Dictionary combinator, Dynamic-key combinator

**Terminal** (`useForm`):
The single root operation. Produces the initial `Form<T>` from a
caller-supplied initial value and exposes the root's observable state
(current **Value**, **Dirty** / **Valid** flags) and the programmatic
operations (**Submit**, **Reset**, direct write) to the outside world.
The only seam between the `Form<T>` algebra and React state held
elsewhere.
_Avoid_: Root, Source, Constructor, Form factory

**Leaf binding** (`useField`):
The leaf operation. Consumes a `Form<T>` and produces the props an input
element needs (`value`, `onChange`, `onBlur`). The only consumer of a
`Form<T>` that does not itself produce smaller Forms.
_Avoid_: Input adapter, Scalar binding

### Data on a Form

**Value**:
The data a `Form<T>` currently holds — the `T`. The **Terminal**'s Form
holds the whole form's value; each child Form returned by a **Form
combinator** holds its slice.
_Avoid_: State (overloaded with React state), Data, Form data

**Initial Value**:
The **Value** at the moment the **Terminal** constructed the Form, or the
value passed to the most recent **Reset**. The reference point for
**Dirty**.
_Avoid_: Default Value, Baseline, Starting value

**Validation Error**:
One validation failure attached to one `Form<T>`. A Form has zero or more
Validation Errors; the empty set means the Form is **Valid**.
_Avoid_: Field error (colloquial only), Validation issue, Problem

### Derived state on a Form

**Dirty**:
A Form whose **Value** has no further decomposition is Dirty iff its
current Value is not equal to its **Initial Value** under the caller's
equality function (default `Object.is`). A Form produced by a **Form
combinator** is Dirty iff any of its descendants are Dirty; the **Array
combinator** additionally marks a Form dirty when the current length
differs from the initial length.
_Avoid_: Modified, Changed, Touched (distinct concept — see Flagged
ambiguities)

**Valid** / **Invalid**:
A Form is Valid iff it has zero **Validation Errors**. A Form produced by
a **Form combinator** is Valid iff every descendant Form is Valid.
Otherwise Invalid.
_Avoid_: OK / Broken, Ready / Errored, Passing / Failing

### Lifecycle

**Validation Mode**:
The event class on which a Form's **Validation Errors** are recomputed:
either *change* (every Value change) or *blur* (loss of focus). Chosen at
the **Terminal** and inherited throughout the tree.
_Avoid_: Validation trigger, Check mode, Validate-on

**Reset**:
Restoring a Form to its **Initial Value** (or to a new value, which
becomes the new Initial Value). After a Reset every descendant Form is
clean and has no **Validation Errors**.
_Avoid_: Clear, Restore, Revert, Rollback

**Submit**:
Validating every Form in the tree, then invoking an `onValid` callback
with the root **Value** (if every Form is Valid) or an `onInvalid`
callback (otherwise). The single act that asks the root Form "is this
ready to ship."
_Avoid_: Save, Send, Commit, Finish

## Flagged ambiguities

- **Form vs Control.** *Form* is the domain term and the internal type name.
  The public API spells it `Control<T>` — kept for backward compatibility with
  existing consumers — so `Control` and `Form` denote the same thing: a handle
  on a Form at any position in the tree. Reason about `Form<T>`; the exported
  name is just `Control`.

- **"Field" is colloquial only.** People will naturally say "the email
  field" or "the array field." That is fine in conversation; the formal
  term is `Form<T>`, with position (root, intermediate, leaf) carried by
  context. The `Field*` names in the code (`useField`, `useFieldArray`,
  `useFieldObject`, `FieldError`) parallel the `Form*` vocabulary used
  here and are candidates for rename over time.

- **Dirty vs Touched.** *Dirty* is "current value differs from initial
  value." *Touched* is "the user has interacted with this thing." This
  library models Dirty only. Touched is a UI concern that lives at the
  call site if needed and is deliberately not part of the algebra.

- **Initial Value, not Default Value.** *Default Value* suggests a
  fallback used when no value is supplied. *Initial Value* is the actual
  starting value of the root **Form** and the reference point for
  **Dirty**.

- **Form combinators decompose, they do not construct.** A combinator
  takes a Form and yields smaller Forms of its constituent types; it
  never makes a Form out of nothing. The only operation that constructs a
  Form is the **Terminal**.
