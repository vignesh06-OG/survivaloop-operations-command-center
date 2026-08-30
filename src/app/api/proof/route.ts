import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { proofInputSchema } from "@/domain/validation-schema";

/** POST /api/proof — submit execution proof (idempotent by worker+submissionId). */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("submit_proof");
    const body = await req.json().catch(() => ({}));
    const parsed = proofInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid proof payload.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { app } = getCtx();
    const { proof, duplicate } = app.submitProof(user, {
      taskId: parsed.data.taskId,
      submissionId: parsed.data.submissionId,
      claimedAt: parsed.data.claimedAt,
      location: parsed.data.location ?? null,
      photoRefs: parsed.data.photoRefs ?? [],
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ proof, duplicate });
  } catch (e) {
    return handleError(e);
  }
}
