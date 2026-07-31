# Nut AI

An open-source AI photo calorie tracker that never shows a number it cannot justify.

Point your camera at a meal and get calories and macros — with an honest uncertainty range, the
assumptions it made shown as editable chips, and a correction flow that recomputes everything locally
and instantly. No subscription, no paywall, no account, no server.

> **Status: pre-alpha.** M0 (build rails). Nothing works yet.

---

## Why this exists

Photo calorie trackers converged on a bad pattern: show one confident number, hide the uncertainty, and
paywall the correction. The number is a guess — portion estimation alone carries 26–37%+ MAPE across
every published model — and presenting a guess as a fact is the actual product failure.

Nut AI is built around one rule:

> **The inference model never owns a number the user sees.**

The model is a perception device. It answers *what foods are here, what form are they in, how big
relative to what else is in frame, what reference objects are visible, what could I not see.* Then:

- **Grams** come from a deterministic reconciliation ladder — packaged label, discrete count, your
  personal prior, reference-object geometry, standard portion, and only last the model's own estimate.
  When the top two sources disagree by more than 35%, that becomes a *question*, not a blend.
- **Nutrition** comes from a real database row, snapshotted at log time and immutable thereafter.
- **Totals** are arithmetic.
- **Confidence** comes from measured per-category error against a kitchen-scale-weighed golden set —
  not from asking the model how sure it is.

Every consequence of that rule is a feature: corrections are free and offline, historical logs never
silently change, and the two worst bugs in this product category become structurally impossible.

## Two ways to run it

Chosen during onboarding, changeable any time, and presented neutrally:

- **Bring your own key** — your own Anthropic / OpenAI / Google key. Your photo goes to the provider you
  named and nowhere else. Typically well under a cent per scan.
- **On-device** — free, private, works on a plane. Accuracy is **unproven** and will be measured and
  published before it ships as a default.

Either way, barcode scanning, label OCR, text search, manual entry and the entire correction flow work
offline with no key at all.

## What we deliberately do not clone

No paywalled shutter button. No social feed. No streak-restore purchase. No opaque "AI health score".
No red numbers for missed goals — red is reserved for safety warnings, never for food or bodies.

## Repository layout

```
apps/mobile/      the Expo app — the ONLY package with React Native imports
packages/         pure TypeScript, importable under plain Node:
  core-schema     Zod source of truth for every payload shape
  gram-engine     the reconciliation ladder, densities, yields, oil absorption
  resolver        food name → database row (FTS5 candidates + six-signal scoring)
  totals          recompute, macro reconciliation, rounding
  confidence      measured bands, structural widening, per-meal quadrature
  repair          the question bank and expected-value gating
  goals           BMR/TDEE/macros, EWMA trend, adaptive TDEE
  prompt          system prompt, few-shots, prompt versioning
  db-adapter      one interface, two impls: expo-sqlite | better-sqlite3
  clamp           the deterministic sanity clamp
eval/             accuracy harness — imports the real engine, runs under Node
```

**`packages/*` must stay React-Native-free.** This is enforced by `npm run check:node-purity`, which
both scans for forbidden imports and actually imports every package under bare Node. It is not a style
rule: the accuracy harness has to run the *real* gram engine and resolver against the golden set. If
those become RN-only, the harness can only score raw model output — which measures the wrong thing,
because most of the accuracy lives between the model and the number.

## Development

Requires Node ≥ 20.19.

```bash
npm install
npm run check        # lint + typecheck + tests + node-purity
```

**Expo Go is not a supported development mode past initial scaffolding.** On-device inference,
biometric-gated key storage, bottom sheets, MMKV, widgets, HealthKit and Health Connect all require a
compiled dev client. Do not architect around a constraint that dies in week two.

## Licensing

Application code is **AGPL-3.0-or-later**, with a GNU AGPL §7 additional permission allowing
distribution through app stores — see [`LICENSE`](LICENSE). Without that grant, App Store distribution
would conflict with the AGPL.

The bundled nutrition database is a **separate work under separate terms** (CC0, ODbL, CC BY 4.0, OGL
v3.0 depending on the source) — see `THIRD-PARTY-DATA.md`. Data licenses and code licenses are legally
independent; neither discharges the other.

## Medical disclaimer

Nut AI's estimates are AI-generated approximations and may not be accurate. Nut AI is not a medical
device and does not diagnose, treat, cure, or prevent any medical condition. It is not a substitute for
professional nutritional or medical guidance — consult a registered dietitian or healthcare provider for
personalized advice.
