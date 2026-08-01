import * as Haptics from 'expo-haptics'
import { useCallback, useMemo, useRef } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TAP_TARGET, radius, space, type } from '../../theme/tokens'

/**
 * The three input controls the onboarding flow needs, matched to the reference
 * walkthrough: a selectable option card, a segmented unit toggle, and the two
 * value pickers (a horizontal ruler and a vertical wheel).
 */

// ---------------------------------------------------------------------------

export function OptionCard({
  label,
  sublabel,
  glyph,
  selected,
  onPress,
}: {
  label: string
  sublabel?: string
  glyph: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.bgElevated,
          borderColor: selected ? theme.text : theme.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.glyphCircle, { backgroundColor: theme.isDark ? theme.bgSunken : '#F3F2F8' }]}>
        <Text style={{ fontSize: 20 }}>{glyph}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.cardLabel, { color: theme.text }]}>{label}</Text>
        {sublabel ? (
          <Text style={[type.caption, { color: theme.textMuted, marginTop: 2 }]}>{sublabel}</Text>
        ) : null}
      </View>

      <View style={[styles.radioOuter, { borderColor: selected ? theme.text : theme.border }]}>
        {selected ? <View style={[styles.radioInner, { backgroundColor: theme.text }]} /> : null}
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  const theme = useTheme()
  return (
    <View style={[styles.segmentWrap, { backgroundColor: theme.isDark ? theme.bgSunken : '#F0F0F3' }]}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              void Haptics.selectionAsync()
              onChange(o.value)
            }}
            style={[
              styles.segment,
              active && { backgroundColor: theme.bgElevated, ...styles.segmentActive },
            ]}
          >
            <Text
              style={[
                type.bodyStrong,
                { color: active ? theme.text : theme.textMuted, fontSize: 17 },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------

const TICK_SPACING = 12

/**
 * Horizontal ruler picker, used for both weight screens.
 *
 * A scroll position IS the value — there is no separate slider thumb to drift out
 * of sync. Ticks are drawn every `step`, with a taller tick every tenth, and the
 * fixed centre line is the read-out point.
 */
export function RulerPicker({
  min,
  max,
  step,
  value,
  onChange,
  width,
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  width: number
}) {
  const theme = useTheme()
  const lastHaptic = useRef(value)

  const count = Math.round((max - min) / step) + 1
  const ticks = useMemo(() => Array.from({ length: count }, (_, i) => i), [count])
  const sidePad = width / 2

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x
      const index = Math.round(x / TICK_SPACING)
      const next = Math.min(max, Math.max(min, min + index * step))
      if (next !== value) onChange(next)
      // One tick of feedback per whole unit, not per pixel.
      if (Math.abs(next - lastHaptic.current) >= 1) {
        lastHaptic.current = next
        void Haptics.selectionAsync()
      }
    },
    [max, min, onChange, step, value],
  )

  return (
    <View style={{ height: 150 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TICK_SPACING}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentOffset={{ x: ((value - min) / step) * TICK_SPACING, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: sidePad }}
        style={{ height: 110 }}
      >
        <View style={styles.rulerRow}>
          {ticks.map((i) => {
            const major = i % 10 === 0
            const mid = i % 5 === 0
            return (
              <View
                key={i}
                style={{
                  width: TICK_SPACING,
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                }}
              >
                <View
                  style={{
                    width: 1.5,
                    height: major ? 56 : mid ? 40 : 28,
                    backgroundColor: theme.isDark ? theme.textFaint : '#1A1A1F',
                    opacity: major ? 0.9 : 0.45,
                  }}
                />
              </View>
            )
          })}
        </View>
      </ScrollView>

      {/* The fixed read-out line. The value is whatever sits under it. */}
      <View pointerEvents="none" style={[styles.rulerCursor, { left: sidePad - 1 }]}>
        <View style={{ width: 2.5, height: 76, backgroundColor: theme.text, borderRadius: 2 }} />
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------

const ROW_HEIGHT = 46

/** Vertical wheel picker, used for height and date of birth. */
export function Wheel({
  items,
  value,
  onChange,
  width,
  label,
}: {
  items: ReadonlyArray<{ value: number; label: string }>
  value: number
  onChange: (v: number) => void
  width: number
  label: string
}) {
  const theme = useTheme()
  const index = Math.max(0, items.findIndex((i) => i.value === value))

  return (
    <ScrollView
      accessibilityLabel={label}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW_HEIGHT}
      decelerationRate="fast"
      scrollEventThrottle={16}
      contentOffset={{ x: 0, y: index * ROW_HEIGHT }}
      contentContainerStyle={{ paddingVertical: ROW_HEIGHT * 2 }}
      onScroll={(e) => {
        const i = Math.round(e.nativeEvent.contentOffset.y / ROW_HEIGHT)
        const next = items[Math.min(items.length - 1, Math.max(0, i))]
        if (next && next.value !== value) {
          void Haptics.selectionAsync()
          onChange(next.value)
        }
      }}
      style={{ width, height: ROW_HEIGHT * 5 }}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <View key={item.value} style={{ height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
            <Text
              style={{
                fontSize: active ? 24 : 22,
                fontWeight: active ? '700' : '400',
                color: active ? theme.text : theme.textFaint,
              }}
            >
              {item.label}
            </Text>
          </View>
        )
      })}
    </ScrollView>
  )
}

/** The selection band drawn behind a row of wheels. */
export function WheelHighlight({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ height: ROW_HEIGHT * 5, justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={[
          styles.wheelBand,
          { backgroundColor: theme.isDark ? theme.bgSunken : '#F2F2F5' },
        ]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>{children}</View>
    </View>
  )
}

export const WHEEL_ROW_HEIGHT = ROW_HEIGHT

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    marginBottom: space.md,
    minHeight: 84,
  },
  glyphCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 18, fontWeight: '700' },
  radioOuter: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 14, height: 14, borderRadius: radius.pill },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 4,
    alignSelf: 'center',
  },
  segment: {
    paddingHorizontal: space.xxl,
    height: MIN_TAP_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 112,
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rulerRow: { flexDirection: 'row', alignItems: 'flex-start', height: 76 },
  rulerCursor: { position: 'absolute', top: 0, alignItems: 'center' },
  wheelBand: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    height: ROW_HEIGHT + 8,
    borderRadius: radius.lg,
  },
})
