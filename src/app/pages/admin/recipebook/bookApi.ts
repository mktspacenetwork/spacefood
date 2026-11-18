import { campaignsApi, uploadToSignedUrl } from "../../../lib/campaigns/api";
import { normText } from "../../../lib/campaigns/bookText";
import { prepareImage } from "../../../lib/campaigns/media";
import type { AdminBookItemDetail, AdminRecipeBook, BookCandidate, RecipeBookSettings } from "../../../lib/campaigns/types";

/** Limites que o servidor também aplica (nome 3–120; história ≤ 5000; ingredientes e preparo ≤ 20000). */
export const LIMITS = { name: 120, story: 5000, text: 20000 } as const;

export type ManualFields = { dish_name: string; author_label?: string; story?: string; ingredients: string; preparation: string };
export type EditFields = { dish_name?: string; story?: string; ingredients?: string; preparation?: string; author_label?: string };

/** Chamadas do Livro de Receitas (acervo único) no Acesso Admin. `ref` identifica a receita em todas as ações. */
export const bookApi = {
  load: () => campaignsApi.get<AdminRecipeBook>("/admin/recipe-book"),
  item: (ref: string) => campaignsApi.get<AdminBookItemDetail>(`/admin/recipe-book/item?ref=${encodeURIComponent(ref)}`),
  candidates: (q: string) => campaignsApi.get<BookCandidate[]>(`/admin/recipe-book/candidates?q=${encodeURIComponent(q)}`),
  settings: (patch: Partial<RecipeBookSettings>) => campaignsApi.put<{ ok?: boolean }>("/admin/recipe-book/settings", patch),
  add: (submission_id: string) => campaignsApi.post<{ ref: string }>("/admin/recipe-book/add", { submission_id }),
  addManual: (f: ManualFields) => campaignsApi.post<{ ref: string }>("/admin/recipe-book/manual", f),
  update: (ref: string, f: EditFields) => campaignsApi.put<{ ok?: boolean }>("/admin/recipe-book/item", { ref, ...f }),
  remove: (ref: string) => campaignsApi.post<{ ok?: boolean }>("/admin/recipe-book/remove", { ref }),
  restore: (ref: string) => campaignsApi.post<{ ok?: boolean }>("/admin/recipe-book/restore", { ref }),
  removePhoto: (ref: string) => campaignsApi.post<{ ok?: boolean }>("/admin/recipe-book/photo-remove", { ref }),
};

/**
 * Foto de receita manual: reduz/reencoda no aparelho, envia direto ao armazenamento por URL assinada
 * e confirma no servidor (que confere tipo, tamanho e assinatura do arquivo). Lança Error em PT-BR.
 */
export async function uploadBookPhoto(ref: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  const prepared = await prepareImage(file);
  const t = await campaignsApi.post<{ path: string; token: string; signedUrl: string }>("/admin/recipe-book/photo-upload-url", {
    ref,
    mime: prepared.type,
    size: prepared.size,
  });
  await uploadToSignedUrl(t.signedUrl, prepared, onProgress);
  await campaignsApi.post("/admin/recipe-book/photo-finalize", { ref, path: t.path });
}

/** Sem acento e em minúsculas, para a busca ignorar acentuação. */
export const norm = normText;
