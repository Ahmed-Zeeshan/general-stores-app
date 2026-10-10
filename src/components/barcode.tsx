"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { barcodeFormat } from "@/lib/barcode";

/** Renders a barcode as SVG (sharp when printed at any size). */
export function BarcodeSvg({
  value,
  height = 40,
  width = 1.6,
  fontSize = 12,
  displayValue = true,
  className,
  style,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: barcodeFormat(value),
        height,
        width,
        fontSize,
        // Side margins give scanners the blank "quiet zone" they need; the bottom margin keeps
        // the digits under EAN barcodes from being cut off.
        marginTop: 0,
        marginBottom: displayValue ? 4 : 0,
        marginLeft: 12,
        marginRight: 12,
        displayValue,
        textMargin: 1,
        background: "transparent",
      });
    } catch {
      // Characters CODE128 cannot encode: show nothing rather than crash the page.
      ref.current.innerHTML = "";
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} className={className} style={style} role="img" aria-label={`Barcode ${value}`} />;
}
