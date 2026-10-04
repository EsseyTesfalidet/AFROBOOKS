# Installed app appearance

The existing website retains its presentation. Installed Android/TWA, PWA and iOS standalone sessions gain:

- An Auto → Light → Dark header control and explicit choices in Account settings. Auto uses the device's local time: Light at 06:00 and Dark at 18:00. Preferences persist on the device; a head bootstrap applies the palette before hydration. Timers and resume/focus events recheck the clock, and browser theme-color follows the selected palette.
- Soft book/checkout tints and cover shadows. `useCoverTint` lazily loads [Fast Average Color](https://github.com/fast-average-color/fast-average-color) only for the current cover. Sampling uses the dominant color, ignores near-white/black, and caches up to 48 results in memory. Failed/CORS-blocked images use saved cover colors. A multi-book checkout uses its first title's cover. No images are uploaded or processed on the server for this effect.
- Short page fades, cover entrance motion, reader sheet entrances and press feedback. All decorative CSS motion stops for reduced-motion preferences. Page containers are never transformed, preserving the reader and fixed navigation.
- Optional light touch feedback for actual page/chapter changes, reading/app theme changes and confirmed receipts. Vibration is guarded by installed mode, touch capability, feature support, visibility, reduced motion and the saved feedback preference. Receipt feedback is deduplicated and uses the existing completed-order state; it does not authorize or confirm payments. [Browser vibration restrictions](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) may prevent the device from vibrating, especially after payment redirects; visual confirmations always remain available.
- New readers follow Paper or Night according to the app palette until they explicitly select a reader theme. Every legacy saved reader theme is treated as an intentional choice and preserved. Reader colors and cover artwork are excluded from the app's Light palette.

There is no audio player in the current app. Audio tint, play/pause morphing and playback haptics are not implemented; they require an audio feature first.

`npm test` covers local-time boundaries, bootstrap recovery and tint validation. `tests/mobile-appearance.browser.cjs` exercises the real book, checkout, receipt, reader and app controls with fixture Firebase/Stripe boundaries. It covers themes, persistence, cover sampling/fallback, rotation, legacy reader settings, reduced motion, unsupported/disabled haptics, and pending/completed/refunded receipts. Use `PLAYWRIGHT_PATH`, optional `EDGE_PATH` and optional `SCREENSHOT_DIR`. These browser simulations do not validate physical vibration hardware or real card payments.

Deployment requires the user's explicit approval. Do not upload even a preview deployment before that approval.
