import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogSummary, getJobById, listJobs } from "../server/catalog.js";
import { primaryJobs, partnerJobs } from "../server/seed-data.js";

test("catalog deduplicates canonical roles with direct preference and stable ordering", () => {
  const jobs = listJobs();
  const copies = jobs.filter((job) => job.canonicalId === "role-101");
  assert.equal(copies.length, 1);
  assert.equal(copies[0], primaryJobs[0]);
  assert.equal(copies[0].source, "Direct");
  assert.equal(new Set(jobs.map((job) => job.canonicalId)).size, jobs.length);
  assert.deepEqual(jobs.map((job) => job.id), ["job-101", "job-102", "job-103", "job-104", "job-105", "job-106", "partner-779"]);
  assert.deepEqual(listJobs(), jobs);
  assert.equal(getJobById("job-101"), primaryJobs[0]);
  assert.equal(getJobById("partner-779"), partnerJobs[1]);
  assert.deepEqual(getCatalogSummary(), { visibleListings: 7, uniqueRoles: 7, partnerListings: 1 });
});

test("deduplicated results preserve normalized search, combined filters, and remote inclusion", () => {
  const cases = [
    [{ query: "  SENIOR PRODUCT ENGINEER  " }, ["job-101"]],
    [{ category: "Engineering" }, ["job-101", "job-104", "job-106"]],
    [{ location: "Zurich" }, ["job-101", "job-102", "job-103", "job-105", "job-106", "partner-779"]],
    [{ query: "engineer", category: "Engineering", location: "Bern" }, ["job-104", "job-106"]],
    [{ query: "Figma", category: "Product", location: "Zurich" }, ["partner-779"]],
    [{ query: "no such role" }, []],
  ];
  for (const [filters, expectedIds] of cases) {
    assert.deepEqual(listJobs(filters).map((job) => job.id), expectedIds);
  }
});

test("catalog can filter by query, category, and location", () => {
  assert.equal(listJobs({ query: "Security" }).length, 1);
  assert.equal(listJobs({ category: "Data" }).length, 1);
  assert.equal(listJobs({ location: "Lausanne" }).some((job) => job.id === "job-103"), true);
  assert.equal(listJobs({ location: "Bern" }).some((job) => job.id === "job-106"), true);
  assert.equal(getJobById("job-102")?.title, "Data Platform Engineer");
});
