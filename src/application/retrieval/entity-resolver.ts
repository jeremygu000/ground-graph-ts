import type { Result } from "../../domain/result";
import { success, failure } from "../../domain/result";
import { ValidationError } from "../../domain/errors";

export interface ResolvedEntity {
  entityId: string;
  canonicalName: string;
  entityType: string;
  confidence: number;
  mentionText: string;
}

export interface EntityResolutionResult {
  entities: ResolvedEntity[];
  queryPlan: QueryPlan;
}

export interface QueryPlan {
  strategy: "vector" | "fulltext" | "graph" | "hybrid";
  seedEntityIds: string[];
  relatedEntityIds: string[];
  budget: {
    vectorResults: number;
    fulltextResults: number;
    graphResults: number;
  };
  reasoning: string;
}

export interface EntityResolverPort {
  resolveEntitiesFromQuery(
    question: string,
    tenantId: string,
  ): Promise<Result<EntityResolutionResult>>;

  extractEntityMentions(question: string): Array<{ text: string; start: number; end: number }>;
}

export interface EntityResolverDependencies {
  entityRepository: EntityRepositoryPort;
  clock: () => Date;
}

export interface EntityRepositoryPort {
  findByCanonicalName(
    name: string,
    tenantId: string,
  ): Promise<Result<Array<{ id: string; canonicalName: string; entityType: string }>>>;

  findByAlias(
    alias: string,
    tenantId: string,
  ): Promise<Result<Array<{ id: string; canonicalName: string; entityType: string }>>>;

  searchEntities(
    query: string,
    tenantId: string,
    limit?: number,
  ): Promise<
    Result<Array<{ id: string; canonicalName: string; entityType: string; score: number }>>
  >;
}

const ENTITY_TYPE_PATTERNS: Array<{ type: string; patterns: RegExp[] }> = [
  {
    type: "service",
    patterns: [/\b(service|microservice|api|endpoint|queue|topic|stream)\b/i],
  },
  {
    type: "database",
    patterns: [/\b(database|table|schema|column|index|query|sql|postgres|mysql|mongodb)\b/i],
  },
  {
    type: "deployment",
    patterns: [/\b(deployment|pod|container|docker|kubernetes|k8s|helm|chart)\b/i],
  },
  {
    type: "code",
    patterns: [/\b(function|class|module|package|file|import|export|interface|type|enum)\b/i],
  },
  {
    type: "person",
    patterns: [/\b( engineer|manager|lead|owner|reviewer|approver|author)\b/i],
  },
];

export class DefaultEntityResolver implements EntityResolverPort {
  constructor(private readonly deps: EntityResolverDependencies) {}

  async resolveEntitiesFromQuery(
    question: string,
    tenantId: string,
  ): Promise<Result<EntityResolutionResult>> {
    try {
      const mentions = this.extractEntityMentions(question);
      if (mentions.length === 0) {
        return success({
          entities: [],
          queryPlan: this.createFallbackPlan("vector", []),
        });
      }

      const resolvedEntities: ResolvedEntity[] = [];
      const allEntityIds: string[] = [];

      for (const mention of mentions) {
        const searchResult = await this.deps.entityRepository.searchEntities(
          mention.text,
          tenantId,
          5,
        );

        if (!searchResult.ok) {
          continue;
        }

        const matches = searchResult.value;
        if (matches.length === 0) {
          continue;
        }

        const bestMatch = matches[0]!;
        const entityType = this.inferEntityType(mention.text, question);

        resolvedEntities.push({
          entityId: bestMatch.id,
          canonicalName: bestMatch.canonicalName,
          entityType,
          confidence: bestMatch.score,
          mentionText: mention.text,
        });

        allEntityIds.push(bestMatch.id);
      }

      const queryPlan = this.buildQueryPlan(question, resolvedEntities, allEntityIds);

      return success({
        entities: resolvedEntities,
        queryPlan,
      });
    } catch (error) {
      return failure(new ValidationError("Entity resolution failed", { error: String(error) }));
    }
  }

  extractEntityMentions(question: string): Array<{ text: string; start: number; end: number }> {
    const mentions: Array<{ text: string; start: number; end: number }> = [];

    const capitalizedPattern = /\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*/g;
    let match;
    while ((match = capitalizedPattern.exec(question)) !== null) {
      const text = match[0]!;
      if (text.length >= 3 && !this.isCommonWord(text)) {
        mentions.push({
          text,
          start: match.index,
          end: match.index + text.length,
        });
      }
    }

    const underscoredPattern = /\b[a-z][a-z0-9_]*(?:_[a-z0-9_]+)+\b/g;
    while ((match = underscoredPattern.exec(question)) !== null) {
      const text = match[0]!;
      if (text.length >= 3 && !this.isCommonWord(text)) {
        mentions.push({
          text,
          start: match.index,
          end: match.index + text.length,
        });
      }
    }

    return mentions.sort((a, b) => b.text.length - a.text.length);
  }

  private isCommonWord(text: string): boolean {
    const commonWords = new Set([
      "the",
      "this",
      "that",
      "these",
      "those",
      "what",
      "which",
      "who",
      "when",
      "where",
      "how",
      "why",
      "are",
      "is",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
      "need",
      "dare",
      "ought",
      "used",
      "to",
      "of",
      "in",
      "for",
      "on",
      "with",
      "at",
      "by",
      "from",
      "as",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "under",
      "again",
      "further",
      "then",
      "once",
      "here",
      "there",
      "all",
      "each",
      "few",
      "more",
      "most",
      "other",
      "some",
      "such",
      "no",
      "nor",
      "not",
      "only",
      "own",
      "same",
      "so",
      "than",
      "too",
      "very",
      "just",
      "but",
      "and",
      "or",
      "if",
      "because",
      "until",
      "while",
      "although",
      "though",
      "also",
      "about",
      "above",
      "after",
      "against",
      "along",
      "among",
      "around",
      "before",
      "behind",
      "below",
      "beneath",
      "beside",
      "between",
      "beyond",
      "but",
      "by",
      "concerning",
      "considering",
      "despite",
      "except",
      "following",
      "inside",
      "into",
      "like",
      "near",
      "off",
      "onto",
      "outside",
      "over",
      "past",
      "regarding",
      "round",
      "since",
      "throughout",
      "toward",
      "under",
      "underneath",
      "until",
      "up",
      "upon",
      "within",
      "without",
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
    ]);
    return commonWords.has(text.toLowerCase());
  }

  private inferEntityType(mention: string, _question: string): string {
    for (const { type, patterns } of ENTITY_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(mention)) {
          return type;
        }
      }
    }
    return "unknown";
  }

  private buildQueryPlan(
    question: string,
    entities: ResolvedEntity[],
    entityIds: string[],
  ): QueryPlan {
    const questionLower = question.toLowerCase();
    const hasGraphKeywords =
      /dependency|depend|impact|affect|related|connected|uses|calls|invokes|depends|upstream|downstream|associated/.test(
        questionLower,
      );
    const hasMultiHopKeywords = /what if|cascade|propagate|chain|trace|follow|path|routes/.test(
      questionLower,
    );

    let strategy: "vector" | "fulltext" | "graph" | "hybrid";
    let graphResults = 0;

    if (entities.length === 0) {
      strategy = "vector";
    } else if (hasGraphKeywords || hasMultiHopKeywords || entities.length > 1) {
      strategy = "hybrid";
      graphResults = Math.min(entities.length * 10, 50);
    } else if (questionLower.includes("search") || questionLower.includes("find")) {
      strategy = "fulltext";
    } else {
      strategy = "hybrid";
      graphResults = 20;
    }

    const budget = this.calculateBudget(strategy, graphResults);

    return {
      strategy,
      seedEntityIds: entityIds,
      relatedEntityIds: [],
      budget,
      reasoning: `Detected ${entities.length} entity mentions, strategy=${strategy}${graphResults > 0 ? `, graphResults=${graphResults}` : ""}`,
    };
  }

  private calculateBudget(
    strategy: "vector" | "fulltext" | "graph" | "hybrid",
    graphResults: number,
  ): { vectorResults: number; fulltextResults: number; graphResults: number } {
    switch (strategy) {
      case "graph":
        return { vectorResults: 0, fulltextResults: 0, graphResults: graphResults || 30 };
      case "fulltext":
        return { vectorResults: 0, fulltextResults: 30, graphResults: 0 };
      case "vector":
        return { vectorResults: 30, fulltextResults: 0, graphResults: 0 };
      case "hybrid":
        return {
          vectorResults: 20,
          fulltextResults: 10,
          graphResults,
        };
    }
  }

  private createFallbackPlan(
    strategy: "vector" | "fulltext" | "graph" | "hybrid",
    entityIds: string[],
  ): QueryPlan {
    return {
      strategy,
      seedEntityIds: entityIds,
      relatedEntityIds: [],
      budget: this.calculateBudget(strategy, 0),
      reasoning: "No entities detected, using fallback plan",
    };
  }
}
