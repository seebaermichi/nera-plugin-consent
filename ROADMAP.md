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

The iframe rewrite (`getMetaData`) and the hand-placed Pug embed mixin produce the same placeholder markup from one JS renderer (`src/placeholder.js`). A template test asserts both outputs are identical. Two copies of a public-contract markup would drift.

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

Every URL the plugin emits honours `base_path`: the privacy link (`href`, also prefixed by core), and root-absolute `data-src` / `data-consent-src` values (core reaches them only by accident of its regex, see "Verified facts"). Absolute and protocol-relative URLs are left as they are. Prefixing is idempotent.

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
            hosts:                  # optional: iframe hosts gated by this service
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

**Localisable** values are a string or a map `{ <lang>: string }`; a map resolves `meta.lang || app.lang`, then `en`, then its first value.

**Host matching.** `hosts` lists bare host names. Comparison is case-insensitive on the parsed URL host (port ignored). A host matches an iframe `src` whose host equals it or ends in `.<host>` (`youtube.com` matches `www.youtube.com`, not `notyoutube.com`). Protocol-relative `src` (`//www.youtube.com/…`) is matched like `https:`. Root-absolute and relative `src` values never match (same origin).

**What does not exist (D6, legal floor):** keys for pre-selecting a category (`default`, `enabled`, `checked`, `preselected`, …), for hiding, renaming away, reordering or styling a first-layer button, for listing `necessary`, or for the storage key. Any of them warns and is ignored. A category with id `necessary` is warned about and dropped.

---

## `app.consent` (written by `getAppData`)

`getAppData` returns a new app object with every existing key kept and `consent` added:

```js
app.consent = {
    mode: 'banner',               // 'banner' with ≥ 1 category, else 'notice'
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

Resolution per key, first hit wins: `config/consent.yaml` `texts.<lang>.<key>` → `app.translations[<lang>]['consent.<key>']` → built-in `<lang>` → built-in `en`. Built in: `de`, `en`. The key list (banner title and text, the three button labels, dialog title/text, Save selection, Close, the "necessary" label and description, notice text and "Got it", placeholder text and "Load" label, privacy link label, cookie table headings) is fixed in slice 1 and written back here. An empty or whitespace-only override is warned about and ignored (the next source in the order applies), so no label — Reject all's included — can be blanked out.

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

- The iframe keeps all its attributes except `src`, which moves to `data-consent-src` (root-absolute → `base_path`, D8); it gets `data-consent` and `hidden`.
- Texts are resolved at build time from the page's language.
- The exact element list of the placeholder is fixed in slice 2 and written back here; the data attributes above are fixed now.

### Runtime hooks (D7)

| attribute | on | meaning |
|---|---|---|
| `data-consent="<id>"` | gated script, gated iframe, embed wrapper | category that activates it |
| `data-src` | gated script | script URL |
| `data-type="module"` | gated script | activate as a module |
| `data-consent-src` | gated iframe | iframe URL |
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
| `data-consent-state="active"` | gated script / iframe, set by the runtime | already activated (never twice) |

### BEM blocks

`nera-consent` (banner; `nera-consent--notice` for the notice), `nera-consent-dialog`, `nera-consent-embed`. Their elements and modifiers are fixed with the views (slice 4) and written back here. All styling uses `--nera-consent-*` custom properties; the three first-layer buttons share one set (no per-button property, D6).

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

---

## Open questions (decide with the user)

- **O1 — Two-click scope (D3).** Should "Load video" also offer "always load <provider>", granting the category? Today it loads the one embed only.
- **O2 — Google Consent Mode v2.** Not in 1.0 (issue decision 7). A follow-up could emit `gtag('consent', 'default', …)` / `'update'` mapped from categories.
- **O3 — Digital Omnibus.** The browser-signal article was dropped in June 2026. Re-check before each minor release whether a browser-level signal must be honoured.
- **O4 — Can the info notice be switched off?** The goal names "no banner at all" for the honest case; issue decision 5 names an info notice. Decide in slice 1 whether a `notice: false` key exists (not legal floor: the notice is informational).
- **O5 — Reload on withdrawal?** Should saving a narrower choice reload the page so withdrawn scripts stop at once, instead of from the next navigation?

---

## Slices

Each slice is one session. Tick, date, note.

### Slice 0 — Spec and repository scaffold

- [ ] This ROADMAP.
- [ ] `package.json` (ESM, `engines` `^20.19.0 || >=22.0.0`, `files`, `publishConfig`, peer `@nera-static/core >=4.13.0`), lockfile from npm ≥ 10.9, `index.js` stub with a test, eslint, husky, `.github/` (test, publish, dependabot, funding), `LICENSE`, `CHANGELOG.md`, README stub — matching `nera-plugin-code-blocks`.

### Slice 1 — Config, texts and `app.consent` (`getAppData`)

- [ ] `src/config.js`, `src/texts.js`; fallbacks, warnings, notice mode on a missing file; `necessary` never configurable; no pre-selection key; `base_path`; de/en/fallback texts; the documented `config/consent.yaml` + `bin/publish-config.js`. Decide O4; write the text key list back here.

### Slice 2 — Iframe rewrite, assets and core guard (`getMetaData`, `getAssets`)

- [ ] `src/rewrite.js`, `src/placeholder.js` (D2), `src/guard.js`; host matching; rest of `content` byte-identical; integration build through `run()`. Write the placeholder element list back here.

### Slice 3 — Runtime: `consent.js` and `consent.css`

- [ ] Storage, banner logic, activation in order and once, D3 single embed, `data-consent-open` / `neraConsent`, change event; `--nera-consent-*` with ≥ 4.5:1 default contrast; happy-dom tests. State the file sizes here.

### Slice 4 — Pug views, fixture site and accessibility

- [ ] `views/{banner,settings,notice,head,embed}.pug` + `bin/publish-template.js`; fixture site passes `validateOutput` with no `a11y-*`; browser walkthrough. Write the BEM element list back here.

### Slice 5 — README and CHANGELOG for 1.0.0

- [ ] README (badges, config reference, markup contract matching this file, layout snippet, settings link snippet, theming table, multilingual texts, "defaults, not legal advice", https://nera.js.org); `## [1.0.0]`; tarball holds only what ships.

### Slice 6 — Release (maintainer)

- [ ] 1.0.0 bootstrap-published by hand; a CI OIDC x.y.1 within ~2 days (the Trusted Publisher expires otherwise); `generator/PLUGINS.md` + the three `nera-website` catalogs; GitHub repo secured with `fleet-check.sh --fix`; follow-ups filed: `[nera-validate]` recognise `data-consent` in `privacy-third-party`, `[nera-website]` tutorial.

---

## Semver notes for later changes

Public contract: config keys and defaults, `app.consent`, the markup contract (attributes and BEM classes), the published views' markup, the storage key and shape, `window.neraConsent` and its event, and the asset paths under `public/_nera/`. A rename or removal in any of them is a major; an addition with a safe default is a minor. A change that weakens the legal floor is not made at all.

## Acceptance criteria (1.0.0)

- [ ] This ROADMAP with decisions, slices and open questions.
- [ ] Tests: config → banner / `app.consent`; iframe rewrite (match / no match / rest byte-identical); gated script include (head view); no categories → info notice; revision bump asks again; a stored notice choice does not count on a banner page.
- [ ] Fixture site builds clean with `nera build --check` (no `a11y-*`; `privacy-third-party` only where deliberately ungated).
- [ ] Manual browser test: nothing gated before consent, Reject all works, the settings link reopens the dialog.
- [ ] Released per the brand-new-package rule, listed in the catalogs, repo secured.
