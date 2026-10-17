"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { NotFoundContent } from "@/components/not-found-page";
import { api } from "@/lib/client";

/** A customer or supplier opened by id (from a link that does not know which): goes to the right page. */
export default function PartyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api<{ party: { type: string } }>(`/api/parties/${id}`)
      .then((r) => router.replace(`/${r.party.type === "supplier" ? "suppliers" : "customers"}/${id}`))
      .catch(() => setMissing(true));
  }, [id, router]);
  return missing ? <NotFoundContent /> : <Spinner />;
}
