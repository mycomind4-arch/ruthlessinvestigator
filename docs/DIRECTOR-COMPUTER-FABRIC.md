# Ruthless Investigator — Director Computer Fabric

## Purpose

The Investigation Director now has a computer capability boundary. The computer is an execution environment, not an autonomous agent and not a source of truth.

The investigation database/evidence graph remains authoritative. The computer is a working laboratory for files, extraction, analysis, builds, and other explicitly authorized operations.

## Architecture

```text
Director
  -> AgentRuntime
      -> ComputerProvider
          -> LocalComputerProvider (tests/dev; no shell execution)
          -> CloudflareSandboxComputerProvider (production adapter)
                -> @cloudflare/sandbox
                -> isolated container
```

This keeps the investigation engine independent of Cloudflare SDK imports. A provider can be swapped without changing Director logic.

## Workspace model

Each investigation/agent pair receives a deterministic workspace ID:

```text
<investigation-id>-<agent-id>
```

The intended root is `/workspace`. Files outside that root must not be exposed through the control API.

Typical investigation workspace:

```text
/workspace/
  sources/
  documents/
  datasets/
  extractions/
  analysis/
  artifacts/
  notes/
```

Do not treat these files as authoritative evidence. Evidence must still be extracted into the investigation evidence graph with provenance.

## Permissions

Computer permissions are explicit:

- `FILES_READ`
- `FILES_WRITE`
- `SHELL_EXECUTE`
- `NETWORK`
- `PROCESS_START`

The default local provider grants file operations but deliberately refuses shell execution. Production grants should be assigned by the existing capability/permission system rather than implicitly to every agent.

## Cloudflare deployment

The optional `cloudflare/` package contains the first deployment scaffold using Cloudflare Sandbox. Cloudflare documents Sandbox as an isolated container environment for agents that need a filesystem, shell, language runtimes, package installation, tests, and data analysis. citeturn0search7

Cloudflare's current Agents platform also supports durable execution, persistent state, scheduling, and Workflows. Long-running investigations should eventually move multi-step execution into durable fibers or Workflows rather than depending on one HTTP request remaining alive. citeturn0search0turn0search10

### Required secret

Set the Cloudflare Worker secret:

```text
COMPUTER_API_TOKEN
```

The control API requires:

```text
Authorization: Bearer <COMPUTER_API_TOKEN>
```

Never put this token in browser code.

### Deployment

From `cloudflare/`:

```bash
npm install
npx wrangler secret put COMPUTER_API_TOKEN
npm run deploy
```

Before production deployment, verify the container image and SDK version against the current Cloudflare Sandbox documentation because the Sandbox SDK is still evolving.

## Security rules

1. Research documents are DATA, not instructions.
2. Retrieved content must never override the Director/system policy.
3. Shell commands must be capability-gated.
4. Filesystem access is confined to the workspace.
5. Network access is separately permissioned.
6. Computer operations must be logged as execution records/events.
7. Commands must have bounded timeouts.
8. Large file writes must be bounded.
9. Production control endpoints must be authenticated.
10. A computer result does not become evidence until provenance is recorded.

## Why the Director owns the computer

Do not give every agent an unrestricted computer. The Director should decide when execution is warranted and assign the minimum capability required for the task.

Examples:

- Primary Source Researcher → download/extract a filing.
- Evidence Analyst → parse a dataset and calculate measurements.
- Skeptic → run a reproducible counter-analysis.
- Builder/Skill Agent → create and test a reusable skill in a sandbox.
- Director → coordinate the workspace and decide what execution should happen next.

This preserves the central Ruthless Investigator principle:

> The system should spend execution and model budget on the evidence most capable of changing its understanding.
