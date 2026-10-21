import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, rankJobs } from "../server/matching.js";
import { primaryJobs } from "../server/seed-data.js";
import { getCandidateById } from "../server/candidates.js";

const hybridJob = { location: "Bern", workMode: "Hybrid" };
const zurichCandidate = { location: "Zurich" };

function match(skills, candidateSkills, overrides = {}) {
  return scoreJob({ ...hybridJob, skills, ...overrides }, { ...zurichCandidate, skills: candidateSkills });
}

test("Maya can reuse React for a related requirement without inflating exact matches", () => {
  const result = scoreJob(primaryJobs[0], getCandidateById("candidate-001"));
  assert.equal(result.score, 92);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matched), [true, true, true, false]);
  assert.equal(result.locationFits, true);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "exact", "exact", "related"]);
  assert.deepEqual(result.skillBreakdown.map((item) => item.contribution), [1, 1, 1, 0.6]);
});

test("exact matches preserve full credit and normalization", () => {
  const result = match([" React "], [" react "]);
  assert.equal(result.score, 80);
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(result.skillBreakdown[0], {
    skill: " React ", matched: true, matchType: "exact", contribution: 1, reason: "Exact skill",
  });
  assert.equal(match(["React"], ["React"], { location: "Zurich" }).score, 100);
});

test("direct related skills contribute 60 percent in either direction", () => {
  for (const [required, candidateSkill] of [
    ["Frontend development", "React"],
    ["React", "Frontend development"],
    [" frontend DEVELOPMENT ", " REACT "],
  ]) {
    const result = match([required], [candidateSkill]);
    assert.equal(result.score, 48);
    assert.equal(result.matchedCount, 0);
    assert.deepEqual(result.skillBreakdown[0], {
      skill: required, matched: false, matchType: "related", contribution: 0.6,
      candidateSkill: candidateSkill.trim(),
      reason: `Related skill: ${candidateSkill.trim()} → ${required} (60%)`,
    });
  }
});

test("unrelated, unknown, and sibling skills stay missing", () => {
  for (const [required, candidateSkill] of [["React", "SQL"], ["Unknown skill", "React"], ["Python", "TypeScript"]]) {
    const result = match([required], [candidateSkill]);
    assert.equal(result.score, 0);
    assert.deepEqual(result.skillBreakdown[0], {
      skill: required, matched: false, matchType: "missing", contribution: 0, reason: "Not found",
    });
  }
});

test("exact evidence wins and multiple related skills never stack", () => {
  assert.equal(match(["Programming languages"], ["Python", "TypeScript"]).score, 48);
  const result = match(["Programming languages"], ["Python", "TypeScript", "Programming languages"]);
  assert.equal(result.score, 80);
  assert.equal(result.skillBreakdown[0].matchType, "exact");
});

test("empty skills, remote location credit, and mixed scores remain explainable and bounded", () => {
  assert.equal(match([], []).score, 0);
  assert.equal(match([], [], { workMode: "Remote" }).score, 20);
  assert.equal(match(["React"], []).score, 0);
  assert.equal(match(["Frontend development"], ["React"], { workMode: "Remote" }).score, 68);
  const result = match(["React", "Frontend development", "SQL"], ["React"]);
  assert.equal(result.score, 43);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "related", "missing"]);
  assert.equal(result.score, Math.round(80 * result.skillBreakdown.reduce((sum, item) => sum + item.contribution, 0) / result.requiredCount));
});

test("scores and related evidence are deterministic across skill order and repeated calls", () => {
  const expected = match(["Programming languages"], ["Python", "TypeScript"]);
  for (const skills of [["TypeScript", "Python"], ["Python", "Python", "TypeScript"]]) {
    assert.deepEqual(match(["Programming languages"], skills), expected);
  }
  assert.deepEqual(match(["Programming languages"], ["Python", "TypeScript"]), expected);
});

test("equal scores retain the existing title tie-breaker", () => {
  const jobs = ["Zulu", "Alpha"].map((title) => ({ ...hybridJob, title, skills: ["Frontend development"] }));
  const ranked = rankJobs(jobs, { ...zurichCandidate, skills: ["React"] });
  assert.deepEqual(ranked.map((job) => job.title), ["Alpha", "Zulu"]);
  assert.deepEqual(jobs.map((job) => job.title), ["Zulu", "Alpha"]);
});

test("remote roles count as a location fit and ranking is stable", () => {
  const candidate = getCandidateById("candidate-003");
  const ranked = rankJobs(primaryJobs, candidate);
  assert.equal(ranked[0].id, "job-103");
  assert.equal(ranked[0].match.locationFits, true);
});
