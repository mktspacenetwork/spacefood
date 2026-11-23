import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { describeBook, ingredientItems, preparationSteps, recipeCampaign, storyParagraphs } from "./bookText";
import type { AnyBook } from "./bookText";
import type { BookRecipe, WebPhotoCredit } from "./types";

/**
 * Gerador do PDF do Livro de Receitas — roda no NAVEGADOR de quem baixa (nada é guardado no servidor e o PDF
 * sempre sai com o conteúdo atual do livro). A biblioteca `pdf-lib` é carregada só quando o PDF é gerado.
 *
 * Formato A5 (cabe bem no celular e imprime em folha comum). Capa, sumário com página e uma receita por
 * página inicial; textos longos continuam nas páginas seguintes SEM cortar nada. Fontes padrão do PDF
 * (Times/Helvetica): o que elas não representam (emoji, símbolos) é removido; letras acentuadas raras viram a letra base.
 */

export type PdfImageData = { bytes: Uint8Array; kind: "jpg" | "png" };

export type BookPdfOptions = {
  onProgress?: (info: { done: number; total: number; label: string }) => void;
  /** Carrega uma foto como JPEG/PNG. Padrão: navegador (fetch + canvas → JPEG). Injetável para testes. */
  loadImage?: (url: string) => Promise<PdfImageData | null>;
  /** Cancela a geração (lança `AbortError`). */
  signal?: AbortSignal;
};

export type BookPdfResult = { bytes: Uint8Array; pages: number };

// ───────────────────────────── Medidas e cores ─────────────────────────────
const W = 419.53; // A5
const H = 595.28;
const MX = 40;
const TOP = 46;
const BOTTOM = 56;
const CW = W - MX * 2;
const MAX_PHOTO_SIDE = 1400;
const CAPTION_SIZE = 6.5;
const CAPTION_LH = 9.5;

const C = {
  orange: [0.918, 0.345, 0.047] as const,
  deep: [0.76, 0.255, 0.047] as const,
  text: [0.11, 0.1, 0.09] as const,
  muted: [0.42, 0.4, 0.38] as const,
  line: [0.86, 0.83, 0.79] as const,
  white: [1, 1, 1] as const,
};

type Lib = typeof import("pdf-lib");
type Fonts = { serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont; sans: PDFFont; sansBold: PDFFont };
type Ctx = { lib: Lib; doc: PDFDocument; f: Fonts; clean: (s: string) => string; footerText: string };

// ───────────────────────── Texto: limpeza e quebra de linha ─────────────────────────
const SYMBOL_MAP: Record<string, string> = { "→": "->", "←": "<-", "✓": "", "✔": "", "★": "*", "☆": "*", "…": "…", "·": "·" };

function makeCleaner(font: PDFFont): (s: string) => string {
  const ok = new Set<number>(font.getCharacterSet());
  return (input: string) => {
    const s = String(input ?? "").normalize("NFC").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/[   ]/g, " ");
    let out = "";
    for (const ch of s) {
      const cp = ch.codePointAt(0) as number;
      if (ch === "\n" || ok.has(cp)) { out += ch; continue; }
      const mapped = SYMBOL_MAP[ch];
      if (mapped !== undefined && [...mapped].every((m) => ok.has(m.codePointAt(0) as number))) { out += mapped; continue; }
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (base !== ch && base.length > 0 && [...base].every((m) => ok.has(m.codePointAt(0) as number))) { out += base; continue; }
      // emoji, símbolos, caracteres de controle: descartados
    }
    return out;
  };
}

/** Quebra o texto em linhas que cabem em `maxW`. Respeita "\n"; palavra maior que a linha é quebrada por caractere. */
function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para.trim() === "") { out.push(""); continue; }
    let line = "";
    for (const word of para.trim().split(/ +/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) { line = test; continue; }
      if (line) { out.push(line); line = ""; }
      if (font.widthOfTextAtSize(word, size) <= maxW) { line = word; continue; }
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch;
        else { out.push(chunk); chunk = ch; }
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// ───────────────────────────── Fotos (navegador) ─────────────────────────────

/** Padrão no navegador: baixa a foto e a regrava como JPEG (aceita WebP/PNG/JPEG; reduz o peso do PDF). */
export async function loadImageAsJpeg(url: string): Promise<PdfImageData | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // PNG com transparência não pode virar fundo preto
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "jpg" } : null;
  } catch {
    return null;
  }
}

async function embed(doc: PDFDocument, img: PdfImageData | null): Promise<PDFImage | null> {
  if (!img) return null;
  try {
    return img.kind === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
  } catch {
    return null; // foto corrompida: o livro sai sem ela em vez de falhar inteiro
  }
}

// ─────────────────────────────── Página e fluxo ───────────────────────────────

class Flow {
  page!: PDFPage;
  y = 0;
  constructor(private ctx: Ctx) {}

  /** Nova página com rodapé (nome do livro à esquerda, número à direita). */
  newPage(): PDFPage {
    const { doc, lib, f, footerText } = this.ctx;
    this.page = doc.addPage([W, H]);
    const n = doc.getPageCount();
    const col = lib.rgb(...C.muted);
    this.page.drawLine({ start: { x: MX, y: 40 }, end: { x: W - MX, y: 40 }, thickness: 0.5, color: lib.rgb(...C.line) });
    this.page.drawText(footerText, { x: MX, y: 27, size: 7.5, font: f.sans, color: col });
    const num = String(n);
    this.page.drawText(num, { x: W - MX - f.sans.widthOfTextAtSize(num, 8), y: 27, size: 8, font: f.sansBold, color: col });
    this.y = H - TOP;
    return this.page;
  }

  /** Garante `h` pontos livres; senão abre outra página. */
  ensure(h: number): void {
    if (this.y - h < BOTTOM) this.newPage();
  }

  /** Texto corrido (já limpo), linha a linha, passando de página sem cortar. `bar` desenha uma barra lateral. */
  lines(lines: string[], o: { font: PDFFont; size: number; lh: number; x?: number; color?: readonly [number, number, number]; bar?: boolean }): void {
    const { lib } = this.ctx;
    for (const l of lines) {
      this.ensure(o.lh);
      const x = o.x ?? MX;
      if (o.bar) this.page.drawRectangle({ x: MX, y: this.y - o.lh + 4, width: 2.5, height: o.lh, color: lib.rgb(...C.orange) });
      if (l) this.page.drawText(l, { x, y: this.y - o.size, size: o.size, font: o.font, color: lib.rgb(...(o.color ?? C.text)) });
      this.y -= o.lh;
    }
  }

  gap(h: number): void { this.y -= h; }

  /** Título de seção com filete embaixo; não fica sozinho no fim da página. */
  heading(label: string): void {
    const { lib, f, clean } = this.ctx;
    this.ensure(16 + 2 * 15 + 10);
    this.page.drawText(clean(label), { x: MX, y: this.y - 13, size: 13, font: f.serifBold, color: lib.rgb(...C.text) });
    this.y -= 19;
    this.page.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: 0.6, color: lib.rgb(...C.line) });
    this.y -= 11;
  }

  /** Foto centralizada; `caption` (linhas já limpas) vai logo abaixo, em letra miúda (crédito de foto da internet). */
  image(img: PDFImage, maxW: number, maxH: number, x = MX, caption?: string[]): void {
    const r = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * r;
    const h = img.height * r;
    const capH = caption && caption.length ? caption.length * CAPTION_LH + 3 : 0;
    this.ensure(h + 8 + capH);
    this.page.drawImage(img, { x: x + (maxW - w) / 2, y: this.y - h, width: w, height: h });
    this.y -= h + (capH ? 3 : 10);
    if (capH) {
      this.lines(caption as string[], { font: this.ctx.f.sans, size: CAPTION_SIZE, lh: CAPTION_LH, color: C.muted });
      this.y -= 7;
    }
  }
}

function drawCover(ctx: Ctx, book: AnyBook, cover: PDFImage | null, recipesCount: number, dateLabel: string): void {
  const { doc, lib, f, clean } = ctx;
  const info = describeBook(book);
  const p = doc.addPage([W, H]);
  const white = lib.rgb(...C.white);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: lib.rgb(...C.deep) });
  p.drawRectangle({ x: 0, y: H * 0.5, width: W, height: H * 0.5, color: lib.rgb(0.82, 0.29, 0.05) });
  p.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: white, borderWidth: 0.8, borderOpacity: 0.55, opacity: 0 });

  let top = H - 56;
  if (cover) {
    const bw = W - 40;
    const r = Math.min(bw / cover.width, 170 / cover.height);
    const w = cover.width * r;
    const h = cover.height * r;
    p.drawImage(cover, { x: (W - w) / 2, y: H - 20 - h, width: w, height: h });
    top = H - 20 - h - 44;
  }
  const brand = "S P A C E F O O D";
  p.drawText(brand, { x: (W - f.sansBold.widthOfTextAtSize(brand, 10)) / 2, y: top, size: 10, font: f.sansBold, color: white, opacity: 0.9 });
  p.drawLine({ start: { x: W / 2 - 28, y: top - 18 }, end: { x: W / 2 + 28, y: top - 18 }, thickness: 0.8, color: white, opacity: 0.6 });

  const nameLines = wrap(clean(info.title), f.serifBold, 30, W - 100);
  let y = Math.min(top - 70, H * 0.58);
  for (const l of nameLines) {
    p.drawText(l, { x: (W - f.serifBold.widthOfTextAtSize(l, 30)) / 2, y, size: 30, font: f.serifBold, color: white });
    y -= 36;
  }
  const sub = clean(info.subtitle);
  p.drawText(sub, { x: (W - f.serifItalic.widthOfTextAtSize(sub, 17)) / 2, y: y - 8, size: 17, font: f.serifItalic, color: white, opacity: 0.95 });

  const count = `${recipesCount} ${recipesCount === 1 ? "RECEITA" : "RECEITAS"}`;
  p.drawText(count, { x: (W - f.sansBold.widthOfTextAtSize(count, 9)) / 2, y: 78, size: 9, font: f.sansBold, color: white, opacity: 0.9 });
  const d = clean(dateLabel);
  p.drawText(d, { x: (W - f.sans.widthOfTextAtSize(d, 8.5)) / 2, y: 62, size: 8.5, font: f.sans, color: white, opacity: 0.8 });
}

/** Quantas páginas o sumário ocupa (as páginas são reservadas antes das receitas; o conteúdo entra no final). */
const TOC_ROW = 32;
function tocLayout(n: number): { pages: number; firstCap: number; cap: number } {
  const avail = H - TOP - BOTTOM;
  const firstCap = Math.max(1, Math.floor((avail - 54) / TOC_ROW));
  const cap = Math.max(1, Math.floor(avail / TOC_ROW));
  const pages = n <= firstCap ? 1 : 1 + Math.ceil((n - firstCap) / cap);
  return { pages, firstCap, cap };
}

function drawToc(ctx: Ctx, pages: PDFPage[], recipes: BookRecipe[], startPages: number[]): void {
  const { lib, f, clean } = ctx;
  const { firstCap, cap } = tocLayout(recipes.length);
  let idx = 0;
  pages.forEach((p, pi) => {
    let y = H - TOP;
    if (pi === 0) {
      p.drawText("Sumário", { x: MX, y: y - 20, size: 22, font: f.serifBold, color: lib.rgb(...C.text) });
      y -= 54;
    }
    const count = pi === 0 ? firstCap : cap;
    for (let k = 0; k < count && idx < recipes.length; k++, idx++) {
      const r = recipes[idx];
      const num = String(idx + 1).padStart(2, "0");
      const pg = String(startPages[idx]);
      p.drawText(num, { x: MX, y: y - 13, size: 11, font: f.sansBold, color: lib.rgb(...C.orange) });
      const pgW = f.sansBold.widthOfTextAtSize(pg, 9);
      p.drawText(pg, { x: W - MX - pgW, y: y - 12, size: 9, font: f.sansBold, color: lib.rgb(...C.muted) });
      const titleW = CW - 28 - pgW - 10;
      p.drawText(fit(clean(r.dish_name).trim() || "Receita", f.serifBold, 11.5, titleW), { x: MX + 28, y: y - 12, size: 11.5, font: f.serifBold, color: lib.rgb(...C.text) });
      const au = clean(r.author).trim();
      if (au) p.drawText(fit(`por ${au}`, f.serifItalic, 9, titleW), { x: MX + 28, y: y - 24, size: 9, font: f.serifItalic, color: lib.rgb(...C.muted) });
      p.drawLine({ start: { x: MX, y: y - TOC_ROW + 4 }, end: { x: W - MX, y: y - TOC_ROW + 4 }, thickness: 0.4, color: lib.rgb(...C.line) });
      y -= TOC_ROW;
    }
  });
}

/** Foto já embutida no PDF, com o crédito quando veio da internet (a legenda sai sob a foto). */
type PdfPhoto = { img: PDFImage; web?: WebPhotoCredit | null };

/** "Foto: autor · licença · Wikimedia Commons" (a fonte tem de aparecer: é a condição de uso das licenças livres). */
function creditText(ctx: Ctx, web: WebPhotoCredit, prefix = "Foto"): string {
  const author = ctx.clean(web.creator ?? "").trim();
  const license = ctx.clean(web.license ?? "").trim();
  const parts = [author, license, "Wikimedia Commons"].filter(Boolean);
  return `${prefix}: ${parts.join(" · ")}`;
}

/** Desenha a receita (sempre abrindo página nova) e devolve o número da página em que ela começa. */
async function drawRecipe(ctx: Ctx, flow: Flow, r: BookRecipe, index: number, total: number, photos: PdfPhoto[]): Promise<number> {
  const { lib, f, clean } = ctx;
  flow.newPage();
  const startPage = ctx.doc.getPageCount();
  const label = `RECEITA ${String(index + 1).padStart(2, "0")} DE ${String(total).padStart(2, "0")}`;
  flow.page.drawText(label, { x: MX, y: flow.y - 8, size: 7.5, font: f.sansBold, color: lib.rgb(...C.orange) });
  flow.gap(20);
  flow.lines(wrap(clean(r.dish_name).trim() || "Receita", f.serifBold, 21, CW), { font: f.serifBold, size: 21, lh: 25 });
  const author = clean(r.author).trim(); // nome só com letras fora do alfabeto latino ficaria vazio: nesse caso não escreve "por"
  if (author) {
    flow.gap(3);
    flow.lines(wrap(`por ${author}`, f.serifItalic, 10.5, CW), { font: f.serifItalic, size: 10.5, lh: 14, color: C.muted });
  }
  const origin = clean(recipeCampaign(r) ?? "").trim();
  if (origin) {
    flow.gap(2);
    flow.lines(wrap(`Campanha: ${origin}`, f.sans, 8.5, CW), { font: f.sans, size: 8.5, lh: 12, color: C.muted });
  }
  flow.gap(12);

  if (photos[0]) {
    const w0 = photos[0].web;
    flow.image(photos[0].img, CW, 225, MX, w0 ? wrap(creditText(ctx, w0), f.sans, CAPTION_SIZE, CW) : undefined);
  }
  const extraPhotos = photos.slice(1, 3);
  const extra = extraPhotos.map((p) => p.img);
  if (extra.length) {
    const gap = 8;
    const cellW = (CW - gap * (extra.length - 1)) / extra.length;
    const hMax = 105;
    flow.ensure(hMax + 8);
    const startY = flow.y;
    let rowH = 0;
    extra.forEach((img, i) => {
      const rr = Math.min(cellW / img.width, hMax / img.height);
      const w = img.width * rr;
      const h = img.height * rr;
      rowH = Math.max(rowH, h);
      flow.page.drawImage(img, { x: MX + i * (cellW + gap) + (cellW - w) / 2, y: startY - h, width: w, height: h });
    });
    const credits = extraPhotos.map((p, i) => (p.web ? creditText(ctx, p.web, `Foto ${i + 2}`) : "")).filter(Boolean);
    if (credits.length) {
      flow.y = startY - rowH - 3;
      flow.lines(credits.flatMap((t) => wrap(t, f.sans, CAPTION_SIZE, CW)), { font: f.sans, size: CAPTION_SIZE, lh: CAPTION_LH, color: C.muted });
      flow.gap(9);
    } else {
      flow.y = startY - rowH - 12;
    }
  }

  const story = storyParagraphs(r.story);
  if (story.length) {
    flow.ensure(14 + 2 * 15);
    flow.page.drawText("HISTÓRIA E MEMÓRIA AFETIVA", { x: MX, y: flow.y - 8, size: 7, font: f.sansBold, color: lib.rgb(...C.muted) });
    flow.gap(16);
    story.forEach((para, i) => {
      flow.lines(wrap(clean(para), f.serifItalic, 10.5, CW - 14), { font: f.serifItalic, size: 10.5, lh: 15, x: MX + 14, bar: true });
      if (i < story.length - 1) flow.gap(6);
    });
    flow.gap(14);
  }

  const items = ingredientItems(r.ingredients);
  if (items.length) {
    flow.heading("Ingredientes");
    for (const it of items) {
      const ls = wrap(clean(it), f.serif, 10.5, CW - 16);
      flow.ensure(15 * Math.min(ls.length, 2));
      flow.page.drawText("•", { x: MX + 3, y: flow.y - 10.5, size: 10.5, font: f.serifBold, color: lib.rgb(...C.orange) });
      flow.lines(ls, { font: f.serif, size: 10.5, lh: 15, x: MX + 16 });
      flow.gap(2.5);
    }
    flow.gap(12);
  }

  const { steps, numbered } = preparationSteps(r.preparation);
  if (steps.length) {
    flow.heading("Modo de preparo");
    steps.forEach((s, i) => {
      const indent = numbered ? 20 : 0;
      const ls = wrap(clean(s), f.serif, 10.5, CW - indent);
      flow.ensure(15 * Math.min(ls.length, 2));
      if (numbered) {
        const n = `${i + 1}.`;
        flow.page.drawText(n, { x: MX, y: flow.y - 10.5, size: 10.5, font: f.sansBold, color: lib.rgb(...C.orange) });
      }
      flow.lines(ls, { font: f.serif, size: 10.5, lh: 15, x: MX + indent });
      flow.gap(6);
    });
  }
  return startPage;
}

// ─────────────────────────────────── Entrada ───────────────────────────────────

/** Monta o PDF do livro. Lança erro se a biblioteca não carregar; foto que falhar é só omitida. */
export async function generateBookPdf(book: AnyBook, opts: BookPdfOptions = {}): Promise<BookPdfResult> {
  const progress = opts.onProgress ?? (() => {});
  const loadImage = opts.loadImage ?? loadImageAsJpeg;
  const info = describeBook(book);
  const checkAbort = () => { if (opts.signal?.aborted) throw new DOMException("Geração cancelada.", "AbortError"); };
  const total = book.recipes.length + 2; // capa + receitas + sumário
  let done = 0;
  const step = (label: string) => progress({ done: ++done, total, label });

  progress({ done: 0, total, label: "Preparando o PDF…" });
  const lib = await import("pdf-lib");
  const doc = await lib.PDFDocument.create();
  const f: Fonts = {
    serif: await doc.embedFont(lib.StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(lib.StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(lib.StandardFonts.TimesRomanItalic),
    sans: await doc.embedFont(lib.StandardFonts.Helvetica),
    sansBold: await doc.embedFont(lib.StandardFonts.HelveticaBold),
  };
  const clean = makeCleaner(f.serif);
  const name = clean(info.title) || "Livro de Receitas";
  const ctx: Ctx = { lib, doc, f, clean, footerText: `SpaceFood  ·  ${fit(name, f.sans, 7.5, CW - 60)}` };

  doc.setTitle(name === "Livro de Receitas" ? name : `${name} - Livro de Receitas`);
  doc.setAuthor("SpaceFood");
  doc.setCreator("SpaceFood");
  doc.setProducer("SpaceFood");
  doc.setSubject(clean(info.subtitle));

  const when = info.generatedAt ? new Date(info.generatedAt) : new Date();
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }).format(when);

  const coverImg = info.coverUrl ? await embed(doc, await loadImage(info.coverUrl)) : null;
  drawCover(ctx, book, coverImg, book.recipes.length, dateLabel);
  step("Capa pronta");

  const flow = new Flow(ctx);
  const tocPages: PDFPage[] = [];
  if (book.recipes.length > 0) {
    const { pages } = tocLayout(book.recipes.length);
    for (let i = 0; i < pages; i++) tocPages.push(flow.newPage());
  }

  const startPages: number[] = [];
  for (let i = 0; i < book.recipes.length; i++) {
    checkAbort();
    const r = book.recipes[i];
    // as até 3 fotos da receita carregam juntas (a ordem é mantida)
    const loaded = await Promise.all(r.photos.slice(0, 3).map((ph) => loadImage(ph.url)));
    const photos: PdfPhoto[] = [];
    for (let k = 0; k < loaded.length; k++) {
      const e = await embed(doc, loaded[k]);
      if (e) photos.push({ img: e, web: r.photos[k]?.web ?? null });
    }
    checkAbort();
    startPages.push(await drawRecipe(ctx, flow, r, i, book.recipes.length, photos));
    step(`Receita ${i + 1} de ${book.recipes.length}`);
  }

  if (tocPages.length) drawToc(ctx, tocPages, book.recipes, startPages);
  step("Sumário pronto");

  const bytes = await doc.save();
  return { bytes, pages: doc.getPageCount() };
}

export function pdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
