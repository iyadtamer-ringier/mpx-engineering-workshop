import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationServer } from "../server.js";
import { rankJobs } from "../server/matching.js";
import { listJobs } from "../server/catalog.js";
import { getCandidateById } from "../server/candidates.js";

async function withServer(run) {
  const application = await createApplicationServer();
  await new Promise((resolve) => application.server.listen(0, "127.0.0.1", resolve));
  const address = application.server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await application.close();
  }
}

test("public catalog and match routes use fictional data", async () => {
  await withServer(async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.status, "ok");
    assert.equal(health.data, "synthetic");

    const jobs = await (await fetch(`${base}/api/jobs`)).json();
    assert.equal(jobs.jobs.length, 7);
    assert.equal(new Set(jobs.jobs.map((job) => job.canonicalId)).size, 7);
    const search = await (await fetch(`${base}/api/jobs?q=Senior%20Product%20Engineer&category=Engineering&location=Zurich`)).json();
    assert.deepEqual(search.jobs.map((job) => job.id), ["job-101"]);
    assert.equal(search.jobs[0].source, "Direct");
    const overview = await (await fetch(`${base}/api/overview`)).json();
    assert.deepEqual(overview.catalog, { visibleListings: 7, uniqueRoles: 7, partnerListings: 1 });

    const matches = await (await fetch(`${base}/api/matches?candidateId=candidate-001`)).json();
    assert.equal(matches.jobs.length, 7);
    assert.equal(new Set(matches.jobs.map((job) => job.canonicalId)).size, 7);
    assert.equal(matches.jobs[0].match.score, 92);
    assert.equal(matches.jobs[0].match.matchedCount, 3);
    assert.deepEqual(matches.jobs[0].match.skillBreakdown.map((item) => item.matchType), ["exact", "exact", "exact", "related"]);
    assert.equal(JSON.stringify(matches).includes("privateNotes"), false);
  });
});

for (const order of [
  ["candidate-001", "candidate-002", "candidate-001"],
  ["candidate-002", "candidate-001", "candidate-002"],
]) {
  test(`match API isolates profile switches: ${order.join(" -> ")}`, async () => {
    await withServer(async (base) => {
      for (const id of order) {
        const response = await fetch(`${base}/api/matches?candidateId=${id}`);
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.candidateId, id);
        assert.equal(result.scoredForCandidateId, id);
        assert.deepEqual(result.jobs, rankJobs(listJobs(), getCandidateById(id)));
        assert.equal(result.jobs.length, 7);
        assert.equal(new Set(result.jobs.map((job) => job.canonicalId)).size, 7);
      }
    });
  });
}

test("public candidate summaries omit recruiter-only fields", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/candidates`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.candidates.length, 3);
    assert.equal(JSON.stringify(body).includes("privateNotes"), false);
    assert.equal(JSON.stringify(body).includes("@example.test"), false);
  });
});

test("security workshop baseline exposes full details and export without authorization", async () => {
  await withServer(async (base) => {
    const details = await fetch(`${base}/api/candidates/candidate-001`);
    const candidate = (await details.json()).candidate;
    assert.equal(details.status, 200);
    assert.equal(candidate.email, "maya.becker@example.test");
    assert.match(candidate.privateNotes, /Fictional recruiter note/);

    const exportResponse = await fetch(`${base}/api/admin/candidates/export`);
    assert.equal(exportResponse.status, 200);
    assert.match(await exportResponse.text(), /maya.becker@example.test/);
  });
});

test("unknown resources and unsupported methods fail cleanly", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/jobs/missing`)).status, 404);
    assert.equal((await fetch(`${base}/api/matches?candidateId=missing`)).status, 404);
    assert.equal((await fetch(`${base}/api/jobs`, { method: "POST" })).status, 405);
  });
});
