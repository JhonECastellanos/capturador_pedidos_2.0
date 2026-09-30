ALTER TABLE usuarios ADD COLUMN "esSistema" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX usuarios_system_unico ON usuarios ("esSistema") WHERE "esSistema";
ALTER TABLE usuarios ADD CONSTRAINT usuarios_system_identidad CHECK (
  ("esSistema" AND nombre = 'system' AND rol = 'administrador' AND activo)
  OR (NOT "esSistema" AND lower(trim(nombre)) <> 'system')
);
CREATE FUNCTION proteger_usuario_system() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."esSistema" AND (TG_OP = 'DELETE' OR NOT NEW."esSistema") THEN
    RAISE EXCEPTION 'El usuario system no se puede eliminar ni convertir';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER usuarios_proteger_system BEFORE UPDATE OR DELETE ON usuarios
FOR EACH ROW EXECUTE FUNCTION proteger_usuario_system();
