import { Card, CardContent } from "../../../components/ui/Card";
import { Switch } from "../../../components/ui/switch";
import { Stat } from "../campaigns/shared";
import type { AdminRecipeBook } from "../../../lib/campaigns/types";
import { SWITCH_HIT } from "../../../lib/campaigns/touch";

type Props = {
  data: AdminRecipeBook;
  canPublish: boolean;
  busy: string | null;
  onToggle: (key: "published" | "auto_include", value: boolean) => void;
};

/** Duas chaves do livro + contadores. Só quem pode publicar mexe nas chaves (os demais só leem). */
export function BookSettings({ data, canPublish, busy, onToggle }: Props) {
  const { settings, counts } = data;
  const rows = [
    {
      key: "published" as const,
      label: "Publicado para colaboradores",
      hint: settings.published ? "Os colaboradores já veem o livro em Campanhas." : "Os colaboradores ainda não veem o livro.",
      value: settings.published,
    },
    {
      key: "auto_include" as const,
      label: "Incluir receitas aprovadas automaticamente",
      hint: settings.auto_include ? "Toda receita aprovada entra sozinha." : "Só entram as receitas que você adicionar.",
      value: settings.auto_include,
    },
  ];
  return (
    <div className="space-y-3" data-tutorial="camp-book-settings">
      <Card className="rounded-3xl">
        <CardContent className="divide-y divide-border p-0">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{r.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>
              </div>
              <span className="text-xs font-bold text-muted-foreground" aria-hidden="true">{r.value ? "Sim" : "Não"}</span>
              <Switch
                checked={r.value}
                disabled={!canPublish || busy !== null}
                onCheckedChange={(v) => onToggle(r.key, v)}
                aria-label={r.label}
                className={SWITCH_HIT}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      {!canPublish && <p className="text-xs text-muted-foreground">Só quem publica campanhas pode alterar estas chaves.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="No livro" value={counts.in_book} />
        <Stat label="De campanhas" value={counts.from_campaigns} />
        <Stat label="Manuais" value={counts.manual} />
        <Stat label="Removidas" value={counts.removed} />
      </div>
    </div>
  );
}
