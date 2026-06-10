import React, { useEffect, useState } from "react";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { api } from "../../lib/api";
import { Link } from "react-router";
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
          alt={banner.title || "Banner"} 
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover select-none transition-opacity duration-500 ${hasContent ? 'opacity-90' : 'opacity-100'}`}
          style={{ 
            objectPosition: 'center right',
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

export function BannerCarousel({ userUnit }: { userUnit?: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    const unitParam = userUnit ? `?unit=${encodeURIComponent(userUnit)}` : "";
    api.get(`/banners${unitParam}`)
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
      })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [userUnit]);

  const defaultBanner: Banner = {
    id: "default",
    imageUrl: exampleBanner,
    active: true,
    order: 0,
    backgroundColor: "#FF5A1F",
  };

  const displayBanners = banners.length > 0 ? banners : [defaultBanner];

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