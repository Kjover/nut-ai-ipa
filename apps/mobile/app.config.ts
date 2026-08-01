import type { ExpoConfig } from 'expo/config'

/**
 * App configuration.
 *
 * Every identity string lives in ONE place so the eventual rename is a one-file
 * change rather than a grep across the codebase. `Nut AI` was chosen over the
 * research documents' working codename `Tally`.
 */
const NAME = 'Nut AI'
const SLUG = 'nut-ai'
const BUNDLE_ID = 'com.nutai.app'
const SCHEME = 'nutai'

const config: ExpoConfig = {
  name: NAME,
  slug: SLUG,
  version: '0.1.0',
  orientation: 'portrait',
  // Deep links carry widget taps and notification actions straight to a screen.
  scheme: SCHEME,
  userInterfaceStyle: 'automatic',
  // No `newArchEnabled` flag: the New Architecture is the default in SDK 57 and
  // the option was removed from ExpoConfig entirely. Setting it is now a
  // typecheck error, which is how this was caught.

  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // Required by App Store review, and true: there is no server we operate,
      // so there is no non-exempt encryption to declare.
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        'Nut AI uses your camera to photograph meals and scan barcodes. Photos stay on your device unless you choose a cloud provider during setup.',
      NSPhotoLibraryUsageDescription:
        'Nut AI can read a meal photo you already took. Photos stay on your device unless you choose a cloud provider during setup.',
      NSFaceIDUsageDescription:
        'Nut AI uses Face ID only when you reveal or edit a stored API key — never to log a meal.',
    },
  },

  android: {
    package: BUNDLE_ID,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B0B0F' },
    permissions: ['android.permission.CAMERA'],
    // No Google Play Services dependency: all notifications are local, there is
    // no push token and no FCM. Preserving that keeps F-Droid viable, which
    // matters for an AGPL project.
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },

  plugins: [
    'expo-router',
    ['expo-camera', { cameraPermission: 'Nut AI uses your camera to photograph meals and scan barcodes.' }],
    'expo-secure-store',
    'expo-sqlite',
  ],

  experiments: { typedRoutes: true },

  extra: {
    // NEVER put an API key here. Keys are written only from runtime user input
    // into expo-secure-store — never from EXPO_PUBLIC_*, app config, .env, or EAS
    // secrets. Anything in `extra` ships in the bundle and is readable by anyone.
    bundleId: BUNDLE_ID,
  },
}

export default config
