import { getWorkflowDefinition, registerWorkflowDefinition, workflows, type WorkflowDefinition } from "./workflow";
import { store } from "./store";

/**
 * Server-side workflow resolution. Custom workflows live in the store and are
 * registered into the engine registry on first use, so every later request in
 * this process resolves them synchronously.
 */
let customLoaded = false;

export async function loadCustomWorkflows(): Promise<void> {
  if (customLoaded) return;
  customLoaded = true;

  try {
    for (const row of await store.listWorkflows()) {
      const definition = row.definition as WorkflowDefinition;
      if (definition && typeof definition.id === "string" && Array.isArray(definition.nodes)) {
        registerWorkflowDefinition(definition);
      }
    }
  } catch {
    // Without the store the bundled journeys still run.
  }
}

export async function resolveWorkflow(id: string): Promise<WorkflowDefinition | undefined> {
  await loadCustomWorkflows();
  return getWorkflowDefinition(id);
}

export async function listAllWorkflowDefinitions(): Promise<WorkflowDefinition[]> {
  await loadCustomWorkflows();

  const bundled = Object.values(workflows);
  const seen = new Set(bundled.map((definition) => definition.id));

  let custom: WorkflowDefinition[] = [];
  try {
    custom = [...(await store.listWorkflows())]
      .map((row) => row.definition as WorkflowDefinition)
      .filter((definition) => definition && typeof definition.id === "string" && !seen.has(definition.id));
  } catch {
    // Without the store the bundled journeys are still listed.
  }

  return [...bundled, ...custom];
}
