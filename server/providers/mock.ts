// ─── MOCK PROVIDER ────────────────────────────────────────────────────────
// Deterministic, zero-cost provider for local dev and automated tests.
// Every response is explicitly marked as simulated.

import type { AIProvider, AIRequest, AIResponse, ProviderCapabilities } from "./types.js";

// ─── Response templates ──────────────────────────────────────────────────

const PREMISE_RESPONSE = JSON.stringify({
  premises: [
    {
      premise: "The user's question assumes the United States is building 'so many' data centers.",
      assumption: "The phrase 'so many' is undefined and implies a baseline that has not been established.",
      assessment: "The premise needs verification — construction activity may appear high but actual operational capacity may differ.",
      evidence_needed: "Historical data-center construction counts, current operational vs announced capacity, and a clear baseline for comparison."
    },
    {
      premise: "The question implies the construction is unusual or excessive.",
      assumption: "The rate of data-center construction is significantly higher than historical norms.",
      assessment: "This may be true but requires quantitative evidence comparing current construction rates to past trends.",
      evidence_needed: "Time-series data on data-center construction permits, completions, and announcements over the past decade."
    }
  ]
}, null, 2);

const HYPOTHESIS_RESPONSE = JSON.stringify({
  hypotheses: [
    { id: "H1", statement: "AI demand is the primary driver of data-center expansion.", type: "CAUSAL",
      expected_evidence: ["Increasing AI-related infrastructure investment by hyperscalers", "AI companies signing capacity agreements", "GPU deployment growth correlating with new facilities", "Electricity demand increases at AI-adjacent facilities"] },
    { id: "H2", statement: "Speculative investment and financial incentives are driving overbuilding.", type: "CAUSAL",
      expected_evidence: ["Tax incentive programs in data-center-heavy regions", "Low utilization rates at newly built facilities", "Investment patterns suggesting speculative rather than demand-driven construction", "Developer profit models that don't require full occupancy"] },
    { id: "H3", statement: "Cloud computing demand (distinct from AI) is the primary driver.", type: "CAUSAL",
      expected_evidence: ["Cloud revenue growth correlating with capacity expansion", "Enterprise migration trends driving new demand", "Non-AI workloads constituting the majority of new capacity"] },
    { id: "H4", statement: "Energy and real-estate economics (land/power arbitrage) drive location choices.", type: "CAUSAL",
      expected_evidence: ["Data-center clustering in regions with cheap electricity", "Land cost correlations with facility placement", "Power purchase agreements preceding construction"] },
    { id: "H5", statement: "Government policy and strategic infrastructure incentives are a major factor.", type: "CAUSAL",
      expected_evidence: ["Federal or state incentive programs for data-center construction", "Zoning or regulatory changes enabling rapid builds", "National security or economic competitiveness policy driving capacity"] }
  ]
}, null, 2);

const RESEARCH_RESPONSE = JSON.stringify({
  findings: [
    { source: "U.S. Department of Energy, Lawrence Berkeley National Laboratory", source_type: "GOVERNMENT_RECORD", url: "https://eta.lbl.gov/publications",
      key_facts: ["Data centers consumed approximately 4.4% of total U.S. electricity in 2023", "Projected to reach 6.7–12% by 2028 depending on AI demand scenarios", "Growth driven by AI training and inference workloads", "Projections are model-based, not observed measurements of actual new facilities"],
      confidence: "high", is_primary: true },
    { source: "McKinsey & Company, Data Center Demand Report 2024", source_type: "SECONDARY_REPORT", url: "https://www.mckinsey.com",
      key_facts: ["U.S. data-center demand is projected to grow at 22% CAGR through 2030", "Northern Virginia remains the largest market", "15% of projected demand may go unmet due to power constraints", "Report relies on industry projections, not independently audited"],
      confidence: "moderate", is_primary: false },
    { source: "Reuters, citing local zoning filings", source_type: "SECONDARY_REPORT", url: "https://reuters.com",
      key_facts: ["Multiple states report record data-center construction permits", "Some projects are announced but face multi-year delays", "Power grid capacity is a limiting factor in several regions", "Article cites DOE projections as its primary quantitative source"],
      confidence: "moderate", is_primary: false, cites: "U.S. Department of Energy, Lawrence Berkeley National Laboratory" }
  ]
}, null, 2);

const EVIDENCE_RESPONSE = JSON.stringify({
  evidence_items: [
    { text: "Data centers consumed approximately 4.4% of total U.S. electricity in 2023.", type: "MEASUREMENT", source_ref: "DOE/LBNL 2023 report", claim: "Data centers consumed 4.4% of U.S. electricity in 2023.", claim_type: "QUANTITATIVE" },
    { text: "Projected data-center electricity demand could reach 6.7–12% of total U.S. electricity by 2028.", type: "PROJECTION", source_ref: "DOE/LBNL 2023 report", claim: "Data-center electricity demand is projected to increase significantly by 2028.", claim_type: "QUANTITATIVE" },
    { text: "The report attributes a significant portion of projected growth to AI training and inference workloads.", type: "ATTRIBUTION", source_ref: "DOE/LBNL 2023 report", claim: "AI workloads are a major contributor to projected data-center demand growth.", claim_type: "ATTRIBUTION" },
    { text: "The report does not provide data on actual utilization of newly constructed facilities.", type: "LIMITATION", source_ref: "DOE/LBNL 2023 report", claim: "Actual utilization of newly constructed data centers is not established by this source.", claim_type: "FACTUAL" }
  ]
}, null, 2);

const SKEPTIC_RESPONSE = JSON.stringify({
  challenges: [
    { target_claim: "AI demand is the primary driver of data-center expansion.", challenge_type: "SOURCE_CONTAMINATION",
      evidence: "The DOE/LBNL report that is widely cited as evidence for AI-driven demand is itself a projection, not an observation. Multiple secondary sources (Reuters, McKinsey) cite the same DOE projection, creating an illusion of independent confirmation.",
      assumption: "That projected electricity demand growth is equivalent to actual construction activity driven by AI.",
      objection: "The cited evidence is a projection, not an observation. Source independence is overstated.",
      counter_evidence: "No independently audited count of operational AI-specific data centers exists.",
      assessment: "The claim overstates what the evidence supports.",
      remaining_uncertainty: "Actual utilization rates of recently completed facilities." },
    { target_claim: "There are many new data centers being built.", challenge_type: "DEFINITIONAL_AMBIGUITY",
      evidence: "Announced projects differ from operational facilities. Some announced projects may be delayed or cancelled.",
      assumption: "That announcements and permits are equivalent to operational capacity.",
      objection: "'So many' is undefined and the metric being used conflates different measures.",
      counter_evidence: "", assessment: "The premise needs definitional clarity.",
      remaining_uncertainty: "How many announced projects are actually operational." },
    { target_claim: "AI demand explains the construction boom.", challenge_type: "CORRELATION_CAUSATION",
      evidence: "While AI demand and construction activity are both increasing, the causal link requires evidence that AI-specific capacity is being built.",
      assumption: "That increases in AI demand directly cause increases in construction.",
      objection: "Both could be driven by a third factor.",
      counter_evidence: "The DOE report does not separate AI from general cloud workloads.",
      assessment: "Causal link not independently established.",
      remaining_uncertainty: "Proportion of new capacity that is AI-specific." }
  ],
  strongest_contradicting_evidence: "No independently audited count of operational AI-specific data centers exists. The 'boom' may partly reflect announced projects that have not broken ground.",
  largest_unknown: "Actual utilization rates of recently completed facilities.",
  most_dangerous_assumption: "That all announced construction will be completed and will serve AI workloads.",
  severity: "HIGH"
}, null, 2);

const DEFENSE_RESPONSE = JSON.stringify({
  responses: [
    { claim_id: "AI demand is the primary driver of data-center expansion.", classification: "PARTIALLY_VALID",
      explanation: "The source contamination challenge is partially valid — multiple sources do cite the same DOE projection. However, the underlying projection is from a legitimate authority. The independence is overstated but the evidence direction is correct." },
    { claim_id: "There are many new data centers being built.", classification: "VALID",
      explanation: "The challenge to treat announced capacity differently from operational capacity is valid. We should not conflate projections with observations." }
  ],
  overall_assessment: "The adversarial criticism is partially valid. Source independence is overstated and projected capacity should not be treated as equivalent to operational capacity.",
  hypothesis_should_be_updated: true,
  new_support_level: "MODERATE"
}, null, 2);

const SYNTHESIS_RESPONSE = JSON.stringify({
  assessment: {
    confidence_level: "MODERATE",
    summary: "The evidence supports a multi-causal explanation. AI demand is a significant factor but is not independently verified as the primary driver. Projected demand, announced capacity, and operational capacity are distinct metrics that are often conflated in reporting.",
    supporting_evidence: ["DOE projections show significant electricity demand growth from data centers", "Multiple sources confirm record construction permit activity", "AI companies have announced large-scale capacity agreements"],
    contradicting_evidence: ["No independently audited count of operational AI-specific facilities", "Announced capacity significantly exceeds operational capacity", "Source independence is overstated — many sources cite the same DOE projection", "Non-AI cloud demand remains a major component of projected growth"],
    major_assumptions: ["Projected electricity demand translates to actual construction", "AI workloads are separable from general cloud workloads in demand data", "Announced projects will be completed"],
    major_unknowns: ["Actual utilization rates of newly built facilities", "Ratio of AI-specific to general cloud capacity in new construction", "Whether announced projects will be completed on schedule", "Role of tax incentives and speculative investment in driving construction"],
    strongest_counterargument: "The apparent boom may be substantially driven by speculative construction and financial incentives rather than genuine AI demand. Without utilization data, the causal story is incomplete.",
    information_gaps: ["Independent measurements of actual data-center utilization", "Separation of AI-specific vs general cloud capacity", "Completion rates of announced projects", "Financial analysis of construction incentives by region"]
  }
}, null, 2);

const DECOMPOSITION_RESPONSE = JSON.stringify({
  sub_questions: [
    "Is the rate of data-center construction actually unusual compared to historical norms?",
    "How should 'so many' be measured — by count, capacity, square footage, or electricity consumption?",
    "What is the gap between announced capacity and operational capacity?",
    "What proportion of new construction is specifically for AI workloads vs general cloud?",
    "What role do tax incentives and speculative investment play?",
    "What is the actual utilization rate of recently completed facilities?"
  ]
}, null, 2);

const FALLBACK_RESPONSE = JSON.stringify({
  response: "[MOCK] Investigation analysis complete. This is a simulated response for development and testing.",
  note: "This response was generated by the MockProvider and does not represent real AI analysis."
}, null, 2);

// ─── Role-based response with prompt-level differentiation ──────────────

function getResponse(req: AIRequest): string {
  const sp = req.systemPrompt ?? "";
  const prompt = req.prompt;

  // ── Premise Auditor ─────────────────────────────────────────────
  if (/premise auditor/i.test(sp)) return PREMISE_RESPONSE;

  // ── Investigation Director (multi-purpose) ─────────────────────
  if (/investigation director/i.test(sp)) {
    if (/hypothes/i.test(prompt)) return HYPOTHESIS_RESPONSE;
    if (/decompose|sub.question/i.test(prompt)) return DECOMPOSITION_RESPONSE;
    return DECOMPOSITION_RESPONSE; // default
  }

  // ── Primary Source Researcher ──────────────────────────────────
  if (/primary source researcher/i.test(sp)) return RESEARCH_RESPONSE;

  // ── OSINT Researcher ───────────────────────────────────────────
  if (/osint researcher/i.test(sp)) return RESEARCH_RESPONSE;

  // ── Evidence Analyst ───────────────────────────────────────────
  if (/evidence analyst/i.test(sp)) return EVIDENCE_RESPONSE;

  // ── Skeptic ────────────────────────────────────────────────────
  if (/skeptic/i.test(sp)) return SKEPTIC_RESPONSE;

  // ── Alternative Explanation ────────────────────────────────────
  if (/alternative explanation/i.test(sp)) return HYPOTHESIS_RESPONSE;

  // ── Synthesis ──────────────────────────────────────────────────
  if (/synthesis/i.test(sp)) return SYNTHESIS_RESPONSE;

  // ── Adversarial Agent ──────────────────────────────────────────
  if (/adversarial agent/i.test(sp)) return SKEPTIC_RESPONSE;

  // ── Defense Agent ──────────────────────────────────────────────
  if (/defense agent/i.test(sp)) return DEFENSE_RESPONSE;

  // ── Fallback: prompt-based matching ────────────────────────────
  if (/premise|assumption.*verif/i.test(prompt)) return PREMISE_RESPONSE;
  if (/generate.*hypothes|hypoth.*generat/i.test(prompt)) return HYPOTHESIS_RESPONSE;
  if (/research.*question|find.*source/i.test(prompt)) return RESEARCH_RESPONSE;
  if (/extract.*evidence|atomic.*claim/i.test(prompt)) return EVIDENCE_RESPONSE;
  if (/challenge|adversar|skeptic|devil/i.test(prompt)) return SKEPTIC_RESPONSE;
  if (/defense|defend|classif.*challenge/i.test(prompt)) return DEFENSE_RESPONSE;
  if (/synthe|assess|conclu/i.test(prompt)) return SYNTHESIS_RESPONSE;
  if (/decompose|sub.question/i.test(prompt)) return DECOMPOSITION_RESPONSE;

  return FALLBACK_RESPONSE;
}

export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly name = "Mock (Deterministic)";

  capabilities(): ProviderCapabilities {
    return {
      streaming: false,
      maxOutputTokens: 4096,
      supportsSystemPrompt: true,
      supportsJSON: true,
      supportsTools: false,
    };
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    await new Promise((r) => setTimeout(r, 150));

    const text = getResponse(request);
    const inputTokens = Math.ceil((request.systemPrompt?.length ?? 0 + request.prompt.length) / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return {
      text,
      json: request.jsonMode ? this.tryParse(text) : undefined,
      usage: { inputTokens, outputTokens, costUSD: 0 },
      provider: this.id,
      model: request.model,
      durationMs: 150,
      simulated: true,
    };
  }

  private tryParse(text: string): unknown {
    try { return JSON.parse(text); } catch { return undefined; }
  }
}
