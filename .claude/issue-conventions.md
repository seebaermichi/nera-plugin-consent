# Issue conventions

Review rules for work on `@nera-static/plugin-consent`, run through Snagio from
`nera-plugin-consent/`. The Snagio project **"Nera AI"** tracks this plugin in the
group "Parallel: themes and plugins"; its issues carry the target repo as a title
prefix (`[nera-plugin-consent] …`, and the dependent `[nera-validate] …` one).
**Work an issue only from the repo it names** — the step skills commit in the
current repo.

The workspace `../CLAUDE.md` holds the fleet-wide rules (semver, CHANGELOG,
releases, plugin contract, publishing a brand-new package); this file only adds what
a reviewer checks per diff.

## Non-negotiables

- **`ROADMAP.md` in this repo is the plugin's spec and single source of truth**
  (created by the first issue, `01a143ba-47ba-724f-acf1-9f82c2c346bc`, from the
  decisions in its body). A decision made while working an issue is written back into
  it in the same commit — never only into the issue. Extend it, never fork it.
- **The legal floor is not configurable away.** Whatever the config says:
    - "Reject all" sits on the **first layer**, as visible and as easy to use as
      "Accept all" (VG Hannover 2025; LG München I 33 O 14776/19). No config key may
      hide it, shrink it, or move it into the settings dialog.
    - No category is pre-selected; "necessary" is the only always-on category.
    - **Nothing gated runs or loads before consent** — no gated `<script>` executes,
      no gated `<iframe>` gets a live `src`, no third-party request fires. The default
      state of every page, before any JS runs, is "nothing gated".
    - Consent can be withdrawn at any time: the settings dialog can be reopened from
      a site-placed link/button, and withdrawing takes effect without a rebuild.
    - A `revision` bump asks every visitor again.
- **Texts are defaults, not legal advice.** README and default texts say so; never
  claim compliance ("DSGVO-konform") in docs or output.
- **Semver + `CHANGELOG.md` in the same commit as the change** (Keep a Changelog,
  `-   ` bullets, `**BREAKING**:` prefix). Bump with
  `npm version <bump> --no-git-tag-version`, never by hand-editing `package.json`.
  The public contract is: config keys and defaults, `app.consent` / any `meta.<key>`,
  the **markup contract** (`data-consent`, `data-src`, `data-consent-src` and the
  rest the ROADMAP fixes — `nera-validate` reads them), the Pug views' markup and BEM
  classes, the runtime's public JS API and storage format, and the asset paths under
  `public/_nera/`. Classify changes by what an existing site would notice.
- **Never publish or push.** No `npm publish`, no `git push`, no tags pushed, no repo
  created on GitHub, no posts anywhere public. The maintainer does the one-time
  bootstrap publish of 1.0.0 by hand, then a CI-published x.y.1 within ~2 days so the
  Trusted Publisher does not expire; the session hands over the exact commands.
- **Never write into `public/` from a hook.** The runtime JS/CSS reaches the output
  through the `getAssets` hook (core ≥ 4.13.0), and the plugin fails loudly on an
  older core.
- **Hooks stay synchronous** and return the right shape (`getAppData` → plain object,
  `getMetaData` → array, `getAssets` → `[{ from, to }]`); a wrong shape is dropped
  silently by core.
- Config is read from the **site** (`config/consent.yaml` via `getConfig` from
  `@nera-static/plugin-utils`), every key has a JS fallback, and a missing config
  file still yields a working site (the info-notice case, per the ROADMAP).
- Paste-ready text for the maintainer goes in a fenced code block between
  `----- START: … -----` and `----- END -----` lines, never in a blockquote.

## Framework correctness

- ESM only; `engines` matches the floor of the real dependencies (at least core's
  `^20.19.0 || >=22.0.0`); eslint style: 4-space indent, no semicolons, single quotes.
  No new runtime dependency without a stated reason — every site installs this one
  (cheerio for the iframe rewrite is the expected one, as in
  `../nera-plugin-link-attributes`).
- The iframe rewrite in `getMetaData` touches only iframes whose host matches a
  configured service's `hosts`; everything else in `content` stays byte-identical.
  Pages without `layout` are never rendered by core and need no handling.
- `base_path` is honoured in every URL the plugin emits (asset links, privacy link).
- Multilingual sites: texts resolve from `meta.lang || app.lang`, with built-in `de`
  and `en` and a fallback to `en`; every language the site uses can be configured.
- Output is deterministic: the same site builds byte-identical pages and assets.

## Runtime JS / CSS

- One small vanilla file each, no build step, no framework, no third-party request,
  no dependency at runtime. Size is a review point: say it in the diff.
- Stores only the visitor's choice (`categories`, `revision`, timestamp) — the one
  storage that is strictly necessary. Nothing else on the device, no fingerprinting,
  no network call.
- Activating a gated script preserves order and its attributes (`async`, `defer`,
  module type via the contract); activating twice never runs a script twice.
- Works with JS disabled in the safe direction: gated content simply stays off.
- Styling via CSS custom properties (`--nera-consent-*`) so a site can theme it,
  like `--nera-code-*` in `../nera-plugin-code-blocks`.

## UI / template rules

- Pug views (banner, settings dialog, info notice, head include, two-click
  placeholder) are published via `npm run publish-template` into
  `views/vendor/plugin-consent/`; their **markup and BEM classes are a public
  contract** — a rename is a major release.
- **Accessibility (WCAG 2.2 AA):** native `<dialog>` (or equivalent semantics) with
  an accessible name, focus moved into it on open and returned on close, Escape
  closes the settings dialog, full keyboard operation, visible focus, real
  `<button>`s, toggles as labelled checkboxes/switches with state exposed, contrast
  of the default CSS ≥ 4.5:1, works at 320 px width and 200 % zoom. The banner must
  not trap a visitor with no way to read the privacy policy (the link is reachable).
- The two-click placeholder is a real button with text naming the service and what
  loading it does ("Load video — connects to YouTube"), not an image-only control.
- **A fixture site using every view passes `nera build --check`** (no `a11y-*`
  findings; `privacy-third-party` only where the fixture deliberately has an ungated
  resource).
- Interface language of messages and docs: English (built-in UI texts de + en).
  Build warnings say what is wrong, where, and what to do.

## UI walkthrough

The banner is interactive, so UI steps get a browser walkthrough.

- Browser tooling: Playwright MCP (`mcp__playwright__browser_navigate`,
  `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_click`,
  `mcp__playwright__browser_network_requests`,
  `mcp__playwright__browser_console_messages`), or `/test-issue-in-chrome`.
- Boot (a throwaway site with the *local* plugin, never from npm):
  `R=$PWD; T=$(mktemp -d) && cd "$T" && npx @nera-static/nera new site --no-install && cd site && npm install && npm install "$R" && npx nera build && npx nera serve --port 3124`
  (Node 22 if npm crashes: `PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH`). Give it
  a `config/consent.yaml` with an `analytics` and a `media` category, a gated test
  script, and a Markdown page with a YouTube iframe. Delete `$T` afterwards.
- Base URL / login: http://localhost:3124/, no login. Start each run with cleared
  localStorage.
- Surfaces:
    | surface | url | role | how to open |
    |---|---|---|---|
    | banner (first layer) | `/` | first-time visitor | open with empty localStorage |
    | settings dialog | `/` | visitor | "Settings" on the banner, or the site's settings link |
    | two-click placeholder | the page with the YouTube iframe | visitor | open the page before consenting |
    | info notice | `/` of a site with no categories configured | visitor | remove the categories, rebuild |
- Must prove each time: **before consent the network log shows no request to a
  gated host**; Reject all → still none, after a reload too; Accept / per-category
  consent → exactly the matching requests; reopening settings and withdrawing stops
  them from the next page load on; a `revision` bump shows the banner again.

## Tests & hygiene

- `npx vitest run && npm run lint` must pass (`npm test` is watch mode — never use
  it here). Run from the package root.
- New behaviour has a test in `test/`: unit tests for config fallbacks, text
  resolution per language, the iframe rewrite (match / no match / byte-identical
  rest) and the head include; template tests render the Pug views; an integration
  test builds a throwaway site in a temp directory through `@nera-static/core`'s
  `run()` and asserts on the written HTML and assets. The runtime's activation logic
  gets tests in a DOM environment (e.g. vitest + happy-dom/jsdom as a devDependency).
  No network.
- Generate the lockfile with npm ≥ 10.9 (Node 22, see the boot line); commit it
  before any workflow that runs `npm ci`.
- The repo matches the fleet: `.github/workflows/test.yml` and `publish.yml` copied
  from a recent plugin (`../nera-plugin-code-blocks`), `.github/dependabot.yml`,
  `.github/FUNDING.yml`, `LICENSE`, `README.md` with the two badges and a link to
  https://nera.js.org, `files` in `package.json` limited to what ships, and
  `package.json` in the form `npm pkg fix` writes.

## Reconciliation steps (run when resolving an issue)

- Version bump + `CHANGELOG.md` entry in the change's commit, if it ships in the
  tarball; none for ROADMAP, tests, CI or `.claude/`.
- Update this repo's `ROADMAP.md` (slice done, date, choices made). When the markup
  contract is fixed or changes, note it on the `[nera-validate]` consent-gating issue
  (`01a143bd-7f8c-70de-8b70-3fcd1636521f`), which is blocked on it.
- On the first release: add the plugin to `../generator/PLUGINS.md` (alphabetical,
  bump the count) and to the three website catalogs in `../nera-website/pages/`
  (`plugins/`, `de/plugins/`, `es/plugins/`, translated descriptions, no raw `: `).
  Those are commits in other repos — hand them over or file them as issues, as the
  maintainer prefers. Run `../generator/scripts/fleet-check.sh --fix
  nera-plugin-consent` once the GitHub remote exists.
- Hand over the release commands (GitHub repo creation, `git push`, bootstrap
  `npm publish`, `git tag -a v<x.y.z> …`) — do not run them.
- If the release changes a config key or default, template markup or paths,
  `app.*`/`meta.*` output or a hook (minor or major): check the nera.js.org
  tutorials that stamp this package (`grep -l 'plugin-consent:'
  ../nera-website/pages/tutorials/*.md`) — still right → bump their
  `verified_with`; stale → fix in en/de/es or file a `[nera-website] Tutorial …`
  issue. See "Check the tutorials too" in `../CLAUDE.md` and `/tutorial-review`.
- Remove the issue's plan files last, once nothing else needs them:
  `git rm` its tracked files under `plans/` (`plans/issues/<id>-*`,
  `plans/issues/browser-tests/<id>-*`, `plans/cloud/<id>-*`), delete the
  untracked ones, and commit
  `chore(plan): remove the plan files of the resolved <short title> issue`.
  Git history keeps them; `plans/` holds only open issues.

## Step order

0. Toolchain — `package.json`, eslint, vitest, CI workflows, lockfile — `npx vitest run && npm run lint` pass
1. Contract — `config/consent.yaml` schema + fallbacks, `app.consent` shape, the markup contract written into `ROADMAP.md` — unit tests on config → `app.consent`
2. Behaviour — hooks: `getAppData`, `getMetaData` (iframe rewrite), `getAssets` — unit + integration tests through core's `run()`
3. Runtime — `consent.js` / `consent.css` (activation, storage, revision) — DOM tests
4. UI — Pug views, default texts de/en, a11y — template tests + fixture passes `nera build --check` + walkthrough
5. Docs — README (setup, config reference, markup contract, theming, "not legal advice"), CHANGELOG
