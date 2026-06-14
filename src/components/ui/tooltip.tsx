"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const popupClassName =
  "z-50 max-w-[min(16rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-lg border border-app-line bg-app-panel-strong px-2.5 py-1.5 text-xs font-bold text-app-text shadow-app outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

/** Hover/focus tooltip. Wrap a focusable trigger element (e.g. an icon Button). */
function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 6,
  align = "center",
  delay = 200,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  delay?: number;
  className?: string;
} & Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-50">
            <TooltipPrimitive.Popup data-slot="tooltip-content" className={cn(popupClassName, className)}>
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export { Tooltip };
