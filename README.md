# Runitup BSC launch watcher

Read-only Node.js/TypeScript service that detects verified Runitup factory launch events on BSC, stores them idempotently, and sends a Telegram alert. It is deliberately not a trading bot: it contains no wallet, private key, transaction signing, or buy/sell signal.

The token address in the original investigation — `0xa00866f73aaead7e0a410386c6ea66b979c40bfc` (DEL) — is **not** watched as a factory. The source-of-truth registry is [`src/contracts/runitup.ts`](src/contracts/runitup.ts): BSC factory v1 `0xB7aF…Bd20` starts at block `126453990`, and Infinity `0x8c66…1ffF` starts at `126454047`.

## Quick start

```sh
npm install
cp .env.example .env
# Edit .env; keep DRY_RUN=true for the observation period.
npm test
npm run build
npm start
```

`HTTP_RPC_URLS` accepts multiple comma-separated endpoints for automatic viem fallback. The example uses PublicNode for convenience; use a paid, archive-capable BSC HTTP provider and a separate reliable WSS endpoint in production. Public BSC endpoints commonly limit historical `eth_getLogs`.

On an empty database the service scans only the mutable reorg window, so deployment does not announce years of history. To perform a controlled historical backfill, stop it, set `BOOTSTRAP_BLOCK` (never earlier than the relevant verified registry start block), use a test Telegram chat, then start it again. The SQLite cursor makes restart recovery automatic.

## Operational model

- HTTP `getLogs` filtered to verified factory addresses and creation-event topics is the recovery/backfill authority. The adaptive range shrinks after a provider limit error.
- WSS provides faster detection when configured; it uses the same SQLite idempotency path as polling.
- The unique event key is `(transaction hash, log index)`. Event, metadata and per-chat outbox rows commit in one transaction before any Telegram request.
- The last reorg window is replayed. A changed stored block hash rolls back canonical events, cancels unsent alerts, and edits or follows up on already-sent alerts.
- Alerts distinguish verified factory facts, unverified token source status, unavailable data, and conservative risks. They never say a token is safe or recommend a trade.
- Every launch alert includes token-specific GMGN and Based Bot referral buttons. Each deep link contains the observed BSC contract address and the configured referral ID. They are disclosed in the message as external referral links; this watcher does not create an order or attest that either venue will support a token.

## Production checklist

1. Keep `DRY_RUN=true` for several hours/day and inspect RPC errors, lag, duplicate rate, and registry results.
2. Set a test chat in `TELEGRAM_CHAT_IDS`, then set `DRY_RUN=false`. Keep `TELEGRAM_ADMIN_USER_IDS` limited to numeric Telegram user IDs you control.
3. Persist `DB_PATH` on durable storage. Back it up; do not share `.env` or its bot token.
4. Use a service supervisor (systemd/PM2) and configure restart-on-failure. The process is safe to restart because delivery runs through SQLite outbox.
5. Before adding a suite, hook, locker, manager, or venue, review the official config and Sourcify ABI/proxy result, then add source URLs and `VERIFIED` evidence in the registry. Never auto-allowlist a discovered address.

Example systemd unit (replace paths and user):

```ini
[Service]
WorkingDirectory=/srv/runitup
EnvironmentFile=/srv/runitup/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
```

## Registry evidence

The two factory ABIs/proxy statuses were verified via Sourcify exact-match records:

- [BSC Infinity factory](https://sourcify.dev/server/v2/contract/56/0x8c6689531003158f7A7fFd02895396A122191ffF?fields=abi,proxyResolution)
- [BSC v1 factory](https://sourcify.dev/server/v2/contract/56/0xB7aF2FBCBE56bb11950F7105E0910D8DcbB6Bd20?fields=abi,proxyResolution)

The decoder supports `TokenLaunched`, `TaxedTokenLaunched`, and `StakedTokenLaunched`. DEL transaction `0xdc36…edc1e`, log index `0x49`, block `127265327` is included as a golden test fixture.
