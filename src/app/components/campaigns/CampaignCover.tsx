import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { BANNER_ASPECT } from "./campaignInfo";

/** Capa da campanha = banner da Home: mesmas proporções e mesmo recorte (object-cover). Sem imagem, usa o laranja do site. */
export function CampaignCover({ url, className, eager = false }: { url?: string | null; className?: string; eager?: boolean }) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", BANNER_ASPECT, className)}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-amber-500 text-white/90">
          <Megaphone size={40} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
