# PartyDibs

A single-party wishlist. The host adds items; guests visit a link, type their
name, and claim items. One claim per item.

## Run

```
npm install
npm start
```

Defaults to `http://localhost:3000`. Override with `PORT=4000 npm start`.

On first launch the home page redirects to `/setup` where you pick a party
title and admin password. After setup, share `http://localhost:3000/` with
guests and go to `/admin` to manage the list.

## Storage

State lives in `./data/party.db` (SQLite). Override with `DB_PATH`. To start a
new party, stop the server, delete `data/party.db`, and restart.

## Test

```
npm test
```

Tests use `node:test` and `supertest`; the DB runs in-memory.
