#!/usr/bin/env node
// scripts/migrar-contas-auth.mjs
//
// PR2 do plano de migração de auth (../docs/PLANO_MIGRACAO_AUTH.md, seção 1).
// Roda manualmente, na máquina do dono — NUNCA em produção/CI/Vercel (por
// isso este diretório fica fora do build do site publicado, ver
// ../.vercelignore). Garante que toda conta em public.users tem um par
// confirmado em auth.users com a MESMA senha que a pessoa já usa hoje —
// ninguém precisa redefinir nada por causa desta migração.
//
// Uso:
//   cd scripts && npm install
//   NUMERA_SERVICE_ROLE_KEY=<service_role do projeto> node migrar-contas-auth.mjs --dry-run
//   NUMERA_SERVICE_ROLE_KEY=<service_role do projeto> node migrar-contas-auth.mjs
//
// --dry-run: só LÊ e imprime contagens/ids, nunca escreve nada, nunca
// imprime senha. Rode sempre primeiro e revise a saída antes de rodar sem
// --dry-run (esse é o critério de "pronto" do PR2 no plano). É idempotente:
// pode ser rodado várias vezes sem efeito colateral em quem já está ok.
//
// Desenho simplificado em relação à tabela de grupos A/B/C do plano: em vez
// de descobrir antecipadamente se "a senha confere" (o script, autenticado
// só via Admin API/service_role, não tem como ler
// auth.users.encrypted_password — o schema `auth` não é exposto via REST/
// SDK; esse dado só sai com SQL direto no banco, que foi como o
// levantamento A=31/B=5/C=1/D=1/E=3 registrado no plano foi produzido),
// TODA conta que já tem Auth recebe o mesmo tratamento idempotente:
// updateUserById(id, { password: <senha atual em public.users>,
// email_confirm: true }). Para quem já estava correto (grupos B e, depois
// da 1ª rodada, A), isso não muda nada visível — é reescrever o mesmo
// valor. Para quem estava divergente (grupo C), corrige. O resultado final
// é idêntico ao que a tabela do plano descreve, com menos código e sem
// depender de introspecção do schema auth.
//
// Sem fallback via SQL direto para o Grupo D (conta nova com id explícito
// = o mesmo id que já existe em public.users, para reservas/logs
// continuarem apontando certo): se a Admin API deste projeto recusar `id`
// no createUser, o script para e avisa — nunca insere direto em
// auth.users/auth.identities via SQL (regra explícita do plano).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uxdjhdnsnditivvjktzf.supabase.co';
const SERVICE_ROLE_KEY = process.env.NUMERA_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

// E-mails já confirmados pelo dono para o Grupo E (plano, seção 7,
// decisão P3) — usados só quando public.users.email estiver vazio.
const EMAILS_CONHECIDOS = {
  leandradelgado: 'leandra.cataguases@gmail.com',
  majella: 'majella@cataguases.mg.gov.br',
};

if (!SERVICE_ROLE_KEY) {
  console.error(
    'Defina NUMERA_SERVICE_ROLE_KEY (painel do projeto uxdjhdnsnditivvjktzf → Settings → API → service_role) antes de rodar.'
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function resolverEmail(pu) {
  const doPerfil = (pu.email || '').trim();
  if (doPerfil) return doPerfil;
  const conhecido = EMAILS_CONHECIDOS[pu.username];
  if (conhecido) return conhecido;
  // Ludmila Fontoura: o próprio username É o e-mail dela (achado do plano,
  // decisão P3) — nunca precisou ser perguntado.
  if (/.+@.+\..+/.test(pu.username || '')) return pu.username;
  return null;
}

async function listarTodosAuthUsers() {
  const porId = new Map();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) porId.set(u.id, u);
    if (data.users.length < perPage) break;
    page += 1;
  }
  return porId;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (nada será escrito) ===' : '=== EXECUÇÃO REAL ===');

  const { data: usuarios, error: erroUsuarios } = await admin
    .from('users')
    .select('id, username, email, password, name, role, ativo')
    .order('username');
  if (erroUsuarios) throw erroUsuarios;

  const authPorId = await listarTodosAuthUsers();

  const grupos = { comAuth: [], semAuthComEmail: [], semAuthSemEmail: [] };
  for (const pu of usuarios) {
    const authUser = authPorId.get(pu.id);
    if (authUser) {
      grupos.comAuth.push({ pu, authUser });
    } else {
      const email = resolverEmail(pu);
      if (email) grupos.semAuthComEmail.push({ pu, email });
      else grupos.semAuthSemEmail.push(pu);
    }
  }

  console.log(`\nTotal em public.users: ${usuarios.length}`);
  console.log(`Já têm Auth (sincroniza senha + confirma e-mail): ${grupos.comAuth.length}`);
  console.log(`Sem Auth, com e-mail resolvido (cria conta nova): ${grupos.semAuthComEmail.length}`);
  for (const { pu, email } of grupos.semAuthComEmail) {
    const origem = pu.email ? '' : ' [e-mail resolvido fora de public.users.email]';
    console.log(`  - ${pu.username} (${pu.role}) -> ${email}${origem}`);
  }
  console.log(`Sem Auth, sem e-mail (BLOQUEADO, aguardando dado): ${grupos.semAuthSemEmail.length}`);
  for (const pu of grupos.semAuthSemEmail) {
    console.log(`  - ${pu.username} (id ${pu.id}) — falta e-mail`);
  }

  if (
    grupos.comAuth.length + grupos.semAuthComEmail.length + grupos.semAuthSemEmail.length !==
    usuarios.length
  ) {
    throw new Error('Classificação não bateu com o total — abortando, não deveria acontecer nunca.');
  }

  if (DRY_RUN) {
    console.log('\nDry-run concluído. Nenhuma escrita foi feita. Revise a lista acima antes de rodar sem --dry-run.');
    return;
  }

  console.log(
    '\nLembrete do plano: depois de criar/sincronizar 1 admin (Grupo D) + 1 usuário comum, ' +
      'vale confirmar que os dois conseguem logar de verdade antes de deixar o restante do ' +
      'script terminar — mesmo o script sendo idempotente e seguro de rodar de novo.'
  );

  // Ordem: admins do Grupo D primeiro (nenhum admin fica trancado fora).
  const semAuthOrdenado = [...grupos.semAuthComEmail].sort((a, b) => {
    const pa = a.pu.role === 'admin' ? 0 : 1;
    const pb = b.pu.role === 'admin' ? 0 : 1;
    return pa - pb;
  });

  console.log('\n--- Criando contas novas (Grupo D) ---');
  for (const { pu, email } of semAuthOrdenado) {
    console.log(`Criando ${pu.username} (${email})...`);
    const { error } = await admin.auth.admin.createUser({
      id: pu.id,
      email,
      password: pu.password,
      email_confirm: true,
      user_metadata: { name: pu.name, username: pu.username },
    });
    if (error) {
      if (/\bid\b/i.test(error.message || '')) {
        console.error(
          `PAROU: a Admin API deste projeto recusou o id explícito para ${pu.username} (${error.message}).`
        );
        console.error('Não inserir direto via SQL — reavaliar com o plano antes de continuar (ver seção 1).');
        process.exit(1);
      }
      console.error(`Falhou ao criar ${pu.username}: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('\n--- Sincronizando senha + confirmando e-mail (contas já existentes) ---');
  let ok = 0;
  for (const { pu, authUser } of grupos.comAuth) {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: pu.password,
      email_confirm: true,
    });
    if (error) {
      console.error(`Falhou ao sincronizar ${pu.username}: ${error.message}`);
      process.exit(1);
    }
    ok += 1;
  }
  console.log(`${ok}/${grupos.comAuth.length} sincronizados.`);

  console.log('\n--- Verificação final (mesmo critério do plano, seção 1) ---');
  const authPorIdDepois = await listarTodosAuthUsers();
  let completos = 0;
  for (const pu of usuarios) {
    const authUser = authPorIdDepois.get(pu.id);
    if (authUser && authUser.email_confirmed_at) completos += 1;
    else console.log(`  PENDENTE: ${pu.username} (id ${pu.id})`);
  }
  console.log(`${completos}/${usuarios.length} usuários com Auth confirmado.`);
  if (grupos.semAuthSemEmail.length > 0) {
    console.log(
      `(${grupos.semAuthSemEmail.length} continuam bloqueados por falta de e-mail — ` +
        'normal até a decisão P3 fechar de vez; acrescente em EMAILS_CONHECIDOS e rode de novo.)'
    );
  }
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
