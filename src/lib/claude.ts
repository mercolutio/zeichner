import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
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

export async function analyzeFloorplan(files: FileInput[]) {
  const { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_USER_PROMPT } = await import(
    "./prompts"
  );

  const content: Anthropic.Messages.ContentBlockParam[] = [];

  for (const file of files) {
    content.push(buildContentBlock(file) as Anthropic.Messages.ContentBlockParam);
  }

  const fileList = files.map((f, i) => `Bild ${i + 1}: ${f.filename}`).join("\n");
  content.push({
    type: "text",
    text: `${ANALYSIS_USER_PROMPT}

Hochgeladene Dateien (${files.length} Stück):
${fileList}

WICHTIG:
- Analysiere ALLE Bilder zusammen als EIN Gebäude
- Jedes Bild zeigt ein ANDERES STOCKWERK — erkenne anhand der Räume welches (z.B. Heizungsraum = Keller, Küche/Wohnzimmer = EG, Schlafzimmer/Kinderzimmer = OG)
- Lies ALLE sichtbaren Maße und Flächenangaben EXAKT aus den Bildern ab
- Erstelle für JEDES hochgeladene Bild einen eigenen Floor-Eintrag
- Die crossSection muss ALLE Stockwerke enthalten`,
  });

  // Use streaming for Opus — required for long requests
  const stream = await client.messages.stream({
    model: "claude-opus-4-20250514",
    max_tokens: 16384,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Keine Textantwort von Claude erhalten");
  }

  return JSON.parse(textBlock.text);
}
