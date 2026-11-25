import type { ReactNode } from "react";
import { Link } from "react-router";
import { BANNER_TEXT_MASK, bannerPillTextColor } from "../../lib/campaigns/banner";
import { BannerTextLayer, bannerPillClasses } from "./BannerTextLayer";
import type { BannerFit } from "./BannerTextLayer";

/**
 * BANNER DA CAMPANHA — UM SÓ desenho para a Home, a lista de Campanhas e a página da campanha.
 *
 * Antes eram desenhos diferentes (slide na Home, só a foto nos cartões da lista, capa com texto na página). Agora os três usam
 * este componente com os MESMOS dados (`campaignToBanner` em lib/campaigns/homeBanners.ts): a mesma imagem, o mesmo texto
 * (título, descrição, botão, fundo e cor do texto configurados no cadastro) e o mesmo botão, inclusive para campanhas antigas
 * (sem texto: só a imagem, ou o nome sobre o laranja quando não há capa). Nada é substituído nem simplificado.
 *
 * A caixa é a dos banners comuns (2:1 → 3:1 → 3,5:1, `object-cover`, posição `center right`).
 *  - `fit="viewport"` (Home): medidas por tamanho de TELA, como os banners comuns.
 *  - `fit="container"` (Campanhas): a página é mais estreita que a Home; em tablet/computador as medidas do texto seguem a
 *    largura do próprio banner (ver `BannerTextLayer`). No celular é idêntico à Home.
 *  - `linkSlide={false}`: o slide inteiro NÃO é link (usado na própria página da campanha, para não "abrir a si mesma");
 *    o botão continua ativo.
 */
export type CampaignSlideData = {
  /** Página da campanha (o slide inteiro é um link para ela). */
  link?: string;
  imageUrl?: string;
  title?: string;
  description?: string;
  backgroundColor?: string;
  textColor?: string;
  buttonText?: string;
  /** Texto alternativo da imagem (nome da campanha). */
  alt?: string;
  objectPosition?: string;
  /** Campanha com texto configurado no cadastro (mesmo modelo dos banners comuns). */
  styled?: boolean;
  /** Botão de envio: só existe enquanto a campanha aceita envio NO PRAZO. */
  cta?: { label: string; link: string };
};

const BOX = "relative w-full aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1] flex items-center overflow-hidden bg-cover bg-center transition-all";
const LAYER_LINK = "absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Camada de fundo (a imagem): link para a campanha, ou só um bloco quando o slide não é link. */
function SlideLayer({ to, label, linkSlide, children }: { to: string; label?: string; linkSlide: boolean; children?: ReactNode }) {
  if (!linkSlide) return <div className="absolute inset-0 block">{children}</div>;
  return (
    <Link to={to} draggable={false} aria-label={label} className={LAYER_LINK}>
      {children}
    </Link>
  );
}

/**
 * Slide de campanha SEM texto configurado (campanhas antigas) — IGUAL aos banners comuns: a MESMA caixa e a MESMA regra de
 * imagem do banner só-imagem (`absolute inset-0 w-full h-full object-cover select-none`, posição `center right`, opacidade
 * total), mais o botão de envio (`cta`). Sem capa: nome e descrição sobre o laranja do site.
 *
 * O botão de envio tem o MESMO estilo, tamanho por breakpoint e margem lateral dos botões (`buttonText`) dos banners comuns. O
 * slide inteiro é um link; o botão é outro link, IRMÃO (nunca um dentro do outro). Fica no canto inferior esquerdo, acima
 * da linha dos pontos do carrossel. O alvo de toque de 44 px vem de uma área invisível estendida (`before:`).
 */
function LegacySlide({ banner, fit, linkSlide }: { banner: CampaignSlideData; fit: BannerFit; linkSlide: boolean }) {
  const { cta } = banner;
  const hasImage = !!banner.imageUrl;
  const hasText = !hasImage && !!(banner.title || banner.description);
  const bgColor = banner.backgroundColor || (hasImage ? "#f3f4f6" : "#FF5A1F");
  const label = banner.alt || banner.title || "Campanha";
  const container = fit === "container";

  const ctaLink = cta && (
    <Link
      to={cta.link}
      draggable={false}
      aria-label={banner.alt ? `${cta.label} — ${banner.alt}` : cta.label}
      className="pointer-events-auto relative inline-block select-none rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-lg transition-transform before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 sm:text-xs md:px-6 md:py-2.5 md:text-sm"
      style={{ backgroundColor: "#FFFFFF", color: "#c2410c" }}
    >
      {cta.label}
    </Link>
  );

  return (
    <div className={`${BOX}${container ? " @container" : ""}`} style={{ background: bgColor }}>
      <SlideLayer to={banner.link ?? "/campanhas"} label={hasImage ? undefined : label} linkSlide={linkSlide}>
        {hasImage && (
          <img
            src={banner.imageUrl}
            alt={label}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 opacity-100"
            style={{ objectPosition: banner.objectPosition ?? "center right" }}
          />
        )}
      </SlideLayer>

      {(hasText || cta) && (container && hasText ? (
        // Nome/descrição sobre o laranja numa caixa mais estreita: mesmas medidas do banner com texto (cabem sem cortar)
        <BannerTextLayer title={banner.title} description={banner.description} textColor={banner.textColor || "#FFFFFF"} fit="container" className="pointer-events-none">
          {ctaLink}
        </BannerTextLayer>
      ) : (
        <div
          className={`pointer-events-none relative z-10 flex h-full w-full flex-col items-start overflow-hidden px-5 md:px-10 lg:px-12 ${
            hasText
              ? "justify-center gap-1.5 py-3 md:gap-4 md:py-8"
              : "max-w-[62%] justify-end pb-6 pt-4 md:max-w-[60%] md:pb-8 md:pt-8"
          }`}
          style={hasText ? { color: banner.textColor || "#FFFFFF" } : undefined}
        >
          {hasText && banner.title && (
            <h2 className="text-sm sm:text-base md:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight drop-shadow-sm [overflow-wrap:anywhere]">
              {banner.title}
            </h2>
          )}
          {hasText && banner.description && (
            <p className="text-[11px] sm:text-xs md:text-sm lg:text-base font-medium opacity-90 leading-snug drop-shadow-sm [overflow-wrap:anywhere]">
              {banner.description}
            </p>
          )}
          {ctaLink && <div className="mt-0.5 md:mt-2 shrink-0">{ctaLink}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Slide de campanha COM TEXTO configurado no cadastro (título, descrição, botão, fundo e cor do texto — as mesmas opções
 * do menu Banners). Desenha igual ao `BannerItem`: a MESMA caixa (2:1 → 3:1 → 3,5:1), a imagem com a lateral esquerda
 * esmaecida e o texto real por cima (não corta no celular, ao contrário do texto desenhado dentro da imagem).
 *
 * O slide inteiro é um link para a campanha e o botão é um link IRMÃO. Com participação aberta no prazo (`cta`) o botão leva ao
 * envio da receita e o rótulo é o texto configurado (ou "Envie sua receita" se vazio); sem `cta`, o botão só aparece se houver
 * texto configurado e é decorativo (o slide já é o link).
 */
function StyledSlide({ banner, fit, linkSlide }: { banner: CampaignSlideData; fit: BannerFit; linkSlide: boolean }) {
  const { cta } = banner;
  const hasImage = !!banner.imageUrl;
  const bgColor = banner.backgroundColor || "#FF5A1F";
  const txtColor = banner.textColor || "#FFFFFF";
  const pillText = bannerPillTextColor(bgColor);
  const label = banner.alt || banner.title || "Campanha";
  const pillStyle = { backgroundColor: txtColor, color: pillText };
  const buttonLabel = cta ? banner.buttonText || cta.label : banner.buttonText;
  const pill = bannerPillClasses(fit);

  return (
    <div className={`${BOX}${fit === "container" ? " @container" : ""}`} style={{ background: bgColor }}>
      <SlideLayer to={banner.link ?? "/campanhas"} label={hasImage ? undefined : label} linkSlide={linkSlide}>
        {hasImage && (
          <img
            src={banner.imageUrl}
            alt={label}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 opacity-90"
            style={{ objectPosition: banner.objectPosition ?? "center right", maskImage: BANNER_TEXT_MASK, WebkitMaskImage: BANNER_TEXT_MASK }}
          />
        )}
      </SlideLayer>

      <BannerTextLayer title={banner.title} description={banner.description} textColor={txtColor} fit={fit} className="pointer-events-none">
        {buttonLabel && (cta ? (
          <Link
            to={cta.link}
            draggable={false}
            aria-label={banner.alt ? `${buttonLabel} — ${banner.alt}` : buttonLabel}
            className={`${pill} pointer-events-auto relative select-none transition-transform before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95`}
            style={pillStyle}
          >
            {buttonLabel}
          </Link>
        ) : (
          <span className={pill} style={pillStyle}>{buttonLabel}</span>
        ))}
      </BannerTextLayer>
    </div>
  );
}

export function CampaignBannerSlide({
  banner, fit = "viewport", linkSlide = true,
}: {
  banner: CampaignSlideData;
  fit?: BannerFit;
  linkSlide?: boolean;
}) {
  return banner.styled
    ? <StyledSlide banner={banner} fit={fit} linkSlide={linkSlide} />
    : <LegacySlide banner={banner} fit={fit} linkSlide={linkSlide} />;
}
