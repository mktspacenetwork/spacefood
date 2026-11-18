import { useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { campaignsApi } from "../../../lib/campaigns/api";
import { useBusy } from "./shared";

/** Duplica a configuração da campanha (nunca receitas, votos, mídias, ranking nem histórico). */
export function DuplicateDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  hasVoting,
  onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  /** false = campanha sem votação: o texto não fala de votos nem de ranking. Desconhecido (undefined) mantém o texto completo. */
  hasVoting?: boolean;
  onDuplicated: (newId: string) => void;
}) {
  const [name, setName] = useState("");
  const { busy, run } = useBusy();

  useEffect(() => {
    if (open) setName(`${campaignName} (cópia)`);
  }, [open, campaignName]);

  const valid = name.trim().length >= 3 && name.trim().length <= 120;

  const submit = async () => {
    if (!valid) return;
    const r = await run("dup", () => campaignsApi.post<{ id: string }>(`/admin/campaigns/${campaignId}/duplicate`, { name: name.trim() }), "Campanha duplicada como rascunho.");
    if (r.ok) {
      onOpenChange(false);
      onDuplicated(r.value.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy size={18} className="text-primary" /> Duplicar campanha</DialogTitle>
          <DialogDescription>
            Cria um novo rascunho com a mesma configuração (público, regras e opções, sem datas).{" "}
            {hasVoting === false
              ? "Receitas, fotos e histórico não são copiados."
              : "Receitas, fotos, votos, ranking, resultados e histórico não são copiados."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome da nova campanha</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="rounded-xl h-11"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            disabled={!!busy}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={!!busy}>Cancelar</Button>
          <Button className="rounded-xl gap-2" onClick={submit} disabled={!valid || !!busy}>
            {busy && <Loader2 size={14} className="animate-spin" />} Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
