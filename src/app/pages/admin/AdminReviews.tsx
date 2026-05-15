import { useState, useEffect, useMemo } from "react";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, Star, Calendar, MapPin, TrendingUp, TrendingDown, Award, Users } from "lucide-react";
import { api } from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface ReviewItem {
  id: string;
  orderId?: string;
  userId: string;
  userName: string;
  userUnit?: string;
  date: string;
  stars: number;
  comment?: string;
}

interface CompanyUnit {
  name: string;
  allowOrders: boolean;
}

type PeriodFilter = "all" | "today" | "week" | "month";

export function AdminReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [filterUnit, setFilterUnit] = useState<string>("Todas");
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>("all");
  const [units, setUnits] = useState<CompanyUnit[]>([]);
  const [showRankings, setShowRankings] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [data, settingsData] = await Promise.all([
        api.authGet("/admin/ratings?days=30"),
        api.get("/admin/settings"),
      ]);
      if (Array.isArray(data)) {
        setReviews(data.sort((a: ReviewItem, b: ReviewItem) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
      // Parse units
      const rawUnits = settingsData?.units;
      if (Array.isArray(rawUnits) && rawUnits.length > 0) {
        if (typeof rawUnits[0] === "string") {
          setUnits((rawUnits as string[]).map((u) => ({ name: u, allowOrders: true })));
        } else {
          setUnits(rawUnits as CompanyUnit[]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch reviews", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredReviews = useMemo(() => {
    const now = new Date();
    return reviews.filter((r) => {
      // Rating filter
      if (filterRating && r.stars !== filterRating) return false;

      // Unit filter
      if (filterUnit !== "Todas" && (r.userUnit || "Sem unidade") !== filterUnit) return false;

      // Period filter
      if (filterPeriod !== "all") {
        const rDate = parseISO(r.date);
        if (filterPeriod === "today") {
          const todayStr = format(now, "yyyy-MM-dd");
          if (!r.date.startsWith(todayStr)) return false;
        } else if (filterPeriod === "week") {
          const weekStart = startOfWeek(now, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
          if (!isWithinInterval(rDate, { start: weekStart, end: weekEnd })) return false;
        } else if (filterPeriod === "month") {
          const monthStart = startOfMonth(now);
          const monthEnd = endOfMonth(now);
          if (!isWithinInterval(rDate, { start: monthStart, end: monthEnd })) return false;
        }
      }

      return true;
    });
  }, [reviews, filterRating, filterUnit, filterPeriod]);

  const averageRating = filteredReviews.length > 0
    ? (filteredReviews.reduce((acc, r) => acc + r.stars, 0) / filteredReviews.length).toFixed(1)
    : "0.0";

  // Rankings: group by user
  const rankings = useMemo(() => {
    const userMap = new Map<string, { userName: string; userUnit: string; total: number; count: number }>();
    const source = filterUnit !== "Todas" || filterPeriod !== "all" ? filteredReviews : reviews;
    for (const r of source) {
      const key = r.userId;
      const existing = userMap.get(key);
      if (existing) {
        existing.total += r.stars;
        existing.count += 1;
      } else {
        userMap.set(key, {
          userName: r.userName,
          userUnit: r.userUnit || "Sem unidade",
          total: r.stars,
          count: 1,
        });
      }
    }
    const arr = Array.from(userMap.values()).map((u) => ({
      ...u,
      avg: u.total / u.count,
    }));
    // Best raters: highest average (min 2 reviews)
    const best = [...arr].filter((a) => a.count >= 2).sort((a, b) => b.avg - a.avg).slice(0, 5);
    // Worst raters: lowest average (min 2 reviews)
    const worst = [...arr].filter((a) => a.count >= 2).sort((a, b) => a.avg - b.avg).slice(0, 5);
    // Most active
    const active = [...arr].sort((a, b) => b.count - a.count).slice(0, 5);
    return { best, worst, active };
  }, [reviews, filteredReviews, filterUnit, filterPeriod]);

  const availableUnits = useMemo(() => {
    const settingsNames = units.map((u) => u.name);
    const reviewNames = reviews.map((r) => r.userUnit).filter(Boolean) as string[];
    const allNames = new Set([...settingsNames, ...reviewNames]);
    if (reviews.some((r) => !r.userUnit)) {
      allNames.add("Sem unidade");
    }
    return ["Todas", ...Array.from(allNames).sort()];
  }, [reviews, units]);

  const periodLabels: Record<PeriodFilter, string> = {
    all: "Todos",
    today: "Hoje",
    week: "Semana",
    month: "Mes",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avaliacoes e Feedback</h1>
          <p className="text-muted-foreground">Monitore a satisfacao dos usuarios.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRankings(!showRankings)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
              showRankings ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-accent"
            )}
          >
            <Award size={16} />
            Rankings
          </button>
          <div className="flex items-center gap-2 bg-card p-2 rounded-lg border shadow-sm">
            <span className="text-sm font-medium text-muted-foreground px-2">Media:</span>
            <div className="flex items-center gap-1 text-yellow-500 font-bold text-lg">
              {averageRating} <Star fill="currentColor" size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="space-y-3">
        {/* Star filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 px-1 py-1">
          <button
            onClick={() => setFilterRating(null)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap",
              filterRating === null ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-accent"
            )}
          >
            Todos
          </button>
          {[5, 4, 3, 2, 1].map((stars) => (
            <button
              key={stars}
              onClick={() => setFilterRating(stars)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1 whitespace-nowrap",
                filterRating === stars
                  ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              {stars} <Star size={10} fill="currentColor" />
            </button>
          ))}
        </div>

        {/* Unit + Period Filters */}
        <div className="flex flex-wrap gap-2">
          {/* Unit filter */}
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-muted-foreground" />
            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium focus:ring-1 focus:ring-primary outline-none"
            >
              {availableUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-muted-foreground" />
            <div className="flex gap-1">
              {(Object.keys(periodLabels) as PeriodFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPeriod(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                    filterPeriod === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-accent"
                  )}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-muted-foreground self-center ml-2">
            {filteredReviews.length} avaliacoes
          </span>
        </div>
      </div>

      {/* Rankings Panel */}
      <AnimatePresence>
        {showRankings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 md:grid-cols-3">
              {/* Best Raters */}
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={16} className="text-green-500" />
                    Melhores Avaliadores
                  </CardTitle>
                  <CardDescription className="text-xs">Media mais alta (min. 2 avaliacoes)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rankings.best.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes</p>
                    )}
                    {rankings.best.map((u, i) => (
                      <div key={`best-${i}`} className="flex items-center gap-2 text-sm">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          i === 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-accent text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{u.userName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.userUnit}</p>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-500">
                          <span className="text-xs font-bold">{u.avg.toFixed(1)}</span>
                          <Star size={10} fill="currentColor" />
                        </div>
                        <span className="text-[10px] text-muted-foreground">({u.count}x)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Worst Raters */}
              <Card className="border-l-4 border-l-red-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown size={16} className="text-red-500" />
                    Avaliacoes Mais Baixas
                  </CardTitle>
                  <CardDescription className="text-xs">Media mais baixa (min. 2 avaliacoes)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rankings.worst.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Dados insuficientes</p>
                    )}
                    {rankings.worst.map((u, i) => (
                      <div key={`worst-${i}`} className="flex items-center gap-2 text-sm">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          i === 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-accent text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{u.userName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.userUnit}</p>
                        </div>
                        <div className="flex items-center gap-1 text-yellow-500">
                          <span className="text-xs font-bold">{u.avg.toFixed(1)}</span>
                          <Star size={10} fill="currentColor" />
                        </div>
                        <span className="text-[10px] text-muted-foreground">({u.count}x)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Most Active */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users size={16} className="text-blue-500" />
                    Mais Ativos
                  </CardTitle>
                  <CardDescription className="text-xs">Quem mais avaliou</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rankings.active.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem avaliacoes</p>
                    )}
                    {rankings.active.map((u, i) => (
                      <div key={`active-${i}`} className="flex items-center gap-2 text-sm">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          i === 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-accent text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{u.userName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.userUnit}</p>
                        </div>
                        <span className="text-xs font-bold text-foreground">{u.count}x</span>
                        <div className="flex items-center gap-0.5 text-yellow-500">
                          <span className="text-[10px]">{u.avg.toFixed(1)}</span>
                          <Star size={8} fill="currentColor" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse h-40" />
          ))
        ) : filteredReviews.length > 0 ? (
          filteredReviews.map((review) => (
            <Card key={review.id} className="overflow-hidden border-l-4" style={{ borderLeftColor: review.stars >= 4 ? '#22c55e' : review.stars >= 3 ? '#eab308' : '#ef4444' }}>
              <CardHeader className="pb-2 bg-accent/20">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {(review.userName || "U").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm leading-none">{review.userName}</span>
                      {review.userUnit && (
                        <span className="text-[10px] text-primary/80 flex items-center gap-0.5 mt-0.5 font-medium">
                          <MapPin size={8} />
                          {review.userUnit}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar size={10} />
                        {format(parseISO(review.date), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-md border border-yellow-200 dark:border-yellow-800">
                    <span className="text-sm font-bold">{review.stars}</span>
                    <Star size={12} fill="currentColor" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {review.comment ? (
                  <div className="relative bg-muted/30 p-3 rounded-lg text-sm text-foreground/80 italic">
                    <MessageSquare size={16} className="absolute -top-2 -left-2 text-muted-foreground/20 fill-current transform rotate-180" />
                    "{review.comment}"
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Sem comentario escrito.</span>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-accent/10 rounded-xl border border-dashed">
            <MessageSquare className="mx-auto h-12 w-12 opacity-20 mb-3" />
            <p>Nenhuma avaliacao encontrada com esses filtros.</p>
          </div>
        )}
      </div>
    </div>
  );
}