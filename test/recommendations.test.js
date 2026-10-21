import test from "node:test";
import assert from "node:assert/strict";
import { getRecommendations } from "../server/recommendations.js";
import { rankJobs } from "../server/matching.js";
import { listJobs } from "../server/catalog.js";
import { candidates } from "../server/seed-data.js";

for (const order of [[0, 1, 0], [1, 0, 1]]) {
  test(`recommendations stay profile-specific in order ${order.join(" -> ")}`, () => {
    const jobs = listJobs();
    for (const index of order) {
      const candidate = candidates[index];
      const result = getRecommendations(jobs, candidate);
      assert.equal(result.scoredForCandidateId, candidate.id);
      assert.deepEqual(result.jobs, rankJobs(jobs, candidate));
      assert.equal(result.jobs[0].id, index === 0 ? "job-101" : "job-102");
      assert.equal(result.jobs[0].match.score, index === 0 ? 92 : 80);
    }
  });
}

test("recommendations reflect the current catalog and skills on repeated requests", () => {
  const jobs = listJobs();
  getRecommendations(jobs, candidates[0]);
  const candidate = { ...candidates[0], skills: [] };
  const currentJobs = jobs.filter((job) => job.id !== "job-101");
  const result = getRecommendations(currentJobs, candidate);
  assert.deepEqual(result.jobs, rankJobs(currentJobs, candidate));
  assert.equal(result.jobs.some((job) => job.id === "job-101"), false);
  assert.ok(result.jobs.every((job) => job.match.matchedCount === 0));
});
