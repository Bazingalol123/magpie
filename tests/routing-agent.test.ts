import { requestAgentRoutingProposal } from "../base44/shared/classification.ts";

function response(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function toolCall(id: string, name: string, args: Record<string, unknown>) {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function context() {
  return {
    clip: {
      source_url: "https://camera.example/nikon-d500",
      raw_text: "Nikon D500 DSLR camera body",
      capture_mode: "element",
    },
    projects: [
      {
        id: "project-camera",
        owner_id: "owner-1",
        title: "Buying a new camera",
        goal: "Compare camera bodies",
        status: "active" as const,
      },
    ],
    collections: [],
  };
}

function submittedProposal() {
  return {
    project_assignment: "project",
    project_id: "project-camera",
    project_confidence: 0.97,
    project_candidates: [{ project_id: "project-camera", score: 0.97 }],
    outcome: "new",
    existing_collection_id: null,
    collection_name: "Cameras",
    collection_description: "Camera bodies being compared",
    summary: "A Nikon D500 DSLR camera body listed for comparison.",
    schema_fields: [
      { name: "model", label: "Model", type: "string" },
      { name: "camera_type", label: "Camera type", type: "string" },
    ],
    record_fields: [
      { name: "model", value: "Nikon D500" },
      { name: "camera_type", value: "DSLR" },
    ],
    confidence: 0.96,
    reason_codes: ["no_equivalent_collection"],
  };
}

function fakeBase44() {
  return {
    asServiceRole: {
      aiGateway: {
        connection: () => ({ baseURL: "https://gateway.example/v1", token: "test-token" }),
      },
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}\nexpected: ${right}\nactual:   ${left}`);
}

Deno.test("routing agent inspects bounded context then returns a proposal without writes", async () => {
  let calls = 0;
  const bodies: any[] = [];
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)));
    if (calls === 1) {
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          toolCall("call-projects", "list_projects", {}),
          toolCall("call-collections", "list_collections", { project_id: "project-camera" }),
        ],
      });
    }
    return response({
      role: "assistant",
      content: null,
      tool_calls: [toolCall("call-submit", "submit_route_proposal", submittedProposal())],
    });
  };

  const proposal: any = await requestAgentRoutingProposal(
    fakeBase44(),
    context(),
    fetchImpl as typeof fetch,
  );

  assertEquals(calls, 2, "expected one inspection and one submit step");
  assertEquals(proposal.project_id, "project-camera", "expected Project proposal");
  assertEquals(proposal.schema[0].name, "model", "expected canonical Collection schema");
  assertEquals(proposal.fields.model, "Nikon D500", "expected extracted visible value");
  assertEquals(proposal.summary, "A Nikon D500 DSLR camera body listed for comparison.", "expected summary to carry through");
  const toolMessages = bodies[1].messages.filter((message: any) => message.role === "tool");
  assert(toolMessages.some((message: any) => message.name === "list_projects"), "Projects tool result missing");
  assert(toolMessages.some((message: any) => message.name === "list_collections"), "Collections tool result missing");
});

Deno.test("finish tool is rejected until both read tools were used", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return response({
        role: "assistant",
        content: null,
        tool_calls: [toolCall("early-submit", "submit_route_proposal", submittedProposal())],
      });
    }
    if (calls === 2) {
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          toolCall("projects", "list_projects", {}),
          toolCall("collections", "list_collections", { project_id: "project-camera" }),
        ],
      });
    }
    return response({
      role: "assistant",
      content: null,
      tool_calls: [toolCall("final-submit", "submit_route_proposal", submittedProposal())],
    });
  };

  const proposal: any = await requestAgentRoutingProposal(
    fakeBase44(),
    context(),
    fetchImpl as typeof fetch,
  );
  assertEquals(calls, 3, "early submit must not finish the loop");
  assertEquals(proposal.project_assignment, "project", "expected final accepted proposal");
});

Deno.test("inspection and submit in the same step cannot bypass reading tool results", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return response({
        role: "assistant",
        content: null,
        tool_calls: [
          toolCall("projects", "list_projects", {}),
          toolCall("collections", "list_collections", { project_id: "project-camera" }),
          toolCall("early-submit", "submit_route_proposal", submittedProposal()),
        ],
      });
    }
    return response({
      role: "assistant",
      content: null,
      tool_calls: [toolCall("final-submit", "submit_route_proposal", submittedProposal())],
    });
  };

  const proposal: any = await requestAgentRoutingProposal(
    fakeBase44(),
    context(),
    fetchImpl as typeof fetch,
  );
  assertEquals(calls, 2, "submit must happen after inspection results are visible");
  assertEquals(proposal.project_id, "project-camera", "expected final accepted proposal");
});

Deno.test("routing agent stops after four metered steps", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response({
      role: "assistant",
      content: null,
      tool_calls: [toolCall(`projects-${calls}`, "list_projects", {})],
    });
  };

  let error: unknown;
  try {
    await requestAgentRoutingProposal(fakeBase44(), context(), fetchImpl as typeof fetch);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof Error, "step exhaustion must reject");
  assertEquals(calls, 4, "agent must have a hard four-step limit");
});
