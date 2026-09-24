# Rollbacks de migrations

Cada migration em `../migrations/` que muda comportamento visível (RPC,
RLS, coluna) ganha, quando fizer sentido, um arquivo espelho aqui —
`<mesmo-nome-da-migration>_rollback.sql` — capaz de desfazer exatamente essa
migration, testado transacionalmente antes de a migration original ser
aplicada de verdade (não depois, para não descobrir tarde demais que o
rollback não funciona).

Uso pretendido: se um passo do plano em
`../../docs/PLANO_MIGRACAO_AUTH.md` (PR1 ou PR5, que mudam RLS/RPC de
autenticação) travar o acesso de alguém em produção, o rollback correspondente
já está pronto para aplicar sem precisar escrever SQL sob pressão.
