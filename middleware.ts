import { type NextRequest } from "next/server";
import { updateSession } from "@platform/supabase/middleware";

/**
 * Edge session refresh. Authorization still happens in server layouts and actions.
 * OpenNext 1.19.x requires this middleware filename; see the Originals middleware note.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|html)$).*)",
  ],
  runtime: "experimental-edge",
};
