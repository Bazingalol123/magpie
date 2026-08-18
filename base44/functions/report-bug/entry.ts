import { createClientFromRequest } from "npm:@base44/sdk";
import { requireUser } from "../../shared/auth.ts";
import { buildIssuePayload, validateBugReport } from "../../shared/bug-report.ts";
import { corsHeaders, errorResponse, HttpError, json, readJson, requirePost } from "../../shared/http.ts";

const ISSUES_URL = "https://api.github.com/repos/Bazingalol123/magpie/issues";

Deno.serve(async (req) => {
  try {
    if (requirePost(req)) return new Response(null, { status: 204, headers: corsHeaders });

    const base44 = createClientFromRequest(req);
    const user = await requireUser(base44);
    const body = await readJson(req);
    const input = validateBugReport(body);
    const userAgent = typeof (body as Record<string, unknown>).user_agent === "string"
      ? (body as Record<string, unknown>).user_agent as string
      : undefined;

    const token = Deno.env.get("GITHUB_ISSUES_TOKEN");
    if (!token) throw new HttpError(500, "Bug reporting is not configured");

    const issue = buildIssuePayload(input, {
      reporterEmail: user.email ?? user.id,
      pageContext: input.page_context,
      userAgent: userAgent?.slice(0, 200),
    });

    const response = await fetch(ISSUES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "magpie-bug-report",
      },
      body: JSON.stringify({ title: issue.title, body: issue.body }),
    });

    if (!response.ok) {
      console.error("GitHub issue creation failed", response.status, await response.text());
      throw new HttpError(502, "Could not reach GitHub right now. Try again in a moment.");
    }

    const created = await response.json();
    return json({ issue_url: created.html_url, issue_number: created.number });
  } catch (error) {
    return errorResponse(error, req);
  }
});
