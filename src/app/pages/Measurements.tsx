import React from "react";
import { ArrowLeft, Scale, Info, BookOpen, Utensils } from "lucide-react";
import { Link } from "react-router";
import utensilsImg from "figma:asset/efc8d17e98e9b372c886ff89715e447e6cff6465.png";

export function Measurements() {
  const measurements = [
    { name: "1 colher de sopa", equivalent: "15ml / 15g", description: "Medida padrão para líquidos e pós." },
    { name: "1 colher de chá", equivalent: "5ml / 5g", description: "Medida pequena para temperos." },
    { name: "1 xícara de chá", equivalent: "240ml", description: "Volume padrão para líquidos." },
    { name: "1 concha média", equivalent: "100-120ml", description: "Usada para feijão, sopas e caldos." },
    { name: "1 escumadeira", equivalent: "80-100g", description: "Usada para arroz e massas escorridas." },
    { name: "1 bife médio", equivalent: "100-120g", description: "Tamanho da palma da mão, espessura de 1cm." },
    { name: "1 filé de frango", equivalent: "100-120g", description: "Tamanho médio de um peito de frango." },
    { name: "1 porção de salada", equivalent: "Prato raso cheio", description: "Folhas e vegetais variados." },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b px-4 py-4 flex items-center gap-4">
        <Link to="/" className="p-2 -ml-2 hover:bg-accent rounded-full transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Scale className="text-primary" size={24} />
          Tabela de Medidas
        </h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* Instrumentos de Referência */}
        <section className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-accent/30">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Utensils className="text-primary" size={20} />
              Instrumentos de Referencia
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Utensílios utilizados como padrão de medida no SpaceFood
            </p>
          </div>
          <div className="p-4">
            <img
              src={utensilsImg}
              alt="Instrumentos de medida: concha, colher de servir, pegador de massa e pegador de servir"
              className="w-full rounded-lg"
            />
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              {["Concha", "Colher de Servir", "Pegador de Massa", "Pegador de Servir"].map((label) => (
                <span
                  key={label}
                  className="text-xs font-medium bg-primary/10 text-primary px-3 py-1.5 rounded-full"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Medidas Culinárias Space */}
        <section className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Scale className="text-primary" size={20} />
            Medidas Culinarias Space
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            As medidas culinarias utilizadas no SpaceFood sao: <strong>colher de servir</strong>,{" "}
            <strong>concha</strong>, <strong>pegador de servir</strong> ou <strong>unidade</strong>.
          </p>
        </section>

        {/* Referências */}
        <section className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <BookOpen className="text-primary" size={20} />
            Referencias para as Medidas Culinarias Space
          </h2>
          <ul className="space-y-2">
            <li className="flex gap-2 text-sm text-muted-foreground">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <span>
                Tabela para Avaliacao de Consumo Alimentar em Medidas Caseiras, 4a Edicao — Atheneu
              </span>
            </li>
            <li className="flex gap-2 text-sm text-muted-foreground">
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <span>
                Tabela Brasileira de Composicao de Alimentos — TACO
              </span>
            </li>
          </ul>
        </section>

        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex gap-3 text-sm text-primary/80">
          <Info className="shrink-0" size={20} />
          <p>
            Use esta tabela como referência para entender as porções servidas no SpaceFood. 
            Os valores são aproximados e podem variar levemente de acordo com a preparação.
          </p>
        </div>

        <div className="grid gap-3">
          {measurements.map((item, index) => (
            <div 
              key={index}
              className="bg-card border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-1"
            >
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-foreground">{item.name}</h3>
                <span className="text-xs font-mono bg-accent px-2 py-1 rounded-md font-bold text-accent-foreground">
                  {item.equivalent}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}