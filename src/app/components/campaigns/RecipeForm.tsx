import { useState } from "react";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

export type RecipeFields = {
  dish_name: string;
  description: string;
  ingredients: string;
  preparation: string;
};
export type RecipeFieldKey = keyof RecipeFields;

/** Limites idênticos aos do banco (campaign_validate_recipe). */
export const RECIPE_LIMITS: Record<RecipeFieldKey, { min: number; max: number; label: string; empty: string }> = {
  dish_name: { min: 3, max: 120, label: "Nome do prato", empty: "Informe o nome do prato." },
  description: { min: 10, max: 600, label: "Descrição", empty: "Escreva uma descrição para a receita." },
  ingredients: { min: 5, max: 3000, label: "Ingredientes", empty: "Liste os ingredientes." },
  preparation: { min: 10, max: 6000, label: "Modo de preparo", empty: "Descreva o modo de preparo." },
};

export const EMPTY_RECIPE: RecipeFields = { dish_name: "", description: "", ingredients: "", preparation: "" };

/** Mensagens de erro por campo (vazio = tudo certo). Conta o texto sem espaços nas pontas, como o servidor. */
export function validateRecipe(v: RecipeFields): Partial<Record<RecipeFieldKey, string>> {
  const out: Partial<Record<RecipeFieldKey, string>> = {};
  (Object.keys(RECIPE_LIMITS) as RecipeFieldKey[]).forEach((k) => {
    const { min, max, label, empty } = RECIPE_LIMITS[k];
    const len = v[k].trim().length;
    if (len === 0) out[k] = empty;
    else if (len < min) out[k] = `${label}: escreva pelo menos ${min} caracteres (faltam ${min - len}).`;
    else if (len > max) out[k] = `${label}: máximo de ${max} caracteres (sobraram ${len - max}).`;
  });
  return out;
}

const LABEL = "text-xs font-bold uppercase tracking-wider text-muted-foreground";
const FIELD = "rounded-xl border-border bg-background text-base focus-visible:border-primary/50 focus-visible:ring-primary/30 md:text-sm";

function Field({
  k,
  value,
  error,
  hint,
  children,
}: {
  k: RecipeFieldKey;
  value: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const len = value.length;
  const max = RECIPE_LIMITS[k].max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={`camp-${k}`} className={LABEL}>
          {RECIPE_LIMITS[k].label} <span className="text-destructive" aria-hidden="true">*</span>
        </label>
        <span className={cn("text-[11px] tabular-nums", len > max ? "font-bold text-destructive" : "text-muted-foreground")} aria-hidden="true">
          {len}/{max}
        </span>
      </div>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`camp-${k}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Campos de texto da receita, com contadores e validação em linha. */
export function RecipeForm({
  values,
  onChange,
  disabled,
  showErrors,
}: {
  values: RecipeFields;
  onChange: (next: RecipeFields) => void;
  disabled?: boolean;
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState<Partial<Record<RecipeFieldKey, boolean>>>({});
  const errors = validateRecipe(values);
  const set = (k: RecipeFieldKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...values, [k]: e.target.value });
  const blur = (k: RecipeFieldKey) => () => setTouched((t) => ({ ...t, [k]: true }));
  const err = (k: RecipeFieldKey) => (showErrors || touched[k] ? errors[k] : undefined);
  const aria = (k: RecipeFieldKey) => ({
    "aria-invalid": !!err(k),
    "aria-describedby": err(k) ? `camp-${k}-error` : undefined,
  });

  return (
    <div className="space-y-5">
      <Field k="dish_name" value={values.dish_name} error={err("dish_name")}>
        <Input
          id="camp-dish_name"
          value={values.dish_name}
          onChange={set("dish_name")}
          onBlur={blur("dish_name")}
          disabled={disabled}
          placeholder="Ex.: Bolo de fubá da vovó"
          autoComplete="off"
          {...aria("dish_name")}
          className={cn(FIELD, "h-12")}
        />
      </Field>
      <Field k="description" value={values.description} error={err("description")} hint="Conte em poucas linhas a história ou a memória afetiva por trás do prato.">
        <Textarea
          id="camp-description"
          value={values.description}
          onChange={set("description")}
          onBlur={blur("description")}
          disabled={disabled}
          rows={3}
          {...aria("description")}
          className={cn(FIELD, "min-h-[96px]")}
        />
      </Field>
      <Field k="ingredients" value={values.ingredients} error={err("ingredients")} hint="Escreva um ingrediente por linha.">
        <Textarea
          id="camp-ingredients"
          value={values.ingredients}
          onChange={set("ingredients")}
          onBlur={blur("ingredients")}
          disabled={disabled}
          rows={5}
          placeholder={"2 xícaras de fubá\n1 xícara de açúcar\n3 ovos"}
          {...aria("ingredients")}
          className={cn(FIELD, "min-h-[130px]")}
        />
      </Field>
      <Field k="preparation" value={values.preparation} error={err("preparation")}>
        <Textarea
          id="camp-preparation"
          value={values.preparation}
          onChange={set("preparation")}
          onBlur={blur("preparation")}
          disabled={disabled}
          rows={7}
          {...aria("preparation")}
          className={cn(FIELD, "min-h-[170px]")}
        />
      </Field>
    </div>
  );
}
