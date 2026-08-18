import test from "node:test"
import assert from "node:assert/strict"
import {
  LEAD_STATUS_LABEL,
  PIPELINE_COLUMNS,
  patchForPipelineColumn,
} from "../packages/shared/src/constants.ts"

// -----------------------------------------------------------------------
// IMPLEMENTATION-CRM-003A — renomear só o rótulo da coluna do Kanban,
// sem tocar no enum real nem no rótulo genérico de status. Casos H-I.
// -----------------------------------------------------------------------

// H. coluna do Kanban mostra "Pré-aprovada / Gerar ficha"
test("H. PIPELINE_COLUMNS['aprovada'].label -> 'Pré-aprovada / Gerar ficha'", () => {
  const coluna = PIPELINE_COLUMNS.find((col) => col.key === "aprovada")
  assert.equal(coluna?.label, "Pré-aprovada / Gerar ficha")
})

// I. status interno continua 'aprovada' (enum e patch inalterados)
test("I. LEAD_STATUS_LABEL.aprovada continua 'Aprovada' (badge/filtros não mudam)", () => {
  assert.equal(LEAD_STATUS_LABEL.aprovada, "Aprovada")
})

test("I. patchForPipelineColumn('aprovada') continua gravando status='aprovada'", () => {
  assert.deepEqual(patchForPipelineColumn("aprovada"), {
    status: "aprovada",
    etapa_pos_aprovacao: null,
  })
})
