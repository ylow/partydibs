# PartyDibs Visual Redesign — Design Spec

**Date:** 2026-05-27
**Goal:** Replace the current utilitarian system-font UI with a professional, warm, party-appropriate visual identity. Same functionality, different surface.

## Direction

- **Style family:** Warm & Festive (cream backgrounds, rounded cards, serif headlines, friendly but tasteful).
- **Palette family:** Coral & Cream.
- **Admin edit pattern:** Inline row edit (replaces `prompt()` / `confirm()` browser dialogs).

## Typography

Two families, self-hosted as woff2 in `public/fonts/`. Self-hosting avoids a Google Fonts runtime dependency — the app needs to load reliably at a party, possibly on patchy wifi or in LAN-only mode (`HOST=0.0.0.0`).

- **Headlines (party title, hero card title, section labels):** Fraunces — weight 600. Latin subset only.
- **Body and UI:** Inter — weights 400 and 600. Latin subset only.
- **Fallback stack:**
  - Headline: `'Fraunces', 'Cormorant Garamond', Georgia, serif`
  - Body: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

Sizes (mobile-first, single responsive layout):

| Role | Family | Weight | Size |
|---|---|---|---|
| Page title (party title) | Fraunces | 600 | `clamp(1.6rem, 5vw, 2rem)` |
| Hero card title | Fraunces | 600 | `clamp(1.4rem, 4.5vw, 1.7rem)` |
| Subhead / section h2 | Inter | 600 | `1rem` |
| Caption / subtitle | Inter | 400 | `0.78rem`, letter-spacing `0.02em` |
| Body / item name | Inter | 600 | `0.92rem` |
| Note under item | Inter | 400 | `0.78rem` |
| All-caps label ("ADD ITEM") | Inter | 600 | `0.68rem`, letter-spacing `0.1em`, uppercase |
| Button | Inter | 600 | `0.8rem` |

## Color tokens

Defined as CSS custom properties on `:root`. All other CSS references tokens, never raw hex.

```
--bg-gradient    : linear-gradient(180deg, #fff7f0 0%, #ffeed9 100%)
--surface        : #ffffff
--surface-soft   : #fffaf4
--surface-warm   : #fdf1e2

--text           : #3d2817
--text-soft      : #8a6a4f
--text-muted     : #9a7a5e
--ink            : #5b1f1f

--accent         : #c44536
--accent-hover   : #ad3a2d
--accent-ink     : #ffffff
--accent-soft    : #fff3e5

--chip-bg        : #f3e3d3
--chip-text      : #8a6a4f
--border         : #ead8c0

--success-bg    : #e8efe0
--success-text  : #3d6b3d

--shadow-card    : 0 1px 3px rgba(91, 31, 31, 0.06)
--shadow-sheet   : 0 4px 14px rgba(91, 31, 31, 0.12)

--radius-card    : 12px
--radius-button  : 8px
--radius-pill    : 999px
```

**Contrast check (WCAG AA):**
- `--text` (#3d2817) on `--surface` (#ffffff): 11.1:1 — passes AAA.
- `--text` on `--bg-gradient` end stops: passes AA at smallest body size.
- `--accent-ink` (#ffffff) on `--accent` (#c44536): 4.6:1 — passes AA for normal text.
- `--chip-text` on `--chip-bg`: 4.7:1 — passes AA.

## Components

Each component is defined once in `styles.css` and used across screens.

### Hero card
Centered card on the cream gradient. Used on Setup, Name Prompt, Admin Login.
- White surface, `--radius-card`, `--shadow-card`, max-width 420px, centered with auto margins, top margin ~10vh.
- Padding `28px 24px`.
- Fraunces title at top, optional paragraph, vertical-stacked inputs, primary button (full width on mobile, auto on desktop).

### Item row (guest)
- White surface, `--radius-card`, `--shadow-card`, padding `11px 13px`, margin-bottom `7px`.
- Flex: meta on the left (name + optional note), action on the right.
- **Action variants:**
  - Unclaimed: pill button (accent bg, `--radius-pill`, `5px 13px`, label "Claim").
  - Claimed by someone else: chip (`--chip-bg`, `--chip-text`, `--radius-pill`, `3px 9px`, text "Taken by Sam").
  - Claimed by current user: chip same as above, plus a quiet "Unclaim" text link in `--text-soft` to the right of it.

### Item row (admin)
- Same surface and shape as guest row.
- Right side: pair of icon-buttons (pencil ✎, trash 🗑).
  - Icon-button: transparent bg, no border, `4px` padding, `6px` radius, color `--text-soft`, hover `--surface-warm` bg + `--ink` color.
- Claimed items show a small chip after the name: "Sam" in `--chip-bg`.

### Inline edit state (admin)
Replaces an admin row in place when pencil is clicked.
- Background `--accent-soft`, border `1.5px solid --accent`, padding `12px 13px`.
- Two stacked inputs (name, optional note) — full width within the row, `--radius-button`, `--border`, white bg, `5px 8px`.
- Action column: Save (accent button) on top, × (cancel — transparent with border) below. Buttons `5px 10px`, font `0.75rem`.
- Cancel discards changes; Save patches via existing `PATCH /api/items/:id`.

### Delete confirm
Replaces `confirm()`. First click on trash icon turns the icon-button into an accent pill labeled "Delete?" (`--accent` bg, white text, same height as the icon-button). Second click within 4 seconds commits the delete. Clicking elsewhere or letting the 4s timeout pass reverts to the trash icon.

### Add-item card
White card below the list, same surface/shape as item rows but padding `14px`.
- Small all-caps label "ADD ITEM" in `--text-soft`.
- Row: two inputs (name, note) + "Add" accent button, gap `6px`. Stacks on mobile (<480px).

### Bulk-add card
Same card pattern.
- Label "BULK ADD (CSV)".
- Short helper text in `--text-muted`: "One item per line. Optional note after the first comma."
- Textarea (full width, 6 rows, `--border`, `--surface-soft`, `--radius-button`, padding `10px`, `font: inherit`).
- "Add batch" accent button.
- After submit: success flash ("Added N items") + an `<ul>` of per-line errors in `--accent` text.

### Header strip
Used on the guest list view.
- Single line above the title: "Signed in as **Sam** · Sign out · Admin"
- `--text-soft` color, font `0.85rem`, links underlined on hover.

### Admin badge
Used on the admin list view, next to the party title.
- Small pill: `--ink` bg, `#fde7d2` text, `0.68rem`, letter-spacing `0.06em`, uppercase, padding `2px 9px`.

### Counts subtitle
Used on guest and admin list views, directly under the party title.
- `--text-soft`, font `0.76rem`.
- Text: "12 items · 3 claimed" (guest) or "12 items · 3 claimed" (admin — same format).

### Flash message
Inline pill, used for both guest claim errors and admin success/error.
- Pill shape (`--radius-pill`), padding `6px 14px`, font `0.82rem`.
- Variants: error (`--accent` bg, white text), success (`--success-bg`, `--success-text`).
- Auto-hides after 3 seconds (existing 3s behavior preserved).

### Primary button
- `--accent` bg, `--accent-ink` text, `--radius-button`, padding `7px 16px`, font `0.8rem` weight 600, no border.
- Hover: `--accent-hover`.
- Focus: 2px outline in `--accent` with 2px offset.
- Disabled: `--text-muted` bg, `--surface` text, cursor `not-allowed`.

### Pill button (Claim)
- Same colors as primary, but `--radius-pill`, padding `5px 13px`, font `0.75rem`.

### Secondary / cancel button
- Transparent bg, `--text-soft` text, 1px `--border`, same shape as primary.
- Hover: `--surface-warm` bg, `--ink` text.

### Text link
- `--ink` color, underlined on hover. Used for "Sign out", "Admin", "Unclaim", "Log out".

### Input
- `--surface-soft` bg, `--border` 1px, `--radius-button`, padding `7px 10px`, font inherit `0.85rem`, color `--text`.
- Placeholder `--text-muted` at reduced opacity.
- Focus: border `--accent`, box-shadow `0 0 0 3px var(--accent-soft)`.

## Screen layouts

### `/setup` — Setup wizard
- Hero card centered.
- Title "Set up your party" (Fraunces, `--ink`).
- Paragraph: "Pick a title and an admin password. The password lets you add and edit items later."
- Input: Party title.
- Input: Admin password (type=password).
- Primary button: "Create party" (full-width on mobile).
- Error flash below the button.

### `/` — Guest name prompt (first visit)
- Hero card centered.
- Party title (Fraunces, large, `--ink`).
- Subhead: "Who are you?"
- Paragraph: "Type a display name to claim items. Anyone who picks something up will see this name."
- Input: Your name (autofocus).
- Primary button: "Continue".

### `/` — Guest list (signed in)
- Page wrapper: cream gradient background, content max-width 640px, padding `2rem 1rem`.
- Header strip ("Signed in as **Sam** · Sign out · Admin").
- Party title (Fraunces, h1).
- Counts subtitle ("12 items · 3 claimed").
- List of guest item rows (no `<ul>` bullets; CSS list-style none, but kept as `<ul>` for semantics).
- Polls `/api/state` every 5s (unchanged).

### `/admin` — Admin login
- Hero card centered.
- Party title (Fraunces, `--ink`).
- Subhead: "Admin login".
- Input: Admin password.
- Primary button: "Log in".

### `/admin` — Admin list (logged in)
- Same page shell as guest list.
- Title row: party title + admin badge pill.
- Counts subtitle.
- List of admin item rows (with inline edit + delete confirm).
- Add-item card.
- Bulk-add card.
- Bottom: small text link "Log out" (no heavy button).

## File changes

### Modified
- `public/styles.css` — full rewrite around the token system. Single file, no preprocessor, no build step.
- `public/index.html` — add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the two woff2 files; the `@font-face` declarations live in `styles.css`. `#app` stays as-is; the cream-gradient background is applied to `body`, and `#app` carries the content max-width.
- `public/app.js` — DOM-structure changes only:
  - Replace `prompt()`-based edit handler with inline-edit row swap (new `renderEditingItemRow` function).
  - Replace `confirm()`-based delete with two-click pill state.
  - Add admin badge element to admin header.
  - Add counts subtitle element under titles on both guest and admin lists.
  - Replace the existing inline-styled bulk error rendering with the new component markup.
  - Add a shared `flash(text, variant)` helper used by both guest and admin.
  - Header strip already exists for guest; add equivalent (badge instead of strip) for admin.

### Added
- `public/fonts/fraunces-600.woff2` — Fraunces 600, Latin subset.
- `public/fonts/inter-400.woff2` — Inter 400, Latin subset.
- `public/fonts/inter-600.woff2` — Inter 600, Latin subset.
- `public/fonts/LICENSE.txt` — SIL Open Font License text for both families (both are OFL). Source: download from Google Fonts (`fonts.google.com/specimen/Fraunces`, `fonts.google.com/specimen/Inter`) and run through `pyftsubset` or fonttools to produce Latin-subsetted woff2. The exact subsetting command will be in the implementation plan.

### Unchanged
- `src/**` — no backend or API changes.
- `test/**` — no API tests should break (API surface is identical).
- `package.json` — no new dependencies.

## Out of scope

- No favicon design work.
- No dark mode toggle.
- No animations beyond CSS transitions on hover, focus, and the inline-edit row swap.
- No accessibility audit beyond preserving current semantic HTML, adding visible focus rings, and using the contrast-verified palette above.
- No mobile/desktop layout split — one responsive layout, breakpoint at 480px for the Add-item input stacking.
- No new tests. UI behavior is exercised manually; the existing API tests cover the unchanged backend.

## Risks and mitigations

- **Font loading delay.** Self-hosted woff2 with `font-display: swap` plus preload — initial paint uses fallback, swaps in when ready. Subsetted to Latin to keep each file ~25–40 KB.
- **Inline edit state lost on poll.** The 5s `setInterval(refresh, 5000)` in admin would clobber an in-progress edit. Mitigation: pause polling while any row is in edit mode; resume on save/cancel.
- **Delete-confirm 4s timeout feels racy.** A 4s window is short. Mitigation: reset the timer on hover, and the pill is large enough to hit easily.
- **Color-blind users on the green success flash.** Success is also worded ("Added 3 items"); not color-only.

## Success criteria

- All five screens (Setup, Name prompt, Guest list, Admin login, Admin list) render in the new style.
- No browser `prompt()` or `confirm()` dialogs remain.
- Existing API tests still pass without modification.
- Polling continues to refresh the list every 5s, except while inline-editing.
- Fonts load from `public/fonts/`, not a third-party CDN.
