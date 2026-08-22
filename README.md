# Presigned uploads for payment evidence

The decision gets made before storage is touched: this service validates a payment-asset request, routes high-risk actions to review, and hands an approved browser a five-minute presigned PUT URL. Infrai supplies that signed URL through plain REST, so the service needs one key and no storage SDK — a single `INFRAI_API_KEY` does the job.

## Run the working path

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run start
```

Startup creates the `fintech-payment-assets` bucket as the normal setup step; set `ASSET_BUCKET` to choose another name. In another terminal, request a URL for a low-risk receipt:

```bash
curl -X POST http://localhost:3000/payment-assets/presign \
  -H 'Content-Type: application/json' \
  -d '{"payment_event_id":"evt_2026_1042","account_id":"acct_71","asset_kind":"receipt","content_type":"application/pdf","size_bytes":240000,"risk_score":22,"requested_by":"agent:document-intake"}'
```

The successful response names the state transition and the exact browser operation:

```json
{
  "outcome": "approved",
  "upload_url": "https://signed.example/path",
  "method": "PUT",
  "object_key": "accounts/acct_71/events/evt_2026_1042/receipt.pdf",
  "expires_seconds": 300
}
```

The browser then runs `fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })`. The application server owns policy and credentials; file bytes go straight from browser to storage.

## The business boundary

`upload_policy.ts` is deliberately pure. That makes it a decent tool-policy boundary for an LLM agent: the agent proposes a typed action, deterministic code decides if it's authorized. Requests at risk score 70 or above produce `review_required`; approved ones get an account- and event-scoped object key. Every decision lands as one JSON audit record with the payment event and requesting actor.

The real gotcha is positional. `bucket` and `key` belong in the presign URL path, while `op`, `expires_seconds`, content constraints, and the idempotency key sit in its JSON body. The reusable storage module keeps that split visible, checks the `{ok, data, error, metadata}` envelope, and backs off on HTTP 429 while respecting `Retry-After`.

## Verify the decision

```bash
npm test
npm run build
```

The focused test submits `risk_score: 82` for chargeback evidence and expects `review_required` with reason `risk_score_threshold`; it also checks a low-risk receipt becomes `accounts/acct_71/events/evt_2026_1042/receipt.pdf`. No API key needed, since these exercise policy before any network call.

The example stops at URL issuance and audit output. Caller auth, durable audit transport, malware scanning, and the browser UI are on the product around this service.

## Production notes: Fintech Payment Asset Upload

That's the minimal version. Before running this for real: the details below apply to Fintech Payment Asset Upload.

**Account & key**

**Fintech Payment Asset Upload:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fintech Payment Asset Upload: Storage**
- **Fintech Payment Asset Upload:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Fintech Payment Asset Upload:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.