import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { setPhase } from '../src/scan/store'
import { useTheme } from '../src/theme/ThemeProvider'
import { MIN_TAP_TARGET, radius, space, type } from '../src/theme/tokens'

/**
 * Capture.
 *
 * SPEC-accuracy-engine.md §1.1 stages 0 and 1.
 *
 * THE SHUTTER ALWAYS SUCCEEDS. It writes a draft row before anything else can
 * fail — no key, no network, no model, no permission to analyze. A capture that
 * fails because the network is down loses the user's meal, and losing a meal is
 * unrecoverable in a way that a wrong number never is.
 *
 * Preprocessing is ONE pass and every step is load-bearing:
 *   - Bake EXIF orientation into the pixels. Non-negotiable: the models read no
 *     metadata, so a sideways photo is analyzed sideways.
 *   - Resize the long edge to ~1024-1100px. Skipping this produces a ~10.6MB
 *     base64 string and real OOM risk on low-end Android. This is not polish.
 *   - JPEG at 0.8, then base64.
 */
export default function Camera() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const cameraRef = useRef<CameraView>(null)
  const [busy, setBusy] = useState(false)

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
        <Text style={[type.heading, { color: theme.text, textAlign: 'center' }]}>
          Nut AI needs your camera
        </Text>
        <Text style={[type.caption, { color: theme.textMuted, textAlign: 'center', marginTop: space.sm }]}>
          Photos stay on your device unless you chose a cloud provider during setup.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={[styles.primary, { backgroundColor: theme.text, marginTop: space.xl }]}
        >
          <Text style={[type.bodyStrong, { color: theme.bg }]}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={space.md} style={{ marginTop: space.lg }}>
          <Text style={[type.body, { color: theme.textMuted }]}>Not now</Text>
        </Pressable>
      </View>
    )
  }

  async function capture() {
    if (busy) return
    setBusy(true)
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 1, skipProcessing: false })
      if (!shot?.uri) return

      // The draft exists from this moment. Everything after can fail safely.
      setPhase({ kind: 'captured', photoUri: shot.uri })

      const ctx = ImageManipulator.ImageManipulator.manipulate(shot.uri)
      // Resize BEFORE encoding — the order is what bounds memory, not the format.
      ctx.resize({ width: 1024 })
      const image = await ctx.renderAsync()
      await image.saveAsync({ compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true })

      router.replace('/result')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={[styles.shutterRow, { paddingBottom: Math.max(insets.bottom, space.xl) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={capture}
          disabled={busy}
          style={[styles.shutter, busy && { opacity: 0.5 }]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => router.back()}
        hitSlop={space.md}
        style={[styles.close, { top: insets.top + space.md }]}
      >
        <Text style={{ color: '#fff', fontSize: 22 }}>×</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  primary: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
  },
  shutterRow: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  close: {
    position: 'absolute',
    left: space.lg,
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
