/**
 * GTIN normalization.
 *
 * SPEC-accuracy-engine.md §5.6. A UPC-A is technically an EAN-13 with a leading
 * zero, so everything is normalized to a canonical 13-digit GTIN at BOTH
 * index-build time and scan time. Standard GS1 practice, and the reason a UPC-A
 * scanned off a US package finds the same row as its EAN-13 equivalent.
 *
 * Getting this wrong produces the most confusing possible bug class: the barcode
 * is in the database, the scan succeeds, and the lookup misses.
 */

/** Expand a UPC-E (8 digits) to its UPC-A (12 digit) form. */
export function upcEToUpcA(upce: string): string | null {
  const d = upce.replace(/\D/g, '')
  if (d.length !== 8) return null

  const numberSystem = d[0]
  const check = d[7]
  const body = d.slice(1, 7)
  if (numberSystem === undefined || check === undefined) return null
  if (numberSystem !== '0' && numberSystem !== '1') return null

  const m = body[5]
  const first5 = body.slice(0, 5)
  let mfr: string
  let item: string

  switch (m) {
    case '0':
    case '1':
    case '2':
      mfr = `${first5.slice(0, 2)}${m}00`
      item = `00${first5.slice(2, 5)}`
      break
    case '3':
      mfr = `${first5.slice(0, 3)}00`
      item = `000${first5.slice(3, 5)}`
      break
    case '4':
      mfr = `${first5.slice(0, 4)}0`
      item = `0000${first5.slice(4, 5)}`
      break
    default:
      mfr = first5
      item = `0000${m}`
      break
  }

  return `${numberSystem}${mfr}${item}${check}`
}

/** GS1 mod-10 check digit over a digit string excluding its own check digit. */
export function gs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0
  // Weights alternate 3,1 from the RIGHTMOST position of the body.
  const reversed = [...digitsWithoutCheck].reverse()
  reversed.forEach((ch, i) => {
    const n = Number(ch)
    sum += i % 2 === 0 ? n * 3 : n
  })
  return (10 - (sum % 10)) % 10
}

export function isValidGtin(gtin: string): boolean {
  const d = gtin.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(d.length)) return false
  const body = d.slice(0, -1)
  const check = Number(d.slice(-1))
  return gs1CheckDigit(body) === check
}

/**
 * Canonical 13-digit GTIN.
 *
 * UPC-E expands to UPC-A, UPC-A zero-pads to EAN-13, EAN-8 zero-pads, GTIN-14
 * drops its packaging indicator when that leaves a valid 13. Returns null for
 * anything that is not a plausible GTIN, rather than guessing.
 */
export function normalizeGtin(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  if (d.length === 0) return null

  if (d.length === 8) {
    // Could be EAN-8 or UPC-E. Try UPC-E expansion first when it validates.
    const upca = upcEToUpcA(d)
    if (upca && isValidGtin(upca)) return upca.padStart(13, '0')
    return isValidGtin(d) ? d.padStart(13, '0') : null
  }

  if (d.length === 12 || d.length === 13) {
    return isValidGtin(d) ? d.padStart(13, '0') : null
  }

  if (d.length === 14) {
    const inner = d.slice(1)
    if (isValidGtin(inner)) return inner
    return isValidGtin(d) ? d : null
  }

  return null
}
