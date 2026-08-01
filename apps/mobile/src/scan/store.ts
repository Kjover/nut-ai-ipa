import type { Band } from '@nutai/confidence'
import type { IngredientRow, LoggedMeal } from '@nutai/core-schema'
import type { ScanResult } from '@nutai/pipeline'
import { recomputeAfterEdit } from '@nutai/pipeline'
import type { SelectedQuestion } from '@nutai/repair'
import { useSyncExternalStore } from 'react'

/**
 * The in-flight scan.
 *
 * Deliberately a tiny external store rather than a state library: this holds one
 * meal at a time and every mutation is the same operation — edit the rows, then
 * recompute. Adding a dependency for that would be more machinery than the
 * problem has.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT: every mutation below runs
 * `recomputeAfterEdit` locally and synchronously. No network call, no database
 * read, no model call. That is what makes correction free, instant, offline, and
 * identical on both inference paths — and it is only possible because every row
 * already carries its own per-100 g snapshot.
 */

export type ScanPhase =
  | { kind: 'idle' }
  | { kind: 'captured'; photoUri: string }
  | { kind: 'analyzing'; photoUri: string }
  | { kind: 'ready'; photoUri: string | null; result: ScanResult; bands: Band[] }
  | { kind: 'failed'; photoUri: string; message: string; canRetry: boolean }

let phase: ScanPhase = { kind: 'idle' }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useScan(): ScanPhase {
  return useSyncExternalStore(subscribe, () => phase, () => phase)
}

export function setPhase(next: ScanPhase) {
  phase = next
  emit()
}

/** Every edit path funnels through here, so the invariant holds in exactly one place. */
function mutateMeal(fn: (meal: LoggedMeal) => LoggedMeal) {
  if (phase.kind !== 'ready') return
  const meal = fn(phase.result.meal)
  const { totals, mealBand } = recomputeAfterEdit(meal, phase.bands)
  phase = {
    ...phase,
    result: { ...phase.result, meal, totals, mealBand },
  }
  emit()
}

export function editGrams(rowId: string, grams: number) {
  if (!Number.isFinite(grams) || grams < 0) return
  mutateMeal((meal) => ({
    ...meal,
    ingredients: meal.ingredients.map((r) => (r.id === rowId ? { ...r, grams } : r)),
  }))
}

export function removeRow(rowId: string) {
  // No special-casing "AI-added" versus "user-added" once a row is in the list.
  // There is no data-model difference between "the AI added rice and I removed
  // it" and "I removed rice because I didn't eat it".
  mutateMeal((meal) => ({
    ...meal,
    ingredients: meal.ingredients.filter((r) => r.id !== rowId),
  }))
}

export function addRow(row: IngredientRow) {
  mutateMeal((meal) => ({ ...meal, ingredients: [...meal.ingredients, row] }))
}

export function setPortionEaten(fraction: number) {
  mutateMeal((meal) => ({ ...meal, portionEatenFraction: Math.max(0, Math.min(1, fraction)) }))
}

/**
 * Answering a clarifying chip IS an add/remove/edit operation.
 *
 * "Yes there was oil" pushes an assumption-filler row; "no oil" removes it; "oat
 * milk instead of whole" swaps a row's snapshot. There is no separate code path
 * for questions — the chip UI is a friendly wrapper over the same three
 * primitives, which is what makes the two impossible to get out of sync.
 */
export function answerQuestion(q: SelectedQuestion, value: string) {
  if (q.question.id === 'portion_eaten') {
    const f = Number(value)
    if (Number.isFinite(f)) setPortionEaten(f)
    return
  }
  if (q.question.id === 'cooking_oil') {
    if (value === 'none') {
      if (phase.kind !== 'ready') return
      const oil = phase.result.meal.ingredients.find((r) => r.origin === 'assumption_filler')
      if (oil) removeRow(oil.id)
    }
    return
  }
  // Remaining answers swap a row's snapshot against a bundled filler food. That
  // lookup belongs to the resolver and is wired at the screen level.
}

export function reset() {
  setPhase({ kind: 'idle' })
}
