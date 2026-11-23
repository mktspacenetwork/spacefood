import React, { useEffect, useState } from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { api } from "../../lib/api";
import { Link } from "react-router";
import { useAuth } from "../../context/Store";
import { fetchHomeCampaignBanners } from "../../lib/campaigns/homeBanners";
import { BANNER_TEXT_MASK, bannerPillTextColor } from "../../lib/campaigns/banner";
import { BANNER_PILL_CLASSES, BannerTextLayer } from "../campaigns/BannerTextLayer";
// @ts-ignore
import exampleBanner from "figma:asset/5791843b5a574f8adc2665f1e6dc54ea3d4302e6.png";

interface Banner {
  id: string;
  imageUrl?: string;
  link?: string;
  active: boolean;
  order: number;
  title?: string;
  description?: string;
  backgroundColor?: string;
  textColor?: string;
  buttonText?: string;
  unitRestrictions?: string[];
  /** texto alternativo da imagem (slides de campanha usam o nome da campanha) */
  alt?: string;
  /** recorte da imagem; padrão dos banners é "center right" */
  objectPosition?: string;
  /** slide de campanha: mesma caixa e mesma regra de imagem dos banners comuns, mais o botão de envio (ver `CampaignSlide`) */
  campaign?: boolean;
  /** slide de campanha com texto configurado no cadastro (mesmo modelo dos banners comuns): ver `StyledCampaignSlide` */
  styled?: boolean;
  /** slides de campanha: botão "Envie sua receita" (só enquanto a campanha aceita envio no prazo) */
  cta?: { label: string; link: string };
}

const BannerItem = ({ banner }: { banner: Banner }) => {
  const hasContent = !!(banner.title || banner.description || banner.buttonText);
  const bgColor = banner.backgroundColor || "#f3f4f6";
  const txtColor = banner.textColor || "#000000";

  return (
    <div 
      className="relative w-full aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1] flex items-center overflow-hidden bg-cover bg-center transition-all"
      style={{ background: bgColor }}
    >
      {/* Background Image */}
      {banner.imageUrl && (
        <img 
          src={banner.imageUrl} 
          alt={banner.alt || banner.title || "Banner"} 
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 ${hasContent ? 'opacity-90' : 'opacity-100'}`}
          style={{ 
            objectPosition: banner.objectPosition ?? 'center right',
            // If text content exists, create a gradient mask so text is readable on the left
            maskImage: hasContent ? 'linear-gradient(to right, transparent 0%, black 60%)' : 'none',
            WebkitMaskImage: hasContent ? 'linear-gradient(to right, transparent 0%, black 60%)' : 'none'
          }} 
        />
      )}

      {/* Text Content */}
      {hasContent && (
        <div className="relative z-10 w-full h-full px-5 py-4 md:px-10 md:py-8 lg:px-12 flex flex-col justify-center items-start gap-1.5 md:gap-4 max-w-[62%] md:max-w-[60%] overflow-hidden">
          {banner.title && (
            <h2
              className="text-base sm:text-lg md:text-3xl lg:text-4xl font-extrabold leading-tight tracking-tight drop-shadow-sm line-clamp-2"
              style={{ color: txtColor }}
            >
              {banner.title}
            </h2>
          )}
          {banner.description && (
            <p
              className="text-[11px] sm:text-xs md:text-sm lg:text-base font-medium opacity-90 leading-snug drop-shadow-sm line-clamp-2"
              style={{ color: txtColor }}
            >
              {banner.description}
            </p>
          )}
          {banner.buttonText && (
            <div className="mt-0.5 md:mt-2 shrink-0">
               <span
                className="px-3.5 py-1.5 md:px-6 md:py-2.5 rounded-full text-[11px] sm:text-xs md:text-sm font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 inline-block"
                style={{
                  backgroundColor: txtColor,
                  color: bgColor
                }}
              >
                {banner.buttonText}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Fallback for image-only banner to ensure it fills if mask didn't apply */}
      {!hasContent && banner.imageUrl && (
         <div className="absolute inset-0 bg-transparent" />
      )}
    </div>
  );
};

/**
 * Slide de CAMPANHA — IGUAL aos banners comuns: a MESMA caixa (classes de proporção 2:1 → 3:1 → 3,5:1, cantos e
 * transição de `BannerItem`; a altura do carrossel é a mesma para todos os slides) e a MESMA regra de imagem do banner
 * só-imagem (`absolute inset-0 w-full h-full object-cover`, posição `center right`, opacidade total). Nada de contain,
 * fundo desfocado ou altura variável. Uma capa de proporção diferente da caixa tem as bordas cortadas, como em qualquer banner.
 *
 * O botão "Envie sua receita" tem o MESMO estilo, tamanho por breakpoint e margem lateral dos botões (`buttonText`) dos
 * banners comuns. O slide inteiro é um link (`/campanhas/<slug>`); o botão é outro link, IRMÃO (nunca um dentro do
 * outro), então tocar nele vai ao cadastro da receita. O botão fica no canto inferior esquerdo, acima da linha dos
 * pontos do carrossel (que ficam embaixo à direita). O alvo de toque de 44 px vem de uma área invisível estendida
 * (`before:`), sem aumentar o visual do botão.
 */
const CampaignSlide = ({ banner }: { banner: Banner }) => {
  const { cta } = banner;
  const hasImage = !!banner.imageUrl;
  const hasText = !hasImage && !!(banner.title || banner.description);
  const bgColor = banner.backgroundColor || (hasImage ? "#f3f4f6" : "#FF5A1F");
  const label = banner.alt || banner.title || "Campanha";

  return (
    <div
      className="relative w-full aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1] flex items-center overflow-hidden bg-cover bg-center transition-all"
      style={{ background: bgColor }}
    >
      {/* Camada clicável do slide inteiro */}
      <Link
        to={banner.link ?? "/campanhas"}
        draggable={false}
        aria-label={hasImage ? undefined : label}
        className="absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {hasImage && (
          <img
            src={banner.imageUrl}
            alt={label}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 opacity-100"
            style={{ objectPosition: banner.objectPosition ?? "center right" }}
          />
        )}
      </Link>

      {(hasText || cta) && (
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
          {cta && (
            <div className="mt-0.5 md:mt-2 shrink-0">
              <Link
                to={cta.link}
                draggable={false}
                aria-label={banner.alt ? `${cta.label} — ${banner.alt}` : cta.label}
                className="pointer-events-auto relative inline-block select-none rounded-full px-3.5 py-1.5 text-[11px] font-bold shadow-lg transition-transform before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 sm:text-xs md:px-6 md:py-2.5 md:text-sm"
                style={{ backgroundColor: "#FFFFFF", color: "#c2410c" }}
              >
                {cta.label}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Slide de campanha COM TEXTO configurado no cadastro (título, descrição, botão, fundo e cor do texto — as mesmas opções
 * do menu Banners). Desenha igual ao `BannerItem`: a MESMA caixa (2:1 → 3:1 → 3,5:1), a imagem com a lateral esquerda
 * esmaecida e o texto real por cima (não corta no celular, ao contrário do texto desenhado dentro da imagem).
 *
 * Mantém o comportamento do `CampaignSlide`: o slide inteiro é um link para a campanha e o botão é um link IRMÃO. Com
 * participação aberta no prazo (`cta`), o botão leva ao envio da receita e o rótulo é o texto configurado (ou "Envie sua
 * receita" se vazio); sem `cta`, o botão só aparece se houver texto configurado e é decorativo (o slide já é o link).
 */
const StyledCampaignSlide = ({ banner }: { banner: Banner }) => {
  const { cta } = banner;
  const hasImage = !!banner.imageUrl;
  const bgColor = banner.backgroundColor || "#FF5A1F";
  const txtColor = banner.textColor || "#FFFFFF";
  const pillText = bannerPillTextColor(bgColor);
  const label = banner.alt || banner.title || "Campanha";
  const pillStyle = { backgroundColor: txtColor, color: pillText };
  const buttonLabel = cta ? banner.buttonText || cta.label : banner.buttonText;

  return (
    <div
      className="relative w-full aspect-[2/1] md:aspect-[3/1] lg:aspect-[3.5/1] flex items-center overflow-hidden bg-cover bg-center transition-all"
      style={{ background: bgColor }}
    >
      {/* Camada clicável do slide inteiro */}
      <Link
        to={banner.link ?? "/campanhas"}
        draggable={false}
        aria-label={hasImage ? undefined : label}
        className="absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {hasImage && (
          <img
            src={banner.imageUrl}
            alt={label}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 opacity-90"
            style={{ objectPosition: banner.objectPosition ?? "center right", maskImage: BANNER_TEXT_MASK, WebkitMaskImage: BANNER_TEXT_MASK }}
          />
        )}
      </Link>

      <BannerTextLayer title={banner.title} description={banner.description} textColor={txtColor} className="pointer-events-none">
        {buttonLabel && (cta ? (
          <Link
            to={cta.link}
            draggable={false}
            aria-label={banner.alt ? `${buttonLabel} — ${banner.alt}` : buttonLabel}
            className={`${BANNER_PILL_CLASSES} pointer-events-auto relative select-none transition-transform before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-95`}
            style={pillStyle}
          >
            {buttonLabel}
          </Link>
        ) : (
          <span className={BANNER_PILL_CLASSES} style={pillStyle}>{buttonLabel}</span>
        ))}
      </BannerTextLayer>
    </div>
  );
};

/**
 * Carrossel da Home: banners de campanhas publicadas (na frente) + banners comuns.
 * Com o pedido do dia já feito a Home nem renderiza o carrossel (regra original do site; ver Menu.tsx).
 */
export function BannerCarousel({ userUnit }: { userUnit?: string }) {
  const { user } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [campaignBanners, setCampaignBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const unitParam = userUnit ? `?unit=${encodeURIComponent(userUnit)}` : "";
    // Banners de campanhas publicadas (nunca lança erro; falha = nenhum slide extra)
    const campaigns = fetchHomeCampaignBanners(user?.id ?? "anon")
      .then((list) => { if (!stale) setCampaignBanners(list as Banner[]); })
      .catch(() => { if (!stale) setCampaignBanners([]); });
    const regular = api.get(`/banners${unitParam}`)
      .then((data) => {
        if (stale) return;
        if (Array.isArray(data)) {
          // Client-side fallback filter for unit restrictions
          const filtered = data.filter((b: Banner) =>
            !b.unitRestrictions?.length || !userUnit || b.unitRestrictions.includes(userUnit)
          );
          setBanners(filtered);
        }
      })
      .catch((err) => {
        if (stale) return;
        console.error("Failed to load banners", err);
        setBanners([]);
      });
    Promise.all([regular, campaigns]).finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [userUnit, user?.id]);

  const defaultBanner: Banner = {
    id: "default",
    imageUrl: exampleBanner,
    active: true,
    order: 0,
    backgroundColor: "#FF5A1F",
  };

  // Campanhas publicadas entram na frente; o banner padrão só aparece se não houver nenhum slide.
  const allBanners = [...campaignBanners, ...banners];
  const displayBanners = allBanners.length > 0 ? allBanners : [defaultBanner];

  if (loading) {
    return (
      <div className="w-full aspect-[2/1] md:aspect-[3/1] rounded-3xl bg-muted animate-pulse mb-6" />
    );
  }

  const settings = {
    dots: true,
    infinite: displayBanners.length > 1,
    speed: 300,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 4000,
    arrows: false,
    pauseOnHover: true,
    touchThreshold: 20,
    cssEase: "ease-out",
    appendDots: (dots: React.ReactNode) => (
      <div style={{ position: "absolute", bottom: "12px", right: "16px", left: "auto", display: "flex", justifyContent: "flex-end", padding: 0 }}>
        <ul style={{ display: "flex", gap: "6px", margin: 0, padding: 0, listStyle: "none", alignItems: "center" }}>
          {dots}
        </ul>
      </div>
    ),
    customPaging: (_i: number) => (
      <button
        className="banner-dot-pill"
        style={{
          width: "20px",
          height: "6px",
          borderRadius: "9999px",
          backgroundColor: "rgba(255,255,255,0.45)",
          border: "none",
          padding: 0,
          cursor: "pointer",
          transition: "all 0.25s ease",
        }}
      />
    ),
  };

  return (
    <div className="w-full mb-8 select-none banner-carousel-container overflow-hidden">
      <div className="rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative z-0">
        <Slider {...settings}>
          {displayBanners.map((banner) => {
            const isExternal = banner.link?.startsWith("http");

            // Slide de campanha: mesma caixa e regra de imagem dos banners comuns + botão de envio (os comuns seguem abaixo, iguais)
            if (banner.campaign) {
              return (
                <div key={banner.id} className="outline-none h-full">
                  {banner.styled ? <StyledCampaignSlide banner={banner} /> : <CampaignSlide banner={banner} />}
                </div>
              );
            }

            if (banner.link) {
              return (
                <div key={banner.id} className="outline-none h-full">
                  {isExternal ? (
                    <a 
                      href={banner.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block w-full h-full"
                    >
                      <BannerItem banner={banner} />
                    </a>
                  ) : (
                    <Link to={banner.link} className="block w-full h-full">
                      <BannerItem banner={banner} />
                    </Link>
                  )}
                </div>
              );
            }

            return (
              <div key={banner.id} className="outline-none h-full">
                <BannerItem banner={banner} />
              </div>
            );
          })}
        </Slider>
      </div>
      <style>{`
        .banner-carousel-container .slick-dots {
          position: absolute;
          bottom: 12px;
          right: 16px;
          left: auto;
          width: auto;
          display: flex !important;
          justify-content: flex-end;
        }
        .banner-carousel-container .slick-dots li {
          width: auto;
          height: auto;
          margin: 0;
        }
        .banner-carousel-container .slick-dots li button {
          width: 20px;
          height: 6px;
          padding: 0;
        }
        .banner-carousel-container .slick-dots li button:before {
          display: none;
        }
        .banner-carousel-container .slick-dots li.slick-active .banner-dot-pill {
          width: 32px !important;
          background-color: rgba(255,255,255,1) !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        }
        .banner-carousel-container .slick-list {
          border-radius: 1.5rem;
          overflow: hidden;
        }
        .banner-carousel-container .slick-track {
          display: flex;
        }
        .banner-carousel-container .slick-slide {
          min-width: 0;
        }
      `}</style>
    </div>
  );
}