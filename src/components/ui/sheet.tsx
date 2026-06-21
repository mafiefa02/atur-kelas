"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "#/lib/utils.ts";

// A Sheet is a Dialog that slides in from a screen edge — used for the mobile
// navigation drawer. Built on the same Base UI Dialog primitive as dialog.tsx,
// so it gets the focus trap, Escape-to-close, and scroll lock for free.
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 supports-backdrop-filter:backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: DialogPrimitive.Popup.Props & { side?: "left" | "right" }) {
  const sideClass =
    side === "left"
      ? "inset-y-0 left-0 border-r data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
      : "inset-y-0 right-0 border-l data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full";
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex h-full w-72 max-w-[80vw] flex-col bg-card shadow-xl ring-1 ring-foreground/5 transition-transform duration-300 ease-out outline-none",
          sideClass,
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger };
