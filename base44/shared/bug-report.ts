import { HttpError } from "./http.ts";

const MIN_TITLE_LENGTH = 4;
const MAX_TITLE_LENGTH = 120;
const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 4000;

export type BugReportInput = {
  title: string;
  description: string;
  page_context?: string;
};

export type BugReportContext = {
  reporterEmail: string;
  pageContext?: string;
  userAgent?: string;
};

export function validateBugReport(payload: unknown): BugReportInput {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "A bug report requires a title and description");
  }

  const report = payload as Record<string, unknown>;
  const title = typeof report.title === "string" ? report.title.trim() : "";
  const description = typeof report.description === "string" ? report.description.trim() : "";

  if (title.length < MIN_TITLE_LENGTH || title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, `title must be between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters`);
  }
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new HttpError(400, `description must be between ${MIN_DESCRIPTION_LENGTH} and ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  return {
    title,
    description,
    page_context: typeof report.page_context === "string" ? report.page_context.trim().slice(0, 200) : undefined,
  };
}

export function buildIssuePayload(input: BugReportInput, context: BugReportContext) {
  const lines = [
    input.description,
    "",
    "---",
    `Reported by: ${context.reporterEmail}`,
  ];
  if (context.pageContext) lines.push(`Dashboard view: ${context.pageContext}`);
  if (context.userAgent) lines.push(`User agent: ${context.userAgent}`);
  lines.push(`Reported at: ${new Date().toISOString()}`);

  return {
    title: input.title,
    body: lines.join("\n"),
  };
}
