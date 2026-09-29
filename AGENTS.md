# Guía para agentes

## Alcance y comandos

El proyecto es un monorepo. `Backend/` sí tiene API implementada (NestJS, Prisma, PostgreSQL): no la inventes ni la ignores. `Frontend/` es la SPA y todavía lee y escribe en `localStorage`; la migración a la API está en curso.

Ejecuta los comandos desde la **raíz**: `npm run verificar` revisa el contrato, la API y el frontend de una vez. Los comandos puntuales son `npm run front:dev`, `front:build`, `front:lint`, `api:dev`, `api:build`, `api:verificar`, `prueba:humo` y `api:cli`.

Antes de cambiar, consulta [README.md](README.md) para rutas, entidades e invariantes funcionales. Evita duplicar aquí el catálogo detallado de módulos.

## El contrato es la fuente de verdad

`Compartido/` es un paquete npm (`@ambie/contrato`) que los tres lados importan. Un enum, un tipo o un esquema vive ahí, no en el frontend ni en la API.

- Un enum nuevo o modificado va primero en `Backend/prisma/schema.prisma`, después en `Compartido/src/enums.ts`.
- `npm run contrato:verificar` compara los `@map(...)` de Prisma contra el contrato compilado. Si agregas un valor a un enum y no lo propagas, falla ahí.
- `EQUIVALENCIA_VARIABLES.txt` documenta el nombre de cada variable en frontend, API y base de datos. Actualízalo cuando cambies un nombre: es lo que permite encontrar el código viejo al buscar.

## Arquitectura del backend

NestJS con adaptador Fastify y prefijo global `/api/v1`. Un módulo por área en `Backend/src/<area>/`, con `*.controller.ts`, `*.service.ts` y `*.module.ts`.

- La lógica de negocio va en el servicio. El controlador solo valida con Zod y devuelve `{ data }`.
- El `AuthGuard` global exige token salvo en rutas `@Public()`. Acepta la cookie `ambie_access` o `Authorization: Bearer`, para que el mismo backend sirva al navegador y al CLI.
- Las rutas de administración llevan `@Roles(RolUsuario.ADMINISTRADOR)`: usuarios, cierres, egresos de caja, ajustes de inventario, cambio de precios, compras y gastos.
- Los errores de negocio son `ErrorDominio`; el `FiltroErrores` los traduce a respuestas con código.
- Las agregaciones (tablero, series, tops) van en SQL con `Prisma.sql`, no trayendo filas a memoria para sumarlas en JavaScript.

## Arquitectura del frontend
-React19+TypeScript+Vite+TailwindCSS4+ReactRouter7.LaraízReactyelrouterestánen`Frontend/src/main.tsx`;`Frontend/src/App.tsx`compone`AuthProvider`porfuerade`OperacionesProvider`yconfiguralasrutas.Loshooks`useAuth`y`useOperaciones`requierensusrespectivosproveedores.
-Conservalaseparaciónpantalla→contexto/fachada(`Frontend/src/context/OperacionesContext.tsx`)→lógicapura(`Frontend/src/dominio/servicios.ts`)yrepositorios(`Frontend/src/data/repositorios/`).Nomuevasreglasdenegocioacomponentesdeinterfaz.
-Usa`Frontend/src/types/index.ts`comomodelocanónico.Reutilizamódulosypantallascompartidos,especialmente`Frontend/src/modules/ventas/screens/RutasVentas.tsx`,enlugardeduplicarvistasporrol.
-Usaloscomponentescompartidos(`BuscadorInput`,`SegmentoControl`,`ListaVacia`,`TarjetaClicable`,`SelectorOpciones`,`TarjetaAccion`,`MetricaFiltro`,`PantallaCompletaAdmin`)ylasutilidades`Frontend/src/utils/fechas.ts`y`Frontend/src/utils/estados.ts`paranorepetirfiltros,fechas,estadosyvacíosenlosmódulos.
-Loshooksdelcontextovivenenarchivosseparadosdelosproveedores(`context/auth.ts`frente a`context/AuthContext.tsx`)paranoquebrarFastRefreshdeVite.Losarchivosintermediosllevanguion(`auth-context.ts`)porqueWindowsnodistingue mayúsculasdeminúsculas.

##Invariantesdenegocioypersistencia
-Losdatossonlocales,versionadosen`localStorage`conclaves`ambie:v2:`.La versiónv1seignoraparaquelosdatosantiguosdeotrasesionesno reaparezcan;noañadasdatoscomercialesdedemostración:elnegocioarrancavacío;soloseconservanlosaccesosoficialesdefinidosporlasemilla.
-Cambiosenpedidos/pagosdebenpreservarcoherenciaentrepedidos,stock,saldodecliente,abonosycaja.Revisalosserviciosantesdealterarcancelación/reactivación,cobrodirectodepedidoodistribuciónFIFOdeabonos.
-Losconteosparcialessoloajustanlíneasdigitadas.Losconsecutivossecentralizanen`Backend/src/common/consecutivos.ts`.
-ConservafechasISOenalmacenamientoytenencuentalafechalocalalfiltrarymostrarcierres.
-`localStorage`tienecuotalimitada;imágenesycomprobantesseguardanlocalmente.Lascredencialeslocalessonparademostración,noautenticaciónseguradeproducción.Noborresnireiniciesdatosdurantepruebassalvopeticiónexplícitadelusuario;`limpiarTodo()`eliminatodaslasclaves`ambie:v2:`ylasv1legacy.
-Laapidebecontarconlasesmismasreglas:eltableroexcluyepedidoscancelados delasventas,paraque lasumacuadreconlacaja,quellosrevierte.
-Lainterfazesmobile-first,conviewportyscrollinternoporpantalla.Manténáreastáctilescómodas,piesfijosypatronesexistentes;usatokensen`Frontend/src/index.css`.
-Evitaexportarhelpersno-componentesdesdemódulosdecomponentessiperjudicaFastRefresh;colocautilidadescompartidasen`Frontend/src/utils/`.

## CLI
`Backend/cli/`correcon`tsx`ynocompilacon`nest build`:ustiposserevisanapartecon`npm run api:verificar`(`tsconfig.cli.json`).
-Elbucledeconversaciónescomúna todoslosproveedores.Añadirunoeseescribirunaclasqueimplemente`ProveedorIA`en`Backend/cli/proveedores/`yregistrarla;notoqueselbucle.
-Lasherramientasdelmodelosedeclaranunavez en`Backend/cli/herramientas.ts`,conesquemaZod.Nadaescribesinconfirmacióndelusuario,salvoquelapase`--si`.
-Elgeneradordepruebasleeloscontroladoresparasaberquéendpointsexisten.Siagregasunaruta,aparece sola;noface falta registrarlaenningunalista.
-`Backend/scripts/humo-api.ts`eselrecorridod.extremoaextremo.Unfalloahísueledecirunproblemarealdecontrato,no unproblemadelscript.

##Verificación
-Trascambios,`npm run verificar`desdelaraíz:verificaelcontrato,compilayrevisa lostiposdeAPI,CLIy scripts,y compilayrevisaelfrontend.
-Paracambiosdeinterfaz,consideratamaños390×844y1440px.Paracambiosdecontexto,validaquelapantallaestébajoelproveedorcorrecto;unerror`useAuth`/`useOperacionesdebeusarsedentrode...Provider`indicaunacomposiciónincorrectaounaactualizaciónHMRinconsistente.

## Referenciasdeactivos
-[Guíadeimágenesdeproductos](Frontend/public/assets/productos/README.md)
-[Guíadecomprobantes](Frontend/public/assets/comprobantes/README.md)
