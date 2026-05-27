# PartyDibs v2 — Guest name cookie + CSV bulk add

Two additive features on top of v1
(`2026-05-26-partydibs-design.md`).

## Scope (in / out)

**In scope:**
- Guest-name cookie that binds claim and unclaim to a single identity per browser.
- Server-side name prompt UX on the guest page when no cookie is present.
- "Sign out" affordance on the guest page that clears the cookie.
- "Admin" link on the guest page that navigates to `/admin`.
- Admin override: a valid admin session can unclaim any item regardless of the name on it.
- CSV bulk-add endpoint and admin UI textarea for pasting one item per line.

**Out of scope:**
- Cookie signing or per-user secret tokens. Name collisions can still grift each other; same trust model as v1.
- A dedicated `/logout` page route. The "logout screen" is the name prompt shown after the cookie is cleared.
- Quoted-CSV parsing. Names with literal commas are not supported.
- Per-row claim history.

## Feature 1: Guest name cookie

### Cookie

- Name: `guest_name`
- Value: the validated display name (1–60 chars after trim, per `validateClaimerName`).
- Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`. No `Secure` (single-host party tool, may run on plain HTTP).
- Cleared by `POST /api/name/logout` via `res.clearCookie`.

The cookie is HttpOnly so JS cannot tamper with it. The client gets the name
back through `GET /api/me`.

### New endpoints

| Method | Path                | Auth | Purpose |
|---     |---                  |---   |---      |
| `POST` | `/api/name`         | none | Body `{name}`. Validates with `validateClaimerName`. Sets `guest_name` cookie. Returns 200 `{name}`. 400 on invalid input. |
| `GET`  | `/api/me`           | none | Returns `{name: string \| null}` (null if no cookie). Used by client on every guest page load. |
| `POST` | `/api/name/logout`  | none | Clears `guest_name` cookie. Returns 200 `{ok: true}`. Idempotent — also fine if no cookie was set. |

### Behavior changes to existing endpoints

- **`POST /api/items/:id/claim`**: Body no longer carries `name`. Server reads
  `guest_name` from cookies. If absent → **401** `{error: "name required"}`.
  The atomic `UPDATE … WHERE claimed_by IS NULL` uses the cookie name.
- **`POST /api/items/:id/unclaim`**: Succeeds if **either** (a) the request's
  `guest_name` cookie equals the row's `claimed_by`, **or** (b) the request has
  a valid admin session. Otherwise **403** `{error: "not your claim"}`. Unknown
  item id still returns 404.

The other endpoints (`/api/setup`, `/api/login`, `/api/logout`, `/api/state`,
admin item CRUD) are unchanged.

### Frontend changes (`/`)

On guest page load:
1. `GET /api/me`.
2. If `name === null` → render the **name prompt**: a single input + "Continue"
   button. Submit posts to `/api/name`. On 200, re-render the list view.
3. If `name` is set → render the existing list view, prefixed by a header line:
   `Signed in as **<name>** · [Sign out] · [Admin]`
   - "Sign out" posts to `/api/name/logout` and re-renders the name prompt.
   - "Admin" is a plain link to `/admin`.
4. Item claim buttons no longer send a name in the body — the server reads
   the cookie. The old `localStorage` name caching is removed.

## Feature 2: CSV bulk add (admin only)

### New endpoint

- **`POST /api/items/bulk`** (admin). Body `{csv: string}`.
- Parsing:
  - Split `csv` on `\n`.
  - For each line: trim. Skip if empty.
  - Split the line on the **first** `,` only. Left side = name, right side (if
    present) = note. Both trimmed. Empty note → stored as NULL.
- Validation: each row's `name` validated by `validateItemName`; `note` by
  `validateItemNote`. A row that fails validation is **not inserted** and is
  reported in the response.
- Insertion: all valid rows are inserted inside a single `db.transaction`,
  appended to the end with `position = MAX(position) + 1` (incrementing within
  the batch).
- Response shape (always 200, even with errors):
  ```json
  {
    "added": 3,
    "errors": [
      {"line": 2, "error": "name: must be at most 100 chars"},
      {"line": 5, "error": "note: must be at most 500 chars"}
    ]
  }
  ```
  `line` numbers are 1-based against the original `csv` (including blank lines)
  so the admin can find the offending row in their paste.
- `csv` itself is validated: must be a string, length ≤ 100,000 chars
  (sanity bound — ~10k typical items). Empty CSV returns 200 `{added: 0, errors: []}`.

### Frontend changes (`/admin`)

Under the existing "Add item" form, add a new section:

```
Bulk add (CSV)
[textarea, 6 rows]
[Add batch]
[result line and per-line errors]
```

After submit, render `Added N item(s)` plus, if any errors, a `<ul>` of
`line N: <error>` items. On success the textarea is cleared and the list
refreshes.

## Test updates required

Several v1 tests sent `{name}` in the claim body. These need a brief shape
change:

- Use `request.agent(app)` to keep cookies across the name-set and claim
  requests.
- Before each claim: `await agent.post('/api/name').send({name: 'Alice'})`.
- The claim body is now empty.

Existing tests to update (in `test/api.test.js`):
- "POST /api/items/:id/claim claims a free item"
- "POST /api/items/:id/claim on already-claimed returns 409 with current state"
- "POST /api/items/:id/claim rejects bad name with 400" — now becomes
  "claim without name cookie returns 401" (the bad-input case is exercised at
  the `/api/name` boundary instead).
- "POST /api/items/:id/claim returns 404 for unknown id" — still valid, but
  needs a name cookie first.
- "POST /api/items/:id/unclaim clears claimer; idempotent" — must be the
  same agent (matching name) **or** an admin agent. Update to use the same
  agent. Add a separate test for the 403 mismatch case.

New tests to add:
- `POST /api/name` happy path; validates bounds (empty, >60 chars).
- `GET /api/me` returns `{name: null}` before, `{name}` after.
- `POST /api/name/logout` clears the cookie; subsequent `GET /api/me` returns null.
- Claim without name cookie returns 401.
- Unclaim with mismatched name returns 403; original claim still in place.
- Admin can unclaim someone else's claim (override).
- Bulk add: empty CSV → `{added: 0, errors: []}`.
- Bulk add: 3 valid lines → `added: 3`, list reflects them in order.
- Bulk add: mixed valid + invalid (e.g. one oversize name) → only valid rows inserted; offending lines reported with correct 1-based line numbers.
- Bulk add: name with optional note via comma split; note with internal whitespace.
- Bulk add: requires admin (no admin session → 401).
- Bulk add: oversized csv body → 400.

## Migration

None. No schema changes. Both features are additive; the only data change is
that `claimed_by` is now always the value of the actor's cookie, which is the
same string shape as before.

## Open / deferred

- Cookie signing: deferred. Same threat model as v1.
- CSV import results download (e.g. "redownload rejected lines"): YAGNI.
- "Forget me everywhere" admin action to mass-clear name cookies (would
  require server-side per-name tokens). Out of scope.
