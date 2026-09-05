import { reviewCaseRepository } from "./review-case-repository";
import { createReviewCaseService } from "./review-case-service";

export const reviewCaseService = createReviewCaseService(reviewCaseRepository);
