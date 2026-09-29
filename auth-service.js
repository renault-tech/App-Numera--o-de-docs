/**
 * Serviço de Autenticação
 *
 * PR3 do plano de migração de auth (docs/PLANO_MIGRACAO_AUTH.md): login só
 * pelo Supabase Auth. O fallback legado (busca direta na tabela `users`
 * comparando senha em texto puro) e o `localStorage.currentUserId` saíram
 * de vez — quem ainda não tem conta confirmada no Auth (PR2, já concluído:
 * 41/41 confirmados) não consegue mais entrar por aqui. Publicado fora do
 * horário de expediente, com aviso prévio aos servidores (regra do dono).
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

// Resolve o perfil (public.users) de uma sessão de Auth já estabelecida,
// aplicando a mesma regra de aprovado/ativo nos dois pontos que precisam
// dela (login e retomada de sessão) — extraído para não duplicar a
// checagem entre os dois. Sessão sem linha correspondente, desativada ou
// ainda não aprovada: desloga e devolve mensagem específica, nunca deixa
// a pessoa "meio logada".
async function resolverPerfilOuFalhar(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error || !data) {
        window.signOutFoiVoluntario = true;
        await supabase.auth.signOut();
        return { error: 'Sessão sem cadastro correspondente. Contate o administrador.' };
    }
    if (data.ativo === false) {
        window.signOutFoiVoluntario = true;
        await supabase.auth.signOut();
        return { error: 'Sua conta foi desativada. Contate o administrador.' };
    }
    if (!data.approved) {
        window.signOutFoiVoluntario = true;
        await supabase.auth.signOut();
        return { error: 'Sua conta aguarda aprovação do administrador.' };
    }
    return { user: normalizeUser(data) };
}

const authService = {
    // Cadastro de novo usuário. A linha em public.users nasce sozinha pelo
    // trigger criar_perfil_usuario (PR1) assim que a conta é criada no
    // Auth — sempre role='user_restricted'/approved=false, mesmo que a
    // metadata diga outra coisa. Não grava mais `password` aqui (fazia um
    // update direto na tabela logo depois do signUp, só por compatibilidade
    // com o login legado — removido no PR3; a coluna em si só sai de vez no
    // PR6): ninguém mais lê esse campo para autenticar, e mantê-lo geraria
    // um erro de RLS silencioso assim que a RLS fechar de verdade (PR5,
    // `users` só aceita escrita via RPC).
    async signUp(userData) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: userData.email,
            password: userData.password,
            options: {
                data: {
                    name: userData.name,
                    username: userData.username,
                    cargo: userData.cargo,
                    setor: userData.setor,
                    secretaria: userData.secretaria
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

        return { message: "Cadastro realizado com sucesso! Aguarde aprovação do administrador." };
    },

    // Login — só pelo Supabase Auth. "Usuário ou e-mail" continua
    // funcionando: quando o campo digitado não parece um e-mail, resolve
    // primeiro pelo Hub (função no servidor, não RPC pública — não expõe
    // a lista de usernames/e-mails para quem tentar adivinhar).
    async signIn(identificador, password) {
        let email = identificador;

        if (!identificador.includes('@')) {
            try {
                const resp = await fetch('https://centraltech-liard.vercel.app/api/numera/resolver-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: identificador })
                });
                const data = await resp.json().catch(() => ({}));
                email = data.email;
            } catch (e) {
                console.error('Erro ao resolver login pelo Hub:', e);
                email = null;
            }
            if (!email) {
                return { error: 'Usuário ou senha incorretos.' };
            }
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
            return { error: 'Usuário ou senha incorretos.' };
        }

        return resolverPerfilOuFalhar(data.user.id);
    },

    // Recuperação de senha — não chama mais `supabase.auth.
    // resetPasswordForEmail` diretamente: o SMTP nativo do Supabase tem um
    // bug confirmado de plataforma neste projeto (credenciais Brevo
    // válidas e testadas fora do Supabase com sucesso — só o envio
    // disparado pelo GoTrue nunca chega; suporte já acionado). Em vez
    // disso, chama o Hub (centraltech), que gera o link pela Admin API
    // (nunca depende de SMTP) e envia o e-mail direto via HTTPS à Brevo.
    // Resposta sempre genérica, então nenhum erro de rede aqui deve ser
    // tratado como "e-mail não existe".
    async requestPasswordReset(email) {
        try {
            await fetch('https://centraltech-liard.vercel.app/api/numera/recuperar-senha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
        } catch (e) {
            console.error('Erro ao solicitar recuperação de senha (Hub):', e);
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
        window.signOutFoiVoluntario = true;
        await supabase.auth.signOut();
        if (typeof state !== 'undefined') {
            state.currentUser = null;
        }
    },

    // Verificar sessão atual — só Supabase Auth, sem fallback via
    // localStorage. Mesma checagem de aprovado/ativo do login (ver
    // resolverPerfilOuFalhar): uma sessão válida cujo cadastro foi
    // desativado depois de logar não continua "meio logada" até a
    // próxima ação falhar — é encerrada aqui, no boot.
    async getCurrentUser() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return { user: null };
        return resolverPerfilOuFalhar(session.user.id);
    }
};

// Exportar para uso no browser (se necessário, ou apenas global)
window.authService = authService;
