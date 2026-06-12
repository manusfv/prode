"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuSubmenu = MenuPrimitive.SubmenuRoot;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const popupClassName =
  "z-50 min-w-48 origin-(--transform-origin) rounded-lg border border-app-line bg-app-panel-strong p-1 text-app-text shadow-app outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const itemClassName =
  "relative flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm font-bold text-app-text outline-none transition-colors data-highlighted:bg-app-surface-2 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

function DropdownMenuContent({
  className,
  children,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-50">
        <MenuPrimitive.Popup data-slot="dropdown-menu-content" className={cn(popupClassName, className)} {...props}>
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClassName, className)} {...props} />;
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-app-line", className)}
      {...props}
    />
  );
}

function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1 text-xs font-black uppercase tracking-wide text-app-muted", className)}
      {...props}
    />
  );
}

function DropdownMenuSubmenuTrigger({ className, children, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-submenu-trigger"
      className={cn(itemClassName, "data-popup-open:bg-app-surface-2", className)}
      {...props}
    >
      {children}
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubmenuContent({
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <DropdownMenuContent side="inline-end" align="start" className={cn("min-w-40", className)} {...props}>
      {children}
    </DropdownMenuContent>
  );
}

function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn(itemClassName, "pr-8", className)} {...props}>
      {children}
      <MenuPrimitive.RadioItemIndicator
        render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center text-app-brand" />}
      >
        <CheckIcon className="pointer-events-none" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuSubmenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
