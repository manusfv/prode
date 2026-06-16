"use client";

import { Check, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { stageLabels, stageOrder } from "@/lib/tournament";
import type { MatchStatus, Stage } from "@/lib/types";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function StageBadge({ stage, group }: { stage: Stage; group?: string }) {
  return (
    <Badge variant="outline" className="rounded-full bg-app-surface-2 px-2.5 py-1 text-xs font-black uppercase text-app-muted">
      {stageLabels[stage]}{group ? ` · Grupo ${group}` : ""}
    </Badge>
  );
}

export function StatusChip({
  status,
  label,
  detail,
}: {
  status: MatchStatus;
  label: string;
  detail?: string;
}) {
  const badgeClassName = cn(
    "rounded-full px-2.5 py-1 text-xs font-black uppercase",
    status === "open" && "bg-app-blue/10 text-app-blue",
    status === "locked" && "bg-app-amber/15 text-app-amber",
    status === "finalized" && "bg-app-green/10 text-app-green",
  );
  const variant = status === "open" ? "secondary" : status === "locked" ? "outline" : "default";

  if (!detail) {
    return (
      <Badge variant={variant} className={badgeClassName}>
        {label}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        openOnHover
        delay={150}
        render={
          <Badge
            variant={variant}
            className={cn(badgeClassName, "cursor-help underline decoration-dotted underline-offset-2")}
            aria-label={detail}
          />
        }
      >
        {label}
      </PopoverTrigger>
      <PopoverContent>{detail}</PopoverContent>
    </Popover>
  );
}

export function StageTabs<T extends string = Stage>({
  activeStage,
  enabledStages,
  onChange,
  showDisabled = true,
  leadingOption,
  label = "Etapa",
}: {
  activeStage: T;
  enabledStages: Set<Stage>;
  onChange?: (stage: T) => void;
  showDisabled?: boolean;
  /** Optional non-stage entry rendered before the stages (e.g. "Acumulado"). */
  leadingOption?: { value: T; label: string };
  /** Micro-label shown inside the mobile select trigger. */
  label?: string;
}) {
  const activeLabel =
    leadingOption && activeStage === leadingOption.value
      ? leadingOption.label
      : stageLabels[activeStage as Stage];
  const triggerClass =
    "!h-9 shrink-0 rounded-md px-3 text-sm font-extrabold text-app-muted transition-colors hover:text-app-text data-active:bg-app-brand data-active:text-app-brand-fg data-active:shadow-sm disabled:opacity-40 disabled:hover:text-app-muted sm:min-w-20 sm:px-4";

  return (
    <>
      <Select value={activeStage} onValueChange={(value) => onChange?.(value as T)}>
        <SelectTrigger className={cn(ui.control, "w-full sm:hidden")} aria-label={label}>
          <span className={ui.label}>{label}</span>
          <SelectValue className={ui.controlValue}>{activeLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {leadingOption && (
            <>
              <SelectItem value={leadingOption.value}>{leadingOption.label}</SelectItem>
              <SelectSeparator />
            </>
          )}
          {stageOrder.map((stage) => (
            <SelectItem
              key={stage}
              value={stage}
              disabled={showDisabled ? !enabledStages.has(stage) : false}
            >
              {stageLabels[stage]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tabs
        value={activeStage}
        onValueChange={(value) => onChange?.(value as T)}
        className="hidden min-w-0 sm:block"
      >
        <TabsList className="flex !h-auto w-full min-w-0 max-w-full flex-wrap gap-1.5 rounded-xl border border-app-line bg-app-panel p-1.5">
          {leadingOption && (
            <>
              <TabsTrigger value={leadingOption.value} className={triggerClass}>
                {leadingOption.label}
              </TabsTrigger>
              <span aria-hidden="true" className="mx-0.5 my-0.5 w-px self-stretch bg-app-line" />
            </>
          )}
          {stageOrder.map((stage) => (
            <TabsTrigger
              key={stage}
              value={stage}
              disabled={showDisabled ? !enabledStages.has(stage) : false}
              className={triggerClass}
            >
              {stageLabels[stage]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}

export function SaveStatus({ state }: { state: "saving" | "saved" | "error" }) {
  const label = {
    saving: "Guardando",
    saved: "Guardado",
    error: "Error al guardar",
  }[state];

  return (
    <Badge
      variant={state === "error" ? "destructive" : "secondary"}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border border-app-line bg-app-surface px-3 text-xs font-black",
        state === "saved" && "text-app-green",
        state === "error" && "text-app-red",
      )}
    >
      {state === "saved" && <Check size={14} />}
      {label}
    </Badge>
  );
}

export function LoadingLabel({ loading, icon, label }: { loading: boolean; icon?: ReactNode; label: string }) {
  return (
    <>
      {loading ? <LoaderCircle className="animate-spin" size={16} /> : icon}
      {label}
    </>
  );
}

export function AutoBadge() {
  return (
    <Badge
      variant="outline"
      className="rounded-full bg-app-blue/10 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-app-blue"
      aria-label="Resultado cargado automáticamente"
    >
      Auto
    </Badge>
  );
}
