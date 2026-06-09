import { Card } from "@/components/ui/card";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function RulesScreen() {
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <h2 className="m-0 text-lg font-black">Reglas del prode</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-normal text-app-muted">
        <li><strong>Grupos:</strong> ordenás los 4 equipos de cada grupo del 1° al 4°. Acertar la posición exacta suma <strong>10, 8, 6 y 4 puntos</strong> (1° a 4°). Máximo 28 por grupo.</li>
        <li>Cada grupo se cierra cuando arranca su primer partido. Después del cierre se revelan los pronósticos del grupo.</li>
        <li><strong>Cruces:</strong> <strong>3 puntos</strong> por el resultado exacto y <strong>1 punto</strong> por acertar ganador, empate o clasificado.</li>
        <li>Los pronósticos de cruces se pueden editar hasta el inicio de cada partido.</li>
        <li>En cruces, si pronosticás empate, tenés que elegir quién clasifica.</li>
      </ul>
    </Card>
  );
}
