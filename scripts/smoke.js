const baseUrl = "http://localhost:3000";

async function smokeTest() {
  console.log("Starting smoke tests...");

  // Test SUPERVISOR auth
  const res1 = await fetch(`${baseUrl}/api/auth/demo/SUPERVISOR`, { method: "POST" });
  if (!res1.ok) throw new Error("SUPERVISOR auth failed: " + res1.status);
  const cookie = res1.headers.get("set-cookie");
  if (!cookie) throw new Error("No cookie returned for SUPERVISOR");
  const data1 = await res1.json();
  if (data1.user.role !== "SUPERVISOR") throw new Error("Role mismatch in response");
  console.log("✅ SUPERVISOR auth passed");

  // Test /api/auth/me using the returned cookie
  const res2 = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { "cookie": cookie }
  });
  if (!res2.ok) throw new Error("/api/auth/me failed: " + res2.status);
  const data2 = await res2.json();
  if (data2.user.role !== "SUPERVISOR") throw new Error("/api/auth/me role mismatch");
  console.log("✅ /api/auth/me passed");

  // Test FIELD_WORKER auth
  const res3 = await fetch(`${baseUrl}/api/auth/demo/FIELD_WORKER`, { method: "POST" });
  if (!res3.ok) throw new Error("FIELD_WORKER auth failed: " + res3.status);
  const cookieWorker = res3.headers.get("set-cookie");
  console.log("✅ FIELD_WORKER auth passed");

  // Fetch tasks for field worker
  const res4 = await fetch(`${baseUrl}/api/tasks`, {
    headers: { "cookie": cookieWorker }
  });
  if (!res4.ok) throw new Error("Failed to fetch tasks: " + res4.status);
  const tasks = await res4.json();
  if (tasks.length === 0) throw new Error("No tasks returned for field worker");
  
  const sampleTask = tasks[0];
  if (!sampleTask.entityName) throw new Error("Task missing entityName");
  if (sampleTask.entityName.startsWith("cl_")) throw new Error("Task entityName is not human readable: " + sampleTask.entityName);
  console.log("✅ Tasks fetch passed, entityName is human readable: " + sampleTask.entityName);

  // Test ADMIN auth
  const res5 = await fetch(`${baseUrl}/api/auth/demo/ADMIN`, { method: "POST" });
  if (!res5.ok) throw new Error("ADMIN auth failed: " + res5.status);
  console.log("✅ ADMIN auth passed");

  // Test AUDITOR auth
  const res6 = await fetch(`${baseUrl}/api/auth/demo/AUDITOR`, { method: "POST" });
  if (!res6.ok) throw new Error("AUDITOR auth failed: " + res6.status);
  console.log("✅ AUDITOR auth passed");

  // Test health
  const res7 = await fetch(`${baseUrl}/api/health`);
  if (!res7.ok) throw new Error("Health check failed: " + res7.status);
  console.log("✅ Health check passed");

  console.log("All smoke tests passed successfully! 🎉");
}

smokeTest().catch(e => {
  console.error("❌ Smoke test failed:", e);
  process.exit(1);
});
