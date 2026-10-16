# @nera-static/plugin-consent

[![Test](https://github.com/seebaermichi/nera-plugin-consent/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/nera-plugin-consent/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/@nera-static/plugin-consent)](https://www.npmjs.com/package/@nera-static/plugin-consent)

A plugin for the [Nera](https://github.com/seebaermichi/nera) static site generator that adds a consent banner and a settings dialog, and keeps scripts and embeds inert until the visitor agrees, all configured in `config/consent.yaml`. A site that loads nothing it needs consent for gets only a short info notice.

📖 **Documentation:** [nera.js.org](https://nera.js.org)

> Requires `@nera-static/core` **4.13.0 or later** (see [Compatibility](#compatibility)).

**The texts this plugin ships are defaults, not legal advice.** The plugin implements a technical floor (below). It does not make your site compliant with any law; check your texts, your services and your privacy policy yourself or with someone qualified to advise you.

## ✨ Features

- A banner with **Accept all, Reject all and Settings** on the first layer, in a fixed order and one shared button style
- A settings dialog (native `<dialog>`) listing every category and service with provider, purpose, cookies and privacy link
- Gated scripts: configured once, emitted inert (`type="text/plain"`) and run only after consent, in document order
- Gated embeds: an `<iframe>`, `<embed>`, `<object>`, `<video>` or `<audio>` from a configured host in your Markdown becomes a two-click placeholder at build time, with no live `src`
- No categories configured → only an info notice ("only technically necessary cookies"), or nothing at all
- Bump `revision` to ask every visitor again
- German and English texts built in, any other language by config
- A small vanilla runtime and stylesheet, themed through `--nera-consent-*` custom properties, with no third-party library

### What the config cannot change

These hold whatever `config/consent.yaml` says. No key exists that weakens them; a key that tries is warned about and ignored.

- Reject all is on the first layer, as visible and as easy to use as Accept all.
- No category is pre-selected. "Strictly necessary" is the only always-on category; it is implicit and cannot be listed or switched off.
- Nothing gated runs or loads before consent. Every built page starts with gated scripts inert and gated iframes and media without a live loading attribute.
- Consent can be withdrawn at any time through the settings link, without a rebuild.
- A `revision` bump asks every visitor again.

## 🚀 Installation

```bash
npm install @nera-static/plugin-consent
npx nera-consent              # copies the documented config/consent.yaml
npx nera-consent-templates    # copies the views to views/vendor/plugin-consent/
```

Nera detects the plugin on `nera build`. `config/consent.yaml` is optional: without it the site is in notice mode. Both commands skip a file or folder that already exists; `--force` overwrites it (and discards your edits).

Plugins cannot touch layouts, so wiring the views and the runtime into your layout is the one manual step:

```pug
doctype html
html(lang=meta.lang || app.lang)
    head
        link(rel='stylesheet' href='/_nera/consent.css')
        include /vendor/plugin-consent/head
        script(src='/_nera/consent.js' defer)
    body
        main
            != content
        footer
            a(href='/privacy.html' data-consent-open) Privacy settings
        include /vendor/plugin-consent/banner
        include /vendor/plugin-consent/settings
        include /vendor/plugin-consent/notice
```

- `head` emits your configured scripts, inert. Put it inside `<head>`.
- `banner`, `settings` and `notice` go at the end of `<body>`. Each renders only in its own mode, so include all three.
- `consent.js` and `consent.css` are copied to `public/_nera/` on every build and get `base_path` and asset hashing like any other asset. Load the runtime with `defer`.

## The settings link

Visitors must be able to change or withdraw their choice at any time, so place a link or button that reopens the settings dialog, typically in the footer. Any element with `data-consent-open` does it, without inline JavaScript:

```pug
a(href='/privacy.html' data-consent-open) Privacy settings
```

```html
<button type="button" data-consent-open>Privacy settings</button>
```

On a link, the `href` is the fallback: without the dialog on the page (or without JavaScript) the link simply goes to your privacy page. From your own scripts, call `window.neraConsent.open()`.

## ⚙️ Configuration

Every key is optional and falls back to a default, with a build warning when a value has the wrong type. Unknown keys are warned about and ignored.

```yaml
# Bump to ask every visitor again (integer ≥ 1). Default: 1.
revision: 1

# Your privacy policy. Root-absolute (base_path is applied) or absolute,
# one URL for all languages or one per language. Without it the banner has
# no privacy link, and the build warns.
privacy_url:
    de: /datenschutz.html
    en: /en/privacy.html

# Show the info notice when there are no categories. Default: true.
# false → no consent UI at all. Ignored, with a warning, once a category exists.
notice: true

# Optional categories, in display order. None → notice mode.
categories:
    - id: analytics                 # [a-z][a-z0-9-]*; `necessary` is reserved
      label: Statistics             # optional for analytics, media, marketing,
                                    # functional (built in); else the id shows
      description: Helps us …       # optional
      services:                     # at least one
          - name: Matomo            # required
            provider: Example GmbH, Berlin   # required
            purpose: Counts visits without profiles.   # required
            privacy_url: https://example.com/privacy   # optional
            cookies:                # optional, listed in the dialog
                - name: _pk_id
                  duration: 13 months
                  purpose: Recognises returning visitors.
            hosts:                  # optional: embed hosts gated by this service
                - matomo.example.com
            scripts:                # optional: emitted gated by the head view
                - src: https://matomo.example.com/matomo.js
                  async: true       # optional: async | defer | module
                - inline: |
                      var _paq = window._paq = window._paq || [];

# Optional text overrides per language (see "Texts").
texts:
    fr:
        banner_title: Cookies et contenus externes
```

`label`, `description`, `purpose`, `privacy_url` and a cookie's `duration` and `purpose` take one text or one text per language (`{ de: …, en: … }`).

What is checked:

- A category needs a valid, unique id and at least one valid service, else it is dropped with a warning. A category with id `necessary` is dropped.
- A service needs `name`, `provider` and `purpose`, else it is dropped. A cookie needs a `name`.
- A host is a bare host name: no scheme, path or port.
- A script has exactly one of `src` and `inline`.
- There are no keys to pre-select a category, to hide, rename, reorder or style a banner button, to list `necessary`, or to change the storage key.

**Adding a service or a category to a site that already shows the banner does not ask returning visitors again by itself — bump `revision`.** Adding the first category to a site in notice mode does ask again.

### Embeds in your pages

Paste the embed code into your Markdown as usual:

```html
<iframe src="https://www.youtube-nocookie.com/embed/abc" title="Our video" width="560" height="315" allowfullscreen></iframe>
```

When the host of its `src` equals a configured `hosts` entry or is a subdomain of it (`www.youtube.com` matches `youtube.com`; `notyoutube.com` does not), the build replaces it with the two-click placeholder below. Everything else in the page stays byte for byte as it was. Iframes from your own site (root-absolute or relative `src`) are never gated.

`<embed>`, `<object>`, `<video>` and `<audio>` are gated the same way when they load from a configured host — through `src`, `data` or `poster`, or for video and audio through a `<source>` or `<track>` child. Their loading attributes become `data-consent-src`, `data-consent-data`, `data-consent-poster` and `data-consent-srcset` until consent, and the same placeholder follows them. An element mixing services of two categories fails the build: split it into one element per category. Images (`<img>`, `<picture>`) are not gated. Details: [ROADMAP.md](ROADMAP.md#gated-media).

A gated iframe loses a `srcdoc` attribute, which would otherwise render before consent. An iframe or media element the build cannot reach, such as one inside a `<select>`, keeps its live `src`; the build warns with the page and the host, so move it out or use the mixin below.

To place an embed in a Pug view instead, use the mixin from the published `embed` view. It renders exactly the same placeholder:

```pug
include /vendor/plugin-consent/embed

+consent-embed({
    category: 'media',
    service: 'YouTube',
    src: 'https://www.youtube-nocookie.com/embed/abc',
    attributes: { title: 'Our video', width: 560, height: 315, allowfullscreen: true },
})
```

Pass the iframe's attributes in `attributes`, not as Pug attributes. `category` and `service` must name a configured service; otherwise the build fails rather than render a live iframe.

"Load YouTube" in a placeholder loads that one embed for the current page view and stores nothing. Lasting consent for the category comes from the banner or the settings dialog, which the placeholder links to.

### Your own gated scripts

Anything you can configure under `scripts` you can also write by hand, anywhere in a page or view, in the same form (see [Markup contract](#markup-contract)). The runtime treats both alike.

## Texts and languages

Each text resolves per page language (`meta.lang || app.lang`), first hit wins:

1. `config/consent.yaml` → `texts.<lang>.<key>`
2. `app.translations[<lang>]['consent.<key>']` (your `config/app.yaml` translations)
3. the built-in `<lang>` text (`de`, `en`)
4. the built-in `en` text

| key | English default |
|---|---|
| `banner_title` | Cookies and external content |
| `banner_text` | This site can load content and services from third parties. … |
| `accept_all` / `reject_all` / `settings` | Accept all / Reject all / Settings |
| `dialog_title` / `dialog_text` | Privacy settings / Choose which categories you agree to. … |
| `save` / `close` | Save selection / Close |
| `necessary_label` / `necessary_description` / `always_active` | Strictly necessary / Required for the site to work, … / Always active |
| `service_provider` / `service_purpose` / `service_privacy` | Provider / Purpose / Privacy policy of the provider |
| `cookies_heading` / `cookie_name` / `cookie_duration` / `cookie_purpose` | Cookies / Name / Duration / Purpose |
| `notice_text` / `notice_dismiss` | This site uses only technically necessary cookies. / Got it |
| `placeholder_text` | This content is provided by {service}. Loading it connects to {provider}. |
| `placeholder_load` / `placeholder_settings` | Load {service} / Privacy settings |
| `privacy_link` | Privacy policy |

`{service}` and `{provider}` are filled in per embed. An empty override is warned about and ignored, so no label can be blanked out. Categories with the ids `analytics`, `media`, `marketing` and `functional` have built-in German and English labels and descriptions; a category's own `label` and `description` always win.

A French site, for example:

```yaml
texts:
    fr:
        banner_title: Cookies et contenus externes
        accept_all: Tout accepter
        reject_all: Tout refuser
        settings: Paramètres
```

## Markup contract

The attributes below and the BEM classes are public contract (`@nera-static/validate` reads them); renaming any of them is a major release. The runtime binds to the `data-consent*` attributes only, never to classes: restyle or rename classes in your published views freely, but keep every `data-consent*` attribute. The full specification is in [ROADMAP.md](ROADMAP.md).

### Gated scripts

```html
<script type="text/plain" data-consent="analytics" data-src="https://matomo.example.com/matomo.js" async></script>
<script type="text/plain" data-consent="analytics">var _paq = window._paq || [];</script>
<script type="text/plain" data-consent="analytics" data-type="module" data-src="/js/stats.js"></script>
```

- `type="text/plain"` makes the element inert until the runtime activates it.
- `data-consent="<category id>"` — required; the category whose consent activates it.
- `data-src` — the script URL (root-absolute values get `base_path`, D8); absent for an inline script.
- `data-type="module"` — activated as `type="module"`.
- Every other attribute (`async`, `defer`, `integrity`, `crossorigin`, `nonce`, `id`, `data-*` …) is copied to the activated script unchanged.

### Gated iframes

```html
<div class="nera-consent-embed" data-consent-embed data-consent="media">
    <iframe data-consent="media" data-consent-src="https://www.youtube-nocookie.com/embed/abc" title="…" width="560" height="315" allow="…" hidden></iframe>
    <div class="nera-consent-embed__placeholder">
        <p class="nera-consent-embed__text">… connects to <strong>Google Ireland Limited</strong> …</p>
        <button class="nera-consent-embed__load" type="button" data-consent-load>…</button>
        <a class="nera-consent-embed__privacy" href="https://policies.google.com/privacy" rel="noopener">…</a>
        <button class="nera-consent-embed__settings" type="button" data-consent-open>…</button>
    </div>
</div>
```

The build writes it on one line; it is shown indented here.

### Runtime hooks

| attribute | on | meaning |
|---|---|---|
| `data-consent="<id>"` | gated script, gated iframe or media element, embed wrapper | category that activates it |
| `data-src` | gated script | script URL |
| `data-type="module"` | gated script | activate as a module |
| `data-consent-src` | gated iframe, `<embed>`, `<video>`, `<audio>`, their `<source>` / `<track>` | the `src` |
| `data-consent-data` | gated `<object>` | the `data` URL |
| `data-consent-poster` | gated `<video>` | the `poster` URL |
| `data-consent-srcset` | `<source>` in a gated `<video>` / `<audio>` | the `srcset` |
| `data-consent-embed` | placeholder wrapper | one two-click embed |
| `data-consent-load` | button in a placeholder | load this one embed now (D3) |
| `data-consent-open` | any element | open the settings dialog (D4) |
| `data-consent-banner` | banner root | carries `data-consent-revision` and `data-consent-categories` (space-separated ids) |
| `data-consent-notice` | notice root | carries `data-consent-revision` |
| `data-consent-dialog` | the settings `<dialog>` | |
| `data-consent-accept-all` / `data-consent-reject-all` | buttons in banner and dialog | grant all / only necessary |
| `data-consent-save` | button in the dialog | store exactly the ticked categories |
| `data-consent-category="<id>"` | checkbox in the dialog | one category |
| `data-consent-dismiss` | "Got it" in the notice | store the notice as seen |
| `data-consent-state="active"` | gated script / iframe / media element, set by the runtime | already activated (never twice) |

### BEM blocks

`nera-consent` (the banner; `nera-consent--notice` for the notice), `nera-consent-dialog` (the settings dialog) and `nera-consent-embed` (the placeholder). The element lists are in [ROADMAP.md](ROADMAP.md#bem-blocks).

## JavaScript API

The runtime exposes `window.neraConsent`:

| member | returns | |
|---|---|---|
| `open()` | `undefined` | opens the settings dialog, stored choice ticked (D4) |
| `get()` | `{ categories, revision, timestamp, mode }` or `null` | a copy of the current valid choice |
| `has(id)` | boolean | `true` for `necessary`; else whether `id` is granted |

After every stored choice it dispatches `nera-consent:change` on `document`, with the choice as `event.detail`:

```js
document.addEventListener('nera-consent:change', (event) => {
    if (event.detail.categories.includes('analytics')) {
        // start something that is not a gated script
    }
})
```

The choice is stored in `localStorage` under `nera-consent`, as JSON:

```json
{ "categories": ["analytics"], "revision": 1, "timestamp": "2026-10-16T10:00:00.000Z", "mode": "banner" }
```

`timestamp` records when the choice was made. When storage is blocked (a private window, say), the choice holds for the current page view only and the banner shows again on the next one.

## `app.consent`

`getAppData` adds `app.consent` for your own views and your privacy page: `mode` (`'banner'`, `'notice'` or `'none'`), `revision`, `storageKey`, `languages`, `locales` (per language: `privacyUrl`, every text, and the categories with their services and cookies), `scripts` and `hosts`. The full shape is in [ROADMAP.md](ROADMAP.md#appconsent-written-by-getappdata). To list your services on the privacy page:

```pug
- const consentLocale = app.consent.locales[meta.lang || app.lang] || app.consent.locales.en
each category in consentLocale.categories
    h3= category.label
    each service in category.services
        p #{service.name} (#{service.provider}): #{service.purpose}
```

## Theming

Every color and size comes from a `--nera-consent-*` custom property with the default as its fallback, so you can set them anywhere, `:root` included, regardless of stylesheet order:

```css
:root {
    --nera-consent-bg: var(--surface);
    --nera-consent-fg: var(--ink);
    --nera-consent-button-bg: var(--accent);
    --nera-consent-button-fg: var(--on-accent);
}
```

| Property | Default | Used for |
| --- | --- | --- |
| `--nera-consent-font` | `inherit` | font of banner, dialog and placeholder |
| `--nera-consent-font-size` | `1rem` | font size |
| `--nera-consent-bg` | `#ffffff` | banner and dialog background |
| `--nera-consent-fg` | `#1f2937` | banner and dialog text |
| `--nera-consent-border` | `#6b7280` | borders of banner, dialog, categories and placeholder |
| `--nera-consent-radius` | `0.5rem` | corners of banner, dialog, categories and placeholder |
| `--nera-consent-shadow` | `0 0.5rem 2rem rgb(0 0 0 / 0.2)` | banner shadow |
| `--nera-consent-max-width` | `40rem` | banner width |
| `--nera-consent-dialog-width` | `40rem` | dialog width |
| `--nera-consent-z-index` | `1000` | banner stacking |
| `--nera-consent-backdrop` | `rgb(0 0 0 / 0.5)` | dialog backdrop |
| `--nera-consent-button-bg` | `#1f2937` | all buttons (and checkboxes) |
| `--nera-consent-button-fg` | `#ffffff` | button text |
| `--nera-consent-button-radius` | `0.375rem` | button corners |
| `--nera-consent-link` | `#1d4ed8` | links in banner and dialog |
| `--nera-consent-focus` | `#1d4ed8` | focus ring |
| `--nera-consent-placeholder-bg` | `#f3f4f6` | placeholder background |
| `--nera-consent-placeholder-fg` | `#1f2937` | placeholder text |
| `--nera-consent-placeholder-link` | `#1d4ed8` | placeholder link |
| `--nera-consent-banner-height` | `0px` | set by the runtime while the banner shows, so the page can scroll clear of it — do not set it yourself |

Every default text pair reaches a contrast of at least 4.5:1, focus ring and borders at least 3:1. Keep that when you change them. Accept all, Reject all and Settings share one set of button properties on purpose: there is no way to style one of them apart. For dark mode, redefine the properties in your own media query.

## Known limitations

- **Withdrawing takes effect from the next page load.** A script that already ran cannot be unloaded; the narrower choice is stored at once.
- **Google Consent Mode v2** is not supported yet.
- The plugin sees your pages' content, not your layout: iframes written directly into a Pug view are not rewritten. Use the `+consent-embed` mixin there.

## Compatibility

- **`@nera-static/core` 4.13.0 or later** (the `getAssets` hook, which copies the runtime into `public/`). On an older core the build stops with a message naming the required version. With `notice: false` and no categories the check is skipped.
- Node.js 20.19.0 or later (or 22.0.0 or later).
- `@nera-static/validate`: `nera build --check` reports an embed or script that is still ungated (`privacy-third-party`); gated ones are not reported.

## 🧪 Development

```bash
npx vitest run
npm run lint
```

`npm test` runs Vitest in watch mode. The runtime tests run in happy-dom; the fixture tests build `test/fixture/` with the real `@nera-static/core` in a temp directory and check the output with `@nera-static/validate`. The spec is [ROADMAP.md](ROADMAP.md).

## 📦 License

MIT
