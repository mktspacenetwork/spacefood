import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { cn } from "../../../../../lib/utils";
import type { AdminAnalytics } from "../../../../../lib/campaigns/types";
import { CHART, CHART_HEIGHT, EmptyLine, Panel, TOOLTIP_STYLE } from "./parts";

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ddmmyyyy = (d: string) => `${ddmm(d)}/${d.slice(0, 4)}`;

type Range = "7" | "30" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

/** Evolução por dia (dias de Brasília): envios, aprovações e (com votação) votos. O filtro 7/30/Tudo é feito aqui, sem nova chamada. */
export function EvolutionChart({ data }: { data: AdminAnalytics }) {
  const [range, setRange] = useState<Range>("30");
  const all = data.series.days;
  const days = useMemo(() => (range === "all" ? all : all.slice(-Number(range))), [all, range]);
  const withVotes = data.has_voting;
  const sum = (k: "submitted" | "approved" | "votes") => days.reduce((s, x) => s + x[k], 0);
  const empty = days.length === 0 || days.every((x) => x.submitted + x.approved + x.rejected + x.votes === 0);
  const summary = `Evolução diária: ${sum("submitted")} envios, ${sum("approved")} aprovações${withVotes ? ` e ${sum("votes")} votos` : ""} nos últimos ${days.length} dias.`;

  return (
    <Panel
      title="Evolução por dia"
      hint="Envios, aprovações e votos em cada dia."
      action={
        <div role="radiogroup" aria-label="Período do gráfico" className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "min-h-9 rounded-[10px] px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                range === r.value ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {empty ? (
        <EmptyLine>Ainda não há movimento neste período.</EmptyLine>
      ) : (
        <div role="img" aria-label={summary} style={{ height: CHART_HEIGHT }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days} margin={{ top: 14, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="d" tickFormatter={ddmm} stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => ddmmyyyy(String(d))} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Line type="monotone" dataKey="submitted" name="Envios" stroke={CHART.primary} strokeWidth={2} dot={days.length <= 14} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="approved" name="Aprovações" stroke={CHART.green} strokeWidth={2} dot={days.length <= 14} activeDot={{ r: 4 }} />
              {withVotes && <Line type="monotone" dataKey="votes" name="Votos" stroke={CHART.amber} strokeWidth={2} dot={days.length <= 14} activeDot={{ r: 4 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

/** Participação por unidade: elegíveis, quem enviou e (com votação) quem votou, por unidade. */
export function UnitChart({ units, withVotes }: { units: NonNullable<AdminAnalytics["by_unit"]>; withVotes: boolean }) {
  const rows = useMemo(
    () => units.map((u) => ({ ...u, unit: u.unit?.trim() || "Sem unidade" })).sort((a, b) => b.eligible - a.eligible),
    [units],
  );
  const height = Math.max(CHART_HEIGHT, rows.length * (withVotes ? 64 : 48) + 56);
  const summary = `Participação por unidade: ${rows.map((r) => `${r.unit}, ${r.sent} de ${r.eligible} enviaram`).join("; ")}.`;
  return (
    <Panel title="Participação por unidade" hint="Elegíveis, quem enviou receita e quem votou em cada unidade.">
      <div role="img" aria-label={summary} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
            <XAxis type="number" allowDecimals={false} stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="unit" stroke={CHART.muted} fontSize={11} tickLine={false} axisLine={false} width={84} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--accent)", opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar dataKey="eligible" name="Elegíveis" fill={CHART.muted} fillOpacity={0.35} radius={[0, 4, 4, 0]} />
            <Bar dataKey="sent" name="Enviaram" fill={CHART.primary} radius={[0, 4, 4, 0]} />
            {withVotes && <Bar dataKey="voted" name="Votaram" fill={CHART.amber} radius={[0, 4, 4, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
