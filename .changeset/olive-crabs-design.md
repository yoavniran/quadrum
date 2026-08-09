---
"quadrum-react": patch
---

Widen the `quadrum` peer dependency from `^0.1.0` to `>=0.1.0 <1`. A caret on a 0.x
version admits only 0.1.x, so every routine minor release of the core package fell out of
the binding's declared range and read as a breaking change — which is not true of a 0.x
minor, and which pushed both packages to a 1.0.0 nobody asked for. The `<1` bound is kept
so the eventual real 1.0.0 still registers as the breaking change it is.
