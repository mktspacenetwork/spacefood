import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Users } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Switch } from "../../../components/ui/switch";
import { cn } from "../../../lib/utils";
import { SectionLabel } from "../campaigns/shared";
import type { AdminRecipeBook, BookAudience } from "../../../lib/campaigns/types";
import { SWITCH_HIT } from "../../../lib/campaigns/touch";
import { BookAudiencePicker } from "./BookAudiencePicker";
import { AUDIENCE_ALL, audienceEmpty, audienceForButton, audiencePhrase, audienceSummary, sameAudience } from "./bookAudience";

type Props = {
  data: AdminRecipeBook;
  canPublish: boolean;
  busy: string | null;
  onPublish: () => void;
  onUnpublish: () => void;
  onToggleAuto: (value: boolean) => void;
  onSaveAudience: (audience: BookAudience) => void;
};

/**
 * Publicação, inclusão automática e PÚBLICO do Livro de Receitas. Só quem pode publicar mexe nestas opções (os demais só leem).
 * O botão de publicar cita o público ("Publicar para todos" / "Publicar para 3 pessoas") e fica desligado enquanto o público
 * estiver incompleto ("Pessoas específicas" sem ninguém) ou com alterações ainda não salvas.
 * (Os números do livro ficaram nos filtros da lista logo abaixo: um controle só, sem repetir.)
 */
export function BookSettings({ data, canPublish, busy, onPublish, onUnpublish, onToggleAuto, onSaveAudience }: Props) {
  const { settings } = data;
  // Servidor sem o recurso de público: tudo igual a antes ("todos"), sem a área de escolher.
  const audienceSupported = !!settings.audience;
  const saved = settings.audience ?? AUDIENCE_ALL;
  const savedKey = `${saved.mode}:${[...saved.user_ids].sort().join(",")}`;
  const [draft, setDraft] = useState<BookAudience>(saved);
  useEffect(() => { setDraft(saved); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [savedKey]);

  const dirty = useMemo(() => !sameAudience(draft, saved), [draft, saved]);
  const draftEmpty = audienceEmpty(draft);
  const savedEmpty = audienceEmpty(saved);
  const publishBlock = draftEmpty
    ? "Escolha pelo menos uma pessoa para publicar."
    : dirty
      ? "Salve o público antes de publicar."
      : savedEmpty
        ? "Escolha pelo menos uma pessoa para publicar."
        : null;
  const savingAudience = busy === "audience";

  return (
    <div className="space-y-3" data-tutorial="camp-book-settings">
      <Card className="rounded-3xl">
        <CardContent className="divide-y divide-border p-0">
          {/* Publicação */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", settings.published ? "bg-green-500" : "bg-muted-foreground/50")} aria-hidden="true" />
                {settings.published ? `Publicado para ${audiencePhrase(saved)}` : "Não publicado"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {settings.published
                  ? "Quem está no público já vê o Livro de Receitas em Campanhas."
                  : "Os colaboradores ainda não veem o Livro de Receitas."}
              </p>
            </div>
            {settings.published ? (
              <Button variant="outline" className="h-11 w-full gap-2 rounded-xl sm:w-auto" onClick={onUnpublish} disabled={!canPublish || busy !== null}>
                {busy === "settings" ? <Loader2 size={15} className="animate-spin" /> : <EyeOff size={15} aria-hidden="true" />} Retirar do ar
              </Button>
            ) : (
              <Button className="h-11 w-full gap-2 rounded-xl sm:w-auto" onClick={onPublish} disabled={!canPublish || busy !== null || publishBlock !== null}>
                {busy === "settings" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} aria-hidden="true" />} Publicar para {audienceForButton(saved)}
              </Button>
            )}
          </div>
          {!settings.published && canPublish && publishBlock && (
            <p className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300" role="status">{publishBlock}</p>
          )}

          {/* Inclusão automática */}
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Incluir receitas aprovadas automaticamente</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {settings.auto_include ? "Toda receita aprovada entra sozinha." : "Só entram as receitas que você adicionar."}
              </p>
            </div>
            <span className="text-xs font-bold text-muted-foreground" aria-hidden="true">{settings.auto_include ? "Sim" : "Não"}</span>
            <Switch
              checked={settings.auto_include}
              disabled={!canPublish || busy !== null}
              onCheckedChange={onToggleAuto}
              aria-label="Incluir receitas aprovadas automaticamente"
              className={SWITCH_HIT}
            />
          </div>
        </CardContent>
      </Card>
      {!canPublish && <p className="text-xs text-muted-foreground">Só quem publica campanhas pode alterar estas opções.</p>}

      {/* Público */}
      {audienceSupported && (
        <Card className="rounded-3xl" data-tutorial="camp-book-audience">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>Quem vê o Livro de Receitas</SectionLabel>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                <Users size={13} aria-hidden="true" /> {audienceSummary(saved)}
              </span>
            </div>
            {canPublish ? (
              <>
                <BookAudiencePicker value={draft} onChange={setDraft} disabled={busy !== null} />
                {draftEmpty && <p className="text-xs font-medium text-destructive" role="alert">Escolha pelo menos uma pessoa ou volte para "Todos os colaboradores".</p>}
                {dirty && (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDraft(saved)} disabled={busy !== null}>Descartar</Button>
                    <Button className="h-11 gap-2 rounded-xl" onClick={() => onSaveAudience(draft)} disabled={busy !== null || draftEmpty}>
                      {savingAudience && <Loader2 size={15} className="animate-spin" />} Salvar público
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Só quem publica campanhas pode alterar o público.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
