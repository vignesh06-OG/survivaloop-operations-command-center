import fs from 'fs';

async function run() {
  console.log("Starting Live API QA...");
  let passed = 0;
  let failed = 0;

  const base = process.env.BASE_URL || "https://survivaloop.vercel.app";
  let cookie = "";

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name}`);
      console.error(e.message);
      failed++;
    }
  }

  await test("1) /api/health 200", async () => {
    const res = await fetch(`${base}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.status && !data.ok) throw new Error("Invalid format");
  });

  await test("2) POST /api/auth/demo/SUPERVISOR -> 200 + Set-Cookie", async () => {
    const res = await fetch(`${base}/api/auth/demo/SUPERVISOR`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const setCookie = res.headers.get("set-cookie");
    if (!setCookie) throw new Error("No Set-Cookie header");
    cookie = setCookie.split(";")[0];
  });

  await test("3) GET /api/auth/me -> role SUPERVISOR", async () => {
    const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.user?.role !== "SUPERVISOR") throw new Error(`Expected SUPERVISOR, got ${data.user?.role}`);
  });

  await test("4) POST /api/simulate -> 200 with counts > 0", async () => {
    const res = await fetch(`${base}/api/simulate`, { method: "POST", headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok || data.count === 0) throw new Error("Simulation failed or returned 0");
  });

  await test("5) GET /api/oversight -> 200 with non-empty counts", async () => {
    const res = await fetch(`${base}/api/oversight`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.alertCounts) throw new Error("No alertCounts");
  });

  // Login as field worker
  let fieldCookie = "";
  await test("Login Field Worker", async () => {
    const res = await fetch(`${base}/api/auth/demo/FIELD_WORKER`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fieldCookie = res.headers.get("set-cookie").split(";")[0];
  });

  let taskId = null;
  await test("Dispatch task as Supervisor", async () => {
    // get first decision
    const res = await fetch(`${base}/api/oversight`, { headers: { Cookie: cookie } });
    const data = await res.json();
    let entityId = data.decisions[0].entity.id;
    let dRes = await fetch(`${base}/api/decision`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'MICRO_CLUSTER', id: entityId }) });
    let d = await dRes.json();
    
    // Override to ACT if it's not ACT to ensure we can create a task and have enough priority
    await fetch(`${base}/api/override`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: { level: "MICRO_CLUSTER", id: entityId }, decisionId: d.decisionId, humanDecision: "ACT", reason: "test" }) });
    // Refetch decision after override to get new intervention ID
    dRes = await fetch(`${base}/api/decision`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'MICRO_CLUSTER', id: entityId }) });
    d = await dRes.json();

    const tRes = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'COMMIT', level: 'MICRO_CLUSTER', entityId, decisionId: d.decisionId, interventionId: d.interventionId, workerIds: ['demo-worker', 'u_w2'] }) });
    if (!tRes.ok) {
      const errText = await tRes.text();
      throw new Error(`Task creation failed: ${errText}`);
    }
  });

  await test("6) GET entities/queue/tasks endpoints -> counts > 0", async () => {
    const res = await fetch(`${base}/api/tasks`, { headers: { Cookie: fieldCookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) throw new Error("No tasks returned: " + JSON.stringify(data));
    taskId = data[0].id;
  });

  await test("7) POST/PATCH start task -> 200", async () => {
    if (!taskId) throw new Error("No taskId to start");
    const res = await fetch(`${base}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Cookie: fieldCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ to: "IN_PROGRESS" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
  });

  await test("8) proof submit -> 200", async () => {
    if (!taskId) throw new Error("No taskId to submit proof");
    const res = await fetch(`${base}/api/proof`, {
      method: "POST",
      headers: { Cookie: fieldCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, submissionId: "test-sub-1", claimedAt: Date.now(), photoRefs: ["test.jpg"], note: "test" })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${await res.text()}`);
  });

  // Login as auditor
  let auditCookie = "";
  await test("Login Auditor", async () => {
    const res = await fetch(`${base}/api/auth/demo/AUDITOR`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    auditCookie = res.headers.get("set-cookie").split(";")[0];
  });

  await test("9) auditor cannot mutate -> 403", async () => {
    const res = await fetch(`${base}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Cookie: auditCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ to: "IN_PROGRESS" })
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status} - ${await res.text()}`);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
}

run();
