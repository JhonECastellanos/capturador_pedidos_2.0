export interface CabeceraConteoCompartidoDTO {
  id: string;
  tipo: string;
  estado: string;
  iniciadoEn: string;
  finalizadoEn: string | null;
  total: number;
  contadas: number;
  ocupadas: number;
  colaboradores: number;
  unidades: number;
  faltantes: number;
  sobrantes: number;
  valorContado: number;
  sinCosto: number;
  aplicado: boolean;
}

export interface LineaCompartidaDTO {
  productoId: string;
  nombre: string;
  codigo: string;
  unidad: string;
  stockFisico: number | null;
  diferencia: number | null;
  contadoEn: string | null;
  contadoPor: string | null;
  asignadoPorId: string | null;
  asignadoPor: string | null;
  asignadoHasta: string | null;
}
