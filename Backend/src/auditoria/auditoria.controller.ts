import { Controller, Get, Query } from "@nestjs/common";
import { RolUsuario } from "@prisma/client";
import { Roles } from "../common/guards";
import { AuditoriaService } from "./auditoria.service";
import { FiltroAuditoriaEsquema } from "@ambie/contrato";
import { ErrorDominio } from "../common/errores";

@Roles(RolUsuario.ADMINISTRADOR)
@Controller("auditoria")
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}
  @Get()
  listar(@Query() query: unknown) {
    const filtro = FiltroAuditoriaEsquema.safeParse(query);
    if (!filtro.success) throw new ErrorDominio("VALIDACION", "Filtro de auditoría inválido");
    return this.auditoria.listar(filtro.data);
  }
}
