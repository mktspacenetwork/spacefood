import { ChefHat, Users } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { ParticipantsTab } from "./ParticipantsTab";
import { SubmissionsTab } from "./SubmissionsTab";
import type { TabProps } from "./types";

export type RecipesView = "recipes" | "people";

/** Quais visões da aba Receitas existem para esta pessoa e campanha. */
export function recipesViews(campaign: TabProps["campaign"], perms: Record<string, boolean>): RecipesView[] {
  const out: RecipesView[] = [];
  if (perms.campaigns_review && campaign.features.submission) out.push("recipes");
  if (perms.campaigns_participants) out.push("people");
  return out;
}

/**
 * RECEITAS — uma aba só para o dia a dia da gestão: "Por receita" (analisar: aprovar/reprovar) e "Por pessoa"
 * (quem participa, votos recebidos e de quem vieram). A visão vem do link (`?section=people`), então o atalho
 * antigo "Participantes" e os indicadores da Visão geral caem direto na visão certa.
 */
export function RecipesTab(props: TabProps & { section?: string | null }) {
  const { section, ...tabProps } = props;
  const views = recipesViews(tabProps.campaign, tabProps.perms);
  const view: RecipesView = views.length === 1 ? views[0] : section === "people" ? "people" : "recipes";

  const pick = (v: RecipesView) => tabProps.goTab?.("submissions", v === "people" ? "people" : undefined);

  return (
    <div className="space-y-4">
      {views.length > 1 && (
        <div
          data-tutorial="camp-recipes-toggle"
          className="inline-flex h-11 w-full items-center rounded-2xl border bg-card p-1 sm:w-auto"
          role="group"
          aria-label="Ver por receita ou por pessoa"
        >
          {([["recipes", "Por receita", ChefHat], ["people", "Por pessoa", Users]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => pick(key)}
              className={cn(
                "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                view === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon size={15} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      )}
      {view === "people" ? <ParticipantsTab {...tabProps} /> : <SubmissionsTab {...tabProps} />}
    </div>
  );
}
