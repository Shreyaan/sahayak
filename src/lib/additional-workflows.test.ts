import { expect, test } from 'bun:test';
import { applyIntent, currentNode, getWorkflowDefinition, recordDeskReport, startCase, workflowDefinitionSchema, type CaseSnapshot } from './workflow';

function report(snapshot: CaseSnapshot, optionId: string) {
  return recordDeskReport(snapshot, { optionId, response: 'SYNTHETIC verification response', referenceNumber: `SYN-${optionId}`, responseDate: '2026-09-06', recordedAt: '2026-09-06T12:00:00Z' }).caseSnapshot;
}

test('Punjab certificate remains unresolved through support and a failed download', () => {
  expect(getWorkflowDefinition('punjab-income')).toBeDefined();
  let snapshot = startCase('punjab-income');
  expect(workflowDefinitionSchema.safeParse(getWorkflowDefinition('punjab-income')).success).toBe(true);
  expect(currentNode(snapshot)?.visit?.office.en).toContain('Sewa Kendra');
  snapshot = report(snapshot, 'pending');
  expect(currentNode(snapshot)?.id).toBe('punjab-support');
  snapshot = report(snapshot, 'no-answer');
  expect(currentNode(snapshot)?.id).toBe('punjab-support');
  snapshot = report(snapshot, 'acknowledged');
  expect(snapshot.nodes.find(n => n.id === 'punjab-status')?.state).toBe('blocked');
  snapshot = report(snapshot, 'waiting');
  expect(currentNode(snapshot)?.id).toBe('punjab-follow-up');
  snapshot = report(snapshot, 'issued');
  snapshot = applyIntent(snapshot, 'negative').caseSnapshot;
  expect(currentNode(snapshot)?.id).toBe('punjab-support');
  expect(snapshot.nodes.filter(n => n.state === 'needs-you')).toHaveLength(1);
  snapshot = report(snapshot, 'issued');
  snapshot = applyIntent(snapshot, 'affirmative').caseSnapshot;
  expect(currentNode(snapshot)?.id).toBe('case-done');
  expect(snapshot.nodes.find(n => n.id === 'punjab-status')?.state).toBe('done');
  expect(snapshot.reports).toHaveLength(6);
});

test('Aadhaar rejection stays unresolved through a help acknowledgement and supports another setback', () => {
  expect(getWorkflowDefinition('aadhaar-update')).toBeDefined();
  let snapshot = startCase('aadhaar-update');
  expect(workflowDefinitionSchema.safeParse(getWorkflowDefinition('aadhaar-update')).success).toBe(true);
  snapshot = report(snapshot, 'rejected');
  expect(currentNode(snapshot)?.id).toBe('aadhaar-help');
  snapshot = report(snapshot, 'guidance-received');
  expect(snapshot.nodes.find(n => n.id === 'aadhaar-status')?.state).toBe('blocked');
  snapshot = applyIntent(snapshot, 'negative').caseSnapshot;
  expect(snapshot.nodes.filter(n => n.state === 'needs-you')).toHaveLength(1);
  expect(currentNode(snapshot)?.id).toBe('aadhaar-help');
  snapshot = report(snapshot, 'guidance-received');
  snapshot = applyIntent(snapshot, 'affirmative').caseSnapshot;
  expect(snapshot.nodes.find(n => n.id === 'aadhaar-status')?.state).toBe('done');
  expect(currentNode(snapshot)?.id).toBe('case-done');
  expect(snapshot.reports).toHaveLength(3);
});

test('EPFO grievance registration cannot mark a pending claim paid', () => {
  expect(getWorkflowDefinition('epfo-claim')).toBeDefined();
  let snapshot = startCase('epfo-claim');
  expect(workflowDefinitionSchema.safeParse(getWorkflowDefinition('epfo-claim')).success).toBe(true);
  snapshot = report(snapshot, 'pending');
  expect(currentNode(snapshot)?.id).toBe('epfo-grievance');
  snapshot = report(snapshot, 'could-not-submit');
  expect(currentNode(snapshot)?.id).toBe('epfo-grievance');
  snapshot = report(snapshot, 'submitted');
  expect(currentNode(snapshot)?.id).toBe('epfo-follow-up');
  snapshot = report(snapshot, 'waiting');
  expect(currentNode(snapshot)?.id).toBe('epfo-follow-up');
  expect(snapshot.nodes.find(n => n.id === 'epfo-status')?.state).toBe('blocked');
  snapshot = report(snapshot, 'credited');
  snapshot = applyIntent(snapshot, 'affirmative').caseSnapshot;
  expect(currentNode(snapshot)?.id).toBe('case-done');
  expect(snapshot.nodes.find(n => n.id === 'epfo-status')?.state).toBe('done');
  expect(snapshot.reports).toHaveLength(5);
});
