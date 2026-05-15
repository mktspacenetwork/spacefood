import React from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Link } from "react-router";

export function Team() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b px-4 py-4 flex items-center gap-4">
        <Link to="/" className="p-2 -ml-2 hover:bg-accent rounded-full transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="text-primary" size={24} />
          Equipe Responsável
        </h1>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-8">
        
        {/* Marketing Space Network */}
        <section className="bg-card rounded-2xl p-6 border shadow-sm flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-orange-600">SN</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Marketing Space Network</h2>
            <p className="text-muted-foreground text-sm mt-2">
              Responsável pela gestão de marca, comunicação e estratégia digital do SpaceFood.
            </p>
          </div>
        </section>

        {/* Nutricionista */}
        <section className="bg-card rounded-2xl p-6 border shadow-sm flex flex-col gap-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center overflow-hidden border-4 border-white shadow-md">
              <span className="text-2xl font-bold text-green-700">IM</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Isabella Mamedes</h2>
              <span className="inline-block bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full mt-1">
                Nutricionista Responsável
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-4 leading-relaxed text-justify">
            <p>
              Isabella Mamedes é nutricionista com foco em emagrecimento inteligente e promoção da saúde, atuando com estratégias personalizadas e baseadas em evidências para resultados sustentáveis.
            </p>
            <p>
              Graduada pela Universidade Nove de Julho (2021), possui pós-graduação em Saúde Pública com ênfase em Saúde da Família pelo Centro Universitário São Camilo, além de especialização em Controle e Qualidade dos Alimentos e formação complementar em Gestão de Pessoas e Segurança do Paciente.
            </p>
            <p>
              Com experiência na Space Network e no segmento de suplementação alimentar, atua também em segurança alimentar, UAN e gestão de processos, sempre com foco em qualidade, eficiência e cuidado integral ao paciente.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
