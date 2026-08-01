import { beforeEach, describe, expect, it } from 'vitest'
import type { DbAdapter } from '@nutai/db-adapter'
import { _resetPortionCache, loadFoodDb } from './portions'

/**
 * The bridge from USDA's free-text portion rows to the gram ladder's four
 * keys. A wrong per_unit weight silently scales every count-based estimate,
 * so the mapping must be conservative: unclassifiable rows are dropped, and
 * multi-unit rows ("3 pieces") must never masquerade as one unit.
 */

type Row = {
  food_id: number
  measure_unit: string | null
  modifier: string | null
  amount: number | null
  gram_weight: number
  is_fndds_default: number
}

function fakeDb(rows: Row[]): DbAdapter {
  return { all: async () => rows as never } as unknown as DbAdapter
}

beforeEach(() => _resetPortionCache())

describe('loadFoodDb', () => {
  it('maps size words to small/medium/large', async () => {
    const db = await loadFoodDb(
      fakeDb([
        { food_id: 1, measure_unit: 'undetermined', modifier: 'small', amount: 1, gram_weight: 90, is_fndds_default: 0 },
        { food_id: 1, measure_unit: 'undetermined', modifier: 'medium', amount: 1, gram_weight: 118, is_fndds_default: 0 },
        { food_id: 1, measure_unit: 'undetermined', modifier: 'large', amount: 1, gram_weight: 140, is_fndds_default: 0 },
      ]),
    )
    expect(db.fnddsPortionGrams('1', 'small')).toBe(90)
    expect(db.fnddsPortionGrams('1', 'medium')).toBe(118)
    expect(db.fnddsPortionGrams('1', 'large')).toBe(140)
  })

  it('maps unit words at amount 1 to per_unit', async () => {
    const db = await loadFoodDb(
      fakeDb([{ food_id: 2, measure_unit: 'undetermined', modifier: 'slice', amount: 1, gram_weight: 28, is_fndds_default: 0 }]),
    )
    expect(db.fnddsPortionGrams('2', 'per_unit')).toBe(28)
  })

  it('REFUSES a multi-unit row as per_unit — "3 pieces" is not one piece', async () => {
    const db = await loadFoodDb(
      fakeDb([{ food_id: 3, measure_unit: 'undetermined', modifier: 'piece', amount: 3, gram_weight: 84, is_fndds_default: 0 }]),
    )
    expect(db.fnddsPortionGrams('3', 'per_unit')).toBeNull()
  })

  it('falls back to the FNDDS default portion for medium, without overwriting a labeled one', async () => {
    const db = await loadFoodDb(
      fakeDb([
        { food_id: 4, measure_unit: 'undetermined', modifier: 'cup', amount: 1, gram_weight: 160, is_fndds_default: 1 },
        { food_id: 5, measure_unit: 'undetermined', modifier: 'medium', amount: 1, gram_weight: 118, is_fndds_default: 0 },
        { food_id: 5, measure_unit: 'undetermined', modifier: 'cup, sliced', amount: 1, gram_weight: 150, is_fndds_default: 1 },
      ]),
    )
    // Food 4 has no size word anywhere: the default row stands in for medium.
    expect(db.fnddsPortionGrams('4', 'medium')).toBe(160)
    // Food 5 has an explicit medium: the default must NOT clobber it.
    expect(db.fnddsPortionGrams('5', 'medium')).toBe(118)
  })

  it('returns null for foods and measures it cannot classify', async () => {
    const db = await loadFoodDb(
      fakeDb([{ food_id: 6, measure_unit: 'undetermined', modifier: 'oz', amount: 1, gram_weight: 28, is_fndds_default: 0 }]),
    )
    expect(db.fnddsPortionGrams('6', 'per_unit')).toBeNull()
    expect(db.fnddsPortionGrams('6', 'medium')).toBeNull()
    expect(db.fnddsPortionGrams('999', 'medium')).toBeNull()
  })
})
