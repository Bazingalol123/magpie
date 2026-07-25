export type RoutingProject = {
  id: string;
  owner_id: string;
  title?: string;
  goal?: string;
  constraints_json?: string;
  status?: "active" | "paused" | "decided" | "archived";
};

export type ProjectReasonCode =
  | "explicit_project_context"
  | "auto_project_match"
  | "no_project_match"
  | "ambiguous_projects"
  | "low_project_confidence"
  | "invalid_project_candidate";

export type ProjectRoutingResult = {
  outcome: "project" | "global" | "review";
  source: "explicit" | "agent" | "none";
  project?: RoutingProject;
  confidence: number;
  reason_codes: ProjectReasonCode[];
  candidate_scores: Array<{ project_id: string; score: number }>;
};

export type ProjectRoutingInput = {
  ownerId: string;
  explicitProject?: RoutingProject | null;
  projects: RoutingProject[];
  proposal?: unknown;
};

const AUTO_PROJECT_THRESHOLD = 0.9;
const AUTO_PROJECT_MARGIN = 0.15;

export function resolveProjectRouting(input: ProjectRoutingInput): ProjectRoutingResult {
  if (input.explicitProject) {
    const valid = input.explicitProject.owner_id === input.ownerId &&
      input.explicitProject.status === "active";
    return valid
      ? {
        outcome: "project",
        source: "explicit",
        project: input.explicitProject,
        confidence: 1,
        reason_codes: ["explicit_project_context"],
        candidate_scores: [],
      }
      : review(0, ["invalid_project_candidate"], []);
  }

  const parsed = objectValue(input.proposal);
  const assignment = parsed?.project_assignment;
  const eligible = input.projects.filter((project) =>
    project.owner_id === input.ownerId && project.status === "active"
  );
  const rawCandidates = normalizeCandidates(parsed?.project_candidates);
  const candidates = rawCandidates.filter((candidate) =>
    eligible.some((project) => project.id === candidate.project_id)
  );

  // Backward compatibility for existing proposal providers and fixtures. Before
  // Project-aware routing, missing Project metadata meant global organization.
  if (assignment === undefined) {
    return global(0, []);
  }
  if (assignment === "global") {
    return global(clamp(parsed?.project_confidence), candidates);
  }

  if (assignment === "review") {
    return review(clamp(parsed?.project_confidence), ["ambiguous_projects"], candidates);
  }
  if (assignment !== "project" || typeof parsed?.project_id !== "string") {
    return review(0, ["invalid_project_candidate"], candidates);
  }

  const project = eligible.find((candidate) => candidate.id === parsed.project_id);
  if (!project) {
    return review(clamp(parsed.project_confidence), ["invalid_project_candidate"], candidates);
  }

  if (rawCandidates.length !== candidates.length) {
    return review(clamp(parsed.project_confidence), ["invalid_project_candidate"], candidates);
  }

  const selected = candidates.find((candidate) => candidate.project_id === project.id);
  const confidence = Math.min(clamp(parsed.project_confidence), selected?.score ?? 0);
  if (!selected || confidence < AUTO_PROJECT_THRESHOLD) {
    return review(confidence, ["low_project_confidence"], candidates);
  }

  const runnerUp = candidates
    .filter((candidate) => candidate.project_id !== project.id)
    .reduce((highest, candidate) => Math.max(highest, candidate.score), 0);
  if (selected.score - runnerUp < AUTO_PROJECT_MARGIN) {
    return review(confidence, ["ambiguous_projects"], candidates);
  }

  return {
    outcome: "project",
    source: "agent",
    project,
    confidence,
    reason_codes: ["auto_project_match"],
    candidate_scores: candidates,
  };
}

function normalizeCandidates(value: unknown) {
  if (!Array.isArray(value)) return [];
  const scores = new Map<string, number>();
  for (const item of value.slice(0, 10)) {
    const candidate = objectValue(item);
    if (typeof candidate?.project_id !== "string" || candidate.project_id.length > 120) continue;
    const score = clamp(candidate.score);
    scores.set(candidate.project_id, Math.max(scores.get(candidate.project_id) ?? 0, score));
  }
  return [...scores.entries()]
    .map(([project_id, score]) => ({ project_id, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value.replace(/^```json\s*|\s*```$/gi, ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function clamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function global(
  confidence: number,
  candidates: Array<{ project_id: string; score: number }>,
): ProjectRoutingResult {
  return {
    outcome: "global",
    source: "none",
    confidence,
    reason_codes: ["no_project_match"],
    candidate_scores: candidates,
  };
}

function review(
  confidence: number,
  reason_codes: ProjectReasonCode[],
  candidate_scores: Array<{ project_id: string; score: number }>,
): ProjectRoutingResult {
  return {
    outcome: "review",
    source: "none",
    confidence,
    reason_codes,
    candidate_scores,
  };
}
