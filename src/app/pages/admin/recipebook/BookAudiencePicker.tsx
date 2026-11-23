import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { Checkbox } from "../../../components/ui/checkbox";
import { CampaignApiError, errMsg } from "../../../lib/campaigns/api";
import { cn } from "../../../lib/utils";
import type { BookAudience } from "../../../lib/campaigns/types";
import { LoadingBox, Notice } from "../campaigns/shared";
import { bookApi, norm } from "./bookApi";
import type { BookUser } from "./bookApi";

const MODES: { mode: BookAudience["mode"]; title: string; hint: string }[] = [
  { mode: "all", title: "Todos os colaboradores", hint: "Qualquer colaborador com cadastro concluído." },
  { mode: "users", title: "Pessoas específicas", hint: "Você escolhe uma a uma." },
];

/** Mostra no máximo isto de pessoas NÃO selecionadas por vez (as selecionadas aparecem sempre); a busca encontra o resto. */
const MAX_LISTED = 80;

/**
 * Seletor do público do Livro de Receitas: só dois modos (todos | pessoas específicas). A lista de pessoas é a mesma do
 * cadastro de campanhas (`GET /admin/users`) e só carrega quando "Pessoas específicas" está escolhido.
 */
export function BookAudiencePicker({
  value,
  onChange,
  disabled,
}: {
  value: BookAudience;
  onChange: (next: BookAudience) => void;
  disabled?: boolean;
}) {
  const [users, setUsers] = useState<BookUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Carrega a lista UMA vez, na primeira vez que "Pessoas específicas" é escolhido (sem refazer a cada mudança de estado).
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (value.mode !== "users" || started.current) return;
    started.current = true;
    setLoading(true);
    setError(null);
    bookApi
      .users()
      .then((u) => { if (mounted.current) setUsers(u); })
      .catch((e) => {
        if (!mounted.current) return;
        setError(
          e instanceof CampaignApiError && e.status === 403
            ? "Para escolher pessoas você precisa da permissão \"Editar campanhas\"."
            : errMsg(e),
        );
      })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [value.mode]);

  const selected = useMemo(() => new Set(value.user_ids), [value.user_ids]);
  const listed = useMemo(() => {
    const q = norm(query);
    const all = (users ?? []).filter((u) => !q || norm(u.name).includes(q) || norm(u.department ?? "").includes(q));
    const byName = (a: BookUser, b: BookUser) => a.name.localeCompare(b.name, "pt-BR");
    const on = all.filter((u) => selected.has(u.id)).sort(byName);
    const off = all.filter((u) => !selected.has(u.id)).sort(byName);
    return { rows: [...on, ...off.slice(0, MAX_LISTED)], hidden: Math.max(0, off.length - MAX_LISTED) };
  }, [users, query, selected]);

  const toggle = (id: string, on: boolean) =>
    onChange({ mode: "users", user_ids: on ? [...value.user_ids, id] : value.user_ids.filter((x) => x !== id) });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quem vê o Livro de Receitas">
        {MODES.map((m) => {
          const on = value.mode === m.mode;
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => !on && onChange(m.mode === "all" ? { mode: "all", user_ids: [] } : { mode: "users", user_ids: value.user_ids })}
              className={cn(
                "min-h-11 rounded-2xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                on ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
              )}
            >
              <span className="block text-sm font-semibold text-foreground">{m.title}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{m.hint}</span>
            </button>
          );
        })}
      </div>

      {value.mode === "users" && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
            {value.user_ids.length} {value.user_ids.length === 1 ? "pessoa selecionada" : "pessoas selecionadas"}
          </p>
          {loading ? (
            <LoadingBox label="Carregando pessoas..." />
          ) : error ? (
            <Notice tone="warn">{error}</Notice>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar pelo nome ou departamento"
                  aria-label="Buscar pessoa"
                  disabled={disabled}
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-2xl border">
                {listed.rows.map((u) => (
                  <li key={u.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                      <Checkbox checked={selected.has(u.id)} disabled={disabled} onCheckedChange={(v) => toggle(u.id, v === true)} aria-label={u.name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{[u.department, u.unit].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                    </label>
                  </li>
                ))}
                {listed.rows.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada.</li>}
              </ul>
              {listed.hidden > 0 && (
                <p className="text-[11px] text-muted-foreground">Mostrando as primeiras. Use a busca para achar as outras {listed.hidden}.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
