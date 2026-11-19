import "server-only";
import { z } from "zod";
import type { Election } from "../elections";
import { VisionExtraction } from "../schemas";
import { SYSTEM_PROMPT } from "./prompt";

/** DeepSeek-V4.1-Flash: the DeepSeek model that accepts images. Override with DEEPSEEK_VISION_MODEL. */
export const VISION_MODEL = process.env.DEEPSEEK_VISION_MODEL ?? "deepseek-flash";
const ENDPOINT = `${process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com"}/chat/completions`;
const TIMEOUT_MS = 90_000;

export class ExtractionError extends Error {
  /** true when only a new photo can help (the image itself is unusable). */
  constructor(message: string, readonly retake = false) {
    super(message);
  }
}

// DeepSeek has JSON mode but no strict schema mode, so the exact shape goes in the system
// prompt and every answer is validated with zod (one retry with the validation errors).
const SCHEMA = JSON.stringify(z.toJSONSchema(VisionExtraction));
const SYSTEM = `${SYSTEM_PROMPT}

Reply with one JSON object only, no prose and no code fences. It must match this JSON Schema exactly (every key present; use null where the schema allows it):
${SCHEMA}`;

type Message = { role: "system" | "user" | "assistant"; content: string | unknown[] };
type Completion = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string };
};

async function complete(messages: Message[]): Promise<{ text: string; finish: string | undefined }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 8000, response_format: { type: "json_object" }, messages }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Completion;
  if (res.status === 400 && /image/i.test(body.error?.message ?? ""))
    throw new ExtractionError("The photo couldn't be opened. Please take it again.", true);
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body.error?.message ?? res.statusText}`);
  const choice = body.choices?.[0];
  return { text: choice?.message?.content ?? "", finish: choice?.finish_reason };
}

function parse(text: string) {
  try {
    return VisionExtraction.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")));
  } catch {
    return null;
  }
}

/** Reads a result-sheet photo (the whole form, not just the figures) into strict, zod-validated JSON. Server only. */
export async function extractFromImage(jpegBase64: string, election: Election): Promise<VisionExtraction> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } },
        { type: "text", text: `Read this result sheet. The witness filed it under the ${election.replace("_", " ")} election.` },
      ],
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, finish } = await complete(messages);
    if (finish === "length") throw new ExtractionError("We couldn't read this sheet properly. We'll try again shortly.");
    if (finish === "content_filter") throw new ExtractionError("This photo couldn't be read. Please take it again.", true);

    const parsed = parse(text);
    if (parsed?.success) return parsed.data;

    // Show the model what was wrong and ask once more, without re-sending the image.
    const problems = parsed ? z.prettifyError(parsed.error) : "The reply was not valid JSON.";
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `That JSON does not match the schema:\n${problems}\nReply again with the corrected JSON object only.` },
    );
  }
  throw new ExtractionError("We couldn't read this sheet properly. We'll try again shortly.");
}
