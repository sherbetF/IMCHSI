import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/hospital/SiteHeader";
import { DatabaseModule } from "@/components/hospital/DatabaseModule";
import { SiteFooter } from "@/components/hospital/SiteFooter";

export const Route = createFileRoute("/database")({
  head: () => ({
    meta: [
      { title: "Diagnostic Database & Result Archive — Hospital Sultan Ismail" },
      {
        name: "description",
        content:
          "Central repository storing all uploaded lab results, diagnostic reports, and clinical documents for Hospital Sultan Ismail.",
      },
      {
        property: "og:title",
        content: "Diagnostic Database & Result Archive — Hospital Sultan Ismail",
      },
      {
        property: "og:description",
        content:
          "Central repository storing all uploaded lab results and diagnostic reports for Hospital Sultan Ismail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DatabasePage,
});

function DatabasePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <DatabaseModule />
      <SiteFooter />
    </div>
  );
}
