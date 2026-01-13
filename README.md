# 📄 Sistema de Numeração de Documentos

Sistema web para gerenciamento e reserva de numeração sequencial de documentos oficiais.

---

## 🚀 Como Usar o Sistema

### Acesso
1. Abra o arquivo `index.html` em qualquer navegador moderno
2. **Login Padrão:**
   - Usuário: `admin`
   - Senha: `admin123`

### Funcionalidades Principais

#### 👤 **Para Usuários Comuns:**
- Reservar números de documentos
- Ver histórico de reservas
- Buscar documentos por nome

#### 🔑 **Para Administradores:**
- **Estatísticas:** Visualizar métricas do sistema
- **📄 Gerenciar Documentos:** Adicionar, editar e configurar tipos de documentos
- **👥 Gerenciar Usuários:** Criar usuários com diferentes níveis de permissão
- **📊 Logs:** Visualizar todas as ações do sistema

---

## 🖥️ Continuar Editando em Outro Computador

### Método 1: Google Drive Desktop (Recomendado)
1. Instale o **Google Drive para Desktop** no novo computador
2. Faça login com sua conta Google
3. Aguarde sincronização completa
4. Os arquivos estarão em: `G:\Meu Drive\Projetos IA\Apps\App Numeração de docs`
5. **No Antigravity:**
   - Clique em "Abrir Pasta"
   - Navegue até a pasta acima
   - Continue editando normalmente

### Método 2: Download Manual
1. Acesse [drive.google.com](https://drive.google.com)
2. Vá em: `Projetos IA > Apps > App Numeração de docs`
3. Baixe toda a pasta
4. Extraia no computador
5. Abra a pasta no Antigravity

---

## 📁 Estrutura do Projeto

```
App Numeração de docs/
├── index.html          # Página principal (entrada do app)
├── app.js              # Lógica principal (1000+ linhas)
├── styles.css          # Estilos CSS
├── admin-views.js      # Funções de visualização admin
├── autocomplete.js     # Autocomplete de documentos
└── README.md           # Este arquivo
```

---

## 💾 Armazenamento de Dados

**IMPORTANTE:** Os dados são salvos no **localStorage** do navegador.

### O que isso significa:
- ✅ Funciona offline (sem internet)
- ❌ Dados ficam no navegador específico
- ❌ Mudar de navegador/computador = dados zerados
- ❌ Limpar dados do navegador = perde tudo

### Dados Armazenados:
- Tipos de documentos
- Usuários cadastrados
- Reservas de números
- Logs do sistema

---

## 🔧 Comandos Úteis

### Resetar Dados do Sistema
No console do navegador (F12):
```javascript
resetAppData()
```

### Ver Dados Armazenados
```javascript
// Ver todos os documentos
JSON.parse(localStorage.getItem('documents'))

// Ver todos os usuários
JSON.parse(localStorage.getItem('users'))

// Ver todas as reservas
JSON.parse(localStorage.getItem('reservations'))

// Ver logs
JSON.parse(localStorage.getItem('logs'))
```

---

## 👥 Níveis de Permissão

1. **Administrador:** Acesso total ao sistema
2. **Usuário Completo:** Pode reservar números de todos os documentos
3. **Usuário Restrito:** Acessa apenas documentos específicos
4. **Somente Leitura:** Visualiza histórico sem poder reservar

---

## 🎨 Navegação na Tela de Administração

### Estrutura:
```
┌─────────────────────────────────────┐
│     📊 ESTATÍSTICAS (4 cards)       │
├─────────────────────────────────────┤
│     🎯 GERENCIAMENTO                │
│  ┌──────┐  ┌──────┐  ┌──────┐      │
│  │  📄  │  │  👥  │  │  📊  │      │
│  │ Docs │  │Users │  │ Logs │      │
│  └──────┘  └──────┘  └──────┘      │
└─────────────────────────────────────┘
```

**Como usar:**
1. Clique em qualquer card de gerenciamento
2. Abre a tela específica com:
   - Botão **← Voltar**
   - Botão **➕ Adicionar**
   - Lista de itens
3. Formulários aparecem inline (dentro da tela)

---

## 📝 Campos do Formulário de Usuário

Ao adicionar/editar usuários, preencha:

**📋 Informações Pessoais:**
- Nome Completo
- Cargo
- Setor
- Secretaria

**🔐 Credenciais:**
- Username (login único)
- Senha

**🔑 Permissões:**
- Nível de permissão
- Documentos permitidos (para usuários restritos)

---

## 🐛 Problemas Comuns

### "Mudanças não aparecem no navegador"
**Solução:** Limpar cache
- **Windows:** `Ctrl + Shift + Delete` ou `Ctrl + F5`
- **Mac:** `Cmd + Shift + Delete` ou `Cmd + Shift + R`

### "Perdi todos os dados"
**Causa:** localStorage foi limpo
**Prevenção:** Considerar implementar backup/exportação

### "Não consigo fazer login"
**Solução:** Use as credenciais padrão:
- Usuário: `admin`
- Senha: `admin123`

---

## 🔮 Próximas Melhorias Sugeridas

- [ ] Implementar exportar/importar dados (JSON)
- [ ] Backend online (Firebase/Supabase)
- [ ] Backup automático
- [ ] Geração de relatórios em PDF
- [ ] Notificações de novas reservas
- [ ] API REST para integrações

---

## 📞 Informações Técnicas

**Tecnologias:**
- HTML5
- JavaScript Vanilla (ES6+)
- CSS3 (Grid, Flexbox, Animations)
- LocalStorage API

**Compatibilidade:**
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

**Tamanho:**
- app.js: ~47 KB
- styles.css: ~26 KB
- Total: ~75 KB

---

**Última atualização:** 12/01/2026
**Versão:** 2.0 (Sistema com Cards de Navegação)
