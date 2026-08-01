import { describe, expect, it } from 'vitest'
import type { MacroTotals } from '@nutai/core-schema'
import { healthScore } from './health-score.js'

const meal = (over: Partial<MacroTotals>): MacroTotals => ({
  kcal: 500, protein_g: 20, fat_g: 15, carbs_g: 60, fiber_g: 5, sugar_g: 8, sodium_mg: 500,
  ...over,
})

describe('healthScore', () => {
  it('is deterministic arithmetic — same meal, same score, every time', () => {
    const t = meal({})
    expect(healthScore(t)).toEqual(healthScore(t))
  })

  it('declines to score a trivial-calorie item instead of scoring it absurdly', () => {
    expect(healthScore(meal({ kcal: 5 }))).toBeNull()
  })

  it('rewards a lean high-fiber meal and punishes sugar water', () => {
    const grilled = healthScore(
      meal({ kcal: 420, protein_g: 45, fiber_g: 9, sugar_g: 4, sodium_mg: 380 }),
      450,
    )!
    const soda = healthScore(
      { kcal: 240, protein_g: 0, fat_g: 0, carbs_g: 65, fiber_g: 0, sugar_g: 65, sodium_mg: 75 },
      600,
    )!
    expect(grilled.score).toBeGreaterThanOrEqual(8)
    expect(soda.score).toBeLessThanOrEqual(2)
  })

  it('every point traces to a named reason', () => {
    const s = healthScore(meal({ protein_g: 45, fiber_g: 12, sugar_g: 40, sodium_mg: 2400 }))!
    expect(s.reasons.length).toBeGreaterThanOrEqual(3)
    for (const r of s.reasons) expect(typeof r).toBe('string')
  })

  it('uses density only when grams are known — no guessed weights', () => {
    const without = healthScore(meal({}))!
    const dense = healthScore(meal({}), 120)!
    expect(dense.score).toBeLessThanOrEqual(without.score)
  })

  it('stays inside 0..10 at the extremes', () => {
    const worst = healthScore(
      { kcal: 800, protein_g: 0, fat_g: 40, carbs_g: 100, fiber_g: 0, sugar_g: 95, sodium_mg: 4000 },
      180,
    )!
    const best = healthScore(
      { kcal: 300, protein_g: 30, fat_g: 8, carbs_g: 25, fiber_g: 10, sugar_g: 3, sodium_mg: 200 },
      420,
    )!
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(best.score).toBeLessThanOrEqual(10)
  })
})
