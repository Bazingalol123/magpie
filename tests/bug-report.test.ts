import { buildIssuePayload, validateBugReport } from "../base44/shared/bug-report.ts";
import { HttpError } from "../base44/shared/http.ts";

Deno.test("a valid report is trimmed and passed through", () => {
  const report = validateBugReport({
    title: "  Sidepanel shows the wrong summary  ",
    description: "  Steps: open a captured Item, the summary text is empty.  ",
  });
  assertEquals(report.title, "Sidepanel shows the wrong summary");
  assertEquals(report.description, "Steps: open a captured Item, the summary text is empty.");
});

Deno.test("a title below the minimum length is rejected", () => {
  const error = assertThrows(() => validateBugReport({ title: "hi", description: "Long enough description here." }));
  assertEquals(error.status, 400);
});

Deno.test("a description below the minimum length is rejected", () => {
  const error = assertThrows(() => validateBugReport({ title: "Valid title", description: "too short" }));
  assertEquals(error.status, 400);
});

Deno.test("a missing payload is rejected", () => {
  const error = assertThrows(() => validateBugReport(undefined));
  assertEquals(error.status, 400);
});

Deno.test("an overlong description is rejected rather than silently truncated", () => {
  const error = assertThrows(() => validateBugReport({ title: "Valid title", description: "x".repeat(5000) }));
  assertEquals(error.status, 400);
});

Deno.test("page_context is bounded and optional", () => {
  const withoutContext = validateBugReport({ title: "Valid title", description: "Long enough description here." });
  assertEquals(withoutContext.page_context, undefined);

  const withContext = validateBugReport({
    title: "Valid title",
    description: "Long enough description here.",
    page_context: "x".repeat(500),
  });
  assertEquals(withContext.page_context?.length, 200);
});

Deno.test("the GitHub issue payload includes reporter and context footer", () => {
  const input = validateBugReport({
    title: "Valid title",
    description: "Long enough description here.",
    page_context: "Collection: Apartments",
  });
  const issue = buildIssuePayload(input, { reporterEmail: "owner@example.com", pageContext: input.page_context });

  assertEquals(issue.title, "Valid title");
  assert(issue.body.startsWith("Long enough description here."), "expected the description first");
  assert(issue.body.includes("Reported by: owner@example.com"), "expected reporter identity in the footer");
  assert(issue.body.includes("Dashboard view: Collection: Apartments"), "expected page context in the footer");
});

Deno.test("the GitHub issue payload omits optional context lines when absent", () => {
  const input = validateBugReport({ title: "Valid title", description: "Long enough description here." });
  const issue = buildIssuePayload(input, { reporterEmail: "owner@example.com" });

  assert(!issue.body.includes("Dashboard view:"), "no page context should mean no page-context line");
  assert(!issue.body.includes("User agent:"), "no user agent should mean no user-agent line");
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(callback: () => unknown): HttpError {
  try {
    callback();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("Expected callback to throw");
}
