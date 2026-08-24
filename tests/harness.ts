// Test harness shim: the kit's tests run on plain Node with no test-framework
// dependency, because a buyer must be able to verify this kit with nothing but
// Node installed. Authority: project rule: kits never require Bun.
//
// `node:test` supplies describe/test/before/after; it does NOT supply a
// Jest-style `expect`, so the five matchers these tests actually use are
// implemented here against `node:assert/strict`. Keep this surface small: if a
// test needs a sixth matcher, add it here rather than reaching for a framework.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

export { after as afterAll, before as beforeAll, describe, test } from "node:test";

interface Matchers {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  toMatch(expected: RegExp): void;
  toBeTruthy(): void;
  not: Omit<Matchers, "not">;
}

export function expect(actual: any): Matchers {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toContain(expected) {
      assert.ok(
        String(actual).includes(expected),
        `expected value to contain ${JSON.stringify(expected)}`,
      );
    },
    toMatch(expected) {
      assert.match(String(actual), expected);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected);
      },
      toContain(expected) {
        assert.ok(
          !String(actual).includes(expected),
          `expected value NOT to contain ${JSON.stringify(expected)}`,
        );
      },
      toMatch(expected) {
        assert.doesNotMatch(String(actual), expected);
      },
      toBeTruthy() {
        assert.ok(!actual);
      },
    },
  };
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Replaces Bun.spawn. Resolves with the exit code rather than rejecting, because
// these tests assert on non-zero codes as the expected outcome of a refusal.
export function runCommand(command: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? 0, stdout, stderr });
    });
  });
}
