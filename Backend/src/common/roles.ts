import { RolUsuario } from "@prisma/client";
import type { RolUsuario as RolContrato } from "@ambie/contrato";

/**
 * El contrato y la base de datos identifican los roles con el código en
 * minúscula (`administrador`, `vendedor`), que es el `@map(...)` del enum y el
 * valor que guarda `roles.codigo`. El cliente de Prisma, en cambio, expone el
 * nombre del enum en mayúscula (`RolUsuario.ADMINISTRADOR`). Esta función es la
 * única traducción entre ambos mundos: úsala siempre que compares un rol con
 * `roles.codigo`.
 */
export function codigoDeRol(rol: RolUsuario): RolContrato {
  return rol.toLowerCase() as RolContrato;
}
