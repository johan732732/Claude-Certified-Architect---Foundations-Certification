window.CCARF = window.CCARF || {};

(function () {
function viaOf(code) {
  const text = String(code || "").replace(/^\s+/, "");
  if (/^POST \/v1\/messages|^tools:|^messages:|^batch request|^results:|^schema:/.test(text)) return "api";
  if (/tool_choice|stop_reason|"max_tokens"|"input_schema"|"custom_id"|"tools"|"messages"/.test(text)) return "api";
  if (/^claude\b|^\/memory|^\/review-pr|^plan mode|^stdout:/.test(text)) return "cmd";
  if (/tool_result|isError|is_error|^Grep |^Edit |old_string|resource jira|^PreToolUse/.test(text)) return "tool";
  if (/tool_use/.test(text) || /^text:|^out:/.test(text)) return "model";
  return "run";
}
const send = (note, code) => ({ dir: "send", via: viaOf(code), note, code });
const back = (note, code) => ({ dir: "back", via: viaOf(code), note, code });
const act = (note, code) => ({ dir: "act", note, code });
const stop = (note, code) => ({ dir: "stop", note, code });
const fail = (note, code) => ({ dir: "fail", note, code });
const lane = (steps) => ({ steps });

CCARF.traces = {
  "1.1": {
    title: "Pedido 10091, llamada por llamada",
    fork: "¿Qué trae stop_reason?",
    goodWhen: "tool_use y, después, end_turn",
    badWhen: "max_tokens, o el texto dice que ya terminó",
    good: lane([
      send("Sale la pregunta del cliente y la lista de tools. Todavía no hay respuesta final.", `POST /v1/messages
{
  "max_tokens": 1024,
  "tools": [
    { "name": "lookup_order" },
    { "name": "process_refund" }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Has the refund for order 10091 gone out?"
    }
  ]
}`),
      back("La parada no está en el texto. Está en stop_reason, y el bloque trae el id que hay que contestar.", `{
  "id": "msg_01",
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01",
      "name": "lookup_order",
      "input": { "order_id": "10091" }
    }
  ]
}`),
      act("Se guarda el assistant tal como volvió y se pega un tool_result con el mismo id. Si falta ese id, la siguiente llamada falla.", `messages +=
  - role: assistant
    content: [tool_use toolu_01 lookup_order]
  - role: user
    content:
      - type: tool_result
        tool_use_id: toolu_01
        content: "issued 2026-03-03, 48.20 USD"`),
      send("La segunda llamada lleva el historial completo: pregunta, pedido de tool y resultado.", `POST /v1/messages
{
  "messages": [
    {
      "role": "user",
      "content": "Has the refund for order 10091 gone out?"
    },
    {
      "role": "assistant",
      "content": [
        { "type": "tool_use", "id": "toolu_01", "name": "lookup_order", "input": { "order_id": "10091" } }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_01",
          "content": "issued 2026-03-03, 48.20 USD"
        }
      ]
    }
  ]
}`),
      back("Ahora sí hay texto para el cliente, y el campo dice que el turno terminó.", `{
  "id": "msg_02",
  "stop_reason": "end_turn",
  "content": [
    {
      "type": "text",
      "text": "Refund for 10091 was issued on 2026-03-03 for 48.20 USD."
    }
  ]
}`),
      stop("Se devuelve ese texto. El bucle cierra porque stop_reason es end_turn, no porque la frase suene a despedida."),
    ]),
    bad: lane([
      back("La salida se cortó a mitad del argumento. El monto no llegó entero.", `{
  "id": "msg_09",
  "stop_reason": "max_tokens",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_09",
      "name": "process_refund",
      "input": { "order_id": "10091", "amount": 48`),
      fail("Ejecutar process_refund con ese argumento a medias manda una devolución real incompleta. max_tokens no es éxito: no se corre el tool_use."),
      back("Otra forma del mismo fallo: el texto dice que ya terminó y el campo sigue pidiendo una tool.", `{
  "stop_reason": "tool_use",
  "content": [
    { "type": "text", "text": "Done. The refund is complete." },
    { "type": "tool_use", "id": "toolu_10", "name": "lookup_order" }
  ]
}`),
      fail("Devolverle el texto al cliente aquí deja la tool sin ejecutar. Un tope de 8 vueltas que corte el bucle tampoco completa la tarea: solo la aborta."),
    ]),
  },
  "1.2": {
    title: "El informe, repartido desde el centro",
    fork: "¿La síntesis cubre lo que se pidió?",
    goodWhen: "Falta una región y se vuelve a encargar",
    badWhen: "El recorte dejó industrias afuera",
    good: lane([
      send("El coordinador parte el tema y manda tres encargos. Ningún subagente ve el de los otros.", `Task x3, same response
  researcher_papers: "remote work 2024-2026, academic"
  researcher_press: "remote work 2024-2026, press"
  researcher_firms: "remote work 2024-2026, company reports"`),
      back("Cada resultado vuelve solo al coordinador.", `tool_result papers: 6 notes
tool_result press: 4 notes
tool_result firms: 5 notes
# no Latin America in any of them`),
      act("Al juntar, el centro ve el hueco y encarga solo esa región.", `Task
  researcher_papers: "remote work, Latin America only, 2024-2026"`),
      back("La segunda síntesis ya cubre lo que faltaba.", `synthesis:
  regions: [global, Latin America]
  gap: none`),
      stop("Se entrega el informe. El ajuste salió de quien ve el mapa completo."),
    ]),
    bad: lane([
      send("El recorte deja industrias afuera antes de la primera llamada.", `split("creative industries") =
  [digital art, graphic design, photography]
# music, writing, film: nobody`),
      back("Los tres cumplen exactamente lo que les tocó.", `art: 8 sources
design: 7 sources
photography: 6 sources`),
      fail("Revisar a los subagentes no encuentra el fallo: el informe no tiene música, escritura ni cine porque el split() no se las dio. Se corrige la partición."),
    ]),
  },
  "1.3": {
    title: "Lo que el subagente alcanza a ver",
    fork: "¿El prompt trae los hallazgos?",
    goodWhen: "Las dos notas van escritas, con su fuente",
    badWhen: "Nombra el hallazgo y no lo pega",
    good: lane([
      send("Estado y dirección no se necesitan entre sí, así que las dos Task salen en la misma respuesta.", `content:
  - type: tool_use
    id: task_01
    name: Task
    input: { agent: "orders", prompt: "status of 10091" }
  - type: tool_use
    id: task_02
    name: Task
    input: { agent: "shipping", prompt: "address of 10091" }`),
      back("Cada nota vuelve con el dato y la fuente, no solo con la frase.", `tool_result task_01:
  claim: "shipped 2026-03-03"
  source: "https://orders.example/10091"
tool_result task_02:
  claim: "dock 4, Austin"
  source: "https://shipping.example/10091"`),
      act("El sintetizador no busca. Su prompt trae las dos notas ya escritas.", `Task synthesizer
prompt: |
  Write one reply.
  Note A: shipped 2026-03-03
    source: https://orders.example/10091
  Note B: dock 4, Austin
    source: https://shipping.example/10091`),
      back("Puede citar la fecha y la URL porque las dos viajaron en esa llamada.", `{
  "stop_reason": "end_turn",
  "content": [
    { "type": "text", "text": "Order 10091 shipped on 2026-03-03, per the order system." }
  ]
}`),
      stop("Un subagente solo ve el prompt de esa invocación. Lo que no se pegó, no existe para él."),
    ]),
    bad: lane([
      send("El prompt nombra el hallazgo y no lo pega.", `Task synthesizer
prompt: "Use what the search agent found about 10091."
# search notes are not in this string`),
      back("No hay otra conversación que pueda leer. Completa con algo plausible.", `text: "Order 10091 shipped recently."
sources: []`),
      fail("El informe queda sin fuente. fork_session no arregla esto: parte una sesión para probar otro enfoque, no le copia las notas a un especialista."),
    ]),
  },
  "1.4": {
    title: "La devolución, con el cerrojo en código",
    fork: "¿Hay código que mire el customer_id?",
    goodWhen: "Sin id verificado, la tool se rechaza",
    badWhen: "La regla solo está en el prompt y la devolución sale",
    good: lane([
      send("El mismo mensaje trae dos temas. El flujo los parte antes de investigar.", `user: "Refund order 10091 and change the shipping address."
items:
  - refund
  - address_change`),
      back("El modelo pide la devolución, pero la sesión todavía no tiene identidad verificada.", `tool_use:
  id: toolu_14
  name: process_refund
  input: { order_id: "10091", amount: 48.20 }
session.verified_customer_id: null`),
      act("El código rechaza la tool. No es un consejo del prompt: la función no corre, y el error no se reintenta.", `tool_result toolu_14:
  is_error: true
  content: "Call get_customer and verify identity first."
  retryable: false`),
      send("Después de get_customer, la misma tool ya pasa. Al cerrar, la persona recibe los cuatro campos.", `session.verified_customer_id: "cus_44"
process_refund(order_id=10091, amount=48.20) -> issued
handoff:
  customer_id: cus_44
  cause: "duplicate charge"
  amount: 48.20
  action: "confirm the refund"`),
      stop("El cliente recibe una sola respuesta. Quien cierra el caso no tiene que leer el transcript."),
    ]),
    bad: lane([
      send("La regla vive en una frase. No hay nada que mire la sesión.", `system: "NEVER transfer money before verifying identity."
session.verified_customer_id: null`),
      back("El modelo llama process_refund igual. Como no hay código, la devolución sale.", `tool_use process_refund { order_id: "10091", amount: 48.20 }
-> issued`),
      fail("El cambio de dirección, que venía en el mismo mensaje, se pierde. El ticket humano dice solo “the customer is upset”: sin id, causa, monto ni acción."),
    ]),
  },
  "1.5": {
    title: "800 USD no se ejecutan, y la fecha llega en un solo formato",
    fork: "¿El monto pasa de 500 USD?",
    askAfter: 0,
    goodWhen: "El hook bloquea los 800 antes de ejecutar",
    badWhen: "El umbral está en el prompt y los 620 salen",
    good: lane([
      send("El modelo arma la llamada. Todavía no se ha ejecutado nada.", `tool_use:
  id: toolu_15
  name: process_refund
  input: { order_id: "10091", amount: 800 }`),
      act("El hook de salida corre antes que la tool. 800 pasa de 500, así que bloquea.", `PreToolUse process_refund:
  if amount > 500: block, hand to a person
-> blocked
tool did not run`),
      back("En otra tool, dos servidores devuelven la misma fecha en dialectos distintos.", `server A: { timestamp: 1710000000, status: 200 }
server B: { date: "2026-03-09T00:00:00Z", code: "OK" }`),
      act("PostToolUse reescribe el resultado antes de que el modelo lo lea.", `normalized:
  date: "2026-03-09"
  state: "issued"`),
      stop("El modelo razona sobre una sola forma. El umbral no dependió de que obedeciera una frase."),
    ]),
    bad: lane([
      send("El umbral está escrito en el prompt y no hay hook.", `system: "Escalate refunds over 500 USD."
tool_use process_refund { amount: 620 }`),
      back("En esta conversación la tool corre. En otras no. No hay garantía.", `process_refund -> issued 620 USD`),
      fail("Pedirle además que “normalize dates” deja un status 200 leído como éxito en un servidor y como otra cosa en el siguiente."),
    ]),
  },
  "1.6": {
    title: "Partir el trabajo antes de abrir el repo",
    fork: "¿Los pasos se conocen antes de abrir el repo?",
    askAfter: 0,
    goodWhen: "Un pase por archivo y otro para lo que cruza",
    badWhen: "Una cadena fija sobre un legado que nadie miró",
    good: lane([
      send("Llega un trabajo de código. Todavía no se abre el repo.", `task: not started
repo: not opened`),
      send("La revisión es predecible: se sabe qué mirar. Cada archivo va en su pase.", `pass 1, one file at a time:
  review(src/invoice.ts) -> local bugs
  review(src/tax.ts) -> local bugs`),
      act("El segundo pase no relee los archivos. Lee solo los hallazgos y busca lo que cruza.", `pass 2:
  input: findings from pass 1
  look for: data that leaves one file and enters another`),
      back("Un encargo abierto no trae esa lista. El primer paso es el mapa, y el plan se reescribe cuando aparece una dependencia.", `task: "add tests to this legacy repo"
step 1: map the tree
step 2: mark what is used most
step 3: rewrite the plan, a dependency was not on the map`),
      stop("Tarea predecible: pipeline. Tarea abierta: plan que se adapta."),
    ]),
    bad: lane([
      send("Al legado desconocido se le impone una cadena escrita el día anterior.", `fixed chain:
  1 scan
  2 test the service layer
  3 cannot be skipped
repo: no service layer`),
      fail("El paso 2 pide tests de una capa que no existe y el paso 3 no se puede saltar. El otro extremo, pegar 14 archivos en un solo prompt, tampoco parte el trabajo."),
    ]),
  },
  "1.7": {
    title: "Retomar billing-refactor",
    fork: "¿Los tool results todavía describen el código?",
    askAfter: 0,
    goodWhen: "Se reanuda y se nombra el archivo que cambió",
    badWhen: "Se reanuda sin decir que el módulo cambió",
    good: lane([
      send("El análisis del lunes sigue describiendo el código. Se reanuda esa conversación y se nombra el archivo que cambió.", `claude --resume billing-refactor
user: "src/invoice.ts changed since Monday. Reread that file and continue the plan."`),
      back("Claude relee ese archivo, no el repositorio entero.", `{
  "stop_reason": "tool_use",
  "content": [
    { "type": "tool_use", "name": "Read", "input": { "path": "src/invoice.ts" } }
  ]
}`),
      act("Para probar dos diseños sin perder el análisis, se abre una rama y la sesión original queda intacta.", `fork_session("billing-refactor")
  branch A: keep the current design
  original: untouched`),
      stop("Se sigue con el contexto que todavía es verdad, más el archivo que se movió."),
    ]),
    bad: lane([
      send("Alguien reescribió el módulo y la sesión se reanuda “porque es más rápido”, sin decir el cambio.", `claude --resume billing-refactor
# payments.ts now returns a number, not a string
# the message does not say so`),
      back("Los tool_result viejos siguen en el historial y el modelo los trata como vigentes.", `old tool_result:
  payments.charge -> string
proposal: "keep parsing the string"`),
      fail("El juicio queda contaminado. Tocaba una sesión nueva, con un resumen de las decisiones que siguen en pie y sin esos results."),
    ]),
  },
  "2.1": {
    title: "El menú que el modelo lee para elegir",
    fork: "¿Las descripciones se distinguen?",
    askAfter: 0,
    goodWhen: "Cada tool dice el formato y cuándo no usarla",
    badWhen: "Las dos dicen casi lo mismo",
    good: lane([
      send("En la llamada van nombre, descripción y schema. No va el código de la función.", `{
  "tools": [
    {
      "name": "extract_web_results",
      "description": "Web pages. Example: query 'refund policy'. Returns titles and urls. Do not use for an internal PDF."
    },
    {
      "name": "summarize_document",
      "description": "One uploaded document. Example: a PDF invoice. Do not use for a web search."
    }
  ]
}`),
      back("La elección sale de esa descripción.", `tool_use:
  name: extract_web_results
  input: { query: "order 10091 refund policy" }`),
      stop("Una tool genérica de “analyze” se parte en tres contratos: extraer, resumir y verificar un claim contra su fuente."),
    ]),
    bad: lane([
      send("Las dos descripciones dicen casi lo mismo.", `{
  "tools": [
    { "name": "analyze_content", "description": "Analyze the content." },
    { "name": "analyze_document", "description": "Analyze the document." }
  ]
}`),
      back("Para un PDF llama a la de la web, y al revés.", `user: "Summarize this PDF invoice."
tool_use: analyze_content`),
      fail("Pegar ejemplos en el system prompt no cambia el menú. La causa está en las descripciones, y una frase suelta del system prompt puede asociar una palabra con la tool equivocada."),
    ]),
  },
  "2.2": {
    title: "El objeto de error, no una frase",
    fork: "¿Cómo vuelve el fallo?",
    goodWhen: "Con categoría e isRetryable",
    badWhen: "Como una lista vacía",
    good: lane([
      send("Se pide el estado del pago del 10091.", `tool_use get_payment { order_id: "10091" }`),
      back("El servicio no contesta. La tool no esconde eso en una lista vacía.", `tool_result:
  isError: true
  errorCategory: transient
  isRetryable: true
  description: "timeout, retry the same call once"`),
      act("Se repite la misma llamada. La segunda vez el pago está.", `get_payment { order_id: "10091" }
-> { status: "issued", amount: 48.20 }`),
      back("Otro caso: no hay permiso. No se reintenta.", `isError: true
errorCategory: permission
isRetryable: false
description: "no access to the refunds folder"`),
      stop("transient se reintenta. validation se corrige y se llama distinto. permission y business se explican, no se repiten."),
    ]),
    bad: lane([
      back("La búsqueda hizo timeout y alguien devolvió una lista vacía.", `search("remote work papers") -> timeout
tool_result: []
isError: false`),
      fail("El informe dice que no hay papers. Un [] de verdad es una búsqueda que corrió y no encontró filas. “Operation failed”, sin categoría, deja al agente sin saber si reintentar."),
    ]),
  },
  "2.3": {
    title: "Qué tools entran en esta llamada",
    fork: "¿Qué dice tool_choice?",
    goodWhen: "Obliga a extract_metadata",
    badWhen: "Queda en auto y responde solo con texto",
    good: lane([
      send("El primer turno de la extracción no puede ser texto. tool_choice obliga a extract_metadata.", `POST /v1/messages
{
  "tools": [
    { "name": "extract_metadata" },
    { "name": "enrich_vendor" }
  ],
  "tool_choice": { "type": "tool", "name": "extract_metadata" },
  "messages": [
    { "role": "user", "content": "Invoice 10091, vendor Northwind." }
  ]
}`),
      back("El modelo no puede saltarse el paso. Cada documento queda tipado antes del enriquecimiento.", `{
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "tool_use",
      "name": "extract_metadata",
      "input": { "doc": "invoice-10091" }
    }
  ]
}`),
      act("El sintetizador no lleva el buscador. fetch_url se cambió por una tool que valida la URL.", `synthesizer.tools: [verify_fact]
load_document(url):
  reject if the url is not a document`),
      stop("Cinco tools por rol, no las 18 del sistema. any obliga a llamar alguna; auto deja contestar solo con texto."),
    ]),
    bad: lane([
      send("El mismo agente tiene búsqueda y redacción, y tool_choice queda en auto.", `{
  "tools": ["web_search", "draft_reply"],
  "tool_choice": { "type": "auto" }
}
# 18 tools on this agent, including those two`),
      back("Escribe el tipo del documento y no llama a extract_metadata. El paso que tenía que ir primero no ocurrió.", `{
  "stop_reason": "end_turn",
  "content": [
    { "type": "text", "text": "This document is an invoice." }
  ]
}`),
      fail("Ante un informe, el sintetizador abre páginas en vez de juntar lo que ya trajeron los demás."),
    ]),
  },
  "2.4": {
    title: "Lo que queda en git y lo que vuelve de Jira",
    fork: "¿El token viaja en el archivo del repo?",
    askAfter: 0,
    goodWhen: "El archivo guarda ${GITHUB_TOKEN} y Jira es de comunidad",
    badWhen: "El secreto queda en git",
    good: lane([
      send("El repo declara el servidor. El token no va en el archivo.", `.mcp.json
github:
  token: "\${GITHUB_TOKEN}"
# committed
# each person exports GITHUB_TOKEN locally`),
      back("Jira es una integración que ya existe, así que se usa el servidor de la comunidad. El resource trae el catálogo sin gastar una tool.", `resource jira.list_open_issues ->
  - PROJ-14 "Refund duplicate on 10091"
  - PROJ-15 "Address change stuck"`),
      act("La descripción dice qué devuelve, y el agente la prefiere frente a Grep cuando el dato vive en Jira.", `tool search_issues
description: "Returns open Jira issues with key, summary, and status. Use this instead of Grep when the fact lives in Jira."
-> PROJ-14`),
      stop("Un experimento personal va en ~/.claude.json, no en el archivo del equipo."),
    ]),
    bad: lane([
      send("El secreto queda en el archivo que se commitea, y un servidor a medias entra al proyecto.", `.mcp.json
github:
  token: "ghp_live_secret"
experimental-jira:
  url: "http://localhost:9999"`),
      back("Quien clona se lleva la credencial. La tool de una línea pierde contra Grep.", `tool jira_search
description: "Search Jira."
agent chooses Grep, even though the issue is in Jira`),
      fail("Además se construye un servidor custom para el Jira de siempre, cuando uno de comunidad ya cubre ese flujo."),
    ]),
  },
  "2.5": {
    title: "Encontrar processRefund y cambiar un return",
    fork: "¿El texto del Edit aparece una sola vez?",
    goodWhen: "El ancla es única y Edit la usa",
    badWhen: "return null está en seis funciones",
    good: lane([
      send("Lo que se busca es un texto, no un nombre de archivo.", `Grep "processRefund"
include: "**/*.ts"`),
      back("Aparecen tres archivos. Se abre el que define la función y se siguen sus imports.", `src/billing/refund.ts
src/api/routes.ts
src/billing/refund.test.ts
-> Read src/billing/refund.ts`),
      act("El cuerpo que se quiere cambiar aparece una sola vez, así que Edit lo usa de ancla. Los tests se listan por nombre.", `Edit src/billing/refund.ts
old: "return null; // refund missing"
new: "return { status: 'missing', order_id }"
Glob "**/*.test.tsx"`),
      stop("No se lee el repositorio entero al empezar."),
    ]),
    bad: lane([
      send("El ancla no es única, y aun así se pide un Edit.", `Edit src/billing/refund.ts
old: "return null;"
# that string is in six functions`),
      back("La edición falla o cambia la función que no era.", `error: "old_string is not unique" `),
      fail("El camino fiable es Read del archivo completo y Write con el contenido ya modificado. Empezar leyendo todas las carpetas llena la ventana con archivos que no hacían falta."),
    ]),
  },
  "3.1": {
    title: "Qué memoria carga al abrir la carpeta",
    fork: "¿Dónde vive la instrucción del equipo?",
    goodWhen: "En el CLAUDE.md del repo",
    badWhen: "En el archivo personal",
    good: lane([
      send("Claude Code abre el repo y junta tres archivos, cada uno para un público distinto.", `load ~/.claude/CLAUDE.md
  "Answer me in Spanish."
load ./CLAUDE.md
  "Use the internal logger. Do not use console.log."
load ./packages/api/CLAUDE.md
  @import ./standards/errors.md`),
      back("/memory muestra qué quedó cargado en esta sesión.", `/memory
  user: ~/.claude/CLAUDE.md
  project: ./CLAUDE.md
  dir: ./packages/api/CLAUDE.md -> standards/errors.md
  not loaded: packages/ui (no error-format standard)`),
      stop("El logger viaja con el git. El idioma se queda en la máquina de una persona. El paquete de la UI no arrastra el estándar de la API."),
    ]),
    bad: lane([
      send("La instrucción del equipo se escribió en el archivo personal.", `~/.claude/CLAUDE.md
  "Use the internal logger. Do not use console.log."
./CLAUDE.md
  (no logger rule)`),
      back("En la máquina nueva, /memory no muestra esa frase dentro del proyecto.", `/memory on a fresh clone
  project: ./CLAUDE.md
  logger rule: absent
agent writes console.log`),
      fail("El fallo es de ubicación, no de redacción. Se mueve la frase al CLAUDE.md del repo."),
    ]),
  },
  "3.2": {
    title: "Un comando compartido y un skill que no ensucia el chat",
    fork: "¿Ese procedimiento se carga en toda sesión?",
    askAfter: 0,
    goodWhen: "Solo cuando se pide el comando o el skill",
    badWhen: "Los cuarenta pasos viven en CLAUDE.md",
    good: lane([
      send("La persona dispara el atajo. El archivo está en el repo, así que el equipo lo tiene al clonar.", `/review-pr 10091
file: .claude/commands/review-pr.md`),
      act("El skill de cobertura es ruidoso. context fork lo corre aparte y allowed-tools le cierra el resto.", `SKILL.md
context: fork
allowed-tools: [Read, Write]
argument-hint: "ticket id"
-> subagent returns a summary, not the full log`),
      back("Sin el id del ticket, el skill se lo pide antes de seguir.", `user: /coverage
assistant: "Which ticket id?"`),
      stop("CLAUDE.md sigue cargándose en toda sesión. Este procedimiento no: solo cuando la tarea lo pide."),
    ]),
    bad: lane([
      send("Los cuarenta pasos de la migración viven en el archivo que se carga siempre.", `./CLAUDE.md += 40-step migration guide
user: "Fix the comma in the title."
# the 40 steps are in this call too`),
      fail("Un comando personal guardado en .claude/commands/ se lo hereda el equipo. Un skill personal con el mismo nombre que el del equipo hace que cada quien pruebe un flujo distinto."),
    ]),
  },
  "3.3": {
    title: "La regla entra solo si el archivo coincide",
    fork: "¿El archivo coincide con el glob?",
    askAfter: 0,
    goodWhen: "El test carga la regla, esté en la carpeta que esté",
    badWhen: "El CLAUDE.md de /tests no ve ese archivo",
    good: lane([
      send("Claude va a editar un test que no vive en la carpeta /tests.", `Edit src/components/Button.test.tsx`),
      act("Mira los globs antes de meter reglas al contexto.", `.claude/rules/testing.md
paths:
  - "**/*.test.tsx"
rule: "Use Testing Library. No snapshots for stateful components."`),
      back("El nombre coincide, esté en la carpeta que esté. Un archivo de estilos no carga esa regla.", `Button.test.tsx -> rule loaded
src/billing/invoice.test.tsx -> rule loaded
src/components/Button.module.css -> rule not loaded`),
      stop("Mañana el test se mueve de carpeta y el glob sigue coincidiendo. La regla no iba por ubicación."),
    ]),
    bad: lane([
      send("La convención se escribió en el CLAUDE.md de una sola carpeta.", `/tests/CLAUDE.md
  "Use Testing Library."
Edit src/components/Button.test.tsx`),
      back("Ese archivo no pasa por /tests, así que la regla no entra.", `context rules: []
proposal: add a snapshot test`),
      fail("Hace falta una regla por glob, no otra copia del CLAUDE.md en cada carpeta donde aparezca un test."),
    ]),
  },
  "3.4": {
    title: "Planear la migración, editar el bug de una línea",
    fork: "¿El cambio es grande o el diseño sigue abierto?",
    askAfter: 0,
    goodWhen: "Plan mode y, ya cerrado, editar",
    badWhen: "Se edita la migración sin mapa",
    good: lane([
      send("El cambio toca más de 45 archivos y hay dos formas de integrar. Entra plan mode, no el editor.", `plan mode
Explore subagent: "who shares the BillingDate type?"`),
      back("El subagente devuelve el mapa. El chat no se llena de listas de archivos.", `summary:
  services sharing the type: [billing, invoices, refunds]
  option A needs a new queue
  option B reuses the current worker`),
      act("Con el diseño cerrado, la implementación ya es ejecución directa.", `direct edit, file by file, of the chosen option`),
      stop("Al día siguiente, un bug de una línea con stack trace claro no entra a plan mode: se corrige en el archivo."),
    ]),
    bad: lane([
      send("La misma migración se empieza a editar sin mapa.", `Edit src/billing/date.ts
# 45 files still unknown`),
      back("A la mitad aparece que tres servicios comparten el tipo.", `refunds/date.ts imports BillingDate
invoices/date.ts imports BillingDate
-> revert the edits already made`),
      fail("El otro extremo también falla: mandar a un plan largo una validación de fecha en una función conocida solo agrega demora."),
    ]),
  },
  "3.5": {
    title: "Tres ejemplos, y el fallo del test en la vuelta siguiente",
    fork: "¿La prosa fija el formato?",
    askAfter: 0,
    goodWhen: "Tres pares de entrada y salida, y el fallo del test",
    badWhen: "Se repite la advertencia y no hay una salida",
    good: lane([
      send("La prosa daba un formato distinto cada vez. Se pegan tres pares, incluido el campo vacío.", `user: |
  Format this log line.
  in: "2026-03-03 INFO refund 10091"
  out: "2026-03-03 | INFO | refund 10091"
  in: "INFO refund 10091"
  out: "— | INFO | refund 10091"`),
      back("La corrida siguiente ya no inventa el orden.", `out: "2026-03-09 | ERROR | payment timeout"`),
      act("El test se escribió antes. El fallo se pega en el mensaje siguiente, no un “ten cuidado”.", `assert format("") == "— | — | —"
FAIL: got " |  | "
next user message: the assertion, the input, and the got value`),
      stop("El nulo y el formateador que asume una fecha van en el mismo mensaje, porque se afectan. Un bug de estilos, que no tiene que ver, va en el mensaje de después."),
    ]),
    bad: lane([
      send("Se repite la advertencia y no se muestra ninguna salida.", `user: "Be careful with nulls. Format the log nicely."
# no input, no output`),
      back("La siguiente corrida sigue cambiando el orden.", `run 1: "INFO | 2026-03-03 | refund"
run 2: "2026-03-03 INFO refund"`),
      fail("Tres bugs independientes en un solo mensaje enorme hacen que el arreglo de uno ensucie la explicación de los otros."),
    ]),
  },
  "3.6": {
    title: "El job del pull request, sin teclado",
    fork: "¿El job puede hacer preguntas?",
    askAfter: 0,
    goodWhen: "claude -p y una instancia nueva",
    badWhen: "Sin -p, y la misma sesión se revisa",
    good: lane([
      send("Nadie va a contestar una pregunta. -p hace que Claude termine, y el schema fija la forma del JSON.", `claude -p --output-format json --json-schema schema.json
prompt: "Review this diff. Report only new findings."
schema finding:
  file, line, severity, summary`),
      back("Otro programa lee ese JSON y comenta el diff. Quien revisa es una instancia nueva, no la que escribió el parche.", `{
  "findings": [
    { "file": "src/billing/refund.ts", "line": 40, "severity": "high", "summary": "amount is not checked" }
  ]
}`),
      act("En el commit siguiente se pegan los hallazgos ya dichos, y los tests que ya existen.", `previous: ["amount is not checked"]
instruction: "report only what is new or still open"
existing tests: refund.test.ts`),
      stop("Sin -p, el job se queda esperando “which file?”. Esa es la falla de CI."),
    ]),
    bad: lane([
      send("El workflow llama a Claude sin -p, y la sesión que escribió el parche es la que lo revisa.", `claude
# waits for a person
# same session that authored the patch`),
      back("Pregunta qué archivo mirar. El pipeline no tiene quién responda. El re-review, sin los comentarios previos, publica otra vez los mismos ocho.", `stdout: "Which file should I review?"
job: waiting
comments: the same 8 findings again`),
      fail("Generar tests sin adjuntar los archivos de test actuales propone escenarios que ya estaban cubiertos."),
    ]),
  },
  "4.1": {
    title: "Un comentario que el código contradice",
    fork: "¿El criterio se puede contestar sí o no?",
    askAfter: 0,
    goodWhen: "Se marca solo si el comentario contradice el código",
    badWhen: "Pide ser conservador y marca el estilo",
    good: lane([
      send("El criterio se puede contestar sí o no, y cada gravedad trae un ejemplo.", `criterion: "Flag a comment only when the behavior it describes contradicts the code."
high: comment says "never returns null" and the function returns null
omit: style, local team patterns`),
      back("Este comentario cae en la gravedad alta. El espacio de más no se reporta.", `file: src/billing/refund.ts
comment: "never returns null"
code: return null
-> finding, severity high

trailing space in a comment -> omitted`),
      act("La categoría de nombres venía llena de falsos positivos. Se apaga mientras se reescribe su prompt.", `categories:
  correctness: on
  naming: off  # too many false positives`),
      stop("Quienes leen el informe vuelven a mirar los bugs de verdad."),
    ]),
    bad: lane([
      send("La instrucción suena a criterio y no se puede aplicar igual en cada corrida.", `system: "Be conservative. Report only high-confidence findings."`),
      back("Sin definición de bug y de estilo, la corrida marca comas y nombres.", `findings:
  - "extra comma"
  - "rename this local variable"
  - "possible null" `),
      fail("Subir la frase a “very conservative” no agrega un criterio. La categoría ruidosa, si sigue encendida, hace que dejen de leerse también los hallazgos buenos."),
    ]),
  },
  "4.2": {
    title: "El borde, no el ejemplo fácil repetido",
    fork: "¿El ejemplo es el borde o el caso fácil?",
    askAfter: 0,
    goodWhen: "Tres bordes y un patrón que está bien",
    badWhen: "Diez veces el mismo bug evidente",
    good: lane([
      send("Se pegan tres casos en los que una persona dudaría, con el formato de salida completo, y uno que se parece y está bien.", `examples:
  - ambiguous null check -> flag, severity high, because the comment denies it
  - missing source on a claim -> flag, ask for the url
  - acceptable: early return used across this repo -> do not flag
output fields: location, problem, severity, fix`),
      back("La corrida siguiente generaliza el borde y no marca el patrón del repo.", `location: src/billing/refund.ts:40
problem: "comment says never null, code returns null"
severity: high
fix: "change the comment or the return"
early-return pattern: not flagged`),
      stop("En extracción, el ejemplo de un campo que no está enseña a dejarlo vacío, no a inventarlo."),
    ]),
    bad: lane([
      send("Diez veces el mismo bug evidente.", `examples:
  - 10 copies of "return null while the comment says never null"`),
      back("En el documento real el caso se parece y la acción correcta es otra. El modelo marca el patrón aceptable.", `finding: "early return is a bug"
# that pattern is used on purpose across the repo`),
      fail("Repetir el caso fácil ocupa contexto y deja el borde sin enseñar."),
    ]),
  },
  "4.3": {
    title: "La factura sin número de impuesto",
    fork: "¿tax_id puede faltar?",
    askAfter: 0,
    goodWhen: "Es nullable y vuelve null",
    badWhen: "Es requerido y el modelo escribe 000000",
    good: lane([
      send("El molde deja vacío lo que puede no estar, y tool_choice obliga al paso que tiene que ir primero.", `{
  "tool_choice": { "type": "tool", "name": "extract_invoice" },
  "tools": [
    {
      "name": "extract_invoice",
      "input_schema": {
        "properties": {
          "tax_id": { "type": ["string", "null"] },
          "kind": { "enum": ["invoice", "unclear", "other"] },
          "detail": { "type": ["string", "null"] }
        }
      }
    }
  ]
}`),
      back("El JSON valida. Lo que no estaba vuelve como null, no como un número inventado.", `{
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "tool_use",
      "name": "extract_invoice",
      "input": { "tax_id": null, "kind": "invoice", "total": 48.20, "detail": null }
    }
  ]
}`),
      stop("El schema garantizó comas, llaves y tipos. Que las líneas sumen 48.20 es otra comprobación."),
    ]),
    bad: lane([
      send("tax_id está marcado como requerido y la factura no lo trae.", `{
  "input_schema": {
    "properties": { "tax_id": { "type": "string" } },
    "required": ["tax_id"]
  }
}
# document has no tax number`),
      back("El modelo escribe un valor para poder cumplir el molde. El pipeline lo acepta porque el JSON es válido.", `{
  "stop_reason": "tool_use",
  "content": [
    {
      "type": "tool_use",
      "name": "extract_invoice",
      "input": { "tax_id": "000000", "kind": "invoice", "total": 48.20 }
    }
  ]
}
# line items sum to 40.00, and the schema does not compare them`),
      fail("El total que no cuadra también se guarda. El formato de las fechas, distinto en cada proveedor, tampoco se arregla solo con el molde."),
    ]),
  },
  "4.4": {
    title: "La fecha en palabras, y el impuesto que no está",
    fork: "¿El dato está en el documento?",
    goodWhen: "La fecha sí está y el retry corrige el formato",
    badWhen: "El impuesto no está y se reintenta igual",
    good: lane([
      send("Primera extracción. La fecha viene en palabras.", `document: "9 March 2026, total 48.20"
extraction: { date: "9 March 2026", total: 48.20 }`),
      back("El validador rechaza la forma. El sentido todavía no se ha mirado.", `Pydantic:
  date must be YYYY-MM-DD
  got: "9 March 2026"`),
      send("El retry lleva tres cosas: el documento, el JSON fallido y el error concreto.", `user: |
  document: "9 March 2026, total 48.20"
  failed: { date: "9 March 2026" }
  error: "date must be YYYY-MM-DD"`),
      back("La segunda pasada corrige el formato. Aparte, el código compara las dos cifras.", `date: "2026-03-09"
calculated_total: 48.20
stated_total: 48.20
conflict_detected: false`),
      stop("Si el impuesto no está en la factura, la salida es null. Otra llamada no crea el dato."),
    ]),
    bad: lane([
      send("tax viene null porque la factura no tiene esa línea. Alguien lo trata como fallo y reintenta sin información nueva.", `attempt 1: { tax: null }
attempt 2: same document, same prompt
attempt 3: same document, same prompt`),
      back("A la tercera, el modelo inventa un impuesto para “completar”.", `{ tax: 4.20 }`),
      fail("Reintentar cambiando solo el número de intento es un bucle caro. La ausencia era la respuesta correcta."),
    ]),
  },
  "4.5": {
    title: "Dos mil facturas de noche, y un merge que espera",
    fork: "¿Alguien espera este resultado para seguir?",
    askAfter: 0,
    goodWhen: "Nadie: lote de noche y solo se reenvían las 12",
    badWhen: "El merge espera y se manda por lote",
    good: lane([
      send("Nadie espera el informe antes de la mañana. Se prueban 20 y después se manda el lote. Cada request lleva el nombre del archivo.", `POST /v1/messages/batches
{
  "requests": [
    {
      "custom_id": "invoice-10091.pdf",
      "params": { "messages": [{ "role": "user", "content": "Extract this invoice" }] }
    },
    {
      "custom_id": "invoice-10092.pdf",
      "params": { "messages": [{ "role": "user", "content": "Extract this invoice" }] }
    }
  ]
}
# 2000 after a 20-document sample`),
      back("Doce no cabían. El custom_id dice cuáles son. El resto ya está.", `{
  "results": [
    { "custom_id": "invoice-10091.pdf", "result": { "type": "succeeded", "total": 48.20 } },
    { "custom_id": "invoice-08810.pdf", "result": { "type": "errored", "error": "context length" } }
  ]
}
# 12 errors, 1988 succeeded`),
      act("Se reenvían solo esas doce, partidas. No las dos mil.", `POST /v1/messages/batches
requests:
  - custom_id: invoice-08810.pdf#part1
  - custom_id: invoice-08810.pdf#part2`),
      stop("Si el tope es 30 horas y cada lote puede tardar 24, se envía uno cada 4. Peor caso: 4 de espera más 24 de proceso. Un check que bloquea un merge no entra aquí: alguien lo está esperando, y el batch no encadena varias vueltas de tools."),
    ]),
    bad: lane([
      send("El comentario del pull request se manda por lote porque sale más barato, y una request del lote pide tres vueltas de tools.", `{
  "requests": [
    {
      "custom_id": "pr-440",
      "params": { "messages": [{ "role": "user", "content": "search, then read, then comment" }] }
    }
  ]
}
# a person is waiting on this to merge`),
      back("Al día siguiente todavía no hay comentario. Dentro de la request las tools no se encadenaron.", `pr-440: not ready after hours
tool turns inside one batch request: not run`),
      fail("Reenviar las 2.000 porque fallaron 12 también está de más. Se reenvían las 12, por custom_id."),
    ]),
  },
  "4.6": {
    title: "Otra instancia lee el parche",
    fork: "¿Quién revisa el parche?",
    askAfter: 0,
    goodWhen: "Otra instancia, un archivo por vez",
    badWhen: "La misma sesión, con los 14 archivos",
    good: lane([
      send("La instancia que escribió el código no es la que lo revisa. El primer pase es un archivo por vez, y el hallazgo entra en un schema.", `new conversation, no author notes
review src/billing/refund.ts only
schema: { file, line, summary, confidence }`),
      back("Cada archivo devuelve sus hallazgos locales, con una confianza.", `{ file: "refund.ts", line: 40, summary: "amount unchecked", confidence: 0.4 }`),
      send("El segundo pase no reabre los archivos. Recibe solo esos hallazgos y busca lo que cruza.", `user: |
  findings:
    - refund.ts writes amount
    - invoice.ts reads amount as a string
  Look only for data that crosses files.`),
      back("El pull request que bloquea el merge usa llamadas síncronas. Lo nocturno puede ir en batch.", `integration finding:
  "amount is a number on one side and a string on the other"
route: human review, because confidence is 0.4`),
      stop("La confianza viaja en el hallazgo para decidir quién lo mira. No se le pide a la autora que sea más minuciosa."),
    ]),
    bad: lane([
      send("La misma sesión, con los 14 archivos juntos.", `same conversation that wrote the patch
user: "Review your own code. Be thorough."
attached: 14 files`),
      back("Repite el razonamiento con el que escribió el parche y da por bueno el fallo. Lo que cruza archivos no tiene un pase propio.", `text: "Looks consistent."
missed: amount number vs string`),
      fail("Pegar 14 archivos y pedir “sé consistente” no reparte la atención."),
    ]),
  },
  "5.1": {
    title: "Treinta turnos después, el monto sigue escrito",
    fork: "¿El monto exacto viaja fuera del resumen?",
    askAfter: 0,
    goodWhen: "case_facts lleva 48.20 USD",
    badWhen: "El resumen dice unos cincuenta dólares",
    good: lane([
      send("La llamada vuelve a mandar la conversación. Los hechos del caso van aparte del resumen, con los números tal cual.", `POST /v1/messages
{
  "messages": [
    {
      "role": "user",
      "content": "case_facts:\\n  refund: 48.20 USD\\n  order: 10091\\n  promised: 2026-04-02\\nsummary: The customer is upset about a refund."
    }
  ]
}`),
      act("La consulta del pedido traía 40 campos. Al historial entran solo los cinco que la decisión usa, y el resumen de hallazgos va al inicio.", `tool_result trimmed:
  order_id: "10091"
  status: issued
  amount: 48.20
  date: "2026-03-03"
  promised: "2026-04-02"
# 35 other fields dropped`),
      back("La respuesta cita el monto exacto, no una cifra redonda.", `{
  "stop_reason": "end_turn",
  "content": [
    { "type": "text", "text": "The refund is 48.20 USD, promised by 2026-04-02." }
  ]
}`),
      stop("/compact achica la exploración y conserva decisiones, restricciones y esos valores. Cambiar a un modelo con más ventana no reemplaza este recorte."),
    ]),
    bad: lane([
      send("A los 30 turnos solo viaja el resumen. No hay bloque de hechos, y el HTML de cada página va entero.", `{
  "messages": [
    { "role": "user", "content": "The customer is upset about a refund of about fifty dollars." },
    { "role": "user", "content": [{ "type": "tool_result", "content": "<html>...40 fields and the full page..." }] }
  ]
}
# 48.20 is nowhere in this call`),
      back("El modelo contesta con la cifra vaga, y el dato exacto, si quedó, está en el medio del HTML.", `{
  "stop_reason": "end_turn",
  "content": [
    { "type": "text", "text": "The refund was about fifty dollars." }
  ]
}`),
      fail("Subir de modelo no arregla un historial lleno de campos que nadie usa."),
    ]),
  },
  "5.2": {
    title: "Cuatro pedidos que se parecen y no se cierran igual",
    fork: "¿El cliente pidió una persona?",
    askAfter: 0,
    goodWhen: "Se escala en ese momento",
    badWhen: "Se sigue investigando para llegar con todo resuelto",
    good: lane([
      send("El mensaje pide una persona. No se abre una investigación antes.", `user: "Transfer me to a person."
order: 10091`),
      act("Se escala en ese momento. El pase lleva lo que ya se sabe, no diez minutos más de búsqueda.", `handoff:
  reason: "customer asked for a person"
  order: "10091"`),
      send("Otro mensaje no pide una persona, pero la política no cubre lo que pide.", `user: "Match the competitor price of 40 USD."
policy: "price adjustments on our own site only"`),
      back("Se escala diciendo el hueco. No se redacta una excepción.", `handoff:
  reason: "policy does not cover competitor matching"`),
      act("“Ana” devuelve dos fichas. Se pide el dato que falta, no se elige la primera. Un restablecimiento de contraseña, aunque el mensaje venga furioso, se resuelve.", `search "Ana" -> [ana@a.example, ana@b.example]
reply: "Which email, or which order id?"

user: "This password reset is ridiculous."
-> reset the password, acknowledge the frustration`),
      stop("Se escala si piden una persona, si la política no cubre el caso, o si faltan datos para distinguir dos fichas. El enojo no convierte un restablecimiento de contraseña en un caso difícil."),
    ]),
    bad: lane([
      send("Después de pedir un humano, el agente sigue buscando para “llegar con todo resuelto”.", `user: "I want a human."
agent: lookup_order, search policy, draft a fix
# 10 minutes later`),
      back("Con dos Anas, toma la primera porque la confianza del modelo es alta. Ante el precio del competidor, inventa una excepción.", `chosen: ana@a.example
confidence: 0.91
reply: "We can match 40 USD this once."`),
      fail("Ni la confianza autoinformada ni el tono dicen si el caso es difícil. El cliente enojado del password tenía un caso sencillo."),
    ]),
  },
  "5.3": {
    title: "Una fuente se cae a la mitad del informe",
    fork: "¿Qué se le devuelve al coordinador?",
    askAfter: 1,
    goodWhen: "Tipo de fallo, consulta, parciales y una alternativa",
    badWhen: "Una lista vacía, o se cancela todo",
    good: lane([
      send("El subagente pide los papers. El servidor no contesta.", `search query: "remote work 2024"
-> timeout
errorCategory: transient`),
      act("Reintenta una vez la misma consulta. La segunda también falla. No devuelve una lista vacía.", `retry 1: timeout
to coordinator:
  failure: timeout
  query: "remote work 2024"
  partial: [paper A, paper B, paper C]
  alternative: "company reports index"`),
      back("El coordinador termina con lo demás y anota el hueco. Los otros subagentes siguen.", `report:
  covered: press, company reports
  gap: "academic source did not respond"
other subagents: not cancelled`),
      stop("“Search unavailable”, solo, no alcanza: no dice qué se intentó ni qué se salvó."),
    ]),
    bad: lane([
      back("El mismo timeout vuelve disfrazado de éxito.", `tool_result: []
isError: false
report: "No research exists on this topic."`),
      fail("El otro extremo cancela a los demás subagentes porque uno falló, y se tira el trabajo que ya estaba bien. Los dos son los anti-patrones: esconder el error, o matar el flujo entero."),
    ]),
  },
  "5.4": {
    title: "Una hora dentro del módulo de pagos",
    fork: "¿El hallazgo quedó escrito fuera del chat?",
    askAfter: 0,
    goodWhen: "Scratchpad y manifest",
    badWhen: "Todo sigue en la conversación",
    good: lane([
      act("El hallazgo concreto se escribe fuera del chat, para poder releerlo.", `scratchpad.write
  store: src/billing/store.ts
  refund function: processRefund`),
      send("La pregunta larga se la lleva un subagente. El principal se queda la coordinación.", `Task:
  prompt: "Which tests cover processRefund? Return a short list."
-> refund.test.ts, routes.test.ts`),
      act("Al cerrar la fase, ese resumen abre la siguiente. El manifest queda en un lugar conocido.", `phase 2 prompt starts with the phase 1 summary
manifest.write:
  agent: explorer
  state: { store: "src/billing/store.ts", tests: 2 }`),
      back("Si el proceso se cae, el coordinador no empieza de cero.", `load manifest
inject state into the new prompts
# /compact only if the remaining output is noise`),
      stop("Una hora después, la respuesta cita src/billing/store.ts y no “lo que se suele hacer”."),
    ]),
    bad: lane([
      send("Todo sigue dentro de la conversación. No hay archivo ni manifest.", `user: "Where is billing state stored?"
# processRefund was read an hour ago
# nothing was written outside the chat`),
      back("La respuesta ya no cita la clase leída.", `text: "In a typical React app this would use Redux."`),
      fail("Un crash a la mitad obliga a empezar de cero. Dejar la exploración verbosa en el agente principal hace que la coordinación se pierda entre listas de archivos."),
    ]),
  },
  "5.5": {
    title: "El 97 % que escondía a un proveedor",
    fork: "¿El 97 % se midió por segmento?",
    askAfter: 0,
    goodWhen: "El proveedor B sigue en revisión",
    badWhen: "Se apaga la revisión por el número global",
    good: lane([
      act("Se mide por segmento, no solo el total. El umbral de cada campo sale de documentos ya etiquetados.", `overall accuracy: 0.97
vendor B invoices: 0.70
threshold[tax_id] = compare(model confidence, human label)`),
      send("De lo que el modelo marcó con confianza alta se saca una muestra, al azar dentro de cada tipo.", `sample:
  invoices: 20, random inside the type
  receipts: 20, random inside the type
high confidence and vendor B -> still reviewed`),
      back("Confianza baja, o dos fuentes que no coinciden, van a una persona. Se ordenan para gastar primero esas horas.", `route human:
  - invoice 10091, confidence 0.42
  - invoice 10088, stated 48.20 vs calculated 40.00
auto:
  - receipt, confidence 0.93, this document type already measured`),
      stop("El proveedor B no desaparece del tablero solo porque el agregado se vea bien."),
    ]),
    bad: lane([
      send("Se apaga la revisión porque el número global pasa de 95.", `if overall > 0.95: disable human review
# threshold copied from the model's own "I am sure"`),
      back("Las facturas del proveedor B siguen saliendo mal y nadie las mira.", `vendor B tax_id wrong: still auto-accepted
sample of high-confidence rows: none`),
      fail("“El modelo dice que está seguro” no es un umbral calibrado. Automatizar ese segmento antes de medirlo repite el error."),
    ]),
  },
  "5.6": {
    title: "Dos precios para la misma caja",
    fork: "¿Las dos cifras viajan con su fuente?",
    goodWhen: "12 y 9, con fecha y origen",
    badWhen: "Queda el 12 y se inventan 30 días",
    good: lane([
      back("Cada subagente devuelve la afirmación con el lugar y la fecha. No solo la frase.", `task_01:
  claim: "12 USD per box"
  source: "Catalog 2026, table 2"
  collected: "2026-03-01"
task_02:
  claim: "9 USD per box"
  source: "Market report 2022, page 4"
  collected: "2022-11-01"`),
      act("La síntesis copia el vínculo. Guarda las dos cifras y deja que el coordinador vea el cambio en el tiempo.", `synthesis:
  - 12 USD | Catalog 2026, table 2 | 2026-03-01
  - 9 USD | Market report 2022, page 4 | 2022-11-01
  note: "different years, not the same moment"`),
      back("La ventana de devolución no está en ninguno de los documentos. La respuesta lo dice.", `question: "What is the return window?"
answer: "Not in the sources."
# figures rendered as a table, the news as prose`),
      stop("Elegir 12 porque suena más actual escondería el 9. El informe separa lo que las fuentes sostienen de lo que está disputado."),
    ]),
    bad: lane([
      act("La síntesis se queda el número y tira la URL. Entre 12 y 9 elige uno en silencio.", `synthesis: "The price is 12 USD."
# table 2 is gone
# 9 USD is gone
# no date`),
      back("Cuando preguntan por la ventana de devolución, el informe inventa la cifra habitual y la presenta como dato del documento.", `answer: "The return window is 30 days."
source: none`),
      fail("Sin fecha, 12 contra 9 parece un error y no un cambio entre 2022 y 2026. Sin fuente, nadie puede volver a la tabla 2."),
    ]),
  },
};
})();
