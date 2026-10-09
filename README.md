# WOIA RE Property Acquisition v0.5.6

A thin department-orchestrator delta over published Supply Acquisition v0.5.6 and Core v0.5.6. It adds only ADR-0008's five Real Estate coordination rules for independent sale, rental-placement and existing-Lease administration scopes.

## Contract and ownership

See [delta contract](skills/woia-re-property-acquisition/references/acquisition-contract.md), [immutable release bindings](skills/woia-re-property-acquisition/references/release-bindings.json) and [skill](skills/woia-re-property-acquisition/SKILL.md). Hard dependencies are Core + Supply Acquisition only; eight published closure providers are semantic bindings. Domain facts, external communication, financial effects and Core mechanics retain their owners. No private organization values or backend are selected.

## Evaluation API

`projectBaseInput(request, host)` maps scope/references to the actual pinned base helper; run its `evaluateIntake` before passing its output to `evaluateAcquisition(request, host, baseResult)`. Host independently resolves and authenticates policy, source authority, competent grants and acceptance records. The pure helper cannot grant authority, write Tasks/facts or execute effects. Its NEXT_ACTION_ELIGIBLE is an evaluation result only.

`validateComposition` establishes engineering conformance while always returning activation_allowed=false. Pair status is NOT_QUALIFIED with no evaluated exact pairs. A finally released delta and exact immutable Core/Ecosystem evaluations are required before activation.

## Maintenance

Use `mise run bootstrap`, `mise run doctor`, `mise run validate`, `mise run ci:fast` and committed clean `mise run release:check`. Central Ecosystem v0.5.6 `plugin:certify-thin` validates the exact committed candidate.
