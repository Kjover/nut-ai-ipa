import { migrate, type DbAdapter } from '@nutai/db-adapter'
import {
  computeMacros,
  computeTrend,
  isDayCompleteEnough,
  trendSlopeLbPerWeek,
  updateAdaptiveTdee,
  type Goal,
  type MacroTargets,
  type WeightPoint,
} from '@nutai/goals'
import { openUserDb } from '../db/expo-adapter'

/**
 * The read/write layer over `user.db`.
 *
 * Every screen goes through here rather than holding its own SQL, so the
 * invariants live in one place: goals are append-only, day totals are always
 * derived from log_items rather than stored, and the adaptive loop can never run
 * on days it should not admit.
 */

let cached: DbAdapter | null = null

export async function db(): Promise<DbAdapter> {
  if (cached) return cached
  const handle = await openUserDb()
  await migrate(handle, Date.now())
  cached = handle
  return handle
}

export function localDate(ms: number): string {
  // Local, not UTC. An 11pm meal must not migrate to tomorrow, and a user who
  // flies must not have yesterday's log rewritten under them.
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export interface CurrentGoal {
  goalType: Goal
  targetKcal: number
  targetRawKcal: number
  floorApplied: boolean
  protein_g: number
  fat_g: number
  carbs_g: number
  bmr: number
  tdee: number
  adaptive: boolean
  effectiveFrom: number
}

/**
 * The goal in force right now.
 *
 * `goals` is append-only, so "current" means the newest row — and a historical
 * day can still be read against whichever row was in force that day. Recomputing
 * March against August's target would silently rewrite whether someone hit their
 * goal three months ago.
 */
export async function currentGoal(): Promise<CurrentGoal | null> {
  const h = await db()
  const row = await h.get<{
    goal_type: string
    target_kcal: number
    target_raw_kcal: number
    floor_applied: number
    protein_g: number
    fat_g: number
    carbs_g: number
    bmr: number
    tdee: number
    adaptive: number
    effective_from: number
  }>('SELECT * FROM goals ORDER BY effective_from DESC, id DESC LIMIT 1')

  if (!row) return null
  return {
    goalType: row.goal_type as Goal,
    targetKcal: row.target_kcal,
    targetRawKcal: row.target_raw_kcal,
    floorApplied: row.floor_applied === 1,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    carbs_g: row.carbs_g,
    bmr: row.bmr,
    tdee: row.tdee,
    adaptive: row.adaptive === 1,
    effectiveFrom: row.effective_from,
  }
}

export async function setting(key: string, fallback = ''): Promise<string> {
  const h = await db()
  const row = await h.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? fallback
}

export async function putSetting(key: string, value: string): Promise<void> {
  const h = await db()
  await h.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, value])
}

/** Manual target override from the plan screen's pencil icons. */
export async function overrideTargets(
  next: { targetKcal: number; macros: MacroTargets },
  base: CurrentGoal,
  now: number,
): Promise<void> {
  const h = await db()
  await h.run(
    `INSERT INTO goals
       (effective_from, goal_type, rate_lb_per_week, target_kcal, target_raw_kcal,
        floor_applied, protein_g, fat_g, carbs_g, bmr, tdee, adaptive)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      now,
      base.goalType,
      null,
      next.targetKcal,
      next.targetKcal,
      0,
      next.macros.protein_g,
      next.macros.fat_g,
      next.macros.carbs_g,
      base.bmr,
      base.tdee,
      // A hand-set target turns the adaptive loop OFF. Silently overwriting a
      // number the user deliberately chose is the fastest way to lose their
      // trust in every other number.
      0,
    ],
  )
}

// ---------------------------------------------------------------------------
// Day totals
// ---------------------------------------------------------------------------

export interface DayTotals {
  kcal: number
  protein_g: number
  fat_g: number
  carbs_g: number
  mealCount: number
  distinctSlots: number
  pendingCount: number
}

/**
 * Derived from log_items on every read, never stored.
 *
 * `day_summaries` exists as a cache for the widget, but it is droppable and
 * rebuildable — this query is the source of truth.
 */
export async function dayTotals(date: string): Promise<DayTotals> {
  const h = await db()

  const row = await h.get<{
    kcal: number | null
    p: number | null
    f: number | null
    c: number | null
    meals: number | null
    slots: number | null
  }>(
    `SELECT
       SUM(li.snap_energy_kcal * li.grams / 100.0 * m.portion_eaten_fraction) AS kcal,
       SUM(li.snap_protein_g   * li.grams / 100.0 * m.portion_eaten_fraction) AS p,
       SUM(li.snap_fat_g       * li.grams / 100.0 * m.portion_eaten_fraction) AS f,
       SUM(li.snap_carb_g      * li.grams / 100.0 * m.portion_eaten_fraction) AS c,
       COUNT(DISTINCT m.id)        AS meals,
       COUNT(DISTINCT m.meal_slot) AS slots
     FROM meals m
     JOIN log_items li ON li.meal_id = m.id
     WHERE m.local_date = ? AND m.analysis_status IN ('complete','manual')`,
    [date],
  )

  const pending = await h.get<{ c: number }>(
    `SELECT COUNT(*) c FROM meals
     WHERE local_date = ? AND analysis_status IN ('captured','queued','analyzing')`,
    [date],
  )

  return {
    kcal: row?.kcal ?? 0,
    protein_g: row?.p ?? 0,
    fat_g: row?.f ?? 0,
    carbs_g: row?.c ?? 0,
    mealCount: row?.meals ?? 0,
    distinctSlots: row?.slots ?? 0,
    // Pending scans contribute ZERO calories. A number that silently grows later
    // is worse than a number that is visibly incomplete.
    pendingCount: pending?.c ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export async function logWeight(kg: number, now: number): Promise<void> {
  const h = await db()
  await h.run(
    'INSERT OR REPLACE INTO weight_entries (local_date, weight_kg, logged_at) VALUES (?,?,?)',
    [localDate(now), kg, now],
  )
}

export async function weightHistory(): Promise<WeightPoint[]> {
  const h = await db()
  const rows = await h.all<{ local_date: string; weight_kg: number }>(
    'SELECT local_date, weight_kg FROM weight_entries ORDER BY local_date ASC',
  )
  return rows.map((r) => ({
    day: Math.floor(Date.parse(`${r.local_date}T00:00:00Z`) / 86_400_000),
    weightKg: r.weight_kg,
  }))
}

// ---------------------------------------------------------------------------
// The adaptive loop
// ---------------------------------------------------------------------------

export interface AdaptiveOutcome {
  ran: boolean
  reason: string
  previousKcal?: number
  newKcal?: number
  surfaced?: boolean
  explanation?: string
}

/**
 * Run the adaptive-TDEE estimator and, if it moved enough to matter, write a new
 * goals row.
 *
 * Three gates before it is allowed to change anything, each guarding a real
 * failure:
 *
 *   1. ENOUGH WEIGH-INS. A slope from two points is noise wearing a trend's
 *      clothes.
 *   2. ONLY COMPLETE DAYS feed the intake average. Admitting half-logged days
 *      biases intake downward, which inflates observed TDEE, which RAISES the
 *      target — a silent feedback loop that rewards under-logging.
 *   3. A >= 75 kcal MOVE before anything is surfaced. A target that shifts daily
 *      teaches people to ignore it.
 */
export async function runAdaptive(now: number): Promise<AdaptiveOutcome> {
  const goal = await currentGoal()
  if (!goal) return { ran: false, reason: 'No goal set yet.' }
  if (!goal.adaptive) return { ran: false, reason: 'Adaptive targets are off — you set this target by hand.' }

  const points = await weightHistory()
  if (points.length < 5) {
    return { ran: false, reason: `Needs about ${5 - points.length} more weigh-ins before the trend means anything.` }
  }

  const trend = computeTrend(points)
  const slope = trendSlopeLbPerWeek(trend)
  if (slope == null) return { ran: false, reason: 'Not enough spread in your weigh-ins yet.' }

  const h = await db()
  const days = await h.all<{ local_date: string }>(
    'SELECT DISTINCT local_date FROM meals ORDER BY local_date DESC LIMIT 21',
  )

  let sum = 0
  let admitted = 0
  for (const d of days) {
    const t = await dayTotals(d.local_date)
    const complete = isDayCompleteEnough({
      mealCount: t.mealCount,
      distinctSlotCount: t.distinctSlots,
      hasQueuedEntries: t.pendingCount > 0,
    })
    if (!complete) continue
    sum += t.kcal
    admitted++
  }

  if (admitted < 5) {
    return { ran: false, reason: `Needs about ${5 - admitted} more fully-logged days before adjusting your target.` }
  }

  const updateCount = Number(await setting('adaptive.updateCount', '0'))
  const result = updateAdaptiveTdee({
    currentTdee: goal.targetKcal,
    avgDailyIntakeKcal: sum / admitted,
    trendSlopeLbPerWeek: slope,
    updateCount,
  })

  await putSetting('adaptive.updateCount', String(updateCount + 1))
  await putSetting('adaptive.lastRunAt', String(now))

  if (!result.shouldSurface) {
    return {
      ran: true,
      reason: 'Your target is still right — no change worth showing.',
      previousKcal: goal.targetKcal,
      newKcal: result.newTdee,
      surfaced: false,
    }
  }

  // Macros re-derive from the new target so protein tracks the body, not the
  // budget, and carbs stay the single derived remainder.
  const profile = await h.get<{ height_cm: number }>('SELECT height_cm FROM user_profile WHERE id = 1')
  const latestKg = points[points.length - 1]?.weightKg ?? 80
  const macros = computeMacros(result.newTdee, latestKg, goal.goalType)

  await h.run(
    `INSERT INTO goals
       (effective_from, goal_type, rate_lb_per_week, target_kcal, target_raw_kcal,
        floor_applied, protein_g, fat_g, carbs_g, bmr, tdee, adaptive)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      now,
      goal.goalType,
      null,
      result.newTdee,
      result.newTdee,
      0,
      macros.protein_g,
      macros.fat_g,
      macros.carbs_g,
      goal.bmr,
      result.observedTdee,
    ],
  )
  void profile

  return {
    ran: true,
    reason: 'Target updated.',
    previousKcal: goal.targetKcal,
    newKcal: result.newTdee,
    surfaced: true,
    explanation: result.explanation,
  }
}
