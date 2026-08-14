import { createServer } from "node:http";
import { infrai } from "./infrai_storage.js";
import { decideUpload, uploadRequestSchema } from "./upload_policy.js";

const bucket = process.env.ASSET_BUCKET ?? "fintech-payment-assets";
const port = Number(process.env.PORT ?? 3000);

function audit(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ recorded_at: new Date().toISOString(), ...event }));
}

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/payment-assets/presign") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = uploadRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const decision = decideUpload(input);

    if (decision.outcome === "review_required") {
      audit({
        type: "payment_asset_upload_review_required",
        payment_event_id: input.payment_event_id,
        requested_by: input.requested_by,
        reason: decision.reason,
      });
      response.writeHead(403).end(JSON.stringify(decision));
      return;
    }

    const signed = await infrai.storage.object.presign(bucket, decision.objectKey, {
      op: "put",
      expires_seconds: decision.expiresSeconds,
      content_type: input.content_type,
      max_bytes: input.size_bytes,
      idempotency_key: `asset-${input.payment_event_id}-${input.asset_kind}`,
    });
    audit({
      type: "payment_asset_upload_authorized",
      payment_event_id: input.payment_event_id,
      requested_by: input.requested_by,
      object_key: decision.objectKey,
    });
    response.writeHead(200).end(JSON.stringify({
      outcome: "approved",
      upload_url: signed.url,
      method: "PUT",
      object_key: decision.objectKey,
      expires_seconds: decision.expiresSeconds,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    response.writeHead(400).end(JSON.stringify({ error: message }));
  }
});

server.listen(port, () => console.log(`Payment asset service listening on http://localhost:${port}`));
