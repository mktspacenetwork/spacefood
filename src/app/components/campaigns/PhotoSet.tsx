import { useState } from "react";
import { Search } from "lucide-react";
import { PhotoPicker, type PhotoDraft } from "./PhotoPicker";
import { WebImageSearchDialog } from "./WebImageSearchDialog";
import type { WebImageResult, WebImportedMedia } from "../../lib/campaigns/types";

/** Identificador estável de cada foto na tela (a lista pode encolher/crescer sem trocar as miniaturas de lugar). */
let seq = 0;
export const newPhotoUid = () => `ph${Date.now().toString(36)}${(seq++).toString(36)}`;

type Setter = React.Dispatch<React.SetStateAction<PhotoDraft[]>>;
type Update = React.SetStateAction<PhotoDraft | null>;

/**
 * Até `max` fotos da receita (a 1ª grande, as outras em miniaturas quadradas).
 * Cada posição reaproveita o `PhotoPicker` (preparo da imagem, progresso e erros por foto).
 * A foto principal só pode ser trocada (não removida) enquanto houver outras fotos.
 *
 * Com `searchSlug`, aparece um controle discreto "Pesquisar na internet" (texto pequeno, sem competir com o envio do aparelho):
 * abre a busca de imagens livres e a escolhida entra aqui como uma foto a mais (com o selo "Foto da internet"),
 * respeitando o limite de fotos e a regra da principal (a 1ª foto é a principal).
 */
export function PhotoSet({
  photos,
  setPhotos,
  max,
  maxMb,
  disabled,
  showError,
  searchSlug,
}: {
  photos: PhotoDraft[];
  setPhotos: Setter;
  max: number;
  maxMb: number;
  disabled?: boolean;
  /** mostra "adicione a foto" quando não há nenhuma */
  showError?: boolean;
  /** campanha (slug) para a busca de imagens na internet; ausente = sem o controle de busca */
  searchSlug?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const hasMainKind = photos.some((p) => p.kind === "main_photo");

  // Setter de uma posição já preenchida (localizada pelo uid, nunca pelo índice).
  const forPhoto = (uid: string) => (u: Update) =>
    setPhotos((prev) => {
      const idx = prev.findIndex((p) => p.uid === uid);
      if (idx < 0) return prev;
      const cur = prev[idx];
      const next = typeof u === "function" ? u(cur) : u;
      const arr = [...prev];
      if (!next) arr.splice(idx, 1);
      // trocar a foto mantém a posição e o tipo (principal/extra) de quem ela substitui
      else arr[idx] = { ...next, uid: cur.uid, kind: next.kind ?? cur.kind };
      return arr;
    });

  // Setter da posição vazia ("adicionar foto").
  const forNew = (u: Update) =>
    setPhotos((prev) => {
      const next = typeof u === "function" ? u(null) : u;
      return next ? [...prev, { ...next, uid: next.uid ?? newPhotoUid() }] : prev;
    });

  const isMain = (p: PhotoDraft, idx: number) => p.kind === "main_photo" || (!hasMainKind && idx === 0);
  const canAdd = photos.length >= 1 && photos.length < max;
  const extras = photos.slice(1);
  const canSearch = !!searchSlug && !disabled && photos.length < max;

  // Foto escolhida na busca: entra como uma foto a mais (a mídia já está guardada no servidor, só falta salvar a receita).
  const addWeb = (picked: WebImageResult, media: WebImportedMedia) =>
    setPhotos((prev) =>
      prev.length >= max
        ? prev
        : [...prev, {
            uid: newPhotoUid(), previewUrl: picked.thumb_url, mime: media.mime, size: media.size, progress: 0,
            kind: media.kind, web: media.web, webImport: media,
          }],
    );

  return (
    <div className="space-y-3">
      <PhotoPicker
        key={photos[0]?.uid ?? "first-empty"}
        draft={photos[0] ?? null}
        setDraft={photos[0]?.uid ? forPhoto(photos[0].uid) : forNew}
        maxMb={maxMb}
        disabled={disabled}
        showError={showError}
        hideRemove={photos.length > 1 && !!photos[0] && isMain(photos[0], 0)}
      />
      {(extras.length > 0 || canAdd) && (
        <div className="grid grid-cols-2 gap-3">
          {extras.map((p, i) => (
            <PhotoPicker
              key={p.uid}
              compact
              draft={p}
              setDraft={forPhoto(p.uid!)}
              maxMb={maxMb}
              disabled={disabled}
              hideRemove={isMain(p, i + 1)}
            />
          ))}
          {canAdd && (
            <PhotoPicker key="add-tile" compact emptyLabel="Adicionar foto" draft={null} setDraft={forNew} maxMb={maxMb} disabled={disabled} />
          )}
        </div>
      )}
      {photos.length === 1 && max > 1 && (
        <p className="text-xs text-muted-foreground">Se quiser, adicione mais fotos (até {max}).</p>
      )}
      {canSearch && (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Search size={13} aria-hidden="true" /> Pesquisar na internet
        </button>
      )}
      {searchSlug && (
        <WebImageSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          slug={searchSlug}
          kind={photos.length === 0 ? "main_photo" : "photo"}
          onImported={addWeb}
        />
      )}
    </div>
  );
}
