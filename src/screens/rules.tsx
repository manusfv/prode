import { Card } from "@/components/ui/card";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="m-0 text-sm font-black uppercase tracking-wide text-app-muted">
          {title}
        </h3>
        {subtitle ? (
          <p className="m-0 text-xs text-app-muted">{subtitle}</p>
        ) : null}
      </div>
      <ul className="m-0 list-disc space-y-2 pl-5 text-sm leading-normal text-app-muted">
        {children}
      </ul>
    </section>
  );
}

export function RulesScreen() {
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <h2 className="m-0 text-lg font-black">Reglas del prode</h2>
      <p className="mt-1 text-sm text-app-muted">
        El torneo se juega en dos etapas: la fase de <strong>grupos</strong> y los{" "}
        <strong>cruces</strong> de eliminación directa. Cada una puntúa distinto.
      </p>

      <div className="mt-4 space-y-5">
        <Section title="Grupos" subtitle="Ordenás los 4 equipos de cada grupo.">
          <li>
            Ordenás los 4 equipos de cada grupo del 1° al 4°. Podés guardar el orden
            de a poco; lo único que no se permite es repetir equipos.
          </li>
          <li>
            Acertar la posición exacta suma <strong>10, 8, 6 y 4 puntos</strong>{" "}
            (1° a 4°). Máximo <strong>28 puntos</strong> por grupo.
          </li>
          <li>
            Cada grupo se cierra cuando arranca su primer partido. Después del cierre
            se revelan los pronósticos del grupo.
          </li>
        </Section>

        <Section
          title="Cruces"
          subtitle="Eliminación directa: 16avos, octavos, cuartos, semis, 3er puesto y final."
        >
          <li>
            El puntaje sube por ronda. Cada partido suma por acertar el{" "}
            <strong>resultado exacto</strong> o, en su defecto, el{" "}
            <strong>ganador o empate</strong>:
          </li>
          <li>16avos: <strong>25</strong> exacto · <strong>10</strong> ganador/empate</li>
          <li>Octavos: <strong>50</strong> exacto · <strong>30</strong> ganador/empate</li>
          <li>Cuartos: <strong>80</strong> exacto · <strong>60</strong> ganador/empate</li>
          <li>Semis: <strong>110</strong> exacto · <strong>90</strong> ganador/empate</li>
          <li>3er puesto y final: <strong>150</strong> exacto · <strong>120</strong> ganador/empate</li>
          <li>Los pronósticos se pueden editar hasta el inicio de cada partido.</li>
        </Section>
      </div>
    </Card>
  );
}
