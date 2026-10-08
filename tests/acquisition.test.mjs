import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES, evaluateAcquisition, projectBaseInput, validateComposition } from '../skills/woia-re-property-acquisition/scripts/evaluate-acquisition.mjs';
import { fixture, contribution } from './acquisition-fixture.mjs';
const evaluate = f => evaluateAcquisition(f.request, f.host, f.base);
for (const service of SERVICES) for (const mode of ['prepare', 'next-action', 'transfer']) test(`${service} ${mode} accepts independently scoped sources`, () => {
  const f = fixture(service, mode), before = structuredClone(f); const result = evaluate(f);
  assert.equal(result.result, 'NEXT_ACTION_ELIGIBLE'); assert.deepEqual(f, before);
  for (const flag of ['dispatch_performed', 'fact_written', 'authority_granted', 'task_written', 'pair_qualified', 'production_ready', 'parent_completed']) assert.equal(result[flag], false);
  assert.equal(result.downstream_owner, mode === 'transfer' ? f.host.transfer.receiver : null);
});
const negatives = {
  'missing mandate': f => { f.host.facts = f.host.facts.filter(x => x.kind !== 'mandate'); },
  'revoked mandate': f => { f.host.facts.find(x => x.kind === 'mandate').revoked = true; },
  'disputed representation': f => { f.host.facts.find(x => x.kind === 'representation').disputed = true; },
  'unknown source': f => { f.host.facts[0].source_ref = 'source:unknown'; },
  'unknown writer/owner': f => { f.host.facts[0].accepted_by = 'wrong-owner'; },
  'missing fact version': f => { delete f.host.facts[0].version; },
  'unaccepted evidence': f => { f.host.facts[0].status = 'OBSERVED'; },
  'stale source map': f => { f.host.source_rules[0].source_map_revision = 'sam:old'; },
  'duplicated source rule': f => { f.host.source_rules.push(structuredClone(f.host.source_rules[0])); },
  'duplicate required fact': f => { f.host.facts.push(structuredClone(f.host.facts[0])); },
  'wrong property': f => { f.host.facts[0].property_ref = 'property:other'; },
  'wrong unit': f => { f.host.facts[0].unit_ref = 'unit:other'; },
  'wrong represented principal': f => { f.host.grant.principal_ref = 'person:other'; },
  'wrong organization': f => { f.host.scope.organization_ref = 'org:other'; },
  'wrong actor': f => { f.host.grant.actor_ref = 'actor:other'; },
  'wrong purpose': f => { f.host.grant.purpose = 'another-purpose'; },
  'unknown authority': f => { f.host.grant.status = 'UNKNOWN'; },
  'revoked authority': f => { f.host.grant.revoked = true; },
  'expired authority': f => { f.host.grant.valid_until = f.host.now; },
  'noncompetent authority': f => { f.host.grant.owner = 'wrong-owner'; },
  'mismatched action': f => { f.host.grant.next_action = 'other-action'; },
  'technical access alone': f => { delete f.host.grant.decision_ref; },
  'caller widen dependent mandate requirement': f => { f.host.action.requires_mandate = false; },
  'external contact': f => { f.host.action.effect_class = 'communication.external.send'; },
  'scheduling': f => { f.host.action.effect_class = 'appointment.create'; },
  'finance posting': f => { f.host.action.effect_class = 'finance.journal.post'; },
  'fabricated opening balance': f => { f.host.action.effect_class = 'finance.opening-position.record'; },
  'canonical property write': f => { f.host.action.effect_class = 'property.update'; },
  'unknown outcome': f => { f.host.effect_status = 'UNKNOWN'; },
  'unknown retry changes key': f => { f.host.effect_status = 'UNKNOWN'; f.host.previous_idempotency_key = 'original-effect-key'; },
  'changed Core snapshot': f => { f.host.previous_snapshot_ref = 'old-snapshot'; },
  'changed Core release': f => { f.host.core_release.commit = 'f'.repeat(40); },
  'changed base release': f => { f.host.base_release.commit = 'f'.repeat(40); },
  'changed active scope': f => { f.host.previous_scope_version = 'v0'; },
  'stale result': f => { f.host.facts[0].scope_version = 'v0'; },
  'wrong fact action acceptance': f => { f.host.facts[0].next_action = 'other-action'; },
  'base PASS flag': f => { f.base = { result: 'PASS' }; },
  'base blocked': f => { f.base.result = 'BLOCKED'; },
  'base wrong subject': f => { f.base.subject_ref = 'property:other'; },
  'base wrong service': f => { f.base.service = 'rental-placement'; },
  'base wrong source version': f => { f.base.source_map_revision = 'v0'; },
  'base wrong task': f => { f.base.task_ref = 'task:other'; },
  'base wrong key': f => { f.base.idempotency_key = 'other-key'; },
  'base effect claimed': f => { f.base.dispatch_performed = true; },
  'missing pending owner': f => { f.host.continuity.owner = ''; },
  'stale continuity': f => { f.host.continuity.snapshot_ref = 'old'; }
};
for (const [name, mutate] of Object.entries(negatives)) test(`fail closed: ${name}`, () => { const f = fixture(); mutate(f); assert.equal(evaluate(f).result, 'BLOCKED'); });
test('missing mandate does not block independently authorized unrelated preparation', () => { const f = fixture('sale', 'prepare'); assert.equal(f.host.facts.length, 0); assert.equal(evaluate(f).result, 'NEXT_ACTION_ELIGIBLE'); f.host.grant.revoked = true; assert.equal(evaluate(f).result, 'BLOCKED'); });
for (const service of SERVICES) test(`${service} contribution belongs to receiver and does not complete parent`, () => { const f = fixture(service); f.host.contributions = [contribution(f)]; assert.equal(evaluate(f).result, 'NEXT_ACTION_ELIGIBLE'); assert.equal(evaluate(f).parent_completed, false); });
for (const [name, mutate] of Object.entries({ ACK: c => c.status = 'ACK', notification: c => c.status = 'NOTIFIED', completed: c => c.status = 'COMPLETED', 'same task': (c, f) => c.receiver_task_ref = f.request.task_ref, 'wrong origin': c => c.origin_task_ref = 'other', 'stale scope': c => c.scope_version = 'v0', 'wrong receiver acceptance': c => c.accepted_by = 'supply-acquisition', 'not distinct': c => c.distinct_outcome = false, 'routine data proxy': c => c.receiver = 'every-provider', 'stale snapshot': c => c.snapshot_ref = 'old' })) test(`contribution rejects ${name}`, () => { const f = fixture(), c = contribution(f); mutate(c, f); f.host.contributions = [c]; assert.equal(evaluate(f).result, 'BLOCKED'); });
test('duplicate contribution blocked', () => { const f = fixture(); f.host.contributions = [contribution(f), contribution(f)]; assert.equal(evaluate(f).result, 'BLOCKED'); });
test('duplicate outcome with different Core request is blocked', () => { const f = fixture(); f.host.contributions = [contribution(f), { ...contribution(f), request_ref: 'core-request:two' }]; assert.equal(evaluate(f).result, 'BLOCKED'); });
for (const service of SERVICES) for (const field of ['status', 'receiver', 'accepted_by', 'acceptance_ref', 'source_ref', 'scope_version', 'snapshot_ref']) test(`${service} transfer rejects wrong ${field}`, () => { const f = fixture(service, 'transfer'); f.host.transfer[field] = 'wrong'; assert.equal(evaluate(f).result, 'BLOCKED'); });
test('administration intake does not require promotional photos, Listing or fictional placement', () => { const f = fixture('existing-lease-administration'); assert.equal(evaluate(f).result, 'NEXT_ACTION_ELIGIBLE'); f.host.action.requirements.push('promotional-photos'); assert.ok(evaluate(f).blockers.includes('FICTIONAL_ADMINISTRATION_PREREQUISITE')); });
test('administration requires accepted active Lease independently', () => { const f = fixture('existing-lease-administration'); f.host.facts.find(x => x.kind === 'existing-lease').lifecycle = 'DRAFT'; assert.equal(evaluate(f).result, 'BLOCKED'); });
test('combined services only by explicit trusted scope; placement does not activate administration', () => { const f = fixture('rental-placement', 'transfer'); f.request.services.push('existing-lease-administration'); f.host.administration_activated = true; assert.equal(evaluate(f).result, 'BLOCKED'); f.host.administration_activated = false; assert.equal(evaluate(f).result, 'NEXT_ACTION_ELIGIBLE'); f.host.scope.services = ['rental-placement']; assert.equal(evaluate(f).result, 'BLOCKED'); });
test('different services retain independent Mandate acceptance', () => { const f = fixture(); f.host.facts.find(x => x.kind === 'mandate').service = 'rental-placement'; assert.equal(evaluate(f).result, 'BLOCKED'); });
for (const [name, mutate] of Object.entries({ 'future grant': f => f.host.grant.valid_from = 101, 'fact future': f => f.host.facts[0].valid_from = 101, 'source future': f => f.host.source_rules[0].valid_from = 101, 'hold': f => f.host.grant.hold = true, 'emergency stop': f => f.host.emergency_stop = true, 'unknown stop': f => delete f.host.emergency_stop, 'revoked receiver acceptance': f => f.host.transfer_acceptance.revoked = true, 'receiver future': f => f.host.transfer_acceptance.valid_from = 101, 'different accepted payload': f => f.host.transfer_acceptance.accepted_payload.property_ref = 'other', 'changed source version': f => f.host.facts[0].version = 'v2', 'missing acceptance version': f => delete f.host.transfer_acceptance.version })) test(`receiver/source/current authority rejects ${name}`, () => { const f = fixture('sale', 'transfer'); mutate(f); assert.equal(evaluate(f).result, 'BLOCKED'); });
test('implicit administration activation blocked outside transfer', () => { const f = fixture('rental-placement'); f.request.services.push('existing-lease-administration'); f.host.administration_activated = true; assert.equal(evaluate(f).result, 'BLOCKED'); });
for (const [name, mutate] of Object.entries({ 'missing task': f => delete f.request.task_ref, 'invalid service': f => f.request.service = 'all', 'implicit mixed services': f => f.request.services = [], 'duplicate services': f => f.request.services.push('sale'), 'missing unit': f => delete f.request.unit_ref, 'invalid mode': f => f.request.mode = 'execute', 'missing host clock': f => delete f.host.now, 'missing requirements': f => delete f.host.action.requirements, 'duplicate requirements': f => f.host.action.requirements.push('mandate') })) test(`input rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => evaluate(f)); });
test('generic input adapter preserves base contract without copying method', () => { const f = fixture(); const input = projectBaseInput(f.request, f.host); assert.equal(input.subject_ref, f.request.property_ref); assert.equal(input.authority.scope, f.request.next_action); assert.equal(input.requirements.length, f.host.action.requirements.length); assert.equal(input.organization_ref, f.request.organization_ref); });
const composition = JSON.parse(readFileSync(new URL('../skills/woia-re-property-acquisition/references/delta-contract.json', import.meta.url)));
test('release metadata key order does not alter identity', () => { const c = structuredClone(composition); for (const key of ['core', 'base']) c[key] = Object.fromEntries(Object.entries(c[key]).reverse()); c.providers = c.providers.map(x => Object.fromEntries(Object.entries(x).reverse())); assert.equal(validateComposition(c).result, 'PRE_RELEASE_CONFORMANCE_PASS'); });
test('pre-release ADD/SPECIALIZE/NARROW conformance never qualifies or activates', () => { const c = validateComposition(composition); assert.equal(c.result, 'PRE_RELEASE_CONFORMANCE_PASS'); assert.equal(c.activation_allowed, false); assert.equal(c.pair_qualified, false); assert.deepEqual(composition.evaluated_pairs, []); });
test('composition rejects missing slot or missing delta semantics gate', () => { const c = structuredClone(composition); c.operations.pop(); assert.equal(validateComposition(c).result, 'BLOCKED'); c.operations = structuredClone(composition.operations); c.additional_gates = []; assert.equal(validateComposition(c).result, 'BLOCKED'); });
for (const [name, mutate] of Object.entries({ widening: c => c.operations[0].operation = 'WIDEN', 'unexported slot': c => c.operations[0].slot = 'new-runtime', 'missing inherited gate': c => c.inherited_gates.pop(), 'wrong base range': c => c.base_range.max_exclusive = '1.0.0', 'different base': c => c.base.version = '0.5.1', 'Core main substitution': c => c.core.commit = 'f'.repeat(40), 'closure missing': c => c.providers.pop(), 'closure duplicate': c => c.providers[0] = c.providers[1], 'provider wrong release': c => c.providers[0].version = '0.5.1', 'two active roots': c => c.expected_active_roots = 2, 'generic active root': c => c.selected_root = 'woia-supply-acquisition', 'early qualification': c => c.status = 'QUALIFIED', 'fake evaluated pair': c => c.evaluated_pairs.push({ result: 'PASS' }) })) test(`composition rejects ${name}`, () => { const c = structuredClone(composition); mutate(c); assert.equal(validateComposition(c).result, 'BLOCKED'); });
