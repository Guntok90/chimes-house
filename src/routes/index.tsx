import { createFileRoute } from "@tanstack/react-router";
import { ChimesDashboard } from "@/components/chimes/dashboard";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ChimesDashboard />;
}
