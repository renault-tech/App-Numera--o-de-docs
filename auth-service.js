/**
 * Serviço de Autenticação
 * Gerencia o cadastro e login via Supabase Auth e fallback para tabela legada.
 */

// Converte a linha crua da tabela 'users' (snake_case, vinda do Supabase)
// para o formato que o resto do app.js espera (camelCase). Sem isso,
// state.currentUser.allowedDocuments fica sempre undefined e nenhum
// documento aparece para usuários restritos/somente leitura.
function normalizeUser(row) {
    if (!row) return row;
    return {
        ...row,
        allowedDocuments: row.allowed_documents || [],
        cardOrder: Array.isArray(row.card_order) ? row.card_order : [],
        createdAt: row.created_at
    };
}

const authService = {
    // Cadastro de novo usuário
    async signUp(userData) {
        // 1. Criar usuário no Auth do Supabase
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: userData.email,
            password: userData.password,
            options: {
                data: {
                    name: userData.name,
                    username: userData.username
                }
            }
        });

        if (authError) {
            console.error('Erro no Supabase Auth:', authError);
            return { error: authError.message };
        }

        if (!authData.user) {
            return { error: "Erro desconhecido ao criar usuário." };
        }

        // 2. Inserir dados na tabela pública 'users'
        // O ID deve ser o mesmo do Auth para linkagem
        const publicUser = {
            id: authData.user.id,
            email: userData.email,
            username: userData.username,
            password: userData.password, // TODO: Em produção, não salvar senha aqui ou usar hash. Mantido por compatibilidade legado.
            name: userData.name,
            cargo: userData.cargo,
            setor: userData.setor,
            secretaria: userData.secretaria,
            role: 'user_restricted', // Padrão: restrito até aprovação
            allowed_documents: userData.allowedDocuments || [], // Padrão da secretaria escolhida (se configurado)
            approved: false // Pendente de aprovação
        };

        // upsert (não insert): a futura migration do plano de auth
        // (docs/PLANO_MIGRACAO_AUTH.md, PR1) cria um trigger que já insere
        // essa linha assim que a conta nasce no Auth — sem upsert, este
        // insert colidiria com a linha do trigger e o cadastro quebraria.
        // Hoje, sem o trigger ainda existir, upsert se comporta como
        // insert normal (nenhuma linha em conflito) — nenhuma mudança de
        // comportamento agora, só compatibilidade futura.
        const { error: dbError } = await supabase
            .from('users')
            .upsert([publicUser], { onConflict: 'id' });

        if (dbError) {
            console.error('Erro ao salvar detalhes do usuário:', dbError);
            // Opcional: Desfazer criação no Auth?
            return { error: "Usuário criado, mas falha ao salvar detalhes. Contate o suporte." };
        }

        return { user: publicUser, message: "Cadastro realizado com sucesso! Aguarde aprovação do administrador." };
    },

    // Login (Híbrido)
    async signIn(emailOrUsername, password) {
        const isEmail = emailOrUsername.includes('@');

        // Tentativa 1: Supabase Auth (apenas se for email)
        if (isEmail) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: emailOrUsername,
                password: password
            });

            if (!error && data.user) {
                // Buscar dados completos na tabela 'users'
                const { data: userDetails, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                if (userDetails) {
                    if (userDetails.approved === false) {
                        await supabase.auth.signOut();
                        return { error: "Sua conta aguarda aprovação do administrador." };
                    }
                    localStorage.setItem('currentUserId', userDetails.id);
                    return { user: normalizeUser(userDetails) };
                }
            }
        }

        // Tentativa 2: Fallback Legado (Busca direta na tabela)
        // Útil para usuários antigos sem email ou username
        const { data: legacyUser, error: legacyError } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${emailOrUsername},email.eq.${emailOrUsername}`)
            .eq('password', password) // Nota: Em produção, usar hash
            .single();

        if (legacyUser) {
            localStorage.setItem('currentUserId', legacyUser.id);
            return { user: normalizeUser(legacyUser) };
        }

        return { error: "Usuário ou senha incorretos." };
    },

    // Recuperação de senha (não existia até aqui — só o e-mail/senha do
    // Supabase Auth suporta este fluxo; contas legadas sem conta no Auth
    // (só linha em `users`, sem par em `auth.users`) não têm como
    // recuperar por aqui e continuam precisando falar com o admin).
    async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + window.location.pathname
        });
        if (error) {
            console.error('Erro ao solicitar recuperação de senha:', error);
            return { error: error.message };
        }
        return { ok: true };
    },

    // Chamado depois do evento PASSWORD_RECOVERY, com a sessão temporária
    // que o link de recuperação já deixou ativa.
    async updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            console.error('Erro ao definir nova senha:', error);
            return { error: error.message };
        }
        return { ok: true };
    },

    // Logout
    async signOut() {
        await supabase.auth.signOut();
        localStorage.removeItem('currentUserId');
        // Limpar estado global se necessário
        if (typeof state !== 'undefined') {
            state.currentUser = null;
        }
    },

    // Verificar sessão atual
    async getCurrentUser() {
        // 1. Checar sessão Supabase
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();
            return normalizeUser(data);
        }

        // 2. Checar localStorage (Legado)
        const savedId = localStorage.getItem('currentUserId');
        if (savedId) {
            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('id', savedId)
                .single();
            return normalizeUser(data);
        }

        return null;
    }
};

// Exportar para uso no browser (se necessário, ou apenas global)
window.authService = authService;
