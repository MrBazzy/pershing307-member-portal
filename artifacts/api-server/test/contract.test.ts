import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";
import request from "supertest";
import app from "../src/app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = path.resolve(__dirname, "../../../lib/api-spec/openapi.yaml");

// The base path the express app mounts the router under. The generated client
// prepends this same prefix to every operation path (orval `baseUrl: "/api"`).
const API_BASE = "/api";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface Operation {
  method: HttpMethod;
  specPath: string;
  url: string;
}

function loadOperations(): Operation[] {
  const doc = parse(readFileSync(OPENAPI_PATH, "utf8")) as {
    paths?: Record<string, Record<string, unknown>>;
  };
  const paths = doc.paths ?? {};
  const ops: Operation[] = [];

  for (const [specPath, item] of Object.entries(paths)) {
    // Replace `{param}` placeholders with a syntactically valid dummy value.
    const concretePath = specPath.replace(/\{[^}]+\}/g, "00000000-0000-0000-0000-000000000000");
    for (const method of HTTP_METHODS) {
      if (item[method]) {
        ops.push({ method, specPath, url: `${API_BASE}${concretePath}` });
      }
    }
  }
  return ops;
}

const operations = loadOperations();

describe("API contract: every generated-client path exists on the server", () => {
  it("loads operations from the OpenAPI spec", () => {
    expect(operations.length).toBeGreaterThan(0);
  });

  it.each(operations)("$method $specPath is mounted (no unmatched-route 404)", async (op) => {
    const res = await request(app)[op.method](op.url);

    // Express's default handler answers an unmatched route with a 404 HTML page
    // containing `Cannot <METHOD> <path>`. A handler that ran but found no
    // resource returns a JSON 404 instead — that still proves the route exists.
    const isUnmountedRoute =
      res.status === 404 && /Cannot\s+(GET|POST|PUT|PATCH|DELETE)\s/i.test(res.text ?? "");

    expect(
      isUnmountedRoute,
      `${op.method.toUpperCase()} ${op.url} returned an unmatched-route 404 — ` +
        `the server has no handler for a path the generated client calls.`,
    ).toBe(false);
  });
});
