import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * DevIconCheck - Preview visual do icone PWA gerado via Canvas
 * Mostra como o icone aparece na tela inicial do iOS/Android
 */
export function DevIconCheck() {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    generatePreviewIcon(180).then(setIconUrl);
  }, []);

  if (!iconUrl) return null;

  return (
    <>
      {/* Toggle button */}
      

      {/* Preview panel */}
      {show && (
        <div className="fixed bottom-32 right-4 z-[9999] bg-white/95 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl p-5 w-72">
          <h3 className="font-bold text-sm text-gray-900 mb-3">
            Preview do Icone PWA
          </h3>

          {/* iOS Home Screen simulation */}
          <div className="bg-gradient-to-b from-blue-100 to-blue-50 rounded-xl p-5 flex flex-col items-center gap-2 mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
              Tela Inicial (iOS)
            </p>
            <div className="w-[60px] h-[60px] rounded-[13.5px] overflow-hidden shadow-lg">
              <img src={iconUrl} alt="App Icon" className="w-full h-full" />
            </div>
            <span className="text-[11px] text-gray-800 font-medium mt-0.5">
              SpaceFood
            </span>
          </div>

          {/* Size comparison */}
          <div className="flex items-end justify-center gap-4 mb-4">
            <div className="flex flex-col items-center gap-1">
              <div className="w-[30px] h-[30px] rounded-[6px] overflow-hidden shadow">
                <img src={iconUrl} alt="" className="w-full h-full" />
              </div>
              <span className="text-[9px] text-gray-400">30px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-[45px] h-[45px] rounded-[10px] overflow-hidden shadow">
                <img src={iconUrl} alt="" className="w-full h-full" />
              </div>
              <span className="text-[9px] text-gray-400">45px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-[60px] h-[60px] rounded-[13.5px] overflow-hidden shadow-lg">
                <img src={iconUrl} alt="" className="w-full h-full" />
              </div>
              <span className="text-[9px] text-gray-400">60px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-[76px] h-[76px] rounded-[17px] overflow-hidden shadow-lg">
                <img src={iconUrl} alt="" className="w-full h-full" />
              </div>
              <span className="text-[9px] text-gray-400">76px</span>
            </div>
          </div>

          <p className="text-[10px] text-center text-gray-400">
            Mesmo logo do sidebar: prato + garfo + faca + check
          </p>
        </div>
      )}
    </>
  );
}

/**
 * Gera o icone de preview - mesma logica do usePWA generateAppIcon
 * Matches sidebar logo: #ff4500 bg + white plate/fork/knife/check
 */
function generatePreviewIcon(size: number): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve("");
      return;
    }

    // Polyfill ctx.roundRect for Chrome < 99 and older browsers
    if (!ctx.roundRect) {
      (ctx as any).roundRect = function (x: number, y: number, w: number, h: number, r: number | number[]) {
        const rad = Array.isArray(r) ? (r[0] ?? 0) : r;
        this.beginPath();
        this.moveTo(x + rad, y);
        this.lineTo(x + w - rad, y);
        this.arcTo(x + w, y, x + w, y + rad, rad);
        this.lineTo(x + w, y + h - rad);
        this.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        this.lineTo(x + rad, y + h);
        this.arcTo(x, y + h, x, y + h - rad, rad);
        this.lineTo(x, y + rad);
        this.arcTo(x, y, x + rad, y, rad);
        this.closePath();
      };
    }

    // === Background: solid #ff4500 with rounded corners ===
    const r = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = "#ff4500";
    ctx.fill();

    ctx.save();
    ctx.clip();

    // Subtle shine
    const shineGrad = ctx.createLinearGradient(0, 0, size, size);
    shineGrad.addColorStop(0, "rgba(255,255,255,0.12)");
    shineGrad.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = shineGrad;
    ctx.fillRect(0, 0, size, size);

    // Scale factor: Lottie 500x500 -> canvas size
    const s = size / 500;
    const cx = size / 2;
    const cy = size / 2;

    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Plate (outer circle)
    ctx.beginPath();
    ctx.arc(cx, cy, 94.5 * s, 0, Math.PI * 2);
    ctx.lineWidth = 5.5;
    ctx.stroke();

    // Inner food shape
    ctx.beginPath();
    ctx.arc(cx, cy, 62 * s, 0, Math.PI * 2);
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Checkmark
    ctx.beginPath();
    ctx.lineWidth = 5.5;
    ctx.moveTo(cx - 22 * s, cy - 1 * s);
    ctx.lineTo(cx - 6.5 * s, cy + 14 * s);
    ctx.lineTo(cx + 22 * s, cy - 14 * s);
    ctx.stroke();

    // Fork (right side)
    const forkX = cx + 141 * s;
    const forkTopY = cy - 110 * s;

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(forkX - 11 * s, forkTopY);
    ctx.lineTo(forkX - 11 * s, forkTopY + 34 * s);
    ctx.quadraticCurveTo(forkX - 11 * s, forkTopY + 56 * s, forkX, forkTopY + 56 * s);
    ctx.quadraticCurveTo(forkX + 11 * s, forkTopY + 56 * s, forkX + 11 * s, forkTopY + 34 * s);
    ctx.lineTo(forkX + 11 * s, forkTopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(forkX, forkTopY);
    ctx.lineTo(forkX, forkTopY + 40 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 4.5;
    ctx.moveTo(forkX, forkTopY + 56 * s);
    ctx.lineTo(forkX, forkTopY + 140 * s);
    ctx.stroke();

    const hW = 5.5 * s;
    const hH = 40 * s;
    ctx.beginPath();
    ctx.roundRect(forkX - hW, forkTopY + 140 * s, hW * 2, hH, 4 * s);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Knife (left side)
    const knifeX = cx - 141 * s;
    const knifeTopY = cy - 110 * s;

    ctx.beginPath();
    ctx.lineWidth = 4;
    ctx.moveTo(knifeX - 8 * s, knifeTopY);
    ctx.lineTo(knifeX - 8 * s, knifeTopY + 90 * s);
    ctx.lineTo(knifeX + 8 * s, knifeTopY + 90 * s);
    ctx.quadraticCurveTo(knifeX + 8 * s, knifeTopY + 20 * s, knifeX - 8 * s, knifeTopY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(knifeX, knifeTopY + 90 * s);
    ctx.lineTo(knifeX, knifeTopY + 140 * s);
    ctx.lineWidth = 4.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(knifeX - hW, knifeTopY + 140 * s, hW * 2, hH, 4 * s);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Radiating lines
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    const lineLen = 16 * s;
    const lineOffset = 108 * s;
    const angles = [-Math.PI / 4, -3 * Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];

    for (const angle of angles) {
      const x1 = cx + Math.cos(angle) * lineOffset;
      const y1 = cy + Math.sin(angle) * lineOffset;
      const x2 = cx + Math.cos(angle) * (lineOffset + lineLen);
      const y2 = cy + Math.sin(angle) * (lineOffset + lineLen);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.lineWidth = 2.5;
    const shortLen = 10 * s;
    const shortAngles = [-Math.PI / 8, -7 * Math.PI / 8, Math.PI / 8, 7 * Math.PI / 8];
    for (const angle of shortAngles) {
      const x1 = cx + Math.cos(angle) * (lineOffset + 4 * s);
      const y1 = cy + Math.sin(angle) * (lineOffset + 4 * s);
      const x2 = cx + Math.cos(angle) * (lineOffset + 4 * s + shortLen);
      const y2 = cy + Math.sin(angle) * (lineOffset + 4 * s + shortLen);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
    resolve(canvas.toDataURL("image/png"));
  });
}