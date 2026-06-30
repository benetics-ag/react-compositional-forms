---
status: accepted
---

# Compositional form architecture

A form is an algebra: `Form<T>` is one uniform abstraction at every position in
a form tree, and large forms are built by nesting smaller ones. This ADR fixes
the principles that keep that composition sound — extensibility without
modifying the library, compositional definitions of *dirty* and *valid*, and
event-driven validation — together with the user-observable failures the
library must never exhibit.

## Principles

### Composable (Open-Closed Principle)

Large forms are built from small forms, and the library is **closed for
modification but open for extension**. A new form type — a `Set`, a tagged
union, an immutable collection — is added by writing a new combinator in the
library user's own code, with no edit to library source. It follows that the
library never enumerates the set of supported types: every operation that
traverses a form — decomposition, dirty, validity, reset — dispatches to the
form it acts on, never to a central case analysis over the known types.

### Programmatically writable

A form's value is set by user input through its fields, and equally by
programmatic writes from outside — at the root or any subtree — so a form can be
filled by an external agent such as a voice assistant exactly as a user fills it.
There is one value, shared between the form and its fields: a programmatic write
and the equivalent user edit produce the same value, dirty state, and validation
outcome.

Writing a value and establishing an initial value are distinct operations. A
value write is measured against the current initial value and can leave the form
dirty. Loading a record or resetting sets a new initial value, so a freshly
loaded or reset form is clean.

### Dirty is compositional

A form is **dirty** when its value differs from its initial value. Generically,
that is all a form is — a value, an initial value, and the rule that a composite
is dirty when any child is dirty **or** it has changed by *its own* structural
rule, the two independent. Everything that looks inside a value belongs to the
form *type*: how to compare two values for equality, how a value decomposes into
children, what its own structural rule is, and how initial values are assigned to
parts that come and go. Equality lives in the type because sameness is
type-specific — a `Set`, a date, a domain object each carry their own — and by the
Open-Closed Principle the rest do too.

An array, for example, defines its structural rule as "the length differs from
the initial length" and gives an appended element the value it was appended with
as its initial, so growing the array makes the array dirty while the new element
stays clean until it is edited; a `Set` defines dirtiness as a change in
membership.

### Valid is compositional

A form is **valid** when it carries no validation errors; a form's errors are the
union of its own errors and its children's. Each form type supplies its own
validation.

### Validation is event-driven

Validators run on discrete events — a change, a blur, a programmatic `validate`
call, a submit — never continuously. A form carries no errors until something
asks it to validate; errors are a response to interaction, not a property of a
value. A form's validity therefore reflects its last validation and may lag its
current value until the next event; a caller that needs a fresh result asks for
one.

## Forbidden behaviors

These are user-observable failures. The library must exhibit none of them, at
any level of nesting.

- **Zombie children.** After a child is removed or reordered within a composite
  (for example, an array element deleted mid-list), no surviving component may
  read or report the removed or relocated child's state. The form must never
  show — or crash on — data the latest structure no longer contains.

- **Stale state.** A write path — a change, blur, reset, submit, or async
  callback — acts on the latest committed value and summaries, never on a value
  frozen at the render in which the handler was created. A handler that adds one
  to a counter twice in a row adds two.

- **Tearing.** Within a single rendered frame, every component observes the same
  form value. No two components reading the one shared value may show different
  values of it.
