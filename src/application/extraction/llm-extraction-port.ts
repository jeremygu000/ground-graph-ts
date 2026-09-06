import type { ResolutionBand } from "./llm-extraction.types";

export const DEFAULT_RESOLUTION_BANDS: ResolutionBand[] = [
  { name: "high_confidence", minConfidence: 0.9, maxConfidence: 1.0, action: "create_entity" },
  { name: "medium_confidence", minConfidence: 0.7, maxConfidence: 0.9, action: "link_entity" },
  { name: "low_confidence", minConfidence: 0.5, maxConfidence: 0.7, action: "review" },
  { name: "very_low_confidence", minConfidence: 0.0, maxConfidence: 0.5, action: "reject" },
];

export function classifyMention(
  confidence: number,
  bands: ResolutionBand[] = DEFAULT_RESOLUTION_BANDS,
): ResolutionBand {
  const band = bands.find((b) => confidence >= b.minConfidence && confidence < b.maxConfidence);
  return band ?? bands[bands.length - 1]!;
}
