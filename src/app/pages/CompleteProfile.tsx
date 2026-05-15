import { useState, useEffect } from "react";
import { useAuth } from "../context/auth-context";
import { Button } from "../components/ui/Button";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { Loader2, AlertTriangle } from "lucide-react";

export function CompleteProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fetchingUnits, setFetchingUnits] = useState(true);
  const [units, setUnits] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    department: user?.user_metadata?.department || "",
    age: user?.user_metadata?.age || "",
    lunch_location: user?.user_metadata?.lunch_location || "",
    dietary_restrictions: user?.user_metadata?.dietary_restrictions || ""
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await api.get("/admin/settings");
        if (settings.units && Array.isArray(settings.units)) {
          // Units may be strings or objects with {name, allowOrders}
          const unitNames: string[] = settings.units.map((u: any) =>
            typeof u === "string" ? u : u.name
          );
          setUnits(unitNames);
          // Set default if not set
          if (!formData.lunch_location && unitNames.length > 0) {
            setFormData(prev => ({ ...prev, lunch_location: unitNames[0] }));
          }
        } else {
           // Fallback if no units configured
           setUnits(["Sede Damasceno", "Sede Taipas", "Externo"]);
        }
      } catch (e) {
        console.error("Failed to fetch units", e);
        setUnits(["Sede Damasceno", "Sede Taipas", "Externo"]);
      } finally {
        setFetchingUnits(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.department || !formData.age || !formData.lunch_location) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          department: formData.department,
          age: formData.age,
          lunch_location: formData.lunch_location,
          dietary_restrictions: formData.dietary_restrictions,
          onboarding_completed: true
        }
      });

      if (error) throw error;

      toast.success("Perfil atualizado!");
      navigate("/");
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar perfil");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-xl p-8 space-y-6 animate-in fade-in zoom-in duration-300 border border-border">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Complete seu Cadastro</h1>
          <p className="text-muted-foreground text-sm">Precisamos de algumas informações adicionais para melhorar sua experiência.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Seu Departamento</label>
            <input 
              required
              type="text" 
              value={formData.department}
              onChange={(e) => setFormData({...formData, department: e.target.value})}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Ex: TI, RH, Comercial..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Sua Idade</label>
            <input 
              required
              type="number" 
              min="14"
              max="100"
              value={formData.age}
              onChange={(e) => setFormData({...formData, age: e.target.value})}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Anos"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Onde você costuma almoçar?</label>
            {fetchingUnits ? (
               <div className="w-full px-4 py-2 rounded-lg border border-input bg-muted flex items-center gap-2 text-muted-foreground text-sm">
                 <Loader2 className="h-4 w-4 animate-spin" /> Carregando unidades...
               </div>
            ) : (
              <select 
                value={formData.lunch_location}
                onChange={(e) => setFormData({...formData, lunch_location: e.target.value})}
                className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="" disabled>Selecione...</option>
                {units.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" />
              Restrições Alimentares
            </label>
            <p className="text-xs text-muted-foreground -mt-1">
              Informe se possui alguma restrição. Ex: Intolerância a Lactose, Alergia a Frutos do Mar, Vegetariano, Sem Glúten, etc.
            </p>
            <input 
              type="text" 
              value={formData.dietary_restrictions}
              onChange={(e) => setFormData({...formData, dietary_restrictions: e.target.value})}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary/20 outline-none"
              placeholder="Deixe em branco se nao possui restrições"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || fetchingUnits}>
            {loading ? "Salvando..." : "Concluir Cadastro"}
          </Button>
        </form>
      </div>
    </div>
  );
}