# 🚀 Guia de Deploy no Vercel

Este projeto já está integrado com o Supabase e pronto para ser publicado no Vercel. Siga os passos abaixo.

## Pré-requisitos

1.  Uma conta no [Vercel](https://vercel.com).
2.  Uma conta no [GitHub](https://github.com).
3.  Git instalado localmente.

## Passo 1: Preparar o Repositório

Como você está trabalhando em uma pasta local (`G:\Meu Drive\...`), precisamos garantir que o código esteja no GitHub.

1.  **Commit das últimas alterações:**
    Abra o terminal na pasta do projeto e execute:
    ```bash
    git add .
    git commit -m "Preparando para deploy: Correções finais e vercel.json"
    ```

2.  **Criar Repositório no GitHub:**
    *   Acesse [GitHub.com/new](https://github.com/new).
    *   Crie um repositório chamado `app-numeracao-docs`.
    *   Não inicialize com README ou .gitignore (já temos).

3.  **Conectar e Enviar:**
    No terminal, execute (substitua `SEU_USUARIO` pelo seu user do GitHub):
    ```bash
    git remote add origin https://github.com/SEU_USUARIO/app-numeracao-docs.git
    git branch -M main
    git push -u origin main
    ```

## Passo 2: Publicar no Vercel

1.  Acesse o [Dashboard do Vercel](https://vercel.com/dashboard).
2.  Clique em **"Add New..."** -> **"Project"**.
3.  Selecione **"Continue with GitHub"**.
4.  Encontre o repositório `app-numeracao-docs` e clique em **"Import"**.

## Passo 3: Configuração

Na tela de configuração do projeto no Vercel:

1.  **Framework Preset:** Selecione **"Other"** (pois é HTML/JS puro).
2.  **Build Command:** Deixe em branco (não há build step).
3.  **Output Directory:** Deixe em branco (root).
4.  **Environment Variables:**
    *   O Supabase URL e Key já estão no código (`app.js`), então **NÃO** é estritamente necessário configurar variáveis de ambiente agora, a menos que você queira refatorar para segurança extra (o que exigiria build step).
    *   *Nota: Como é um app cliente-side puro (HTML/JS), as chaves do Supabase ficam expostas no código de qualquer jeito. Certifique-se de que o Row Level Security (RLS) no Supabase esteja configurado corretamente para proteger seus dados.*

5.  Clique em **"Deploy"**.

## Passo 4: Finalização

*   Aguarde o deploy (cerca de 1 minuto).
*   Você receberá uma URL (ex: `app-numeracao-docs.vercel.app`).
*   Teste o login e o funcionamento.

## Atualizações Futuras

Para atualizar o site, basta fazer alterações, commitar e dar push:

```bash
git add .
git commit -m "Nova funcionalidade: X"
git push
```

O Vercel detectará o push e fará o deploy automático.
