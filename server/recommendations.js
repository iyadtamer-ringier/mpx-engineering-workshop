import { rankJobs } from "./matching.js";

export function getRecommendations(jobs, candidate) {
  return {
    scoredForCandidateId: candidate.id,
    jobs: rankJobs(jobs, candidate),
  };
}
