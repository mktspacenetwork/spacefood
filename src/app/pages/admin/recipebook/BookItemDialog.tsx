import { useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { errMsg } from "../../../lib/campaigns/api";
import { ingredientItems, preparationSteps, storyParagraphs } from "../../../lib/campaigns/bookText";
import { IMAGE_ACCEPT, checkImage } from "../../../lib/campaigns/media";
import type { AdminBookItem, AdminBookItemDetail } from "../../../lib/campaigns/types";
import { ErrorBox, LoadingBox, useLoader } from "../campaigns/shared";
import { BookBadges } from "./BookRows";
import { LIMITS, bookApi, uploadBookPhoto } from "./bookApi";

type Props = {
  /** `ref` da receita aberta (null = fechado). */
  itemRef: string | null;
  canManage: boolean;
  onClose: () => void;
  /** Recarrega a lista da página depois de uma alteração. */
  onChanged: () => void;
  onRemove: (it: AdminBookItem) => void;
  onRestore: (it: AdminBookItem) => void;
};

/** Detalhe da receita do livro: leitura completa, edição (autoria da campanha preservada) e foto das manuais. */
export function BookItemDialog({ itemRef, canManage, onClose, onChanged, onRemove, onRestore }: Props) {
  return (
    <Dialog open={itemRef !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] gap-4 overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        {itemRef && <Inner key={itemRef} itemRef={itemRef} canManage={canManage} onClose={onClose} onChanged={onChanged} onRemove={onRemove} onRestore={onRestore} />}
      </DialogContent>
    </Dialog>
  );
}

function Inner({ itemRef, canManage, onChanged, onRemove, onRestore }: Omit<Props, "itemRef"> & { itemRef: string }) {
  const { data, loading, error, reload } = useLoader(() => bookApi.item(itemRef), [itemRef]);
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <><DialogHeader><DialogTitle className="sr-only">Receita do Livro de Receitas</DialogTitle></DialogHeader><LoadingBox /></>;
  if (error && !data) return <><DialogHeader><DialogTitle className="sr-only">Receita do Livro de Receitas</DialogTitle></DialogHeader><ErrorBox message={error} onRetry={reload} /></>;
  if (!data) return null;

  const refresh = async () => { await reload(); onChanged(); };

  if (editing && canManage) {
    return <EditForm item={data} onCancel={() => setEditing(false)} onSaved={async () => { setEditing(false); await refresh(); }} onPhotoChanged={refresh} />;
  }
  return (
    <ViewBody
      item={data}
      canManage={canManage}
      onEdit={() => setEditing(true)}
      onRemove={() => onRemove(data)}
      onRestore={() => onRestore(data)}
    />
  );
}

// ───────────────────────────────── Leitura ─────────────────────────────────

function ViewBody({ item, canManage, onEdit, onRemove, onRestore }: { item: AdminBookItemDetail; canManage: boolean; onEdit: () => void; onRemove: () => void; onRestore: () => void }) {
  const story = storyParagraphs(item.story);
  const ingredients = ingredientItems(item.ingredients);
  const { steps, numbered } = preparationSteps(item.preparation);
  return (
    <>
      <DialogHeader className="pr-6 text-left">
        <DialogTitle className="text-lg leading-snug [overflow-wrap:anywhere]">{item.dish_name}</DialogTitle>
        <DialogDescription className="text-left">{item.source === "manual" ? item.author : `por ${item.author}`}</DialogDescription>
        <BookBadges it={item} />
      </DialogHeader>

      {item.photos.length > 0 && (
        <div className={item.photos.length > 1 ? "grid grid-cols-3 gap-2" : ""}>
          {item.photos.map((p) => (
            <img key={p.url} src={p.url} alt={`Foto de ${item.dish_name}`} loading="lazy" className={item.photos.length > 1 ? "aspect-square w-full rounded-xl object-cover" : "aspect-[4/3] w-full rounded-2xl object-cover"} />
          ))}
        </div>
      )}

      {story.length > 0 && (
        <section className="border-l-4 border-primary/70 pl-3">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">História e memória afetiva</h3>
          <div className="space-y-2 text-sm italic leading-relaxed text-foreground/90">
            {story.map((p, i) => <p key={i} className="whitespace-pre-line [overflow-wrap:anywhere]">{p}</p>)}
          </div>
        </section>
      )}

      {ingredients.length > 0 && (
        <section>
          <h3 className="mb-2 border-b border-border pb-1.5 text-sm font-bold text-foreground">Ingredientes</h3>
          <ul className="space-y-1.5 text-sm">
            {ingredients.map((it, i) => (
              <li key={i} className="flex gap-2.5"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{it}</span></li>
            ))}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <h3 className="mb-2 border-b border-border pb-1.5 text-sm font-bold text-foreground">Modo de preparo</h3>
          {numbered ? (
            <ol className="space-y-3 text-sm">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                  <p className="min-w-0 flex-1 whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]">{s}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]">{steps[0]}</p>
          )}
        </section>
      )}

      {item.source === "campaign" && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Receita enviada na campanha{item.campaign_name ? ` “${item.campaign_name}”` : ""}. Tirar do Livro de Receitas não altera a receita lá.
        </p>
      )}

      {canManage && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {item.status === "in_book" ? (
            <Button variant="outline" className="h-11 gap-2 rounded-xl text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 size={16} /> Remover do Livro de Receitas
            </Button>
          ) : (
            <Button variant="outline" className="h-11 gap-2 rounded-xl" onClick={onRestore}>
              <Undo2 size={16} /> Readicionar ao Livro de Receitas
            </Button>
          )}
          <Button className="h-11 gap-2 rounded-xl" onClick={onEdit}>
            <Pencil size={16} /> Editar
          </Button>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────── Edição ─────────────────────────────────

function FieldLabel({ children, htmlFor, count, max }: { children: React.ReactNode; htmlFor: string; count?: number; max?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</label>
      {max !== undefined && count !== undefined && count > max * 0.8 && (
        <span className={`text-[11px] tabular-nums ${count > max ? "text-destructive" : "text-muted-foreground"}`}>{count}/{max}</span>
      )}
    </div>
  );
}

function EditForm({ item, onCancel, onSaved, onPhotoChanged }: { item: AdminBookItemDetail; onCancel: () => void; onSaved: () => Promise<void>; onPhotoChanged: () => Promise<void> }) {
  const isManual = item.source === "manual";
  const [name, setName] = useState(item.dish_name);
  const [author, setAuthor] = useState(isManual && item.author !== "Cadastrada pela administração" ? item.author : "");
  const [story, setStory] = useState(item.story);
  const [ingredients, setIngredients] = useState(item.ingredients);
  const [preparation, setPreparation] = useState(item.preparation);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"upload" | "remove" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  const problems: string[] = [];
  if (name.trim().length < 3 || name.length > LIMITS.name) problems.push("Nome (3 a 120 caracteres)");
  if (!ingredients.trim()) problems.push("Ingredientes");
  if (!preparation.trim()) problems.push("Modo de preparo");
  if (story.length > LIMITS.story || ingredients.length > LIMITS.text || preparation.length > LIMITS.text) problems.push("Texto acima do limite");

  const save = async () => {
    if (lock.current || problems.length) return;
    lock.current = true;
    setSaving(true);
    try {
      await bookApi.update(item.ref, {
        dish_name: name.trim(),
        story,
        ingredients,
        preparation,
        ...(isManual ? { author_label: author.trim() } : {}),
      });
      toast.success("Receita atualizada no Livro de Receitas.");
      await onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const changePhoto = async (file: File | undefined) => {
    if (!file || photoBusy) return;
    const bad = checkImage(file);
    if (bad) { toast.error(bad); return; }
    setPhotoBusy("upload");
    try {
      await uploadBookPhoto(item.ref, file);
      toast.success("Foto atualizada.");
      await onPhotoChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPhotoBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy("remove");
    try {
      await bookApi.removePhoto(item.ref);
      toast.success("Foto removida.");
      await onPhotoChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPhotoBusy(null);
    }
  };

  const original = item.original;
  return (
    <>
      <DialogHeader className="pr-6 text-left">
        <DialogTitle className="text-lg">Editar receita do Livro de Receitas</DialogTitle>
        <DialogDescription className="text-left">
          {isManual ? "Cadastro da administração." : "A edição vale só para o Livro de Receitas: a receita na campanha não muda."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="rb-name">Nome da receita</FieldLabel>
          <Input id="rb-name" value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
        </div>

        {isManual ? (
          <div className="space-y-1.5">
            <FieldLabel htmlFor="rb-author">Autor (opcional)</FieldLabel>
            <Input id="rb-author" value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} placeholder="Vazio: Cadastrada pela administração" className="h-11 rounded-xl" />
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>Autoria preservada: <b className="text-foreground">{item.author}</b></span>
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel htmlFor="rb-story" count={story.length} max={LIMITS.story}>História e memória afetiva (opcional)</FieldLabel>
          <Textarea id="rb-story" value={story} onChange={(e) => setStory(e.target.value)} className="max-h-48 min-h-24 overflow-y-auto rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="rb-ing" count={ingredients.length} max={LIMITS.text}>Ingredientes</FieldLabel>
          <Textarea id="rb-ing" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Um ingrediente por linha" className="max-h-64 min-h-32 overflow-y-auto rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="rb-prep" count={preparation.length} max={LIMITS.text}>Modo de preparo</FieldLabel>
          <Textarea id="rb-prep" value={preparation} onChange={(e) => setPreparation(e.target.value)} placeholder="Um passo por linha" className="max-h-64 min-h-32 overflow-y-auto rounded-xl" />
        </div>

        {original && (
          <button
            type="button"
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            onClick={() => { setName(original.dish_name); setStory(original.story); setIngredients(original.ingredients); setPreparation(original.preparation); }}
          >
            Voltar ao texto original da campanha
          </button>
        )}

        {isManual && (
          <div className="space-y-2">
            <FieldLabel htmlFor="rb-photo">Foto</FieldLabel>
            <div className="flex items-center gap-3">
              {item.photos[0] ? (
                <img src={item.photos[0].url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ImagePlus size={20} aria-hidden="true" /></span>
              )}
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} id="rb-photo" type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => void changePhoto(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" className="h-10 gap-2 rounded-xl" disabled={photoBusy !== null} onClick={() => fileRef.current?.click()}>
                  {photoBusy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {item.photos[0] ? "Trocar foto" : "Adicionar foto"}
                </Button>
                {item.photos[0] && (
                  <Button type="button" variant="ghost" size="sm" className="h-10 rounded-xl text-destructive hover:text-destructive" disabled={photoBusy !== null} onClick={() => void removePhoto()}>
                    {photoBusy === "remove" ? <Loader2 size={14} className="animate-spin" /> : null} Remover foto
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {problems.length > 0 && <p className="text-xs text-destructive">Revise: {problems.join(", ")}.</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="h-11 rounded-xl" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button className="h-11 gap-2 rounded-xl" onClick={() => void save()} disabled={saving || problems.length > 0}>
          {saving && <Loader2 size={16} className="animate-spin" />} Salvar
        </Button>
      </div>
    </>
  );
}
