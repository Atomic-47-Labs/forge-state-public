---
name: forge-agentic-rl
description: Use to run a multi-turn LLM-agent rollout with GRPO-style group-relative advantages and AgentRL-style task renormalization, inside a no-secrets Docker sandbox. Wraps the `agentic-rl-runner` Python package shipped by EXP-0006. Suitable for benchmarking any chat-completion API (Anthropic, OpenAI, vLLM, local Ollama) against a toy environment without running gradient training. Trigger via "/forge-agentic-rl <args>" or invoked from forge-experimenter when an article-as-spec experiment needs to exercise an agentic-RL claim. Phases handled: build (pip install -e .), test (pytest), bench (arl bench / arl demo).
experiment_origin: EXP-0006
---

# forge-agentic-rl — operationalize Agentic RL via the runner package

This skill is the operational shell around the [`agentic-rl-runner`](https://github.com/davidolsson/forge-state) package that EXP-0006 built. It runs the package inside a `python:3.12` Docker sandbox and produces benchmarkable scoreboards for any policy you wire in.

## When to use

- A future forge experiment lands an `article-as-spec` or `paper-claim-reproduce` source about agentic RL and needs to exercise the claim against a real harness.
- A user wants to bench an LLM-as-policy against the calculator or fact-check reference environments without standing up a full training stack.
- A future forge experiment needs to add a new environment (HTTP-backed à la AgentGym-RL, or synthesized à la AutoForge) — this skill is the integration point.

## When NOT to use

- You need *gradient training*. This package and skill stop at advantage scoring. Use TRL, OpenRLHF, or a custom trainer for the gradient step.
- You need *multi-process asynchronous rollouts at scale*. The runner is single-process synchronous. For >100 concurrent rollouts, write a worker harness around it.

## Inputs

- An env name (`calc` or `fact`) or a custom Environment implementation.
- A policy: a scripted fixture, a callable, or an LLM client adapter.
- A reward model (default: `BinaryOutcomeReward` with `{0, +1}` — explicitly NOT `{-0.5, +1}` per Wolfe).
- Group size `n` (default 8).

## Outputs

- A JSON scoreboard with: success rate, mean reward, std reward, mean trajectory length, and per-rollout GRPO advantages.
- For multi-task runs: task-normalized advantages (AgentRL-style) per task.
- An `experiments/EXP-NNNN-<slug>/artifacts/bench-<timestamp>.json` if invoked from a forge experiment.

## Procedure

1. **Read** the invocation: env, policy, n, seed, optional ground-truth override.
2. **Provision sandbox.** `docker run --rm python:3.12` with the runner workdir mounted read-only and the artifacts dir mounted writable.
3. **Install + test.**
   ```bash
   pip install -e /work/agentic-rl-runner[dev]
   pytest -q /work/agentic-rl-runner/tests
   ```
   Abort if any test fails — that's a regression in the runner itself, not a user-policy problem.
4. **Bench.**
   ```bash
   arl bench --env <env> --script <policy> --n <n>
   ```
   For LLM policies, write a small Python adapter that calls the chat completion API and wires it via `CallablePolicy`; run via `python -m agentic_rl_runner` instead of `arl` so the adapter is in scope.
5. **Score + emit.**
   - Capture stdout as the JSON scoreboard.
   - Per Wolfe: a uniform group (all rewards equal) is normal in agentic-RL bootstrap — emit it with zero advantages and a note, do not error.
   - If running multi-task, call `task_normalize` to renormalize advantages within each task; flag any task whose post-normalization std is < 1e-6 as "no learning signal."
6. **Persist.**
   - Write the scoreboard to `artifacts/bench-<ISO8601>.json`.
   - Append an `agentic-rl-bench` event to `~/forge/state/activity.ndjson` with the EXP id (if any), the env, the policy name, and the success rate.

## Operationalization rules (forge experimenter contract)

This skill IS the operationalization output of EXP-0006. Other experiments that adopt agentic-RL-style benchmarking should:

1. Treat THIS skill as the canonical bench harness — do not re-implement GRPO or task normalization inline.
2. Contribute new Environments back to the `agentic-rl-runner` package, not as one-off scripts.
3. Cite EXP-0006 in the new experiment's `experiment.yaml` under `tooling_origin`.

## Error handling

- `pytest` fails inside the sandbox → bug in the runner; do NOT proceed to bench. Surface to the orchestrator.
- LLM adapter raises → record the exception in the scoreboard `errors[]` field; continue with the remaining rollouts.
- A single rollout exceeds `max_steps` → record `length: max_steps, truncated: true` in its trajectory and continue.

## References

- EXP-0006 forge post: https://scsiwyg.com/forge/exp-0006-agentic-rl
- Wolfe, *Agentic RL* (substack source).
- AgentRL, AutoForge, ToRL, AgentGym-RL, Agent-R1 papers (cited from the source essay).
