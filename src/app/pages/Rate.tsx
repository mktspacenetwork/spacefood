import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Star, Loader2, Calendar, CheckCircle, Send } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { api } from "../lib/api";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { getBrazilDateString } from "../lib/date-utils";

interface RatingEntry {
  date: string;
  stars: number;
  comment?: string;
}

export function Rate() {
  const { user } = useAuth();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayRated, setTodayRated] = useState(false);
  const [recentRatings, setRecentRatings] = useState<RatingEntry[]>([]);
  const [fetchingRatings, setFetchingRatings] = useState(true);

  const today = new Date();
  const todayLabel = format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Check if user already rated today (by fetching their ratings)
  useEffect(() => {
    if (!user) return;
    setFetchingRatings(true);
    api.authGet("/ratings/mine")
      .then((data) => {
        if (Array.isArray(data)) {
          const todayStr = getBrazilDateString();
          const rated = data.map((r: any) => ({
            date: r.date,
            stars: r.stars,
            comment: r.comment,
          }));
          setRecentRatings(rated.slice(0, 5));
          // Check if user already rated today
          const ratedToday = data.some((r: any) => r.date && r.date.startsWith(todayStr));
          if (ratedToday) {
            setTodayRated(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setFetchingRatings(false));
  }, [user]);

  const handleSubmit = async () => {
    if (stars === 0) {
      toast.error("Selecione uma nota de 1 a 5.");
      return;
    }
    setLoading(true);
    try {
      await api.authPost("/ratings", {
        stars,
        comment,
        unit: user?.lunchLocation || "",
      });
      toast.success("Avaliacao enviada com sucesso!");
      setTodayRated(true);
      setRecentRatings((prev) => [
        { date: new Date().toISOString(), stars, comment },
        ...prev,
      ]);
      setStars(0);
      setComment("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar avaliacao.");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 pb-32 md:pb-12 pt-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Avalie seu Almoco
        </h1>
        <p className="text-muted-foreground text-sm mt-1 flex items-center justify-center gap-2">
          <Calendar size={14} />
          {todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
        </p>
      </div>

      {/* Rating Form */}
      {todayRated ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-12 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Obrigado pela avaliacao!</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Sua opiniao foi enviada e ajuda a equipe a melhorar o cardapio.
          </p>
          <Button
            variant="outline"
            onClick={() => setTodayRated(false)}
            className="mt-4"
          >
            Avaliar novamente
          </Button>
        </motion.div>
      ) : (
        <Card className="shadow-lg border-2 border-primary/10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-3">
              <Star size={28} className="text-orange-500" />
            </div>
            <CardTitle className="text-lg">Como foi o almoco de hoje?</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Toque nas estrelas para dar sua nota
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stars */}
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setStars(s)}
                  className="focus:outline-none transition-transform hover:scale-110 active:scale-90"
                >
                  <Star
                    size={40}
                    className={cn(
                      "transition-colors duration-200",
                      s <= stars ? "fill-orange-400 text-orange-400" : "text-muted stroke-[1.5px]"
                    )}
                  />
                </button>
              ))}
            </div>

            {/* Star label */}
            {stars > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-sm font-medium text-foreground"
              >
                {stars === 1 && "Muito ruim"}
                {stars === 2 && "Ruim"}
                {stars === 3 && "Regular"}
                {stars === 4 && "Bom"}
                {stars === 5 && "Excelente!"}
              </motion.p>
            )}

            {/* Comment */}
            <AnimatePresence>
              {stars > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <textarea
                    placeholder={stars <= 3
                      ? "O que podemos melhorar? Conte pra gente..."
                      : "Quer deixar um comentario? (opcional)"}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full p-4 rounded-xl border border-border bg-accent/30 text-sm focus:ring-2 focus:ring-primary/50 outline-none resize-none h-24"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={loading || stars === 0}
              className="w-full h-14 text-lg font-bold rounded-2xl gap-2"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Send size={18} />
              )}
              Enviar Avaliacao
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Ratings */}
      {recentRatings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            Suas avaliacoes recentes
          </h3>
          {recentRatings.map((r, i) => (
            <div
              key={`rating-${i}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
            >
              <div className="flex items-center gap-0.5 text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded-md border border-yellow-200 dark:border-yellow-800">
                <span className="text-sm font-bold">{r.stars}</span>
                <Star size={12} fill="currentColor" />
              </div>
              <div className="flex-1 min-w-0">
                {r.comment ? (
                  <p className="text-xs text-foreground/80 italic truncate">"{r.comment}"</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Sem comentario</p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {r.date ? format(parseISO(r.date), "dd/MM", { locale: ptBR }) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}