# Ruthless Investigator

Ruthless Investigator is a multi-model investigation council for difficult questions where the goal is not to generate a plausible answer, but to determine what the available evidence most strongly supports.

## MVP promise

Give the system a question. Ruthless Investigator:

1. audits the premise;
2. decomposes the question;
3. assigns independent research roles across multiple LLM providers;
4. gathers and normalizes source-backed evidence;
5. tracks source lineage so repeated reporting is not mistaken for independent confirmation;
6. generates competing hypotheses;
7. attacks the leading explanations with adversarial researchers;
8. identifies contradictions, assumptions, and information gaps;
9. performs targeted follow-up research where it can materially reduce uncertainty;
10. produces a transparent truth assessment with supporting evidence, counterevidence, uncertainty, alternatives, and unknowns.

The system is explicitly designed to preserve disagreement rather than manufacture consensus.

## Council model

The council separates **investigative role** from **LLM provider**. A role may be assigned to GPT, Claude, Gemini, Mistral, Llama, or another configured provider/model. The system should learn which model is most effective for which investigative task without treating any provider as inherently authoritative.

Core roles include:

- Investigation Director
- Premise Auditor
- Primary Source Researcher
- OSINT Researcher
- Evidence Analyst
- Skeptic
- Alternative Explanation Agent
- Adversarial Agent
- Defense Agent
- Synthesis Agent

The important rule is: **agreement between models is not evidence by itself**. Three agents repeating the same source count as one underlying source until independent evidence is established.

## Investigation lifecycle

```text
Question
  -> Premise audit
  -> Question decomposition
  -> Competing hypotheses
  -> Independent council research
  -> Evidence normalization
  -> Source/lineage analysis
  -> Hypothesis testing
  -> Adversarial review
  -> Disagreement + gap analysis
  -> Targeted research
  -> Reassessment
  -> Convergence review
  -> Truth assessment
```

## Epistemic rules

Ruthless Investigator distinguishes:

- observation
- measurement
- documented event
- statement
- estimate
- projection
- inference
- claim
- hypothesis
- unknown

A conclusion must remain traceable to the evidence that supports it. Contradicting evidence is preserved. Missing evidence is represented explicitly. Confidence is allowed to remain low when the record is weak.

The system must never imply that an investigation has established legal wrongdoing, criminal conduct, corruption, or other serious allegations merely because an agent produced such a hypothesis.

## Architecture

```text
                 USER QUESTION
                       |
                 INVESTIGATION
                   DIRECTOR
                       |
          +------------+------------+
          |            |            |
        GPT          Claude       Gemini ...
          |            |            |
          +------ independent ------+
                    research
                       |
                 EVIDENCE LAYER
                       |
              source independence
              provenance / lineage
                       |
             HYPOTHESIS COMPETITION
                       |
              ADVERSARIAL COUNCIL
                       |
             contradictions / gaps
                       |
               targeted research
                       |
                  synthesis
                       |
               TRUTH ASSESSMENT
```

### Institutional and cost-control layers

The investigation council sits above reusable infrastructure for:

- agent identity and capabilities;
- permissioned tool access;
- persistent institutional memory;
- skill discovery and performance;
- model routing;
- cost/budget control;
- computer/workspace isolation;
- auditability and recovery.

These systems support the council; they are not substitutes for it.

## Development

```bash
npm install
npm run dev
```

Run the test suite:

```bash
npm test
```

Build production assets:

```bash
npm run build
```

Use mock mode for deterministic, zero-cost local development/testing when supported by the configured investigation path. Real provider credentials belong in local environment configuration and must never be committed.

## MVP definition of done

The MVP is considered ready when a fresh investigation can complete end-to-end with:

- at least three independently routed model/provider identities;
- deterministic mock mode for tests;
- independent first-pass research;
- evidence/source capture;
- source-lineage and independence handling;
- competing hypotheses;
- adversarial challenge and defense;
- contradiction and information-gap tracking;
- targeted follow-up research;
- resumable investigation state;
- budget enforcement;
- transparent final assessment;
- visible evidence and uncertainty in the UI;
- production build and test suite passing.

The MVP does **not** require every conceivable domain connector, autonomous browsing of private systems, billing, enterprise RBAC, or a giant plugin marketplace.
