import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Lock, Plus, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";
import { cn } from "../../../../lib/utils";
import { campaignsApi, CampaignApiError, errMsg } from "../../../../lib/campaigns/api";
import { PERMISSION_LABEL } from "../../../../lib/campaigns/format";
import type { AdminAccessRow } from "../../../../lib/campaigns/types";
import { invalidateCampaignPerms } from "../useCampaignPerms";
import { EmptyBox, ErrorBox, LoadingBox, Notice, useBusy, useLoader } from "../shared";

// Agrupamento visual das permissões (a lista oficial vem da API em `keys`).
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Acesso", keys: ["campaigns"] },
  { title: "Campanhas", keys: ["campaigns_create", "campaigns_edit", "campaigns_duplicate", "campaigns_schedule"] },
  { title: "Receitas e participantes", keys: ["campaigns_participants", "campaigns_review"] },
  { title: "Resultados e relatórios", keys: ["campaigns_results", "campaigns_export"] },
  {
    title: "Ações sensíveis",
    keys: [
      "campaigns_publish", "campaigns_votes_view", "campaigns_votes_invalidate", "campaigns_tiebreak",
      "campaigns_winner_confirm", "campaigns_announce", "campaigns_export_votes", "campaigns_access",
    ],
  },
];

type SiteUser = { id: string; name: string; department: string; unit: string };
type AccessData = { items: AdminAccessRow[]; keys: string[] };

export function AccessTab({ currentUserId }: { currentUserId?: string }) {
  const { data, loading, error, reload } = useLoader<AccessData>(() => campaignsApi.get("/admin/access"), []);
  const { busy, run } = useBusy();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, boolean>>>({});
  const [removeTarget, setRemoveTarget] = useState<AdminAccessRow | null>(null);

  const [adding, setAdding] = useState(false);
  const [users, setUsers] = useState<SiteUser[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [query, setQuery] = useState("");

  const items = data?.items ?? [];
  const known = useMemo(() => new Set(items.map((i) => i.user_id)), [items]);

  const draftOf = (row: AdminAccessRow) => drafts[row.user_id] ?? row.permissions ?? {};
  const countOn = (p: Record<string, boolean>) => Object.values(p).filter(Boolean).length;
  const dirty = (row: AdminAccessRow) => {
    const d = drafts[row.user_id];
    if (!d) return false;
    const keys = new Set([...Object.keys(d), ...Object.keys(row.permissions ?? {})]);
    return [...keys].some((k) => !!d[k] !== !!row.permissions?.[k]);
  };

  const toggle = (row: AdminAccessRow, key: string, on: boolean) => {
    const next = { ...draftOf(row) };
    next[key] = on;
    if (key === "campaigns" && !on) {
      // Sem acesso ao módulo, nenhuma outra permissão faz sentido.
      for (const k of Object.keys(next)) next[k] = false;
    } else if (on) {
      next.campaigns = true;
    }
    setDrafts((d) => ({ ...d, [row.user_id]: next }));
  };

  const save = async (row: AdminAccessRow) => {
    const permissions = draftOf(row);
    const r = await run(`save:${row.user_id}`, () =>
      campaignsApi.put(`/admin/access/${row.user_id}`, { name: row.user_name, permissions }),
      "Permissões salvas.");
    if (r.ok) {
      setDrafts((d) => {
        const { [row.user_id]: _omit, ...rest } = d;
        return rest;
      });
      if (row.user_id === currentUserId) invalidateCampaignPerms();
      reload();
    }
  };

  const remove = async () => {
    const row = removeTarget;
    if (!row) return;
    setRemoveTarget(null);
    const r = await run(`rm:${row.user_id}`, () => campaignsApi.del(`/admin/access/${row.user_id}`), "Acesso removido.");
    if (r.ok) {
      if (row.user_id === currentUserId) invalidateCampaignPerms();
      reload();
    }
  };

  const openAdd = async () => {
    setAdding(true);
    if (users || loadingUsers) return;
    setLoadingUsers(true);
    setUsersError(null);
    try {
      setUsers(await campaignsApi.get<SiteUser[]>("/admin/users"));
    } catch (e) {
      setUsersError(
        e instanceof CampaignApiError && e.status === 403
          ? "Para listar as pessoas do site você precisa também da permissão \"Editar campanhas\"."
          : errMsg(e),
      );
    } finally {
      setLoadingUsers(false);
    }
  };

  const addPerson = async (u: SiteUser) => {
    const r = await run(`add:${u.id}`, () =>
      campaignsApi.put(`/admin/access/${u.id}`, { name: u.name, permissions: { campaigns: true } }),
      `${u.name} agora acessa o módulo (somente visualização). Ajuste as permissões abaixo.`);
    if (r.ok) {
      setAdding(false);
      setQuery("");
      setOpenId(u.id);
      reload();
    }
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => !known.has(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.department.toLowerCase().includes(q))
      .slice(0, 30);
  }, [users, known, query]);

  if (loading && !data) return <LoadingBox />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="space-y-4" data-tutorial="camp-access">
      <Notice tone="info" title="Quem pode usar o módulo de Campanhas">
        Este acesso é independente das permissões do restante do site. Ações sensíveis (publicar, ver votos individuais,
        decidir empate, confirmar e divulgar o vencedor) devem ficar com poucas pessoas.
      </Notice>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? "pessoa com acesso" : "pessoas com acesso"}</p>
        <Button size="sm" className="gap-2 rounded-xl" onClick={openAdd} disabled={adding}>
          <UserPlus size={14} /> Adicionar pessoa
        </Button>
      </div>

      {adding && (
        <Card className="rounded-3xl border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar pelo nome ou departamento"
                  className="pl-9 rounded-xl h-10"
                  aria-label="Buscar pessoa"
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)} className="rounded-xl">Fechar</Button>
            </div>
            {loadingUsers ? (
              <LoadingBox label="Carregando pessoas..." />
            ) : usersError ? (
              <Notice tone="warn">{usersError}</Notice>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pessoa encontrada.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border">
                {matches.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{[u.department, u.unit].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1 rounded-xl shrink-0" disabled={busy !== null} onClick={() => addPerson(u)}>
                      {busy === `add:${u.id}` ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Dar acesso
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyBox icon={<ShieldCheck size={36} />} title="Ninguém tem acesso ainda." hint="Adicione uma pessoa para começar." />
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const perms = draftOf(row);
            const open = openId === row.user_id;
            const isDirty = dirty(row);
            return (
              <Card key={row.user_id} className="rounded-3xl border overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 transition-colors"
                  onClick={() => setOpenId(open ? null : row.user_id)}
                  aria-expanded={open}
                >
                  <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShieldCheck size={16} className="text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {row.user_name || "Sem nome"}
                      {row.user_id === currentUserId && <span className="ml-2 text-[10px] text-muted-foreground font-normal">(você)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{Math.max(0, countOn(perms) - (perms.campaigns ? 1 : 0))} permissões além do acesso</p>
                  </div>
                  {isDirty && <Badge className="border bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800 text-[10px]">Alterações não salvas</Badge>}
                  <ChevronDown size={16} className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>

                {open && (
                  <div className="border-t p-4 space-y-5">
                    {GROUPS.map((g) => (
                      <div key={g.title} className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          {g.title === "Ações sensíveis" && <Lock size={11} />} {g.title}
                        </p>
                        <div className="divide-y divide-border rounded-2xl border">
                          {g.keys.map((k) => {
                            const meta = PERMISSION_LABEL[k] ?? { label: k, hint: "" };
                            return (
                              <label key={k} className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer">
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium">
                                    {meta.label}
                                    {meta.sensitive && <Lock size={11} className="inline ml-1.5 text-muted-foreground" aria-label="Ação sensível" />}
                                  </span>
                                  <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
                                </span>
                                <Switch checked={!!perms[k]} onCheckedChange={(v) => toggle(row, k, v)} disabled={busy !== null} aria-label={meta.label} />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 rounded-xl text-destructive hover:text-destructive"
                        disabled={busy !== null}
                        onClick={() => setRemoveTarget(row)}
                      >
                        <Trash2 size={14} /> Remover acesso
                      </Button>
                      <div className="flex items-center gap-2">
                        {isDirty && (
                          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDrafts(({ [row.user_id]: _o, ...rest }) => rest)} disabled={busy !== null}>
                            Descartar
                          </Button>
                        )}
                        <Button size="sm" className="gap-2 rounded-xl" disabled={!isDirty || busy !== null} onClick={() => save(row)}>
                          {busy === `save:${row.user_id}` && <Loader2 size={14} className="animate-spin" />} Salvar permissões
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remover acesso ao módulo?"
        description={`${removeTarget?.user_name ?? "Esta pessoa"} deixará de ver e usar o módulo de Campanhas. É preciso manter pelo menos uma pessoa com gestão de acessos.`}
        confirmLabel="Remover acesso"
        variant="destructive"
        onConfirm={remove}
      />
    </div>
  );
}
