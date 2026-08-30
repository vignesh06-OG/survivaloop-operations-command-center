import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";

/** POST /api/proof/:id/auto — run automated verification checks. */
export async function POST(_req: Request, { params }: { params: { proofId: string } }) {
  try {
    ensureSimulation();
    const user = await requireCapability("review_proof");
    const { app } = getCtx();
    const proof = app.repo.getProof(params.proofId);
    if (!proof) return NextResponse.json({ error: "Proof not found." }, { status: 404 });
    const updated = app.autoVerify(user, proof.task_id as string, params.proofId);
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}
