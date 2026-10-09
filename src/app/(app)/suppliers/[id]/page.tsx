"use client";

import { use } from "react";
import { PartyDetail } from "@/components/parties";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PartyDetail type="supplier" id={id} />;
}
