"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarClock,
  CircleDot,
  Info,
  Menu,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  approveProfileAction,
  createMatchAction,
  deleteGroupPredictionAction,
  deleteMatchAction,
  finalizeGroupResultAction,
  finalizeMatchAction,
  importMatchesCsvAction,
  recalculatePointsAction,
  saveGroupPredictionAction,
  savePredictionAction,
  updateGroupLocksAtAction,
  updateStageOpenAction,
  updateTabVisibilityAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { matchesToCsv } from "@/lib/csv";
import { scoreAllForMatch, scoreGroupPrediction } from "@/lib/scoring";
import {
  groups as seedGroups,
  groupPredictions as seedGroupPredictions,
  matches as seedMatches,
  predictions as seedPredictions,
  profiles as seedProfiles,
  stages as seedStages,
  appSettings as seedAppSettings,
  teams as seedTeams,
} from "@/lib/seed";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import { loadSupabaseAppData } from "@/lib/supabase-data";
import type {
  AppSetting,
  AppSettingKey,
  Group,
  GroupPrediction,
  Match,
  Prediction,
  Profile,
  Stage,
  StageState,
  Team,
} from "@/lib/types";
import { getLeaderboard, pageTitles, tabRoutes, ui, type AppRoute } from "@/lib/ui-tokens";
import { getTabVisibility } from "@/lib/tab-visibility";
import { useHydratedNow } from "@/lib/use-hydrated-now";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

import {
  AppContext,
  type AppContextValue,
  type CreateMatchActionInput,
  type FinalizeGroupResultInput,
  type SaveState,
} from "./app-context";
import { AuthScreen, LoadingScreen, ThemePicker } from "./auth-screen";
import { LoadingLabel } from "./badges";
import { PredictionDrawer } from "@/screens/predictions";

const routeTabs: Record<string, AppRoute> = {
  "/": "predictions",
  "/pronosticos": "predictions",
  "/tabla": "leaderboard",
  "/resultados": "results",
  "/reglas": "rules",
  "/admin": "admin",
};

function activeTabFromPath(pathname: string): AppRoute {
  return routeTabs[pathname] ?? "predictions";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = activeTabFromPath(pathname);

  const [teams, setTeams] = useState<Team[]>(seedTeams);
  const [profiles, setProfiles] = useState<Profile[]>(seedProfiles);
  const [stages, setStages] = useState<StageState[]>(seedStages);
  const [appSettings, setAppSettings] = useState<AppSetting[]>(seedAppSettings);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [matches, setMatches] = useState(seedMatches);
  const [predictions, setPredictions] = useState(seedPredictions);
  const [groups, setGroups] = useState<Group[]>(seedGroups);
  const [groupPredictions, setGroupPredictions] = useState<GroupPrediction[]>(seedGroupPredictions);
  const [drawerMatch, setDrawerMatch] = useState<Match | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [theme, setTheme] = useTheme();
  const now = useHydratedNow();
  const supabaseEnabled = hasSupabaseConfig();

  const isAdmin = currentUser?.role === "admin";
  const openStages = useMemo(() => {
    return new Set(stages.filter((stage) => stage.open).map((stage) => stage.stage));
  }, [stages]);

  const { standingsVisible, resultsVisible } = useMemo(
    () => getTabVisibility(appSettings),
    [appSettings],
  );

  const me = useMemo(
    () =>
      getLeaderboard(predictions, profiles, groupPredictions).find(
        (row) => row.user.id === currentUser?.id,
      ),
    [predictions, profiles, groupPredictions, currentUser],
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
      setAppSettings(appData.appSettings);
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
    if (!currentUser) return;
    if (activeTab === "admin" && !isAdmin) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "leaderboard" && !standingsVisible) {
      router.replace(tabRoutes.predictions);
      return;
    }
    if (activeTab === "results" && !resultsVisible) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, standingsVisible, resultsVisible, router]);

  async function submitAuth() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !authEmail || !authPassword) return;

    if (authMode === "signup" && authPassword !== authConfirmPassword) {
      setAuthMessage("Las contraseñas no coinciden.");
      return;
    }

    const result =
      authMode === "login"
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: { data: { display_name: authName || authEmail.split("@")[0] } },
          });

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    setAuthMessage(authMode === "login" ? "" : "Cuenta creada. Te vamos a aprobar para participar.");
    setAuthPassword("");
    setAuthConfirmPassword("");
    await refreshSupabaseData();
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setCurrentUser(null);
    setProfiles([]);
    setTeams([]);
    setStages([]);
    setAppSettings([]);
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

  async function updateStageOpen(stage: Stage, open: boolean) {
    setStages((current) => current.map((item) => (item.stage === stage ? { ...item, open } : item)));
    const result = await updateStageOpenAction({ stage, open });
    setDataMessage(result.message);
    if (result.ok) await refreshSupabaseData();
  }

  async function updateTabVisibility(key: AppSettingKey, enabled: boolean) {
    setAppSettings((current) => {
      const without = current.filter((item) => item.key !== key);
      return [...without, { key, enabled }];
    });
    const result = await updateTabVisibilityAction({ key, enabled });
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

  async function finalizeGroupResult(input: FinalizeGroupResultInput) {
    if (supabaseEnabled) {
      const result = await finalizeGroupResultAction(input);
      setDataMessage(result.message);
      if (result.ok) await refreshSupabaseData();
      return;
    }

    if (!currentUser) return;

    const finalized: Group = {
      groupLabel: input.groupLabel,
      locksAt: groups.find((group) => group.groupLabel === input.groupLabel)?.locksAt ?? null,
      firstTeamId: input.firstTeamId,
      secondTeamId: input.secondTeamId,
      thirdTeamId: input.thirdTeamId,
      fourthTeamId: input.fourthTeamId,
      resultFinalizedAt: new Date().toISOString(),
      resultFinalizedBy: currentUser.id,
    };

    setGroups((items) =>
      items.map((group) => (group.groupLabel === input.groupLabel ? finalized : group)),
    );
    setGroupPredictions((items) =>
      items.map((prediction) => {
        if (prediction.groupLabel !== input.groupLabel) return prediction;
        const score = scoreGroupPrediction(finalized, prediction);
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

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!supabaseEnabled) {
    return (
      <AuthScreen
        authMode={authMode}
        authEmail={authEmail}
        authName={authName}
        authPassword={authPassword}
        authConfirmPassword={authConfirmPassword}
        authMessage="Faltan las variables de Supabase."
        dataMessage="Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."
        theme={theme}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onConfirmPasswordChange={setAuthConfirmPassword}
        onThemeChange={setTheme}
        onModeChange={setAuthMode}
        onSubmitAuth={submitAuth}
      />
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        authMode={authMode}
        authEmail={authEmail}
        authName={authName}
        authPassword={authPassword}
        authConfirmPassword={authConfirmPassword}
        authMessage={authMessage}
        dataMessage={dataMessage}
        theme={theme}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onConfirmPasswordChange={setAuthConfirmPassword}
        onThemeChange={setTheme}
        onModeChange={setAuthMode}
        onSubmitAuth={submitAuth}
      />
    );
  }

  if (!currentUser.approved) {
    return (
      <AuthScreen
        currentUser={currentUser}
        authMode={authMode}
        authEmail={authEmail}
        authName={authName}
        authPassword={authPassword}
        authConfirmPassword={authConfirmPassword}
        authMessage={authMessage}
        dataMessage={dataMessage || "Tu usuario está pendiente de aprobación."}
        theme={theme}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onConfirmPasswordChange={setAuthConfirmPassword}
        onThemeChange={setTheme}
        onModeChange={setAuthMode}
        onSubmitAuth={submitAuth}
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
    standingsVisible,
    resultsVisible,
    updatePrediction,
    updateGroupPrediction,
    openPredictionDrawer: setDrawerMatch,
    refreshSupabaseData,
    signOut,
    finalizeMatch,
    finalizeGroupResult,
    updateGroupLocksAt,
    createMatch,
    deleteMatch,
    updateStageOpen,
    updateTabVisibility,
    approveProfile,
    importMatchesCsv,
    exportMatchesCsv,
    recalculatePoints,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <main className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-app-bg text-app-text max-lg:block">
        <Sidebar activeTab={activeTab} isAdmin={isAdmin} standingsVisible={standingsVisible} resultsVisible={resultsVisible} currentUser={currentUser} theme={theme} onThemeChange={setTheme} onSignOut={signOut} />

        <section className="mx-auto w-full max-w-screen-2xl min-w-0 overflow-x-clip p-5 max-lg:p-3.5 max-sm:p-2.5">
          <div className="sticky top-0 z-20 -mx-3.5 mb-5 flex items-center gap-3 border-b border-app-line bg-app-bg/90 px-3.5 py-2.5 backdrop-blur-lg lg:hidden max-sm:-mx-2.5 max-sm:px-2.5">
            <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => setMobileNavOpen(true)}>
              <Menu />
            </Button>
            <span className="brand-mark" aria-hidden="true">
              <Image className="size-full object-contain" src="/favicon.svg" alt="" width={455} height={701} />
            </span>
            <strong className="text-base leading-none">Prode Carbia</strong>
            {me && (() => {
              const pillClass = cn(
                "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface px-3 py-1.5 text-xs font-black",
                !standingsVisible && "opacity-60",
              );
              const pillContent = (
                <>
                  <span className="text-app-muted">#{me.rank}</span>
                  <span className="text-app-green">{me.points} pts</span>
                </>
              );
              const pillLabel = `Tu posición: puesto ${me.rank}, ${me.points} puntos`;
              return standingsVisible ? (
                <Link href={tabRoutes.leaderboard} aria-label={pillLabel} className={pillClass}>
                  {pillContent}
                </Link>
              ) : (
                <span aria-label={pillLabel} className={pillClass}>
                  {pillContent}
                </span>
              );
            })()}
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
              standingsVisible={standingsVisible}
              resultsVisible={resultsVisible}
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
  standingsVisible: boolean;
  resultsVisible: boolean;
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
  onNavigate?: () => void;
};

function SidebarContent({
  activeTab,
  isAdmin,
  standingsVisible,
  resultsVisible,
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
        <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} disabled={!standingsVisible} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} disabled={!resultsVisible} onNavigate={onNavigate} />
        <NavLink href={tabRoutes.rules} icon={<Info />} label="Reglas" active={activeTab === "rules"} onNavigate={onNavigate} />
        {isAdmin && <NavLink href={tabRoutes.admin} icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} onNavigate={onNavigate} />}
      </nav>
      <AccountPanel currentUser={currentUser} theme={theme} onThemeChange={onThemeChange} onSignOut={onSignOut} />
    </>
  );
}

function NavLink({ href, icon, label, active, disabled, onNavigate }: { href: string; icon: React.ReactNode; label: string; active: boolean; disabled?: boolean; onNavigate?: () => void }) {
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
        router.push(href);
        onNavigate?.();
      }}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Button>
  );
}

function AccountPanel({
  currentUser,
  theme,
  onThemeChange,
  onSignOut,
}: {
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Card
      className="mt-3 grid shrink-0 gap-3 rounded-lg border border-app-line bg-app-surface/80 p-3 shadow-app-card"
      size="sm"
    >
      <div>
        <strong className="block truncate text-sm font-black leading-tight">{currentUser.displayName}</strong>
        <small className="mt-0.5 block truncate text-xs font-bold text-app-muted">{currentUser.email}</small>
      </div>
      <div className="grid gap-2">
        <ThemePicker theme={theme} onChange={onThemeChange} />
        <Button variant="outline" size="sm" className={ui.control} disabled={signingOut} onClick={handleSignOut}>
          <LoadingLabel loading={signingOut} label="Salir" />
        </Button>
      </div>
    </Card>
  );
}
