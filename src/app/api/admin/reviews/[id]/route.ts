import { createReviewHandlers } from "@/lib/admin/review-handlers";
import { serverAccess } from "@/lib/auth/server-instance";
import { reviewCaseService } from "@/lib/review-case-service-instance";

const handlers = createReviewHandlers({
  requireExpert: (headers) => serverAccess.requireExpert(headers),
  list: (filters) => reviewCaseService.list(filters),
  get: (id) => reviewCaseService.get(id),
  detail: (id) => reviewCaseService.detail(id),
  saveWording: (input) => reviewCaseService.saveWording(input),
  selectBaseline: (input) => reviewCaseService.selectBaseline(input),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.detail(request, (await context.params).id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.patch(request, (await context.params).id);
}
