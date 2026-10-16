# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-16

### Added

-   `ROADMAP.md`: the plugin's spec — legal floor, decisions, `config/consent.yaml` reference, `app.consent` shape, markup contract, storage format, public JS API, asset paths, slices and open questions.
-   `config/consent.yaml`: `revision`, `privacy_url`, `notice`, `categories` with `services` (`name`, `provider`, `purpose`, `privacy_url`, `cookies`, `hosts`, `scripts`) and `texts`; every key falls back with a warning, unknown keys are ignored, `necessary` and pre-selection cannot be configured. Publish the documented default with `npx nera-consent`.
-   `getAppData` writes `app.consent` (`mode`, `revision`, `storageKey`, `languages`, per-language `locales` with texts, categories and privacy URL, `scripts`, `hosts`); root-absolute URLs get `base_path`.
-   Built-in German and English texts, overridable per language through `texts` or `app.translations` (`consent.<key>`).
-   `getMetaData` replaces every iframe whose `src` host (or a subdomain of it) is in a service's `hosts` with a two-click placeholder: the iframe keeps its attributes, its URL moves to `data-consent-src`, a `srcdoc` is dropped, and nothing else in the page changes. A gated iframe the rewrite cannot reach (inside `<select>`) is reported with a warning naming the page and the host.
-   `getAssets` ships the runtime to `public/_nera/consent.js` and `public/_nera/consent.css`; the build fails on `@nera-static/core` older than 4.13.0.
-   The runtime (`consent.js`): reads and stores the choice in `localStorage` (`nera-consent`), shows the banner or the notice while there is no valid choice for the page's `revision`, activates gated scripts in document order and gated iframes once their category is granted, loads a single embed from its placeholder without storing anything, and reopens the settings dialog from any `data-consent-open` element.
-   `window.neraConsent` (`open()`, `get()`, `has(id)`) and the `nera-consent:change` event on `document`.
-   The stylesheet (`consent.css`), themed through `--nera-consent-*` custom properties whose defaults reach at least 4.5:1 contrast; Accept all, Reject all and Settings share one button style.
-   Pug views `banner`, `settings`, `notice`, `head` (the configured scripts, gated) and `embed` (the `+consent-embed` mixin, the same placeholder as the iframe rewrite), published with `npx nera-consent-templates` to `views/vendor/plugin-consent/`.
