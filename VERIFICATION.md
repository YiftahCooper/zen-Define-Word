# Define Word 0.1.0 verification

## Proven source/package behavior

- 38 automated tests pass, using Node's test runner and jsdom with Gecko service doubles.
- The generated entry matches the source build. Syntax checks pass for the generated entry, selection service and actor modules.
- An independent source review found three lifecycle defects: accepting results after navigation, restoring old focus on automatic dismissal, and credential-change cancellation limited to one window. Each received a failing regression before its fix; the complete suite then passed. The fixed code was checked by regressions, without a second independent review.
- A further regression verifies that a successful niqqud-free lookup preserves the originally selected Hebrew spelling.
- Package tests execute the generated entry to check reload/unload ownership. A two-window generated-entry test checks shared-key removal and ignores an old transport result after cancellation.

These tests do not establish real XUL geometry, actor loading, native focus behavior, installed-profile compatibility or human acceptance.

## Provider evidence

On 2026-09-29, direct Wikimedia Action API responses for English `computer` and Hebrew `שלום` were parsed into five senses each in Node/jsdom. This establishes those examples, not general lexical coverage or native browser network behavior. The full development responses are not distributed in this repository; automated tests use bounded synthetic examples.

Sources: [English Wiktionary](https://en.wiktionary.org/wiki/computer), [ויקימילון](https://he.wiktionary.org/wiki/שלום), [MediaWiki parsing API](https://www.mediawiki.org/wiki/API:Parsing_wikitext). Wikimedia text is generally CC BY-SA 4.0, with third-party excerpts retaining their own attribution.

Free Dictionary API returned HTTP 522 during the development check. Its parser tests use synthetic responses matching its [documented format](https://dictionaryapi.dev/). No successful live Free Dictionary lookup is claimed.

Merriam-Webster tests use synthetic response structures and the documented branding asset. No authenticated request was made. See the [Collegiate API](https://dictionaryapi.com/products/api-collegiate-dictionary) and [Learner's API](https://dictionaryapi.com/products/api-learners-dictionary).

## Native acceptance — unrun

- [ ] Sine installs and activates the candidate, with exactly one Define menu item.
- [ ] The invoking selection is used in top-level pages and focused cross-origin frames.
- [ ] Empty/password selections are excluded.
- [ ] English and Hebrew cards fit the window with readable RTL layout and attribution.
- [ ] The shortcut and recorder work with English/Hebrew keyboard layouts.
- [ ] Explicit Close/Escape restores appropriate focus; outside clicks and tab changes preserve the new focus.
- [ ] Same-tab/frame navigation and delayed requests do not display obsolete results.
- [ ] Sine disable/re-enable, reload and multiple windows leave no duplicated or orphaned controls.
- [ ] Real Firefox credential storage saves/removes optional keys and handles locked storage clearly.
- [ ] Changing a key in one window cancels affected work in other windows.
- [ ] Live authenticated Merriam-Webster results and examples work correctly.

Current experience limitation: every card uses the beside-content fallback position; selection-relative geometry remains unimplemented.
