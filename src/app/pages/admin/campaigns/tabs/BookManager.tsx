import { useEffect, useRef, useState } from "react";
import { BookOpen, Eye, FileDown, FileText, Loader2, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Progress } from "../../../../components/ui/progress";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../../components/ui/dialog";
import { BookReader } from "../../../../components/campaigns/book/BookReader";
import { campaignsApi, errMsg, uploadToSignedUrl } from "../../../../lib/campaigns/api";
import { generateBookPdf, pdfBlob } from "../../../../lib/campaigns/bookPdf";
import { fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminBookState, AdminSubmissionRow, BookMeta, BookView } from "../../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, Notice, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

/**
 * Livro de Receitas da campanha (dentro da aba Relatórios).
 * Fluxo: Gerar (junta as receitas APROVADAS numa versão em rascunho, com o PDF) → Prévia → Publicar.
 * Gerar nunca publica; o livro no ar só muda quando uma nova versão é publicada (a anterior sai de cena).
 */
export function BookManager(props: TabProps) {
  if (!props.perms.campaigns_review && !props.perms.campaigns_publish) {
    return <Notice tone="info">Você não tem permissão para gerenciar o Livro de Receitas desta campanha.</Notice>;
  }
  return <BookManagerInner {...props} />;
}

type Progress = { pct: number; label: string };

function BookManagerInner({ campaignId, perms, onChanged }: TabProps) {
  const base = `/admin/campaigns/${campaignId}`;
  const canGenerate = !!perms.campaigns_review;
  const canPublish = !!perms.campaigns_publish;
  const { data, loading, error, reload } = useLoader(() => campaignsApi.get<AdminBookState>(`${base}/book`), [base]);
  const { busy, run } = useBusy();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "withdraw" | null>(null);
  const [preview, setPreview] = useState<{ version: number; status: "draft" | "published"; view: BookView | null; error: string | null } | null>(null);
  const [localPdf, setLocalPdf] = useState<{ version: number; url: string } | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const published = data?.published ?? null;
  const draft = data?.draft ?? null;

  const refreshAll = async () => {
    await reload();
    onChanged?.();
  };

  /** Monta o PDF no navegador a partir da prévia da versão, envia ao armazenamento e confere no servidor. */
  const buildAndUploadPdf = async (version: number) => {
    setProgress({ pct: 6, label: "Carregando as receitas…" });
    const view = await campaignsApi.get<BookView>(`${base}/book/preview?version=${version}`);
    const { bytes } = await generateBookPdf(view, {
      onProgress: ({ done, total, label }) => setProgress({ pct: 10 + Math.round((done / total) * 68), label }),
    });
    const blob = pdfBlob(bytes);
    setProgress({ pct: 80, label: "Enviando o PDF…" });
    const t = await campaignsApi.post<{ path: string; token: string; signedUrl: string }>(`${base}/book/pdf-upload-url`, { version });
    await uploadToSignedUrl(t.signedUrl, blob, (fr) => setProgress({ pct: 80 + Math.round(fr * 15), label: "Enviando o PDF…" }));
    setProgress({ pct: 97, label: "Conferindo o arquivo…" });
    await campaignsApi.post(`${base}/book/pdf-finalize`, { version });
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    setLocalPdf({ version, url: urlRef.current });
    setProgress({ pct: 100, label: "Pronto" });
  };

  const generate = async (excluded: string[]) => {
    setPickOpen(false);
    const r = await run("gen", async () => {
      setProgress({ pct: 3, label: "Reunindo as receitas aprovadas…" });
      const g = await campaignsApi.post<{ version: number; recipes_count: number }>(`${base}/book/generate`, { excluded });
      await buildAndUploadPdf(g.version);
      return g;
    });
    setProgress(null);
    if (r.ok) toast.success(`Livro gerado com ${plural(r.value.recipes_count, "receita", "receitas")}. Confira a prévia e publique.`);
    await refreshAll(); // mesmo com falha no PDF, o rascunho já existe e aparece com "PDF pendente"
  };

  const retryPdf = async (version: number) => {
    const r = await run("pdf", () => buildAndUploadPdf(version));
    setProgress(null);
    if (r.ok) toast.success("PDF do livro pronto.");
    await refreshAll();
  };

  const openPreview = async (meta: BookMeta, status: "draft" | "published") => {
    setPreview({ version: meta.version, status, view: null, error: null });
    try {
      const view = await campaignsApi.get<BookView>(`${base}/book/preview?version=${meta.version}`);
      setPreview({ version: meta.version, status, view, error: null });
    } catch (e) {
      setPreview({ version: meta.version, status, view: null, error: errMsg(e, "Não foi possível abrir a prévia.") });
    }
  };

  const publish = async () => {
    if (!draft) return;
    setConfirm(null);
    const r = await run("publish", () => campaignsApi.post(`${base}/book/publish`, { version: draft.version }), "Livro publicado para os colaboradores.");
    if (r.ok) await refreshAll();
  };

  const withdraw = async () => {
    setConfirm(null);
    const r = await run("withdraw", () => campaignsApi.post(`${base}/book/withdraw`, { version: published?.version }), "Livro retirado do ar.");
    if (r.ok) await refreshAll();
  };

  if (loading && !data) return <LoadingBox label="Carregando o livro…" />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const working = busy !== null;
  const outdated = !!published && data.approved_count > published.recipes_count + published.excluded.length;

  return (
    <Card className="rounded-3xl border">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Livro de Receitas</p>
              <p className="text-[12px] text-muted-foreground">{plural(data.approved_count, "receita aprovada", "receitas aprovadas")}</p>
            </div>
          </div>
          {canGenerate && (
            <Button className="h-11 w-full shrink-0 gap-2 rounded-xl sm:w-auto" disabled={working || !data.can_generate} onClick={() => setPickOpen(true)}>
              {busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {draft || published ? "Nova versão" : "Gerar livro"}
            </Button>
          )}
        </div>

        {!data.can_generate && canGenerate && (
          <Notice tone="info">{data.reason || "Ainda não há receitas aprovadas para montar o livro."}</Notice>
        )}

        {progress && (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <Progress value={progress.pct} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress.label}</p>
          </div>
        )}

        {published && (
          <section className="space-y-3 rounded-2xl border border-emerald-300/70 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20" aria-label="Versão publicada">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">No ar</span>
              <span className="text-sm font-semibold text-foreground">Versão {published.version}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {plural(published.recipes_count, "receita", "receitas")} · publicado em {fmtDateTime(published.published_at)}
              {published.published_by_name ? ` por ${published.published_by_name}` : ""}
            </p>
            {outdated && <Notice tone="warn">Há receitas aprovadas que não estão neste livro. Gere uma nova versão para incluí-las.</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => void openPreview(published, "published")}>
                <Eye size={15} /> Ver
              </Button>
              {canPublish && (
                <Button variant="outline" className="h-11 gap-2 rounded-xl text-destructive" disabled={working} onClick={() => setConfirm("withdraw")}>
                  {busy === "withdraw" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Retirar do ar
                </Button>
              )}
            </div>
          </section>
        )}

        {draft && (
          <section className="space-y-3 rounded-2xl border border-dashed border-amber-400/80 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/20" aria-label="Rascunho">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold text-white">Rascunho</span>
              <span className="text-sm font-semibold text-foreground">Versão {draft.version}</span>
              <span className={draft.has_pdf ? "text-[11px] font-semibold text-emerald-700 dark:text-emerald-400" : "text-[11px] font-semibold text-amber-700 dark:text-amber-400"}>
                {draft.has_pdf ? "PDF pronto" : "PDF pendente"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {plural(draft.recipes_count, "receita", "receitas")}
              {draft.excluded.length > 0 ? ` (${plural(draft.excluded.length, "ficou", "ficaram")} de fora)` : ""} · gerado em {fmtDateTime(draft.generated_at)}
              {draft.generated_by_name ? ` por ${draft.generated_by_name}` : ""}
            </p>
            {published && <p className="text-xs text-muted-foreground">Ao publicar, esta versão substitui a versão {published.version} que está no ar.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => void openPreview(draft, "draft")}>
                <Eye size={15} /> Prévia
              </Button>
              {!draft.has_pdf && canGenerate && (
                <Button variant="outline" className="h-11 gap-2 rounded-xl" disabled={working} onClick={() => void retryPdf(draft.version)}>
                  {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Gerar o PDF
                </Button>
              )}
              {localPdf?.version === draft.version && (
                <a
                  href={localPdf.url}
                  download={`livro-de-receitas-v${draft.version}.pdf`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileDown size={15} /> Baixar o PDF
                </a>
              )}
              {canPublish && (
                <Button className="h-11 gap-2 rounded-xl" disabled={working || !draft.has_pdf} onClick={() => setConfirm("publish")}>
                  {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publicar
                </Button>
              )}
            </div>
            {canPublish && !draft.has_pdf && <p className="text-xs text-muted-foreground">Gere o PDF para poder publicar.</p>}
          </section>
        )}

        {!published && !draft && data.can_generate && (
          <p className="text-xs text-muted-foreground">Nenhuma versão ainda. Gerar o livro não publica nada: você confere a prévia antes.</p>
        )}
      </CardContent>

      <PickDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        base={base}
        hasDraft={!!draft}
        initialExcluded={draft?.excluded ?? []}
        onConfirm={(ids) => void generate(ids)}
      />

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Prévia · versão {preview?.version} {preview?.status === "published" ? "(no ar)" : "(rascunho)"}</DialogTitle>
            <DialogDescription>Assim o livro aparece para os colaboradores.</DialogDescription>
          </DialogHeader>
          {preview && !preview.view && !preview.error && <LoadingBox label="Abrindo a prévia…" />}
          {preview?.error && <Notice tone="warn">{preview.error}</Notice>}
          {preview?.view && <BookReader book={preview.view} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Publicar o livro?"
        description={
          published
            ? `Os colaboradores passam a ver a versão ${draft?.version} no lugar da versão ${published.version}.`
            : "Os colaboradores elegíveis passam a ver o livro e a baixar o PDF."
        }
        confirmLabel="Publicar"
        onConfirm={() => void publish()}
      />
      <ConfirmDialog
        open={confirm === "withdraw"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Retirar o livro do ar?"
        description="Os colaboradores deixam de ver o livro e de baixar o PDF. Você pode publicar de novo depois."
        confirmLabel="Retirar"
        variant="destructive"
        onConfirm={() => void withdraw()}
      />
    </Card>
  );
}

// ──────────────────── Escolha das receitas que entram na versão ────────────────────

function PickDialog({
  open, onOpenChange, base, hasDraft, initialExcluded, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  base: string;
  hasDraft: boolean;
  initialExcluded: string[];
  onConfirm: (excluded: string[]) => void;
}) {
  const [rows, setRows] = useState<AdminSubmissionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setErr(null);
    setOff(new Set(initialExcluded));
    campaignsApi
      .get<AdminSubmissionRow[]>(`${base}/submissions?status=approved`)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setErr(errMsg(e, "Não foi possível listar as receitas aprovadas.")); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base]);

  const included = rows ? rows.filter((r) => !off.has(r.id)).length : 0;
  const toggle = (id: string, on: boolean) =>
    setOff((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Quais receitas entram no livro?</DialogTitle>
          <DialogDescription>
            Só receitas aprovadas. Desmarque as que ficarão de fora desta versão.
          </DialogDescription>
        </DialogHeader>
        {hasDraft && <Notice tone="info">Gerar de novo substitui o rascunho atual. O livro que está no ar não muda.</Notice>}
        {err && <Notice tone="warn">{err}</Notice>}
        {!rows && !err && <LoadingBox label="Carregando as receitas…" />}
        {rows && rows.length === 0 && <Notice tone="info">Nenhuma receita aprovada ainda.</Notice>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-border rounded-2xl border">
            {rows.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5">
                  <Checkbox checked={!off.has(r.id)} onCheckedChange={(v) => toggle(r.id, v === true)} aria-label={`Incluir ${r.dish_name}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{r.dish_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">por {r.user_name}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11 rounded-xl" disabled={!rows || included === 0} onClick={() => onConfirm([...off].filter((id) => rows?.some((r) => r.id === id)))}>
            Gerar com {plural(included, "receita", "receitas")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
