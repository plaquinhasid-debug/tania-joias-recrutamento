-- Nova etapa pós-aprovação: depois que a candidata confirma a Ficha de
-- Aprovação, o card vai pra cá quando a equipe manda os dados dela pra
-- Tania decidir manualmente se libera o Mostruário. Fica visível no Kanban
-- até "Tania aprovou" (-> ativa) ou "Tania recusou" (-> desistiu).
alter type etapa_pos_aprovacao_enum add value 'aguardando_tania' after 'confirmada';
