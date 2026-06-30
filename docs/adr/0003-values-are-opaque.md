---
status: accepted
---

# Form values are opaque to the core

The core treats every value as opaque: `undefined`, `null`, `NaN`, and anything
else are ordinary form values, compared only through a form's declared equality
and never given built-in meaning.

