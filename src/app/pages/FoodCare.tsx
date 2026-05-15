import { useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { ChevronLeft, ShieldCheck, Truck, Utensils, Droplets, Thermometer, GraduationCap, ClipboardCheck, History, Clock, Beef } from "lucide-react";
import { motion } from "motion/react";

export function FoodCare() {
  const navigate = useNavigate();

  const sections = [
    {
      title: "Hortifruti: Qualidade do Campo à Mesa",
      icon: <Truck className="text-orange-500" size={24} />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Nossas frutas, legumes e verduras vêm de um fornecedor fixo, a <strong>Hetros Transportadora</strong>, que traz os produtos diretamente do CEASA.
          </p>
          <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-900/30">
            <h4 className="font-bold text-orange-900 dark:text-orange-200 mb-2 flex items-center gap-2">
              <ShieldCheck size={16} /> Controle de Qualidade
            </h4>
            <ul className="space-y-1 list-disc list-inside">
              <li>Conferência rigorosa de quantidades.</li>
              <li>Avaliação de aspecto, aroma, coloração e textura.</li>
              <li>Devolução imediata de itens fora do padrão.</li>
            </ul>
          </div>
          <p>
            Produtos que não passam por cocção recebem higienização com sanitizante aprovado pela <strong>ANVISA</strong>. O armazenamento é feito sob refrigeração ou temperatura ambiente controlada.
          </p>
        </div>
      ),
    },
    {
      title: "Proteínas: Segurança e Procedência",
      icon: <Beef className="text-red-500" size={24} />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Todas as carnes chegam com etiqueta contendo validade, informação nutricional e selo da <strong>Secretaria de Agricultura</strong>.
          </p>
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900/30">
            <Thermometer className="text-red-600 shrink-0 mt-1" size={20} />
            <div>
              <p className="font-bold text-red-900 dark:text-red-200">Rigor Térmico</p>
              <p>Conferimos a temperatura no recebimento (Fornecedor Daniella Alimentos).</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-red-600 text-white p-3 rounded-xl text-xs font-bold justify-center">
            <ShieldCheck size={14} /> NÃO REALIZAMOS RECONGELAMENTO DE CARNES CRUAS
          </div>
        </div>
      ),
    },
    {
      title: "Alimentos Secos e Estoque",
      icon: <Utensils className="text-blue-500" size={24} />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Nosso fornecedor principal é a <strong>Bidfood</strong>. Mantemos o mesmo rigor: verificamos validade por validade e organizamos o estoque pelo sistema <strong>PVPS</strong> (Primeiro que Vence, Primeiro que Sai).
          </p>
          <p>
            Todo o estoque é mantido em ambiente com temperatura controlada por ar-condicionado e monitorado por planilhas de validade.
          </p>
        </div>
      ),
    },
    {
      title: "Monitoramento Pós-Preparo",
      icon: <Thermometer className="text-purple-500" size={24} />,
      content: (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-2xl border border-purple-100 dark:border-purple-900/30 text-center">
            <p className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 mb-1">Quentes</p>
            <p className="text-xl font-bold text-purple-900 dark:text-purple-200">Acima de 60°C</p>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/30 text-center">
            <p className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 mb-1">Frios</p>
            <p className="text-xl font-bold text-blue-900 dark:text-blue-200">5°C a 10°C</p>
          </div>
        </div>
      ),
    },
    {
      title: "Controle de Amostras (Novo)",
      icon: <ClipboardCheck className="text-green-500" size={24} />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Implantado em 2026, todos os alimentos servidos têm uma porção armazenada por <strong>72 horas</strong>.
          </p>
          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-2xl border border-green-100 dark:border-green-900/30">
            <History className="text-green-600 shrink-0" size={20} />
            <p className="text-xs font-medium text-green-900 dark:text-green-200">
              Garante rastreabilidade e segurança caso ocorra qualquer intercorrência.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Equipe e Treinamento",
      icon: <GraduationCap className="text-amber-500" size={24} />,
      content: (
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Realizamos treinamentos e reciclagem constantes sobre processos de cozinha, capacitação de manipuladores e higiene pessoal.
          </p>
          <p className="text-xs italic border-l-2 border-amber-500 pl-3">
            Todos os treinamentos são registrados em planilha com assinatura do colaborador, nutricionista e RH.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 pt-4 px-4 md:px-8 max-w-2xl mx-auto">
      <header className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="rounded-full shrink-0"
        >
          <ChevronLeft size={24} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cuidados com sua comida</h1>
          <p className="text-sm text-muted-foreground">Segurança alimentar e processos</p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="p-5 bg-primary/5 rounded-3xl border border-primary/10 mb-6">
          <p className="text-sm text-foreground/80 leading-relaxed text-center italic">
            "Aqui na empresa seguimos um fluxo organizado para garantir a segurança dos alimentos desde a chegada até a distribuição."
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((section, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative pl-4"
            >
              <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-background border border-border shadow-sm">
                  {section.icon}
                </div>
                <h3 className="font-bold text-foreground tracking-tight">{section.title}</h3>
              </div>
              <div className="pl-2">
                {section.content}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="pt-8 pb-4">
          <div className="p-6 rounded-3xl bg-muted/30 border border-dashed border-border text-center">
            <ShieldCheck className="mx-auto text-muted-foreground mb-3" size={32} />
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-1">Compromisso SpaceFood</p>
            <p className="text-sm font-bold text-foreground">Rastreabilidade, Segurança e Tranquilidade</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
