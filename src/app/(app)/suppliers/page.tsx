"use client";

import { Suspense } from "react";
import { PartiesList } from "@/components/parties";
import { Spinner } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <PartiesList type="supplier" />
    </Suspense>
  );
}
