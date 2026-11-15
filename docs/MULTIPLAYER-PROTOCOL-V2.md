# Sightline V3 Multiplayer Protocol v2

Status: active development protocol, verified with deterministic in-process tests. Live LAN acceptance remains unverified in the restricted runtime.

## Handshake and compatibility

Clients send `hello` with `v: 2` and the required feature list `session-generation`, `life-epoch`, and `action-seq`. The host negotiates the version before creating a player. A successful `welcome` returns protocol v2, the negotiated features, a random per-connection session token, and the player id. Each new connection gets a new token and sequence space.

Protocol v1 is explicitly unsupported for live multiplayer. The host returns `protocol_upgrade_required` and a user-readable refresh/update instruction, then closes the socket. This is an intentional compatibility decision: v1 fire and reload packets have no mandatory action sequence, session token, or life epoch. A delayed v1 fire/reload packet from a previous life is indistinguishable from a valid action in the current life, so safely accepting v1 combat cannot be guaranteed. Legacy clients are not silently treated as v2 and cannot join until updated.

Unknown protocol versions and v2 clients that omit any required capability are separately rejected. There is no silent version downgrade.

## Client mutation envelope

Every state-changing client message listed below must contain the current connection `session` and a strictly increasing safe-integer `seq`. The host rejects missing, duplicated, decreasing, or cross-session sequences before the message handler can mutate player or match state. Sequence gaps are allowed; WebSocket ordering means a later sequence arriving first makes earlier messages stale and rejects them.

| Message | Session + sequence | Life epoch `ep` | Server-side additional authority |
| --- | --- | --- | --- |
| `in` | Required | Required, exact current epoch | Movement validation and corrections |
| `shot` | Required | Required, exact current epoch | Alive state, weapon, cadence, ammo, hit validation |
| `rl` | Required | Required, exact current epoch | Alive state, owned weapon, reload timing |
| `buy` | Required | Required, exact current epoch | Buy phase, funds, catalog validation |
| `ammo` | Required | Required, exact current epoch | Station proximity and funds |
| `team` | Required | Not life scoped | Lobby/group-mode rules |
| `map` | Required | Not life scoped | Host and lobby only |
| `cfg` | Required | Not life scoped | Host authority and lobby restrictions |
| `start`, `endmatch` | Required | Not life scoped | Host authority and valid phase |
| `cosmetic`, `finish`, `finishes` | Required | Not life scoped | Catalog and selection validation |

`pong` is a response to the host's outstanding ping nonce and does not mutate gameplay state. Invalid or obsolete ping responses do not update RTT.

## Session replacement and close behavior

Each connection callback is bound to its player object. The server drops messages if that object is no longer the exact player stored under its id, or if its connection has closed. Closed-frame delivery stops immediately, including already-buffered frames. A reconnect receives a new player object, session token, and sequence counter; late callbacks from its predecessor cannot target the replacement.

## Test coverage

`tests/mp-protocol-v2-security.test.cjs` covers negotiation, v1 rejection, missing capabilities, stale and missing life epochs, session mismatch, duplicate/decreasing sequences, stale reload/fire/movement, replaced player objects, and the shipped browser packet encoder. `tests/lib/mp-protocol-v2-client.mjs` keeps the active Node WebSocket harnesses on the negotiated protocol.

The deterministic tests establish handler behavior. They do not establish live Wi-Fi/LAN delivery, Android WebView behavior, browser rendering, or physical-device acceptance.
