import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { isAllowedPublicAuthPath } from "@/lib/auth/public-route";

const handler = toNextJsHandler(auth);

function guarded(next: (request: Request) => Promise<Response>) {
  return (request: Request) => isAllowedPublicAuthPath(new URL(request.url).pathname)
    ? next(request)
    : Response.json(
        { error: { code: "FORBIDDEN", message: "This organization operation is not available." } },
        { status: 403 },
      );
}

export const GET = guarded(handler.GET);
export const POST = guarded(handler.POST);
