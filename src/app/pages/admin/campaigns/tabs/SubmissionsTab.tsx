import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChefHat, Loader2, Lock, Pencil, Search, XCircle } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../../../components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "../../../../components/ui/dialog";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { AUDIT_ACTION, SUBMISSION_STATUS, fmtDateTime, fromInputValue } from "../../../../lib/campaigns/format";
import type { AdminSubmissionDetail, AdminSubmissionRow } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, Notice, ReasonDialog, SectionLabel, useBusy, useLoader } from "../shared";
import type { TabProps } from "./types";

const FIELD_LIMITS = {
  dish_name: [3, 120], description: [10, 600], ingredients: [5, 3000], preparation: [10, 6000],
} as const;
type FieldKey = keyof typeof FIELD_LIMITS;
const FIELD_LABEL: Record<FieldKey, string> = {
  dish_name: "Nome do prato", description: "Descrição", ingredients: "Ingredientes", preparation: "Modo de preparo",
};

function StatusBadge({ status }: { status: AdminSubmissionRow["status"] }) {
  const s = SUBMISSION_STATUS[status];
  return <Badge className={cn("border text-[10px]", s.className)}>{s.label}</Badge>;
}

export function SubmissionsTab({ campaignId, perms, onChanged }: TabProps) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const list = useLoader<AdminSubmissionRow[]>(() => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (dq) p.set("q", dq);
    const f = fromInputValue(from ? `${from}T00:00` : "");
    const t = fromInputValue(to ? `${to}T23:59` : "");
    if (f) p.set("from", f);
    if (t) p.set("to", t);
    return campaignsApi.get(`/admin/campaigns/${campaignId}/submissions?${p.toString()}`);
  }, [campaignId, status, dq, from, to]);

  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por prato ou participante" className="pl-9 rounded-xl h-10" aria-label="Buscar receita" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="rounded-xl h-10" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            <SelectItem value="pending">Aguardando análise</SelectItem>
            <SelectItem value="approved">Aprovadas</SelectItem>
            <SelectItem value="rejected">Reprovadas</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl h-10" aria-label="Enviadas a partir de" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl h-10" aria-label="Enviadas até" />
        </div>
      </div>

      {list.loading && !list.data ? (
        <LoadingBox />
      ) : list.error && !list.data ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <EmptyBox icon={<ChefHat size={36} />} title="Nenhuma receita encontrada." hint="Quando colaboradores enviarem receitas, elas aparecerão aqui." />
      ) : (
        <Card className="rounded-3xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Participante</TableHead>
                <TableHead>Prato</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Enviada em</TableHead>
                <TableHead className="text-right pr-4"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4">
                    <p className="font-medium">{r.user_name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.user_department || "—"}</p>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">{r.dish_name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDateTime(r.submitted_at)}</TableCell>
                  <TableCell className="text-right pr-4">
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setOpenId(r.id)}>Abrir</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <SubmissionSheet
        campaignId={campaignId}
        submissionId={openId}
        perms={perms}
        onClose={() => setOpenId(null)}
        onChanged={() => { list.reload(); onChanged(); }}
      />
    </div>
  );
}

// ─────────────────────────────── Detalhe ───────────────────────────────

function SubmissionSheet({
  campaignId, submissionId, perms, onClose, onChanged,
}: {
  campaignId: string;
  submissionId: string | null;
  perms: Record<string, boolean>;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={!!submissionId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
        {submissionId && (
          <SubmissionDetail key={submissionId} campaignId={campaignId} submissionId={submissionId} perms={perms} onChanged={onChanged} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SubmissionDetail({
  campaignId, submissionId, perms, onChanged,
}: { campaignId: string; submissionId: string; perms: Record<string, boolean>; onChanged: () => void }) {
  const d = useLoader<AdminSubmissionDetail>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/submissions/${submissionId}`),
    [campaignId, submissionId],
  );
  const { busy, run } = useBusy();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const base = `/admin/campaigns/${campaignId}/submissions/${submissionId}`;
  const sub = d.data?.submission;

  const approve = async () => {
    const r = await run("approve", () => campaignsApi.post(`${base}/approve`), "Receita aprovada.");
    if (r.ok) { d.reload(); onChanged(); }
  };
  const reject = async (reason: string) => {
    const r = await run("reject", () => campaignsApi.post(`${base}/reject`, { reason }), "Receita reprovada.");
    if (r.ok) { setRejectOpen(false); d.reload(); onChanged(); }
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <SheetHeader className="p-0 pr-6">
        <SheetTitle className="text-lg">{sub?.dish_name ?? "Receita"}</SheetTitle>
        <SheetDescription>{sub ? `${sub.user_name}${sub.user_department ? ` · ${sub.user_department}` : ""}` : "Carregando..."}</SheetDescription>
      </SheetHeader>

      {d.loading && !d.data ? (
        <LoadingBox />
      ) : d.error && !d.data ? (
        <ErrorBox message={d.error} onRetry={d.reload} />
      ) : d.data && sub ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sub.status} />
            <span className="text-[11px] text-muted-foreground">Enviada em {fmtDateTime(sub.submitted_at)}</span>
            {sub.reviewed_at && <span className="text-[11px] text-muted-foreground">· analisada em {fmtDateTime(sub.reviewed_at)}{sub.reviewed_by_name ? ` por ${sub.reviewed_by_name}` : ""}</span>}
          </div>

          {sub.status === "rejected" && sub.rejection_reason && (
            <Notice tone="danger" title="Justificativa da reprovação">{sub.rejection_reason}</Notice>
          )}

          {d.data.media.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Mídias</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {d.data.media.map((m) =>
                  m.kind === "video" ? (
                    <video key={m.id} src={m.url} controls preload="metadata" className="col-span-2 w-full rounded-2xl bg-black max-h-72" />
                  ) : (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className={cn("block overflow-hidden rounded-2xl border bg-muted", m.kind === "main_photo" && "col-span-2")}>
                      <img src={m.url} alt={m.kind === "main_photo" ? "Foto principal" : "Foto da receita"} loading="lazy" className="w-full h-full object-cover max-h-72" />
                    </a>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {(["description", "ingredients", "preparation"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <SectionLabel>{FIELD_LABEL[k]}</SectionLabel>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{sub[k]}</p>
              </div>
            ))}
          </div>

          {/* Ações */}
          {perms.campaigns_review && (
            <div className="space-y-3 border-t pt-4">
              {d.data.locked ? (
                <Notice tone="info" title="A votação já começou">
                  <span className="inline-flex items-center gap-1.5"><Lock size={12} /> Não é mais possível aprovar ou reprovar receitas. A correção de texto continua disponível, com justificativa.</span>
                </Notice>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sub.status !== "approved" && (
                    <Button className="gap-2 rounded-xl" onClick={approve} disabled={busy !== null}>
                      {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Aprovar
                    </Button>
                  )}
                  {sub.status !== "rejected" && (
                    <Button variant="destructive" className="gap-2 rounded-xl" onClick={() => setRejectOpen(true)} disabled={busy !== null}>
                      <XCircle size={14} /> Reprovar
                    </Button>
                  )}
                </div>
              )}
              <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => setEditOpen(true)} disabled={busy !== null}>
                <Pencil size={13} /> Corrigir texto
              </Button>
            </div>
          )}

          {/* Histórico */}
          {d.data.history.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <SectionLabel>Histórico desta receita</SectionLabel>
              <ul className="space-y-2">
                {d.data.history.map((h, i) => (
                  <li key={`${h.occurred_at}-${i}`} className="rounded-xl bg-muted/50 px-3 py-2 text-[13px]">
                    <p><b>{AUDIT_ACTION[h.action] ?? h.action}</b> <span className="text-muted-foreground">· {h.actor_name || "Sistema"} · {fmtDateTime(h.occurred_at)}</span></p>
                    {h.reason && <p className="text-muted-foreground italic mt-0.5">“{h.reason}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ReasonDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            title="Reprovar receita"
            description="O colaborador verá esta justificativa e poderá ajustar a receita antes do início da votação."
            label="Justificativa da reprovação"
            placeholder="Explique o motivo com clareza (mínimo de 10 caracteres)"
            minLength={10}
            confirmLabel="Reprovar receita"
            destructive
            pending={busy === "reject"}
            onConfirm={reject}
          />
          {editOpen && (
            <EditDialog
              base={base}
              sub={sub}
              onClose={() => setEditOpen(false)}
              onSaved={() => { setEditOpen(false); d.reload(); onChanged(); }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function EditDialog({
  base, sub, onClose, onSaved,
}: {
  base: string;
  sub: AdminSubmissionDetail["submission"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vals, setVals] = useState<Record<FieldKey, string>>({
    dish_name: sub.dish_name, description: sub.description, ingredients: sub.ingredients, preparation: sub.preparation,
  });
  const [reason, setReason] = useState("");
  const { busy, run } = useBusy();

  const changed = useMemo(
    () => (Object.keys(FIELD_LIMITS) as FieldKey[]).filter((k) => vals[k].trim() !== sub[k]),
    [vals, sub],
  );
  const invalid = (Object.keys(FIELD_LIMITS) as FieldKey[]).filter((k) => {
    const [min, max] = FIELD_LIMITS[k];
    const n = vals[k].trim().length;
    return n < min || n > max;
  });
  const ok = changed.length > 0 && invalid.length === 0 && reason.trim().length >= 10;

  const save = async () => {
    const body: Record<string, string> = { reason: reason.trim() };
    for (const k of changed) body[k] = vals[k].trim();
    const r = await run("edit", () => campaignsApi.put(base, body), "Receita corrigida.");
    if (r.ok) onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Corrigir texto da receita</DialogTitle>
          <DialogDescription>A correção fica registrada no histórico com o antes e o depois, e exige justificativa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {(Object.keys(FIELD_LIMITS) as FieldKey[]).map((k) => {
            const [min, max] = FIELD_LIMITS[k];
            const n = vals[k].trim().length;
            return (
              <div key={k} className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{FIELD_LABEL[k]}</Label>
                {k === "dish_name" ? (
                  <Input value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} maxLength={max} className="rounded-xl h-10" disabled={!!busy} />
                ) : (
                  <Textarea value={vals[k]} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))} maxLength={max} rows={k === "description" ? 3 : 5} className="rounded-xl" disabled={!!busy} />
                )}
                <p className={cn("text-[11px]", n < min ? "text-destructive" : "text-muted-foreground")}>{n}/{max} (mínimo {min})</p>
              </div>
            );
          })}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Justificativa da correção</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} className="rounded-xl" disabled={!!busy} placeholder="Por que o texto está sendo alterado (mínimo de 10 caracteres)" />
            <p className={cn("text-[11px]", reason.trim().length >= 10 ? "text-muted-foreground" : "text-destructive")}>{reason.trim().length}/10 caracteres mínimos</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={!!busy}>Cancelar</Button>
          <Button className="rounded-xl gap-2" onClick={save} disabled={!ok || !!busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
