import { createReviewHandlers } from "@/lib/admin/review-handlers";
import { serverAccess } from "@/lib/auth/server-instance";
import { reviewCaseService } from "@/lib/review-case-service-instance";

const handlers = createReviewHandlers({
  requireExpert: (headers) => serverAccess.requireExpert(headers),
  list: (filters) => reviewCaseService.list(filters),
  get: (id) => reviewCaseService.get(id),
});

export const GET = handlers.list;
