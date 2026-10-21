import test from "node:test";
import assert from "node:assert/strict";
import { getDuplicateListings } from "../src/lib/incident.js";
import { listJobs } from "../server/catalog.js";
import { primaryJobs, partnerJobs } from "../server/seed-data.js";

test("incident evidence identifies the seeded duplicate role", () => {
  const groups = getDuplicateListings([...primaryJobs, ...partnerJobs]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((job) => job.source), ["Direct", "Partner feed"]);
});

test("incident evidence resolves with the actual deduplicated catalog", () => {
  assert.deepEqual(getDuplicateListings(listJobs()), []);
});
