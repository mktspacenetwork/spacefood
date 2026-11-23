import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Save, X, Image as ImageIcon, Upload, ToggleLeft, ToggleRight, Layout } from "lucide-react";
import { Button } from "../../components/ui/Button";

interface Banner {
  id: string;
  imageUrl: string;
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

export function AdminBanners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Banner>>({});
  const [uploading, setUploading] = useState(false);
  
  // Use settings to control global carousel visibility + available units
  const [settings, setSettings] = useState<{ showBannerCarousel?: boolean; units?: any[] }>({});
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);

  useEffect(() => {
    fetchBanners();
    fetchSettings();
  }, []);

  const fetchBanners = async () => {
    setLoading(true);
    try {
      const data = await api.authGet("/admin/banners");
      if (Array.isArray(data)) setBanners(data);
    } catch (e) {
      toast.error("Erro ao carregar banners");
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await api.authGet("/admin/settings");
      setSettings(data || {});
      if (Array.isArray(data?.units)) {
        const names = data.units.map((u: any) => typeof u === "string" ? u : u.name).filter(Boolean);
        setAvailableUnits(names);
      }
    } catch (e) {
      console.error("Failed to load settings");
    }
  };

  const toggleCarouselVisibility = async () => {
    // Treat undefined as true (default visible)
    const currentValue = settings.showBannerCarousel !== false;
    const newValue = !currentValue;
    try {
      await api.authPost("/admin/settings", { ...settings, showBannerCarousel: newValue });
      setSettings({ ...settings, showBannerCarousel: newValue });
      toast.success(newValue ? "Carrossel ativado na home" : "Carrossel desativado na home");
    } catch (e) {
      toast.error("Erro ao atualizar configuração");
    }
  };

  const handleSave = async () => {
    // Basic validation
    if (!formData.imageUrl && !formData.backgroundColor) {
      toast.error("É necessário uma imagem ou uma cor de fundo.");
      return;
    }

    try {
      await api.authPost("/admin/banners", {
        ...formData,
        id: editingId === "new" ? undefined : editingId,
        active: formData.active ?? true,
        order: formData.order ?? banners.length,
        unitRestrictions: formData.unitRestrictions || [],
      });
      toast.success("Banner salvo!");
      setEditingId(null);
      setFormData({});
      fetchBanners();
    } catch (e) {
      toast.error("Erro ao salvar banner");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este banner?")) return;
    try {
      await api.authDel(`/admin/banners/${id}`);
      toast.success("Banner excluído");
      setBanners(banners.filter((b) => b.id !== id));
    } catch (e) {
      toast.error("Erro ao excluir banner");
    }
  };

  const startEdit = (banner?: Banner) => {
    if (banner) {
      setEditingId(banner.id);
      setFormData(banner);
    } else {
      setEditingId("new");
      setFormData({ 
        active: true, 
        order: banners.length, 
        backgroundColor: "#ff5a1f", 
        textColor: "#ffffff",
        buttonText: "Confira"
      });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading("Enviando imagem...");

    try {
      const res = await api.upload("/admin/upload", file);
      
      if (res.url) {
        setFormData(prev => ({ ...prev, imageUrl: res.url }));
        toast.success("Imagem enviada com sucesso!");
      } else {
        throw new Error("URL não retornada pelo servidor");
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
      toast.dismiss(toastId);
      e.target.value = "";
    }
  };

  const gradientPresets = [
    "linear-gradient(to right, #ff512f, #dd2476)",
    "linear-gradient(to right, #4facfe, #00f2fe)",
    "linear-gradient(to right, #43e97b, #38f9d7)",
    "linear-gradient(to right, #fa709a, #fee140)",
    "linear-gradient(to right, #89f7fe, #66a6ff)",
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  ];

  const showCarousel = settings.showBannerCarousel !== false;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gerenciar Banners</h1>
          <p className="text-muted-foreground text-sm">Personalize o carrossel da página inicial</p>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
           <button
            onClick={toggleCarouselVisibility}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
              showCarousel 
                ? "bg-green-100 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300" 
                : "bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"
            }`}
          >
            {showCarousel ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
            <span className="text-sm font-medium">
              {showCarousel ? "Carrossel Visível" : "Carrossel Oculto"}
            </span>
          </button>

          <Button onClick={() => startEdit()}>
            <Plus size={16} className="mr-2" />
            Novo Banner
          </Button>
        </div>
      </div>

      {!showCarousel && (
        <div className="p-4 bg-orange-50 border border-orange-200 text-orange-800 rounded-xl flex items-center gap-3">
          <Layout size={20} />
          <p className="text-sm">O carrossel está oculto na página inicial. Ative-o acima para exibir os banners.</p>
        </div>
      )}

      {editingId && (
        <div className="bg-card border rounded-xl p-6 space-y-4 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h2 className="text-lg font-semibold">{editingId === "new" ? "Novo Banner" : "Editar Banner"}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Imagem do Banner</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={formData.imageUrl || ""}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    className="flex-1 p-2 border rounded-lg bg-background text-sm"
                    placeholder="https://..."
                  />
                  <div className="relative">
                    <input
                      type="file"
                      id="banner-upload"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploading}
                    />
                    <label 
                      htmlFor="banner-upload"
                      className={`flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg cursor-pointer hover:bg-secondary/80 transition-colors text-sm font-medium ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <Upload size={16} />
                      {uploading ? '...' : 'Upload'}
                    </label>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Cole uma URL ou faça upload.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Título</label>
                <input
                  type="text"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-background"
                  placeholder="Ex: Oferta Especial"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Descrição</label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-background"
                  placeholder="Ex: Aproveite nossos preços..."
                  rows={3}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Link de Destino</label>
                <input
                  type="text"
                  value={formData.link || ""}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-background"
                  placeholder="https://... ou /cart"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fundo (Cor ou Degradê)</label>
                <div className="flex gap-2">
                  <div className="relative">
                    <input
                      type="color"
                      value={formData.backgroundColor?.startsWith('#') ? formData.backgroundColor : "#ff5a1f"}
                      onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                      className="h-10 w-12 p-0 border-0 rounded overflow-hidden cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={formData.backgroundColor || ""}
                    onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
                    className="flex-1 p-2 border rounded-lg bg-background text-sm font-mono"
                    placeholder="#RRGGBB ou linear-gradient(...)"
                  />
                </div>
                {/* Gradient Presets */}
                <div className="flex gap-1 flex-wrap mt-1">
                  {gradientPresets.map((grad, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFormData({ ...formData, backgroundColor: grad })}
                      className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform shadow-sm"
                      style={{ background: grad }}
                      title="Aplicar degradê"
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cor do Texto</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={formData.textColor || "#ffffff"}
                      onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                      className="h-10 w-12 p-0 border-0 rounded overflow-hidden cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.textColor || ""}
                      onChange={(e) => setFormData({ ...formData, textColor: e.target.value })}
                      className="flex-1 p-2 border rounded-lg bg-background text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Texto do Botão</label>
                  <input
                    type="text"
                    value={formData.buttonText || ""}
                    onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-background"
                    placeholder="Ex: Peça já"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 border-t mt-4">
             <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={formData.active ?? true}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 accent-primary"
              />
              <span className="text-sm font-medium">Banner Ativo</span>
            </label>
             <label className="flex items-center gap-2">
              <span className="text-sm font-medium">Ordem:</span>
              <input
                type="number"
                value={formData.order || 0}
                onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                className="w-20 p-1 border rounded-lg bg-background"
              />
            </label>
          </div>

          {availableUnits.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-sm font-medium">Exibir para (unidades):</p>
              <p className="text-xs text-muted-foreground">Deixe todas desmarcadas para exibir em todas as unidades.</p>
              <div className="flex flex-wrap gap-3">
                {availableUnits.map((unit) => {
                  const checked = (formData.unitRestrictions || []).includes(unit);
                  return (
                    <label key={unit} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const current = formData.unitRestrictions || [];
                          const updated = e.target.checked
                            ? [...current, unit]
                            : current.filter(u => u !== unit);
                          setFormData({ ...formData, unitRestrictions: updated });
                        }}
                        className="w-4 h-4 rounded border-gray-300 accent-primary"
                      />
                      <span className="text-sm">{unit}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              <Save size={16} className="mr-2" />
              Salvar
            </Button>
          </div>

          {/* Preview Area */}
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium mb-2 text-muted-foreground">Pré-visualização (Aproximada):</p>
            <div 
              className="relative w-full h-48 sm:h-56 rounded-3xl overflow-hidden flex items-center shadow-lg transition-all"
              style={{ background: formData.backgroundColor || '#f3f4f6' }}
            >
              {formData.imageUrl && (
                <img 
                  src={formData.imageUrl} 
                  alt="Preview" 
                  className={`absolute right-0 top-0 h-full w-full object-cover transition-opacity duration-300 ${
                    (formData.title || formData.description) ? 'mask-image-linear-to-l opacity-90' : ''
                  }`}
                  style={{ 
                    objectPosition: (formData.title || formData.description) ? 'center right' : 'center',
                    maskImage: (formData.title || formData.description) ? 'linear-gradient(to right, transparent 0%, black 60%)' : 'none',
                    WebkitMaskImage: (formData.title || formData.description) ? 'linear-gradient(to right, transparent 0%, black 60%)' : 'none'
                  }}
                />
              )}
              
              {(formData.title || formData.description || formData.buttonText) && (
                <div className="relative z-10 p-8 max-w-[70%] flex flex-col gap-2 items-start" style={{ color: formData.textColor || '#000' }}>
                  {formData.title && <h3 className="text-3xl font-extrabold leading-tight drop-shadow-sm">{formData.title}</h3>}
                  {formData.description && <p className="text-base font-medium opacity-90 drop-shadow-sm">{formData.description}</p>}
                  {formData.buttonText && (
                    <span 
                      className="mt-2 px-5 py-2 rounded-full text-xs font-bold shadow-md inline-block"
                      style={{ 
                        backgroundColor: formData.textColor || '#000', 
                        color: formData.backgroundColor?.includes('gradient') ? '#fff' : (formData.backgroundColor || '#fff')
                      }}
                    >
                      {formData.buttonText}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {banners.map((banner) => (
          <div key={banner.id} className={`group border rounded-2xl overflow-hidden bg-card transition-all hover:shadow-md ${!banner.active ? 'opacity-60 grayscale' : ''}`}>
            <div 
              className="h-32 bg-muted relative flex items-center overflow-hidden"
              style={{ background: banner.backgroundColor }}
            >
              {banner.imageUrl && (
                <img src={banner.imageUrl} alt="" className="absolute right-0 top-0 h-full w-2/3 object-cover mask-image-linear-to-l opacity-80" style={{
                   maskImage: 'linear-gradient(to right, transparent 0%, black 70%)',
                   WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 70%)'
                }} />
              )}
              <div className="relative z-10 p-4 max-w-[70%]" style={{ color: banner.textColor }}>
                <p className="font-bold text-lg leading-tight truncate">{banner.title || "(Sem título)"}</p>
                <p className="text-xs opacity-80 line-clamp-2">{banner.description}</p>
              </div>
              
              {!banner.active && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold z-20 backdrop-blur-[1px]">
                  INATIVO
                </div>
              )}
            </div>
            
            <div className="p-3 flex items-center justify-between bg-card/50">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                   <span className={`w-2 h-2 rounded-full ${banner.active ? 'bg-green-500' : 'bg-red-500'}`} />
                   <span className="text-xs text-muted-foreground font-medium">{banner.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Ordem: {banner.order}</span>
                {banner.unitRestrictions && banner.unitRestrictions.length > 0 ? (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                    🏢 {banner.unitRestrictions.join(", ")}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Todas as unidades</span>
                )}
              </div>
              
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => startEdit(banner)} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                  <Edit size={15} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(banner.id)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {banners.length === 0 && !loading && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground bg-accent/20 rounded-2xl border border-dashed border-border/60">
            <ImageIcon size={48} className="opacity-20 mb-4" />
            <p className="font-medium">Nenhum banner cadastrado</p>
            <p className="text-sm opacity-60 mt-1">Clique em "Novo Banner" para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}