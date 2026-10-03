import { createFileRoute } from "@tanstack/react-router";
import { RequestFormPage } from "@/components/chimes/request-form";

export const Route = createFileRoute("/bug")({
  head: () => ({
    meta: [
      { title: "Report a bug · Chimes" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Report a bug on Dad’s Chimes dashboard." },
    ],
  }),
  component: () => <RequestFormPage kind="bug" />,
});
