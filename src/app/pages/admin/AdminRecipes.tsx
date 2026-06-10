import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../../components/ui/accordion";
import {
  ChefHat,
  Loader2,
  Trash2,
  CheckCircle,
  Clock,
  Star,
  User,
  BookOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "../../lib/utils";

type SuggestionStatus = "pending" | "reviewed" | "approved";

interface RecipeSuggestion {
  id: string;
  userId: string;
  userName: string;
  title: string;
  description?: string;
  recipe: string;
  submittedAt: string;
  status: SuggestionStatus;
}

const STATUS_CONFIG: Record<
  SuggestionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
    icon: <Clock size={11} />,
  },
  reviewed: {
    label: "Revisado",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    icon: <CheckCircle size={11} />,
  },
  approved: {
    label: "Aprovado",
    className: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800",
    icon: <Star size={11} />,
  },
};

export function AdminRecipes() {
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const data = await api.authGet("/admin/recipe-suggestions");
      if (Array.isArray(data)) setSuggestions(data);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar sugestões.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleUpdateStatus = async (id: string, status: SuggestionStatus) => {
    setUpdatingId(id);
    try {
      await api.authPut(`/admin/recipe-suggestions/${id}`, { status });
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
      toast.success(
        status === "approved"
          ? "Sugestão aprovada!"
          : "Marcado como revisado."
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.authDel(`/admin/recipe-suggestions/${deleteTarget}`);
      setSuggestions((prev) => prev.filter((s) => s.id !== deleteTarget));
      toast.success("Sugestão excluída.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const counts = {
    pending: suggestions.filter((s) => s.status === "pending").length,
    reviewed: suggestions.filter((s) => s.status === "reviewed").length,
    approved: suggestions.filter((s) => s.status === "approved").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ChefHat size={24} className="text-primary" />
            Sugestões de Receita
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Receitas enviadas pelos colaboradores para a cozinha avaliar
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSuggestions}
          disabled={loading}
          className="gap-2 rounded-xl shrink-0"
        >
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {(["pending", "reviewed", "approved"] as SuggestionStatus[]).map((status) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <Card key={status} className="rounded-2xl border">
              <CardContent className="p-4 flex flex-col items-center gap-1">
                <span className="text-2xl font-bold text-foreground">
                  {counts[status]}
                </span>
                <Badge
                  className={cn(
                    "text-[10px] font-medium gap-1 border",
                    cfg.className
                  )}
                >
                  {cfg.icon}
                  {cfg.label}
                </Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={32} className="animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="rounded-3xl border-dashed">
          <CardContent className="p-12 text-center">
            <BookOpen size={36} className="mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="font-medium text-muted-foreground">
              Nenhuma sugestão recebida ainda.
            </p>
            <p className="text-xs text-muted-foreground mt-1 opacity-70">
              Quando colaboradores enviarem receitas, elas aparecerão aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl overflow-hidden border">
          <Accordion type="multiple" className="divide-y divide-border">
            {suggestions.map((s) => {
              const cfg = STATUS_CONFIG[s.status];
              const isUpdating = updatingId === s.id;
              return (
                <AccordionItem key={s.id} value={s.id} className="border-0">
                  <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-accent/50 transition-colors rounded-none [&[data-state=open]]:bg-accent/30">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User size={16} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {s.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {s.userName} ·{" "}
                          {format(parseISO(s.submittedAt), "dd MMM yyyy", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          "text-[10px] font-medium gap-1 border shrink-0 mr-2",
                          cfg.className
                        )}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </Badge>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="px-5 pb-5">
                    <div className="space-y-4 pt-1">
                      {s.description && (
                        <p className="text-sm text-muted-foreground italic">
                          {s.description}
                        </p>
                      )}

                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                          Receita / Ingredientes
                        </p>
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                          {s.recipe}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {s.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUpdating}
                            onClick={() => handleUpdateStatus(s.id, "reviewed")}
                            className="gap-1.5 rounded-xl text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
                          >
                            {isUpdating ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <CheckCircle size={13} />
                            )}
                            Marcar como Revisado
                          </Button>
                        )}
                        {s.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUpdating}
                            onClick={() => handleUpdateStatus(s.id, "approved")}
                            className="gap-1.5 rounded-xl text-green-600 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/30"
                          >
                            {isUpdating ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Star size={13} />
                            )}
                            Aprovar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => setDeleteTarget(s.id)}
                          className="gap-1.5 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto"
                        >
                          <Trash2 size={13} />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Excluir sugestão?"
        description="Esta ação não pode ser desfeita. A sugestão será removida permanentemente."
        confirmLabel="Sim, Excluir"
        cancelLabel="Cancelar"
        variant="destructive"
      />
    </div>
  );
}
