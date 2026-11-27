import { Loader2, Trash2 } from "lucide-react";
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
 * Confirmação para o colaborador EXCLUIR a própria receita reprovada (a vaga volta e ele pode enviar outra).
 * Permanece aberta enquanto a exclusão está em andamento (o pai fecha ao terminar) para impedir clique duplo.
 */
export function DeleteRecipeDialog({
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
          <AlertDialogTitle>Excluir a receita “{dishName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            A receita sai da sua lista e você poderá enviar uma nova no lugar dela. Se preferir manter o texto, use “Corrigir e reenviar”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={loading} className="h-11 rounded-xl">
            Voltar
          </AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={loading} className="h-11 gap-2 rounded-xl">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {loading ? "Excluindo…" : "Excluir receita"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
