#!/usr/bin/env node
/**
 * Patch expo-modules-jsi so the iOS build compiles under Xcode 26.
 *
 * THE BUG (upstream, present in expo-modules-jsi 57.0.4, the latest release):
 *
 *   apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift:53
 *     guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {
 *                                                    ^
 *     error: type of expression is ambiguous without a type annotation
 *
 * THE CAUSE, established by minimal reproduction rather than guessed at:
 *
 *   This package builds with `-cxx-interoperability-mode=default`. That imports the C++
 *   `abs` overloads from <cstdlib>/<cmath> into Swift, where they collide with Swift's
 *   own generic `abs`, leaving the `<=` operator overload unresolvable.
 *
 *   Verified on Apple Swift 6.2.3 (swiftlang-6.2.3.3.21) / Xcode 26.2: the identical
 *   expression typechecks cleanly WITHOUT the interop flag and fails WITH it. It is not
 *   caused by `@usableFromInline`, nor by the file-scope global, nor by anything in this
 *   project's own code.
 *
 * THE FIX: use `Double.magnitude`, a plain member lookup needing no generic overload
 * resolution, and bind both operands to explicitly-typed locals. `.magnitude` is
 * bit-identical to `abs` for every Double, including negative zero and the exact TimeClip
 * boundary — asserted before shipping this.
 *
 * Idempotent: running it twice is a no-op, and it exits 0 (not 1) when the upstream fix
 * lands and the target expression is simply gone.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(
  REPO,
  'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift',
)

const BROKEN = 'guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {'

const FIXED = `// Patched by scripts/patch-expo-modules-jsi.mjs — see that file for the full diagnosis.
  //
  // This package builds with \`-cxx-interoperability-mode=default\`, which imports the C++
  // \`abs\` overloads from <cstdlib>/<cmath> into Swift. They collide with Swift's generic
  // \`abs\`, leaving the \`<=\` overload unresolvable: "type of expression is ambiguous
  // without a type annotation". \`.magnitude\` is a Double member needing no generic
  // resolution, and is bit-identical to \`abs\` for every Double.
  let magnitude: Double = milliseconds.magnitude
  let limit: Double = maxJavaScriptDateMilliseconds
  guard milliseconds.isFinite, magnitude <= limit else {`

async function main() {
  let source
  try {
    source = await readFile(TARGET, 'utf8')
  } catch {
    // Dependency not installed yet (or removed upstream). Not this script's problem.
    console.log('patch-expo-modules-jsi: target not present, skipping.')
    return
  }

  if (source.includes('let magnitude: Double = milliseconds.magnitude')) {
    console.log('patch-expo-modules-jsi: already applied.')
    return
  }

  if (!source.includes(BROKEN)) {
    // Upstream changed the line. Say so loudly enough to be noticed, but do not fail the
    // install — a fixed dependency is the outcome we want, not an error.
    console.log(
      'patch-expo-modules-jsi: expected expression not found — upstream may have fixed it.\n' +
        '  If the iOS build fails with "type of expression is ambiguous" in\n' +
        '  JavaScriptCodable+Date.swift, this patch needs updating.',
    )
    return
  }

  await writeFile(TARGET, source.replace(BROKEN, FIXED), 'utf8')
  console.log('patch-expo-modules-jsi: applied (C++ interop `abs` ambiguity).')
}

main().catch((err) => {
  console.error('patch-expo-modules-jsi: failed:', err.message)
  process.exitCode = 1
})
