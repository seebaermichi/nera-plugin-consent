# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

-   `ROADMAP.md`: the plugin's spec — legal floor, decisions, `config/consent.yaml` reference, `app.consent` shape, markup contract, storage format, public JS API, asset paths, slices and open questions.
-   Package scaffold: hook stubs, tests, lint, CI workflows.
-   `config/consent.yaml`: `revision`, `privacy_url`, `notice`, `categories` with `services` (`name`, `provider`, `purpose`, `privacy_url`, `cookies`, `hosts`, `scripts`) and `texts`; every key falls back with a warning, unknown keys are ignored, `necessary` and pre-selection cannot be configured. Publish the documented default with `npx nera-consent`.
-   `getAppData` writes `app.consent` (`mode`, `revision`, `storageKey`, `languages`, per-language `locales` with texts, categories and privacy URL, `scripts`, `hosts`); root-absolute URLs get `base_path`.
-   Built-in German and English texts, overridable per language through `texts` or `app.translations` (`consent.<key>`).
