import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY?.replace(/\s/g, ""),
});

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
type DocumentMediaType = "application/pdf";
export type SupportedMediaType = ImageMediaType | DocumentMediaType;

export interface FileInput {
  base64: string;
  mediaType: SupportedMediaType;
  filename: string;
}

function buildContentBlock(file: FileInput) {
  if (file.mediaType === "application/pdf") {
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: file.base64,
      },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: file.mediaType as ImageMediaType,
      data: file.base64,
    },
  };
}

/** Extract JSON from Claude's response, handling markdown fences and extra text */
function extractJSON(text: string): unknown {
  // 1. Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  // 2. Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // continue
    }
  }

  // 3. Find first { and last }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // continue
    }
  }

  throw new Error(
    `Konnte kein JSON aus der Antwort extrahieren. Anfang der Antwort: "${text.slice(0, 300)}"`
  );
}

/** Extract text from a Claude response, skipping thinking blocks */
function getResponseText(
  content: Anthropic.Messages.ContentBlock[]
): string {
  const textBlock = content.find(
    (block): block is Anthropic.Messages.TextBlock => block.type === "text"
  );
  if (!textBlock) {
    throw new Error("Keine Textantwort von Claude erhalten");
  }
  return textBlock.text;
}

export async function analyzeFloorplan(
  files: FileInput[],
  zodSchema?: z.ZodType
) {
  const { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_USER_PROMPT } = await import(
    "./prompts"
  );

  const imageContent: Anthropic.Messages.ContentBlockParam[] = files.map(
    (file) => buildContentBlock(file) as Anthropic.Messages.ContentBlockParam
  );

  const fileList = files
    .map((f, i) => `Bild ${i + 1}: ${f.filename}`)
    .join("\n");

  const userText = `${ANALYSIS_USER_PROMPT}

Hochgeladene Dateien (${files.length} Stück):
${fileList}

WICHTIG:
- Analysiere ALLE Bilder zusammen als EIN Gebäude
- Jedes Bild zeigt ein ANDERES STOCKWERK — erkenne anhand der Räume welches (z.B. Heizungsraum = Keller, Küche/Wohnzimmer = EG, Schlafzimmer/Kinderzimmer = OG)
- Lies ALLE sichtbaren Maße und Flächenangaben EXAKT aus den Bildern ab
- Erstelle für JEDES hochgeladene Bild einen eigenen Floor-Eintrag
- Die crossSection muss ALLE Stockwerke enthalten`;

  const baseContent: Anthropic.Messages.ContentBlockParam[] = [
    ...imageContent,
    { type: "text", text: userText },
  ];

  const MAX_ATTEMPTS = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      let responseText: string;

      if (attempt === 0) {
        // First attempt: low temperature for consistency
        const stream = await client.messages.stream({
          model: "claude-opus-4-20250514",
          max_tokens: 16384,
          temperature: 0.2,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: baseContent }],
        });
        const response = await stream.finalMessage();
        responseText = getResponseText(response.content);
      } else {
        // Retry with error feedback
        const retryMessage =
          `Dein vorheriger Versuch hatte einen Fehler: ${lastError?.message}\n\n` +
          `Bitte korrigiere das und antworte NUR mit validem JSON. Kein Markdown, keine Erklärungen.`;

        const stream = await client.messages.stream({
          model: "claude-opus-4-20250514",
          max_tokens: 16384,
          temperature: 0.2,
          system: ANALYSIS_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: baseContent },
            {
              role: "user",
              content: [{ type: "text", text: retryMessage }],
            },
          ],
        });
        const response = await stream.finalMessage();
        responseText = getResponseText(response.content);
      }

      const parsed = extractJSON(responseText);

      // Validate with Zod if schema provided
      if (zodSchema) {
        zodSchema.parse(parsed);
      }

      return parsed;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));

      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map(
            (i) => `${i.path.join(".")}: ${i.message}`
          )
          .join("; ");
        lastError = new Error(`Validierungsfehler: ${issues}`);
      }

      // Don't retry on non-recoverable errors (auth, rate limit, etc.)
      if (
        error instanceof Anthropic.APIError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw error;
      }

      if (attempt === MAX_ATTEMPTS - 1) {
        throw lastError;
      }

      console.warn(
        `Analyse-Versuch ${attempt + 1} fehlgeschlagen, retry: ${lastError.message}`
      );
    }
  }

  throw lastError;
}
