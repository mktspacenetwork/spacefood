import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { errMsg } from "../../../lib/campaigns/api";
import { IMAGE_ACCEPT, checkImage } from "../../../lib/campaigns/media";
import type { BookCandidate } from "../../../lib/campaigns/types";
import { LoadingBox } from "../campaigns/shared";
import { Thumb } from "./BookRows";
import { LIMITS, bookApi, uploadBookPhoto } from "./bookApi";

type Props = { open: boolean; onClose: () => void; onAdded: () => void };

/** "Adicionar receita": escolher uma receita aprovada da plataforma ou cadastrar uma nova (manual, com foto). */
export function AddRecipeDialog({ open, onClose, onAdded }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] gap-4 overflow-y-auto p-4 sm:max-w-xl sm:p-6">
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-lg">Adicionar ao Livro de Receitas</DialogTitle>
          <DialogDescription className="text-left">Escolha uma receita da plataforma ou cadastre uma nova.</DialogDescription>
        </DialogHeader>
        {open && (
          <Tabs defaultValue="platform" className="gap-4">
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="platform" className="h-9">Da plataforma</TabsTrigger>
              <TabsTrigger value="manual" className="h-9">Nova receita</TabsTrigger>
            </TabsList>
            <TabsContent value="platform"><FromPlatform onAdded={onAdded} /></TabsContent>
            <TabsContent value="manual"><ManualForm onCreated={() => { onAdded(); onClose(); }} /></TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── Da plataforma ───────────────────────────────

function FromPlatform({ onAdded }: { onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<BookCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const seq = useRef(0);

  const search = useCallback(async (term: string) => {
    const id = ++seq.current;
    setError(null);
    try {
      const r = await bookApi.candidates(term);
      if (id === seq.current) setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      if (id === seq.current) setError(errMsg(e, "Não foi possível buscar as receitas."));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(q.trim()), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, search]);

  const add = async (c: BookCandidate) => {
    if (adding) return;
    setAdding(c.submission_id);
    try {
      await bookApi.add(c.submission_id);
      toast.success(`“${c.dish_name}” entrou no Livro de Receitas.`);
      setItems((cur) => (cur ?? []).filter((x) => x.submission_id !== c.submission_id));
      onAdded();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, autor ou campanha" aria-label="Buscar receita aprovada" className="h-11 rounded-xl pl-9" />
      </div>
      {error ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : items === null ? (
        <LoadingBox label="Buscando…" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {q ? "Nenhuma receita encontrada." : "Todas as receitas aprovadas já estão no Livro de Receitas."}
        </p>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {items.map((c) => (
            <li key={c.submission_id} className="flex items-center gap-3 rounded-2xl border border-border p-2.5">
              <Thumb url={c.photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{c.dish_name}</p>
                <p className="truncate text-xs text-muted-foreground">por {c.author}</p>
                <p className="truncate text-[11px] text-muted-foreground">Campanha: {c.campaign_name}</p>
              </div>
              <Button size="sm" className="h-10 shrink-0 gap-1.5 rounded-xl" disabled={adding !== null} onClick={() => void add(c)} aria-label={`Adicionar ${c.dish_name}`}>
                {adding === c.submission_id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────── Nova receita ───────────────────────────────

function Label({ htmlFor, children, count, max }: { htmlFor: string; children: React.ReactNode; count?: number; max?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{children}</label>
      {max !== undefined && count !== undefined && count > max * 0.8 && (
        <span className={`text-[11px] tabular-nums ${count > max ? "text-destructive" : "text-muted-foreground"}`}>{count}/{max}</span>
      )}
    </div>
  );
}

function ManualForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [story, setStory] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [preparation, setPreparation] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const errors: Record<string, string> = {};
  if (name.trim().length < 3) errors.name = "Informe o nome (mínimo 3 caracteres).";
  if (!ingredients.trim()) errors.ingredients = "Informe os ingredientes.";
  if (!preparation.trim()) errors.preparation = "Informe o modo de preparo.";
  if (story.length > LIMITS.story || ingredients.length > LIMITS.text || preparation.length > LIMITS.text) errors.limit = "Algum texto passou do limite.";
  const invalid = Object.keys(errors).length > 0;

  const pick = (file: File | undefined) => {
    if (!file) return;
    const bad = checkImage(file);
    if (bad) { toast.error(bad); return; }
    setPhoto(file);
  };

  const submit = async () => {
    setTriedSubmit(true);
    if (invalid || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const { ref } = await bookApi.addManual({
        dish_name: name.trim(),
        author_label: author.trim() || undefined,
        story: story.trim() || undefined,
        ingredients,
        preparation,
      });
      if (photo) {
        try {
          await uploadBookPhoto(ref, photo);
        } catch (e) {
          toast.error(`Receita criada, mas a foto não foi enviada: ${errMsg(e)} Abra a receita para tentar de novo.`);
          onCreated();
          return;
        }
      }
      toast.success("Receita adicionada ao Livro de Receitas.");
      onCreated();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nr-name">Nome da receita</Label>
        <Input id="nr-name" value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" aria-invalid={triedSubmit && !!errors.name} />
        {triedSubmit && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-author">Autor (opcional)</Label>
        <Input id="nr-author" value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} placeholder="Vazio: Cadastrada pela administração" className="h-11 rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-story" count={story.length} max={LIMITS.story}>História e memória afetiva (opcional)</Label>
        <Textarea id="nr-story" value={story} onChange={(e) => setStory(e.target.value)} className="max-h-40 min-h-20 overflow-y-auto rounded-xl" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-ing" count={ingredients.length} max={LIMITS.text}>Ingredientes</Label>
        <Textarea id="nr-ing" value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Um ingrediente por linha" className="max-h-56 min-h-28 overflow-y-auto rounded-xl" aria-invalid={triedSubmit && !!errors.ingredients} />
        {triedSubmit && errors.ingredients && <p className="text-xs text-destructive">{errors.ingredients}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-prep" count={preparation.length} max={LIMITS.text}>Modo de preparo</Label>
        <Textarea id="nr-prep" value={preparation} onChange={(e) => setPreparation(e.target.value)} placeholder="Um passo por linha" className="max-h-56 min-h-28 overflow-y-auto rounded-xl" aria-invalid={triedSubmit && !!errors.preparation} />
        {triedSubmit && errors.preparation && <p className="text-xs text-destructive">{errors.preparation}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nr-photo">Foto (opcional)</Label>
        <div className="flex items-center gap-3">
          {preview ? (
            <img src={preview} alt="Prévia da foto" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><ImagePlus size={20} aria-hidden="true" /></span>
          )}
          <input ref={fileRef} id="nr-photo" type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ""; }} />
          <Button type="button" variant="outline" size="sm" className="h-10 gap-2 rounded-xl" onClick={() => fileRef.current?.click()} disabled={saving}>
            <ImagePlus size={14} /> {photo ? "Trocar foto" : "Escolher foto"}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" size="sm" className="h-10 gap-1 rounded-xl" onClick={() => setPhoto(null)} disabled={saving} aria-label="Tirar a foto escolhida">
              <X size={14} /> Tirar
            </Button>
          )}
        </div>
      </div>
      {triedSubmit && errors.limit && <p className="text-xs text-destructive">{errors.limit}</p>}
      <Button className="h-11 w-full gap-2 rounded-xl" onClick={() => void submit()} disabled={saving}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Adicionar ao Livro de Receitas
      </Button>
    </div>
  );
}
