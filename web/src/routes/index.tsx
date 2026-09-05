import { createFileRoute } from "@tanstack/react-router";
import { FieldManual } from "@/components/field-manual";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FieldManual />;
}
