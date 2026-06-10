import { useState, useEffect, useRef } from "react";
import { Clock, Shield, Save, Store, Loader2, Eye, EyeOff, Trash2, Plus, Ruler, Edit2, Check, X, BookOpen, AlertCircle, ShoppingBag, Lock, Utensils, Beef, Package, Calendar, Star, Building2, Bell, RefreshCw, Users, Egg, UtensilsCrossed, GripVertical, Smartphone, Upload, ImageIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { SkeletonSettings } from "../../components/ui/SkeletonCard";

const DEFAULT_MEASUREMENT_UNITS = ["porção", "unidade", "fatia", "copo", "ml", "g", "kg", "filé", "concha", "colher"];

interface CompanyUnit {
  name: string;
  allowOrders: boolean;
}

export function AdminSettings() {
  const [cutoffTime, setCutoffTime] = useState("10:30");
  const [openingTime, setOpeningTime] = useState("15:00");
  const [unitName, setUnitName] = useState("Unidade Central - Damasceno");
  const [allowAdvanceOrders, setAllowAdvanceOrders] = useState(true);
  const [allowLateRating, setAllowLateRating] = useState(true);
  const [institutionalMessage, setInstitutionalMessage] = useState("");
  
  // Units state (company units)
  const [units, setUnits] = useState<CompanyUnit[]>([]);
  const [newUnit, setNewUnit] = useState("");

  // Measurement units state
  const [measurementUnits, setMeasurementUnits] = useState<string[]>(DEFAULT_MEASUREMENT_UNITS);
  const [newMeasurementUnit, setNewMeasurementUnit] = useState("");
  const [editingMeasurementIdx, setEditingMeasurementIdx] = useState<number | null>(null);
  const [editingMeasurementValue, setEditingMeasurementValue] = useState("");
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const dragUnitIdx = useRef<number | null>(null);
  const dragOverUnitIdx = useRef<number | null>(null);

  // PWA Icon state
  const [pwaIconUrl, setPwaIconUrl] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [removingIcon, setRemovingIcon] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const settings = await api.get("/admin/settings");
      if (settings.cutoffTime) setCutoffTime(settings.cutoffTime);
      if (settings.openingTime) setOpeningTime(settings.openingTime);
      if (settings.unitName) setUnitName(settings.unitName);
      if (settings.units) {
        const raw = settings.units;
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
          // Backward compat: old string[] format
          setUnits(raw.map((u: string) => ({ name: u, allowOrders: true })));
        } else if (Array.isArray(raw)) {
          setUnits(raw);
        }
      }
      if (settings.measurementUnits) setMeasurementUnits(Array.isArray(settings.measurementUnits) ? settings.measurementUnits : DEFAULT_MEASUREMENT_UNITS);
      if (settings.allowAdvanceOrders !== undefined) setAllowAdvanceOrders(settings.allowAdvanceOrders);
      if (settings.allowLateRating !== undefined) setAllowLateRating(settings.allowLateRating);
      if (settings.institutionalMessage !== undefined) setInstitutionalMessage(settings.institutionalMessage);
      if (settings.pwaIconUrl) setPwaIconUrl(settings.pwaIconUrl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.authPost("/admin/settings", {
        cutoffTime,
        openingTime,
        unitName, 
        units,
        measurementUnits,
        allowAdvanceOrders, 
        allowLateRating, 
        institutionalMessage
      });
      toast.success("Configurações salvas!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const addUnit = () => {
    if (!newUnit.trim()) return;
    if (units.some(u => u.name === newUnit.trim())) {
      toast.error("Unidade já existe");
      return;
    }
    setUnits([...units, { name: newUnit.trim(), allowOrders: true }]);
    setNewUnit("");
  };

  const removeUnit = (name: string) => {
    setUnits(units.filter(u => u.name !== name));
  };

  const toggleUnitOrders = (name: string) => {
    setUnits(units.map(u => u.name === name ? { ...u, allowOrders: !u.allowOrders } : u));
  };

  // Measurement unit CRUD
  const addMeasurementUnit = () => {
    const val = newMeasurementUnit.trim().toLowerCase();
    if (!val) return;
    if (measurementUnits.some(u => u.toLowerCase() === val)) {
      toast.error("Essa unidade de medida já existe.");
      return;
    }
    setMeasurementUnits([...measurementUnits, val]);
    setNewMeasurementUnit("");
    toast.success(`"${val}" adicionada. Salve para aplicar.`);
  };

  const removeMeasurementUnit = (idx: number) => {
    const removed = measurementUnits[idx];
    setMeasurementUnits(measurementUnits.filter((_, i) => i !== idx));
    toast.success(`"${removed}" removida. Salve para aplicar.`);
  };

  const startEditMeasurement = (idx: number) => {
    setEditingMeasurementIdx(idx);
    setEditingMeasurementValue(measurementUnits[idx]);
  };

  const confirmEditMeasurement = () => {
    if (editingMeasurementIdx === null) return;
    const val = editingMeasurementValue.trim().toLowerCase();
    if (!val) {
      toast.error("O nome não pode ser vazio.");
      return;
    }
    if (measurementUnits.some((u, i) => i !== editingMeasurementIdx && u.toLowerCase() === val)) {
      toast.error("Essa unidade de medida já existe.");
      return;
    }
    const updated = [...measurementUnits];
    updated[editingMeasurementIdx] = val;
    setMeasurementUnits(updated);
    setEditingMeasurementIdx(null);
    setEditingMeasurementValue("");
    toast.success("Unidade editada. Salve para aplicar.");
  };

  const cancelEditMeasurement = () => {
    setEditingMeasurementIdx(null);
    setEditingMeasurementValue("");
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem (PNG, JPG, SVG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (max 5MB).");
      return;
    }
    setUploadingIcon(true);
    try {
      const result = await api.upload("/admin/pwa-icon", file);
      if (result?.url) {
        setPwaIconUrl(result.url);
        toast.success("Icone do app atualizado! Recarregue o app para aplicar.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar icone.");
    } finally {
      setUploadingIcon(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  };

  const handleRemoveIcon = async () => {
    setRemovingIcon(true);
    try {
      await api.authDel("/admin/pwa-icon");
      setPwaIconUrl(null);
      toast.success("Icone removido. O app voltara ao icone padrao.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover icone.");
    } finally {
      setRemovingIcon(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-muted-foreground text-xs">Regras operacionais, horários e unidades.</p>
      </div>

      {loading ? (
        <SkeletonSettings />
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        {/* Identidade */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2"><Store className="h-4 w-4 text-primary" /><CardTitle className="text-sm">Identidade da Unidade Principal</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome da Unidade</Label>
                <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mensagem Institucional (Banner)</Label>
                <textarea className="flex min-h-[32px] h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:min-h-[60px] transition-all"
                  placeholder="Ex: Semana da Saúde!" value={institutionalMessage} onChange={(e) => setInstitutionalMessage(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Horários e Prazos */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /><CardTitle className="text-sm">Horários e Prazos</CardTitle></div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium">Horário de Corte</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">Pedidos bloqueados após este horário.</p>
              </div>
              <Input type="time" value={cutoffTime} onChange={(e) => setCutoffTime(e.target.value)} className="w-24 h-8 text-xs shrink-0" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium">Abertura Dia Seguinte</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">Cardápio de amanhã fica disponível.</p>
              </div>
              <Input type="time" value={openingTime} onChange={(e) => setOpeningTime(e.target.value)} className="w-24 h-8 text-xs shrink-0" />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium">Pedidos Antecipados</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">Pedir para dias futuros.</p>
              </div>
              <Switch checked={allowAdvanceOrders} onCheckedChange={setAllowAdvanceOrders} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium">Avaliação Tardia</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">Avaliar no dia seguinte.</p>
              </div>
              <Switch checked={allowLateRating} onCheckedChange={setAllowLateRating} />
            </div>
          </CardContent>
        </Card>

        {/* Unidades da Empresa */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2"><Store className="h-4 w-4 text-blue-500" /><CardTitle className="text-sm">Unidades da Empresa</CardTitle></div>
            <CardDescription className="text-[10px]">Configure cada unidade, permissao de pedidos e ordem de exibicao. Arraste para reordenar.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="flex gap-1.5">
              <Input 
                placeholder="Nova unidade..." 
                value={newUnit} 
                onChange={(e) => setNewUnit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addUnit()}
                className="h-8 text-xs"
              />
              <Button onClick={addUnit} size="icon" className="h-8 w-8 shrink-0"><Plus size={14} /></Button>
            </div>

            {units.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma unidade cadastrada.</p>
            ) : (
              <div className="space-y-1.5">
                {units.map((unit, idx) => (
                  <div
                    key={unit.name}
                    draggable
                    onDragStart={() => { dragUnitIdx.current = idx; }}
                    onDragEnter={() => { dragOverUnitIdx.current = idx; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={() => {
                      if (dragUnitIdx.current === null || dragOverUnitIdx.current === null || dragUnitIdx.current === dragOverUnitIdx.current) {
                        dragUnitIdx.current = null;
                        dragOverUnitIdx.current = null;
                        return;
                      }
                      const reordered = [...units];
                      const [moved] = reordered.splice(dragUnitIdx.current, 1);
                      reordered.splice(dragOverUnitIdx.current, 0, moved);
                      setUnits(reordered);
                      dragUnitIdx.current = null;
                      dragOverUnitIdx.current = null;
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-accent/30 group cursor-grab active:cursor-grabbing transition-all hover:shadow-sm hover:border-primary/20"
                  >
                    {/* Drag handle */}
                    <GripVertical size={14} className="text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors" />
                    
                    {/* Unit info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Store size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-xs font-medium truncate">{unit.name}</span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Orders toggle */}
                      <button
                        onClick={() => toggleUnitOrders(unit.name)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition-all",
                          unit.allowOrders
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                            : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400"
                        )}
                      >
                        {unit.allowOrders ? (
                          <ShoppingBag size={10} />
                        ) : (
                          <Lock size={10} />
                        )}
                        {unit.allowOrders ? "Pedidos ativos" : "Só cardápio"}
                      </button>
                      <button
                        onClick={() => removeUnit(unit.name)}
                        className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity p-0.5"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-2 pt-2 text-[10px] text-muted-foreground">
                  <GripVertical size={10} className="shrink-0 mt-0.5" />
                  <span>Arraste para reordenar. A ordem definida aqui sera refletida no seletor de unidade da Home e no perfil do usuario.</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  <Lock size={9} className="inline mr-1" />
                  Unidades com "So cardapio" nao permitem fazer pedidos -- usuarios verao o cardapio mas Sacola e Pedidos ficam desabilitados.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unidades de Medida */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Ruler className="h-4 w-4 text-emerald-500" /><CardTitle className="text-sm">Unidades de Medida</CardTitle></div>
              <span className="text-[10px] text-muted-foreground">{measurementUnits.length} cadastrada{measurementUnits.length !== 1 ? 's' : ''}</span>
            </div>
            <CardDescription className="text-[10px]">Disponíveis no cadastro de itens do cardápio (ex: porção, fatia, g, ml).</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="flex gap-1.5 max-w-sm">
              <Input 
                placeholder="Nova unidade de medida..." 
                value={newMeasurementUnit} 
                onChange={(e) => setNewMeasurementUnit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMeasurementUnit()}
                className="h-8 text-xs"
              />
              <Button onClick={addMeasurementUnit} size="icon" className="h-8 w-8 shrink-0"><Plus size={14} /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {measurementUnits.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhuma unidade de medida cadastrada.</p>
              ) : (
                measurementUnits.map((mu, idx) => (
                  editingMeasurementIdx === idx ? (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 pl-1 pr-0.5 py-0.5">
                      <input
                        value={editingMeasurementValue}
                        onChange={(e) => setEditingMeasurementValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmEditMeasurement();
                          if (e.key === 'Escape') cancelEditMeasurement();
                        }}
                        className="w-20 bg-transparent text-xs outline-none px-1"
                        autoFocus
                      />
                      <button onClick={confirmEditMeasurement} className="text-emerald-600 hover:text-emerald-700 p-0.5"><Check size={12} /></button>
                      <button onClick={cancelEditMeasurement} className="text-muted-foreground hover:text-foreground p-0.5"><X size={12} /></button>
                    </span>
                  ) : (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border bg-emerald-50 dark:bg-emerald-900/10 text-xs font-medium group cursor-default">
                      {mu}
                      <button onClick={() => startEditMeasurement(idx)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                        <Edit2 size={10} />
                      </button>
                      <button onClick={() => removeMeasurementUnit(idx)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity -mr-0.5">
                        <X size={12} />
                      </button>
                    </span>
                  )
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* PWA Icon */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-cyan-500" /><CardTitle className="text-sm">Icone do App (Home Screen)</CardTitle></div>
            <CardDescription className="text-[10px]">Icone exibido ao adicionar o app na tela inicial do iPhone e Android. Recomendado: PNG quadrado de pelo menos 512x512px.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="flex items-start gap-4">
              {/* Preview */}
              <div className="shrink-0">
                <div className="relative h-20 w-20 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                  {pwaIconUrl ? (
                    <img src={pwaIconUrl} alt="Icone do App" className="h-full w-full object-cover rounded-2xl" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <ImageIcon size={20} className="opacity-40" />
                      <span className="text-[9px]">Padrao</span>
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground text-center mt-1">Preview</p>
              </div>

              {/* Actions */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={handleIconUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    disabled={uploadingIcon}
                    onClick={() => iconInputRef.current?.click()}
                  >
                    {uploadingIcon ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {pwaIconUrl ? "Trocar Icone" : "Enviar Icone"}
                  </Button>
                  {pwaIconUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
                      disabled={removingIcon}
                      onClick={handleRemoveIcon}
                    >
                      {removingIcon ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Remover
                    </Button>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <Smartphone size={9} className="inline mr-0.5" />
                    <strong>iOS:</strong> Usado como apple-touch-icon ao adicionar na home screen.
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <Smartphone size={9} className="inline mr-0.5" />
                    <strong>Android:</strong> Atualiza o manifest.json dinamicamente para o icone de instalacao do PWA.
                  </p>
                  {pwaIconUrl && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <Check size={10} /> Icone personalizado ativo
                    </p>
                  )}
                  {!pwaIconUrl && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Nenhum icone personalizado — usando o icone padrao do SpaceFood.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Alterações
          </Button>
        </div>

        {/* Business Rules */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <CardTitle className="text-sm">Regras do Sistema</CardTitle>
            </div>
            <CardDescription className="text-[10px]">Como o SpaceFood funciona — referência para a equipe.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  icon: Utensils,
                  color: "text-orange-500",
                  title: "Limite de pedido",
                  desc: "Cada usuário pode realizar apenas 1 pedido por dia. Pedidos duplicados são bloqueados automaticamente.",
                },
                {
                  icon: Lock,
                  color: "text-red-500",
                  title: "Horário de corte",
                  desc: `Pedidos são bloqueados após o Horário de Corte (atualmente ${cutoffTime}). Edições/exclusões são bloqueadas 30 min antes desse horário.`,
                },
                {
                  icon: Beef,
                  color: "text-rose-500",
                  title: "Limite por categoria",
                  desc: "Cada item tem um campo \"Limite\" que define quantas unidades daquela categoria o usuário pode adicionar ao carrinho. Ex: Limite 1 em Proteína = apenas 1 proteína por pedido.",
                },
                {
                  icon: Egg,
                  color: "text-yellow-500",
                  title: "Ovo / Omelete — exclusividade",
                  desc: "Regra obrigatoria: se o usuario selecionar OVO ou OMELETE como Prato Principal, nenhum outro Prato Principal pode ser adicionado ao mesmo pedido, e vice-versa. O sistema bloqueia automaticamente com mensagem de aviso.",
                },
                {
                  icon: UtensilsCrossed,
                  color: "text-indigo-500",
                  title: "Pratos Principais — limite de 2",
                  desc: "Para pratos principais que NAO sejam Ovo/Omelete, o usuario pode escolher ate 2 porcoes no total: 1 de cada opcao disponivel, ou 2 do mesmo prato. O sistema bloqueia qualquer combinacao que ultrapasse esse limite.",
                },
                {
                  icon: Package,
                  color: "text-blue-500",
                  title: "Controle de estoque",
                  desc: "O campo \"Disponível\" de cada item é decrementado ao realizar um pedido e restaurado ao cancelar/excluir. Itens com disponibilidade 0 ficam indisponíveis.",
                },
                {
                  icon: Calendar,
                  color: "text-emerald-500",
                  title: "Pedidos antecipados",
                  desc: `Pedidos para o dia seguinte ficam disponíveis a partir do Horário de Abertura (atualmente ${openingTime}). A opção pode ser desabilitada em configurações.`,
                },
                {
                  icon: Star,
                  color: "text-amber-500",
                  title: "Avaliações",
                  desc: "Usuários podem avaliar o almoço do dia anterior. Se \"Avaliação Tardia\" estiver ativa, podem avaliar no dia seguinte ao do pedido.",
                },
                {
                  icon: Building2,
                  color: "text-indigo-500",
                  title: "Unidades e modos",
                  desc: "O usuario define sua Unidade de Almoco no perfil (Configuracoes). Essa unidade pre-seleciona o local na tela inicial e determina se pedidos sao permitidos. O admin pode desabilitar pedidos por unidade com o toggle 'Pedidos ativos'.",
                },
                {
                  icon: Bell,
                  color: "text-cyan-500",
                  title: "Notificações push",
                  desc: "Notificações são enviadas quando o admin publica um cardápio ou envia um aviso. O usuário precisa autorizar notificações no navegador.",
                },
                {
                  icon: RefreshCw,
                  color: "text-teal-500",
                  title: "Itens diários (recorrentes)",
                  desc: "Itens marcados como Diário são adicionados automaticamente ao cardápio de cada dia ao publicar. Ideal para itens fixos como arroz, feijão, salada.",
                },
                {
                  icon: Users,
                  color: "text-violet-500",
                  title: "Funções e permissões",
                  desc: "Funções personalizam o acesso de cada usuário ao painel admin. Um Override individual prevalece sobre a função atribuída ao usuário.",
                },
              ].map((rule, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className={cn("p-1.5 rounded-lg bg-background shadow-sm border border-border/50 shrink-0 h-fit", rule.color)}>
                    <rule.icon size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground mb-0.5">{rule.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{rule.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong>Atenção:</strong> Alterar o Horário de Corte afeta imediatamente se os usuários conseguem ou não fazer pedidos. O sistema usa o horário de Brasília (UTC-3) para todos os cálculos.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}