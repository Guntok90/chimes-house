import { createFileRoute } from "@tanstack/react-router";
import { hasValidInboxSession } from "@/lib/requests/inbox-auth";
import { getHouseRequestImage } from "@/lib/requests/store";

export const Route = createFileRoute("/api/inbox/images/$imageId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!hasValidInboxSession(request)) {
          return new Response(JSON.stringify({ error: "Authentication required" }), {
            status: 401,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }

        const imageId = params.imageId;
        if (!imageId || !/^img_[a-f0-9]+$/i.test(imageId)) {
          return new Response("Not found", { status: 404 });
        }

        const image = await getHouseRequestImage(imageId);
        if (!image) {
          return new Response("Not found", { status: 404 });
        }

        const bytes = Buffer.from(image.dataBase64, "base64");
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": image.mimeType,
            "Cache-Control": "private, max-age=3600",
            "Content-Length": String(bytes.byteLength),
          },
        });
      },
    },
  },
});
