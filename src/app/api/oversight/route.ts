import { route } from "@/server/request";
import { ensureSimulation } from "@/server/context";

export const GET = route(async (user, { app }) => {
  ensureSimulation();
  return app.oversight(user);
}, "view_org_dashboard");

export const dynamic = "force-dynamic";
