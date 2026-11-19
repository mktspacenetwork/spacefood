import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";

/** Compara sem diferença de maiúsculas, acentos compostos ou espaços repetidos (o que a pessoa digitou x o nome salvo). */
const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * "Excluir campanha" = OCULTAR: ela some das listas e do site, mas receitas, votos e histórico ficam guardados e dá para restaurar.
 * Só habilita o botão depois de a pessoa digitar o nome da campanha. Ao confirmar, envia o nome salvo (o servidor confere de novo).
 */
export function DeleteCampaignDialog({
  open, onOpenChange, campaignName, isDraft = false, pending = false, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName: string;
  /** Rascunho: o texto não cita receitas, votos nem o Livro. */
  isDraft?: boolean;
  pending?: boolean;
  onConfirm: (confirm: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const match = norm(text) === norm(campaignName) && norm(campaignName).length > 0;

  const submit = () => {
    if (match && !pending) void onConfirm(campaignName);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir a campanha?</DialogTitle>
          <DialogDescription>
            {isDraft
              ? "A campanha some das listas e do site. Nada é apagado: você a encontra em Histórico de campanhas › Excluídas e pode restaurá-la."
              : "A campanha some das listas e do site. Receitas, votos e histórico ficam guardados e você pode restaurá-la em Histórico de campanhas › Excluídas. As receitas aprovadas continuam no Livro de Receitas, se ele estiver publicado: remova-as por lá se quiser."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-campaign-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Digite o nome da campanha para confirmar
          </Label>
          <p className="break-words rounded-lg bg-muted px-3 py-2 text-sm font-semibold text-foreground">{campaignName}</p>
          <Input
            id="delete-campaign-name"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="Nome da campanha"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled={pending}
            className="h-11 rounded-xl"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending} className="h-11 rounded-xl">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!match || pending} className="h-11 gap-2 rounded-xl">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Excluir campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aviso curto ao tentar excluir uma campanha NO AR (publicada ou agendada): não dá para excluir antes de desativar.
 * Quem pode publicar vê o botão "Desativar" (reaproveita o fluxo existente); quem não pode só lê a explicação.
 */
export function LiveCampaignDeleteNotice({
  open, onOpenChange, canUnpublish, onUnpublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUnpublish: boolean;
  onUnpublish: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir campanha</DialogTitle>
          <DialogDescription>
            Esta campanha está no ar. Para excluir, desative antes.
            {canUnpublish ? " Depois de desativada, toque de novo em Excluir." : " Peça a quem pode publicar para desativá-la."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl">
            Fechar
          </Button>
          {canUnpublish && (
            <Button onClick={onUnpublish} className="h-11 rounded-xl">
              Desativar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
