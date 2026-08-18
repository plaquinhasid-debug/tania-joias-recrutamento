// IMPLEMENTATION-CRM-003A — regra pura de quando a decisão final da Tania
// (Aprovar/Recusar) fica disponível no Drawer. Antes, `TaniaAprovacaoSection`
// só mostrava os botões quando `etapa_pos_aprovacao === "aguardando_tania"`
// (ou seja, só depois de uma tentativa de WhatsApp bem-sucedida). Isso fazia
// a decisão depender de entrega de WhatsApp, o que o diagnóstico da CRM-003
// apontou como o problema real: leads cuja notificação automática falhar (ou
// cujo operador nunca clicar "Enviar pra Tania") ficavam presas sem decisão
// possível, mesmo com a Ficha já preenchida e completa.
//
// A partir da CRM-003A: a Ficha já está preenchida sempre que a lead chega a
// "confirmada" (é essa transição que o preenchimento causa, ver
// `submit-ficha/index.ts`) — então a decisão fica disponível em "confirmada"
// e em "aguardando_tania" igualmente. Nenhum dos dois estados depende de
// WhatsApp ter sido enviado, aceito ou entregue.
export type EtapaDecisaoTania =
  | "contatada"
  | "confirmada"
  | "aguardando_tania"
  | "ativa"
  | "desistiu"
  | null

export function decisaoTaniaDisponivel(etapa: EtapaDecisaoTania): boolean {
  return etapa === "confirmada" || etapa === "aguardando_tania"
}

/** Mapeamento já existente antes desta tarefa — só extraído pra ficar testável isoladamente. */
export function etapaAposDecisaoTania(aprovou: boolean): "ativa" | "desistiu" {
  return aprovou ? "ativa" : "desistiu"
}
