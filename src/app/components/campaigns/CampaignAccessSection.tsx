import { useState } from "react";
import { Check, ChevronDown, Lock, Megaphone } from "lucide-react";
import { Switch } from "../ui/switch";
import { cn } from "../../lib/utils";
import { PERMISSION_LABEL } from "../../lib/campaigns/format";

/**
 * Acesso ao módulo de Campanhas dentro do editor único de "Usuários & Permissões".
 *
 * O acesso continua sendo uma lista PRÓPRIA do módulo (`campaign_admins`, servida por
 * campaigns-api `/admin/access`), independente das permissões gerais do site — de propósito:
 * ela não depende do `user_metadata.role`. Esta peça só dá uma tela única para ele, trocando
 * 17 chaves soltas por 4 níveis, com "Personalizar" para quem precisa do detalhe.
 */

/** As 17 chaves, na ordem oficial (a API grava SEMPRE todas, com true/false explícito). */
export const CAMPAIGN_PERM_KEYS: string[] = Object.keys(PERMISSION_LABEL);

export type CampaignLevel = "none" | "follow" | "manage" | "full" | "custom";

const FOLLOW_KEYS = ["campaigns"];
const MANAGE_KEYS = [
  "campaigns", "campaigns_create", "campaigns_edit", "campaigns_duplicate", "campaigns_schedule",
  "campaigns_participants", "campaigns_review", "campaigns_results", "campaigns_export",
];

export const CAMPAIGN_LEVELS: { value: Exclude<CampaignLevel, "custom">; label: string; short: string; hint: string }[] = [
  { value: "none", label: "Sem acesso", short: "Sem acesso", hint: "Não vê nem usa o módulo de Campanhas." },
  { value: "follow", label: "Acompanhar", short: "Acompanha", hint: "Só visualiza as campanhas e os números." },
  {
    value: "manage",
    label: "Gerenciar",
    short: "Gerencia",
    hint: "Cria e edita campanhas, analisa receitas, vê a apuração e exporta relatórios.",
  },
  {
    value: "full",
    label: "Administrador completo",
    short: "Administrador",
    hint: "Tudo: também publica, vê votos individuais, decide empate, confirma e divulga o vencedor e gerencia acessos.",
  },
];

/** Constrói o objeto com as 17 chaves explícitas (true/false) a partir das que estão ligadas. */
export function campaignPermsFromKeys(on: string[]): Record<string, boolean> {
  const set = new Set(on);
  const out: Record<string, boolean> = {};
  for (const k of CAMPAIGN_PERM_KEYS) out[k] = set.has(k);
  return out;
}

export function campaignPermsForLevel(level: Exclude<CampaignLevel, "custom">): Record<string, boolean> {
  if (level === "none") return campaignPermsFromKeys([]);
  if (level === "follow") return campaignPermsFromKeys(FOLLOW_KEYS);
  if (level === "manage") return campaignPermsFromKeys(MANAGE_KEYS);
  return campaignPermsFromKeys(CAMPAIGN_PERM_KEYS);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));

/** Descobre o nível que melhor descreve as permissões atuais ("custom" se não bater com nenhum). */
export function campaignLevelOf(perms: Record<string, boolean> | null | undefined): CampaignLevel {
  const on = CAMPAIGN_PERM_KEYS.filter((k) => perms?.[k] === true);
  if (on.length === 0 || !on.includes("campaigns")) return "none";
  if (sameSet(on, FOLLOW_KEYS)) return "follow";
  if (sameSet(on, MANAGE_KEYS)) return "manage";
  if (on.length === CAMPAIGN_PERM_KEYS.length) return "full";
  return "custom";
}

export function campaignLevelShort(level: CampaignLevel): string {
  if (level === "custom") return "Personalizado";
  return CAMPAIGN_LEVELS.find((l) => l.value === level)?.short ?? "";
}

/** Ao ligar/desligar uma chave: sem "campaigns" nada mais faz sentido; ligar qualquer uma liga "campaigns". */
export function toggleCampaignPerm(perms: Record<string, boolean>, key: string, on: boolean): Record<string, boolean> {
  const next = { ...perms, [key]: on };
  if (key === "campaigns" && !on) for (const k of CAMPAIGN_PERM_KEYS) next[k] = false;
  else if (on) next.campaigns = true;
  return campaignPermsFromKeys(CAMPAIGN_PERM_KEYS.filter((k) => next[k] === true));
}

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

export function CampaignAccessSection({
  perms,
  onChange,
  disabled,
}: {
  perms: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  disabled?: boolean;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const level = campaignLevelOf(perms);

  return (
    <section className="space-y-3" aria-label="Acesso a Campanhas">
      <div className="flex items-center gap-2">
        <Megaphone size={15} className="text-primary" aria-hidden="true" />
        <h3 className="text-sm font-bold text-foreground">Campanhas</h3>
        {level === "custom" && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Personalizado
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Nível de acesso a Campanhas" className="grid gap-1.5">
        {CAMPAIGN_LEVELS.map((l) => {
          const active = level === l.value;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(campaignPermsForLevel(l.value))}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-accent/50",
                disabled && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  active ? "border-primary" : "border-muted-foreground/60",
                )}
                aria-hidden="true"
              >
                {active && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{l.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{l.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        aria-expanded={showCustom}
        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        Personalizar
        <ChevronDown size={13} className={cn("transition-transform", showCustom && "rotate-180")} />
      </button>

      {showCustom && (
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {g.title === "Ações sensíveis" && <Lock size={10} aria-hidden="true" />} {g.title}
              </p>
              <div className="divide-y divide-border rounded-xl border">
                {g.keys.map((k) => {
                  const meta = PERMISSION_LABEL[k] ?? { label: k, hint: "" };
                  return (
                    <label key={k} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {meta.label}
                          {meta.sensitive && <Lock size={10} className="ml-1.5 inline text-muted-foreground" aria-label="Ação sensível" />}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{meta.hint}</span>
                      </span>
                      <Switch
                        checked={perms[k] === true}
                        onCheckedChange={(v) => onChange(toggleCampaignPerm(perms, k, v))}
                        disabled={disabled}
                        aria-label={meta.label}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {level !== "none" && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Check size={12} className="mt-0.5 shrink-0 text-green-600" aria-hidden="true" />
          Este acesso vale só para o módulo de Campanhas e é independente das permissões do restante do painel.
        </p>
      )}
    </section>
  );
}
