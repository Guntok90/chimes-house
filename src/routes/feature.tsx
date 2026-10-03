import { createFileRoute } from "@tanstack/react-router";
import { RequestFormPage } from "@/components/chimes/request-form";

export const Route = createFileRoute("/feature")({
  head: () => ({
    meta: [
      { title: "Request a feature · Chimes" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Request a new feature for Dad’s Chimes dashboard.",
      },
    ],
  }),
  component: () => <RequestFormPage kind="feature" />,
});
