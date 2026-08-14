import { z } from "zod";

export const uploadRequestSchema = z.object({
  payment_event_id: z.string().min(1).max(80),
  account_id: z.string().min(1).max(80),
  asset_kind: z.enum(["receipt", "chargeback_evidence"]),
  content_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z.number().int().positive().max(10_000_000),
  risk_score: z.number().int().min(0).max(100),
  requested_by: z.string().min(1).max(120),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export type UploadDecision =
  | { outcome: "approved"; objectKey: string; expiresSeconds: number }
  | { outcome: "review_required"; reason: string };

export function decideUpload(input: UploadRequest): UploadDecision {
  if (input.risk_score >= 70) {
    return { outcome: "review_required", reason: "risk_score_threshold" };
  }
  const extension = input.content_type === "application/pdf"
    ? "pdf"
    : input.content_type === "image/png" ? "png" : "jpg";
  return {
    outcome: "approved",
    objectKey: `accounts/${input.account_id}/events/${input.payment_event_id}/${input.asset_kind}.${extension}`,
    expiresSeconds: 300,
  };
}
