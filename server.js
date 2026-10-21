import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalogSummary, getJobById, listJobs } from "./server/catalog.js";
import { exportCandidatesCsv, getCandidateById, listCandidateSummaries } from "./server/candidates.js";
import { getRecommendations } from "./server/recommendations.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function sendCsv(response, csv) {
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": 'attachment; filename="jobmatch-applicants.csv"',
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(csv);
}

async function serveBuiltAsset(response, requestPath) {
  const distRoot = path.resolve(projectRoot, "dist");
  const candidate = path.resolve(distRoot, `.${requestPath === "/" ? "/index.html" : requestPath}`);

  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const asset = await readFile(candidate);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(candidate)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(asset);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    if (path.extname(requestPath)) {
      sendJson(response, 404, { error: "Asset not found" });
      return;
    }

    try {
      const template = await readFile(path.join(distRoot, "index.html"), "utf8");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(template);
    } catch {
      sendJson(response, 503, { error: "Production assets not found. Run npm run build first." });
    }
  }
}

export async function createApplicationServer({ dev = false } = {}) {
  let vite;

  function handleApi(response, pathname, searchParams) {
    if (pathname === "/api/health") {
      sendJson(response, 200, { status: "ok", application: "JobMatch Lab", data: "synthetic" });
      return;
    }

    if (pathname === "/api/overview") {
      sendJson(response, 200, {
        catalog: getCatalogSummary(),
        candidateCount: listCandidateSummaries().length,
      });
      return;
    }

    if (pathname === "/api/jobs") {
      sendJson(response, 200, {
        jobs: listJobs({
          query: searchParams.get("q") ?? "",
          category: searchParams.get("category") ?? "All",
          location: searchParams.get("location") ?? "All",
        }),
      });
      return;
    }

    if (pathname.startsWith("/api/jobs/")) {
      const job = getJobById(pathname.slice("/api/jobs/".length));
      sendJson(response, job ? 200 : 404, job ? { job } : { error: "Job not found" });
      return;
    }

    if (pathname === "/api/candidates") {
      sendJson(response, 200, { candidates: listCandidateSummaries() });
      return;
    }

    if (pathname === "/api/matches") {
      const candidate = getCandidateById(searchParams.get("candidateId"));
      if (!candidate) {
        sendJson(response, 404, { error: "Candidate not found" });
        return;
      }

      const result = getRecommendations(listJobs(), candidate);
      sendJson(response, 200, {
        candidateId: candidate.id,
        scoredForCandidateId: result.scoredForCandidateId,
        jobs: result.jobs,
      });
      return;
    }

    // Intentionally vulnerable workshop baseline:
    // a public request can read a full applicant record, including recruiter-only notes.
    if (pathname.startsWith("/api/candidates/")) {
      const candidate = getCandidateById(pathname.slice("/api/candidates/".length));
      sendJson(response, candidate ? 200 : 404, candidate ? { candidate } : { error: "Candidate not found" });
      return;
    }

    // Intentionally vulnerable workshop baseline: the export also lacks authorization.
    if (pathname === "/api/admin/candidates/export") {
      sendCsv(response, exportCandidatesCsv());
      return;
    }

    sendJson(response, 404, { error: "API route not found" });
  }

  const httpServer = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const { pathname, searchParams } = requestUrl;

    try {
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }
        handleApi(response, pathname, searchParams);
        return;
      }

      if (vite) {
        vite.middlewares(request, response, async () => {
          try {
            const source = await readFile(path.join(projectRoot, "index.html"), "utf8");
            const transformed = await vite.transformIndexHtml(request.url ?? "/", source);
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(transformed);
          } catch (error) {
            vite.ssrFixStacktrace(error);
            sendJson(response, 500, { error: "Unable to render the application shell." });
          }
        });
        return;
      }

      await serveBuiltAsset(response, pathname);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      console.error("Request failed:", error);
      sendJson(response, 500, { error: "The request could not be completed." });
    }
  });

  if (dev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: projectRoot,
      configFile: path.join(projectRoot, "vite.config.js"),
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
    });
  }

  return {
    server: httpServer,
    async close() {
      if (vite) await vite.close();
      if (httpServer.listening) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => error ? reject(error) : resolve());
        });
      }
    },
  };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  const port = Number(process.env.PORT || 4175);
  const host = process.env.HOST || "127.0.0.1";
  const application = await createApplicationServer({ dev: process.env.NODE_ENV !== "production" });

  application.server.listen(port, host, () => {
    console.log(`JobMatch Lab is ready at http://${host}:${port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await application.close();
      process.exit(0);
    });
  }
}
