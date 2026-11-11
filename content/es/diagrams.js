window.CCARF = window.CCARF || {};

const ask = (q, note, paths) => ({ kind: "ask", q, note, paths });
const isProse = (text) => /^[A-ZÁÉÍÓÚÑ¿]/.test(text) && !/[=(]|->/.test(text);
const step = (label, code, note) => (code && isProse(code)
  ? { kind: "do", label, note: note ? code + " " + note : code }
  : { kind: "do", label, code, note });
const back = (label, note) => ({ kind: "back", label, note });
const path = (when, next, tone, flag) => ({ when, next, tone, continues: flag === "next", end: flag === "end" });

CCARF.diagrams = {
  "1.1": {
    title: "El bucle, como lo escribirías",
    layout: "program",
    steps: [
      step("El historial empieza con el pedido", "messages = [{ role: 'user', content: pedido }]"),
      step("Llamar a la API con las tools", "response = client.messages.create(messages, tools)"),
      ask("¿Qué trae response.stop_reason?", "Se lee ese campo. Una frase dentro del texto no cierra el bucle.", [
        path("end_turn", "return response. El texto ya es la respuesta para el usuario.", "good", "end"),
        path("max_tokens", "La salida quedó cortada. No se ejecuta el tool_use a medias. Se aborta.", "bad", "end"),
        path("tool_use", "Pidió herramientas. Todavía no hay respuesta final.", "accent", "next"),
      ]),
      step("Guardar el mensaje del asistente tal como volvió", "messages.append({ role: 'assistant', content: response.content })", "Van incluidos los bloques tool_use."),
      step("Ejecutar cada tool y armar un resultado por id", "for tool_use in response:\n    results.append({ type: 'tool_result', tool_use_id: tool_use.id, content: run(tool_use) })", "Si falta o sobra un id, la llamada siguiente falla."),
      step("Devolver los resultados como mensaje user", "messages.append({ role: 'user', content: results })"),
      back("Volver al paso 2 y llamar otra vez", "Un tope de vueltas solo existe para que esto no siga para siempre. Si ese tope es lo que para, la tarea quedó cortada."),
    ],
  },
  "1.2": {
    title: "Lo que hace el coordinador en cada vuelta",
    layout: "program",
    steps: [
      step("Leer la consulta y partir el tema", "plan = split(consulta)", "Cada especialista recibe un subtema o un tipo de fuente. No el historial de los otros."),
      step("Llamar a los subagentes desde el centro", "resultados = [buscar(plan), analizar(plan)]", "La respuesta de cada uno vuelve al coordinador. Entre ellos no hay canal."),
      step("Juntar lo que volvió", "sintesis = redactar(resultados)"),
      ask("¿La síntesis cubre el tema que se pidió?", null, [
        path("Sí", "Se entrega el informe. Fin de esta consulta.", "good", "end"),
        path("Falta una región", "El coordinador encarga solo ese hueco y vuelve a juntar.", "accent", "next"),
        path("El recorte era demasiado fino", "Los subagentes cumplieron lo asignado. El fallo se corrige en split(), no en ellos.", "bad", "end"),
      ]),
      back("Volver al paso 2 con el hueco concreto", "Ejemplo: industrias creativas partidas solo en arte digital, diseño y fotografía. Música, escritura y cine no las recibió nadie."),
    ],
  },
  "1.3": {
    title: "Cómo se arma la llamada a un subagente",
    layout: "program",
    steps: [
      step("El coordinador solo puede lanzar si Task está permitida", "allowedTools = [..., 'Task']"),
      ask("¿Estas dos tareas se necesitan entre sí?", null, [
        path("No", "Las dos llamadas Task salen en la misma respuesta. Esperar un turno entre ellas solo agrega latencia.", "good", "next"),
        path("La síntesis depende de las dos", "Esa llamada espera, y su prompt tiene que traer los dos resultados ya escritos.", "warn", "next"),
      ]),
      step("Escribir el prompt que el subagente va a ver", "prompt = encargo + hallazgos_previos + { claim, source }", "No hereda la conversación del coordinador ni recuerda otra invocación."),
      step("El resultado vuelve solo al coordinador", "return { claim, source: url | documento | pagina }"),
      back("fork_session no es este paso", "fork_session parte una sesión para probar otro enfoque. No crea un especialista con contexto aislado."),
    ],
  },
  "1.4": {
    title: "process_refund, con el cerrojo en código",
    layout: "program",
    steps: [
      step("Llega la llamada que el modelo pidió", "tool_name == 'process_refund'"),
      ask("¿La sesión ya tiene un customer_id verificado por get_customer?", "Una frase del prompt, aunque esté en mayúsculas, no hace esta pregunta.", [
        path("No hay id", "return tool_error('Call get_customer and verify identity first.', retryable=False). La tool no corre.", "bad", "end"),
        path("Sí hay id", "process_refund sigue.", "good", "next"),
      ]),
      ask("¿El mismo mensaje traía más de un tema?", null, [
        path("Devolución y cambio de dirección", "Se parten en ítems. Cada uno se investiga. Al cliente se le responde una sola vez.", "accent", "next"),
        path("Hay que pasarlo a una persona", "El handoff lleva id del cliente, causa, monto y acción recomendada.", "warn", "end"),
      ]),
    ],
  },
  "1.5": {
    title: "Una llamada a tool, con los dos ganchos",
    layout: "program",
    steps: [
      ask("Al diseñar: ¿esta regla tiene que cumplirse siempre?", "Esta pregunta se responde una vez, al escribir el agente.", [
        path("Sí: umbral, orden, ruta prohibida", "Se programa un hook. Abajo se ve cómo actúa en cada llamada.", "accent", "next"),
        path("Es tono o formato", "Se queda en el prompt. No hace falta hook.", "good", "end"),
      ]),
      step("El modelo arma la llamada", "process_refund(amount=800)"),
      ask("Hook de salida, antes de ejecutar: ¿el monto pasa de 500 USD?", null, [
        path("Sí", "Se bloquea la llamada y el caso va a una persona. La tool no corre.", "bad", "end"),
        path("No", "La tool se ejecuta.", "good", "next"),
      ]),
      step("La tool devuelve datos en el formato de su servidor", "timestamp = 1710000000, status = 200", "Otro servidor podría devolver la misma fecha en ISO 8601 y otro código."),
      step("PostToolUse reescribe el resultado", "fecha = '2026-03-09', estado = 'issued'", "El modelo todavía no ha leído nada."),
      step("Recién aquí el modelo recibe el resultado", null, "El razonamiento usa la forma única, no el dialecto de cada servidor."),
    ],
  },
  "1.6": {
    title: "Cómo se parte el trabajo antes de empezar",
    layout: "program",
    steps: [
      ask("¿Los pasos se conocen antes de abrir el código?", null, [
        path("Sí, es una revisión predecible", "Cadena fija. Primero un pase por archivo. Después un pase de integración con los hallazgos, buscando datos que cruzan archivos.", "good", "end"),
        path("No, el legado no se ha mirado", "Primero mapear. Después marcar lo que más se usa. El plan se reescribe cuando aparece una dependencia.", "warn", "next"),
      ]),
      ask("¿El trabajo cabe en un solo prompt?", null, [
        path("14 archivos juntos", "No se parte. La atención se diluye y lo que cruza archivos no tiene pase propio.", "bad", "end"),
        path("Un paso a la vez, y el plan puede cambiar", "Cada vuelta usa lo que la anterior encontró.", "good", "end"),
      ]),
    ],
  },
  "1.7": {
    title: "Al retomar, el programa elige qué contexto cargar",
    layout: "program",
    steps: [
      ask("¿Los tool results de la sesión todavía describen el código?", null, [
        path("Sí", "claude --resume billing-refactor. Se sigue desde esa conversación.", "good", "next"),
        path("No: alguien reescribió el módulo", "Sesión nueva. Entra un resumen de las decisiones que siguen en pie, sin los results viejos.", "bad", "end"),
      ]),
      ask("¿Cambiaron archivos desde el análisis?", null, [
        path("Sí, src/invoice.ts", "El mensaje nombra ese archivo. Se relee ese, no el repositorio entero.", "accent", "end"),
        path("No cambió nada", "Se sigue con el contexto cargado.", "good", "end"),
      ]),
      ask("¿Hay que probar dos diseños desde el mismo análisis?", null, [
        path("Sí", "fork_session abre una rama y deja la sesión original intacta. No sustituye a un subagente.", "accent", "end"),
      ]),
    ],
  },
  "2.1": {
    title: "Cómo elige el modelo una tool",
    layout: "program",
    steps: [
      step("En la llamada van el nombre y la descripción, no el código de la función", "tools = [{ name, description, input_schema }]"),
      ask("¿Hay dos descripciones que dicen casi lo mismo?", null, [
        path("analyze_content y analyze_document", "El modelo llama una por la otra. Few-shot en el system prompt no cambia el menú.", "bad", "next"),
        path("Cada una dice formato, un ejemplo y cuándo no usarla", "La elección sale de esa descripción.", "good", "end"),
      ]),
      step("Reescribir el contrato", "analyze_content -> extract_web_results", "Una tool genérica se parte en extraer datos, resumir y verificar un claim contra su fuente."),
      step("Releer el system prompt", "Una frase suelta puede asociar una palabra con la tool equivocada."),
    ],
  },
  "2.2": {
    title: "Qué hace el agente con el objeto de error",
    layout: "program",
    steps: [
      step("La tool no esconde el fallo en una frase", "{ isError: true, errorCategory, isRetryable, description }"),
      ask("¿Cuál es errorCategory?", null, [
        path("transient", "isRetryable true. Se repite la misma llamada. Un timeout entra aquí.", "warn", "end"),
        path("validation", "El input está mal. Se corrige y se llama distinto. No se repite igual.", "accent", "end"),
        path("permission", "No hay acceso. No se reintenta. Se le dice al usuario.", "bad", "end"),
        path("business", "Rompe una política, por ejemplo el tope de una devolución. Se explica o se escala.", "bad", "end"),
      ]),
      ask("¿Llegó una lista vacía?", "[] con la llamada exitosa y un timeout no son el mismo resultado.", [
        path("isError es false y content es []", "La búsqueda corrió y no hubo filas.", "good", "end"),
        path("Hubo timeout y alguien devolvió []", "El informe diría que no existe investigación. El fallo tiene que volver como error.", "bad", "end"),
      ]),
    ],
  },
  "2.3": {
    title: "La llamada, con las tools y tool_choice que le tocan",
    layout: "program",
    steps: [
      step("Armar la lista del rol, no la de todo el sistema", "tools = tools_de_busqueda  # 4 o 5, no 18", "Un sintetizador con buscador web se pone a buscar."),
      ask("¿Qué dice tool_choice en esta llamada?", null, [
        path("auto", "El modelo puede contestar con texto y no llamar a nadie.", "warn", "end"),
        path("any", "Tiene que llamar alguna tool, y elige cuál.", "accent", "end"),
        path("{ type: 'tool', name: 'extract_metadata' }", "Esta llamada no puede saltarse ese paso. El enriquecimiento va en el turno siguiente.", "good", "end"),
      ]),
      step("Si una tool es genérica, se cambia por una con validación", "fetch_url -> load_document(url)", "load_document rechaza una URL que no es un documento."),
    ],
  },
  "2.4": {
    title: "Qué lee Claude Code al conectar los servidores",
    layout: "program",
    steps: [
      step("Leer los servidores del equipo", ".mcp.json -> { github: { token: '${GITHUB_TOKEN}' } }", "El archivo se commitea. El secreto queda en el entorno de cada persona."),
      step("Leer los servidores de esta persona", "~/.claude.json", "Pruebas y servidores personales no entran al repo."),
      step("Al conectar, descubrir todas las tools", "tools = union(servidores)", "Quedan disponibles a la vez. El total importa."),
      ask("¿La integración ya existe, como Jira?", null, [
        path("Sí", "Se usa el servidor de la comunidad.", "good", "end"),
        path("El flujo es solo de este equipo", "Ahí se escribe un servidor custom.", "accent", "end"),
      ]),
      ask("¿Hace falta el catálogo o una acción?", null, [
        path("Catálogo", "Se lee un resource: issues, docs, esquema.", "accent", "end"),
        path("Acción", "Se llama una tool. Si su descripción es una línea, el agente puede ignorarla y usar Grep.", "warn", "end"),
      ]),
    ],
  },
  "2.5": {
    title: "Buscar y después editar",
    layout: "program",
    steps: [
      ask("¿Qué estoy buscando?", null, [
        path("Un texto dentro de los archivos", "Grep('processRefund'). Después Read del archivo que apareció.", "accent", "next"),
        path("Un nombre de archivo", "Glob('**/*.test.tsx').", "accent", "end"),
      ]),
      step("Seguir el flujo desde lo que Grep encontró", "Read(archivo); seguir imports", "No se lee el repositorio entero al empezar."),
      ask("¿El texto que quiero cambiar aparece una sola vez?", null, [
        path("Sí", "Edit usa ese texto como ancla.", "good", "end"),
        path("return null; está en seis funciones", "Edit falla o cambia la que no era. Se hace Read del archivo completo y Write con el contenido nuevo.", "bad", "end"),
      ]),
    ],
  },
  "3.1": {
    title: "Qué memoria carga Claude Code al abrir la carpeta",
    layout: "program",
    steps: [
      step("Cargar la memoria de la persona", "~/.claude/CLAUDE.md", "Solo en esta máquina, en todos sus proyectos. Git no lo reparte."),
      step("Cargar la memoria del repositorio", "CLAUDE.md del proyecto", "Quien clona lo recibe."),
      step("Cargar la memoria de la carpeta de trabajo", "CLAUDE.md del directorio", "Aplica a quien trabaja ahí."),
      step("Resolver los imports de ese archivo", "@import ./paquetes/api/estandar.md", "El paquete de la UI no carga el estándar de la API."),
      ask("¿Alguien del equipo no está recibiendo una instrucción?", null, [
        path("/memory no la muestra en el proyecto", "Está en el archivo personal. Se mueve al CLAUDE.md del repo.", "bad", "end"),
        path("/memory la muestra en el proyecto", "La instrucción ya viaja con el git.", "good", "end"),
      ]),
    ],
  },
  "3.2": {
    title: "Qué se carga según cómo llega la tarea",
    layout: "program",
    steps: [
      step("Toda sesión carga CLAUDE.md antes del primer mensaje", "contexto += CLAUDE.md", "Un procedimiento de cuarenta pasos escrito aquí se paga también al corregir una coma."),
      ask("¿La persona escribió un slash command?", null, [
        path("/review-pr y el archivo está en .claude/commands/", "Lo tiene todo el equipo al clonar.", "good", "end"),
        path("El archivo está en ~/.claude/commands/", "Solo lo dispara quien lo creó.", "accent", "end"),
      ]),
      ask("¿La tarea pide un skill?", null, [
        path("Falta el argumento", "argument-hint se lo pide a la persona antes de seguir.", "warn", "next"),
        path("La salida es larga", "context: fork lo corre en un subagente. La conversación se queda el resumen.", "accent", "next"),
        path("allowed-tools lista Read y Write", "Durante el skill no puede usar otras tools.", "good", "end"),
      ]),
      step("Un skill personal no pisa el del equipo", "~/.claude/skills/<otro-nombre>/SKILL.md"),
    ],
  },
  "3.3": {
    title: "Antes de editar, se decide qué reglas entran",
    layout: "program",
    steps: [
      step("Claude va a tocar un archivo", "archivo = 'src/components/Button.test.tsx'"),
      step("Mirar los globs de .claude/rules/", "paths: ['**/*.test.tsx']"),
      ask("¿El archivo coincide con el glob?", null, [
        path("Sí, esté en la carpeta que esté", "Se carga la convención de Testing Library.", "good", "end"),
        path("Es un archivo de estilos", "Esa regla no entra al contexto.", "accent", "end"),
        path("Mañana el test se mueve de carpeta", "El glob sigue coincidiendo. La regla no iba por ubicación.", "good", "end"),
      ]),
      step("Un CLAUDE.md dentro de /tests no ve este archivo", "Button.test.tsx vive junto al componente, no dentro de /tests."),
    ],
  },
  "3.4": {
    title: "Plan mode o editar ya",
    layout: "program",
    steps: [
      ask("¿El cambio toca muchos archivos o el diseño sigue abierto?", null, [
        path("Migración de más de 45 archivos, o dos formas de integrar", "Entra plan mode. El Explore subagent devuelve el mapa y el chat no se llena de listas.", "accent", "next"),
        path("Un bug de un archivo, con el stack trace claro", "Se edita directo. Un plan aquí solo agrega demora.", "good", "end"),
      ]),
      step("Con el plan cerrado, implementar", "Ejecución directa de lo que ya se decidió", "Empezar a editar la migración antes de este paso obliga a deshacer cuando aparece un servicio que compartía el tipo."),
    ],
  },
  "3.5": {
    title: "La vuelta siguiente, con lo que falló",
    layout: "program",
    steps: [
      ask("¿La misma prosa da un formato distinto en cada corrida?", null, [
        path("Sí", "Se pegan 2 o 3 pares de entrada y salida, incluido el caso con el campo vacío.", "accent", "next"),
      ]),
      step("Escribir el test antes de la implementación", "assert formato(linea_nula) == salida_esperada"),
      ask("¿El test falla?", null, [
        path("Sí", "Ese fallo se pega en el mensaje siguiente y se vuelve a pedir.", "warn", "next"),
        path("Pasa", "Esta transformación ya quedó fija.", "good", "end"),
      ]),
      ask("¿Los problemas se afectan entre sí?", null, [
        path("El nulo y el formateador que asume una fecha", "Van en el mismo mensaje.", "accent", "end"),
        path("Un bug de estilos, aparte", "Se resuelve en el mensaje siguiente, no en este.", "good", "end"),
      ]),
      step("Si el diseño todavía tiene huecos, preguntar antes de codear", "El patrón entrevista pide, por ejemplo, cómo se invalida la caché."),
    ],
  },
  "3.6": {
    title: "El job de CI, paso a paso",
    layout: "program",
    steps: [
      step("El workflow llama a Claude sin teclado", "claude -p --output-format json --json-schema schema.json", "Sin -p, Claude pregunta qué archivo mirar y el job se queda esperando."),
      step("Un programa lee el JSON y comenta el pull request", "for hallazgo in json: comentar(pr, hallazgo.linea)"),
      ask("¿Qué instancia revisa el parche?", null, [
        path("La misma sesión que lo escribió", "Conserva su razonamiento y pasa por alto su propio fallo.", "bad", "end"),
        path("Una instancia nueva", "No arrastra ese razonamiento.", "good", "next"),
      ]),
      step("En el commit siguiente, el prompt trae lo ya dicho", "hallazgos_previos + 'reporta solo lo nuevo o lo que sigue abierto'"),
      step("Si el job genera tests, adjunta los que ya existen", "Así no propone escenarios cubiertos."),
    ],
  },
  "4.1": {
    title: "El revisor aplica un criterio, no un consejo",
    layout: "program",
    steps: [
      step("Llega un comentario del código", "comentario, codigo"),
      ask("¿El comentario describe un comportamiento que el código contradice?", "“Sé conservador” no es una pregunta que se pueda contestar sí o no.", [
        path("Sí, y el ejemplo de severidad alta coincide", "Se reporta con esa severidad.", "good", "end"),
        path("Es estilo, o un patrón local del equipo", "Se omite. El criterio ya lo lista como fuera de alcance.", "accent", "end"),
      ]),
      ask("¿Esta categoría está llena de falsos positivos?", null, [
        path("Sí", "Se desactiva mientras se reescribe su prompt. Si sigue encendida, dejan de leerse también los hallazgos buenos.", "bad", "end"),
      ]),
    ],
  },
  "4.2": {
    title: "Qué ejemplos entran en el prompt",
    layout: "program",
    steps: [
      step("Las instrucciones largas siguen dando resultados distintos", "Se pasa a few-shot."),
      step("Elegir de 2 a 4 casos en los que una persona dudaría", "Cada uno trae ubicación, problema, severidad, corrección, y por qué no la otra acción."),
      step("Agregar un caso que se parece y está bien", "Para que ese patrón no se marque."),
      ask("¿El ejemplo es obvio, o es el borde?", null, [
        path("Diez veces el mismo bug evidente", "No enseña la decisión. Ocupa contexto.", "bad", "end"),
        path("El caso ambiguo, con el formato de salida", "La corrida siguiente generaliza ese borde.", "good", "end"),
      ]),
    ],
  },
  "4.3": {
    title: "La extracción, del schema a lo que el schema no mira",
    layout: "program",
    steps: [
      step("Declarar el molde", "tax_id: string | null\ntipo: 'factura' | 'unclear' | 'other'\ndetalle: string", "Nullable si el documento puede no traer el dato. other más detalle si aparece una categoría nueva."),
      step("Pedir la salida con tool use y ese schema", "tool_choice fuerza extract_metadata si ese paso tiene que ir primero. any si hay varios schemas y no se sabe el tipo."),
      ask("¿El JSON es válido?", null, [
        path("Sí", "El schema ya garantizó comas, llaves y tipos.", "good", "next"),
      ]),
      ask("¿Los números y los campos ausentes tienen sentido?", null, [
        path("tax_id era obligatorio y la factura no lo trae", "El modelo escribe 000000 para cumplir el molde.", "bad", "end"),
        path("Las líneas no suman el total", "El JSON se guarda igual. Esa comparación no la hace el schema.", "warn", "end"),
      ]),
    ],
  },
  "4.4": {
    title: "Validar y decidir si se reintenta",
    layout: "program",
    steps: [
      step("Extraer y pasar el validador de forma", "Pydantic rechaza una fecha que no es AAAA-MM-DD", "La forma la mira el validador. El sentido, el código de después."),
      ask("¿Por qué falló?", null, [
        path("Formato, y el dato sí está en el documento", "Retry con tres cosas: el documento, la extracción fallida y el error concreto. '9 de marzo' pasa a 2026-03-09.", "good", "end"),
        path("La suma no cuadra y los números están", "Se comparan calculated_total y stated_total. Si difieren, se marca el registro. conflict_detected si dos fuentes chocan.", "warn", "end"),
        path("El impuesto no está en la factura", "Se devuelve null. Otra llamada no crea el dato.", "bad", "end"),
      ]),
    ],
  },
  "4.5": {
    title: "Elegir el canal y, si es lote, cómo reenviar",
    layout: "program",
    steps: [
      ask("¿Alguien está esperando este resultado para seguir?", null, [
        path("Sí: el check bloquea un merge", "Llamada síncrona. Un batch puede tardar hasta 24 h y no tiene plazo.", "good", "end"),
        path("No: es el informe de la noche", "Sigue hacia Message Batches.", "accent", "next"),
      ]),
      ask("¿Esta request necesita varias vueltas de tools?", null, [
        path("Sí", "El batch no las encadena dentro de una request. Se queda en síncrono.", "warn", "end"),
        path("No", "Se manda el lote. Cuesta 50 % respecto de la llamada síncrona.", "good", "next"),
      ]),
      step("Identificar cada documento y probar antes", "custom_id = nombre_de_archivo\nprobar(prompt, muestra_de_20)"),
      step("Reenviar solo lo que falló", "reenviar(custom_ids_fallidos)", "Si no cabía en el contexto, ese documento se parte y se manda de nuevo."),
      step("Si el tope es 30 horas, no se espera al lote único", "Cada lote puede tardar 24 h. Se envía uno cada 4 h. Peor caso: 4 de espera más 24 de proceso."),
    ],
  },
  "4.6": {
    title: "Quién revisa, y en qué orden",
    layout: "program",
    steps: [
      ask("¿La instancia que escribió el parche es la que lo revisa?", null, [
        path("Sí, aunque el prompt diga que sea minuciosa", "Recuerda por qué lo escribió y defiende ese fallo.", "bad", "end"),
        path("No: se abre otra instancia", "No tiene ese razonamiento. Sigue.", "good", "next"),
      ]),
      step("Primer pase, un archivo por vez", "hallazgos_locales = [revisar(archivo) for archivo in diff]", "Cada hallazgo entra en un schema, con una confianza."),
      step("Segundo pase, solo lo que cruza", "revisar_integracion(hallazgos_locales)", "Busca datos que salen de un archivo y entran en otro."),
      step("Enrutar con esa confianza", "Un pull request que bloquea el merge usa llamadas síncronas. Lo nocturno puede ir en batch."),
    ],
  },
  "5.1": {
    title: "Qué se manda en cada llamada cuando el chat ya es largo",
    layout: "program",
    steps: [
      step("Cada llamada vuelve a enviar la conversación", "client.messages.create(messages)", "El modelo no recuerda la llamada anterior por su cuenta."),
      ask("¿El historial ya no cabe, o se va a resumir?", null, [
        path("Sí", "Antes de resumir, copiar monto, fecha, id y estado a un bloque aparte.", "warn", "next"),
      ]),
      step("Armar el prompt de esta llamada", "prompt = case_facts + historial_resumido + tools_recortadas", "case_facts dice '48.20 USD, pedido 10091, prometido el 2 de abril'. El resumen puede decir solo que el cliente está molesto."),
      step("Recortar lo que devolvió la tool", "de 40 campos se guardan los 5 que la decisión usa"),
      step("En un input largo, poner los hallazgos al inicio", "El medio del texto es lo que más fácil se pierde. /compact achica la exploración y conserva decisiones y valores exactos."),
    ],
  },
  "5.2": {
    title: "Al llegar el mensaje, las preguntas van en este orden",
    layout: "program",
    steps: [
      step("Leer el mensaje", "La confianza que el modelo se asigna y el tono del cliente no entran en las preguntas."),
      ask("¿Pide una persona?", null, [
        path("“Pásame con alguien”", "Se escala en ese momento. No se sigue investigando.", "good", "end"),
        path("No lo pidió", "Se mira la política.", "accent", "next"),
      ]),
      ask("¿La política cubre lo que pide?", null, [
        path("Quiere el precio de un competidor y la política solo habla del propio sitio", "Se escala diciendo que la política no cubre el caso. No se redacta una excepción.", "warn", "end"),
        path("Sí está cubierto", "Se sigue.", "good", "next"),
      ]),
      ask("¿La búsqueda devolvió más de una ficha?", null, [
        path("Dos clientes llamadas Ana", "Se pide el correo o el número de pedido. No se elige la primera.", "accent", "end"),
        path("Una sola, y el agente sabe hacer el trámite", "Se resuelve, aunque el mensaje venga furioso. Si insiste en una persona, ahí se escala.", "good", "end"),
      ]),
    ],
  },
  "5.3": {
    title: "Un timeout dentro del sistema de varios agentes",
    layout: "program",
    steps: [
      step("La búsqueda hace timeout", "errorCategory = 'transient'"),
      step("El subagente reintenta una vez", "retry(misma_consulta)"),
      ask("¿La segunda vez también falla?", null, [
        path("Sí", "Al coordinador le llega tipo de fallo, consulta intentada, los papers que sí llegaron y una fuente alternativa.", "accent", "next"),
        path("Se devuelve []", "El informe diría que no hay investigación. Eso convierte el fallo en un éxito.", "bad", "end"),
        path("Se cancelan los demás subagentes", "Se tira el trabajo que ya estaba bien.", "bad", "end"),
      ]),
      step("El coordinador termina con lo que tiene", "informe.huecos += 'esta fuente no respondió'"),
    ],
  },
  "5.4": {
    title: "Dónde se guarda lo encontrado para poder seguir",
    layout: "program",
    steps: [
      step("Cada hallazgo concreto se escribe fuera del chat", "scratchpad.write('store = src/billing/store.ts')", "Así, una hora después, la respuesta cita esa clase y no 'lo que se suele hacer en React'."),
      step("Una pregunta larga se manda a un subagente", "resumen = subagente('tests del reembolso')", "El agente principal se queda la coordinación."),
      step("Al cerrar la fase, ese resumen abre la siguiente", "contexto_fase_2 = resumen_fase_1"),
      step("Cada agente exporta su estado", "manifest.write(agente, estado)"),
      ask("¿El proceso se cayó?", null, [
        path("Sí", "El coordinador lee el manifest y lo vuelve a poner en los prompts. No se empieza de cero.", "good", "end"),
        path("La salida ya es puro ruido", "/compact achica el contexto y deja las decisiones.", "accent", "end"),
      ]),
    ],
  },
  "5.5": {
    title: "Antes de saltarse a la persona que revisa",
    layout: "program",
    steps: [
      step("Medir por segmento, no solo el total", "acierto(proveedor_B)  # el global puede decir 97 % y este 70 %"),
      step("Calibrar el umbral con documentos ya etiquetados", "umbral[campo] = comparar(confianza_del_modelo, etiqueta_humana)"),
      step("Muestrear lo que el modelo marcó con confianza alta", "muestra estratificada por tipo de documento, al azar dentro de cada tipo"),
      ask("¿Esta extracción cruza el umbral y el segmento ya se midió?", null, [
        path("Confianza baja, o dos fuentes se contradicen", "Va a revisión humana. Se ordena para gastar primero esas horas.", "warn", "end"),
        path("Alta, y ese tipo de documento ya se midió", "Puede seguir sola.", "good", "end"),
        path("El 97 % global bastó para apagar la revisión", "El proveedor B sigue saliendo mal y nadie lo mira.", "bad", "end"),
      ]),
    ],
  },
  "5.6": {
    title: "De la fuente al informe, sin soltar el vínculo",
    layout: "program",
    steps: [
      step("El subagente devuelve la afirmación con su origen", "{ claim: '12 USD por caja', source: 'Catálogo 2026, tabla 2', fecha: '2026-03-01' }"),
      step("La síntesis copia el vínculo, no solo la frase", "Si se queda 'el precio es 12 USD', nadie puede volver a la tabla."),
      ask("¿Otra fuente creíble dice otra cifra?", null, [
        path("9 USD en un informe de 2022", "Se guardan las dos, con fecha. El coordinador reconcilia. Puede ser un cambio en el tiempo, no un error.", "warn", "next"),
        path("Se elige 12 porque suena más actual", "El 9 desaparece y el conflicto queda escondido.", "bad", "end"),
      ]),
      ask("¿El documento dice lo que están preguntando?", null, [
        path("La ventana de devolución no aparece", "La respuesta dice que no está. No se completan 30 días 'porque es lo habitual'.", "good", "end"),
        path("Sí aparece", "Se cita el extracto, en el formato que le toca: tabla para cifras, prosa para una noticia.", "accent", "end"),
      ]),
    ],
  },
};
