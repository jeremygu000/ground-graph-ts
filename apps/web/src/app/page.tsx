"use client";

import { useState } from "react";

interface Citation {
  citationId: string;
  evidenceId: string;
  snippet: string;
  score: number;
}

interface Claim {
  claimId: string;
  claimText: string;
  citations: Citation[];
  confidence: number;
}

interface QueryResponse {
  queryId: string;
  answer: string;
  status: "answered" | "insufficient_evidence" | "refused" | "clarification_needed";
  claims: Claim[];
  strategiesUsed: string[];
  timingMs: {
    entityResolution: number;
    retrieval: number;
    generation: number;
    total: number;
  };
  traceId?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [principalId, setPrincipalId] = useState("");
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/v1/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          tenantId,
          principalId,
          strategy: "hybrid",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.title || "Query failed");
      }

      const data: QueryResponse = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>GroundGraph</h1>
      </header>

      <main>
        <div className="card">
          <form onSubmit={handleQuery}>
            <div className="form-group">
              <label htmlFor="tenantId">Tenant ID</label>
              <input
                id="tenantId"
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="uuid"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="principalId">Principal ID</label>
              <input
                id="principalId"
                type="text"
                value={principalId}
                onChange={(e) => setPrincipalId(e.target.value)}
                placeholder="uuid"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="question">Question</label>
              <textarea
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question..."
                rows={3}
                required
              />
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Querying..." : "Submit"}
            </button>
          </form>
        </div>

        {error && <div className="error">{error}</div>}

        {response && (
          <div className="card">
            <h2>Answer</h2>
            <p>{response.answer}</p>
            <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.5rem" }}>
              Status: {response.status} | Time: {response.timingMs.total}ms
            </p>
            {response.traceId && (
              <p style={{ fontSize: "0.875rem", color: "#666" }}>
                Trace:{" "}
                <a
                  href={`http://localhost:6001/trace/${response.traceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {response.traceId}
                </a>
              </p>
            )}

            {response.claims.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h3>Claims</h3>
                {response.claims.map((claim) => (
                  <div key={claim.claimId} style={{ marginTop: "0.75rem" }}>
                    <p>{claim.claimText}</p>
                    <p style={{ fontSize: "0.75rem", color: "#666" }}>
                      Confidence: {(claim.confidence * 100).toFixed(1)}%
                    </p>
                    {claim.citations.map((cit) => (
                      <div key={cit.citationId} className="citation">
                        <p style={{ fontStyle: "italic" }}>&ldquo;{cit.snippet}&rdquo;</p>
                        <p style={{ fontSize: "0.75rem", color: "#666" }}>
                          Score: {cit.score.toFixed(3)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
