import type { BaselineReport } from "./evaluation.types";

export function generateMarkdownReport(report: BaselineReport): string {
  const lines: string[] = [];

  lines.push(`# Evaluation Report: ${report.datasetVersion}`);
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Mode:** ${report.evaluationMode}`);
  lines.push(`**Version:** ${report.version}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Cases | ${report.summary.totalCases} |`);
  lines.push(`| Completed | ${report.summary.completedCases} |`);
  lines.push(`| Failed | ${report.summary.failedCases} |`);
  lines.push(`| Skipped | ${report.summary.skippedCases} |`);
  lines.push("");

  if (report.summary.retrievalRecall) {
    lines.push(`## Retrieval Recall`);
    lines.push("");
    lines.push(`| Statistic | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Average | ${report.summary.retrievalRecall.average.toFixed(3)} |`);
    lines.push(`| P50 | ${report.summary.retrievalRecall.p50.toFixed(3)} |`);
    lines.push(`| P95 | ${report.summary.retrievalRecall.p95.toFixed(3)} |`);
    lines.push("");
  }

  if (report.summary.answerCorrectness) {
    lines.push(`## Answer Correctness`);
    lines.push("");
    lines.push(`| Statistic | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Average | ${report.summary.answerCorrectness.average.toFixed(3)} |`);
    lines.push(`| P50 | ${report.summary.answerCorrectness.p50.toFixed(3)} |`);
    lines.push(`| P95 | ${report.summary.answerCorrectness.p95.toFixed(3)} |`);
    lines.push("");
  }

  if (report.summary.citationCorrectness) {
    lines.push(`## Citation Correctness`);
    lines.push("");
    lines.push(`| Statistic | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Average | ${report.summary.citationCorrectness.average.toFixed(3)} |`);
    lines.push(`| P50 | ${report.summary.citationCorrectness.p50.toFixed(3)} |`);
    lines.push(`| P95 | ${report.summary.citationCorrectness.p95.toFixed(3)} |`);
    lines.push("");
  }

  if (report.summary.refusalCorrectness) {
    lines.push(`## Refusal Correctness`);
    lines.push("");
    lines.push(`Correct: ${report.summary.refusalCorrectness.percentage.toFixed(1)}%`);
    lines.push("");
  }

  if (report.summary.aclLeakage) {
    lines.push(`## ACL Leakage`);
    lines.push("");
    lines.push(`Leaked: ${report.summary.aclLeakage.percentage.toFixed(1)}%`);
    lines.push("");
  }

  if (report.summary.latencyMs) {
    lines.push(`## Latency`);
    lines.push("");
    lines.push(`| Percentile | Value |`);
    lines.push(`|------------|-------|`);
    lines.push(`| P50 | ${report.summary.latencyMs.p50}ms |`);
    lines.push(`| P95 | ${report.summary.latencyMs.p95}ms |`);
    lines.push("");
  }

  if (report.summary.totalCostUSD !== null) {
    lines.push(`## Cost`);
    lines.push("");
    lines.push(`Total: $${report.summary.totalCostUSD.toFixed(4)}`);
    lines.push("");
  }

  lines.push(`## Model Configuration`);
  lines.push("");
  lines.push(`| Component | Value |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Embedding Model | ${report.embeddingModel ?? "N/A"} |`);
  lines.push(`| Embedding Dimension | ${report.embeddingDimension ?? "N/A"} |`);
  lines.push(`| Reranker Model | ${report.rerankerModel ?? "N/A"} |`);
  lines.push(`| Generator Model | ${report.generatorModel ?? "N/A"} |`);
  lines.push(`| Index Version | ${report.indexVersion ?? "N/A"} |`);
  lines.push("");

  const failedCases = report.cases.filter((c) => c.status === "failed");
  if (failedCases.length > 0) {
    lines.push(`## Failed Cases`);
    lines.push("");
    for (const c of failedCases) {
      lines.push(`### ${c.caseId}`);
      lines.push("");
      lines.push(`**Error:** ${c.error ?? "Unknown error"}`);
      lines.push("");
    }
  }

  const skippedCases = report.cases.filter((c) => c.status === "skipped");
  if (skippedCases.length > 0) {
    lines.push(`## Skipped Cases`);
    lines.push("");
    for (const c of skippedCases) {
      lines.push(`- ${c.caseId}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
