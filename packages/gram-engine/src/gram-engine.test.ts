import { describe, expect, it } from 'vitest'
import type { Item } from '@nutai/core-schema'
import {
  canonicalConceptKey,
  clampGrams,
  computeGramBand,
  DEFAULT_MIXED_DISH_DENSITY,
  DISAGREEMENT_THRESHOLD,
  estimateGrams,
  lookupDensity,
  lookupYield,
  MIN_SAMPLES_TO_TRUST,
  oilAbsorptionFor,
  parseCount,
  piledVolume,
  reconcile,
  scaleFromReferences,
  updatePrior,
} from './index.js'
import type { FoodDb, PersonalPrior, PersonalPriors } from './types.js'

function item(over: Partial<Item> = {}): Item {
  return {
    name: 'Grilled chicken breast',
    brand: null,
    canonical_food_key: 'chicken breast, grilled',
    food_form: 'flat',
    qualitative_size: 'medium',
    weight_basis: 'cooked',
    model_gram_estimate: 170,
    identification_confidence: 0.9,
    portion_confidence: 0.5,
    uncertainty_reason: 'none',
    visible_reference_objects: [],
    container: null,
    cooking_method_cues: [],
    is_beverage: false,
    beverage_category: null,
    legible_label_text: null,
    stated_assumptions: [],
    clarifying_questions: [],
    fallback_macros_at_estimate: {
      calories_kcal: 280, protein_g: 53, carbs_g: 0, fat_g: 6, fiber_g: 0, sodium_mg: 130,
    },
    ...over,
  }
}

const emptyPriors: PersonalPriors = { get: () => null, containers: new Map() }

function priorsWith(prior: PersonalPrior): PersonalPriors {
  return { get: () => prior, containers: new Map() }
}

const db = (grams: Record<string, number> = {}): FoodDb => ({
  fnddsPortionGrams: (_id, measure) => grams[measure] ?? null,
})

describe('the ladder is ordered by trust, not convenience', () => {
  it('tier 0 packaged arithmetic wins outright and needs no estimation', () => {
    const r = estimateGrams({
      item: item({ legible_label_text: 'Serving size 45g' }),
      priors: emptyPriors,
      db: db({ medium: 999 }),
      resolved: { foodId: 'x', description: 'Granola', servingSizeG: 45 },
      servingsConsumed: 2,
    })
    expect(r.grams).toBe(90)
    expect(r.pathway).toBe('packaged_exact')
    expect(r.halfPct).toBeCloseTo(0.02, 3)
  })

  it('tier 1 discrete count is checked before any geometry', () => {
    const r = estimateGrams({
      item: item({ food_form: 'discrete', qualitative_size: 'count:3', canonical_food_key: 'egg, boiled' }),
      priors: emptyPriors,
      db: db({ per_unit: 50 }),
      resolved: { foodId: 'egg', description: 'Egg' },
    })
    expect(r.grams).toBe(150)
    expect(r.pathway).toBe('discrete_count')
  })

  it('falls to the model guess only when nothing better exists', () => {
    const r = estimateGrams({
      item: item(),
      priors: emptyPriors,
      db: db(),
      resolved: null,
    })
    expect(r.pathway).toBe('model_guess')
    expect(r.grams).toBe(170)
  })

  it('a trusted personal prior outranks the model guess', () => {
    const prior: PersonalPrior = {
      foodConceptKey: 'chicken breast',
      ewmaRatio: 0.9,
      ratioVariance: 0.01,
      sampleCount: 5,
      medianGrams: 153,
      lastCorrectedAt: 0,
    }
    const r = estimateGrams({
      item: item(),
      priors: priorsWith(prior),
      db: db(),
      resolved: null,
    })
    expect(r.pathway).toBe('personal_prior')
    expect(r.grams).toBeCloseTo(153, 6)
    expect(r.personalPriorApplied?.sampleCount).toBe(5)
  })

  it('an untrusted prior below the sample threshold does not outrank anything', () => {
    const prior: PersonalPrior = {
      foodConceptKey: 'chicken breast',
      ewmaRatio: 0.5,
      ratioVariance: 0,
      sampleCount: MIN_SAMPLES_TO_TRUST - 1,
      medianGrams: 85,
      lastCorrectedAt: 0,
    }
    const r = estimateGrams({ item: item(), priors: priorsWith(prior), db: db(), resolved: null })
    expect(r.pathway).toBe('model_guess')
  })
})

describe('reconciliation refuses to average away disagreement', () => {
  it('surfaces a question instead of blending when signals diverge', () => {
    const out = reconcile([
      { grams: 220, pathway: 'fndds_standard_portion', weight: 0.55, spread: 0.25 },
      { grams: 140, pathway: 'model_guess', weight: 0.25, spread: 0.4 },
    ])
    expect(out.surfaceDisagreementQuestion).toBe(true)
    expect(out.grams).toBe(220)
    expect(out.rivalGrams).toBe(140)
    // The blended value 190 must NOT be what the user is shown.
    expect(out.grams).not.toBeCloseTo(190, 0)
  })

  it('blends the top two when they agree closely', () => {
    const out = reconcile([
      { grams: 200, pathway: 'fndds_standard_portion', weight: 0.6, spread: 0.25 },
      { grams: 190, pathway: 'model_guess', weight: 0.4, spread: 0.4 },
    ])
    expect(out.surfaceDisagreementQuestion).toBeUndefined()
    expect(out.grams).toBeCloseTo((200 * 0.6 + 190 * 0.4) / 1.0, 6)
  })

  it('blends only the top two, never a weak third', () => {
    const out = reconcile([
      { grams: 200, pathway: 'fndds_standard_portion', weight: 0.6, spread: 0.25 },
      { grams: 190, pathway: 'model_guess', weight: 0.4, spread: 0.4 },
      { grams: 20, pathway: 'container_fill', weight: 0.05, spread: 0.5 },
    ])
    expect(out.grams).toBeGreaterThan(150)
  })

  it('honors the documented threshold exactly', () => {
    const justUnder = reconcile([
      { grams: 100, pathway: 'fndds_standard_portion', weight: 0.6, spread: 0.2 },
      { grams: 100 * (1 - DISAGREEMENT_THRESHOLD + 0.01), pathway: 'model_guess', weight: 0.4, spread: 0.4 },
    ])
    expect(justUnder.surfaceDisagreementQuestion).toBeUndefined()

    const justOver = reconcile([
      { grams: 100, pathway: 'fndds_standard_portion', weight: 0.6, spread: 0.2 },
      { grams: 100 * (1 - DISAGREEMENT_THRESHOLD - 0.01), pathway: 'model_guess', weight: 0.4, spread: 0.4 },
    ])
    expect(justOver.surfaceDisagreementQuestion).toBe(true)
  })

  it('falls back honestly with no candidates at all', () => {
    const out = reconcile([])
    expect(out.forceLowConfidence).toBe(true)
    expect(out.spread).toBeGreaterThanOrEqual(0.5)
  })
})

describe('reference objects are ranked by variance, not by how often they appear', () => {
  const bbox = [0.1, 0.1, 0.2, 0.05] as const

  it('prefers a credit card over a dinner plate even when both are present', () => {
    const s = scaleFromReferences(
      [
        { type: 'dinner_plate', bbox: [...bbox], confidence: 0.99 },
        { type: 'credit_card', bbox: [...bbox], confidence: 0.6 },
      ],
      1000,
      1000,
    )
    expect(s?.sourceType).toBe('credit_card')
    expect(s?.tier).toBe('exact')
    expect(s?.relativeSigma).toBe(0)
  })

  it('never derives a scale from a hand, however confident the detection', () => {
    const s = scaleFromReferences([{ type: 'hand', bbox: [...bbox], confidence: 1 }], 1000, 1000)
    expect(s).toBeNull()
  })

  it('gives a bare plate a medium tier that carries its own wide sigma', () => {
    const s = scaleFromReferences([{ type: 'dinner_plate', bbox: [...bbox], confidence: 0.9 }], 1000, 1000)
    expect(s?.tier).toBe('medium')
    // 30mm sigma on a 280mm plate.
    expect(s?.relativeSigma).toBeCloseTo(30 / 280, 6)
  })

  it('ignores a low-confidence detection', () => {
    const s = scaleFromReferences([{ type: 'credit_card', bbox: [...bbox], confidence: 0.2 }], 1000, 1000)
    expect(s).toBeNull()
  })
})

describe('density has no universal constant', () => {
  it('separates leafy greens from casseroles by more than an order of magnitude', () => {
    const salad = lookupDensity('salad greens, raw')
    const lasagna = lookupDensity('lasagna')
    expect(salad.gPerMl).toBeCloseTo(0.06, 3)
    expect(lasagna.gPerMl).toBeCloseTo(1.04, 3)
    expect(lasagna.gPerMl / salad.gPerMl).toBeGreaterThan(15)
  })

  it('falls back through food group before the mixed-dish default', () => {
    expect(lookupDensity('arugula and kale mix').tier).toBe('food_group')
    expect(lookupDensity('something nobody has ever eaten').gPerMl).toBe(DEFAULT_MIXED_DISH_DENSITY)
  })

  it('always resolves to something and records which tier did it', () => {
    for (const key of ['olive oil', 'unknown mystery stew', 'rice, cooked']) {
      const d = lookupDensity(key)
      expect(d.gPerMl).toBeGreaterThan(0)
      expect(['exact', 'food_group', 'default']).toContain(d.tier)
    }
  })
})

describe('cooking yields are food-class-specific — no generic meat constant', () => {
  it('does not apply a chicken-like yield to bacon', () => {
    const bacon = lookupYield('bacon', 'pan_fried')
    const chicken = lookupYield('chicken breast', 'baked')
    expect(bacon?.yield).toBeCloseTo(0.31, 3)
    expect(chicken?.yield).toBeCloseTo(0.72, 3)
    // A generic ~75% constant applied to bacon would be off by more than 2x.
    expect(chicken!.yield / bacon!.yield).toBeGreaterThan(2)
  })

  it('returns null rather than guessing for an unknown class', () => {
    expect(lookupYield('space food', 'baked')).toBeNull()
  })
})

describe('oil absorption moves mass for visibly fried food', () => {
  it('adds a quarter of the mass back for deep-fried potato', () => {
    const oil = oilAbsorptionFor('french fries', ['deep_fried_color'], 200)
    expect(oil?.absorptionClass).toBe('deep_fried_potato')
    expect(oil?.addedOilGrams).toBeCloseTo(50, 6)
  })

  it('applies a much smaller correction for a pan-fry sheen', () => {
    const oil = oilAbsorptionFor('chicken breast', ['visible_oil_sheen'], 200)
    expect(oil?.absorptionClass).toBe('pan_fried_generic')
    expect(oil?.addedOilGrams).toBeCloseTo(12, 6)
  })

  it('does nothing when there is no visual evidence of oil', () => {
    expect(oilAbsorptionFor('chicken breast', ['grill_marks'], 200)).toBeNull()
    expect(oilAbsorptionFor('salad', ['none_visible'], 200)).toBeNull()
  })

  it('raises the total mass when it fires end to end', () => {
    const plain = estimateGrams({
      item: item({ canonical_food_key: 'french fries', model_gram_estimate: 150, cooking_method_cues: [] }),
      priors: emptyPriors, db: db(), resolved: null,
    })
    const fried = estimateGrams({
      item: item({ canonical_food_key: 'french fries', model_gram_estimate: 150, cooking_method_cues: ['deep_fried_color'] }),
      priors: emptyPriors, db: db(), resolved: null,
    })
    expect(fried.grams).toBeGreaterThan(plain.grams)
    expect(fried.addedOilGrams).toBeCloseTo(37.5, 6)
  })
})

describe('bands', () => {
  it('orders pathways so a better signal is never shown as less certain', () => {
    const packaged = computeGramBand({ pathway: 'packaged_exact' })
    const count = computeGramBand({ pathway: 'discrete_count' })
    const guess = computeGramBand({ pathway: 'model_guess' })
    expect(packaged.halfPct).toBeLessThan(count.halfPct)
    expect(count.halfPct).toBeLessThan(guess.halfPct)
  })

  it('widens for a mixed dish', () => {
    const single = computeGramBand({ pathway: 'model_guess' })
    const mixed = computeGramBand({ pathway: 'model_guess', isMixedDish: true })
    expect(mixed.halfPct).toBeGreaterThan(single.halfPct)
  })

  it('widens for ground meat, whose yield spans 62-77% on invisible factors', () => {
    const plain = computeGramBand({ pathway: 'geometry_soft_ref' })
    const ground = computeGramBand({ pathway: 'geometry_soft_ref', isGroundMeat: true })
    expect(ground.halfPct).toBeGreaterThan(plain.halfPct)
  })

  it('keeps a noisy personal prior wide even at a high sample count', () => {
    const consistent = computeGramBand({ pathway: 'personal_prior', priorSampleCount: 20, priorVariance: 0.0001 })
    const noisy = computeGramBand({ pathway: 'personal_prior', priorSampleCount: 20, priorVariance: 0.09 })
    expect(noisy.halfPct).toBeGreaterThan(consistent.halfPct)
  })

  it('never claims better than 2% and never exceeds 80%', () => {
    const tight = computeGramBand({ pathway: 'packaged_exact' })
    const wild = computeGramBand({
      pathway: 'clamped', measuredSpread: 5, isMixedDish: true, isGroundMeat: true, isUnknownBeverage: true,
    })
    expect(tight.halfPct).toBeGreaterThanOrEqual(0.02)
    expect(wild.halfPct).toBeLessThanOrEqual(0.8)
  })

  it('gives a user-typed number no band at all', () => {
    expect(computeGramBand({ pathway: 'user_edited' }).halfPct).toBeCloseTo(0.02, 6)
  })
})

describe('personal priors are statistics, not fine-tuning', () => {
  it('converges toward a user who consistently serves larger portions', () => {
    let p = updatePrior(null, 'rice', 150, 200, 1)
    for (let i = 0; i < 10; i++) p = updatePrior(p, 'rice', 150, 200, i + 2)
    expect(p.ewmaRatio).toBeCloseTo(200 / 150, 2)
    expect(p.sampleCount).toBe(11)
  })

  it('records variance so inconsistency stays visible', () => {
    let p = updatePrior(null, 'rice', 150, 150, 1)
    p = updatePrior(p, 'rice', 150, 300, 2)
    p = updatePrior(p, 'rice', 150, 75, 3)
    expect(p.ratioVariance).toBeGreaterThan(0)
  })

  it('keys chix breast, grilled chicken breast and chicken breast to one concept', () => {
    const a = canonicalConceptKey('chicken breast')
    const b = canonicalConceptKey('grilled chicken breast')
    const c = canonicalConceptKey('chix breast')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('prefers a resolved database id over the string path', () => {
    expect(canonicalConceptKey('anything at all', '171077')).toBe('fdc:171077')
  })

  it('survives a zero model estimate without producing NaN', () => {
    const p = updatePrior(null, 'rice', 0, 200, 1)
    expect(Number.isFinite(p.ewmaRatio)).toBe(true)
  })
})

describe('geometry', () => {
  it('models a pile as a spherical cap that grows with footprint', () => {
    const small = piledVolume(50, 'scooped_grain')
    const large = piledVolume(200, 'scooped_grain')
    expect(large.ml).toBeGreaterThan(small.ml)
    // Volume grows faster than area, since height scales with radius too.
    expect(large.ml / small.ml).toBeGreaterThan(4)
  })

  it('gives a loose salad a much lower pile than scooped rice at equal area', () => {
    expect(piledVolume(100, 'leafy_salad').ml).toBeLessThan(piledVolume(100, 'scooped_grain').ml)
  })
})

describe('hard bounds', () => {
  it('flags rather than silently truncating', () => {
    const out = clampGrams({ grams: 99_999, pathway: 'model_guess', spread: 0.4 })
    expect(out.grams).toBe(3000)
    expect(out.pathway).toBe('clamped')
    expect(out.forceLowConfidence).toBe(true)
  })

  it('leaves an in-bounds value completely alone', () => {
    const input = { grams: 150, pathway: 'model_guess' as const, spread: 0.4 }
    expect(clampGrams(input)).toBe(input)
  })
})

describe('parseCount', () => {
  it('reads count:N and rejects everything else', () => {
    expect(parseCount('count:3')).toBe(3)
    expect(parseCount('count:1.5')).toBe(1.5)
    expect(parseCount('medium')).toBeNull()
    expect(parseCount('count:0')).toBeNull()
  })
})
