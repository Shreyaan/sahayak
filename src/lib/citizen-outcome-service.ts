import { createCitizenOutcomeService } from "./citizen-outcomes";
import { citizenOutcomeRepository } from "./citizen-outcome-repository";

export const citizenOutcomeService = createCitizenOutcomeService(citizenOutcomeRepository);
