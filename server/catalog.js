import { primaryJobs, partnerJobs } from "./seed-data.js";

export function listJobs({ query = "", category = "All", location = "All" } = {}) {
  // Direct listings come first; keep the first record for each canonical role.
  const seenRoles = new Set();
  const jobs = [...primaryJobs, ...partnerJobs].filter((job) => {
    if (seenRoles.has(job.canonicalId)) return false;
    seenRoles.add(job.canonicalId);
    return true;
  });
  const normalizedQuery = query.trim().toLowerCase();

  return jobs.filter((job) => {
    const matchesQuery = !normalizedQuery || [
      job.title,
      job.company,
      job.description,
      ...job.skills,
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
    const matchesCategory = category === "All" || job.category === category;
    const matchesLocation = location === "All" || job.location === location || job.workMode === "Remote";
    return matchesQuery && matchesCategory && matchesLocation;
  });
}

export function getJobById(id) {
  return listJobs().find((job) => job.id === id) ?? null;
}

export function getCatalogSummary() {
  const jobs = listJobs();
  return {
    visibleListings: jobs.length,
    uniqueRoles: new Set(jobs.map((job) => job.canonicalId)).size,
    partnerListings: jobs.filter((job) => job.source === "Partner feed").length,
  };
}
