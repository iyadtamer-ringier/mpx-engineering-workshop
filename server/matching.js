import { broaderSkills } from "./skills.js";

function normalized(value) {
  return value.trim().toLowerCase();
}

// Only explicit edges count, in either direction; siblings are not related.
const relatedSkills = new Map();
for (const [specific, broader] of Object.entries(broaderSkills)) {
  for (const parent of broader) {
    for (const [from, to] of [[specific, parent], [parent, specific]]) {
      const key = normalized(from);
      if (!relatedSkills.has(key)) relatedSkills.set(key, new Set());
      relatedSkills.get(key).add(normalized(to));
    }
  }
}

export function scoreJob(job, candidate) {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  // Sorting makes equally strong evidence independent of candidate skill order.
  const evidenceSkills = [...new Set(candidate.skills.map((skill) => skill.trim()))].sort();
  const skillBreakdown = job.skills.map((skill) => {
    const required = normalized(skill);
    if (candidateSkills.has(required)) {
      return { skill, matched: true, matchType: "exact", contribution: 1, reason: "Exact skill" };
    }

    const candidateSkill = evidenceSkills.find((item) => relatedSkills.get(required)?.has(normalized(item)));
    if (candidateSkill !== undefined) {
      return {
        skill,
        matched: false,
        matchType: "related",
        contribution: 0.6,
        candidateSkill,
        reason: `Related skill: ${candidateSkill} → ${skill} (60%)`,
      };
    }

    return { skill, matched: false, matchType: "missing", contribution: 0, reason: "Not found" };
  });
  const matchedCount = skillBreakdown.filter((item) => item.matched).length;
  const contribution = skillBreakdown.reduce((total, item) => total + item.contribution, 0);
  const skillScore = job.skills.length ? contribution / job.skills.length : 0;
  const locationFits = job.location === candidate.location || job.workMode === "Remote";
  const score = Math.round(skillScore * 80 + (locationFits ? 20 : 0));

  return {
    score,
    matchedCount,
    requiredCount: job.skills.length,
    locationFits,
    skillBreakdown,
  };
}

export function rankJobs(jobs, candidate) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, candidate) }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
}
