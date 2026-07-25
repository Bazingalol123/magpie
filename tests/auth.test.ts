import { requireUser } from "../base44/shared/auth.ts";
import { HttpError } from "../base44/shared/http.ts";

Deno.test("requireUser returns the authenticated Base44 user", async () => {
  const user = await requireUser({ auth: { me: async () => ({ id: "owner-1" }) } });
  assertEquals(user.id, "owner-1");
});

Deno.test("requireUser maps missing authentication to a stable 401", async () => {
  const error = await assertRejects(
    () => requireUser({ auth: { me: async () => null } }),
    HttpError,
  );
  assertEquals(error.status, 401);
});

Deno.test("requireUser maps the hosted Base44 auth exception to 401", async () => {
  const error = await assertRejects(
    () => requireUser({
      auth: {
        me: async () => {
          throw new Error("Authentication required to view users");
        },
      },
    }),
    HttpError,
  );
  assertEquals(error.status, 401);
});

Deno.test("requireUser preserves unrelated SDK failures", async () => {
  const failure = new Error("Gateway unavailable");
  const error = await assertRejects(
    () => requireUser({ auth: { me: async () => { throw failure; } } }),
    Error,
  );
  assert(error === failure, "Unrelated failures must not be disguised as authentication errors");
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values differ") {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

async function assertRejects<T extends Error>(
  callback: () => Promise<unknown>,
  errorType: new (...args: any[]) => T,
): Promise<T> {
  try {
    await callback();
  } catch (error) {
    if (error instanceof errorType) return error;
    throw error;
  }
  throw new Error("Expected promise to reject");
}
