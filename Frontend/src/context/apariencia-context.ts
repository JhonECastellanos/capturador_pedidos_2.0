import { createContext, useContext } from "react";
import { APARIENCIA_INICIAL, type Apariencia } from "@synchronic-jo/contrato";
export const AparienciaContext = createContext<{ apariencia: Apariencia; guardar: (v: Apariencia) => Promise<void> }>({ apariencia: APARIENCIA_INICIAL, guardar: async () => {} });
export function useApariencia() { return useContext(AparienciaContext); }
