const configUrl = new URL("../base44/agents/magpie_organizer.jsonc", import.meta.url);

Deno.test("Configured Magpie Agent has narrow authority and explicit memory policy", async () => {
  const config = JSON.parse(await Deno.readTextFile(configUrl));

  assertEquals(config.name, "magpie_organizer");
  assertEquals(config.memory_config, { enabled: false });
  assert(Array.isArray(config.tool_configs), "tool_configs must be an array");
  assert(
    config.tool_configs.every((tool: Record<string, unknown>) =>
      typeof tool.function_name === "string" && !("entity_name" in tool)
    ),
    "Agent must use function tools only",
  );
  assertEquals(
    config.tool_configs.map((tool: Record<string, string>) => tool.function_name),
    [
      "agent-workspace-context",
      "agent-compare-items",
      "agent-explain-organization",
      "agent-configure-monitoring",
    ],
  );
  assert(
    config.instructions.includes("Never claim that an action happened"),
    "Agent instructions must prevent imaginary mutations",
  );
  assert(
    config.instructions.includes("Do not probe neighboring IDs"),
    "Agent instructions must stop access probing",
  );
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}
