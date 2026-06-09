"use client";

import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  CalendarClock,
  CircleDot,
  Info,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  approveProfileAction,
  createMatchAction,
  deleteMatchAction,
  finalizeMatchAction,
  importMatchesCsvAction,
  recalculatePointsAction,
  savePredictionAction,
  updateStageOpenAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { matchesToCsv } from "@/lib/csv";
import { scoreAllForMatch } from "@/lib/scoring";
import {
  matches as seedMatches,
  predictions as seedPredictions,
  profiles as seedProfiles,
  stages as seedStages,
  teams as seedTeams,
} from "@/lib/seed";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import { loadSupabaseAppData } from "@/lib/supabase-data";
import type { Match, Prediction, Profile, Stage, StageState, Team } from "@/lib/types";
import { pageTitles, tabRoutes, ui, type AppRoute } from "@/lib/ui-tokens";
import { useHydratedNow } from "@/lib/use-hydrated-now";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

import {
  AppContext,
  type AppContextValue,
  type CreateMatchActionInput,
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
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [matches, setMatches] = useState(seedMatches);
  const [predictions, setPredictions] = useState(seedPredictions);
  const [drawerMatch, setDrawerMatch] = useState<Match | null>(null);
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
    if (activeTab === "admin" && currentUser && !isAdmin) {
      router.replace(tabRoutes.predictions);
    }
  }, [activeTab, currentUser, isAdmin, router]);

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
    setMatches([]);
    setPredictions([]);
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
      winnerTeamId: patch.winnerTeamId ?? existing?.winnerTeamId ?? null,
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
    now,
    isAdmin,
    saveState,
    dataMessage,
    openStages,
    updatePrediction,
    openPredictionDrawer: setDrawerMatch,
    refreshSupabaseData,
    signOut,
    finalizeMatch,
    createMatch,
    deleteMatch,
    updateStageOpen,
    approveProfile,
    importMatchesCsv,
    exportMatchesCsv,
    recalculatePoints,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <main className="grid min-h-screen grid-cols-[248px_minmax(0,1fr)] bg-app-bg text-app-text max-lg:block max-lg:pb-20">
        <Sidebar activeTab={activeTab} isAdmin={isAdmin} currentUser={currentUser} theme={theme} onThemeChange={setTheme} onSignOut={signOut} />

        <section className="mx-auto w-full max-w-screen-2xl min-w-0 overflow-x-clip p-5 max-lg:p-3.5 max-sm:p-2.5">
          <header className="mb-7">
            <div>
              <p className={cn(ui.label, "mb-1")}>Hola, {currentUser.displayName}</p>
              <h1 className="text-display leading-none tracking-normal">{pageTitles[activeTab]}</h1>
            </div>
          </header>

          <AccountPanel currentUser={currentUser} theme={theme} onThemeChange={setTheme} onSignOut={signOut} mobile />

          {children}
        </section>

        <MobileNav activeTab={activeTab} isAdmin={isAdmin} />
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

function Sidebar({
  activeTab,
  isAdmin,
  currentUser,
  theme,
  onThemeChange,
  onSignOut,
}: {
  activeTab: AppRoute;
  isAdmin: boolean;
  currentUser: Profile;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onSignOut: () => Promise<void> | void;
}) {
  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-app-line bg-app-sidebar px-4 py-5 backdrop-blur-lg max-lg:hidden" aria-label="Navegación principal">
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
        <NavLink href={tabRoutes.predictions} icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} />
        <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} />
        <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} />
        <NavLink href={tabRoutes.rules} icon={<Info />} label="Reglas" active={activeTab === "rules"} />
        {isAdmin && <NavLink href={tabRoutes.admin} icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} />}
      </nav>
      <AccountPanel currentUser={currentUser} theme={theme} onThemeChange={onThemeChange} onSignOut={onSignOut} />
    </aside>
  );
}

function MobileNav({ activeTab, isAdmin }: { activeTab: AppRoute; isAdmin: boolean }) {
  return (
    <nav className="fixed inset-x-2.5 bottom-2.5 z-20 hidden grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1 rounded-lg border border-app-line bg-app-nav p-1.5 shadow-app backdrop-blur-lg max-lg:grid">
      <NavLink href={tabRoutes.predictions} icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} />
      <NavLink href={tabRoutes.leaderboard} icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} />
      <NavLink href={tabRoutes.results} icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} />
      <NavLink href={tabRoutes.rules} icon={<Info />} label="Reglas" active={activeTab === "rules"} />
      {isAdmin && <NavLink href={tabRoutes.admin} icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} />}
    </nav>
  );
}

function NavLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant={active ? "default" : "ghost"}
      className={cn(
        "h-10 justify-start gap-2.5 rounded-lg px-3 text-sm font-bold max-lg:h-12 max-lg:min-w-0 max-lg:flex-col max-lg:gap-1 max-lg:px-1 max-lg:text-xs",
        active ? "bg-app-solid text-app-solid-fg" : "text-app-muted hover:bg-app-surface-2 hover:text-app-text",
      )}
      onClick={() => router.push(href)}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Button>
  );
}

function AccountPanel({
  currentUser,
  theme,
  mobile = false,
  onThemeChange,
  onSignOut,
}: {
  currentUser: Profile;
  theme: Theme;
  mobile?: boolean;
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
      className={cn(
        "grid gap-3 rounded-lg border border-app-line bg-app-surface/80 p-3 shadow-app-card",
        mobile ? "mb-3 hidden max-lg:grid" : "mt-3 shrink-0 max-lg:hidden",
      )}
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
