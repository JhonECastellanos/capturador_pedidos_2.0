import { contraste, type Apariencia } from "@synchronic-jo/contrato";
const fuentes = { inter: '"Inter", ui-sans-serif, sans-serif', sistema: 'system-ui, sans-serif', grotesk: '"Space Grotesk", ui-sans-serif, sans-serif', serif: 'Georgia, serif' };
export function aplicarApariencia(v: Apariencia) {
  const estilo = document.documentElement.style;
  const tokens = { ink: v.texto, paper: v.fondo, accent: v.acento, header: v.encabezado, 'header-ink': v.textoEncabezado,
    'ink-soft': `color-mix(in srgb, ${v.texto} 78%, ${v.fondo})`, 'ink-faint': `color-mix(in srgb, ${v.texto} 68%, ${v.fondo})`,
    'paper-raised': '#ffffff', 'paper-sunken': `color-mix(in srgb, ${v.fondo} 85%, ${v.texto})`,
    'accent-soft': `color-mix(in srgb, ${v.acento} 12%, white)`, 'accent-dark': `color-mix(in srgb, ${v.acento} 65%, black)`,
    'accent-ink': contraste('#ffffff', v.acento) >= contraste('#182638', v.acento) ? '#ffffff' : '#182638',
    line: `color-mix(in srgb, ${v.texto} 14%, ${v.fondo})` };
  for (const [k, valor] of Object.entries(tokens)) estilo.setProperty(`--color-${k}`, valor);
  estilo.setProperty('--font-sans', fuentes[v.fuente]); estilo.setProperty('--font-display', fuentes[v.fuente]);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', v.encabezado);
}
export function permisoPantalla(ruta: string): string | undefined {
  const m = ruta.split('/')[2];
  return ({ ventas: 'pedidos', pedidos: 'pedidos', creditos: 'cobros', inventario: 'inventario', conteo: 'inventario', compras: 'inventario', productos: 'inventario', caja: 'caja', cierre: 'cierre-diario', usuarios: 'usuarios', abonos: 'cobros', clientes: 'clientes' } as Record<string, string>)[m];
}
