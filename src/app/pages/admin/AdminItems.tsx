import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Image as ImageIcon, Loader2, Scale, Upload, Tag, X, Info, Apple, Sparkles, Wand2, Check } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { toast } from "sonner";
import { MenuItem } from "../../types";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useForm } from "react-hook-form";

const DEFAULT_UNITS = ["porção", "unidade", "fatia", "copo", "ml", "g", "kg", "filé", "concha", "colher"];
const KITCHEN_UNITS = [
  { value: "kg", label: "Quilogramas (kg)" },
  { value: "l", label: "Litros (L)" },
  { value: "un", label: "Unidades (un)" },
];

const PAGE_SIZE = 20;

export function AdminItems() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<{ original: string, current: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [autoImaging, setAutoImaging] = useState(false);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);

  const [notifyChange, setNotifyChange] = useState(false);
  const [measurementUnits, setMeasurementUnits] = useState<string[]>(DEFAULT_UNITS);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [editUnitRestrictions, setEditUnitRestrictions] = useState<string[]>([]);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<MenuItem>();
  const watchedImage = watch("image");
  const watchedName = watch("name");
  const watchedDescription = watch("description");

  useEffect(() => { fetchAll(); }, []);

  // Sync watchedImage to imagePreview for URL paste support
  useEffect(() => {
    if (watchedImage && watchedImage !== imagePreview) {
      setImagePreview(watchedImage);
      setPreviewLoadFailed(false);
    }
  }, [watchedImage]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [itemsData, catsData, settingsData] = await Promise.all([
        api.get("/menu"),
        api.get("/categories"),
        api.get("/admin/settings"),
      ]);
      if (Array.isArray(itemsData)) setItems(itemsData);
      if (Array.isArray(catsData)) setCategories(catsData);
      if (settingsData?.measurementUnits && Array.isArray(settingsData.measurementUnits)) {
        setMeasurementUnits(settingsData.measurementUnits);
      }
      // Load available units for restriction selector
      const rawUnits = settingsData?.units;
      if (Array.isArray(rawUnits) && rawUnits.length > 0) {
        setAvailableUnits(rawUnits.map((u: any) => typeof u === "string" ? u : u.name));
      } else {
        setAvailableUnits(["Sede Damasceno", "Sede Taipas", "Externo (Marmita)"]);
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editingItem) {
      reset(editingItem);
      setImagePreview(editingItem.image || "");
      setNotifyChange(false);
      setPreviewLoadFailed(false);
      setAiImageLoading(false);
      setImageLoadError(false);
      setEditUnitRestrictions(editingItem.unitRestrictions || []);
    } else {
      reset({
        name: "", description: "", category: categories[0] || "Principal",
        calories: 0, image: "", available: 100, limit: 1, unit: "unidade",
        portionWeight: 0, kitchenUnit: "kg",
        protein: 0, carbs: 0, fat: 0, fiber: 0, tip: "", recipe: ""
      });
      setImagePreview("");
      setPreviewLoadFailed(false);
      setAiImageLoading(false);
      setImageLoadError(false);
      setEditUnitRestrictions([]);
    }
  // ⚠️ categories removido das deps: ter categories aqui causava reset
  // do formulário toda vez que uma categoria era adicionada/removida,
  // apagando a seleção do usuário enquanto o modal estava aberto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, reset]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = await api.upload("/admin/upload", file);
      setValue("image", data.url);
      setImagePreview(data.url);
      toast.success("Imagem enviada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const handleAutoImage = async () => {
    if (!watchedName) {
      toast.error("Por favor, preencha o nome do prato primeiro!");
      return;
    }
    
    setAiImageLoading(true);
    setImageLoadError(false);
    setPreviewLoadFailed(false);
    toast.info("Gerando imagem com IA... Aguarde alguns segundos.");

    try {
      const result = await api.authPost("/admin/generate-ai-image", { 
        dishName: watchedName,
        description: watchedDescription 
      });
      if (result.url) {
        setValue("image", result.url);
        setImagePreview(result.url);
        setImageLoadError(false);
        const providerLabel = result.provider === "pollinations" ? "IA (Pollinations)" 
          : result.provider === "loremflickr" ? "LoremFlickr (foto real)" 
          : "IA";
        toast.success(`Imagem gerada via ${providerLabel} com sucesso!`);
      } else {
        throw new Error("URL da imagem não retornada.");
      }
    } catch (err: any) {
      console.error("[AI Image] Error:", err);
      setImageLoadError(true);
      toast.error(err.message || "Erro ao gerar imagem. Tente novamente.");
    } finally {
      setAiImageLoading(false);
    }
  };

  const onSubmit = async (data: MenuItem) => {
    setSaving(true);
    try {
      const payload = { ...data, unitRestrictions: editUnitRestrictions };
      if (editingItem) {
        await api.authPut(`/menu/${editingItem.id}`, payload);
        setItems(items.map(i => i.id === editingItem.id ? { ...i, ...payload } : i));
        
        if (notifyChange) {
            await api.authPost("/notifications", {
                title: "Alteração no Item",
                message: `O item "${data.name}" sofreu alterações importantes. Confira no cardápio!`,
                type: "info",
                targetUserId: "all"
            });
        }
        
        toast.success("Item atualizado!");
      } else {
        const newItem = await api.authPost("/menu", payload);
        setItems([...items, newItem]);
        toast.success("Item criado!");
      }
      setIsModalOpen(false);
      setEditingItem(null);
      setNotifyChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.authDel(`/menu/${deleteTarget}`);
      setItems(items.filter(i => i.id !== deleteTarget));
      toast.success("Item excluído.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const result = await api.authPost("/categories", { name: newCatName.trim() });
      setCategories(result);
      setNewCatName("");
      toast.success("Categoria adicionada!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Isso irá SUBSTITUIR todos os itens atuais. Deseja continuar?")) {
      e.target.value = "";
      return;
    }

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const csv = event.target?.result as string;
      try {
        const result = await api.authPost("/admin/menu/import-csv", { csv });
        console.log('[CSV Import] Result:', result);
        if (result.sampleItem) console.log('[CSV Import] Sample item:', JSON.stringify(result.sampleItem, null, 2));
        toast.success(`${result.count} itens importados com sucesso!`);
        fetchAll();
      } catch (err: any) {
        toast.error(err.message || "Erro na importação.");
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleSaveCategory = async () => {
    if (!editingCat || !editingCat.current.trim()) return;
    try {
      const result = await api.authPut(`/categories/${encodeURIComponent(editingCat.original)}`, { 
        newName: editingCat.current 
      });
      setCategories(result);
      
      // Update local items state if any items were affected
      setItems(prevItems => prevItems.map(item => {
        if (item.category === editingCat.original) {
          return { ...item, category: editingCat.current.trim() };
        }
        return item;
      }));

      setEditingCat(null);
      toast.success("Categoria atualizada!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar categoria");
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCatTarget) return;
    try {
      const result = await api.authDel(`/categories/${encodeURIComponent(deleteCatTarget)}`);
      setCategories(result);
      toast.success("Categoria removida.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteCatTarget(null);
    }
  };

  const handleBulkAutoImage = async () => {
    const itemsWithoutImage = items.filter(item => !item.image);
    
    if (itemsWithoutImage.length === 0) {
      toast.info("Todos os itens já possuem imagem!");
      return;
    }

    if (!confirm(`Deseja gerar imagens para ${itemsWithoutImage.length} itens sem imagem? Cada imagem leva ~10-30s. Total estimado: ~${Math.ceil(itemsWithoutImage.length * 20 / 60)} min.`)) {
      return;
    }

    setAutoImaging(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of itemsWithoutImage) {
      try {
        toast.info(`Gerando imagem para "${item.name}"... (${successCount + failCount + 1}/${itemsWithoutImage.length})`);
        
        const result = await api.authPost("/admin/generate-ai-image", { dishName: item.name, description: item.description });
        
        if (result.url) {
          const updatedItem = { ...item, image: result.url };
          await api.authPut(`/menu/${item.id}`, updatedItem);
          setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i));
          successCount++;
        } else {
          throw new Error("URL não retornada");
        }
      } catch (err: any) {
        console.error(`Erro ao gerar imagem para ${item.name}`, err);
        failCount++;
      }
    }

    setAutoImaging(false);
    
    if (successCount > 0) {
      toast.success(`${successCount} imagens geradas e salvas com sucesso!`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} falhas ao gerar imagens.`);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "Todas" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const paginatedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchQuery, selectedCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Itens</h1>
          <p className="text-muted-foreground text-sm">Catálogo de produtos, categorias e disponibilidade.</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={importing} />
            
          </label>
          
          <Button variant="outline" onClick={() => setIsCatModalOpen(true)} className="gap-2">
            <Tag size={16} /> Categorias
          </Button>
          <Button onClick={() => { setEditingItem(null); setNotifyChange(false); setIsModalOpen(true); }} className="gap-2">
            <Plus size={16} /> Novo Item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-xl shadow-sm border border-border">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text" placeholder="Buscar por nome..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input text-sm focus:ring-2 focus:ring-primary/20 outline-none bg-background text-foreground"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <button onClick={() => setSelectedCategory("Todas")}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
              selectedCategory === "Todas" ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:bg-accent"
            )}>Todas</button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
                selectedCategory === cat ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-accent"
              )}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Mobile: Card layout */}
            <div className="md:hidden divide-y divide-border">
              {paginatedItems.map((item) => (
                <div key={item.id} className="p-4 flex gap-3">
                  <div className="h-14 w-14 rounded-lg bg-muted overflow-hidden flex-shrink-0 border">
                    {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-muted-foreground"><ImageIcon size={16} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground truncate">{item.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] h-5">{item.category}</Badge>
                      <span className="text-xs text-muted-foreground">{item.calories} kcal</span>
                      <span className="text-xs font-bold text-muted-foreground">Lmt: {item.limit} un.</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingItem(item); setIsModalOpen(true); }}>
                      <Edit2 size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(item.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-accent text-muted-foreground uppercase font-medium text-xs">
                  <tr>
                    <th className="px-6 py-4">Item</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Calorias / Conv.</th>
                    <th className="px-6 py-4 text-center">Limite / Pessoa</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-accent/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0 border">
                            {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-muted-foreground"><ImageIcon size={16} /></div>}
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{item.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{item.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><Badge variant="outline" className="font-normal">{item.category}</Badge></td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-xs">
                          <span className="font-medium text-foreground">{item.calories} kcal</span>
                          {item.portionWeight ? (
                            <span className="text-muted-foreground flex items-center gap-1"><Scale size={10} />{item.portionWeight}{item.unit} &rarr; {item.kitchenUnit}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Sem conversão</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-bold text-foreground">{item.limit}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">un.</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600" onClick={() => { setEditingItem(item); setIsModalOpen(true); }}>
                            <Edit2 size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600" onClick={() => setDeleteTarget(item.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredItems.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">Nenhum item encontrado.</div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <span className="text-sm text-muted-foreground">
                  {filteredItems.length} itens • Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Item Modal */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setEditingItem(null);
            setNotifyChange(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[650px] w-[95vw] max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl">{editingItem ? "Editar Item" : "Novo Item"}</DialogTitle>
            <DialogDescription className="text-xs">Preencha os campos para {editingItem ? "atualizar" : "criar"} o item.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Prato</Label>
                <Input {...register("name", { required: true })} placeholder="Ex: Frango Grelhado" className="h-9 text-sm" />
                {errors.name && <span className="text-[10px] text-destructive">Obrigatório</span>}
              </div>
              
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Descrição</Label>
                <textarea className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Ingredientes e detalhes..." {...register("description")} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Categoria</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:ring-1 focus:ring-ring" {...register("category")}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Calorias (kcal)</Label>
                <Input type="number" {...register("calories", { valueAsNumber: true, min: 0 })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Limite por Pessoa</Label>
                <Input type="number" {...register("limit", { valueAsNumber: true, min: 1 })} className="h-9 text-sm" />
              </div>

              {/* Image Upload */}
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Imagem</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                      <Input {...register("image")} placeholder="URL da imagem..." className="h-9 text-sm pr-8" />
                      {watchedImage && (
                        <button 
                          type="button" 
                          onClick={() => { setValue("image", ""); setImagePreview(""); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {(imagePreview || watchedImage) && !previewLoadFailed && (
                      <div className="h-9 w-9 rounded border overflow-hidden shrink-0 bg-muted">
                        <img 
                          src={imagePreview || watchedImage} 
                          alt="preview" 
                          className="h-full w-full object-cover"
                          onError={() => setPreviewLoadFailed(true)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="flex-1 sm:flex-none h-9 gap-1.5 px-3 text-xs"
                      onClick={handleAutoImage}
                      disabled={aiImageLoading}
                    >
                      {aiImageLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                      Gerar IA
                    </Button>
                    <label className="flex-1 sm:flex-none cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      <div className={cn("flex items-center justify-center gap-1.5 h-9 px-3 border rounded-md text-xs font-medium hover:bg-accent transition-colors", uploading && "opacity-50 pointer-events-none")}>
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        Upload
                      </div>
                    </label>
                  </div>
                </div>
                {aiImageLoading && (
                  <div className="flex items-center gap-2 py-1.5 px-2 bg-indigo-50/50 dark:bg-indigo-900/10 rounded border border-indigo-100 dark:border-indigo-800/50">
                    <Loader2 size={12} className="animate-spin text-indigo-600" />
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-400">Gerando imagem... (pode levar 20s)</span>
                  </div>
                )}
              </div>

              <div className="col-span-2 border-t pt-3 mt-1">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-2 text-muted-foreground uppercase tracking-wider"><Scale size={14} /> Porção e Cozinha</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-accent/20 p-3 rounded-lg border border-border">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Unidade (Cardápio)</Label>
                    <select className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs" {...register("unit")}>
                      {measurementUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Peso/Vol. Porção</Label>
                    <Input type="number" step="0.01" {...register("portionWeight", { valueAsNumber: true })} placeholder="150" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5 col-span-2 md:col-span-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Unidade (Cozinha)</Label>
                    <select className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs" {...register("kitchenUnit")}>
                      {KITCHEN_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Nutritional Info */}
              <div className="col-span-2 border-t pt-3 mt-1">
                <h4 className="text-xs font-bold mb-2 flex items-center gap-2 text-muted-foreground uppercase tracking-wider"><Apple size={14} /> Informações Nutricionais</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-green-50/30 dark:bg-green-900/5 p-3 rounded-lg border border-green-100 dark:border-green-800/20">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Prot. (g)</Label>
                    <Input type="number" step="0.1" {...register("protein", { valueAsNumber: true })} placeholder="0" className="h-8 text-xs bg-white/50 dark:bg-black/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Carb. (g)</Label>
                    <Input type="number" step="0.1" {...register("carbs", { valueAsNumber: true })} placeholder="0" className="h-8 text-xs bg-white/50 dark:bg-black/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Gord. (g)</Label>
                    <Input type="number" step="0.1" {...register("fat", { valueAsNumber: true })} placeholder="0" className="h-8 text-xs bg-white/50 dark:bg-black/20" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-green-700 dark:text-green-400 uppercase">Fibras (g)</Label>
                    <Input type="number" step="0.1" {...register("fiber", { valueAsNumber: true })} placeholder="0" className="h-8 text-xs bg-white/50 dark:bg-black/20" />
                  </div>
                </div>
              </div>

              {/* Dica */}
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-2"><Info size={14} /> Dica</Label>
                <textarea className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Ex: Combina bem com arroz integral..." {...register("tip")} />
              </div>

              {/* Receita */}
              <div className="col-span-2 border-t pt-3 mt-1 space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-500" /> Receita / Modo de Preparo
                </Label>
                <textarea
                  className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Descreva os ingredientes e o modo de preparo..."
                  {...register("recipe")}
                />
              </div>

              {/* Restrição por Unidade */}
              <div className="col-span-2 border-t pt-3 mt-1 space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-2">
                  <Tag size={14} className="text-blue-500" /> Visibilidade por Unidade
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Selecione as unidades onde este item será exibido. Sem seleção = aparece em <strong>todas</strong> as unidades.
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableUnits.map(unit => {
                    const isSelected = editUnitRestrictions.includes(unit);
                    return (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => setEditUnitRestrictions(prev =>
                          isSelected ? prev.filter(u => u !== unit) : [...prev, unit]
                        )}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-card text-muted-foreground border-border hover:bg-accent"
                        )}
                      >
                        {isSelected ? <Check size={10} className="inline mr-1" /> : null}
                        {unit}
                      </button>
                    );
                  })}
                  {editUnitRestrictions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditUnitRestrictions([])}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-destructive hover:border-destructive transition-all"
                    >
                      <X size={10} className="inline mr-1" /> Limpar (todas)
                    </button>
                  )}
                </div>
                {editUnitRestrictions.length > 0 && (
                  <p className="text-[10px] text-primary font-medium">
                    Restrito a: {editUnitRestrictions.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {editingItem && (
                <div className="flex items-center gap-2 pt-1">
                    <input 
                        type="checkbox" 
                        id="notifyChange" 
                        checked={notifyChange} 
                        onChange={(e) => setNotifyChange(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary/20 h-4 w-4"
                    />
                    <label htmlFor="notifyChange" className="text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        Notificar usuários sobre alteração importante
                    </label>
                </div>
            )}

            <DialogFooter className="flex-row gap-2 mt-2 sm:mt-4">
              <Button type="button" variant="ghost" className="flex-1 sm:flex-none h-10 text-xs" onClick={() => { setIsModalOpen(false); setEditingItem(null); setNotifyChange(false); }}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="flex-1 sm:flex-none h-10 gap-2 text-xs">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingItem ? "Atualizar" : "Salvar"} Item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Categories Modal */}
      <Dialog open={isCatModalOpen} onOpenChange={(open) => { setIsCatModalOpen(open); if (!open) setEditingCat(null); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
            <DialogDescription>Adicione, renomeie ou remova categorias de itens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Nova categoria..." 
                value={newCatName} 
                onChange={(e) => setNewCatName(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())} 
              />
              <Button onClick={handleAddCategory} size="sm"><Plus size={16} /></Button>
            </div>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {categories.map(cat => {
                const itemCount = items.filter(i => i.category === cat).length;
                const isEditing = editingCat?.original === cat;
                
                return (
                  <div key={cat} className={cn(
                    "flex items-center justify-between p-2 rounded-lg border transition-colors",
                    isEditing ? "bg-primary/5 border-primary" : "bg-accent/30 border-border/50"
                  )}>
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 w-full">
                        <Input 
                          value={editingCat.current} 
                          onChange={(e) => setEditingCat({ ...editingCat, current: e.target.value })}
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCategory();
                            if (e.key === 'Escape') setEditingCat(null);
                          }}
                        />
                        <Button size="sm" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleSaveCategory}>
                          <Check size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setEditingCat(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{cat}</span>
                            {itemCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-muted text-muted-foreground font-normal">
                                    {itemCount} itens
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => setEditingCat({ original: cat, current: cat })} 
                            className="text-muted-foreground hover:text-primary p-1.5 rounded-md hover:bg-background transition-colors"
                            title="Renomear"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => setDeleteCatTarget(cat)} 
                            className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-background transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Excluir Item?"
        description="Esta ação não pode ser desfeita. O item será removido permanentemente do catálogo."
        confirmLabel="Sim, Excluir"
        variant="destructive"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={!!deleteCatTarget}
        onOpenChange={() => setDeleteCatTarget(null)}
        title={`Excluir categoria "${deleteCatTarget}"?`}
        description="Itens existentes com esta categoria não serão afetados."
        confirmLabel="Sim, Excluir"
        variant="destructive"
        onConfirm={handleDeleteCategory}
      />
    </div>
  );
}