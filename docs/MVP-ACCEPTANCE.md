# Ruthless Investigator — MVP Acceptance Gate

This document defines the product-level acceptance gate for the first usable release.

## Product promise

A user can submit a difficult factual question and receive an evidence-driven assessment produced by a council of independently routed AI investigators, including adversarial review and explicit uncertainty.

## Required council behavior

- [x] Premise audit role
- [x] Investigation director
- [x] Primary-source research role
- [x] OSINT research role
- [x] Evidence analyst
- [x] Skeptic
- [x] Alternative explanations
- [x] Adversarial challenge
- [x] Defense of challenged hypotheses
- [x] Synthesis
- [x] Multiple model/provider definitions
- [x] Deterministic zero-cost mock provider

## Required epistemic behavior

- [x] Atomic evidence objects
- [x] Source provenance
- [x] Primary/secondary distinction
- [x] Source citation lineage
- [x] Independent-root tracking
- [x] Competing hypotheses
- [x] Contradictions
- [x] Information gaps
- [x] Adversarial challenges
- [x] Assessment revisions
- [x] Explicit unknowns
- [x] Confidence level

## Required operational behavior

- [x] Investigation state machine
- [x] Budget tracking
- [x] Persistence/checkpoints
- [x] Pause/resume
- [x] Crash recovery path
- [x] Tool permissions
- [x] Agent workspace isolation
- [x] Event stream/observability
- [x] Cost-aware routing infrastructure

## Final release gate

The MVP should not be called complete until the following are verified in CI and in a real local run:

1. `npm test` passes.
2. `npm run build` passes.
3. A mock investigation reaches an assessment without external API credentials.
4. A configured live-provider investigation can complete at least one council cycle.
5. At least three model identities can participate when the configured provider inventory supports them.
6. The final assessment exposes supporting evidence, contradicting evidence, major assumptions, major unknowns, strongest counterargument, and information gaps.
7. Evidence is never counted as independently confirming when its source lineage resolves to the same underlying source.
8. A provider failure does not silently become a successful research result.
9. Budget exhaustion stops or degrades work predictably rather than silently exceeding the configured budget.
10. The UI makes clear that an assessment is an evidence-weighted conclusion, not certainty or a legal finding.

## Explicitly out of scope for MVP

- Billing and subscriptions
- Enterprise organization management
- Huge plugin marketplace
- Every government/public-record connector
- Fully autonomous access to private systems
- Legal certification or automated accusations
- Nationwide domain-specific data pipelines

Those can be added after the core council has been validated on real investigations.
