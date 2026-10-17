"use client";

import Link from "next/link";
import { refLink } from "@/lib/links";

/** A record number that opens its record (bill, return, receipt, purchase…); plain text when there is nowhere to go. */
export function RefLink({ refType, refId, children, className = "font-semibold text-brand-700 hover:underline" }: { refType?: string | null; refId?: string | null; children: React.ReactNode; className?: string }) {
  const l = refLink(refType, refId);
  if (!l) return <>{children}</>;
  return l.newTab ? (
    <a href={l.href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link href={l.href} className={className}>
      {children}
    </Link>
  );
}

/** Parts joined with " · ", skipping empty ones. */
export function Dotted({ parts }: { parts: React.ReactNode[] }) {
  const list = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <>
      {list.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {p}
        </span>
      ))}
    </>
  );
}
