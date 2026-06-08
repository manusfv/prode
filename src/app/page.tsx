"use client";

import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Download,
  FileUp,
  Info,
  Lock,
  Minus,
  Monitor,
  Moon,
  PanelRightOpen,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sun,
  Trash2,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { approveProfileAction, createMatchAction, deleteMatchAction, finalizeMatchAction, savePredictionAction, updateStageOpenAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePathname } from "next/navigation";
import { scoreAllForMatch } from "@/lib/scoring";
import { loadSupabaseAppData } from "@/lib/supabase-data";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import {
  formatKickoff,
  getLockCopy,
  getMatchStatus,
  getTeamFlag,
  getTeamLabel,
  needsAdvancer,
  stageLabels,
  stageOrder,
} from "@/lib/tournament";
import {
  matches as seedMatches,
  predictions as seedPredictions,
  profiles as seedProfiles,
  stages as seedStages,
  teams as seedTeams,
} from "@/lib/seed";
import type { Match, MatchLifecycleStatus, Prediction, Profile, Stage, StageState, Team } from "@/lib/types";

type Tab = "predictions" | "leaderboard" | "results" | "rules" | "admin";
type Theme = "light" | "dark" | "system";
type GroupSort = "group" | "date";
type AdminMatchDraft = {
  status: MatchLifecycleStatus;
  homeScore: number;
  awayScore: number;
  winnerTeamId: string | null;
};
type NewMatchDraft = {
  matchNo: string;
  stage: Stage;
  groupLabel: string;
  homeTeamId: string;
  awayTeamId: string;
  homeSeed: string;
  awaySeed: string;
  kickoffLocal: string;
  venue: string;
  city: string;
};
type CreateMatchActionInput = Parameters<typeof createMatchAction>[0];

const initialRenderNowIso = "2026-06-07T23:00:00.000Z";
const tabRoutes: Record<Tab, string> = {
  predictions: "/pronosticos",
  leaderboard: "/tabla",
  results: "/resultados",
  rules: "/reglas",
  admin: "/admin",
};
const routeTabs: Record<string, Tab> = {
  "/": "predictions",
  "/pronosticos": "predictions",
  "/tabla": "leaderboard",
  "/resultados": "results",
  "/reglas": "rules",
  "/admin": "admin",
};

export default function Home() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<Tab>("predictions");
  const [activeStage, setActiveStage] = useState<Stage>("groups");
  const [missingOnly, setMissingOnly] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupFilterOpen, setGroupFilterOpen] = useState(false);
  const [groupSort, setGroupSort] = useState<GroupSort>("group");
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
  const [authMessage, setAuthMessage] = useState("");
  const [dataMessage, setDataMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const [theme, setTheme] = useTheme();
  const groupFilterRef = useRef<HTMLDivElement>(null);
  const now = useHydratedNow();
  const supabaseEnabled = hasSupabaseConfig();
  const navigateToTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.history.pushState(null, "", tabRoutes[tab]);
  }, []);

  const openStages = useMemo(() => {
    return new Set(stages.filter((stage) => stage.open).map((stage) => stage.stage));
  }, [stages]);
  const currentPredictionMap = useMemo(() => {
    if (!currentUser) return new Map<string, Prediction>();

    return new Map(
      predictions
        .filter((prediction) => prediction.userId === currentUser.id)
        .map((prediction) => [prediction.matchId, prediction]),
    );
  }, [currentUser, predictions]);

  const visibleMatches = useMemo(() => {
    return matches
      .filter((match) => match.stage === activeStage)
      .filter((match) => activeStage !== "groups" || selectedGroups.length === 0 || selectedGroups.includes(match.group ?? ""))
      .filter((match) => !missingOnly || !currentPredictionMap.has(match.id))
      .sort((a, b) => {
        if (activeStage === "groups" && groupSort === "group") {
          const groupCompare = compareGroups(a.group, b.group);
          if (groupCompare !== 0) return groupCompare;
        }

        return new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime();
      });
  }, [activeStage, currentPredictionMap, groupSort, matches, missingOnly, selectedGroups]);

  const groupOptions = useMemo(() => {
    return Array.from(
      new Set(matches.filter((match) => match.stage === "groups" && match.group).map((match) => match.group as string)),
    ).sort(compareGroups);
  }, [matches]);

  const visibleMatchSections = useMemo(() => {
    if (activeStage !== "groups" || groupSort !== "group") {
      return [{ title: null, matches: visibleMatches }];
    }

    const sections = new Map<string, Match[]>();
    for (const match of visibleMatches) {
      const group = match.group ?? "Sin grupo";
      sections.set(group, [...(sections.get(group) ?? []), match]);
    }

    return Array.from(sections.entries()).map(([title, sectionMatches]) => ({
      title,
      matches: sectionMatches,
    }));
  }, [activeStage, groupSort, visibleMatches]);
  const groupSortLabel = groupSort === "group" ? "Por grupos" : "Por fecha";
  const selectedGroupsLabel = selectedGroups.length === 0 ? "Todos los grupos" : selectedGroups.join(", ");

  function toggleGroupFilter(group: string) {
    setSelectedGroups((current) => (
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group].sort(compareGroups)
    ));
  }

  const leaderboard = useMemo(() => getLeaderboard(predictions, profiles), [predictions, profiles]);
  const me = currentUser ? leaderboard.find((row) => row.user.id === currentUser.id) : null;
  const isAdmin = currentUser?.role === "admin";
  const missingCount = matches.filter(
    (match) =>
      getMatchStatus(match, now) === "open" &&
      openStages.has(match.stage) &&
      match.homeTeamId &&
      match.awayTeamId &&
      !currentPredictionMap.has(match.id),
  ).length;

  useEffect(() => {
    if (!supabaseEnabled) {
      setAuthReady(true);
      return;
    }

    void refreshSupabaseData();
  }, [supabaseEnabled]);

  useEffect(() => {
    if (activeTab === "admin" && !isAdmin) {
      navigateToTab("predictions");
    }
  }, [activeTab, isAdmin, navigateToTab]);

  useEffect(() => {
    const routeTab = routeTabs[pathname] ?? "predictions";
    if (routeTab !== activeTab) setActiveTab(routeTab);
  }, [activeTab, pathname]);

  useEffect(() => {
    function handlePopState() {
      setActiveTab(routeTabs[window.location.pathname] ?? "predictions");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (activeTab !== "predictions" || openStages.has(activeStage)) return;
    const nextOpenStage = stageOrder.find((stage) => openStages.has(stage));
    if (nextOpenStage) setActiveStage(nextOpenStage);
  }, [activeStage, activeTab, openStages]);

  useEffect(() => {
    if (!groupFilterOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!groupFilterRef.current?.contains(event.target as Node)) {
        setGroupFilterOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [groupFilterOpen]);

  async function refreshSupabaseData() {
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
  }

  async function submitAuth() {
    const supabase = createSupabaseBrowserClient();
    if (!supabase || !authEmail || !authPassword) return;

    const result =
      authMode === "login"
        ? await supabase.auth.signInWithPassword({
            email: authEmail,
            password: authPassword,
          })
        : await supabase.auth.signUp({
            email: authEmail,
            password: authPassword,
            options: {
              data: { display_name: authName || authEmail.split("@")[0] },
            },
          });

    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }

    setAuthMessage(authMode === "login" ? "Sesión iniciada." : "Cuenta creada. Te vamos a aprobar para participar.");
    setAuthPassword("");
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

  function finalizeDemoMatch(match: Match) {
    if (supabaseEnabled) {
      void finalizeMatchAction({
        matchId: match.id,
        status: match.status ?? "finalized",
        homeScore: match.homeScore ?? 1,
        awayScore: match.awayScore ?? 0,
        winnerTeamId: match.winnerTeamId,
      }).then((result) => {
        setDataMessage(result.message);
        if (result.ok) void refreshSupabaseData();
      });
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
        authMessage="Faltan las variables de Supabase."
        dataMessage="Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
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
        authMessage={authMessage}
        dataMessage={dataMessage}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
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
        authMessage={authMessage}
        dataMessage={dataMessage || "Tu usuario está pendiente de aprobación."}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onModeChange={setAuthMode}
        onSubmitAuth={submitAuth}
        onRefresh={refreshSupabaseData}
        onSignOut={signOut}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <span className="brand-mark">26</span>
          <div>
            <strong>Prode Mundial</strong>
            <small>Familia · 2026</small>
          </div>
        </div>
        <nav className="nav-list">
          <NavButton icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} onClick={() => navigateToTab("predictions")} />
          <NavButton icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} onClick={() => navigateToTab("leaderboard")} />
          <NavButton icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} onClick={() => navigateToTab("results")} />
          <NavButton icon={<Info />} label="Reglas" active={activeTab === "rules"} onClick={() => navigateToTab("rules")} />
          {isAdmin && <NavButton icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} onClick={() => navigateToTab("admin")} />}
        </nav>
        <AccountPanel
          currentUser={currentUser}
          theme={theme}
          onThemeChange={setTheme}
          onSignOut={signOut}
        />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyeline">Hola, {currentUser.displayName}</p>
            <h1>{pageTitle(activeTab)}</h1>
          </div>
          <div className="user-strip">
            <Stat label="Puntos" value={String(me?.points ?? 0)} />
            <Stat label="Puesto" value={`#${me?.rank ?? 1}`} />
            <Stat label="Pendientes" value={String(missingCount)} tone={missingCount ? "warn" : "ok"} />
          </div>
        </header>

        <AccountPanel
          currentUser={currentUser}
          theme={theme}
          onThemeChange={setTheme}
          onSignOut={signOut}
          mobile
        />

        {activeTab === "predictions" && (
          <>
            <div className="prediction-toolbar">
              <StageTabs activeStage={activeStage} stages={stages} onChange={setActiveStage} />
              <div className="command-row prediction-filters">
                {activeStage === "groups" && (
                  <div className="group-controls">
                    <div className="group-dropdown" ref={groupFilterRef}>
                      <Button
                        variant="outline"
                        className="group-dropdown-trigger"
                        aria-expanded={groupFilterOpen}
                        aria-haspopup="menu"
                        onClick={() => setGroupFilterOpen((open) => !open)}
                      >
                        <span className="select-label-inline">Grupos</span>
                        <strong>{selectedGroupsLabel}</strong>
                        <ChevronDown size={15} />
                      </Button>
                      {groupFilterOpen && (
                        <div className="group-dropdown-menu" role="menu" aria-label="Filtrar por grupos">
                          <Button
                            variant={selectedGroups.length === 0 ? "default" : "ghost"}
                            size="sm"
                            className={selectedGroups.length === 0 ? "group-menu-item active" : "group-menu-item"}
                            onClick={() => setSelectedGroups([])}
                          >
                            {selectedGroups.length === 0 && <Check size={14} />}
                            Todos los grupos
                          </Button>
                          {groupOptions.map((group) => (
                            <Button
                              key={group}
                              variant={selectedGroups.includes(group) ? "default" : "ghost"}
                              size="sm"
                              className={selectedGroups.includes(group) ? "group-menu-item active" : "group-menu-item"}
                              onClick={() => toggleGroupFilter(group)}
                            >
                              {selectedGroups.includes(group) && <Check size={14} />}
                              Grupo {group}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Select value={groupSort} onValueChange={(value) => setGroupSort((value ?? "group") as GroupSort)}>
                      <SelectTrigger className="group-select" aria-label="Ordenar partidos">
                        <span className="select-label-inline">Orden</span>
                        <SelectValue>{groupSortLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="group">Orden: grupos</SelectItem>
                        <SelectItem value="date">Orden: fecha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  variant={missingOnly ? "default" : "outline"}
                  className={missingOnly ? "filter active" : "filter"}
                  onClick={() => setMissingOnly((value) => !value)}
                >
                  Faltan ({missingCount})
                </Button>
                <SaveStatus state={saveState} />
              </div>
            </div>
            <section className="content-grid">
              <div className="match-stack">
                {visibleMatchSections.map((section) => (
                  <section key={section.title ?? "date"} className="match-section">
                    {section.title && <h2>Grupo {section.title}</h2>}
                    <div className="match-section-list">
                      {section.matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          prediction={currentPredictionMap.get(match.id)}
                          allPredictions={predictions.filter((prediction) => prediction.matchId === match.id)}
                          now={now}
                          teams={teams}
                          profiles={profiles}
                          openStages={openStages}
                          onChange={updatePrediction}
                          onOpenDrawer={setDrawerMatch}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <aside className="side-panel">
                <LeaderboardPreview rows={leaderboard.slice(0, 4)} onOpen={() => navigateToTab("leaderboard")} />
              </aside>
            </section>
          </>
        )}

        {activeTab === "leaderboard" && <Leaderboard rows={leaderboard} />}
        {activeTab === "results" && <Results matches={matches} predictions={predictions} now={now} teams={teams} />}
        {activeTab === "rules" && <Rules />}
        {activeTab === "admin" && isAdmin && (
          <Admin
            matches={matches}
            predictions={predictions}
            profiles={profiles}
            stages={stages}
            teams={teams}
            now={now}
            onFinalize={finalizeDemoMatch}
            onCreateMatch={(input) => {
              void createMatchAction(input).then((result) => {
                setDataMessage(result.message);
                if (result.ok) void refreshSupabaseData();
              });
            }}
            onDeleteMatch={(matchId) => {
              void deleteMatchAction(matchId).then((result) => {
                setDataMessage(result.message);
                if (result.ok) void refreshSupabaseData();
              });
            }}
            onStageOpenChange={(stage, open) => {
              setStages((current) => current.map((item) => item.stage === stage ? { ...item, open } : item));
              void updateStageOpenAction({ stage, open }).then((result) => {
                setDataMessage(result.message);
                if (result.ok) void refreshSupabaseData();
              });
            }}
            onApprove={(profileId) => {
              void approveProfileAction(profileId).then((result) => {
                setDataMessage(result.message);
                if (result.ok) void refreshSupabaseData();
              });
            }}
          />
        )}
      </section>

      <MobileNav activeTab={activeTab} isAdmin={isAdmin} onChange={navigateToTab} />
      {drawerMatch && (
        <PredictionDrawer
          match={drawerMatch}
          predictions={predictions.filter((prediction) => prediction.matchId === drawerMatch.id)}
          profiles={profiles}
          teams={teams}
          onClose={() => setDrawerMatch(null)}
        />
      )}
    </main>
  );
}

function compareGroups(a?: string, b?: string) {
  return (a ?? "ZZ").localeCompare(b ?? "ZZ", "es", { numeric: true });
}

function MatchCard({
  match,
  prediction,
  allPredictions,
  now,
  teams,
  profiles,
  openStages,
  onChange,
  onOpenDrawer,
}: {
  match: Match;
  prediction?: Prediction;
  allPredictions: Prediction[];
  now: Date;
  teams: Team[];
  profiles: Profile[];
  openStages: Set<Stage>;
  onChange: (match: Match, patch: Partial<Prediction>) => void;
  onOpenDrawer: (match: Match) => void;
}) {
  const status = getMatchStatus(match, now);
  const isOpen = status === "open" && openStages.has(match.stage) && match.homeTeamId && match.awayTeamId;
  const draft = {
    homeScore: prediction?.homeScore ?? 0,
    awayScore: prediction?.awayScore ?? 0,
    winnerTeamId: prediction?.winnerTeamId ?? null,
  };
  const showAdvancer = needsAdvancer(match, draft);
  const submittedCount = allPredictions.length;
  const missingCount = profiles.filter((profile) => profile.approved).length - submittedCount;

  return (
    <Card className={`match-card ${status}`}>
      <div className="match-meta">
        <Badge variant="outline" className="stage-chip">{stageLabels[match.stage]}{match.group ? ` · Grupo ${match.group}` : ""}</Badge>
        <Badge variant={status === "open" ? "secondary" : status === "locked" ? "outline" : "default"} className={`status-chip ${status}`}>
          {status === "open" ? getLockCopy(match.kickoffUtc, now) : status === "locked" ? "Cerrado" : "Finalizado"}
        </Badge>
      </div>

      <div className="teams-grid">
        <TeamBlock teamId={match.homeTeamId} seed={match.homeSeed} teams={teams} />
        <ScoreControl
          value={draft.homeScore}
          disabled={!isOpen}
          onChange={(value) => onChange(match, { homeScore: value })}
        />
        <span className="versus">vs</span>
        <ScoreControl
          value={draft.awayScore}
          disabled={!isOpen}
          onChange={(value) => onChange(match, { awayScore: value })}
        />
        <TeamBlock teamId={match.awayTeamId} seed={match.awaySeed} align="right" teams={teams} />
      </div>

      {showAdvancer && (
        <div className="advancer">
          <span>Clasifica</span>
          {[match.homeTeamId, match.awayTeamId].map((teamId) => (
            <Button
              key={teamId}
              variant={draft.winnerTeamId === teamId ? "default" : "outline"}
              size="sm"
              className={draft.winnerTeamId === teamId ? "active" : ""}
              disabled={!isOpen}
              onClick={() => onChange(match, { winnerTeamId: teamId })}
            >
              {getTeamFlag(teamId, teams)} {getTeamLabel(teamId, teams)}
            </Button>
          ))}
        </div>
      )}

      <footer className="match-footer">
        <span><CalendarClock size={14} /> {formatKickoff(match.kickoffUtc)}</span>
        <span>{match.city ?? "Sede por definir"}</span>
        {status !== "open" && (
          <Button variant="ghost" size="sm" className="link-button" onClick={() => onOpenDrawer(match)}>
            <PanelRightOpen size={15} />
            Pronósticos: {submittedCount} cargados · {Math.max(0, missingCount)} sin pronóstico
          </Button>
        )}
      </footer>
    </Card>
  );
}

function AuthScreen({
  currentUser,
  authMode,
  authEmail,
  authName,
  authPassword,
  authMessage,
  dataMessage,
  onEmailChange,
  onNameChange,
  onPasswordChange,
  onModeChange,
  onSubmitAuth,
  onRefresh,
  onSignOut,
}: {
  currentUser?: Profile;
  authMode: "login" | "signup";
  authEmail: string;
  authName: string;
  authPassword: string;
  authMessage: string;
  dataMessage: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onModeChange: (value: "login" | "signup") => void;
  onSubmitAuth: () => void;
  onRefresh?: () => void;
  onSignOut?: () => void;
}) {
  const isPending = currentUser && !currentUser.approved;

  return (
    <main className="login-shell">
      <Card className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">26</span>
          <div>
            <strong>Prode Mundial</strong>
            <small>Familia · 2026</small>
          </div>
        </div>

        {isPending ? (
          <>
            <Badge variant="outline" className="status-chip locked">Pendiente</Badge>
            <h1>Tu cuenta está esperando aprobación</h1>
            <p>{dataMessage}</p>
            <div className="auth-form compact-actions">
              <Button onClick={onRefresh}>Revisar aprobación</Button>
              <Button variant="outline" onClick={onSignOut}>Salir</Button>
            </div>
          </>
        ) : (
          <>
            <Tabs value={authMode} onValueChange={(value) => onModeChange(value as "login" | "signup")} className="auth-mode-tabs">
              <TabsList>
                <TabsTrigger value="login" className={authMode === "login" ? "active" : ""}>
                Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className={authMode === "signup" ? "active" : ""}>
                Crear cuenta
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <h1>{authMode === "login" ? "Entrá al prode" : "Creá tu cuenta"}</h1>
            <p>{dataMessage || "Usá email y contraseña para entrar al prode familiar."}</p>

            <div className="auth-form login-form">
              {authMode === "signup" && (
                <Input
                  type="text"
                  placeholder="nombre"
                  value={authName}
                  onChange={(event) => onNameChange(event.target.value)}
                />
              )}
              <Input
                type="email"
                placeholder="email"
                value={authEmail}
                onChange={(event) => onEmailChange(event.target.value)}
              />
              <Input
                type="password"
                placeholder="contraseña"
                value={authPassword}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
              <Button onClick={onSubmitAuth}>{authMode === "login" ? "Entrar" : "Crear cuenta"}</Button>
            </div>

            {authMessage && <small className="auth-message">{authMessage}</small>}
          </>
        )}
      </Card>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="login-shell">
      <Card className="login-panel loading-panel">
        <div className="brand login-brand">
          <span className="brand-mark">26</span>
          <div>
            <strong>Prode Mundial</strong>
            <small>Familia · 2026</small>
          </div>
        </div>
        <div className="loading-line" />
      </Card>
    </main>
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
  onSignOut: () => void;
}) {
  return (
    <Card className={mobile ? "account-panel mobile-account-panel" : "account-panel"} size="sm">
      <div>
        <strong>{currentUser.displayName}</strong>
        <small>{currentUser.email}</small>
      </div>
      <div className="account-actions">
        <ThemePicker theme={theme} onChange={onThemeChange} />
        <Button variant="outline" size="sm" onClick={onSignOut}>Salir</Button>
      </div>
    </Card>
  );
}

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const themeLabels: Record<Theme, string> = {
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
  };

  return (
    <Select value={theme} onValueChange={(value) => onChange(value as Theme)}>
      <SelectTrigger className="theme-select" aria-label="Tema">
        {theme === "light" && <Sun size={15} />}
        {theme === "dark" && <Moon size={15} />}
        {theme === "system" && <Monitor size={15} />}
        <SelectValue>{themeLabels[theme]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light"><Sun size={15} /> Claro</SelectItem>
        <SelectItem value="dark"><Moon size={15} /> Oscuro</SelectItem>
        <SelectItem value="system"><Monitor size={15} /> Sistema</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SaveStatus({ state }: { state: "saving" | "saved" | "error" }) {
  const label = {
    saving: "Guardando",
    saved: "Guardado",
    error: "Error al guardar",
  }[state];

  return (
    <Badge variant={state === "error" ? "destructive" : "secondary"} className={`save-status ${state}`}>
      {state === "saved" && <Check size={14} />}
      {label}
    </Badge>
  );
}

function getAdminLifecycleStatus(match: Match, now: Date) {
  if (match.status === "finalized" || match.status === "live") return match.status;
  const status = getMatchStatus(match, now);
  if (status === "finalized") return "finalized";
  if (status === "locked") return "live";
  return "open";
}

function TeamBlock({
  teamId,
  seed,
  teams,
  align = "left",
}: {
  teamId: string | null;
  seed?: string;
  teams: Team[];
  align?: "left" | "right";
}) {
  return (
    <div className={`team-block ${align}`}>
      <span className="flag">{getTeamFlag(teamId, teams)}</span>
      <strong>{getTeamLabel(teamId, teams, seed)}</strong>
      <small>{teamId ? teams.find((team) => team.id === teamId)?.shortName : seed}</small>
    </div>
  );
}

function ScoreControl({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <div className="score-control">
      <Button variant="outline" size="icon-sm" disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label="Restar gol">
        <Minus size={15} />
      </Button>
      <Input disabled={disabled} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} inputMode="numeric" />
      <Button variant="outline" size="icon-sm" disabled={disabled} onClick={() => onChange(value + 1)} aria-label="Sumar gol">
        <Plus size={15} />
      </Button>
    </div>
  );
}

function StageTabs({
  activeStage,
  stages,
  onChange,
}: {
  activeStage: Stage;
  stages: StageState[];
  onChange: (stage: Stage) => void;
}) {
  const openStageSet = new Set(stages.filter((stage) => stage.open).map((stage) => stage.stage));

  return (
    <Tabs value={activeStage} onValueChange={(value) => onChange(value as Stage)} className="stage-tabs">
      <TabsList>
        {stageOrder.map((stage) => (
          <TabsTrigger
            key={stage}
            value={stage}
            disabled={!openStageSet.has(stage)}
            className={activeStage === stage ? "active" : ""}
          >
            {stageLabels[stage]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function LeaderboardPreview({ rows, onOpen }: { rows: ReturnType<typeof getLeaderboard>; onOpen: () => void }) {
  return (
    <Card className="panel">
      <Button variant="ghost" className="panel-header panel-link" onClick={onOpen}>
        <h2>Tabla familiar</h2>
        <ChevronRight size={18} />
      </Button>
      <div className="leader-list">
        {rows.map((row) => (
          <div key={row.user.id} className="leader-row">
            <span>#{row.rank}</span>
            <strong>{row.user.displayName}</strong>
            <em>{row.points} pts</em>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Leaderboard({ rows }: { rows: ReturnType<typeof getLeaderboard> }) {
  return (
    <Card className="wide-panel">
      <div className="table-toolbar">
        <h2>Tabla general</h2>
        <Tabs className="stage-tabs compact">
          <TabsList>
            {stageOrder.map((stage) => <TabsTrigger key={stage} value={stage}>{stageLabels[stage]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      <div className="data-table leaderboard-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Puesto</TableHead>
              <TableHead>Participante</TableHead>
              <TableHead>Puntos</TableHead>
              <TableHead>Exactos</TableHead>
              <TableHead>Aciertos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
        {rows.map((row) => (
          <TableRow key={row.user.id} className="leaderboard-row">
            <TableCell className="rank">#{row.rank}</TableCell>
            <TableCell><strong>{row.user.displayName}</strong></TableCell>
            <TableCell>{row.points} puntos</TableCell>
            <TableCell>{row.exactHits} exactos</TableCell>
            <TableCell>{row.outcomeHits} aciertos</TableCell>
          </TableRow>
        ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function Results({
  matches,
  predictions,
  now,
  teams,
}: {
  matches: Match[];
  predictions: Prediction[];
  now: Date;
  teams: Team[];
}) {
  return (
    <section className="results-view">
      <div className="results-hero">
        <div>
          <p className="eyeline">Fixture y marcadores</p>
          <h2>Resultados</h2>
        </div>
        <span>{matches.length} partidos</span>
      </div>
      <div className="results-grid">
        {matches.map((match) => {
          const status = getMatchStatus(match, now);
          const predictionCount = predictions.filter((prediction) => prediction.matchId === match.id).length;
          const homeLabel = getTeamLabel(match.homeTeamId, teams, match.homeSeed);
          const awayLabel = getTeamLabel(match.awayTeamId, teams, match.awaySeed);
          const hasFinalScore = status === "finalized" && match.homeScore !== null && match.awayScore !== null;

          return (
            <Card key={match.id} className={`result-card ${status}`}>
              <header>
                <Badge variant="outline" className="stage-chip">{stageLabels[match.stage]}{match.group ? ` · Grupo ${match.group}` : ""}</Badge>
                <Badge variant={status === "finalized" ? "default" : status === "locked" ? "outline" : "secondary"} className={`status-chip ${status}`}>
                  {status === "finalized" ? "Finalizado" : status === "locked" ? "Cerrado" : "Abierto"}
                </Badge>
              </header>
              <div className="result-scoreline">
                <TeamResult teamId={match.homeTeamId} seed={match.homeSeed} label={homeLabel} teams={teams} />
                {hasFinalScore ? (
                  <strong className="result-score">{match.homeScore}-{match.awayScore}</strong>
                ) : (
                  <span className={`result-state ${status}`}>
                    {status === "locked" ? "Resultado pendiente" : "vs"}
                  </span>
                )}
                <TeamResult teamId={match.awayTeamId} seed={match.awaySeed} label={awayLabel} teams={teams} align="right" />
              </div>
              <footer>
                <span><CalendarClock size={14} /> {formatKickoff(match.kickoffUtc)}</span>
                <span>{match.city ?? "Sede por definir"}</span>
                <span>{predictionCount} pronósticos</span>
              </footer>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function TeamResult({
  teamId,
  seed,
  label,
  teams,
  align = "left",
}: {
  teamId: string | null;
  seed?: string;
  label: string;
  teams: Team[];
  align?: "left" | "right";
}) {
  return (
    <div className={`result-team ${align}`}>
      <span className="flag">{getTeamFlag(teamId, teams)}</span>
      <strong>{label}</strong>
      <small>{teamId ? teams.find((team) => team.id === teamId)?.shortName : seed}</small>
    </div>
  );
}

function Admin({
  matches,
  predictions,
  profiles,
  stages,
  teams,
  now,
  onFinalize,
  onCreateMatch,
  onDeleteMatch,
  onStageOpenChange,
  onApprove,
}: {
  matches: Match[];
  predictions: Prediction[];
  profiles: Profile[];
  stages: StageState[];
  teams: Team[];
  now: Date;
  onFinalize: (match: Match) => void;
  onCreateMatch: (input: CreateMatchActionInput) => void;
  onDeleteMatch: (matchId: string) => void;
  onStageOpenChange: (stage: Stage, open: boolean) => void;
  onApprove: (profileId: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, AdminMatchDraft>>(() => {
    return Object.fromEntries(
      matches.map((match) => [
        match.id,
        {
          status: getAdminLifecycleStatus(match, now),
          homeScore: match.homeScore ?? 0,
          awayScore: match.awayScore ?? 0,
          winnerTeamId: match.winnerTeamId,
        },
      ]),
    );
  });
  const [newMatchDraft, setNewMatchDraft] = useState<NewMatchDraft>({
    matchNo: "",
    stage: "groups",
    groupLabel: "",
    homeTeamId: "",
    awayTeamId: "",
    homeSeed: "",
    awaySeed: "",
    kickoffLocal: "",
    venue: "",
    city: "",
  });
  const [confirmingDeleteMatchId, setConfirmingDeleteMatchId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts((current) => {
      return Object.fromEntries(
        matches.map((match) => [
          match.id,
          current[match.id] ?? {
            status: getAdminLifecycleStatus(match, now),
            homeScore: match.homeScore ?? 0,
            awayScore: match.awayScore ?? 0,
            winnerTeamId: match.winnerTeamId,
          },
        ]),
      );
    });
  }, [matches, now]);

  function updateDraft(matchId: string, patch: Partial<AdminMatchDraft>) {
    setDrafts((current) => ({
      ...current,
      [matchId]: {
        status: current[matchId]?.status ?? "open",
        homeScore: current[matchId]?.homeScore ?? 0,
        awayScore: current[matchId]?.awayScore ?? 0,
        winnerTeamId: current[matchId]?.winnerTeamId ?? null,
        ...patch,
      },
    }));
  }

  function updateNewMatchDraft(patch: Partial<NewMatchDraft>) {
    setNewMatchDraft((current) => ({ ...current, ...patch }));
  }

  function submitNewMatch() {
    const kickoffUtc = newMatchDraft.kickoffLocal
      ? new Date(newMatchDraft.kickoffLocal).toISOString()
      : "";

    onCreateMatch({
      matchNo: newMatchDraft.matchNo ? Number(newMatchDraft.matchNo) : null,
      stage: newMatchDraft.stage,
      groupLabel: newMatchDraft.stage === "groups" ? newMatchDraft.groupLabel.trim() || null : null,
      homeTeamId: newMatchDraft.homeTeamId || null,
      awayTeamId: newMatchDraft.awayTeamId || null,
      homeSeed: newMatchDraft.homeTeamId ? null : newMatchDraft.homeSeed.trim() || null,
      awaySeed: newMatchDraft.awayTeamId ? null : newMatchDraft.awaySeed.trim() || null,
      kickoffUtc,
      venue: newMatchDraft.venue.trim() || null,
      city: newMatchDraft.city.trim() || null,
    });
    setNewMatchDraft({
      matchNo: "",
      stage: newMatchDraft.stage,
      groupLabel: "",
      homeTeamId: "",
      awayTeamId: "",
      homeSeed: "",
      awaySeed: "",
      kickoffLocal: "",
      venue: "",
      city: "",
    });
  }

  function confirmDeleteMatch(matchId: string) {
    if (confirmingDeleteMatchId !== matchId) {
      setConfirmingDeleteMatchId(matchId);
      return;
    }

    setConfirmingDeleteMatchId(null);
    onDeleteMatch(matchId);
  }

  return (
    <section className="admin-grid">
      <div className="admin-main-stack">
        <Card className="wide-panel">
          <div className="table-toolbar">
            <h2>Agregar partido</h2>
          </div>
          <div className="manual-match-form">
          <label>
            <span>Nro.</span>
            <Input
              min="1"
              type="number"
              placeholder="Auto"
              value={newMatchDraft.matchNo}
              onChange={(event) => updateNewMatchDraft({ matchNo: event.target.value })}
            />
          </label>
          <label>
            <span>Etapa</span>
            <Select
              value={newMatchDraft.stage}
              onValueChange={(value) => updateNewMatchDraft({ stage: value as Stage })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stageOrder.map((stage) => (
                  <SelectItem key={stage} value={stage}>{stageLabels[stage]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span>Grupo</span>
            <Input
              disabled={newMatchDraft.stage !== "groups"}
              placeholder="A"
              value={newMatchDraft.groupLabel}
              onChange={(event) => updateNewMatchDraft({ groupLabel: event.target.value.toUpperCase() })}
            />
          </label>
          <label>
            <span>Local</span>
            <Select
              value={newMatchDraft.homeTeamId || "__seed__"}
              onValueChange={(value) => updateNewMatchDraft({ homeTeamId: value && value !== "__seed__" ? value : "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__seed__">Por definir</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>{team.flag} {team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!newMatchDraft.homeTeamId && (
              <Input
                placeholder="Ej: Winner Match 89"
                value={newMatchDraft.homeSeed}
                onChange={(event) => updateNewMatchDraft({ homeSeed: event.target.value })}
              />
            )}
          </label>
          <label>
            <span>Visitante</span>
            <Select
              value={newMatchDraft.awayTeamId || "__seed__"}
              onValueChange={(value) => updateNewMatchDraft({ awayTeamId: value && value !== "__seed__" ? value : "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__seed__">Por definir</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>{team.flag} {team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!newMatchDraft.awayTeamId && (
              <Input
                placeholder="Ej: Runner-up Group A"
                value={newMatchDraft.awaySeed}
                onChange={(event) => updateNewMatchDraft({ awaySeed: event.target.value })}
              />
            )}
          </label>
          <label>
            <span>Fecha y hora</span>
            <Input
              type="datetime-local"
              value={newMatchDraft.kickoffLocal}
              onChange={(event) => updateNewMatchDraft({ kickoffLocal: event.target.value })}
            />
          </label>
          <label>
            <span>Sede</span>
            <Input
              placeholder="Estadio"
              value={newMatchDraft.venue}
              onChange={(event) => updateNewMatchDraft({ venue: event.target.value })}
            />
          </label>
          <label>
            <span>Ciudad</span>
            <Input
              placeholder="Ciudad"
              value={newMatchDraft.city}
              onChange={(event) => updateNewMatchDraft({ city: event.target.value })}
            />
          </label>
          <Button
            className="manual-match-submit"
            disabled={!newMatchDraft.kickoffLocal}
            onClick={submitNewMatch}
          >
            Agregar partido
          </Button>
          </div>
        </Card>

        <Card className="wide-panel">
          <div className="table-toolbar">
            <h2>Admin / Resultados</h2>
            <div className="admin-actions">
              <Button variant="outline"><FileUp size={16} /> Importar CSV</Button>
              <Button variant="outline"><Download size={16} /> Exportar CSV</Button>
              <Button variant="outline"><RefreshCcw size={16} /> Recalcular puntos</Button>
            </div>
          </div>
          <div className="data-table admin-table">
          {matches.map((match) => {
            const draft = drafts[match.id] ?? {
              status: match.status ?? "open",
              homeScore: match.homeScore ?? 0,
              awayScore: match.awayScore ?? 0,
              winnerTeamId: match.winnerTeamId,
            };
            const showWinner = match.stage !== "groups" && draft.homeScore === draft.awayScore && match.homeTeamId && match.awayTeamId;
            const finalizedDraft = {
              ...match,
              status: draft.status ?? "open",
              homeScore: draft.homeScore,
              awayScore: draft.awayScore,
              winnerTeamId: draft.homeScore > draft.awayScore
                ? match.homeTeamId
                : draft.awayScore > draft.homeScore
                  ? match.awayTeamId
                  : draft.winnerTeamId,
            };

            return (
              <div key={match.id} className="data-row admin-row">
                <span>#{match.matchNo}</span>
                <strong>{getTeamLabel(match.homeTeamId, teams, match.homeSeed)} vs {getTeamLabel(match.awayTeamId, teams, match.awaySeed)}</strong>
              <span>{stageLabels[match.stage]}</span>
              <span>{match.city ?? "Sede TBD"}</span>
              <Select
                value={draft.status ?? "open"}
                onValueChange={(value) => updateDraft(match.id, { status: value as Match["status"] })}
              >
                <SelectTrigger className="admin-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Abierto</SelectItem>
                  <SelectItem value="live">En juego</SelectItem>
                  <SelectItem value="finalized">Finalizado</SelectItem>
                </SelectContent>
              </Select>
                <div className="admin-score-edit">
                  <label>
                    <span>{getTeamFlag(match.homeTeamId, teams)}</span>
                    <Input
                      min="0"
                      type="number"
                      value={draft.homeScore}
                      onChange={(event) => updateDraft(match.id, { homeScore: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </label>
                  <label>
                    <span>{getTeamFlag(match.awayTeamId, teams)}</span>
                    <Input
                      min="0"
                      type="number"
                      value={draft.awayScore}
                      onChange={(event) => updateDraft(match.id, { awayScore: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </label>
                  {showWinner && (
                    <Select
                      value={draft.winnerTeamId ?? ""}
                      onValueChange={(value) => updateDraft(match.id, { winnerTeamId: value || null })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Clasifica" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={match.homeTeamId ?? ""}>{getTeamLabel(match.homeTeamId, teams, match.homeSeed)}</SelectItem>
                        <SelectItem value={match.awayTeamId ?? ""}>{getTeamLabel(match.awayTeamId, teams, match.awaySeed)}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="admin-row-actions">
                  <Button
                    disabled={Boolean(draft.status === "finalized" && showWinner && !finalizedDraft.winnerTeamId)}
                    onClick={() => onFinalize(finalizedDraft)}
                  >
                    Guardar
                  </Button>
                  <Button
                    variant={confirmingDeleteMatchId === match.id ? "destructive" : "outline"}
                    onClick={() => confirmDeleteMatch(match.id)}
                  >
                    <Trash2 size={15} />
                    {confirmingDeleteMatchId === match.id ? "Confirmar" : "Eliminar"}
                  </Button>
                  {confirmingDeleteMatchId === match.id && (
                    <Button variant="ghost" onClick={() => setConfirmingDeleteMatchId(null)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </Card>
      </div>
      <aside className="admin-side-stack">
        <Card className="panel">
          <CardHeader>
            <CardTitle>Etapas habilitadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="stage-admin-list">
              {stageOrder.map((stage) => {
                const stageState = stages.find((item) => item.stage === stage);
                const isOpen = Boolean(stageState?.open);

                return (
                  <div className="stage-admin-row" key={stage}>
                    <div>
                      <strong>{stageLabels[stage]}</strong>
                      <small>{isOpen ? "Visible para pronosticar" : "Tab deshabilitado"}</small>
                    </div>
                    <Button
                      variant={isOpen ? "outline" : "default"}
                      size="sm"
                      onClick={() => onStageOpenChange(stage, !isOpen)}
                    >
                      {isOpen ? "Deshabilitar" : "Habilitar"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader>
            <CardTitle>Usuarios pendientes</CardTitle>
          </CardHeader>
          <CardContent>
          {profiles.filter((profile) => !profile.approved).map((profile) => (
            <div className="pending-user" key={profile.id}>
              <div>
                <strong>{profile.displayName}</strong>
                <small>{profile.email}</small>
              </div>
              <Button onClick={() => onApprove(profile.id)}><UserCheck size={16} /> Aprobar</Button>
            </div>
          ))}
          <p className="admin-note"><Lock size={14} /> Los administradores predicen con las mismas fechas de cierre.</p>
          <p className="admin-note"><Users size={14} /> {predictions.length} pronósticos cargados.</p>
          </CardContent>
        </Card>
      </aside>
    </section>
  );
}

function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("prode-theme") as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
      document.documentElement.dataset.theme = theme;
      window.localStorage.setItem("prode-theme", theme);
    }

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return [theme, setThemeState] as const;
}

function useHydratedNow() {
  const [now, setNow] = useState(() => new Date(initialRenderNowIso));

  useEffect(() => {
    setNow(new Date());
  }, []);

  return now;
}

function Rules() {
  return (
    <Card className="wide-panel rules-page">
      <h2>Reglas del prode</h2>
      <ul>
        <li><strong>3 puntos</strong> por acertar el resultado exacto.</li>
        <li><strong>1 punto</strong> por acertar ganador, empate o clasificado.</li>
        <li>Los pronósticos se pueden editar hasta el inicio de cada partido.</li>
        <li>Después del cierre se revelan los pronósticos del grupo.</li>
        <li>En cruces, si pronosticás empate, tenés que elegir quién clasifica.</li>
      </ul>
    </Card>
  );
}

function PredictionDrawer({
  match,
  predictions,
  profiles,
  teams,
  onClose,
}: {
  match: Match;
  predictions: Prediction[];
  profiles: Profile[];
  teams: Team[];
  onClose: () => void;
}) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="prediction-drawer" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyeline">{stageLabels[match.stage]}</p>
            <h2>{getTeamLabel(match.homeTeamId, teams, match.homeSeed)} vs {getTeamLabel(match.awayTeamId, teams, match.awaySeed)}</h2>
          </div>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </header>
        <div className="drawer-list">
          {profiles.filter((profile) => profile.approved).map((profile) => {
            const prediction = predictions.find((item) => item.userId === profile.id);
            return (
              <div key={profile.id} className="drawer-row">
                <strong>{profile.displayName}</strong>
                {prediction ? (
                  <span>
                    {prediction.homeScore}-{prediction.awayScore}
                    {prediction.winnerTeamId ? ` · clasifica ${getTeamLabel(prediction.winnerTeamId, teams)}` : ""}
                  </span>
                ) : (
                  <span className="muted">Sin pronóstico</span>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <Button variant={active ? "default" : "ghost"} className={active ? "active" : ""} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </Button>
  );
}

function MobileNav({ activeTab, isAdmin, onChange }: { activeTab: Tab; isAdmin: boolean; onChange: (tab: Tab) => void }) {
  return (
    <nav className="mobile-nav">
      <NavButton icon={<CircleDot />} label="Pronósticos" active={activeTab === "predictions"} onClick={() => onChange("predictions")} />
      <NavButton icon={<Trophy />} label="Tabla" active={activeTab === "leaderboard"} onClick={() => onChange("leaderboard")} />
      <NavButton icon={<CalendarClock />} label="Resultados" active={activeTab === "results"} onClick={() => onChange("results")} />
      <NavButton icon={<Info />} label="Reglas" active={activeTab === "rules"} onClick={() => onChange("rules")} />
      {isAdmin && <NavButton icon={<ShieldCheck />} label="Admin" active={activeTab === "admin"} onClick={() => onChange("admin")} />}
    </nav>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return <div className={`stat ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function pageTitle(tab: Tab) {
  const titles: Record<Tab, string> = {
    predictions: "Pronósticos",
    leaderboard: "Tabla familiar",
    results: "Resultados",
    rules: "Reglas",
    admin: "Panel admin",
  };
  return titles[tab];
}

function getLeaderboard(predictions: Prediction[], profiles: Profile[]) {
  const rows = profiles
    .filter((profile) => profile.approved)
    .map((user) => {
      const userPredictions = predictions.filter((prediction) => prediction.userId === user.id);
      return {
        user,
        points: userPredictions.reduce((total, prediction) => total + (prediction.points ?? 0), 0),
        exactHits: userPredictions.filter((prediction) => prediction.exactHit).length,
        outcomeHits: userPredictions.filter((prediction) => prediction.outcomeHit).length,
        firstUpdatedAt: userPredictions[0]?.updatedAt ?? "9999",
        rank: 0,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.outcomeHits !== a.outcomeHits) return b.outcomeHits - a.outcomeHits;
      if (a.firstUpdatedAt !== b.firstUpdatedAt) return a.firstUpdatedAt.localeCompare(b.firstUpdatedAt);
      return a.user.displayName.localeCompare(b.user.displayName);
    });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
