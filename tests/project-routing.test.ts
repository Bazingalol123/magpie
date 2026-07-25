import { resolveProjectRouting } from "../base44/shared/project-routing.ts";

const cameraProject = {
  id: "project-camera",
  owner_id: "owner-1",
  title: "Buying a new camera",
  status: "active" as const,
};
const travelProject = {
  id: "project-travel",
  owner_id: "owner-1",
  title: "Trip to Japan",
  status: "active" as const,
};

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("explicit Project always wins over the agent proposal", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    explicitProject: cameraProject,
    projects: [cameraProject, travelProject],
    proposal: {
      project_assignment: "project",
      project_id: "project-travel",
      project_confidence: 1,
      project_candidates: [{ project_id: "project-travel", score: 1 }],
    },
  });
  assertEquals(result.outcome, "project", "expected Project context");
  assertEquals(result.project?.id, "project-camera", "explicit context must win");
  assertEquals(result.source, "explicit", "expected explicit audit source");
});

Deno.test("clear camera match assigns the active owner Project", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject, travelProject],
    proposal: {
      project_assignment: "project",
      project_id: "project-camera",
      project_confidence: 0.96,
      project_candidates: [
        { project_id: "project-camera", score: 0.96 },
        { project_id: "project-travel", score: 0.2 },
      ],
    },
  });
  assertEquals(result.outcome, "project", "expected automatic Project");
  assertEquals(result.project?.id, "project-camera", "expected camera Project");
  assertEquals(result.source, "agent", "expected agent audit source");
});

Deno.test("proposal without Project metadata preserves global V3 behavior", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject],
    proposal: { outcome: "new", collection_name: "Cameras" },
  });
  assertEquals(result.outcome, "global", "legacy proposal must remain global");
});

Deno.test("confident no-match remains global", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject],
    proposal: {
      project_assignment: "global",
      project_confidence: 0.93,
      project_candidates: [{ project_id: "project-camera", score: 0.1 }],
    },
  });
  assertEquals(result.outcome, "global", "no match should remain global");
});

Deno.test("score below threshold enters review", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject],
    proposal: {
      project_assignment: "project",
      project_id: "project-camera",
      project_confidence: 0.89,
      project_candidates: [{ project_id: "project-camera", score: 0.89 }],
    },
  });
  assertEquals(result.outcome, "review", "low confidence must not assign");
  assertEquals(result.reason_codes, ["low_project_confidence"], "expected threshold reason");
});

Deno.test("small lead over another Project enters review", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject, travelProject],
    proposal: {
      project_assignment: "project",
      project_id: "project-camera",
      project_confidence: 0.94,
      project_candidates: [
        { project_id: "project-camera", score: 0.94 },
        { project_id: "project-travel", score: 0.83 },
      ],
    },
  });
  assertEquals(result.outcome, "review", "small margin must not assign");
  assertEquals(result.reason_codes, ["ambiguous_projects"], "expected ambiguity reason");
});

Deno.test("inactive or unknown Project ID is rejected", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [{ ...cameraProject, status: "archived" }],
    proposal: {
      project_assignment: "project",
      project_id: "project-camera",
      project_confidence: 0.99,
      project_candidates: [{ project_id: "project-camera", score: 0.99 }],
    },
  });
  assertEquals(result.outcome, "review", "inactive Project must not assign");
  assertEquals(result.reason_codes, ["invalid_project_candidate"], "expected invalid candidate reason");
});

Deno.test("candidate list cannot smuggle a non-owner Project", () => {
  const result = resolveProjectRouting({
    ownerId: "owner-1",
    projects: [cameraProject],
    proposal: {
      project_assignment: "project",
      project_id: "project-camera",
      project_confidence: 0.99,
      project_candidates: [
        { project_id: "project-camera", score: 0.99 },
        { project_id: "project-other-owner", score: 0.1 },
      ],
    },
  });
  assertEquals(result.outcome, "review", "unknown candidate IDs must invalidate assignment");
  assertEquals(result.reason_codes, ["invalid_project_candidate"], "expected invalid candidate reason");
});
