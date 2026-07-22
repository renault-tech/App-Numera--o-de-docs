# 📚 Documentação — Numera (Sistema de Numeração de Documentos)

Documentação completa de planejamento, arquitetura e evolução da plataforma.
Este índice é o ponto de entrada para qualquer pessoa (ou agente de IA) que for
continuar a implementação do sistema.

---

## O que é o sistema

Plataforma web que substitui o controle manual de numeração de documentos
oficiais (ofícios, memorandos, portarias etc.) — hoje feito em papel, riscando
números usados — por um sistema centralizado que:

- **Reserva números de forma única** (nunca repete um número já usado);
- Suporta **numeração contínua** ou **reiniciada a cada ano**, configurável por tipo de documento;
- Permite que **cada usuário trabalhe com seus tipos de documento** (permissões configuráveis);
- Registra **histórico e logs de auditoria** (quem reservou qual número, quando e para quê);
- Permite **busca por tema/assunto, número e data** para verificação posterior.

## Estado atual (v4.2)

| Aspecto | Situação |
|---|---|
| Frontend | SPA em JavaScript vanilla (`app.js`), HTML/CSS puros, deploy no Vercel |
| Backend | Supabase (PostgreSQL + Auth), acessado direto do browser |
| Autenticação | Híbrida: Supabase Auth + fallback legado com senha em texto puro |
| Permissões | 4 níveis (admin, completo, restrito, somente leitura) + secretarias |
| Funcionalidades | Reserva, histórico, busca, gestão de docs/usuários, logs, exportação PDF/Excel |

O sistema **funciona**, mas tem dívidas técnicas importantes documentadas aqui
(condição de corrida na reserva, segurança, organização do código) que devem ser
resolvidas antes de novas funcionalidades grandes.

---

## Índice dos documentos

| Nº | Documento | Conteúdo |
|----|-----------|----------|
| 01 | [Visão Geral do Produto](./01-visao-geral.md) | Problema, objetivos, personas, casos de uso, regras de negócio |
| 02 | [Arquitetura](./02-arquitetura.md) | Arquitetura atual, arquitetura alvo, decisões técnicas, migração |
| 03 | [Modelo de Dados](./03-modelo-de-dados.md) | Schema atual, schema proposto, migrações SQL, atomicidade da numeração |
| 04 | [Segurança](./04-seguranca.md) | Autenticação, RLS, senhas, chaves, auditoria imutável |
| 05 | [UI/UX e Design System](./05-ui-ux.md) | Layout profissional, design system, telas, acessibilidade, responsivo |
| 06 | [Performance e Otimização](./06-performance.md) | Velocidade de navegação, carregamento, índices, cache |
| 07 | [Roadmap e Backlog](./07-roadmap.md) | Fases de evolução, backlog priorizado, critérios de aceite |
| 08 | [Guia de Desenvolvimento](./08-guia-desenvolvimento.md) | Estrutura do repositório, convenções, limpeza, fluxo de trabalho |
| 09 | [Testes e Qualidade](./09-testes-qualidade.md) | Estratégia de testes, cenários críticos, checklist de release |

---

## Por onde começar

1. **Novo no projeto?** Leia `01-visao-geral.md` e depois `02-arquitetura.md`.
2. **Vai implementar algo?** Consulte `07-roadmap.md` para prioridades e
   `08-guia-desenvolvimento.md` para convenções.
3. **Vai mexer no banco?** `03-modelo-de-dados.md` é obrigatório — em especial a
   seção sobre **reserva atômica de números**, que é o coração do sistema.
4. **Vai mexer em telas?** `05-ui-ux.md` define o design system e os padrões.

## Prioridade imediata (resumo do roadmap)

1. 🔴 **Corrigir condição de corrida da reserva** (dois usuários podem receber o mesmo número) — ver doc 03.
2. 🔴 **Segurança**: remover senhas em texto puro, fechar RLS — ver doc 04.
3. 🟡 **Limpeza do repositório**: remover ~15 arquivos de backup/patch — ver doc 08.
4. 🟡 **Refatorar frontend em módulos** — ver doc 02.
5. 🟢 Novas funcionalidades (anulação de números, relatórios, notificações) — ver doc 07.
