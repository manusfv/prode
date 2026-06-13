"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  Info,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Pencil,
  ShieldCheck,
  Sun,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  approveProfileAction,
  createMatchAction,
  deleteGroupPredictionAction,
  deleteMatchAction,
  saveGroupStandingsAction,
  finalizeMatchAction,
  importMatchesCsvAction,
  recalculatePointsAction,
  saveGroupPredictionAction,
  savePredictionAction,
  updateGroupLocksAtAction,
  updateStageFlagAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { matchesToCsv } from "@/lib/csv";
import { scoreAllForMatch, scoreGroupPredictionOrNull } from "@/lib/scoring";
import {
  groups as seedGroups,
  groupPredictions as seedGroupPredictions,
  matches as seedMatches,
  predictions as seedPredictions,
  profiles as seedProfiles,
  stages as seedStages,
  teams as seedTeams,
} from "@/lib/seed";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import { loadSupabaseAppData } from "@/lib/supabase-data";
import type {
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageFlag,
  StageState,
  Team,
} from "@/lib/types";
import { pageTitles, tabRoutes, ui, type AppRoute } from "@/lib/ui-tokens";
import { getPredictionsStages, getResultsStages, getStandingsStages } from "@/lib/tab-visibility";
import { getLeaderboard } from "@/lib/standings";
import { useHydratedNow } from "@/lib/use-hydrated-now";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

import { LoadingScreen } from "@/components/auth/loading-screen";
import { PendingApproval } from "@/components/auth/pending-approval";
import {
  AppContext,
  type AppContextValue,
  type CreateMatchActionInput,
  type SaveGroupStandingsInput,
  type SaveState,
} from "./app-context";
import { PredictionDrawer } from "@/screens/predictions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuContent,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const routeTabs: Record<string, AppRoute> = {
  "/": "predictions",
  "/pronosticos": "predictions",
  "/tabla": "leaderboard",
  "/resultados": "results",
  "/estadisticas": "stats",
  "/reglas": "rules",
  "/admin": "admin",
  "/cuenta": "account",
};

function activeTabFromPath(pathname: string): AppRoute {
  return routeTabs[pathname] ?? "predictions";
}

// Paths that render their own standalone card with no app chrome.
const PUBLIC_AUTH_ROUTES = new Set(["/ingresar", "/crear-cuenta", "/recuperar", "/restablecer"]);
// Signed-in users are bounced away from these to the app. NOTE: /restablecer is
// intentionally excluded — the reset email link lands there already signed in.
const REDIRECT_WHEN_AUTHED = new Set(["/ingresar", "/crear-cuenta", "/recuperar"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = activeTabFromPath(pathname);

  const [teams, setTeams] = useState<Team[]>(seedTeams);
  const [profiles, setProfiles] = useState<Profile[]>(seedProfiles);
  const [stages, setStages] = useState<StageState[]>(seedStages);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [matches, setMatches] = useState(seedMatches);
  const [predictions, setPredictions] = useState(seedPredictions);
  const [groups, setGroups] = useState<Group[]>(seedGroups);
  const [groupPredictions, setGroupPredictions] = useState<GroupPrediction[]>(seedGroupPredictions);
  const [drawerMatch, setDrawerMatch] = useState<Match | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataMessage, setDataMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [theme, setTheme] = useTheme();
  const now = useHydratedNow();
  const supabaseEnabled = hasSupabaseConfig();

  const isAdmin = currentUser?.role === "admin";
  const openStages = useMemo(() => getPredictionsStages(stages), [stages]);
  const resultsStages = useMemo(() => getResultsStages(stages, matches, groups), [stages, matches, groups]);
  const standingsStages = useMemo(() => getStandingsStages(stages), [stages]);

  const me = useMemo(
    () =>
      getLeaderboard({ predictions, profiles, groupPredictions, matches, standingsStages }).find(
        (row) => row.user.id === currentUser?.id,
      ),
    [predictions, profiles, groupPredictions, matches, standingsStages, currentUser],
  );

  const refreshSupabaseData = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    setDataMessage("");

    try {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        setCurrentUser(null);
        setDataMessage("Iniciá sesión para usar el prode.");
        return;
      }

      const appData = await loadSupabaseAppData(supabase);

      if (!appData.profile) {
        setCurrentUser(null);
        setDataMessage("Tu usuario existe, pero todavía falta crear el perfil.");
        return;
      }

      setProfiles(appData.profiles);
      setTeams(appData.teams);
      setStages(appData.stages);
      setMatches(appData.matches);
      setPredictions(appData.predictions);
      setGroups(appData.groups);
      setGroupPredictions(appData.groupPredictions);
      setCurrentUser(appData.profile);

      if (!appData.profile.approved) {
        setDataMessage("Tu usuario está pendiente de aprobación.");
      }
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "No se pudieron cargar los datos.");
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    if (!supabaseEnabled) {
      setAuthReady(true);
      return;
    }
    void refreshSupabaseData();
  }, [refreshSupabaseData, supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled) return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Defer the data reload out of the callback to avoid Supabase's
        // "do not await inside onAuthStateChange" deadlock.
        setTimeout(() => {
          void refreshSupabaseData();
        }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabaseEnabled, refreshSupabaseData]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isAdmin && activeTab === "admin") {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, router]);

  useEffect(() => {
    if (!authReady) return;
    const signedIn = supabaseEnabled && Boolean(currentUser);
    if (!signedIn && !PUBLIC_AUTH_ROUTES.has(pathname)) {
      router.replace("/ingresar");
    } else if (signedIn && REDIRECT_WHEN_AUTHED.has(pathname)) {
      router.replace(tabRoutes.predictions);
    }
  }, [authReady, supabaseEnabled, currentUser, pathname, router]);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setCurrentUser(null);
    setProfiles([]);
    setTeams([]);
    setStages([]);
    setMatches([]);
    setPredictions([]);
    setGroups([]);
    setGroupPredictions([]);
    setDataMessage("Sesión cerrada.");
  }

  async function importMatchesCsv(file: File | null) {
    if (!file) return;
    try {
      const csv = await file.text();
      const result = await importMatchesCsvAction({ csv });
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "No se pudo importar el CSV.");
    }
  }

  function exportMatchesCsv() {
    const csv = matchesToCsv(matches);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prode-partidos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function recalculatePoints() {
    const result = await recalculatePointsAction();
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function createMatch(input: CreateMatchActionInput) {
    const result = await createMatchAction(input);
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function deleteMatch(matchId: string) {
    const result = await deleteMatchAction(matchId);
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function updateStageFlag(stage: Stage, flag: StageFlag, value: boolean) {
    const column = flag === "predictions" ? "predictionsOpen" : flag === "results" ? "resultsOpen" : "standingsOpen";
    setStages((current) => current.map((item) => (item.stage === stage ? { ...item, [column]: value } : item)));
    const result = await updateStageFlagAction({ stage, flag, value });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function approveProfile(profileId: string) {
    const result = await approveProfileAction(profileId);
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function finalizeMatch(match: Match) {
    if (supabaseEnabled) {
      const result = await finalizeMatchAction({
        matchId: match.id,
        status: match.status ?? "finalized",
        homeScore: match.homeScore ?? 1,
        awayScore: match.awayScore ?? 0,
        winnerTeamId: match.winnerTeamId,
      });
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
      return;
    }

    if (!currentUser) return;

    const finalized = {
      ...match,
      status: match.status ?? "finalized",
      homeScore: match.homeScore ?? 1,
      awayScore: match.awayScore ?? 0,
      winnerTeamId: match.winnerTeamId,
      finalizedAt: match.status === "finalized" ? new Date().toISOString() : null,
      finalizedBy: match.status === "finalized" ? currentUser.id : null,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.id,
    };

    setMatches((items) => items.map((item) => (item.id === match.id ? finalized : item)));
    if (finalized.status === "finalized") {
      setPredictions((items) => scoreAllForMatch(finalized, items));
    }
  }

  function updatePrediction(match: Match, patch: Partial<Prediction>) {
    if (!currentUser) return;
    setSaveState("saving");

    const existing = predictions.find(
      (prediction) => prediction.userId === currentUser.id && prediction.matchId === match.id,
    );

    const nextPrediction: Prediction = {
      id: existing?.id ?? `p-${match.id}-${currentUser.id}`,
      userId: currentUser.id,
      matchId: match.id,
      homeScore: patch.homeScore ?? existing?.homeScore ?? 0,
      awayScore: patch.awayScore ?? existing?.awayScore ?? 0,
      winnerTeamId:
        "winnerTeamId" in patch ? patch.winnerTeamId ?? null : existing?.winnerTeamId ?? null,
      points: existing?.points ?? null,
      exactHit: existing?.exactHit ?? false,
      outcomeHit: existing?.outcomeHit ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setPredictions((items) => {
      const without = items.filter(
        (prediction) => !(prediction.userId === currentUser.id && prediction.matchId === match.id),
      );
      return [...without, nextPrediction];
    });

    if (supabaseEnabled) {
      void savePredictionAction({
        matchId: match.id,
        homeScore: nextPrediction.homeScore,
        awayScore: nextPrediction.awayScore,
        winnerTeamId: nextPrediction.winnerTeamId,
      }).then((result) => {
        if (!result.ok) {
          setDataMessage(result.message);
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      });
    } else {
      setSaveState("saved");
    }
  }

  function updateGroupPrediction(groupLabel: string, order: (string | null)[]) {
    if (!currentUser) return;

    const existing = groupPredictions.find(
      (prediction) => prediction.userId === currentUser.id && prediction.groupLabel === groupLabel,
    );

    // When nothing is picked, persist the cleared state by removing the row.
    if (order.every((slot) => !slot)) {
      if (!existing) return;
      setGroupPredictions((items) =>
        items.filter(
          (prediction) =>
            !(prediction.userId === currentUser.id && prediction.groupLabel === groupLabel),
        ),
      );
      if (supabaseEnabled) {
        setSaveState("saving");
        void deleteGroupPredictionAction({ groupLabel }).then((result) => {
          if (!result.ok) {
            setDataMessage(result.message);
            setSaveState("error");
            return;
          }
          setSaveState("saved");
        });
      } else {
        setSaveState("saved");
      }
      return;
    }

    // Otherwise save whatever is filled so far (partial orders are allowed).
    setSaveState("saving");
    const [firstTeamId, secondTeamId, thirdTeamId, fourthTeamId] = order;
    const nextPrediction: GroupPrediction = {
      id: existing?.id ?? `gp-${groupLabel}-${currentUser.id}`,
      userId: currentUser.id,
      groupLabel,
      firstTeamId: firstTeamId ?? null,
      secondTeamId: secondTeamId ?? null,
      thirdTeamId: thirdTeamId ?? null,
      fourthTeamId: fourthTeamId ?? null,
      points: existing?.points ?? null,
      exactPositions: existing?.exactPositions ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setGroupPredictions((items) => {
      const without = items.filter(
        (prediction) =>
          !(prediction.userId === currentUser.id && prediction.groupLabel === groupLabel),
      );
      return [...without, nextPrediction];
    });

    if (supabaseEnabled) {
      void saveGroupPredictionAction({
        groupLabel,
        firstTeamId,
        secondTeamId,
        thirdTeamId,
        fourthTeamId,
      }).then((result) => {
        if (!result.ok) {
          setDataMessage(result.message);
          setSaveState("error");
          return;
        }
        setSaveState("saved");
      });
    } else {
      setSaveState("saved");
    }
  }

  async function saveGroupStandings(input: SaveGroupStandingsInput) {
    if (supabaseEnabled) {
      const result = await saveGroupStandingsAction(input);
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
      return;
    }

    if (!currentUser) return;

    const saved: Group = {
      groupLabel: input.groupLabel,
      locksAt: groups.find((group) => group.groupLabel === input.groupLabel)?.locksAt ?? null,
      firstTeamId: input.firstTeamId,
      secondTeamId: input.secondTeamId,
      thirdTeamId: input.thirdTeamId,
      fourthTeamId: input.fourthTeamId,
      resultFinalizedAt: input.finalize ? new Date().toISOString() : null,
      resultFinalizedBy: input.finalize ? currentUser.id : null,
    };

    setGroups((items) =>
      items.map((group) => (group.groupLabel === input.groupLabel ? saved : group)),
    );
    setGroupPredictions((items) =>
      items.map((prediction) => {
        if (prediction.groupLabel !== input.groupLabel) return prediction;
        const score = scoreGroupPredictionOrNull(saved, prediction);
        return { ...prediction, points: score.points, exactPositions: score.exactPositions };
      }),
    );
  }

  async function updateGroupLocksAt(groupLabel: string, locksAt: string | null) {
    if (supabaseEnabled) {
      const result = await updateGroupLocksAtAction({ groupLabel, locksAt });
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
      return;
    }

    setGroups((items) =>
      items.map((group) => (group.groupLabel === groupLabel ? { ...group, locksAt } : group)),
    );
  }

  // Public auth pages render their own standalone card.
  if (PUBLIC_AUTH_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  // Not signed in (or Supabase unconfigured): the redirect effect sends the
  // user to /ingresar; show the loader while it happens.
  if (!supabaseEnabled || !currentUser) {
    return <LoadingScreen />;
  }

  if (!currentUser.approved) {
    return (
      <PendingApproval
        message={dataMessage || "Tu usuario está pendiente de aprobación."}
        onRefresh={refreshSupabaseData}
        onSignOut={signOut}
      />
    );
  }

  const contextValue: AppContextValue = {
    currentUser,
    teams,
    profiles,
    stages,
    matches,
    predictions,
    groups,
    groupPredictions,
    now,
    isAdmin,
    saveState,
    dataMessage,
    openStages,
    resultsStages,
    standingsStages,
    updatePrediction,
    updateGroupPrediction,
    openPredictionDrawer: setDrawerMatch,
    refreshSupabaseData,
    signOut,
    finalizeMatch,
    saveGroupStandings,
    updateGroupLocksAt,
    createMatch,
    deleteMatch,
    updateStageFlag,
    approveProfile,
    importMatchesCsv,
    exportMatchesCsv,
    recalculatePoints,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <main className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-app-bg text-app-text max-lg:block">
        <Sidebar activeTab={activeTab} isAdmin={isAdmin} currentUser={currentUser} theme={theme} onThemeChange={setTheme} onSignOut={signOut} />

        <section className="mx-auto w-full max-w-screen-2xl min-w-0 overflow-x-clip p-5 max-lg:p-3.5 max-sm:p-2.5">
          <div className="sticky top-0 z-20 -mx-3.5 mb-5 flex items-center gap-3 border-b border-app-line bg-app-bg/90 px-3.5 py-2.5 backdrop-blur-lg lg:hidden max-sm:-mx-2.5 max-sm:px-2.5">
            <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => setMobileNavOpen(true)}>
              <Menu />
            </Button>
            <span className="brand-mark" aria-hidden="true">
              <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} />
            </span>
            <strong className="text-base leading-none">Prode Carbia</strong>
            {me && (
              <Link
                href={tabRoutes.leaderboard}
                aria-label={`Tu posición: puesto ${me.rank}, ${me.points} puntos`}
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface px-3 py-1.5 text-xs font-black"
              >
                <span className="text-app-muted">#{me.rank}</span>
                <span className="text-app-green">{me.points} pts</span>
              </Link>
            )}
          </div>

          <header className="mb-7">
            <div>
              <p className={cn(ui.label, "mb-1")}>Hola, {currentUser.displayName}</p>
              <h1 className="text-display leading-none tracking-normal">{pageTitles[activeTab]}</h1>
            </div>
          </header>

          {children}
        </section>

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-[280px] gap-0 border-app-line bg-app-sidebar p-4 sm:max-w-[280px]">
            <SheetTitle className="sr-only">Menú</SheetTitle>
            <SidebarContent
              activeTab={activeTab}
              isAdmin={isAdmin}
              currentUser={currentUser}
              theme={theme}
              onThemeChange={setTheme}
              onSignOut={signOut}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <PredictionDrawer
          match={drawerMatch}
          predictions={predictions}
          profiles={profiles}
          teams={teams}
          onClose={() => setDrawerMatch(null)}
        />
      </main>
    </AppContext.Provider>
  );
}

function Sidebar(props: SidebarContentProps) {
  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-app-line bg-app-sidebar px-4 py-5 backdrop-blur-lg max-lg:hidden" aria-label="Navegación principal">
      <SidebarContent {...props} />
    </aside>
  );
}

type SidebarContentProps = {
  activeTab: AppRoute;
  isAdmin: boolean;
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
  onNavigate?: () => void;
};

function SidebarContent({
  activeTab,
  isAdmin,
  currentUser,
  theme,
  onThemeChange,
  onSignOut,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex min-h-14 shrink-0 items-center gap-3">
        <span className="brand-mark" aria-hidden="true">
          <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} priority />
        </span>
        <div>
          <strong className="block text-lg leading-none">Prode Carbia</strong>
          <small className="mt-1 block text-xs font-bold text-app-muted">Familia · 2026</small>
        </div>
      </div>
      <nav className="mt-8 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <NavLink href={tabRoutes.predictions} icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.stats} icon={<BarChart3 />} label="Estadísticas" active={activeTab === "stats"} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.rules} icon={<Info />} label="Reglas" active={activeTab === "rules"} onNavigate={onNavigate} />
        {isAdmin && <NavLink href={tabRoutes.admin} icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} onNavigate={onNavigate} />}
      </nav>
      <AccountPanel currentUser={currentUser} theme={theme} onThemeChange={onThemeChange} onSignOut={onSignOut} onNavigate={onNavigate} />
    </>
  );
}

function NavLink({ href, icon, label, active, onNavigate, badge, disabled }: { href: string; icon: React.ReactNode; label: string; active: boolean; onNavigate?: () => void; badge?: string; disabled?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant={active ? "default" : "ghost"}
      disabled={disabled}
      className={cn(
        "h-10 justify-start gap-2.5 rounded-lg px-3 text-sm font-bold",
        active ? "bg-app-solid text-app-solid-fg" : "text-app-muted hover:bg-app-surface-2 hover:text-app-text",
      )}
      onClick={() => {
        if (disabled) return;
        router.push(href);
        onNavigate?.();
      }}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
      {badge && (
        <span className="ml-auto rounded-full bg-app-surface-2 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-app-muted">
          {badge}
        </span>
      )}
    </Button>
  );
}

function AccountPanel({
  currentUser,
  theme,
  onThemeChange,
  onSignOut,
  onNavigate,
}: {
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="mt-3 flex w-full shrink-0 items-center gap-2 rounded-lg border border-app-line bg-app-surface/80 p-3 text-left shadow-app-card outline-none transition-colors hover:bg-app-surface-2 data-popup-open:bg-app-surface-2"
            aria-label="Abrir menú de cuenta"
          >
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm font-black leading-tight">{currentUser.displayName}</strong>
              <small className="mt-0.5 block truncate text-xs font-bold text-app-muted">{currentUser.email}</small>
            </div>
            <ChevronsUpDown className="size-4 shrink-0 text-app-muted" />
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" className="w-(--anchor-width) min-w-56">
        <DropdownMenuItem
          onClick={() => {
            router.push(tabRoutes.account);
            onNavigate?.();
          }}
        >
          <Pencil />
          Editar perfil
        </DropdownMenuItem>
        <DropdownMenuSubmenu>
          <DropdownMenuSubmenuTrigger>
            <Palette />
            Tema
            <ChevronRight className="ml-auto" />
          </DropdownMenuSubmenuTrigger>
          <DropdownMenuSubmenuContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => onThemeChange(value as Theme)}>
              <DropdownMenuRadioItem value="light">
                <Sun />
                Claro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon />
                Oscuro
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor />
                Sistema
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubmenuContent>
        </DropdownMenuSubmenu>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onSignOut()}>
          <LogOut />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
