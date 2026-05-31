"use client";

import { useState } from "react";
import DiagnosticTester from "@/components/diagnostic-tester";
import AnalyticsDashboard from "@/components/analytics-dashboard";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleTestComplete() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      {/* Diagnostic tester */}
      <section>
        <DiagnosticTester onTestComplete={handleTestComplete} />
      </section>

      {/* Analytics dashboard */}
      <section>
        <AnalyticsDashboard refreshKey={refreshKey} />
      </section>
    </main>
  );
}
