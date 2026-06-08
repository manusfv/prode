import { Card } from "@/components/ui/card";
import { ui } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";

export function RulesScreen() {
  return (
    <Card className={cn(ui.panel, "p-4")}>
      <h2 className="m-0 text-lg font-black">Reglas del prode</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-normal text-app-muted">
        <li><strong>3 puntos</strong> por acertar el resultado exacto.</li>
        <li><strong>1 punto</strong> por acertar ganador, empate o clasificado.</li>
        <li>Los pronósticos se pueden editar hasta el inicio de cada partido.</li>
        <li>Después del cierre se revelan los pronósticos del grupo.</li>
        <li>En cruces, si pronosticás empate, tenés que elegir quién clasifica.</li>
      </ul>
    </Card>
  );
}
