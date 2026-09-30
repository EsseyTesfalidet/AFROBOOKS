# AfroBooks Android release

The Android app opens the live AfroBooks website at `https://afrobs.com/browse` using a Trusted Web Activity. This is the first Android release, generated with Bubblewrap 1.25.0. Website updates appear without rebuilding the wrapper; a network connection and a compatible browser are required.

| Setting | Value |
| --- | --- |
| Application ID | `com.afrobs.app` |
| Version | `1.0.0` |
| Version code | `1` |
| Minimum Android API | `23` |
| Target and compile API | `36` (Android 16) |
| Orientation | Any; portrait and landscape |
| Signed Play upload | `dist/android/afrobooks-1.0.0.aab` |
| Signed device-test install | `dist/android/afrobooks-1.0.0.apk` |
| Public upload certificate | `dist/android/afrobooks-upload-certificate.pem` |
| File hashes and certificate fingerprint | `dist/android/release-info.json` |

The bundle is signed and passes Google's bundletool validation. The APK signature also verifies. These checks do not replace a physical-device test or Google Play review; no app has been submitted to Play Console by this build process.

## Upload to Google Play

1. Create the AfroBooks listing in Play Console, then use its internal testing release workflow to upload the `.aab`. The `.apk` is for direct installation on a test device; it is not the Play upload artifact.
2. Enroll in Play App Signing. The generated local key signs uploads. If Google generates the app-signing key, Play-installed copies will have a different certificate from this local upload key.
3. In Play Console's app-signing section, copy the **app signing key certificate SHA-256 fingerprint**. Add it alongside the existing fingerprint in `public/.well-known/assetlinks.json`, then deploy the website. The current entry identifies the locally signed APK, not an as-yet-unknown Google-generated certificate. The fingerprint is public; never share the private key or passwords.
4. Verify `https://afrobs.com/.well-known/assetlinks.json` returns the JSON directly over HTTPS. Test the Play-installed app to confirm the website opens as a Trusted Web Activity. Until the Play certificate is added, it can fall back to a browser tab with visible browser controls.
5. Complete the store listing, data safety, content rating and any account-specific testing requirements. Review the payment setup before requesting public publication.

Store artwork: `public/pwa-512x512.png` and `public/brand/afrobooks-feature-graphic.png` (1024 × 500 RGB PNG).

## Payment release prerequisite

The current site uses Stripe for ebook purchases. This wrapper does **not** add Google Play Billing or enroll the app in an alternative-billing program. Google Play's digital-content payment rules apply to the app and its website experience. Determine and implement the applicable billing approach for the intended distribution regions before public release; producing a valid bundle does not establish payment-policy approval.

## Preserve the signing material

Private signing files are outside the repository in `%USERPROFILE%\.android\afrobooks`:

- `afrobooks-upload.jks`: private upload keystore.
- `signing-secrets.json`: key alias and randomly generated passwords.

The directory is restricted to the current Windows user. Back up **both files** to secure private storage; the passwords are not printed in build logs or committed. Do not upload this directory to Vercel, GitHub, or the public website. Do not regenerate a key for routine updates.

The certificate PEM, fingerprints, `.aab`, and `.apk` do not contain the private signing key.

## Rebuild

The generated native source is in `android/`. JDK 17, Android SDK API 36 and build-tools 36.0.0 are installed under `C:\AfroBooksBuild`. The Gradle wrapper pins Gradle 8.11.1; the generated Android plugin is 8.9.1. Bubblewrap is only needed to regenerate the project, not for normal builds.

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
