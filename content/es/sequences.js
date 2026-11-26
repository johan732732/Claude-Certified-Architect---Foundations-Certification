window.CCARF = window.CCARF || {};

// Quién le habla a quién. Solo en lecciones donde el orden de los mensajes es la idea.
CCARF.sequences = {
  "1.1": {
    title: "Pedido 10091, llamada por llamada",
    actors: [
      { id: "U", name: "Usuario" },
      { id: "P", name: "Programa" },
      { id: "C", name: "Claude" },
      { id: "T", name: "Tool" },
    ],
    steps: [
      { from: "U", to: "P", text: "¿Ya salió el reembolso del 10091?" },
      { from: "P", to: "C", text: "llamada 1 a Claude: la pregunta y las tools" },
      { from: "C", to: "P", text: "stop_reason: tool_use, lookup_order", back: true },
      { from: "P", to: "T", text: "lookup_order del 10091" },
      { from: "T", to: "P", text: "issued 2026-03-03, 48.20 USD", back: true },
      { from: "P", to: "C", text: "llamada 2 a Claude: el tool_result con el mismo id" },
      { from: "C", to: "P", text: "stop_reason: end_turn, el texto para el cliente", back: true },
      { from: "P", to: "U", text: "el texto" },
    ],
  },
  "1.2": {
    title: "Pedido 10091, tres encargos y un hueco",
    actors: [
      { id: "U", name: "Usuario" },
      { id: "P", name: "Programa" },
      { id: "C", name: "Claude coordinador" },
      { id: "S", name: "Claude subagente" },
    ],
    steps: [
      { from: "U", to: "P", text: "Summarize refund 10091: the order, the policy, and a draft reply." },
      { from: "P", to: "C", text: "llamada 1 a Claude: el pedido" },
      { from: "C", to: "P", text: "tool_use Task, tres encargos", back: true },
      {
        par: "Papers, política y borrador",
        steps: [
          { from: "P", to: "S", text: "solo el encargo de ese especialista" },
          { from: "S", to: "P", text: "nota, stop_reason: end_turn", back: true },
        ],
      },
      { from: "P", to: "C", text: "llamada 2 a Claude: las tres notas" },
      { from: "C", to: "P", text: "falta la fecha, otra Task", back: true },
      { from: "P", to: "S", text: "solo la fecha del reembolso 10091" },
      { from: "S", to: "P", text: "3 de marzo", back: true },
      { from: "P", to: "C", text: "llamada 3 a Claude: la fecha" },
      { from: "C", to: "P", text: "end_turn, la respuesta final", back: true },
      { from: "P", to: "U", text: "el texto" },
    ],
  },
  "1.3": {
    title: "Lo que cada subagente alcanza a ver",
    actors: [
      { id: "P", name: "Programa" },
      { id: "C", name: "Coordinador" },
      { id: "S", name: "Subagente" },
      { id: "Y", name: "Síntesis" },
    ],
    steps: [
      { from: "P", to: "C", text: "Where is order 10091, and what is the shipping address?" },
      { from: "C", to: "P", text: "dos Task en la misma respuesta", back: true },
      {
        par: "Estado y dirección",
        steps: [
          { from: "P", to: "S", text: "solo el prompt de ese especialista" },
          { from: "S", to: "P", text: "nota con dato y URL, end_turn", back: true },
        ],
      },
      { from: "P", to: "Y", text: "las dos notas ya escritas en el prompt" },
      { from: "Y", to: "P", text: "end_turn, cita la fecha y la fuente", back: true },
    ],
  },
  "1.4": {
    title: "La devolución espera al cerrojo",
    actors: [
      { id: "U", name: "Usuario" },
      { id: "P", name: "Programa" },
      { id: "C", name: "Claude" },
      { id: "G", name: "Código" },
    ],
    steps: [
      { from: "U", to: "P", text: "Refund order 10091 and change the shipping address." },
      { from: "P", to: "C", text: "el mensaje, partido en dos ítems" },
      { from: "C", to: "P", text: "tool_use process_refund, sin customer_id", back: true },
      { from: "P", to: "G", text: "¿hay verified_customer_id?" },
      { from: "G", to: "P", text: "no: rechazada, no se reintenta", back: true },
      { from: "P", to: "G", text: "get_customer deja cus_44" },
      { from: "G", to: "P", text: "ahora process_refund sí corre", back: true },
      { from: "P", to: "U", text: "una respuesta, y el pase con los cuatro campos" },
    ],
  },
  "5.3": {
    title: "Una fuente se cae y las demás siguen",
    actors: [
      { id: "C", name: "Coordinador" },
      { id: "S", name: "Papers" },
      { id: "O", name: "Los demás" },
    ],
    steps: [
      { from: "C", to: "S", text: "Write the report on remote work in 2024. Include the academic papers." },
      { from: "S", to: "C", text: "timeout", back: true },
      { from: "C", to: "S", text: "la misma consulta, una vez" },
      { from: "S", to: "C", text: "timeout, parciales y una alternativa", back: true },
      { from: "C", to: "O", text: "sigan: no se cancela el informe" },
      { from: "O", to: "C", text: "prensa e informes de empresas", back: true },
    ],
  },
};
