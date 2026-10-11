import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { AiError, type AiProvider, type StructuredRequest, type StructuredResult, type TextRequest, type TextStream } from "./provider";

// Replays recorded responses from tests/fixtures/ai/<task>/<fixtureKey>.json
// (structured) or .txt (streamed text). Used by tests and E2E so nothing hits
// the real API. A missing fixture is an error, never a made-up answer.

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "ai");

export class MockProvider implements AiProvider {
  readonly name = "mock";

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const raw = await this.read(request.task, request.fixtureKey, "json");
    const parsed = request.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new AiError("invalid_output", `Fixture ${request.task}/${request.fixtureKey} doesn't match the schema.`);
    }
    return {
      data: parsed.data,
      usage: { model: "mock", inputTokens: Math.ceil(request.prompt.length / 4), outputTokens: Math.ceil(raw.length / 4) },
    };
  }

  streamText(request: TextRequest): TextStream {
    const textPromise = this.read(request.task, request.fixtureKey, "txt");
    async function* chunks() {
      const text = await textPromise;
      for (const word of text.split(/(?<=\s)/)) {
        if (request.signal?.aborted) throw new AiError("aborted", "Cancelled.");
        yield word;
      }
    }
    const done = textPromise.then((text) => ({
      model: "mock",
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
    }));
    done.catch(() => undefined);
    return { chunks: chunks(), done };
  }

  private async read(task: string, key: string, ext: "json" | "txt"): Promise<string> {
    if (!/^[a-z0-9_-]+$/i.test(key)) throw new AiError("missing_fixture", `Bad fixture key "${key}".`);
    try {
      return await readFile(join(FIXTURE_DIR, task, `${key}.${ext}`), "utf8");
    } catch {
      throw new AiError("missing_fixture", `No recorded AI response for ${task}/${key}.`);
    }
  }
}
