# Testes transacionais de RPC/policy

Convenção usada nos outros 3 repositórios da plataforma, adotada aqui a
partir do plano em `../../docs/PLANO_MIGRACAO_AUTH.md`: cada arquivo
`NNN_descricao.sql` testa um cenário completo dentro de uma transação que
**nunca commita de verdade**.

Padrão:

```sql
begin;

-- monta o cenário (usuários de teste, dados)

do $$
begin
  -- simula identidade: set local role authenticated;
  -- set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
  -- roda a RPC/consulta, confere o resultado esperado com raise exception
  -- se algo não bater
end $$;

rollback;
```

Nunca terminar um teste sem `rollback` (ou um `raise exception` forçado no
fim de um `do $$ ... $$` dentro de um `begin` explícito) — um script que
termina só com `select` sem forçar isso pode commitar de verdade por engano
(já aconteceu nos outros repos desta plataforma).
