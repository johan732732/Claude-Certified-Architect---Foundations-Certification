window.CCARF = window.CCARF || {};

// Un solo caso, el pedido 10091, recorre las 30 lecciones.
// Cada puente aplica la lección de hoy y señala solo lecciones anteriores.
CCARF.bridges = {
  "1.1": {
    title: "El cliente pregunta por el reembolso y el programa no adivina el final",
    beats: [
      "El cliente pregunta si ya salió el reembolso del pedido 10091.",
      "Claude se detiene con stop_reason tool_use y pide lookup_order. El programa ejecuta esa herramienta.",
      "Guarda el mensaje del asistente tal como volvió y agrega un tool_result con el mismo id: emitido el 3 de marzo, 48.20 USD.",
      "Vuelve a llamar. Esta vez stop_reason es end_turn y el texto cita esa fecha y ese monto.",
    ],
    now: "El bucle termina porque el campo lo dice. Una frase de despedida en el texto no cierra nada, y un tope de vueltas solo corta: no completa la tarea.",
    base: "Este bucle es el piso. Las lecciones siguientes le ponen piezas encima: quién reparte el trabajo, qué puede pedir cada herramienta y qué reglas el código no deja saltar.",
  },
  "1.2": {
    title: "Tres preguntas, un centro y un hueco que se vuelve a encargar",
    beats: [
      "El mensaje pide tres cosas: el estado del 10091, si la política cubre una segunda devolución y un borrador de respuesta.",
      "El coordinador manda cada parte a un subagente. Ninguno ve el encargo de los demás ni se hablan entre sí.",
      "Al juntar las notas falta la fecha del reembolso. El coordinador vuelve a encargar solo esa fecha.",
      "La segunda síntesis ya la tiene. El ajuste salió del centro, que es quien ve el mapa completo.",
    ],
    now: "Un hueco se re-delega. Si una zona del tema no aparece, se revisa la partición del coordinador, no al subagente que cumplió el recorte que le dieron.",
    links: [
      { id: "1.1", text: "Cada subagente, por dentro, es ese bucle: trabaja hasta que stop_reason es end_turn y le devuelve la nota al coordinador." },
    ],
  },
  "1.3": {
    title: "La síntesis solo sabe lo que le pegaron en el prompt",
    beats: [
      "Estado del pedido y dirección de envío no se necesitan entre sí. Salen dos llamadas Task en la misma respuesta.",
      "El agente de síntesis no busca. En su prompt van las dos notas completas, y 48.20 USD viaja con la URL del sistema de pedidos.",
      "Puede escribir “salió el 3 de marzo, según el sistema de pedidos” porque el dato y la fuente llegaron juntos.",
      "Si el prompt dice “usa lo que encontró el de búsqueda” y no pega las notas, completa con algo plausible: no ve la otra conversación.",
    ],
    now: "Un subagente solo ve el prompt de esa llamada. Los hallazgos van completos, y cada afirmación va con su fuente.",
    links: [
      { id: "1.1", text: "Esas notas son tool_result de un bucle que ya cerró con end_turn. Sin ese resultado en el historial, no hay nada que copiar." },
      { id: "1.2", text: "El coordinador sigue siendo el único que junta. Task es la herramienta con la que llama, y su allowedTools tiene que incluirla." },
    ],
  },
  "1.4": {
    title: "La devolución espera la identidad, y la persona recibe cuatro datos",
    beats: [
      "El cliente pide un reembolso y, en el mismo mensaje, un cambio de dirección. El flujo lo parte en dos ítems.",
      "process_refund llega antes de que get_customer deje un customer_id verificado. El código la rechaza y no se reintenta.",
      "Después de verificar, la devolución sigue. La respuesta al cliente es una sola.",
      "Lo que cierra una persona llega con el id, la causa, el monto y la acción. No tiene que leer el transcript.",
    ],
    now: "Escribir “NUNCA devuelvas sin verificar” baja los fallos y no los elimina. Si la regla es de cumplimiento total, el cerrojo es código.",
    links: [
      { id: "1.1", text: "El rechazo vuelve como tool_result. El bucle sigue y el modelo ve que esa llamada no se ejecutó." },
      { id: "1.2", text: "Partir el mensaje en dos ítems es la partición de siempre: cada preocupación tiene dueño y ninguna se pierde al juntar." },
      { id: "1.3", text: "El handoff copia a propósito lo que la persona necesita. Quien no tiene el transcript no puede acordarse de nada." },
    ],
  },
  "1.5": {
    title: "800 USD no se ejecutan, y la fecha llega en un solo formato",
    beats: [
      "El modelo arma process_refund con amount 800.",
      "Antes de ejecutar, el hook ve que pasa de 500 USD, bloquea la llamada y deja el caso en manos de una persona. La tool no corre.",
      "En otra herramienta, un servidor devuelve la fecha como número Unix y otro como ISO 8601.",
      "PostToolUse las deja en 2026-03-09, y un estado ya traducido, antes de que el modelo lea nada.",
    ],
    now: "Umbral, orden y formato único son garantías: van en un hook, en un momento fijo. El tono de la respuesta se queda en el prompt.",
    links: [
      { id: "1.4", text: "El cerrojo de identidad y este umbral son la misma familia. Los dos rechazan en código, no con una frase en mayúsculas." },
      { id: "1.1", text: "Aunque el hook bloquee, el modelo recibe un resultado en el historial y el bucle decide el paso siguiente. No se corta el programa a ojo." },
    ],
  },
  "1.6": {
    title: "Revisar el agente no es lo mismo que explorar un legado desconocido",
    beats: [
      "Hay que revisar el código del agente de reembolsos. Ya se sabe qué mirar: bugs locales, contratos entre funciones y nombres.",
      "Cada archivo va en su pase. Un segundo pase lee solo los hallazgos y busca datos que salen de un archivo y entran en otro.",
      "Otro encargo, “agrega tests a este legado”, no trae esa lista. El primer paso es mapear. El plan se reescribe si aparece una dependencia nueva.",
      "Pegar los 14 archivos en un solo prompt y pedir un veredicto no parte el trabajo: lo que cruza entre archivos no tiene un pase propio.",
    ],
    now: "Si los trozos se conocen de antemano, la cadena es fija. Si al empezar no se sabe qué hay, el plan se adapta. Una cadena escrita ayer, sobre un repo que nadie ha visto, trata un problema abierto como un trámite.",
    links: [
      { id: "1.2", text: "Partir y volver a mirar el hueco es el trabajo del coordinador. Aquí los especialistas son pasos, y el fallo sigue estando en el recorte, no en quien cumplió el suyo." },
      { id: "1.1", text: "Cada paso, si es un agente, sigue parando por stop_reason. La cadena ordena el trabajo. No reemplaza el bucle." },
    ],
  },
  "1.7": {
    title: "El martes el código ya no es el del lunes",
    beats: [
      "La sesión billing-refactor guardó el lunes el plan del agente de reembolsos.",
      "El martes se reanuda con --resume y el mensaje dice que cambió src/invoice.ts. Claude relee ese archivo y sigue el plan.",
      "Para probar dos diseños del handoff sin perder el análisis común, fork_session abre una rama y deja la sesión original intacta.",
      "Si alguien cambió el tipo de retorno y se reanuda en silencio, el modelo arregla el tipo viejo que los tool results todavía muestran. Ahí tocaba una sesión nueva, con las decisiones que siguen en pie.",
    ],
    now: "Reanudar conserva el contexto, y eso solo sirve si ese contexto todavía describe el código. Un cambio no avisado contamina el juicio.",
    links: [
      { id: "1.1", text: "Lo que se conserva son los mensajes y los tool_result. Por eso un resultado viejo sigue diciendo un tipo que el archivo ya no tiene." },
      { id: "1.3", text: "fork_session parte una sesión para probar otro enfoque. Varias llamadas Task crean especialistas que no comparten conversación. Una no reemplaza a la otra." },
    ],
  },
  "2.1": {
    title: "lookup_order y search_policy dejan de llamarse igual",
    beats: [
      "Las dos herramientas decían “consulta información”. El modelo usaba una para el pedido y la otra para el manual, al revés.",
      "lookup_order queda descrita con el id de pedido, un ejemplo, el caso de un id que no existe y la frontera: pedidos, no el PDF de la política.",
      "search_policy dice que busca en el manual y que no sirve para saber si un envío salió.",
      "Ante “¿ya salió el reembolso del 10091?”, el modelo pide lookup_order porque el menú ya las distingue.",
    ],
    now: "Claude elige leyendo la descripción, no el código de la función. Agregar few-shot al system prompt no arregla dos descripciones iguales.",
    links: [
      { id: "1.1", text: "La elección ocurre en el turno que termina en tool_use. Una descripción ambigua manda ese tool_use a la función equivocada." },
      { id: "1.3", text: "La descripción también es lo que el coordinador lee para decidir cuándo llamar a un subagente. Si dice lo mismo que otra, elige mal." },
    ],
  },
  "2.2": {
    title: "Un timeout no es un pedido que no existe",
    beats: [
      "lookup_order no contesta. Devuelve isError, categoría transient, isRetryable en true y la frase “reintenta la misma llamada una vez”.",
      "La segunda vez trae el 3 de marzo y 48.20 USD.",
      "Otra llamada no tiene permiso sobre las facturas: categoría permission, isRetryable en false. El agente lo explica y no repite.",
      "Si el timeout hubiera vuelto como una lista vacía, el coordinador escribiría que el pedido no existe.",
    ],
    now: "Vacío de verdad es “corrí y no hay filas”. Timeout es “no pude correr”. La categoría le dice al agente cuál de los dos es, y si tiene sentido reintentar.",
    links: [
      { id: "1.1", text: "Ese objeto viaja como tool_result. El bucle no se rompe: el modelo lee el error y elige reintentar o explicar." },
      { id: "1.5", text: "Una devolución por encima del límite es un error de negocio. Tampoco se reintenta: se explica la regla, igual que el hook ya había bloqueado la llamada." },
    ],
  },
  "2.3": {
    title: "Quien redacta no puede irse a buscar, y el primer paso no se salta",
    beats: [
      "El agente de búsqueda ve lookup_order y search_policy. El de redacción no las ve.",
      "Si las viera, ante el borrador abriría páginas en vez de usar las notas que ya trajeron los demás.",
      "Al leer la factura, tool_choice obliga extract_metadata en el primer turno. El documento queda tipado antes de enriquecerlo.",
      "Con tool_choice en auto, el modelo puede escribir “esto es una factura” y no llamar a la herramienta.",
    ],
    now: "Cada agente ve las herramientas de su oficio, pocas y distintas. tool_choice obliga una tool cuando ese turno no puede contestarse solo con texto.",
    links: [
      { id: "2.1", text: "Repartir solo ayuda si cada descripción ya se distingue. Dieciocho descripciones parecidas se siguen confundiendo." },
      { id: "1.4", text: "Forzar extract_metadata y rechazar process_refund persiguen lo mismo: que un paso no se salte. Uno elige la tool. El otro la rechaza hasta tener el dato." },
      { id: "1.3", text: "El subagente solo usa lo que tiene en allowedTools. Sin Task, el coordinador no puede invocar a nadie." },
    ],
  },
  "2.4": {
    title: "El monto vive en otro sistema, y el token no viaja en git",
    beats: [
      "El estado del 10091 no está en el repo. Un servidor MCP lo publica como herramienta.",
      ".mcp.json del proyecto declara ese servidor con ${ORDERS_TOKEN}. El archivo se commitea. El token se queda en el entorno de cada persona.",
      "Un servidor a medio probar se anota en ~/.claude.json. El resto del equipo no lo hereda.",
      "La descripción dice que devuelve fecha y monto. El agente la prefiere frente a Grep, porque Grep no ve esa base.",
    ],
    now: ".mcp.json es del equipo y va a git, sin secretos. ~/.claude.json es personal. Jira de siempre usa un servidor de la comunidad. Uno escrito en casa se reserva para un flujo que ninguno existente cubre.",
    links: [
      { id: "2.1", text: "La tool de MCP se elige por su descripción, igual que lookup_order. Con una sola línea, el agente la ignora y usa otra cosa." },
      { id: "2.2", text: "Si ese servidor hace timeout, la respuesta sigue siendo un error estructurado. MCP no cambia cómo se cuenta un fallo." },
      { id: "1.1", text: "Por dentro, la llamada al servidor es un tool_use más del bucle, con su tool_result y su stop_reason." },
    ],
  },
  "2.5": {
    title: "Encontrar el bucle en el repo, y cambiar solo el ancla",
    beats: [
      "Hay que ver dónde se arma el tool_result del 10091. Grep busca el texto tool_result dentro de los archivos.",
      "Glob, con un patrón como **/*.test.ts, encuentra si ese bucle tiene test. Glob mira el nombre del archivo. Grep mira el texto de adentro.",
      "Read abre el archivo. Edit cambia el trozo que aparece una sola vez. Write reescribiría el archivo entero.",
      "Un grep escrito en Bash también encuentra texto. En el examen, la herramienta para eso es Grep.",
    ],
    now: "Nombre de archivo, Glob. Texto dentro del archivo, Grep. Un trozo, Edit. El archivo completo, Write.",
    links: [
      { id: "2.4", text: "Grep mira el repo. La fecha y el monto del 10091 viven en el servidor MCP, así que ahí Grep no alcanza." },
      { id: "1.7", text: "Si el martes cambió invoice.ts, se relee con Read ese archivo. No hace falta volver a abrir el repositorio entero." },
    ],
  },
  "3.1": {
    title: "Los dos decimales son del equipo. El gusto personal, no",
    beats: [
      "“Los montos se citan con dos decimales, como 48.20” vale para quien clone el repo. Va en el CLAUDE.md del proyecto.",
      "“Yo prefiero respuestas cortas” va en el CLAUDE.md del usuario. Si se commitea, se le impone a todo el equipo.",
      "Una nota que solo importa dentro de la carpeta de pagos va en el CLAUDE.md de esa carpeta.",
      "Un CLAUDE.md enorme se parte. Lo que no aplica a la tarea de hoy no tiene por qué cargarse siempre.",
    ],
    now: "Proyecto, usuario y carpeta no son el mismo público. Poner la instrucción en el archivo equivocado es “a mí me funciona y al resto no”.",
    links: [
      { id: "2.4", text: "La misma frontera: lo del equipo se comparte (.mcp.json, CLAUDE.md del proyecto) y lo personal se queda en casa (~/.claude.json, CLAUDE.md del usuario)." },
      { id: "1.3", text: "CLAUDE.md es contexto escrito a propósito. Un subagente no hereda el chat: si necesita esta regla, hay que incluirla en su prompt." },
    ],
  },
  "3.2": {
    title: "El handoff como comando, y la revisión dudosa como skill",
    beats: [
      "/reembolso vive en .claude/commands/ del repo. Quien lo escribe dispara el texto: arma el handoff con id, causa, monto y acción.",
      "El mismo archivo en ~/.claude/commands/ es solo de una persona, y conviene que no se llame igual que el del equipo.",
      "El procedimiento largo para un caso dudoso vive en .claude/skills/revision-caso/SKILL.md. Claude lo usa cuando la tarea es esa.",
      "Poner ese procedimiento en CLAUDE.md lo cargaría también al renombrar una variable.",
    ],
    now: "Un comando lo dispara una persona. Un skill lo elige Claude cuando la tarea encaja. CLAUDE.md entra en toda sesión, haga falta o no.",
    links: [
      { id: "3.1", text: "CLAUDE.md sigue siendo la memoria de siempre. El skill existe para no meter ahí un procedimiento que solo a veces hace falta." },
      { id: "1.4", text: "El texto del comando puede recordar los cuatro campos del handoff. Recordar no es el cerrojo: el cerrojo de la identidad sigue en código." },
    ],
  },
  "3.3": {
    title: "La regla de tests entra al editar el test, y solo entonces",
    beats: [
      ".claude/rules/testing.md tiene paths: **/*.test.ts. Dice que los tests del bucle mockean la API y no llaman a la red.",
      "Al editar loop.test.ts, esa regla se carga. Al editar refund.ts, no ocupa contexto.",
      "Un CLAUDE.md puesto dentro de /tests no ve un test que vive junto al componente, fuera de esa carpeta.",
    ],
    now: "El glob decide cuándo entra la regla. La ubicación de un CLAUDE.md decide otra cosa: la carpeta y lo que hay debajo.",
    links: [
      { id: "3.1", text: "El CLAUDE.md de una carpeta llega por el lugar del archivo. La rule llega por el patrón, aunque el archivo coincidente esté en otra carpeta." },
      { id: "3.2", text: "Nadie escribe / para dispararla. Se carga sola cuando el archivo que se edita coincide con el glob." },
    ],
  },
  "3.4": {
    title: "Cambiar el 500 es directo. Entender por qué a veces no verifica, no",
    beats: [
      "“Cambia el umbral de 500 a 400 en esta constante” cabe en un archivo y la causa está clara. Se edita ya.",
      "“A veces devuelve sin verificar” es grande y el diseño no está cerrado. Plan mode investiga y propone, y todavía no edita.",
      "La lista de todos los lugares donde se llama process_refund la trae el Explore subagent, ya resumida.",
      "Así la conversación principal no se llena de nombres de archivos.",
    ],
    now: "Cambio chico y claro: ejecución directa. Cambio grande o diseño abierto: plan mode. La búsqueda ruidosa no se queda en el chat principal.",
    links: [
      { id: "1.6", text: "Es la misma bifurcación de la descomposición. Lo conocido se ejecuta como trámite. Lo abierto se planifica y el plan se puede reescribir." },
      { id: "1.2", text: "El Explore subagent es un especialista: busca y le devuelve el resumen al centro. No conversa con los demás." },
    ],
  },
  "3.5": {
    title: "La respuesta al cliente deja de salir en un formato distinto cada vez",
    beats: [
      "“Explícale al cliente el estado del 10091” produce un formato distinto en cada corrida. Un párrafo más largo no lo fija.",
      "Dos o tres ejemplos de entrada y salida sí fijan la transformación.",
      "Un test que exige los dos decimales falla. Ese fallo, no una opinión, es lo que se le pasa en la vuelta siguiente.",
      "Antes de codear el handoff, si nadie decidió cómo se invalida la verificación, se le pide a Claude que pregunte eso primero.",
    ],
    now: "Si la prosa no estabiliza la salida, se pasa a ejemplos. Si se puede escribir un test, el fallo del test guía la vuelta siguiente. Si el diseño tiene huecos, se pregunta antes de implementar.",
    links: [
      { id: "3.4", text: "Plan mode deja las decisiones escritas. La pregunta de antes de codear cubre lo que ese plan todavía tiene en blanco." },
      { id: "1.4", text: "Preguntar cómo se invalida la verificación evita construir un cerrojo que después no se puede soltar." },
    ],
  },
  "3.6": {
    title: "El pull request se revisa sin nadie delante del teclado",
    beats: [
      "El job corre claude -p sobre el PR del agente. No hace preguntas, porque en CI no hay quien conteste.",
      "--output-format json junto con --json-schema devuelve los hallazgos. Otro programa los convierte en comentarios del PR.",
      "Quien escribió el bucle no es quien lo revisa en ese job. Es otra instancia, sin el razonamiento de quien lo escribió.",
      "Si el job genera tests, le adjuntan los que ya existen para que no proponga los mismos escenarios.",
    ],
    now: "En CI se usa -p y un JSON con schema. El revisor es otra instancia, no la sesión que escribió el código.",
    links: [
      { id: "3.4", text: "En la laptop, plan mode puede preguntar. En CI no hay teclado, así que -p no pregunta: imprime y termina." },
      { id: "1.7", text: "Otra instancia es una sesión nueva. Reanudar la sesión que escribió el código le deja encima el razonamiento que conviene no tener." },
    ],
  },
  "4.1": {
    title: "“Sé conservador” marca un ruido distinto en cada corrida",
    beats: [
      "El revisor del código marca “comentario impreciso” de una forma en la mañana y de otra en la tarde. La instrucción era “sé conservador”.",
      "El criterio nuevo se puede cumplir o no: marca un comentario solo cuando el comportamiento que describe contradice el código.",
      "“El reembolso sale el 3 de marzo”, al lado de un código que usa otra fecha, sí se marca.",
      "Un comentario que solo es breve no se marca. Antes, a veces sí.",
    ],
    now: "Un criterio dice qué se reporta, qué se omite y cómo se llama la gravedad. Una preferencia vaga fabrica falsos positivos distintos cada vez.",
    links: [
      { id: "3.6", text: "Ese criterio es el que el job de CI aplica. Sin él, el JSON del pull request se llena de ruido que cambia de corrida en corrida." },
      { id: "1.5", text: "Ya se separaba garantía de preferencia de tono. Aquí la garantía es de calificación: la regla tiene que poder marcarse como cumplida o no cumplida." },
    ],
  },
  "4.2": {
    title: "Tres casos dudosos, no diez casos fáciles",
    beats: [
      "Con el criterio escrito, dos corridas todavía discrepan en un comentario que casi contradice el código.",
      "Se pegan de 2 a 4 ejemplos, los casos en los que una persona dudaría.",
      "Cada uno trae ubicación, problema, severidad, corrección y por qué no la otra acción.",
      "Se agrega un caso que se parece y está bien, para que ese patrón no se marque. Repetir diez veces un ejemplo fácil no enseña el borde.",
    ],
    now: "Few-shot se usa cuando la instrucción, aunque sea larga, sigue dando resultados distintos. Pocos ejemplos, los dudosos, con la salida completa.",
    links: [
      { id: "4.1", text: "Los ejemplos enseñan el criterio. No lo reemplazan. Sin la regla explícita, el modelo imita el formato y sigue sin saber qué marcar." },
      { id: "3.5", text: "Es el mismo recurso del refinamiento: ejemplos de entrada y salida cuando un párrafo no fija la transformación." },
    ],
  },
  "4.3": {
    title: "La factura sale en JSON válido, y aun así puede sumar mal",
    beats: [
      "La extracción del pedido pide fecha, monto y estado con tool use y un JSON schema.",
      "El JSON viene bien formado: la fecha es string y el monto es número. Comas y llaves dejan de ser el problema.",
      "Una extracción puede decir 48.2, o una suma que no cierra, y seguir siendo un JSON válido.",
      "El molde no mira si los números tienen sentido. Esa comprobación es otra capa.",
    ],
    now: "El schema asegura la forma. El sentido de los datos no entra en el molde.",
    links: [
      { id: "2.2", text: "El error estructurado ya era un objeto con campos fijos. El schema le pone el mismo tipo de molde a la salida del modelo." },
      { id: "1.1", text: "Pedir la salida como tool use encaja en el bucle: el modelo llama una tool de entrega y el programa lee esos campos." },
      { id: "3.6", text: "El job de CI ya pedía --json-schema para que otro programa pudiera leer los hallazgos sin interpretar prosa." },
    ],
  },
  "4.4": {
    title: "La fecha se corrige porque estaba. El monto que no está, no aparece",
    beats: [
      "El schema aceptó la fecha. Un validador aparte exige AAAA-MM-DD y rechaza “3 de marzo”.",
      "El retry vuelve a llamar con tres cosas: el documento original, la extracción que salió mal y el error concreto.",
      "La segunda llamada deja la fecha en 2026-03-09, porque el dato sí estaba en el documento.",
      "Si el documento no trae el monto, repetir la llamada no lo crea. La respuesta dice que no está.",
    ],
    now: "Validar es después de responder. El retry corrige un formato o una estructura. No inventa un dato ausente.",
    links: [
      { id: "4.3", text: "Primero el schema, que mira el molde. Después este validador, que mira la regla. Un JSON válido puede seguir fallando aquí." },
      { id: "2.2", text: "El error que viaja en el retry dice qué falló y qué hacer. “Operation failed”, sin eso, no le da al modelo nada que corregir." },
      { id: "1.1", text: "Cada retry es otra vuelta del bucle, con el fallo agregado al historial. No es un tope de intentos usado como manera de dar por terminada la tarea." },
    ],
  },
  "4.5": {
    title: "Dos mil facturas, cada una con su identificador",
    beats: [
      "Hay 2.000 facturas como la del 10091. Cada petición del lote lleva un custom_id, por ejemplo pedido-10091, para saber qué respuesta es de qué documento.",
      "Message Batches cuesta la mitad que la llamada que espera la respuesta ya. A cambio, el lote puede tardar hasta 24 horas y no hay un plazo garantizado.",
      "Si el tope es 30 horas, no se manda un solo lote al final del día. Se manda uno cada 4 horas. El peor caso es 4 de espera más 24 de proceso.",
      "Si una petición falla, se reenvía con el mismo custom_id. Dentro de una petición del lote no se encadenan varias vueltas de herramientas.",
    ],
    now: "El lote es para mucho volumen, después y más barato. La llamada síncrona es para lo que alguien está esperando. custom_id casa cada respuesta con su documento.",
    links: [
      { id: "4.4", text: "El retry de una extracción en vivo ocurre en la misma conversación. Reenviar un ítem del lote es otra petición, reconocible porque conserva el custom_id." },
      { id: "1.1", text: "El bucle con varias vueltas de tools no cabe dentro de una petición del lote. Eso se hace en la llamada que espera." },
    ],
  },
  "4.6": {
    title: "Quien escribió process_refund no es quien lo revisa",
    beats: [
      "La sesión que escribió el cerrojo tiende a defenderlo. Pedirle “revísate”, o activar el pensamiento extendido ahí mismo, no la deja en blanco.",
      "Otra instancia, sin ese historial, lee el diff y marca que la identidad se puede saltar.",
      "Un pull request que bloquea el merge usa llamadas síncronas: alguien está esperando.",
      "El barrido nocturno de las 2.000 facturas puede ir en batch. Nadie está delante esperando esa respuesta.",
    ],
    now: "Quien escribe y quien revisa no comparten contexto. Síncrono cuando hay que esperar. Batch cuando puede tardar.",
    links: [
      { id: "3.6", text: "El job de CI ya separaba las instancias. La razón es esta: quien escribió conserva el razonamiento y lo defiende." },
      { id: "4.5", text: "Batch es el canal de lo que no bloquea a nadie. El revisor de un PR que frena el merge no puede esperar hasta 24 horas." },
      { id: "1.7", text: "Una instancia nueva no es --resume. Reanudar traería el razonamiento que estorba para revisar." },
    ],
  },
  "5.1": {
    title: "A los 30 turnos, 48.20 no puede convertirse en “un monto aproximado”",
    beats: [
      "Cada llamada reenvía la conversación entera. El modelo no recuerda la llamada anterior por su cuenta.",
      "El resumen de una conversación larga deja “un monto aproximado”. El cliente había dicho 48.20 USD.",
      "Los case facts se pegan en cada prompt, fuera del resumen: pedido 10091, 48.20 USD, 3 de marzo, estado emitido.",
      "En un documento largo, los hallazgos van al inicio. El medio es lo que más fácil se pierde.",
    ],
    now: "Lo que no puede volverse vago vive en un bloque que el resumen no toca: números, fechas, ids y estados, escritos tal cual.",
    links: [
      { id: "1.1", text: "El historial que el bucle reenvía es esta conversación. Si el resumen cambia el monto, el siguiente tool_use razona con un dato que el tool_result ya no dice." },
      { id: "1.3", text: "Copiar el dato completo, y no un “usa lo de antes”, es la misma regla del prompt del subagente." },
      { id: "4.4", text: "El retry también reenviaba el documento original junto con el error. Aquí lo que no se puede perder son los case facts." },
    ],
  },
  "5.2": {
    title: "Tres motivos para pasar el caso, y dos que no cuentan",
    beats: [
      "El cliente escribe “pásame con una persona”. Se escala, aunque el modelo sepa la respuesta.",
      "Pide algo que la política de la empresa no cubre. Se escala: no hay una rama de la política para resolverlo.",
      "La búsqueda devuelve dos personas llamadas Ana López y no hay cómo saber cuál es. Se escala.",
      "Que esté enojado, o que el modelo se asigne un 90 % de confianza, no es ninguna de esas tres preguntas.",
    ],
    now: "Se escala si lo pide la persona, si la política no cubre el caso o si hay varias coincidencias y no se puede elegir. El enojo y la confianza autoasignada no miden la dificultad.",
    links: [
      { id: "1.4", text: "Escalar sin id, causa, monto y acción obliga a la persona a rehacer la investigación. Esos cuatro campos ya eran el handoff." },
      { id: "1.5", text: "“Más de 500 USD” es una regla que el hook puede bloquear solo. “La política no cubre esto” es un motivo de escalado cuando no hay una regla así de cerrada." },
      { id: "5.1", text: "Lo que se le entrega a la persona sale de los case facts, no de un resumen que ya dijo “un monto aproximado”." },
    ],
  },
  "5.3": {
    title: "Cayó la política, y el estado del pedido no se tira",
    beats: [
      "El subagente de política hace timeout. Antes de avisar, reintenta él mismo, porque el fallo es transitorio.",
      "Sigue sin contestar. Le devuelve al coordinador el tipo de fallo, la consulta que intentó, las notas que sí llegaron y una alternativa.",
      "El estado del 10091, que trajo el otro subagente, se conserva. El coordinador sigue y anota el hueco de la política.",
      "Si el aviso hubiera sido solo “fallé”, ese estado se pierde y hay que empezar de cero.",
    ],
    now: "Un fallo se propaga como un paquete útil. Lo parcial se conserva. Lo transitorio lo reintenta el subagente antes de propagar.",
    links: [
      { id: "2.2", text: "El paquete usa la misma idea del error estructurado: qué tipo de fallo fue, si se puede reintentar y qué queda por hacer." },
      { id: "1.2", text: "Quién decide el hueco es el coordinador. El subagente no le habla al de al lado para completar la nota que le falta." },
      { id: "1.3", text: "Lo que no se escribe en ese paquete no existe para el coordinador, igual que las notas que nadie pegó en el prompt del sintetizador." },
    ],
  },
  "5.4": {
    title: "El repo es grande y el modelo empieza a hablar de “lo que se suele hacer”",
    beats: [
      "Tras muchas búsquedas, Claude dice que el cerrojo “normalmente va en el prompt”. Eso contradice el archivo que leyó una hora antes.",
      "Un scratchpad anota la frase concreta: process_refund se rechaza en refund_guard.ts si no hay verified_customer_id.",
      "Cada agente exporta un manifest a un lugar conocido: consulta, hallazgos y qué queda pendiente.",
      "Si el proceso se cae, se retoma desde ese manifest. Seguir explorando sin anotar llena el contexto de nombres de archivos.",
    ],
    now: "Lo concreto se escribe fuera del chat para poder releerlo. El manifest es el estado con el que se retoma, no una sesión llena de búsquedas viejas.",
    links: [
      { id: "5.1", text: "El scratchpad evita que el resumen convierta el nombre del archivo y la condición en “algo del código”." },
      { id: "3.4", text: "El Explore subagent ya devolvía un resumen para no llenar el chat. El scratchpad es el lugar donde ese hallazgo queda escrito." },
      { id: "1.7", text: "Retomar desde el manifest no es reanudar una sesión cuyo código ya cambió. El manifest dice qué se sabía, y los archivos se vuelven a leer." },
    ],
  },
  "5.5": {
    title: "97 % en total, y la fecha de las facturas escaneadas en 70",
    beats: [
      "El modelo pone 0.93 de confianza en el monto del 10091. Ese número no se usa crudo.",
      "Se compara con documentos que una persona ya etiquetó, y de ahí sale el umbral. Por debajo del umbral, lo mira alguien.",
      "El acierto global es 97 %. En las facturas escaneadas, el campo fecha está en 70 %. El promedio lo escondía.",
      "La revisión humana se reserva para lo que queda bajo el umbral o en el segmento débil. No se revisa todo: es cara.",
    ],
    now: "La confianza se calibra contra etiquetas humanas y se mide por segmento. Un promedio alto no absuelve al campo o al tipo de documento que falla.",
    links: [
      { id: "5.2", text: "La confianza que el modelo se asigna tampoco decidía si el caso se escalaba. Aquí tampoco se usa sin calibrar." },
      { id: "4.1", text: "Hace falta un criterio explícito de qué cuenta como acierto. Sin eso, el 97 % no se sabe contra qué se midió." },
      { id: "4.6", text: "La persona que mira el segmento débil lee el caso sin el razonamiento de quien extrajo. Es un revisor independiente." },
    ],
  },
  "5.6": {
    title: "48.20 USD se puede volver a comprobar, y 50 USD no se esconde",
    beats: [
      "La síntesis dice que el reembolso del 10091 es 48.20 USD y copia el vínculo: sistema de pedidos, la tabla del 3 de marzo y la fecha en que se consultó.",
      "Otra fuente dice 50 USD, con su propia fecha. Las dos se conservan. El coordinador las reconcilia. No elige una en silencio.",
      "Si ningún documento dice el motivo del reembolso, la respuesta dice que no está.",
      "“El precio es 12 USD”, sin documento ni extracto, no se puede volver a comprobar.",
    ],
    now: "Cada afirmación viaja con su lugar y su fecha. Dos cifras distintas se conservan. Lo que el documento no dice, se dice que no está.",
    links: [
      { id: "1.3", text: "El hallazgo con su URL ya era esta regla, dentro del prompt del subagente. Aquí se exige también en la síntesis final." },
      { id: "5.1", text: "Los case facts conservan el número exacto. La procedencia dice de dónde salió, para poder volver a la tabla." },
      { id: "5.3", text: "Si una fuente falló, el hueco se anota. No se rellena con la otra fuente como si hubiera sido la única." },
      { id: "1.2", text: "Reconciliar las dos cifras es trabajo del coordinador. Es el único que ve las dos notas, porque los subagentes no se hablan." },
    ],
  },
};
