import { Loader2, Vote } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/Button";

/**
 * Confirmação do voto. Permanece aberta enquanto o envio está em andamento
 * (o pai fecha ao terminar) para impedir clique duplo.
 */
export function VoteConfirmDialog({
  open,
  onOpenChange,
  dishName,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dishName: string;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Votar em “{dishName}”?</AlertDialogTitle>
          <AlertDialogDescription>Seu voto é definitivo e não poderá ser alterado depois.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={loading} className="h-11 rounded-xl">
            Voltar
          </AlertDialogCancel>
          <Button onClick={onConfirm} disabled={loading} className="h-11 gap-2 rounded-xl">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Vote size={16} />}
            {loading ? "Registrando…" : "Confirmar voto"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
