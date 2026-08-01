import { describe, expect, it } from 'vitest'
import {
  computeMetrics,
  errorVsPortionSlope,
  evaluateGate,
  GATE,
  metricsByStratum,
  type Baselines,
  type GroundTruth,
  type Prediction,
} from './scorers.js'

function pred(over: Partial<Prediction> = {}): Prediction {
  return {
    dishId: 'd1', stratum: 'A', pathway: 'model_guess',
    predictedKcal: 500, predictedGrams: 300, bandHalfPct: 0.3,
    ...over,
  }
}
function truth(over: Partial<GroundTruth> = {}): GroundTruth {
  return { dishId: 'd1', stratum: 'A', actualKcal: 500, actualGrams: 300, ...over }
}

describe('the metrics exist because simpler ones hide things', () => {
  it('distinguishes uniformly mediocre from mostly-fine-with-catastrophes', () => {
    // Both sets have a similar MEAN. Only the median and IQR separate them, and
    // they call for completely different engineering work.
    const uniform = Array.from({ length: 10 }, (_, i) => pred({ dishId: `u${i}`, predictedKcal: 600 }))
    const uniformTruth = Array.from({ length: 10 }, (_, i) => truth({ dishId: `u${i}`, actualKcal: 500 }))

    const spiky = Array.from({ length: 10 }, (_, i) =>
      pred({ dishId: `s${i}`, predictedKcal: i === 0 ? 1500 : 505 }))
    const spikyTruth = Array.from({ length: 10 }, (_, i) => truth({ dishId: `s${i}`, actualKcal: 500 }))

    const a = computeMetrics(uniform, uniformTruth)
    const b = computeMetrics(spiky, spikyTruth)

    expect(a.mape).toBeCloseTo(b.mape, 1)
    // The medians are nothing alike, which is the whole point.
    expect(a.medianApe).toBeGreaterThan(0.15)
    expect(b.medianApe).toBeLessThan(0.05)
  })

  it('detects systematic undercounting, which MAPE is blind to', () => {
    const low = [pred({ dishId: 'a', predictedKcal: 400 }), pred({ dishId: 'b', predictedKcal: 400 })]
    const mixed = [pred({ dishId: 'a', predictedKcal: 400 }), pred({ dishId: 'b', predictedKcal: 600 })]
    const t = [truth({ dishId: 'a' }), truth({ dishId: 'b' })]

    const l = computeMetrics(low, t)
    const m = computeMetrics(mixed, t)

    // Identical MAPE.
    expect(l.mape).toBeCloseTo(m.mape, 6)
    // Completely different bias. One app is 20% low every time; the other is not.
    expect(l.mspe).toBeCloseTo(-0.2, 6)
    expect(m.mspe).toBeCloseTo(0, 6)
  })

  it('measures band coverage, which tests the honesty claim rather than accuracy', () => {
    // Predictions are 20% off but the band is wide enough to admit it.
    const honest = [pred({ predictedKcal: 600, bandHalfPct: 0.3 })]
    // Same error, band too narrow to contain the truth. This is the ship-blocker.
    const overconfident = [pred({ predictedKcal: 600, bandHalfPct: 0.05 })]

    expect(computeMetrics(honest, [truth()]).bandCoverage).toBe(1)
    expect(computeMetrics(overconfident, [truth()]).bandCoverage).toBe(0)
  })

  it('reports per-stratum rather than pooling', () => {
    const preds = [
      pred({ dishId: 'a', stratum: 'A', predictedKcal: 505 }),
      pred({ dishId: 'd', stratum: 'D', predictedKcal: 800 }),
    ]
    const t = [truth({ dishId: 'a', stratum: 'A' }), truth({ dishId: 'd', stratum: 'D' })]
    const by = metricsByStratum(preds, t)
    expect(by['A']!.mape).toBeLessThan(0.05)
    expect(by['D']!.mape).toBeGreaterThan(0.5)
  })

  it('returns zeros rather than NaN on an empty run', () => {
    const m = computeMetrics([], [])
    expect(m.n).toBe(0)
    expect(Number.isNaN(m.mape)).toBe(false)
  })
})

describe('the merge gate', () => {
  const baselines: Baselines = {
    mapeByStratum: { A: 0.2, D: 0.45 },
    bandCoverageByStratum: { A: 0.75, D: 0.75 },
    provenance: 'seeded',
    generatedAt: null,
  }

  it('passes an unchanged run', () => {
    const current = metricsByStratum(
      [pred({ dishId: 'a', stratum: 'A', predictedKcal: 600, bandHalfPct: 0.4 })],
      [truth({ dishId: 'a', stratum: 'A' })],
    )
    expect(evaluateGate(current, baselines).pass).toBe(true)
  })

  it('blocks a deliberately planted 15% MAPE regression', () => {
    // Baseline A is 20% MAPE. Push it to 40% — a 100% relative regression.
    const current = metricsByStratum(
      [pred({ dishId: 'a', stratum: 'A', predictedKcal: 700, bandHalfPct: 0.6 })],
      [truth({ dishId: 'a', stratum: 'A' })],
    )
    const g = evaluateGate(current, baselines)
    expect(g.pass).toBe(false)
    expect(g.failures.join(' ')).toMatch(/MAPE regressed/)
  })

  it('blocks a too-narrow band even when accuracy looks respectable', () => {
    // Only 4% off — excellent MAPE — but the band claims +/-1% and misses.
    const current = metricsByStratum(
      [pred({ dishId: 'a', stratum: 'A', predictedKcal: 520, bandHalfPct: 0.01 })],
      [truth({ dishId: 'a', stratum: 'A' })],
    )
    const g = evaluateGate(current, baselines)
    expect(g.pass).toBe(false)
    expect(g.failures.join(' ')).toMatch(/too narrow to be honest/)
  })

  it('warns below target coverage without blocking', () => {
    // Coverage must be isolated from accuracy here. The 28 misses are only 15%
    // off — comfortably better than the 20% MAPE baseline, so nothing trips the
    // regression check — but they sit outside a +/-10% band, so coverage lands at
    // 72%: above the 70% floor, below the 75% target. Warn, do not block.
    const preds = Array.from({ length: 100 }, (_, i) =>
      pred({ dishId: `d${i}`, stratum: 'A', predictedKcal: i < 72 ? 500 : 575, bandHalfPct: 0.1 }))
    const t = Array.from({ length: 100 }, (_, i) => truth({ dishId: `d${i}`, stratum: 'A' }))
    const metrics = metricsByStratum(preds, t)
    expect(metrics['A']!.bandCoverage).toBeCloseTo(0.72, 2)
    expect(metrics['A']!.mape).toBeLessThan(baselines.mapeByStratum['A']!)

    const g = evaluateGate(metrics, baselines)
    expect(g.pass).toBe(true)
    expect(g.warnings.join(' ')).toMatch(/under the 75% target/)
  })

  it('turns systematic undercounting into a directed instruction, not a number', () => {
    const preds = Array.from({ length: 10 }, (_, i) =>
      pred({ dishId: `d${i}`, stratum: 'E', predictedKcal: 350, bandHalfPct: 0.6 }))
    const t = Array.from({ length: 10 }, (_, i) => truth({ dishId: `d${i}`, stratum: 'E' }))
    const g = evaluateGate(metricsByStratum(preds, t), baselines)
    expect(g.warnings.join(' ')).toMatch(/oil question flow/)
  })

  it('uses the documented thresholds', () => {
    expect(GATE.minBandCoverage).toBe(0.7)
    expect(GATE.targetBandCoverage).toBe(0.75)
    expect(GATE.maxMapeRegression).toBe(0.1)
  })
})

describe('pre-registered decision rule 2', () => {
  it('recovers a negative error-vs-portion slope', () => {
    // Bigger meals underestimated more — the Fridolfsson pattern (-0.23 to -0.50).
    const preds = [
      pred({ dishId: 'a', predictedKcal: 195 }),
      pred({ dishId: 'b', predictedKcal: 460 }),
      pred({ dishId: 'c', predictedKcal: 800 }),
    ]
    const t = [
      truth({ dishId: 'a', actualKcal: 200 }),
      truth({ dishId: 'b', actualKcal: 500 }),
      truth({ dishId: 'c', actualKcal: 1000 }),
    ]
    const slope = errorVsPortionSlope(preds, t)
    expect(slope).not.toBeNull()
    expect(slope!).toBeLessThan(0)
  })

  it('returns null rather than a fake slope on too little data', () => {
    expect(errorVsPortionSlope([pred()], [truth()])).toBeNull()
  })
})

describe('baselines ship honestly labeled', () => {
  it('declares itself seeded until a golden-set run replaces it', async () => {
    const { default: baselines } = await import('../baselines.json', { with: { type: 'json' } })
    expect(baselines.provenance).toBe('seeded')
    expect(baselines.generatedAt).toBeNull()
    // Every stratum carries a citation for where its seed came from.
    expect(Object.keys(baselines.sources).length).toBeGreaterThan(4)
  })
})
