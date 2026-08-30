import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";

/** POST /api/proof/:id/review { decision: VERIFIED|REJECTED, reason } */
export async function POST(req: Request, { params }: { params: { proofId: string } }) {
  try {
    ensureSimulation();
    const user = await requireCapability("review_proof");
    const body = await req.json().catch(() => ({}));
    const decision = body.decision as string;
    if (decision !== "VERIFIED" && decision !== "REJECTED") {
      return NextResponse.json({ error: "Review decision must be VERIFIED or REJECTED." }, { status: 400 });
    }
    const { app } = getCtx();
    const updated = app.reviewProof(user, params.proofId, decision, String(body.reason ?? ""));
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}
