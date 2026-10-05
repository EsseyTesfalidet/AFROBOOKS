# AfroBooks Android release

The Android app opens the live AfroBooks website at `https://afrobs.com/browse` using a Trusted Web Activity, originally generated with Bubblewrap 1.25.0. Version 3 adds the native bridge for one-time video purchases through Google Play. Website updates appear without rebuilding the wrapper; a network connection and a compatible browser are required. The website payment code was deployed on October 4, 2026; Console setup and a Play-installed device test remain required.

| Setting | Value |
| --- | --- |
| Application ID | `com.afrobs.app` |
| Version | `1.0.2` |
| Version code | `3` |
| Minimum Android API | `24` (Android 7; required by the updated browser helper) |
| Target and compile API | `36` (Android 16) |
| Orientation | Any; portrait and landscape |
| Signed Play upload | `dist/android/afrobooks-1.0.2.aab` |
| Signed device-test install | `dist/android/afrobooks-1.0.2.apk` |
| Public upload certificate | `dist/android/afrobooks-upload-certificate.pem` |
| File hashes and certificate fingerprint | `dist/android/release-info.json` |

The bundle is signed and passes Google's bundletool validation. The APK signature also verifies. These checks do not replace a physical-device test or Google Play review; no app has been submitted to Play Console by this build process.

## Upload to Google Play

1. Open the existing AfroBooks listing in Play Console, then upload `afrobooks-1.0.2.aab` to an internal or closed testing release. The `.apk` is for direct installation on a test device; it is not the Play upload artifact. If version code 3 has been used outside this workspace, increase it and rebuild first.
2. Enroll in Play App Signing. The generated local key signs uploads. If Google generates the app-signing key, Play-installed copies will have a different certificate from this local upload key.
3. The owner-provided **app signing key certificate SHA-256 fingerprint** beginning `51:C3:69:60` is now in `public/.well-known/assetlinks.json`, alongside the existing upload fingerprint. The website now serves both fingerprints; the HTTPS response was verified after deployment. The fingerprint is public; never share the private key or passwords.
4. Verify `https://afrobs.com/.well-known/assetlinks.json` returns both fingerprints directly over HTTPS. Test the Play-installed app to confirm the website opens as a Trusted Web Activity. Until the Play certificate is served by the website, it can fall back to a browser tab with visible browser controls.
5. Complete the store listing, data safety, content rating and any account-specific testing requirements. Review the payment setup before requesting public publication.

Store artwork: `public/pwa-512x512.png` and `public/brand/afrobooks-feature-graphic.png` (1024 × 500 RGB PNG).

## Payment release prerequisite

October 4 update: version 3 includes the Google Play video payment bridge.
The server supports live and license-test purchases, permanent library ownership
while the purchase is active, restore, refunds and 80/20 net revenue accounting.
See [Video Play Billing setup](video-play-billing.md) for Console and per-title
activation steps. A successful notification test and an active product are required.
The API accepted the version-3 bundle upload in an edit, but denied both the
closed-track update and edit commit (HTTP 403). The existing alpha release remains
version 2. The billing service account needs the app-scoped testing-release
permission, or the owner can upload the AAB to the existing closed track.
The upload is not a committed or available testing release. No physical-device
purchase has been completed. Updating the same track preserves tester enrollment.

The website's ebook checkout still uses Stripe. This video integration does not
implement Play Billing for books or enroll the app in alternative billing.
Resolve the [Android ebook payment gap](android-stripe-payments.md) before public
release. A validated bundle does not establish payment-policy approval.

## Preserve the signing material

Private signing files are outside the repository in `%USERPROFILE%\.android\afrobooks`:

- `afrobooks-upload.jks`: private upload keystore.
- `signing-secrets.json`: key alias and randomly generated passwords.

The directory is restricted to the current Windows user. Back up **both files** to secure private storage; the passwords are not printed in build logs or committed. Do not upload this directory to Vercel, GitHub, or the public website. Do not regenerate a key for routine updates.

The certificate PEM, fingerprints, `.aab`, and `.apk` do not contain the private signing key.

## Rebuild

The generated native source is in `android/`. JDK 17, Android SDK API 36 and build-tools 36.0.0 are installed under `C:\AfroBooksBuild`. The Gradle wrapper pins Gradle 8.11.1; the generated Android plugin is 8.9.1. Bubblewrap is only needed to regenerate the project, not for normal builds.

The native source now has manual billing changes: `VideoPaymentActivity`, its
manifest registration and the Digital Goods handler in `DelegationService`.
Do not overwrite these with an unreviewed Bubblewrap regeneration. The custom
activity forwards an obfuscated AfroBooks account ID; the server requires that
binding when accepting a purchase. Browser helper 2.7.3, its billing bridge 1.2.0
and Play Billing Client 8.3.0 are pinned in Gradle.

```powershell
./scripts/build-android.ps1
```

Override `-JavaHome`, `-AndroidSdkPath`, `-GradleCache`, and `-BundletoolPath` on a different machine. Restore the private signing directory first; alternatively set `AFROBOOKS_SIGNING_DIR` to its protected location. Update the ignored `android/local.properties` SDK path if moving the build environment.

The script compiles the bundle and APK, signs them using environment-based password passing, verifies their signatures, and validates the bundle. Output files remain in the Git- and Vercel-excluded `dist/android/` directory.

For subsequent releases, increase `versionCode` in `android/app/build.gradle`, keep its `versionName` synchronized with `android/twa-manifest.json`, and update `appVersionCode`, `appVersionName`, and `appVersion` in that JSON. Keep `com.afrobs.app` and the existing upload key. The script exports files using the manifest version; never reuse a version code already uploaded to Play.

## References

- [Trusted Web Activities quick start and signing certificates](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)
- [Current Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Google Play payment-policy guidance](https://support.google.com/googleplay/android-developer/answer/10281818)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
