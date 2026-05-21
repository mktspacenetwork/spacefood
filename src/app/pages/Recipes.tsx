import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../components/ui/accordion";
import {
  ChevronLeft,
  BookOpen,
  Send,
  ChefHat,
  Sparkles,
  UtensilsCrossed,
  Loader2,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { MenuItem } from "../types";
import { cn } from "../lib/utils";

type SuggestionForm = {
  title: string;
  description: string;
  recipe: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Prato Principal": "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "Opção Vegetariana": "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  "Guarnição": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "Salada": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Sobremesa": "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
};

export function Recipes() {
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<SuggestionForm>({
    title: "",
    description: "",
    recipe: "",
  });

  useEffect(() => {
    api
      .get("/menu")
      .then((data) => {
        if (Array.isArray(data)) {
          setItems(data.filter((i: MenuItem) => i.recipe && i.recipe.trim()));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.warning("Informe o nome do prato.");
      return;
    }
    if (!form.recipe.trim()) {
      toast.warning("Descreva a receita antes de enviar.");
      return;
    }
    setSubmitting(true);
    try {
      await api.authPost("/recipe-suggestions", {
        title: form.title.trim(),
        description: form.description.trim(),
        recipe: form.recipe.trim(),
      });
      toast.success("Sugestão enviada com sucesso! Obrigado 🎉");
      setForm({ title: "", description: "", recipe: "" });
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar sugestão.");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryColor = (cat: string) =>
    CATEGORY_COLORS[cat] || "bg-muted text-muted-foreground";

  return (
    <div className="min-h-screen bg-background pb-24 pt-4 px-4 md:px-8 max-w-2xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="rounded-full shrink-0"
        >
          <ChevronLeft size={24} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen size={22} className="text-amber-500" />
            Receitas
          </h1>
          <p className="text-sm text-muted-foreground">
            Conheça os pratos e sugira novas receitas
          </p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-10"
      >
        {/* ── Seção 1: Receitas disponíveis ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UtensilsCrossed size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Receitas do Cardápio
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={28} className="animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <Card className="p-8 text-center rounded-3xl border-dashed">
              <BookOpen size={32} className="mx-auto text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">
                Nenhuma receita cadastrada ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1 opacity-70">
                Quando o admin cadastrar receitas nos itens, elas aparecerão aqui.
              </p>
            </Card>
          ) : (
            <Card className="rounded-3xl overflow-hidden border">
              <Accordion type="multiple" className="divide-y divide-border">
                {items.map((item, idx) => (
                  <AccordionItem
                    key={item.id}
                    value={item.id}
                    className="border-0"
                  >
                    <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-accent/50 transition-colors rounded-none [&[data-state=open]]:bg-accent/30">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 bg-muted">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="font-semibold text-sm text-foreground truncate">
                            {item.name}
                          </p>
                          <Badge
                            className={cn(
                              "text-[10px] px-2 py-0 mt-0.5 border-0 font-medium",
                              categoryColor(item.category)
                            )}
                          >
                            {item.category}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-5 pb-5">
                      <div className="pt-1 pl-13">
                        {item.description && (
                          <p className="text-xs text-muted-foreground italic mb-3 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Sparkles size={12} />
                            Modo de Preparo / Receita
                          </p>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {item.recipe}
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          )}
        </section>

        {/* ── Seção 2: Sugerir receita ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ChefHat size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">
              Sugerir uma Receita
            </h2>
          </div>

          <div className="p-5 bg-primary/5 rounded-3xl border border-primary/10 mb-5">
            <p className="text-sm text-foreground/70 leading-relaxed text-center italic">
              Tem uma receita favorita que adoraria ver no cardápio? Compartilhe
              com a nossa cozinha!
            </p>
          </div>

          <Card className="rounded-3xl p-5 border">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Nome do prato */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nome do prato *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Frango ao molho pesto"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Descrição breve
                </label>
                <input
                  type="text"
                  placeholder="Ex: Proteico, leve, ótimo para o almoço"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
              </div>

              {/* Receita */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Receita / Ingredientes *
                </label>
                <textarea
                  placeholder="Liste os ingredientes e o modo de preparo..."
                  value={form.recipe}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, recipe: e.target.value }))
                  }
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none leading-relaxed"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl gap-2 font-bold"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {submitting ? "Enviando..." : "Enviar Sugestão"}
              </Button>
            </form>
          </Card>
        </section>
      </motion.div>
    </div>
  );
}
