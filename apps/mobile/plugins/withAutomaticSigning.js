const { withXcodeProject } = require('@expo/config-plugins')

/**
 * Forces "Automatically manage signing" on for the app target, with no team
 * baked in, on every prebuild.
 *
 * WHY THIS EXISTS: bug report — "Trying to Sign the app but it doesn't
 * work." This app has no server and no store listing (README, "Put it on
 * your phone"), so every builder signs with their OWN free Apple ID, and the
 * one thing a repo must never do is bake in the original developer's team —
 * that would only work for that one Apple account and would silently break
 * (or worse, silently sign as someone else's team, which Xcode refuses) the
 * build for everyone else. What the repo CAN own is making sure the
 * generated project is already in "Automatically manage signing" mode, so
 * the only thing left for a builder to do in Xcode is pick their own team
 * from the dropdown — never hunt for a checkbox or a Manual/profile flow.
 *
 * `npm run prebuild` runs `expo prebuild --clean`, which regenerates ios/
 * from scratch every time (see apps/mobile/package.json) — nothing here can
 * rely on a hand-edited .xcodeproj surviving. Without this plugin the
 * emitted project simply omits `ProvisioningStyle`, which happens to
 * resolve to Automatic on current Xcode (verified: the real error you get
 * building for a device with no team picked is "Signing ... requires a
 * development team" — the Automatic-mode error, not a Manual-mode
 * "no matching provisioning profile" error). That is Xcode's current
 * default, not something this repo asserts, and a future Expo/React Native
 * template bump could start emitting Manual with no warning. Setting it
 * explicitly, every prebuild, removes that drift risk instead of relying on
 * an implicit default this repo does not control.
 */
module.exports = function withAutomaticSigning(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const target = project.getFirstTarget()
    if (target) {
      project.addTargetAttribute('ProvisioningStyle', 'Automatic', target)
    }

    // Strip any DEVELOPMENT_TEAM a stale cache could otherwise leave behind.
    // This repo never sets one on purpose — see the plugin doc comment above.
    const buildConfigs = project.pbxXCBuildConfigurationSection()
    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key]
      if (entry && entry.buildSettings && 'DEVELOPMENT_TEAM' in entry.buildSettings) {
        delete entry.buildSettings.DEVELOPMENT_TEAM
      }
    }

    return cfg
  })
}
