import { expect, test } from 'bun:test';
import { applyCitizenReply, currentNode, getWorkflowDefinition, recordDeskReport, startCase, workflowDefinitionSchema, type CaseSnapshot } from './workflow';

function report(snapshot: CaseSnapshot, optionId: string) {
  return recordDeskReport(snapshot, { optionId, response: 'SYNTHETIC verification response', referenceNumber: `SYN-${optionId}`, responseDate: '2026-09-06', recordedAt: '2026-09-06T12:00:00Z' }).caseSnapshot;
}

test('Aadhaar rejection stays unresolved through a help acknowledgement and supports another setback', () => {
  expect(getWorkflowDefinition('aadhaar-update')).toBeDefined();
  let snapshot = startCase('aadhaar-update');
  expect(workflowDefinitionSchema.safeParse(getWorkflowDefinition('aadhaar-update')).success).toBe(true);
  snapshot = report(snapshot, 'rejected');
  expect(currentNode(snapshot)?.id).toBe('aadhaar-help');
  snapshot = report(snapshot, 'guidance-received');
  expect(snapshot.nodes.find(n => n.id === 'aadhaar-status')?.state).toBe('blocked');
  snapshot = applyCitizenReply(snapshot, 'no').caseSnapshot;
  expect(snapshot.nodes.filter(n => n.state === 'needs-you')).toHaveLength(1);
  expect(currentNode(snapshot)?.id).toBe('aadhaar-help');
  snapshot = report(snapshot, 'guidance-received');
  snapshot = applyCitizenReply(snapshot, 'yes').caseSnapshot;
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
  snapshot = applyCitizenReply(snapshot, 'yes').caseSnapshot;
  expect(currentNode(snapshot)?.id).toBe('case-done');
  expect(snapshot.nodes.find(n => n.id === 'epfo-status')?.state).toBe('done');
  expect(snapshot.reports).toHaveLength(5);
});
