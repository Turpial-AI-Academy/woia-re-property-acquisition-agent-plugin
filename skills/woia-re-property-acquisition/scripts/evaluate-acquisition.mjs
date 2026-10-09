/** Pure acquisition delta evaluation. Host resolves the trusted second argument.
 * No persistence, dispatch, permission grant, qualification or Core lifecycle. */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const bindings = JSON.parse(readFileSync(new URL('../references/release-bindings.json', import.meta.url), 'utf8'));
export const SERVICES = Object.freeze(['sale', 'rental-placement', 'existing-lease-administration']);
export const SLOTS = Object.freeze(['service-intake', 'representation-authorization', 'readiness-evaluation', 'receiver-contribution', 'outcome-continuity']);
const text = value => typeof value === 'string' && value.trim().length > 0;
const same = isDeepStrictEqual;
const scoped = (a, b) => ['organization_ref', 'actor_ref', 'property_ref', 'unit_ref', 'principal_ref', 'purpose', 'scope_version', 'service'].every(k => a?.[k] === b?.[k]);
const current = (record, host) => record?.current === true && record?.revoked === false && record?.hold === false && Number.isSafeInteger(record?.valid_from) && Number.isSafeInteger(record?.valid_until) && record.valid_from <= host.now && record.valid_until > host.now && record.valid_until > record.valid_from;
const noEffects = { dispatch_performed: false, fact_written: false, authority_granted: false, task_written: false, pair_qualified: false, activation_allowed: false, production_ready: false };

/** Exact proposed package the receiver must independently accept. No acceptance is created. */
export function transferPayload(request, host) {
  return { task_ref: request.task_ref, organization_ref: request.organization_ref, actor_ref: request.actor_ref, property_ref: request.property_ref, unit_ref: request.unit_ref, principal_ref: request.principal_ref, purpose: request.purpose, scope_version: request.scope_version, service: request.service, next_action: request.next_action, source_map_revision: request.source_map_revision, snapshot_ref: request.snapshot_ref,
    evidence: host.facts.map(f => ({ kind: f.kind, ref: f.ref, version: f.version, source_ref: f.source_ref, decision_ref: f.decision_ref })).sort((a, b) => a.kind.localeCompare(b.kind)) };
}

export function validateComposition(candidate) {
  const blockers = [];
  if (!candidate || typeof candidate !== 'object') return { result: 'BLOCKED', blockers: ['COMPOSITION_REQUIRED'], ...noEffects };
  for (const key of ['core', 'base']) if (!same(candidate[key], bindings[key])) blockers.push(`EXACT_${key.toUpperCase()}_RELEASE_REQUIRED`);
  const releases = candidate.providers;
  if (!Array.isArray(releases) || releases.length !== 8 || new Set(releases?.map(x => x.plugin)).size !== 8 || bindings.providers.some(x => !releases.some(y => same(x, y)))) blockers.push('EXACT_PROVIDER_CLOSURE_REQUIRED');
  if (!same(candidate.exported_slots, SLOTS)) blockers.push('BASE_SLOTS_REQUIRED');
  const approved = SLOTS.map((slot, index) => ({ slot, operation: ['SPECIALIZE', 'NARROW', 'SPECIALIZE', 'NARROW', 'ADD'][index] }));
  if (!same(candidate.operations, approved)) blockers.push('UNEXPORTED_OR_WIDENING_OPERATION');
  if (!same(candidate.inherited_gates, ['base-conformance', 'authority-narrowing', 'provider-closure', 'update-recovery'])) blockers.push('INHERITED_GATES_REQUIRED');
  if (!same(candidate.additional_gates, ['delta-semantics'])) blockers.push('DELTA_SEMANTICS_GATE_REQUIRED');
  if (candidate.base_range?.min_inclusive !== '0.5.0' || candidate.base_range?.max_exclusive !== '0.6.0') blockers.push('BASE_RANGE_REQUIRED');
  if (candidate.expected_active_roots !== 1 || candidate.selected_root !== 'woia-re-property-acquisition') blockers.push('ONE_SELECTED_ROOT_REQUIRED');
  if (candidate.status !== 'NOT_QUALIFIED' || !Array.isArray(candidate.evaluated_pairs) || candidate.evaluated_pairs.length) blockers.push('PRE_RELEASE_PAIR_MUST_REMAIN_UNQUALIFIED');
  return { result: blockers.length ? 'BLOCKED' : 'PRE_RELEASE_CONFORMANCE_PASS', blockers, activation_allowed: false, ...noEffects };
}

function validateRequest(request, host) {
  if (!request || !host || Array.isArray(request) || Array.isArray(host)) throw new Error('request and host-resolved context required');
  for (const key of ['task_ref', 'organization_ref', 'actor_ref', 'property_ref', 'principal_ref', 'purpose', 'scope_version', 'service', 'next_action', 'source_map_revision', 'idempotency_key', 'snapshot_ref']) if (!text(request[key])) throw new Error(`${key} required`);
  if (!(request.unit_ref === null || text(request.unit_ref))) throw new Error('explicit unit_ref or null required');
  if (!SERVICES.includes(request.service) || !['prepare', 'next-action', 'transfer'].includes(request.mode)) throw new Error('approved service and evaluation mode required');
  if (!Array.isArray(request.services) || !request.services.length || new Set(request.services).size !== request.services.length || request.services.some(x => !SERVICES.includes(x)) || !request.services.includes(request.service)) throw new Error('explicit unique requested service scopes required');
  if (!Number.isSafeInteger(host.now) || !Array.isArray(host.facts) || !Array.isArray(host.source_rules) || !Array.isArray(host.contributions) || !Array.isArray(host.action?.requirements)) throw new Error('resolved clock, facts, source rules, contributions and action requirements required');
}

function acceptedFact(fact, request, host, kind) {
  if (!fact || fact.kind !== kind || !scoped(fact, request) || fact.next_action !== request.next_action || !current(fact, host) || fact.status !== 'ACCEPTED' || ['ref', 'version', 'source_ref', 'accepted_by', 'decision_ref'].some(k => !text(fact[k]))) return false;
  if (kind === 'representation' && fact.disputed !== false) return false;
  if (kind === 'existing-lease' && fact.lifecycle !== 'ACTIVE') return false;
  const rules = host.source_rules.filter(rule => rule.kind === kind && scoped(rule, request) && current(rule, host) && rule.source_map_revision === request.source_map_revision);
  return rules.length === 1 && rules[0].source_ref === fact.source_ref && rules[0].competent_owner === fact.accepted_by && fact.source_map_revision === request.source_map_revision;
}

/** Invocation is an engineering evaluation, never a runtime activation.
 * baseResult MUST be produced by the pinned base evaluateIntake on projectBaseInput.
 * host is independently authenticated/resolved, not request-supplied authority. */
export function evaluateAcquisition(request, host, baseResult) {
  validateRequest(request, host);
  const blockers = [];
  const add = reason => blockers.push(reason);
  if (host.emergency_stop !== false) add('EMERGENCY_STOP_OR_UNKNOWN');
  if (!scoped(host.scope, request) || !same(host.scope?.services, request.services)) add('TRUSTED_SCOPE_MISMATCH');
  if (host.source_map_revision !== request.source_map_revision || host.snapshot_ref !== request.snapshot_ref || !same(host.core_release, bindings.core) || !same(host.base_release, bindings.base)) add('PINNED_SOURCE_OR_RELEASE_MISMATCH');
  if (!scoped(host.action, request) || host.action?.next_action !== request.next_action || host.action?.mode !== request.mode || !current(host.action, host) || !text(host.action?.policy_ref) || typeof host.action.requires_mandate !== 'boolean') add('CURRENT_SCOPED_ACTION_POLICY_REQUIRED');
  const grant = host.grant;
  if (!scoped(grant, request) || !current(grant, host) || grant?.next_action !== request.next_action || !text(grant?.decision_ref) || !text(grant?.owner) || grant.owner !== host.action.competent_owner || grant?.status !== 'ACCEPTED' || grant?.source_map_revision !== request.source_map_revision) add('COMPETENT_SCOPED_AUTHORITY_REQUIRED');
  if (host.action?.effect_class !== 'NONE' || host.action?.department !== 'supply-acquisition') add('DELTA_CANNOT_EXECUTE_EFFECT_OR_WRITE');
  const baseFields = { task_ref: request.task_ref, subject_ref: request.property_ref, service: request.service, next_action: request.next_action, source_map_revision: request.source_map_revision, idempotency_key: request.idempotency_key };
  if (baseResult?.result !== 'NEXT_ACTION_ELIGIBLE' || Object.keys(baseFields).some(k => baseResult?.[k] !== baseFields[k]) || baseResult?.dispatch_performed !== false || baseResult?.fact_written !== false || baseResult?.authority_granted !== false) add('BOUND_BASE_EVALUATION_REQUIRED');
  if (host.effect_status === 'UNKNOWN') add('RECONCILE_BEFORE_RETRY');
  if (!['KNOWN', 'NONE', 'UNKNOWN'].includes(host.effect_status)) add('EFFECT_OBSERVATION_REQUIRED');
  if (host.previous_snapshot_ref && host.previous_snapshot_ref !== request.snapshot_ref) add('FROZEN_CORE_SNAPSHOT_CHANGED');
  if (host.previous_scope_version && host.previous_scope_version !== request.scope_version) add('MATERIAL_CHANGE_REEVALUATION_REQUIRED');
  if (host.previous_idempotency_key && host.previous_idempotency_key !== request.idempotency_key && host.effect_status === 'UNKNOWN') add('UNKNOWN_EFFECT_KEY_MUST_BE_RETAINED');
  const requirements = [...host.action.requirements];
  if (requirements.some(x => !text(x)) || new Set(requirements).size !== requirements.length) throw new Error('unique accepted requirement kinds required');
  if (request.mode !== 'prepare' && host.action.requires_mandate !== true) add('DEPENDENT_ACTION_REQUIRES_MANDATE');
  if (host.action.requires_mandate) for (const kind of ['representation', 'mandate', 'accepted-terms']) if (!requirements.includes(kind)) requirements.push(kind);
  if (request.mode !== 'prepare' && request.service === 'existing-lease-administration') for (const kind of ['existing-lease', 'participants', 'responsibilities', 'documents', 'source-cutover']) if (!requirements.includes(kind)) requirements.push(kind);
  for (const kind of requirements) {
    const facts = host.facts.filter(x => x.kind === kind);
    if (facts.length !== 1 || !acceptedFact(facts[0], request, host, kind)) add(`ACCEPTED_SOURCE_REQUIRED:${kind}`);
  }
  if (request.service === 'existing-lease-administration' && (host.action.requirements.some(x => ['listing', 'promotional-photos', 'placement-history', 'tenant-search'].includes(x)))) add('FICTIONAL_ADMINISTRATION_PREREQUISITE');
  const requests = new Set(), outcomes = new Set();
  for (const contribution of host.contributions) {
    if (!text(contribution.request_ref) || requests.has(contribution.request_ref)) { add('DUPLICATE_OR_MISSING_CONTRIBUTION'); continue; }
    requests.add(contribution.request_ref);
    const outcome = JSON.stringify([contribution.receiver, contribution.objective, contribution.shared_ref]);
    if (outcomes.has(outcome)) add('DUPLICATE_DISTINCT_OUTCOME');
    outcomes.add(outcome);
    if (!['operations', 'legal-compliance', 'customer-service', 'finance', 'data'].includes(contribution.receiver) || contribution.distinct_outcome !== true || !text(contribution.objective) || !text(contribution.shared_ref) || !scoped(contribution, request) || contribution.next_action !== request.next_action || contribution.snapshot_ref !== request.snapshot_ref || contribution.origin_task_ref !== request.task_ref || !text(contribution.receiver_task_ref) || contribution.receiver_task_ref === request.task_ref) add(`INVALID_DISTINCT_CONTRIBUTION:${contribution.request_ref}`);
    if (contribution.status !== 'ACCEPTED_RESULT' || !text(contribution.response_ref) || !text(contribution.acceptance_ref) || contribution.accepted_by !== contribution.receiver || !current(contribution, host)) add(`RECEIVER_RESULT_PENDING:${contribution.request_ref}`);
  }
  if (!text(host.continuity?.owner) || !text(host.continuity?.review_ref) || !scoped(host.continuity, request) || host.continuity.snapshot_ref !== request.snapshot_ref) add('SCOPED_OWNED_CONTINUITY_REQUIRED');
  const transfer = host.transfer;
  if (request.mode === 'transfer') {
    const receiver = { sale: 'sales', 'rental-placement': 'leasing', 'existing-lease-administration': 'asset-management' }[request.service];
    if (transfer?.status !== 'ACCEPTED' || transfer?.receiver !== receiver || transfer?.accepted_by !== receiver || !text(transfer?.acceptance_ref) || !text(transfer?.source_ref) || !scoped(transfer, request) || transfer?.snapshot_ref !== request.snapshot_ref || !current(transfer, host)) add('COMPETENT_RECEIVER_TRANSFER_REQUIRED');
    const acceptance = host.transfer_acceptance;
    if (!acceptance || acceptance.ref !== transfer?.acceptance_ref || acceptance.source_ref !== transfer?.source_ref || acceptance.accepted_by !== receiver || acceptance.status !== 'ACCEPTED' || !current(acceptance, host) || !text(acceptance.version) || !same(acceptance.accepted_payload, transferPayload(request, host))) add('EXACT_RECEIVER_ACCEPTANCE_PAYLOAD_REQUIRED');
  }
  if (host.administration_activated === true && !(request.service === 'existing-lease-administration' && request.mode === 'transfer')) add('ADMINISTRATION_REQUIRES_SEPARATE_ACTIVE_LEASE_TRANSFER');
  return { result: blockers.length ? 'BLOCKED' : 'NEXT_ACTION_ELIGIBLE', blockers, ...baseFields, scope_version: request.scope_version, snapshot_ref: request.snapshot_ref, service_only: request.service, parent_completed: false, downstream_owner: request.mode === 'transfer' && !blockers.length ? transfer.receiver : null, retained_owner: request.mode === 'transfer' && !blockers.length ? null : host.continuity?.owner ?? null, ...noEffects };
}

/** Adapter to the existing generic base input, not a second generic method. */
export function projectBaseInput(request, host) {
  validateRequest(request, host);
  return { task_ref: request.task_ref, subject_ref: request.property_ref, service: request.service, next_action: request.next_action, source_map_revision: request.source_map_revision, idempotency_key: request.idempotency_key, organization_ref: request.organization_ref, actor_ref: request.actor_ref, purpose: request.purpose,
    authority: { ...host.grant, subject_ref: request.property_ref, scope: request.next_action },
    requirements: host.action.requirements.map(kind => { const f = host.facts.find(x => x.kind === kind); return { id: kind, action: request.next_action, status: f?.status, evidence_ref: f?.ref, source_ref: f?.source_ref, version: f?.version, accepted_by: f?.accepted_by }; }),
    contributions: host.contributions.map(c => ({ ...c, owner: c.receiver })), continuity: host.continuity, effect_status: host.effect_status,
    ...(request.mode === 'transfer' ? { transfer: host.transfer } : {}) };
}
