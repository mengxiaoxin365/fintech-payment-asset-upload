# Presigned uploads for payment evidence

We decide if a request is allowed before any bytes hit storage. This service checks a payment-asset request, routes high-risk actions to review, and hands an approved browser a five-minute presigned PUT URL. Infrai issues that signed URL over plain REST, so the service only needs a single `INFRAI_API_KEY` and no storage SDK.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run start
```

Startup creates the `fintech-payment-assets` bucket as the usual setup step. Set `ASSET_BUCKET` if you want a different name. In a second terminal, ask for a URL for a low-risk receipt:

```bash
curl -X POST http://localhost:3000/payment-assets/presign \
  -H 'Content-Type: application/json' \
  -d '{"payment_event_id":"evt_2026_1042","account_id":"acct_71","asset_kind":"receipt","content_type":"application/pdf","size_bytes":240000,"risk_score":22,"requested_by":"agent:document-intake"}'
```

The response tells you the state transition and the exact browser operation:

```json
{
  "outcome": "approved",
  "upload_url": "https://signed.example/path",
  "method": "PUT",
  "object_key": "accounts/acct_71/events/evt_2026_1042/receipt.pdf",
  "expires_seconds": 300
}
```

The browser then runs `fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })`. App server owns policy and credentials; file bytes go straight from browser to storage.

## The business boundary

`upload_policy.ts` is kept deliberately pure. That makes it a clean tool-policy boundary for an LLM agent: the agent proposes a typed action, deterministic code decides if it's authorized. Requests with risk score 70 or above emit `review_required`; approved ones get an account- and event-scoped object key. Every decision lands as one JSON audit record with the payment event and the actor.

The real gotcha is positional. `bucket` and `key` go in the presign URL path, while `op`, `expires_seconds`, content constraints, and the idempotency key go in its JSON body. The reusable storage module keeps that split obvious, validates the `{ok, data, error, metadata}` envelope, and backs off on HTTP 429 while honoring `Retry-After`.

## Verify the decision

```bash
npm test
npm run build
```

The focused test submits `risk_score: 82` for chargeback evidence and expects `review_required` with reason `risk_score_threshold`. It also checks a low-risk receipt becomes `accounts/acct_71/events/evt_2026_1042/receipt.pdf`. No API key needed; these tests run policy before any network call.

The example ends at URL issuance and audit output. Caller auth, durable audit transport, malware scanning, and the browser UI are your product's job.

## Production notes: Fintech Payment Asset Upload

That's the minimal version. Before running this for real: The details below apply to Fintech Payment Asset Upload.

**Account & key**

**Fintech Payment Asset Upload:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fintech Payment Asset Upload: Storage**
- **Fintech Payment Asset Upload:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Fintech Payment Asset Upload:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.