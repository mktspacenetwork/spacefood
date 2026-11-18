import { PhotoPicker, type PhotoDraft } from "./PhotoPicker";

/** Identificador estável de cada foto na tela (a lista pode encolher/crescer sem trocar as miniaturas de lugar). */
let seq = 0;
export const newPhotoUid = () => `ph${Date.now().toString(36)}${(seq++).toString(36)}`;

type Setter = React.Dispatch<React.SetStateAction<PhotoDraft[]>>;
type Update = React.SetStateAction<PhotoDraft | null>;

/**
 * Até `max` fotos da receita (a 1ª grande, as outras em miniaturas quadradas).
 * Cada posição reaproveita o `PhotoPicker` (preparo da imagem, progresso e erros por foto).
 * A foto principal só pode ser trocada (não removida) enquanto houver outras fotos.
 */
export function PhotoSet({
  photos,
  setPhotos,
  max,
  maxMb,
  disabled,
  showError,
}: {
  photos: PhotoDraft[];
  setPhotos: Setter;
  max: number;
  maxMb: number;
  disabled?: boolean;
  /** mostra "adicione a foto" quando não há nenhuma */
  showError?: boolean;
}) {
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
    </div>
  );
}
