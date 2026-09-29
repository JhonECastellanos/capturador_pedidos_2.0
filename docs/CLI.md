# CLI de AMBIÉ

El CLI es la puerta de la API por línea de comandos. Hace dos cosas:

1. **Preguntar.** Hablas normal y el modelo consulta y registra los datos del negocio.
2. **Probar.** Le pides casos de prueba a un modelo, y el CLI los ejecuta de verdad contra la API.

## Instalación

No hay nada que instalar aparte: el CLI corre con `tsx`, que ya está en el proyecto.

```bash
npm install
npm run api:cli -- ayuda
```

## Proveedores

| Id | Servicio | Clave | Nota |
|---|---|---|---|
| `ollama` | Ollama | No | Gratis, corre en tu equipo. `ollama pull llama3.2` |
| `gemini` | Google Gemini | Sí | Gratis. console.ai.google.dev |
| `groq` | Groq | Sí | Gratis. console.groq.com/keys |
| `openai` | OpenAI | Sí | De pago |
| `personalizado` | Cualquiera compatible con OpenAI | Según el caso | Together, OpenRouter, LM Studio, vLLM… |

### Dejar uno configurado

```bash
npm run api:cli -- config proveedor=gemini
npm run api:cli -- config proveedor=ollama
```

La primera vez que uses un proveedor con clave, el CLI te la pide sin que aparezca en pantalla y la guarda sola en `~/.ambie/cli.json`.

### Tres formas de dar la clave

Se priorizan en este orden:

1. `--clave "..."` — solo para esa ejecución.
2. La variable de entorno (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`).
3. `~/.ambie/cli.json`, que escribe el propio CLI.

El archivo se crea con permisos solo para ti. Si prefieres no dejar nada en el disco, usa la variable de entorno.

### Tu propia conexión

Cualquier API que hable el dialecto de OpenAI entra por `personalizado`:

```bash
npm run api:cli -- config api="https://openrouter.ai/api/v1" modelo="meta-llama/llama-3.3-70b-instruct:free" clave_personalizado="sk-..."
```

Si la URL no trae `/v1` al final, el CLI lo agrega.

### Cómo se elige el modelo

Si no dices ninguno, el CLI toma el primero de los que el proveedor recomienda para el caso. Cada proveedor tiene su lista en `Backend/cli/proveedores/registro.ts`.

## Preguntar

```bash
# Una sola pregunta
npm run api:cli -- preguntar "¿quién debe más?"

# Sesión interactiva
npm run api:cli -- preguntar
```

Opciones:

| Opción | Para qué |
|---|---|
| `--api <url>` | Dirección de la API |
| `--proveedor <id>` | Con cuál hablar |
| `--modelo <id>` | Qué modelo usar |
| `--clave <texto>` | Clave para esta ejecución |
| `--usuario <correo>` | Correo para entrar a la API |
| `--si` | Confirma solo lo automático, sin preguntar |

### Qué puede hacer

El modelo tiene nueve herramientas: buscar y crear clientes, consultar cartera, buscar productos, registrar pedidos, registrar abonos, ver pedidos, ver el resumen del negocio y consultar gastos.

### Nada se escribe sin tu OK

Crear un cliente, registrar un pedido y registrar un abono piden confirmación. El CLI imprime lo que se va a hacer y espera tu respuesta:

```
  ⚠  registrar_pedido
  {
    "clienteId": "…",
    "metodo": "credito",
    "lineas": [ … ]
  }
  ¿Ejecutar? [s/N]
```

Si pones `--si`, se salta la pregunta. Úsalo solo en pruebas.

## Probar

```bash
npm run api:cli -- probar --proveedor gemini
```

El CLI lee los controladores del backend, le pasa al modelo la lista real de endpoints y le pide casos. Después te los muestra antes de ejecutar nada:

```
  1. Listar clientes sin sesión
  2. Crear un pedido con líneas vacías
  3. Un abono mayor que la deuda
  …
  ¿Ejecutarlos contra la API? [s/N]
```

Al ejecutar, cada caso pasa o falla de verdad. Un caso marcado como «debe fallar» pasa cuando la API lo rechaza con un error de cliente, que es lo correcto.

```bash
# Ejecutar sin preguntar
npm run api:cli -- probar --si

# Con una instrucción extra
npm run api:cli -- probar "cubre sobre todo la cartera y los permisos"
```

## Otros comandos

```bash
npm run api:cli -- rutas          # lista los endpoints de la API
npm run api:cli -- proveedores    # muestra los proveedores y cuál está en uso
npm run api:cli -- config         # muestra la configuración actual
npm run api:cli -- salir          # borra la sesión guardada de este equipo
```

## Dónde se guarda

Todo va a `~/.ambie/cli.json`:

```json
{
  "apiUrl": "http://localhost:3000",
  "proveedor": "gemini",
  "modelo": "gemini-2.0-flash",
  "claves": { "gemini": "AIza…" },
  "usuario": { "email": "admin@ambie.local" }
}
```

Para cambiar de lugar: `AMBIE_CONFIG=/ruta/alternativa/cli.json`.

Las claves nunca se imprimen enteras. Al ver la configuración verás algo como `AIzaS…3f9c`.

## Problemas frecuentes

**«Falta la clave de…»**
Falta configurarla. Usa `config clave_<proveedor>="..."` o pon la variable de entorno.

**«El modelo no propuso pruebas»**
El modelo no usó la herramienta. Suele pasar con modelos muy pequeños; prueba con otro, o quita el `--modelo` para que el CLI elija el recomendado.

**«No se pudo entrar»**
O el correo no existe, o la contraseña no es la de ese usuario, o la API no está corriendo. Comprueba con `curl http://localhost:3000/api/v1/salud`.

**«No encontré los controladores»**
El CLI se ejecutó fuera de `Backend/`. Corrélo desde la raíz con `npm run api:cli`.

**Ollama no responde**
Ollama no está corriendo. Arrancalo con `ollama serve` y descarga un modelo con `ollama pull llama3.2`.

## Cómo está hecho

```text
Backend/cli/
├── index.ts              Comandos y arranque
├── cliente-api.ts        Cliente HTTP, con renovación de token
├── config-cli.ts         Configuración y claves
├── conversacion.ts       El bucle de pregunta y respuesta
├── herramientas.ts       Las nueve herramientas que usa el modelo
├── generador-pruebas.ts  Generación y ejecución de casos
├── contrato-fuente.ts    Lee los endpoints del código
└── proveedores/
    ├── tipos.ts          La interfaz común
    ├── comunes.ts        Adaptador compartido de OpenAI
    └── registro.ts       Groq, Gemini, Ollama, OpenAI y personalizado
```

Añadir un proveedor es escribir una clase que implemente `ProveedorIA` y registrarla. El bucle de conversación no cambia.
