import { useMemo, useRef, useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { plural } from "../../lib/campaigns/format";
import type { AdminBookItem, BookAudience } from "../../lib/campaigns/types";
import { ErrorBox, LoadingBox, RestrictedBox, useBusy, useLoader } from "./campaigns/shared";
import { useCampaignPerms } from "./campaigns/useCampaignPerms";
import { SectionNav } from "./campaigns/SectionNav";
import { AddRecipeDialog } from "./recipebook/AddRecipeDialog";
import { BookItemDialog } from "./recipebook/BookItemDialog";
import { BookRows, countByBookFilter, matchesBookFilter } from "./recipebook/BookRows";
import type { BookFilter } from "./recipebook/BookRows";
import { BookSettings } from "./recipebook/BookSettings";
import { bookApi, norm } from "./recipebook/bookApi";
import { AUDIENCE_ALL, audiencePhrase, audienceSummary, someoneJoins, someoneLeaves } from "./recipebook/bookAudience";

type Confirm =
  | { kind: "publish" | "unpublish" | "auto_on" | "auto_off" }
  | { kind: "remove"; item: AdminBookItem }
  | { kind: "audience"; audience: BookAudience };

/**
 * Livro de Receitas — UM acervo único e permanente (Acesso Admin).
 * Receitas aprovadas entram sozinhas (se ligado) ou por escolha; também há receitas manuais.
 * Remover tira só do Livro de Receitas: o cadastro, o status e o histórico da receita na campanha não mudam.
 * Publicar respeita o público escolhido (todos os colaboradores ou pessoas específicas).
 */
export function AdminRecipeBook() {
  const { perms, loading: permsLoading, isAdmin } = useCampaignPerms();
  const canManage = !!perms.campaigns_review;
  const canPublish = !!perms.campaigns_publish;
  const { data, loading, error, reload } = useLoader(() => bookApi.load(), []);
  const { busy, run } = useBusy();
  const [filter, setFilter] = useState<BookFilter>("in_book");
  const [query, setQuery] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Guarda o último diálogo aberto: durante a animação de fechar, o texto não some (sem "caixa vazia" piscando).
  const lastConfirm = useRef<Confirm | null>(null);
  if (confirm) lastConfirm.current = confirm;
  const shown = confirm ?? lastConfirm.current;

  const items = data?.items ?? [];
  const savedAudience: BookAudience = data?.settings.audience ?? AUDIENCE_ALL;
  // Os números das abas saem da própria lista (batem sempre com o que aparece abaixo).
  const counts = useMemo(() => countByBookFilter(items), [items]);
  const visible = useMemo(() => {
    const q = norm(query);
    return items.filter(
      (it) => matchesBookFilter(filter, it) && (!q || norm(`${it.dish_name} ${it.author} ${it.campaign_name ?? ""}`).includes(q)),
    );
  }, [items, filter, query]);

  if (permsLoading) return <LoadingBox />;
  if (!isAdmin || (!canManage && !canPublish)) return <RestrictedBox message="Você não tem acesso ao Livro de Receitas. Peça a quem gerencia os acessos para liberar." />;

  const restore = async (it: AdminBookItem) => {
    const r = await run("restore", () => bookApi.restore(it.ref), `“${it.dish_name}” voltou ao Livro de Receitas.`);
    if (r.ok) { setOpenRef(null); void reload(); }
  };

  const doConfirm = async () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "remove") {
      const r = await run("remove", () => bookApi.remove(c.item.ref), `“${c.item.dish_name}” saiu do Livro de Receitas. A receita continua na campanha.`);
      if (r.ok) { setOpenRef(null); void reload(); }
      return;
    }
    if (c.kind === "audience") {
      const r = await run("audience", () => bookApi.audience(c.audience), "Público do Livro de Receitas atualizado.");
      if (r.ok) void reload();
      return;
    }
    const patch = c.kind === "publish" ? { published: true } : c.kind === "unpublish" ? { published: false } : { auto_include: c.kind === "auto_on" };
    const msg =
      c.kind === "publish" ? `Livro de Receitas publicado para ${audiencePhrase(savedAudience)}.`
      : c.kind === "unpublish" ? "Livro de Receitas retirado do ar."
      : c.kind === "auto_on" ? "Receitas aprovadas passam a entrar sozinhas."
      : "Só entram as receitas que você adicionar.";
    const r = await run("settings", () => bookApi.settings(patch), msg);
    if (r.ok) void reload();
  };

  const onToggleAuto = (value: boolean) => setConfirm({ kind: value ? "auto_on" : "auto_off" });
  // Com o Livro de Receitas no ar, mudar o público pede confirmação (alguém pode deixar de ver); fora do ar, salva direto.
  const onSaveAudience = (audience: BookAudience) => {
    if (data?.settings.published) setConfirm({ kind: "audience", audience });
    else void run("audience", () => bookApi.audience(audience), "Público do Livro de Receitas atualizado.").then((r) => { if (r.ok) void reload(); });
  };

  const confirmText = (() => {
    if (!shown) return { title: "", description: "", label: "Confirmar", destructive: false };
    const n = data?.counts.in_book ?? 0;
    switch (shown.kind) {
      case "publish":
        return {
          title: savedAudience.mode === "all" ? "Publicar para todos?" : `Publicar para ${audienceSummary(savedAudience)}?`,
          description: `${plural(n, "receita fica visível", "receitas ficam visíveis")} para ${audiencePhrase(savedAudience)} em Campanhas. Quem não foi incluído não vê o Livro de Receitas. Você pode retirar do ar quando quiser.`,
          label: "Publicar",
          destructive: false,
        };
      case "unpublish":
        return { title: "Retirar o Livro de Receitas do ar?", description: "Os colaboradores deixam de ver o Livro de Receitas. Nada é apagado.", label: "Retirar do ar", destructive: false };
      case "audience": {
        const leaves = someoneLeaves(savedAudience, shown.audience);
        const joins = someoneJoins(savedAudience, shown.audience);
        return {
          title: "Alterar quem vê o Livro de Receitas?",
          description: `O Livro de Receitas está publicado. Novo público: ${audiencePhrase(shown.audience)}.${leaves ? " Quem sair deixa de ver o Livro de Receitas." : ""}${joins ? " Quem entrar passa a ver o Livro de Receitas." : ""}`,
          label: "Salvar público",
          destructive: leaves,
        };
      }
      case "auto_on":
        return { title: "Incluir aprovadas automaticamente?", description: "Toda receita aprovada em qualquer campanha entra sozinha, mesmo com a campanha ativa. As que você removeu continuam de fora.", label: "Ligar", destructive: false };
      case "auto_off":
        return { title: "Parar a inclusão automática?", description: "As receitas que entraram sozinhas deixam de aparecer no Livro de Receitas; nada é apagado e ligar de novo traz tudo de volta. As que você adicionou ou cadastrou continuam.", label: "Desligar", destructive: false };
      case "remove":
        return {
          title: "Remover do Livro de Receitas?",
          description: `“${shown.item.dish_name}” sai só do Livro de Receitas. A receita continua na campanha, com o mesmo status e histórico, e pode ser readicionada.`,
          label: "Remover do Livro de Receitas",
          destructive: true,
        };
    }
  })();

  return (
    <div className="space-y-6">
      <SectionNav active="book" showBook={canManage || canPublish} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <BookOpen size={24} className="text-primary" />
            Livro de Receitas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Remover tira só do Livro de Receitas, nunca da campanha.</p>
        </div>
        {canManage && (
          <Button data-tutorial="camp-book-add" className="h-11 gap-2 rounded-xl" onClick={() => setAddOpen(true)} disabled={busy !== null}>
            {busy === "restore" || busy === "remove" ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar receita
          </Button>
        )}
      </div>

      {loading && !data ? (
        <LoadingBox />
      ) : error && !data ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data ? (
        <>
          <BookSettings
            data={data}
            canPublish={canPublish}
            busy={busy}
            onPublish={() => setConfirm({ kind: "publish" })}
            onUnpublish={() => setConfirm({ kind: "unpublish" })}
            onToggleAuto={onToggleAuto}
            onSaveAudience={onSaveAudience}
          />
          <BookRows
            items={visible}
            total={items.length}
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            canManage={canManage}
            busy={busy}
            onOpen={setOpenRef}
            onRemove={(it) => setConfirm({ kind: "remove", item: it })}
            onRestore={(it) => void restore(it)}
          />
        </>
      ) : null}

      <BookItemDialog
        itemRef={openRef}
        canManage={canManage}
        onClose={() => setOpenRef(null)}
        onChanged={() => void reload()}
        onRemove={(it) => setConfirm({ kind: "remove", item: it })}
        onRestore={(it) => void restore(it)}
      />
      {canManage && <AddRecipeDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => void reload()} />}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirmText.title}
        description={confirmText.description}
        confirmLabel={confirmText.label}
        variant={confirmText.destructive ? "destructive" : "default"}
        onConfirm={() => void doConfirm()}
      />
    </div>
  );
}
