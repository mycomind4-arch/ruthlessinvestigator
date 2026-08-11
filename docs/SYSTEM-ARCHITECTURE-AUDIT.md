# Ruthless Investigator — System Architecture & Optimization Audit

Date: 2026-08-11

## Executive conclusion

The platform has reached the point where adding more agents or features would create diminishing returns unless the existing intelligence layers are given a stricter hierarchy.

The target architecture is:

```text
INVESTIGATION
    ↓
DIRECTOR — decides WHAT should happen next
    ↓
TASK MANAGER — owns task lifecycle
    ↓
SKILL SELECTOR — chooses reusable procedure
    ↓
SKILL EXECUTOR — executes the procedure
    ↓
MODEL ROUTER — chooses the least expensive adequate model
    ↓
CONTEXT BUILDER — supplies only the context required
    ↓
TOOLS / SOURCES
    ↓
EVIDENCE GRAPH
    ↓
DIRECTOR — reassesses
```

The key rule is that no lower-level subsystem should independently become a second Director.

## Current repository observations

The repository already contains substantial infrastructure for:

- adaptive investigation orchestration
- model routing and escalation
- reasoning-depth selection
- persistent research cycles and checkpoints
- memory and assessment snapshots
- capability discovery and registration
- skill discovery, extraction, execution, benchmarking, learning reports, composition, and registry
- evidence graph and contradiction analysis
- cost tracking
- source lineage
- event streaming

The largest architectural risk is therefore **overlap**, not missing features.

## Highest-priority optimization findings

### P0 — Establish one decision authority

`director.ts` and `engine.ts` contain significant orchestration logic while task management, reasoning, cycle review, and model routing also make decisions.

Required rule:

> Director chooses the next investigative objective. Other services may constrain or execute that decision, but must not independently redirect the investigation.

### P0 — Remove hard-coded model assignment from orchestration

The engine currently contains a `DEFAULT_ROLE_MODELS` map. This conflicts with the existence of the model router.

Target:

```text
Director task
  → Task Profile
  → Model Router
  → Provider
```

Role defaults should become routing preferences, not fixed model assignments.

Also ensure per-investigation configuration is immutable; global role configuration must never be mutated by one investigation.

### P0 — Make reasoning depth a policy decision

Reasoning depth should be selected from task value and uncertainty rather than being synonymous with model choice.

The new `optimization-policy.ts` provides the first deterministic policy layer.

It distinguishes:

- task importance
- uncertainty
- expected impact
- contradiction risk
- available evidence
- budget
- user-requested depth

This allows the system to spend deeply only where additional reasoning can materially change the assessment.

### P1 — Separate skill selection from model selection

A skill answers:

> What procedure should be used?

The model router answers:

> Which model should execute that procedure?

These must remain independent so that one skill can run on a cheap model, a strong model, or a deep-reasoning model without duplicating the skill.

### P1 — Treat context as a budgeted resource

The context builder should stop passing the entire investigation state to every model.

Future task context should be assembled from:

1. task objective
2. relevant hypothesis/claim
3. directly relevant evidence
4. source lineage needed for verification
5. prior task results that affect the decision
6. explicit constraints

Everything else should remain addressable but omitted from the prompt.

### P1 — Add semantic work deduplication

Before paying for a research task, check whether materially equivalent work has already been completed.

The optimization policy introduces a deterministic work key as a foundation.

Future dedupe should distinguish:

- exact duplicate
- same question / fresher sources required
- same question / deeper reasoning required
- same question / new evidence required

### P1 — Make escalation outcome-driven

Escalation should not mean simply moving from a cheap model to an expensive model.

The system should record:

```text
cheap result
→ identified deficiency
→ escalation reason
→ stronger result
→ actual benefit
```

If stronger models repeatedly provide no material benefit for a task class, the router should learn that escalation is low-value.

### P2 — Consolidate memory semantics

Memory, persistence snapshots, checkpoints, and assessment revisions should have distinct purposes:

- Memory = reusable findings with provenance
- Checkpoint = resumable investigation state
- Snapshot = assessment at a point in time
- Revision = explanation of why assessment changed

They should not become interchangeable copies of investigation state.

### P2 — Skills should become measurable institutional knowledge

A skill should eventually contain:

```text
procedure
inputs
outputs
preconditions
failure modes
cost profile
preferred tools
preferred models
benchmark cases
success rate
known limitations
composition compatibility
provenance
version
```

A skill should only become preferred after evidence that it works.

## Cost architecture target

The cost-control hierarchy should be:

```text
Can we answer deterministically?
        ↓ yes → do not call model
        ↓ no
Can an existing skill solve it?
        ↓ yes → execute skill
        ↓ no
Can a cheap model solve it?
        ↓ yes → run + evaluate
        ↓ inadequate
Escalate
        ↓
Would another model materially improve the result?
        ↓ no → stop
        ↓ yes
Escalate once
```

This is more important than simply lowering token prices.

## Long-term investigation target

Investigations should be resumable and cycle-based:

```text
Cycle N
  ↓
Assessment
  ↓
Director decision
  ↓
Checkpoint
  ↓
Pause / resume
  ↓
Cycle N+1
```

A six-hour investigation should not require one six-hour request or one continuously growing context window.

## Autonomous skill learning target

The platform should eventually learn skills from repeated work, but learned skills must pass through a controlled lifecycle:

```text
Observed repeated procedure
        ↓
Candidate skill
        ↓
Extract procedure
        ↓
Sandbox test
        ↓
Benchmark
        ↓
Human/system review
        ↓
Draft skill
        ↓
Production skill
        ↓
Continuous measurement
        ↓
Revision / retirement
```

A model-generated procedure must never silently become trusted institutional knowledge.

## What should NOT be added yet

Do not add more agent roles merely to increase the agent count.

Do not add arbitrary truth scores.

Do not create another orchestration layer.

Do not send the complete investigation state to every model.

Do not automatically escalate every disagreement to the most expensive model.

Do not allow repeated source summaries to masquerade as independent evidence.

Do not let learned skills execute unrestricted external actions.

## Immediate implementation sequence

1. Adopt `optimization-policy.ts` as the central task-depth policy.
2. Remove fixed role→model execution from the engine in favor of ModelRouter decisions.
3. Make role preferences data, not orchestration authority.
4. Add task/result deduplication before provider calls.
5. Make ContextBuilder enforce task-specific context budgets.
6. Connect skill selection to the Director without allowing skills to redirect investigation state.
7. Record escalation benefit and use it to improve routing.
8. Separate memory/checkpoint/snapshot/revision persistence semantics.
9. Add architecture tests that enforce subsystem authority boundaries.
10. Run the data-center investigation as the end-to-end regression benchmark.

## Definition of architectural success

Ruthless Investigator should become **more capable without proportionally becoming more expensive or more complicated**.

A successful optimization should allow the same investigation to produce a better result by:

- using fewer model calls
- using smaller contexts
- reusing proven skills
- escalating only when justified
- prioritizing discriminating evidence
- preserving provenance
- learning from previous task outcomes

The ultimate optimization metric is therefore not:

> number of agents

or:

> number of model calls

It is:

> **useful evidence gained per dollar spent, while preserving traceability and adversarial rigor.**
