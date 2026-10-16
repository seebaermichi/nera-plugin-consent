# ROADMAP — `@nera-static/plugin-consent`

A consent layer for Nera sites, configured in one file: a banner (Accept all, Reject all, Settings) and a settings dialog, scripts and embeds that stay inert until the visitor agrees, and — in the honest common case of a site that loads nothing it needs consent for — no consent banner at all, only a short info notice. It is called "consent", not "cookie banner", because embeds need consent too: a YouTube iframe sends the visitor's IP address to Google whether or not a cookie is set.

**This file is the single source of truth for the plugin. Extend it; never start a parallel document.** Each slice below is sized for one session. Tick the checkboxes and add a dated `**Done YYYY-MM-DD**` note with anything learned. A decision made while working on the plugin is written back here in the same commit — never only into an issue.

Written 2026-10-16 from the decisions of the Snagio issue `01a143ba-47ba-724f-acf1-9f82c2c346bc` (issue decisions 1–7, plan decisions D1–D6, all 2026-10-16). The repository starts with this file and the package scaffold (slice 0).

The texts this plugin ships are **defaults, not legal advice**. The plugin implements a technical floor (below); it does not make a site compliant, and neither this file, the README nor any output may claim that it does.

---

## The problem

A Nera site that embeds a YouTube video or loads an analytics script has to ask first (§ 25 TDDDG, Art. 6 (1) a and Art. 7 DSGVO), and there is no Nera way to do it. Sites either paste a third-party consent script (heavy, often non-compliant out of the box: Reject all hidden on a second layer, categories pre-ticked), write their own, or ship the request ungated. `@nera-static/validate` 1.2.0's `privacy-third-party` rule finds those requests in the built output (`nera build --check`) but has nothing to point the author to.

## The goal

```yaml
# config/consent.yaml
revision: 1
privacy_url: /datenschutz.html
categories:
    - id: media
      services:
          - name: YouTube
            provider: Google Ireland Limited, Dublin
            purpose: Shows embedded videos.
            privacy_url: https://policies.google.com/privacy
            hosts: [youtube.com, youtube-nocookie.com]
```

and a page with a pasted `<iframe src="https://www.youtube-nocookie.com/embed/…">` builds into a two-click placeholder, the banner offers Accept all / Reject all / Settings, and nothing reaches `youtube-nocookie.com` before the visitor agrees. A site with no `config/consent.yaml`, or no categories in it, gets only the info notice.

---

## Legal floor (DE/EU, as of 2026-10) — not configurable

These hold whatever the config says. No config key exists that weakens them (D6); a key that tries is warned about and ignored.

1. **Prior consent** for everything not strictly necessary (§ 25 (1) TDDDG); consent is informed and specific (Art. 4 Nr. 11, Art. 7 DSGVO). The settings dialog names every service with provider, purpose, cookies and privacy link.
2. **"Reject all" on the first layer**, as visible and as easy to use as "Accept all" (VG Hannover, 2025; LG München I, 33 O 14776/19). The banner always shows Accept all, Reject all and Settings, in that fixed order and the same button style. No key hides, renames away, restyles or moves Reject all into the dialog.
3. **Nothing is pre-selected.** "necessary" is the only always-on category; it is implicit and cannot be configured, listed or switched off.
4. **Nothing gated runs or loads before consent.** The default state of every built page, before any JavaScript runs, is "nothing gated active": gated scripts carry `type="text/plain"`, gated iframes carry no `src`. No third-party request fires from gated markup.
5. **Withdrawal at any time**, as easily as giving consent: the settings dialog reopens from a site-placed link or button (`data-consent-open`, D4), and a withdrawal takes effect without a rebuild.
6. **A `revision` bump asks every visitor again.**
7. Storing the visitor's choice is strictly necessary and needs no consent (§ 25 (2) Nr. 2 TDDDG).

The EU Digital Omnibus proposal's article on browser-level consent signals was dropped in June 2026; re-check its state before every minor release (O3).

---

## Verified facts this design rests on (2026-10-16, core 4.16.4)

- **Plugins see rendered HTML.** In `getMetaData`, `pagesData[i].content` is markdown-it output (`html: true`, so a pasted `<iframe>` survives). `plugin-link-attributes` and `plugin-code-blocks` rewrite it with cheerio (`load(content, null, false)`).
- **Plugins never see the final page.** Layout, `<head>` and footer are rendered after the hooks, so the banner, the dialog and the gated `<head>` scripts are Pug views the site includes by hand (published with `npm run publish-template` to `views/vendor/plugin-consent/`), not a rewrite of the final HTML (out of scope).
- **`getAssets` exists since core 4.13.0.** It returns `[{ from, to }]`, copied theme → plugins → site after `public/` is cleared, so the runtime reaches `public/_nera/` without writing there from a hook. Assets get `base_path` and `?v=` hashing.
- **Core's `base_path` pass targets `href`, `src`, `poster`, `data-search-index` and `srcset`** (`generator/src/render.js`, `rewriteHtmlUrls`, regex `\b(href|src|…)=`). Because `\b` matches after a hyphen, it *incidentally* also prefixes root-absolute `data-src` and `data-consent-src` (checked against core 4.16.4: `data-src="/js/a.js"` → `data-src="/sub/js/a.js"`); `hashHtmlUrls` likewise adds `?v=`. That is not a documented core contract, so the plugin prefixes those values itself (D8); core's prefixing is idempotent (`shouldPrefix` skips values already under `base_path`), so the two never double up.
- **`validateOutput`'s `privacy-third-party` rule reads live resource attributes** (`src`, `href` …). A gated script's `data-src` and a gated iframe's `data-consent-src` are therefore not reported; an ungated `src` is. That is the intended signal (follow-up in `nera-validate`: recognise `data-consent` explicitly).

---

## Decisions

### Issue decisions (2026-10-16)

1. **`config/consent.yaml` is the single source**: `revision`, `categories` with `services` (`name`, `provider`, `purpose`, `cookies`, `privacy_url`, `scripts`, `hosts`). "necessary" is implicit and always on. Full reference below.
2. **Markup contract**: gated scripts are `<script type="text/plain" data-consent="<category>" data-src="…">`; gated iframes carry `data-consent` + `data-consent-src` inside a two-click placeholder. Attribute names and BEM classes are public contract; changing them is a major.
3. **What the plugin produces**: the banner (Accept all, Reject all, Settings) and the settings dialog; a Pug `<head>` include for the configured scripts; a `getMetaData` pass that rewrites iframes in `content` whose host matches a service's `hosts` (cheerio); `app.consent` for the privacy page and the views.
4. **Runtime**: own vanilla JS + CSS shipped to `public/_nera/consent.{js,css}` through `getAssets` (core ≥ 4.13.0, the plugin fails loudly on an older core), linked by hand in the layout. Native `<dialog>`, keyboard and focus handling, passes `nera build --check`. The choice is kept in `localStorage`. The plugin does not wrap orestbida/cookieconsent or any other library.
5. **No categories → info notice**: "only technically necessary cookies" + privacy link + "Got it".
6. **Texts**: `de` and `en` built in; every other language through `config/consent.yaml` `texts` or `app.translations`.
7. **Google Consent Mode v2 is not in 1.0** (O2).

Out of scope: rewriting the final page HTML; legal advice.

### D1 — This ROADMAP is written first, in the scaffold slice

It fixes the config schema, the `app.consent` shape, the markup contract, the storage format, the public JS API and the asset paths before any code, so every later slice implements a written contract instead of letting the code define it by accident. `nera-validate` will read the markup contract.

### D2 — One placeholder renderer

The iframe rewrite (`getMetaData`) and the hand-placed Pug embed mixin produce the same placeholder markup. Two copies of a public-contract markup would drift, so the markup is defined once, in the JS renderer `src/placeholder.js#renderPlaceholder`, and a template test asserts the two outputs are byte-identical.

**Amended 2026-10-16 (slice 4, with the user):** a Pug view cannot import a JS module — it sees only the locals core passes (`app`, `meta`, …) — so `views/embed.pug` mirrors the renderer in Pug (its own escape and `base_path` helpers) instead of calling it, and `test/templates.test.js` pins the mirror to `renderPlaceholder` on hostile inputs (`& < > " '`, attribute order, the attributes the renderer sets itself, `base_path`, a service without `privacy_url`, both languages). Rejected: a render function in `app.consent`, which would stop `app.consent` being plain data and make a function public contract. A change to the placeholder markup is made in both files; the test fails until they agree.

### D3 — The two-click placeholder loads that one embed, for this page view, and stores nothing

Clicking "Load video" is consent to that one transfer; it activates that one iframe and writes nothing to storage. Lasting consent for the category comes only from the banner or the settings dialog, which the placeholder links to (`data-consent-open`). Alternatives rejected: granting the whole category (one click would consent to more than the visitor saw) and storing per-service consent (a second storage format). Open for revisiting (O1); a change would be additive (minor).

### D4 — Settings reopen from any `[data-consent-open]` element and from `window.neraConsent.open()`

The attribute works on any element without inline JavaScript (CSP-friendly); the JS API serves sites that build their own UI. The site places the link (typically "Cookie-Einstellungen" in the footer); the README shows the snippet. Both are public contract.

### D5 — Tests: happy-dom for the runtime, `validateOutput` for the fixture site

The runtime's activation logic runs under vitest with happy-dom (devDependency). The fixture site is built through `@nera-static/core`'s `run()` and checked with `validateOutput` from `@nera-static/validate` (devDependency) — the same check as `nera build --check`, without a CLI install or network inside the tests.

### D6 — No config key touches the first layer

The presence, order, wording source and equal styling of Accept all / Reject all / Settings are fixed in the view and the CSS. There is no per-button key, no "style" option, no pre-selection key. Unknown keys warn and change nothing. Even a cosmetic per-button option would invite a site to make Reject all weaker.

### D7 — Behaviour binds to `data-consent*` attributes, styling to BEM classes

The runtime finds every element it acts on through a `data-consent*` attribute, never through a class. A site that restyles or renames classes in its published views keeps working; a site that removes a `data-consent*` attribute breaks the control on purpose. Both sets are public contract (see "Markup contract").

### D8 — The plugin prefixes `base_path` itself, not relying on core's regex

Every URL the plugin emits honours `base_path`: the privacy link (`href`, also prefixed by core), and root-absolute `data-src` / `data-consent-src` values (core reaches them only by accident of its regex, see "Verified facts"). Absolute and protocol-relative URLs are left as they are. Prefixing is idempotent. The iframe rewrite applies none of it: a source it gates is never on the site's own host.

---

## Configuration — `config/consent.yaml`

Read from the **site** with `getConfig` from `@nera-static/plugin-utils`; the file shipped in the package is documentation only. Every key has a JS fallback, and a missing file is a valid site (notice mode). Values of the wrong type are warned about and replaced by the fallback.

```yaml
# Bump to ask every visitor again (integer ≥ 1). Default: 1.
revision: 1

# The site's privacy policy. Root-absolute (base_path is applied) or absolute.
# A string, or one URL per language. Default: none (the link is left out, with
# a build warning, because the banner should point to it).
privacy_url:
    de: /datenschutz.html
    en: /en/privacy.html

# Show the info notice when there are no categories (boolean). Default: true.
# false → no consent UI at all (mode 'none'). Ignored, with a warning, as soon
# as a category exists: it can never hide the banner (O4).
notice: true

# Optional categories, in display order. None → notice mode.
categories:
    - id: analytics                 # [a-z][a-z0-9-]*; `necessary` is reserved
      label: Statistics             # optional: built-in label for analytics,
                                    # media, marketing, functional; else the id
      description: Helps us …       # optional, same localisation rules
      services:                     # at least one; a category without → dropped
          - name: Matomo            # required
            provider: Example GmbH, Berlin   # required
            purpose: Counts visits without profiles.   # required, localisable
            privacy_url: https://example.com/privacy   # optional, localisable
            cookies:                # optional
                - name: _pk_id
                  duration: 13 months   # localisable
                  purpose: Recognises returning visitors.   # optional, localisable
            hosts:                  # optional: embed hosts gated by this service
                - matomo.example.com
            scripts:                # optional: emitted gated by the head include
                - src: https://matomo.example.com/matomo.js
                  async: true       # optional: async | defer | module (booleans)
                - inline: |
                      var _paq = window._paq = window._paq || [];

# Optional text overrides per language (keys: see "Texts"); any language code.
texts:
    fr:
        banner_title: Cookies et contenus externes
```

**Validation.** A category needs a valid, unique id and at least one valid service, else it is dropped with a warning. A service needs `name`, `provider` and `purpose`, else it is dropped. A cookie needs a `name`. A host must be a bare host name (no scheme, path or port), lower-cased on reading. A script needs exactly one of `src` / `inline`; a non-boolean `async` / `defer` / `module` warns and reads as `false`. Unknown keys warn at every level.

**Localisable** values are a string or a map `{ <lang>: string }`; a map resolves `meta.lang || app.lang`, then `en`, then its first value.

**Host matching.** `hosts` lists bare host names. Comparison is case-insensitive on the parsed URL host (port ignored). A host matches an iframe `src` whose host equals it or ends in `.<host>` (`youtube.com` matches `www.youtube.com`, not `notyoutube.com`). Protocol-relative `src` (`//www.youtube.com/…`) is matched like `https:`. Root-absolute and relative `src` values never match (same origin).

**What does not exist (D6, legal floor):** keys for pre-selecting a category (`default`, `enabled`, `checked`, `preselected`, …), for hiding, renaming away, reordering or styling a first-layer button, for listing `necessary`, or for the storage key. Any of them warns and is ignored. A category with id `necessary` is warned about and dropped.

---

## `app.consent` (written by `getAppData`)

`getAppData` returns a new app object with every existing key kept and `consent` added:

```js
app.consent = {
    mode: 'banner',               // 'banner' with ≥ 1 category, else 'notice' ('none' with `notice: false`)
    revision: 1,
    storageKey: 'nera-consent',
    languages: ['de', 'en'],      // app.lang, every meta.lang, every `texts` language, always `en`
    locales: {
        de: {
            privacyUrl: '/datenschutz.html',   // base_path applied; null when unset
            texts: { banner_title: '…', /* every key under "Texts" */ },
            categories: [{
                id: 'analytics', label: '…', description: '…',
                services: [{
                    name, provider, purpose, privacyUrl,
                    cookies: [{ name, duration, purpose }],
                }],
            }],
        },
        en: { /* same shape */ },
    },
    scripts: [                    // language-independent, document order
        { category: 'analytics', service: 'Matomo', src: 'https://…', async: true, defer: false, module: false },
        { category: 'analytics', service: 'Matomo', inline: 'var _paq = …', async: false, defer: false, module: false },
    ],
    hosts: [{ category: 'media', service: 'YouTube', host: 'youtube.com' }],
}
```

A view picks its locale with `app.consent.locales[meta.lang || app.lang] || app.consent.locales.en`. Renaming or restructuring any of these keys is a major.

## Texts

Resolution per key, first hit wins: `config/consent.yaml` `texts.<lang>.<key>` → `app.translations[<lang>]['consent.<key>']` → built-in `<lang>` → built-in `en`. Built in: `de`, `en`. The key list (fixed in slice 1, `TEXT_KEYS` in `src/texts.js`):

| key | en default |
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

`{service}` and `{provider}` in `placeholder_text` and `placeholder_load` are filled in per embed. The load button names the service (de `{service} laden`), so two embeds on one page never share a label (amended in slice 4: it was `Load content`). Category labels and descriptions are not text keys: `analytics`, `media`, `marketing` and `functional` have built-in de/en ones (`BUILTIN_CATEGORIES`), any other id shows its `label` or the id; a category's own `label` / `description` always wins. Adding a key is a minor; renaming or removing one is a major. An empty or whitespace-only override is warned about and ignored (the next source in the order applies), so no label — Reject all's included — can be blanked out.

---

## Markup contract

Public contract (issue decision 2): attribute names, their values' meaning, and the BEM blocks. `nera-validate` reads it. A change is a major.

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

The head include (`views/vendor/plugin-consent/head.pug`) emits `app.consent.scripts` in this form. Authors may also hand-write gated scripts anywhere in a page or view; the runtime treats both alike.

### Gated iframes and the placeholder (D2)

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

- The iframe keeps all its other attributes, in source order, except `src`, which moves to `data-consent-src`, and `srcdoc`, which is dropped (it would render while the iframe is `hidden` and win over the `src` set on activation); it gets `data-consent` first and `hidden` last. Its raw content (fallback text) is kept. The rewrite never prefixes `base_path` on a gated source: it is third-party by definition (`/\host/x` reaches `host` in a browser). The Pug mixin applies D8 to a hand-written root-absolute `src`.
- Texts are resolved at build time from the page's language (`meta.lang || app.lang`, else `en`).
- **Element list (fixed in slice 2):** the wrapper holds exactly the iframe and `__placeholder`; `__placeholder` holds, in order, `p.__text` (`placeholder_text` with `{service}` escaped and `{provider}` in `<strong>`), `button.__load` (`placeholder_load` with `{service}` and `{provider}` escaped, no markup), `a.__privacy` (`service_privacy`, the service's `privacy_url`; **left out** when the service has none) and `button.__settings` (`placeholder_settings`). All text and attribute values are HTML-escaped. `src/placeholder.js#renderPlaceholder` emits it on one line, without whitespace between elements, and `views/embed.pug` mirrors it byte for byte (D2).

**Which iframes are gated.** An iframe is rewritten when the host of its `src` (entities decoded, resolved like a browser on an http **or** https page: protocol-relative `//host/…`, scheme-only `https:host/…`, backslashes, any case, a trailing dot dropped; `http(s)` only) equals a configured `hosts` entry or is a subdomain of one (`www.youtube.com` matches `youtube.com`; `notyoutube.com` and `youtube.com.evil.example` do not). With several matches the longest configured host wins (`maps.google.com` before `google.com`), ties go to the first configured. Root-absolute, relative and `data:`/`about:` sources stay on the site and are never gated. Iframes inside `<noscript>`, `<template>` and SVG `foreignObject` are found too. An iframe without a live `src` (already a placeholder) is left alone, so the rewrite is idempotent. After the rewrite, a raw-text scan of the page (`findLiveGatedEmbeds`, which covers gated media too) looks for any `<iframe` start tag that still has a live `src` on a gated host and warns with the page's `meta.href` and the host — it catches markup the parser reads differently from a browser (`<select><iframe …>`, which parse5 drops and a browser with customizable `<select>` keeps). It only warns, never rewrites; it can also report tags inside comments, scripts or fallback text. The rewrite splices the page string at the parser's source offsets: everything that is not a matched iframe stays byte-identical, and a page without one is returned as the same object.

### Gated media

```html
<div class="nera-consent-embed" data-consent-embed data-consent="media">
    <video data-consent="media" controls data-consent-poster="https://cdn.example.com/p.jpg" hidden>
        <source data-consent-src="https://cdn.example.com/v.webm" type="video/webm">
        <track data-consent-src="https://cdn.example.com/c.vtt" kind="captions">
        …fallback content…
    </video>
    <div class="nera-consent-embed__placeholder">…the same controls as for an iframe…</div>
</div>
```

- **Which elements.** Besides `<iframe>`, the rewrite gates `<embed>`, `<object>`, `<video>` and `<audio>` (added in step 8 of the first issue, before 1.0.0). An element is gated when any URL it loads through a **loading attribute** has a configured host, matched exactly as for iframes: `embed[src]`, `object[data]`, `video[src]`, `video[poster]`, `audio[src]`, and for `<video>` / `<audio>` also their child `<source src>`, `<source srcset>` (every candidate URL) and `<track src>`.
- **Inert form.** Every loading attribute of a gated element **and of its `<source>` / `<track>` children** is renamed in place to `data-consent-<name>` (`data-consent-src`, `data-consent-data`, `data-consent-poster`, `data-consent-srcset`), own-host ones included, so nothing of the element loads before consent. The element gets `data-consent="<category>"` first and `hidden` last (an existing `data-consent`, `hidden` or inert name is dropped); children get neither. Every other attribute stays, in source order.
- **Wrapper and controls.** The same `div.nera-consent-embed` wrapper and `__placeholder` element list as for an iframe; the placeholder follows the element. The element's content (an `<object>`'s or a media element's fallback) is kept as is, except that gated elements inside it are gated in turn, each with its own placeholder. An unclosed element gets its end tag where the parser ends it. The rewrite writes the end tag in lower case.
- **Mixed categories fail the build.** An element whose gated URLs belong to services of different categories cannot be gated by one `data-consent` without loading the other category's host on a partial consent, so the build fails with the page, the tag and the categories — split such an element into one per category. The markup contract stays one category per element.
- **Not gated:** `<img>`, `<picture>` and its `<source srcset>`, CSS `url()`, `<link>`. Own-host and relative URLs never gate an element. The Pug `+consent-embed` mixin renders iframes only.
- **Runtime.** Activating a gated element (consent, or its placeholder's load button) drops `hidden`, sets every `data-consent-<name>` back as `<name>` — on a media element its `<source>` / `<track>` children first — and calls `load()` on `<video>` / `<audio>`. A placeholder's load button activates only the element directly in its wrapper, never a gated element nested in that element's fallback.
- **Escape scan.** `findLiveGatedEmbeds` (formerly iframes only) looks at every `<iframe`, `<embed`, `<object`, `<video>` and `<audio` start tag of the rewritten page and warns about one that still loads from a gated host through its own loading attributes. It does not scan `<source>` / `<track>`: outside a gated media element (in a `<picture>`) they are not the rewrite's to gate.

### Runtime hooks (D7)

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

`nera-consent` (banner; `nera-consent--notice` for the notice), `nera-consent-dialog`, `nera-consent-embed`. All styling uses `--nera-consent-*` custom properties; the three first-layer buttons share one set (no per-button property, D6).

**Element list (fixed in slice 4, the published views):**

- **`section.nera-consent`** (`views/banner.pug`, `data-consent-banner`, `aria-labelledby` → the title, rendered `hidden`): `h2.__title#nera-consent-title`, `p.__text` (`banner_text`, then `a.__link` → privacy page, left out without `privacy_url`), `div.__actions` with exactly three `button.__button` in fixed order — Accept all (`data-consent-accept-all`), Reject all (`data-consent-reject-all`), Settings (`data-consent-open`). No modifier on any of them (D6).
- **`section.nera-consent.nera-consent--notice`** (`views/notice.pug`, `data-consent-notice`, `aria-labelledby` → its text, rendered `hidden`): `p.__text#nera-consent-notice-text` (`notice_text` + `a.__link`), `div.__actions` with one `button.__button` (`data-consent-dismiss`).
- **`dialog.nera-consent-dialog`** (`views/settings.pug`, `data-consent-dialog`, `aria-labelledby` → its title): one `form.__form[method=dialog]` holding `button.__close[type=submit]` (× with `aria-label`/`title` = `close`), `h2.__title#nera-consent-dialog-title`, `p.__text` (+ `a.__link`), then one `div.__category` per category — first `necessary` (its checkbox `checked disabled`, no `data-consent-category`, `span.__status` "(Always active)"), then each configured one: `label.__label` wrapping `input.__checkbox[type=checkbox][data-consent-category]` (never `checked` in the markup) and the label text, `p.__description` when there is one, and per service `div.__service` with `h3.__service-name`, `dl.__details` (provider, purpose), `p > a.__link` (the service's privacy link, when set) and `table.__table` (caption `cookies_heading`, columns name/duration/purpose; only when the service lists cookies). Last `div.__actions` with three `button.__button`: Accept all, Reject all, Save selection (`data-consent-save`).
- **`div.nera-consent-embed`**: the placeholder element list under "Gated iframes and the placeholder" (`views/embed.pug` renders it too, D2).

`views/head.pug` emits no classes: only the gated `<script>` elements of "Gated scripts", inline code raw with `</script` and `<!--` escaped (`<\/script`, `<\!--`) so it cannot end the element.

---

## Storage format

`localStorage['nera-consent']`, a JSON string:

```json
{ "categories": ["analytics"], "revision": 1, "timestamp": "2026-10-16T10:00:00.000Z", "mode": "banner" }
```

- `categories` — the granted category ids; `necessary` is never stored (it is always on). Reject all stores `[]`; dismissing the notice stores `[]` too, told apart by `mode`.
- `revision` — the `revision` the choice was made under. A stored revision different from the page's → no choice (banner again).
- `timestamp` — ISO 8601, when the choice was made (proof of the time of consent for the site owner).
- `mode` — `"banner"` or `"notice"`, the page mode the choice was made in (the root it came from: `data-consent-banner` or `data-consent-notice`, so always the build-time `app.consent.mode`; the runtime never reads `mode` from anywhere else). On a banner page a stored `"notice"` choice is no choice, so a site that adds its first category asks every returning visitor even without a `revision` bump; a dismissed notice never reads as Reject all. On a notice page any valid choice of the same revision counts as seen.
- Anything unparseable, of the wrong shape, or unreadable (storage blocked in a private window) → no choice; the banner shows and nothing gated activates. When writing throws, the choice holds for the current page view only.
- Ids in `categories` that the site no longer configures are ignored.

Changing the key or the shape is a major. Adding a service or category to a site already in banner mode does not re-ask by itself — bump `revision` (README says so); adding the first category (notice → banner) re-asks through `mode`.

## Public JS API — `window.neraConsent`

| member | returns | |
|---|---|---|
| `open()` | `undefined` | opens the settings dialog, stored choice ticked (D4) |
| `get()` | `{ categories, revision, timestamp, mode }` or `null` | a copy of the current valid choice |
| `has(id)` | boolean | `true` for `necessary`; else whether `id` is granted |

Event: `nera-consent:change` dispatched on `document` after every stored choice, `event.detail` = the same object `get()` returns. Adding members is a minor; changing or removing one is a major.

## Assets

`getAssets` returns `assets/consent.js` → `_nera/consent.js` and `assets/consent.css` → `_nera/consent.css`. The site links them in its layout:

```pug
link(rel='stylesheet' href='/_nera/consent.css')
script(src='/_nera/consent.js' defer)
```

`defer` runs the runtime after parsing, so it activates gated scripts in document order. The paths are public contract (a change is a major).

## Runtime behaviour

On load: read the choice. None (another revision, or a `"notice"` choice on a banner page) → show the banner (or, in notice mode, the notice); nothing gated activates. A valid choice → activate every gated script and iframe whose category is granted, scripts in document order, each once (`data-consent-state`), keeping `async` / `defer` / module semantics. Saving a choice that grants more activates the newly granted elements at once; a choice that grants less (withdrawal) is stored at once and takes effect from the next page load, since a script that already ran cannot be unloaded (O5). Closing the dialog with Escape or Close changes no stored choice — Close is native (`<form method="dialog">`), so it needs no `data-consent-*` hook; the runtime listens to the dialog's `close` event to return focus; with none stored, the banner stays.

Details fixed in slice 3 (`assets/consent.js`), which the views follow:

- **Visibility.** The banner and notice roots are rendered with `hidden`; the runtime shows the one root when there is no valid choice and hides it once a choice is stored. Without JavaScript nothing is shown, and nothing gated could run anyway. The banner wins when a page carries both roots.
- **Script order.** Gated scripts are replaced in place by live copies, in document order. An external script without `async` holds the queue until its `load` or `error`, as a parser-inserted one would (`defer` counts as ordered, since the runtime itself runs deferred); inline and `async` scripts never wait. An element is claimed (`data-consent-state="active"`) before it is queued, so a later pass cannot queue it twice. Inline module scripts are not waited for, as a browser would not either.
- **Embeds.** Activating an iframe sets `src` from `data-consent-src` (a gated media element: see "Gated media"), drops its `hidden`, marks the wrapper `data-consent-state="active"` and hides every other child of the wrapper (the placeholder) through `hidden`, without relying on a class (D7).
- **`necessary`.** `has('necessary')` is always `true`, so a hand-written element gated as `data-consent="necessary"` activates without a choice. The plugin never emits one: `necessary` cannot be configured.
- **No root, no consent.** On a page without a banner or notice root (mode `'none'`, or a layout that does not include the views), no choice can be read or given, `get()` is `null` and nothing gated activates. Without a dialog, a `data-consent-open` link keeps its own `href`.
- **Linked twice.** A second copy of the runtime finds `window.neraConsent` and does nothing.
- **Reserved space (slice 4, WCAG 2.4.11).** While the banner or notice shows, the runtime sets `data-consent-reserve` on `<html>` and `--nera-consent-banner-height` to the distance from the root's top edge to the viewport's bottom, kept current through a `ResizeObserver` (or `resize` without one). `consent.css` turns that into `padding-bottom` on `body` and `scroll-padding-bottom` on `html`, so the last content can be scrolled clear of the fixed banner and a focused element is scrolled above it. Once a choice hides the root, both go away. The first layer stays non-modal: the visitor can read the page before choosing.

---

## Open questions (decide with the user)

- **O1 — Two-click scope (D3).** Should "Load video" also offer "always load <provider>", granting the category? Today it loads the one embed only.
- **O2 — Google Consent Mode v2.** Not in 1.0 (issue decision 7). A follow-up could emit `gtag('consent', 'default', …)` / `'update'` mapped from categories.
- **O3 — Digital Omnibus.** The browser-signal article was dropped in June 2026. Re-check before each minor release whether a browser-level signal must be honoured.
- ~~**O4 — Can the info notice be switched off?**~~ **Decided 2026-10-16: yes**, `notice: false` (default `true`) → `app.consent.mode: 'none'`, the views render nothing. Ignored with a warning once a category exists, so it can never hide the banner. Not legal floor: the notice is informational.
- **O5 — Reload on withdrawal?** Should saving a narrower choice reload the page so withdrawn scripts stop at once, instead of from the next navigation?

---

## Slices

Each slice is one session. Tick, date, note.

### Slice 0 — Spec and repository scaffold

- [x] This ROADMAP.
- [x] `package.json` (ESM, `engines` `^20.19.0 || >=22.0.0`, `files`, `publishConfig`, peer `@nera-static/core >=4.13.0`), lockfile from npm ≥ 10.9, `index.js` stub with a test, eslint, husky, `.github/` (test, publish, dependabot, funding), `LICENSE`, `CHANGELOG.md`, README stub — matching `nera-plugin-code-blocks`.

**Done 2026-10-16.** The README stub links this file until slice 5 replaces it.

### Slice 1 — Config, texts and `app.consent` (`getAppData`)

- [x] `src/config.js`, `src/texts.js`; fallbacks, warnings, notice mode on a missing file; `necessary` never configurable; no pre-selection key; `base_path`; de/en/fallback texts; the documented `config/consent.yaml` + `bin/publish-config.js`. Decide O4; write the text key list back here.

**Done 2026-10-16.** `app.consent` is built in `src/app-consent.js` (`buildAppConsent`, `withBasePath`); `index.js#getAppData` only loads the config and adds the key. O4 decided (`notice: false` → mode `'none'`). The text key list and the validation rules are under "Texts" and "Configuration". A missing `privacy_url` warns in `banner` and `notice` mode, not in `none`. The shipped `config/consent.yaml` keeps only `revision` and `notice` live (everything else commented), so publishing it (`npx nera-consent`) never puts an example service on a site.

### Slice 2 — Iframe rewrite, assets and core guard (`getMetaData`, `getAssets`)

- [x] `src/rewrite.js`, `src/placeholder.js` (D2), `src/guard.js`; host matching; rest of `content` byte-identical; integration build through `run()`. Write the placeholder element list back here.

**Done 2026-10-16.** Host matching and the placeholder element list are under "Gated iframes and the placeholder". `getMetaData` uses the `app.consent` that `getAppData` returned and checks core's version (`src/guard.js`, copied from plugin-code-blocks) unless the mode is `'none'`, where the site has no consent UI and needs no runtime. `getAssets` ships both files in every mode, so a layout's links never point at missing files. `assets/consent.{js,css}` are empty stubs until slice 3. The integration test builds a site through core's `run()` with and without `base_path`.

### Slice 3 — Runtime: `consent.js` and `consent.css`

- [x] Storage, banner logic, activation in order and once, D3 single embed, `data-consent-open` / `neraConsent`, change event; `--nera-consent-*` with ≥ 4.5:1 default contrast; happy-dom tests. State the file sizes here.

**Done 2026-10-16.** Sizes, unminified: `consent.js` 9,655 bytes (3,070 gzipped), `consent.css` 5,565 bytes (1,501 gzipped). The runtime details the views follow are under "Runtime behaviour". Every colour is a `var(--nera-consent-<name>, <default>)` fallback rather than a `:root` declaration, so a site's own values win whatever the stylesheet order; `test/assets.test.js` checks one fallback per property and the contrast of each default pair (text ≥ 4.5:1, focus ring and borders ≥ 3:1). `test/runtime.test.js` runs the runtime in happy-dom with script file loading off (no network): inline gated scripts really execute, external ones count as run at their `load` event, which the order tests hold back to stand in for a slow network. happy-dom shares element prototypes between windows, so such a patch is undone after each test.

### Slice 4 — Pug views, fixture site and accessibility

- [x] `views/{banner,settings,notice,head,embed}.pug` + `bin/publish-template.js`; fixture site passes `validateOutput` with no `a11y-*`; browser walkthrough. Write the BEM element list back here.

**Done 2026-10-16.** The element list is under "BEM blocks". The views are published with `npm run publish-template` or the `nera-consent-templates` bin (`publishTemplates` from plugin-utils) to `views/vendor/plugin-consent/`; the site includes `head` inside `<head>` and `banner`, `settings`, `notice` at the end of `<body>`, each rendering only in its own mode. Each view picks its locale as under "`app.consent`" and never uses `t()`: the plugin's texts already resolve `app.translations` at build time. The embed mixin is `+consent-embed({ category, service, src, attributes })`: the iframe attributes go in `attributes`, not as Pug attributes, because Pug escapes those before a mixin sees them (`&` would come out double-escaped); the mixin fails the build on Pug attributes and on a service the config does not have, rather than render a live iframe. D2 was amended (the mixin mirrors the renderer). `test/fixture/` is the fixture site (analytics with a gated external and inline script, media with YouTube, a hand-placed embed, en + de pages, and one map left ungated on purpose); `test/fixture.test.js` publishes the views into a temp copy through the real bin, builds it with core's `run()` and checks it with `validateOutput`: no `a11y-*`, `privacy-third-party` only for the map; a second build without categories covers notice mode. Browser walkthrough (Playwright, the fixture served statically at 320 px): no gated request before consent, Reject all holds after a reload, Settings / the footer `data-consent-open` link open the dialog modally with focus inside and nothing ticked, Escape and × store nothing and return focus, Save stores exactly the ticked categories, Accept all runs the inline script with its escaped `</script` intact, "Load YouTube" loads the one embed and stores nothing (D3), the notice's "Got it" stays dismissed after a reload, and a stored choice from another revision shows the banner again. `pug` is a devDependency for the template tests.

### Slice 5 — README and CHANGELOG for 1.0.0

- [x] README (badges, config reference, markup contract matching this file, layout snippet, settings link snippet, theming table, multilingual texts, "defaults, not legal advice", https://nera.js.org); `## [1.0.0]`; tarball holds only what ships.

**Done 2026-10-16.** The README documents usage and links here for the spec. Where it repeats the spec — the gated script examples and rules, the placeholder markup, the runtime hooks table, the `window.neraConsent` table and the storage format — it copies this file verbatim, and `test/readme.test.js` fails when the two differ; it also holds the README's theming table to every `--nera-consent-*` property and default in `assets/consent.css`, and checks README, this file, the CHANGELOG, the shipped config and the texts for a compliance claim. Version 1.0.0 (`npm version 1.0.0 --no-git-tag-version`); the tarball holds `index.js`, `src`, `assets`, `views`, `bin`, `config`, README, CHANGELOG, LICENSE and `package.json`.

### Slice 6 — Release (maintainer)

- [ ] 1.0.0 bootstrap-published by hand; a CI OIDC x.y.1 within ~2 days (the Trusted Publisher expires otherwise); `generator/PLUGINS.md` + the three `nera-website` catalogs; GitHub repo secured with `fleet-check.sh --fix`; follow-ups filed: `[nera-validate]` recognise `data-consent` in `privacy-third-party`, `[nera-website]` tutorial.

---

## Semver notes for later changes

Public contract: config keys and defaults, `app.consent`, the markup contract (attributes and BEM classes), the published views' markup, the storage key and shape, `window.neraConsent` and its event, and the asset paths under `public/_nera/`. A rename or removal in any of them is a major; an addition with a safe default is a minor. A change that weakens the legal floor is not made at all.

## Acceptance criteria (1.0.0)

- [x] This ROADMAP with decisions, slices and open questions.
- [x] Tests: config → banner / `app.consent`; iframe rewrite (match / no match / rest byte-identical); gated script include (head view); no categories → info notice; revision bump asks again; a stored notice choice does not count on a banner page.
- [x] Fixture site builds clean with `nera build --check` (no `a11y-*`; `privacy-third-party` only where deliberately ungated).
- [x] Manual browser test: nothing gated before consent, Reject all works, the settings link reopens the dialog (slice 4's walkthrough, 2026-10-16).
- [ ] Released per the brand-new-package rule, listed in the catalogs, repo secured.
