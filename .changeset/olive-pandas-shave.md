---
"quadrum": minor
"quadrum-react": minor
---

Raise the supported Node floor to 24. `engines.node` was `>=20`; CI, the release
workflow and the whole workspace already targeted 24, so this makes the declared
range match what is actually built and tested against.
