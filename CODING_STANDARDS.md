# Coding Standards

## Interface Design

### Correct by Construction

[**Make illegal states unrepresentable**](https://blog.janestreet.com/effective-ml-revisited/) -
shape your types so that only valid combinations of data can be constructed.

[**Parse, don't validate**](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) -
a check that returns nothing forces every later caller to re-handle a case
that's already been ruled out, so have it return a narrower type carrying what
it learned, and do it once at the system boundary.

## Comments

A docstring says what callers can rely on. If you can't tell from the
surrounding code what the interface is meant to be, raise it with whoever owns
the interface rather than inventing a guarantee.

Red flags:

- Documents a behavior the implementation happens to exhibit, without evidence
  that callers should rely on it.
- Describes how the interface used to behave rather than what it commits to now.
- Defends the design against an approach that was dropped.
- Lists what the module doesn't do. Worth saying only when a caller who read the
  rest would still assume it does, which is rare.
- Describes how the module works internally rather than what its interface
  guarantees.
- Names a module that calls this one.
- Lists the cases it handles today when the point is the general rule that
  covers them. Keep the list when the set really is closed and callers have to
  tell the cases apart.
- Refers to the coding session, such as "as you asked" or "per our discussion".
  The subtler form has no tell-phrase: a fact reads as worth stating only
  because it just came up.

Inline comments are for code that would surprise a competent reader — someone
who knows the language, has read the docs for the libraries it uses, and has
read the docstrings around it, but who wasn't there when the code was written.

If nothing would surprise that reader, delete the comment. Keep or rewrite one
only when you can name the surprise without narrating the code.

Red flags:

- Narrates the code.
- Gives a reason already apparent from the code. A useful one identifies a
  hidden constraint, a subtle invariant, or a workaround for a specific bug.
- Documents at a call site something every caller of the callee needs to know.
  Put that information in the callee's docstring instead.
- Describes the failure being avoided rather than the positive invariant the
  code maintains.
