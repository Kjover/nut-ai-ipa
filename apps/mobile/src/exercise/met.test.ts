import { describe, expect, it } from 'vitest'
import { exerciseKcal, INTENSITY_ANCHORS } from './met'

describe('exercise MET arithmetic', () => {
  it('matches the ACSM formula exactly', () => {
    // 9.8 MET x 3.5 x 80 kg / 200 x 30 min = 411.6 -> 412
    expect(exerciseKcal('run', 'medium', 80, 30)).toBe(412)
  })

  it('scales with body weight — the reason we do not use a flat per-minute table', () => {
    const light = exerciseKcal('run', 'high', 60, 30)
    const heavy = exerciseKcal('run', 'high', 100, 30)
    // Outputs are rounded to whole kcal, so the ratio is close, not exact.
    expect(heavy / light).toBeCloseTo(100 / 60, 2)
  })

  it('orders intensities correctly for both kinds', () => {
    for (const kind of ['run', 'weights'] as const) {
      expect(exerciseKcal(kind, 'high', 80, 30)).toBeGreaterThan(exerciseKcal(kind, 'medium', 80, 30))
      expect(exerciseKcal(kind, 'medium', 80, 30)).toBeGreaterThan(exerciseKcal(kind, 'low', 80, 30))
    }
  })

  it('refuses nonsense inputs with zero, never NaN', () => {
    expect(exerciseKcal('run', 'medium', 0, 30)).toBe(0)
    expect(exerciseKcal('run', 'medium', 80, -5)).toBe(0)
    expect(exerciseKcal('run', 'medium', Number.NaN, 30)).toBe(0)
  })

  it('anchors carry user-facing copy for every level', () => {
    for (const kind of ['run', 'weights'] as const) {
      expect(INTENSITY_ANCHORS[kind]).toHaveLength(3)
      for (const a of INTENSITY_ANCHORS[kind]) {
        expect(a.title.length).toBeGreaterThan(0)
        expect(a.desc.length).toBeGreaterThan(5)
      }
    }
  })
})
