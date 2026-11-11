window.CCARF = window.CCARF || {};

// One short worked example per lesson, shown inside "Qué es, desde cero".
// Each example names a connection to an earlier lesson so the links build up.
CCARF.examples = {
  "1.1": {
    title: "Preguntar por un pedido",
    text: "Un agente de soporte recibe: “¿Cuándo llega mi pedido 10091?”. En la primera vuelta stop_reason es tool_use y Claude pide lookup_order. El programa devuelve el estado y lo agrega al historial. En la segunda vuelta stop_reason es end_turn y el texto dice “llega el jueves”. Si el programa buscara la palabra “llega” en el texto, podría cortar en la primera vuelta, cuando todavía no tenía el dato.",
    connect: "Es la base de todo el curso. Cada lección siguiente reparte, limita o revisa este mismo bucle.",
  },
  "1.2": {
    title: "Tres encargos, un centro",
    text: "Un coordinador recibe: “Resume el reembolso del 10091, la política de devoluciones y redacta una respuesta”. Manda la búsqueda de la orden a un subagente, la política a otro y el borrador a un tercero. Ninguno habla con los demás. Al leer las tres salidas, el coordinador ve que la política no dice el plazo del reembolso y vuelve a encargar solo esa pregunta.",
    connect: "Cada subagente corre su propio bucle de 1.1 hasta end_turn. El coordinador es el único que ve el mapa completo.",
  },
  "1.3": {
    title: "Lo que el subagente no sabe",
    text: "El coordinador ya obtuvo que el pedido 10091 se emitió el 3 de marzo por 48.20 USD. Si llama al subagente de redacción solo con “redacta la respuesta al cliente”, el subagente puede inventar una fecha. Si le pasa el hallazgo completo con su fuente (“orden 10091, emitida el 3 de marzo, 48.20 USD, según lookup_order”), puede citarlo sin inventar.",
    connect: "Con 1.2: el coordinador es quien tiene que copiar el dato dentro del prompt, porque el subagente no ve la conversación.",
  },
  "1.4": {
    title: "Verificar antes de devolver",
    text: "Un cliente pide devolver 48.20 USD. Con la frase “nunca devuelvas sin verificar” en el prompt, el agente casi siempre llama primero a verify_customer, pero a veces puede saltarlo. Con un prerrequisito programático, process_refund se rechaza hasta que verify_customer dejó su resultado en la sesión. El código decide el orden; el texto solo lo sugiere.",
    connect: "Con 1.1: el bucle sigue igual. Lo que cambia es quién impone el paso previo.",
  },
  "1.5": {
    title: "Un reembolso por encima del límite",
    text: "La regla es: ningún reembolso mayor a 100 USD sin aprobación. Un hook antes de process_refund lee el monto; si pasa de 100, bloquea la llamada y devuelve al modelo “requiere aprobación”. Un prompt que diga “pide aprobación para montos altos” puede fallar en alguna corrida. El PostToolUse sirve para otra cosa: si lookup_order devuelve la fecha en otro formato, el hook la normaliza antes de que el modelo la lea.",
    connect: "Con 1.4: otra vez el código, no el texto, es el que garantiza la regla.",
  },
  "1.6": {
    title: "Dos formas de partir una tarea",
    text: "Tarea fija: “revisa la factura, extrae los datos y compáralos con la orden”. Son tres pasos conocidos de antemano, y la salida de uno es la entrada del siguiente: prompt chaining. Tarea abierta: “averigua por qué el cliente no recibió su reembolso”. No se sabe si el problema está en el pago, la dirección o el banco; el plan se arma mientras se investiga.",
    connect: "Con 1.2: la versión adaptativa es el orchestrator-workers de la tabla, donde los subtemas aparecen durante la ejecución.",
  },
  "1.7": {
    title: "Retomar la sesión de ayer",
    text: "Ayer se analizó el módulo de reembolsos y el agente recomendó cambiar process_refund. Hoy alguien editó ese archivo. Con --resume se sigue la conversación de ayer, pero el modelo sigue creyendo que el archivo es el de ayer. Lo correcto es reanudar y avisar: “se cambió process_refund; relee solo ese archivo”. Si el trabajo ya es de otro proyecto, conviene una sesión nueva.",
    connect: "Con 1.1: el historial es lo que se reenvía. Si ya no describe el código, la respuesta sale mal aunque el bucle esté bien.",
  },
  "2.1": {
    title: "Dos tools que se parecen",
    text: "Tienes dos tools: analyze_document con la descripción “analiza el contenido” y analyze_invoice con “extrae número, monto y fecha de una factura; no sirve para contratos”. Cuando el usuario escribe “revisa esta factura”, la primera puede ganar al azar, porque ambas suenan igual. La segunda describe qué hace, cuándo usarla y cuándo no.",
    connect: "Con 1.3: la descripción es lo que el coordinador lee para decidir a qué subagente llamar.",
  },
  "2.2": {
    title: "Un error que dice qué hacer",
    text: "lookup_order devuelve “Operation failed”. El agente no sabe si reintentar, cambiar el número de pedido o avisar al cliente. Con un error estructurado, devuelve isError: true, errorCategory: “transient”, isRetryable: true y un mensaje que dice que el servicio no respondió. Ahora el agente sabe que debe reintentar y no cambiar el pedido.",
    connect: "Con 1.1: el error es un tool_result más, y el bucle sigue. Lo que cambia es la información que vuelve dentro de él.",
  },
  "2.3": {
    title: "El agente de síntesis que se pone a buscar",
    text: "Un agente de síntesis tiene 18 tools a la vista, entre ellas web_search. Le pides “resume los reembolsos de marzo” y lanza una búsqueda en la web, que no era su trabajo. Se corrige dándole solo las tools de síntesis. Para el extractor de facturas, tool_choice con una tool concreta obliga a devolver los datos en el formato esperado en lugar de texto libre.",
    connect: "Con 1.3: es el allowedTools del subagente aplicado a su lista de herramientas. Con 1.1: tool_choice decide si la respuesta puede ser texto o tiene que ser una tool_use.",
  },
  "2.4": {
    title: "Jira en dos lugares",
    text: "Un servidor MCP de Jira se conecta en la configuración compartida del repo, y otro, con tu token personal, en tu configuración local. Un compañero que clona el repo recibe la herramienta de Jira, pero sin la credencial: la herramienta aparece y falla. Hay que saber en qué sitio está cada cosa antes de culpar al servidor.",
    connect: "Con 2.1: las tools que llegan por MCP tienen las mismas descripciones que se evaluaron en la lección anterior.",
  },
  "2.5": {
    title: "Renombrar una función",
    text: "Quieres cambiar el nombre de calcularReembolso. Grep busca todas las apariciones del nombre. Read abre el archivo donde se define. Edit cambia la línea de la definición, pero solo funciona si el texto que se reemplaza aparece una sola vez; si aparece dos, falla y hay que dar más contexto. Glob lista los tests con **/*.test.ts para revisar cuáles llaman a la función.",
    connect: "Con 1.1: cada una de estas herramientas es un tool_use que devuelve un tool_result, y el bucle sigue hasta end_turn.",
  },
  "3.1": {
    title: "La regla que solo vive en tu máquina",
    text: "El CLAUDE.md del repo dice “los tests usan Vitest”. Tu archivo personal, fuera del repo, dice “responde en español”. Un compañero que clona el repo recibe Vitest, pero no tu preferencia de idioma. Si pones “usa Vitest” solo en tu archivo personal, en su máquina Claude escribirá los tests con otra librería.",
    connect: "Con 1.5: CLAUDE.md es texto, como cualquier prompt. Si una regla debe cumplirse siempre, se escribe como hook.",
  },
  "3.2": {
    title: "Un comando para todo el equipo",
    text: "Creas .claude/commands/revisar-pago.md con el texto “revisa el diff contra la política de reembolsos y lista los riesgos”. Cualquiera del equipo lo dispara escribiendo /revisar-pago. Un skill, en cambio, vive en .claude/skills/auditar-reembolsos/SKILL.md, con varios pasos: leer la política, correr los tests y comparar montos. Claude lo usa cuando la tarea lo pide, no en cada sesión.",
    connect: "Con 3.1: el CLAUDE.md se carga siempre, así que lo que se usa en un solo flujo va mejor en un comando o en un skill.",
  },
  "3.3": {
    title: "Reglas solo para los tests de React",
    text: "Creas .claude/rules/react-tests.md con el frontmatter paths: “**/*.test.tsx” y la instrucción “usa Testing Library, no enzyme”. Al editar src/checkout/Button.test.tsx la regla entra en el contexto. Al editar server/refunds.ts no entra, así que el backend no carga reglas de React.",
    connect: "Con 3.1: poner esa instrucción en el CLAUDE.md general sería ruido para todo el backend.",
  },
  "3.4": {
    title: "Migrar la autenticación o cambiar un label",
    text: "Migrar la autenticación toca muchos archivos y hay que decidir entre sesiones y tokens: conviene plan mode, para que Claude investigue, proponga y espere tu aprobación. Cambiar el texto de un botón cabe en un archivo y la causa es clara: ejecución directa. Un Explore subagent que busca “dónde se usa el login” devuelve un resumen de cinco archivos, y la conversación principal no se llena de listas.",
    connect: "Con 1.2: el Explore subagent es un especialista como los del hub-and-spoke, que le devuelve al hilo principal solo el resumen.",
  },
  "3.5": {
    title: "Un formateador de notas de reembolso",
    text: "En la primera corrida, la nota sale en prosa, y cada vez con un formato distinto. Con 2 ejemplos de entrada y salida (nota cruda y resumen de dos líneas con monto y motivo), el formato se fija. Si además hay un test que compara el formato, su fallo dice exactamente qué corregir en la siguiente vuelta.",
    connect: "Con 3.2: esos ejemplos pueden vivir dentro del skill, para que el formato se mantenga en cada uso.",
  },
  "3.6": {
    title: "Revisión de un pull request en CI",
    text: "El job corre claude -p “revisa el diff” con --output-format json y --json-schema. Como no hay nadie delante del teclado, -p no hace preguntas: imprime el JSON y termina. Un script lee los hallazgos y publica comentarios en el PR. El revisor es una sesión distinta a la que escribió el código.",
    connect: "Con 1.3: el job recibe solo el prompt y el diff, como un subagente. No ve la conversación del autor.",
  },
  "4.1": {
    title: "Dos criterios para marcar comentarios",
    text: "“Marca comentarios imprecisos” deja la decisión abierta: en una corrida el modelo marca muchos comentarios y en otra, pocos. “Marca un comentario solo cuando el comportamiento que describe contradice el código; ignora estilo y ortografía” se puede aplicar igual en cada corrida, y se puede verificar si se cumplió.",
    connect: "Con 3.5: como allí, la vaguedad se corrige con reglas que se pueden aplicar, no con más énfasis.",
  },
  "4.2": {
    title: "Facturas con descuento",
    text: "Tu prompt ya tiene instrucciones largas y aun así extrae el descuento de dos formas. Agregas dos ejemplos trabajados: uno con el descuento escrito como “10 %” en la misma línea, y otro con el descuento en una línea aparte y el total con impuesto incluido. Cada ejemplo muestra la salida completa: campo, valor y de qué línea salió. Un ejemplo fácil repetido diez veces no enseña ese borde.",
    connect: "Con 4.1: los ejemplos muestran cómo aplicar el criterio en los casos dudosos, que es lo que el criterio solo no resuelve.",
  },
  "4.3": {
    title: "Una factura que suma mal",
    text: "El schema pide total (número) y líneas (lista de montos). El modelo devuelve total 1.200 y líneas que suman 1.150. El JSON está bien formado: el molde se cumple. El schema no comprueba la suma, y por eso falta una segunda capa de validación en código.",
    connect: "Con 2.1: el schema también es parte de la interfaz de la tool, junto con la descripción.",
  },
  "4.4": {
    title: "Reintentar con el error concreto",
    text: "La extracción devuelve la fecha “31/02/2026”. El validador responde que ese día no existe. El retry vuelve a llamar al modelo con tres cosas: el documento original, la extracción que salió mal y el error concreto. Corrige la fecha. Si el número de orden no aparece en el documento, el retry no lo inventa: repetir la llamada no crea un dato que no está.",
    connect: "Con 1.1: el retry es otra vuelta del bucle, pero el resultado que vuelve es un error de validación.",
  },
  "4.5": {
    title: "La noche del cierre mensual",
    text: "Tienes 2.000 facturas para procesar antes de la mañana. Las mandas con Message Batches, con custom_id igual al número de factura. Al día siguiente, cada resultado se cruza con su factura por ese identificador. Si un cliente espera una respuesta en la pantalla, eso no sirve: esa llamada tiene que ser síncrona.",
    connect: "Con 4.4: si una factura falla la validación, el retry va como otra petición del lote, sin encadenar vueltas dentro de la misma.",
  },
  "4.6": {
    title: "Revisar tu propio código",
    text: "Claude escribió la función de reembolso en esta sesión y le pides “revísala”. Tiende a confirmar lo que ya razonó. Una sesión nueva, que recibe solo el diff, encuentra que nadie verifica el límite de 100 USD antes de devolver.",
    connect: "Con 3.6 y 1.3: es el mismo principio del revisor de CI. La instancia que no escribió el código no comparte su razonamiento.",
  },
  "5.1": {
    title: "Una conversación de 30 turnos",
    text: "Al turno 30, el resumen de la conversación dice “el cliente reclamó un monto cercano a 50 USD”. Los case facts, en cambio, están escritos tal cual: order_id 10091, monto 48.20 USD, fecha 3 de marzo, estado reembolso pendiente. Ese bloque se pega en cada prompt, fuera del resumen. La respuesta correcta cita 48.20, no “cerca de 50”.",
    connect: "Con 1.1: el historial es lo que se reenvía en cada llamada, y aquí es lo que se resume para que quepa.",
  },
  "5.2": {
    title: "Dos clientes con el mismo nombre",
    text: "Un cliente escribe “quiero cancelar mi pedido, soy Juan García”. La búsqueda devuelve dos cuentas con ese nombre. El agente no adivina cuál es: pide el email o el número de orden, o escala con las dos coincidencias. Que el cliente esté enojado no es el motivo para escalar; el motivo es que el caso no se puede cerrar con seguridad.",
    connect: "Con 1.4: pedir identidad antes de cancelar es un prerrequisito, y debe imponerse en código.",
  },
  "5.3": {
    title: "Un subagente que falla a mitad",
    text: "El subagente de precios agota sus reintentos contra la API de un proveedor. Antes de propagar, reintentó lo que era transitorio. Lo que entrega al coordinador: tipo de fallo (timeout), consulta intentada (precio de la caja 12), resultados parciales (dos de tres proveedores) y alternativa (usar la tabla de marzo). Con eso, el coordinador responde con dos proveedores y anota el hueco. Si solo devolviera “error”, no sabría si descartar todo.",
    connect: "Con 2.2: es el mismo principio del error estructurado, ahora entre agentes. Con 1.2: el hueco se anota y se vuelve a encargar.",
  },
  "5.4": {
    title: "Un repo de cientos de miles de archivos",
    text: "Tras cuarenta búsquedas, el agente dice “normalmente los reembolsos se validan en el controlador”, en lugar de citar refunds/validate.ts, que leyó antes. Un scratchpad habría guardado la línea exacta: refunds/validate.ts:42, límite de 100 USD. Un manifest, al cerrar, exporta el estado de cada agente para retomar sin perder el hilo.",
    connect: "Con 1.7: resume y manifest resuelven lo mismo, que es retomar el trabajo sin releer todo.",
  },
  "5.5": {
    title: "El 97 % que esconde un segmento",
    text: "Extraes 1.000 documentos. En total aciertas el 97 %, pero en un tipo de documento con fechas en formato no estándar el acierto es mucho menor. Si solo miras el promedio, lanzas la extracción sin revisión. Medido por segmento, esos documentos van a revisión humana y el resto pasa directo.",
    connect: "Con 4.4: la validación detecta fechas imposibles; la calibración decide qué documentos necesitan una persona.",
  },
  "5.6": {
    title: "Dos precios para la misma caja",
    text: "El proveedor A dice 12 USD por caja (catálogo de diciembre de 2025). El proveedor B dice 13,50 USD (lista de marzo de 2026). Sintetizar “12 USD” sin fuente esconde el conflicto. Lo correcto: “A: 12 USD, dic 2025; B: 13,50 USD, mar 2026; se prefiere la más reciente, y la diferencia queda visible”. Si ningún documento habla del envío, la respuesta dice que no está en las fuentes.",
    connect: "Con 5.3: la fuente y la fecha también viajan en el paquete que sube el subagente al coordinador.",
  },
};
