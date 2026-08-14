import assert from "node:assert/strict";
import test from "node:test";
import { decideUpload, uploadRequestSchema } from "../src/upload_policy.js";

const request = {
  payment_event_id: "evt_2026_1042",
  account_id: "acct_71",
  asset_kind: "chargeback_evidence" as const,
  content_type: "application/pdf" as const,
  size_bytes: 240_000,
  risk_score: 82,
  requested_by: "agent:risk-reviewer",
};

test("routes a high-risk payment asset to review without minting an upload", () => {
  const input = uploadRequestSchema.parse(request);
  assert.deepEqual(decideUpload(input), {
    outcome: "review_required",
    reason: "risk_score_threshold",
  });
});

test("scopes an approved receipt to its account and payment event", () => {
  const input = uploadRequestSchema.parse({ ...request, asset_kind: "receipt", risk_score: 22 });
  assert.deepEqual(decideUpload(input), {
    outcome: "approved",
    objectKey: "accounts/acct_71/events/evt_2026_1042/receipt.pdf",
    expiresSeconds: 300,
  });
});
