# P4 — Mercado Pago Point discovery

Verified against live Mercado Pago developer documentation on 2026-09-08. No credentials were used. This is the discovery output P4 asked for, not an adapter implementation.

Sources (Mexico site unless noted):

- [Point overview (MX)](https://www.mercadopago.com.mx/developers/en/docs/mp-point/overview)
- [Create application (MX)](https://www.mercadopago.com.mx/developers/en/docs/mp-point/create-application)
- [Configure terminal (MX)](https://www.mercadopago.com.mx/developers/en/docs/mp-point/configure-terminal)
- [Payment processing (MX)](https://www.mercadopago.com.mx/developers/en/docs/mp-point/payment-processing)
- [Create Point order API](https://www.mercadopago.com.ar/developers/en/reference/in-person-payments/point/orders/create-order/post)
- [Migrate Payment Intent → Orders API](https://www.mercadopago.com.ar/developers/en/docs/mp-point/migrate-payment-intent-to-orders)
- [Point + Orders API announcement (MX, 2025-07-16)](https://www.mercadopago.com.mx/developers/en/news/2025/07/16/Transform-your-point-of-sale-with-the-new-integration-between-Point-and-the-Orders-API)

## Merchant country and account

Tulala's operating context is Mexico. The Mexico developer site is the right primary source (`mercadopago.com.mx`). Create-order examples on that site return `country_code: "MEX"`.

A seller account is a Mercado Pago or Mercado Libre user. The overview lists three prerequisites: a Point Smart terminal, the Mercado Pago mobile app (to log into the terminal), and a Mercado Pago account.

**Not verified here:** which legal entity / MX merchant account Tulala will connect. That is an owner action (credentials), not a documentation gap.

## Supported terminal hardware (current Point POS integration)

The Mexico overview names the terminals that integrate with a POS via the API:

- **Point Smart 1**
- **Point Smart 2**

Terminal ids in API examples use `{terminal_type}__{serial}` (for example `NEWLAND_N950__N950NCB801293324` or sandbox `NEWLAND_N950__SBX0000001`). Only **PDV** operating mode is valid for API integration. Standalone mode is for unintegrated use. One terminal in PDV mode per point of sale.

## Application authorization and test procedure

1. Create an application in Your integrations. Payment type: **In-person payments** → **Mercado Pago Point**. Identity verification / re-auth is required at creation.
2. Test credentials are generated automatically (Public Key + Access Token). Test Access Tokens start with `APP_USR`. The Payment Intent `x-test-scope: sandbox` header **does not exist** on the Orders API — test users replace it.
3. **Own integration:** develop on the test Access Token; replace with the production Access Token to go live.
4. **Third-party (platform) integration:** keep using the test Access Token through development; production uses an Access Token obtained via **OAuth authorization-code flow**, then replace.
5. Configure the terminal: `GET /terminals/v1/list`, then `PATCH /terminals/v1/setup` with `operating_mode: "PDV"`.
6. Process: `POST /v1/orders` with `type: "point"` and `config.point.terminal_id`. The terminal loads the order; if it does not, the operator uses Update / the green button.
7. Notifications: subscribe the **Order (Mercado Pago)** (`orders`) topic; deactivate `point_integration_wh`.
8. Go to production per MP's Point go-to-production guide (not fetched in full here).

## Current Point API vs Payment Intent (verified)

The reported move to the **Orders API is current**, not assumed. MP's own migration guide states that new Point features will be developed on Orders, and the 2025-07-16 MX news post announces Point + Orders.

| Operation | Legacy Payment Intent | Current Orders API |
|---|---|---|
| List terminals | `GET /point/integration-api/devices` | `GET /terminals/v1/list` |
| Set mode | `PATCH /point/integration-api/devices/{device_id}` | `PATCH /terminals/v1/setup` |
| Create | `POST /point/integration-api/devices/{deviceid}/payment-intents` | `POST /v1/orders` (`type: "point"`) |
| Get | `GET /point/integration-api/payment-intents/{id}` | `GET /v1/orders/{orderid}` |
| Cancel | `DELETE .../payment-intents/{id}` | `POST /v1/orders/{orderid}/cancel` |
| Refund | No dedicated endpoint (Payments API after webhook) | `POST /v1/orders/{orderid}/refund` |

Mandatory headers on create / cancel / refund: `Authorization: Bearer …`, **`X-Idempotency-Key`** (UUID). Reusing a key with a different body returns `idempotency_key_already_used`. GET does not need the key. `x-test-scope` must not be sent.

Create-order amount is a **string with two decimals** (`"50.00"`), not integer cents. `external_reference` is required (max 64, letters/numbers/`-`/`_`, unique, no PII). Default expiry is **PT15M** if `expiration_time` is omitted; allowed range **PT30S–PT3H**. Expired unpaid orders cancel automatically.

Order ids are alphanumeric with an `ORD` prefix, not UUIDs.

### Status (self-contained)

| Payment Intent `state` | Orders `status` |
|---|---|
| OPEN | `created` |
| ON_TERMINAL | `at_terminal` |
| PROCESSING / PROCESSED | absorbed (no intermediate) |
| FINISHED (approved) | `processed` |
| FINISHED (rejected) / ERROR | `failed` |
| CONFIRMATION_REQUIRED | `action_required` |
| ABANDONED | `expired` |
| CANCELED | `canceled` |
| (none) | `refunded` (new; must be handled) |

`processed` and `failed` carry the result on the order. Cancel of `at_terminal` requires header `x-allow-cancelable-status: at_terminal`. Refunds accepted up to **90 days**. Full refund: POST refund with empty body → `status: refunded`. Partial refund leaves `status: processed` with `status_detail: partially_refunded`.

## Adapter contract (against Tulala's collection interface)

Map Point Orders onto `web/src/lib/payments/collection.ts` when Point lands. Do not start this adapter until merchant credentials exist.

| Collection interface | Point Orders |
|---|---|
| `createPaymentRequest` | `POST /v1/orders` with `type: "point"`, `external_reference` = Tulala `booking_transactions.id`, amount as decimal string, `config.point.terminal_id` |
| `retrieveState` | `GET /v1/orders/{id}` → map `created`/`at_terminal` → pending; `processed` → succeeded; `failed`/`expired`/`canceled`/`refunded` as named |
| `cancel` | `POST /v1/orders/{id}/cancel` (+ `x-allow-cancelable-status` when at terminal) |
| `refund` | `POST /v1/orders/{id}/refund` (original route; never retry on Stripe) |
| `terminalAvailability` | `GET /terminals/v1/list` filtered by store/POS; unavailable when none in PDV |

Store the Mercado Pago order id (`ORD…`) on the payment attempt, not as a second commercial order. Tulala `orders` remains the commercial record (L52).

## Transaction history / import

Not verified as a bulk import API in the Point Orders docs fetched here. Point GET is per order. Settings in the program distinguish import/reconciliation as a **separate switch** from collection. Until a history endpoint is confirmed, imported MP activity must land in Payments → Unmatched with provider- and account-scoped ids, and must not fabricate a Sale, a customer, or an admission.

## What this does not prove

- Live charges, refunds, or terminal pairing (no credentials).
- Stripe Terminal — none exists in this repo; the pilot is online card + cash.
- Payout / Connect equivalence. Collection ≠ payout.

Pilot until Point lands: `reportTerminalAvailability()` returns `{ available: false, reason: "point_not_landed" }`.
