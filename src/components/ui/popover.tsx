"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const popupClassName =
  "z-50 max-w-[min(16rem,calc(100vw-1.5rem))] origin-(--transform-origin) rounded-lg border border-app-line bg-app-panel-strong px-3 py-2 text-sm font-bold text-app-text shadow-app outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

function PopoverContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "center",
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-50">
        <PopoverPrimitive.Popup data-slot="popover-content" className={cn(popupClassName, className)} {...props}>
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
