/**
 * Área de toque dos interruptores do módulo Campanhas: o Switch padrão tem 32×18 px; este acréscimo amplia só a área clicável
 * (pseudo-elemento invisível) para ~56×44 px no celular, sem mudar o visual nem o espaço que ele ocupa.
 */
export const SWITCH_HIT = "relative after:absolute after:-inset-x-3 after:-inset-y-[13px] after:content-['']";
