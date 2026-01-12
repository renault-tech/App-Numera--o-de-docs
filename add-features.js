// SOLUCAO DEFINITIVA - Encoding correto + Confirmacao + Ordem alfabetica
// Cole no Console (F12) apos login

(function () {
    // 1. CORRIGIR reserveNumber para adicionar confirmacao
    window.reserveNumber = function (docId) {
        const doc = state.documents.find(d => d.id === docId);
        if (!doc || !canReserve(docId)) return;

        const numeroFormatado = formatNumber(doc);

        // POPUP DE CONFIRMACAO
        if (!confirm(`Confirma a reserva do número:\n\n${numeroFormatado}\n\nDocumento: ${doc.name}`)) {
            return;
        }

        const reservation = {
            id: generateId(),
            docId: doc.id,
            docName: doc.name,
            number: doc.currentNumber,
            formattedNumber: numeroFormatado,
            userId: state.currentUser.id,
            userName: state.currentUser.name,
            timestamp: new Date().toISOString()
        };

        doc.currentNumber++;
        state.reservations.unshift(reservation);

        saveData();
        addLog('reserva', `Reservou ${doc.name}`, `Número: ${reservation.formattedNumber}`);

        renderDocuments();
        renderHistory();
        if (state.currentUser.role === 'admin') {
            renderAdminDocs();
            updateStats();
        }

        alert(`Número reservado com sucesso!\n\n${reservation.formattedNumber}`);
    };

    // 2. ORDENAR documentos alfabeticamente ao renderizar
    const originalRenderDocuments = window.renderDocuments;
    window.renderDocuments = function () {
        const container = document.getElementById('documentsList');
        let docs = getVisibleDocuments();

        // ORDENAR ALFABETICAMENTE
        docs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

        if (docs.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">Nenhum documento disponível.</p>';
            return;
        }

        container.innerHTML = docs.map(doc => `
            <div class="doc-card">
                <div class="doc-card-header">
                    <div class="doc-icon">📄</div>
                </div>
                <div class="doc-name">${doc.name}</div>
                <div class="doc-prefix">${doc.prefix || 'Sem prefixo'}</div>
                <div class="doc-number">${formatNumber(doc)}</div>
                ${canReserve(doc.id) ?
                `<button class="reserve-btn" onclick="reserveNumber('${doc.id}')">Reservar Número</button>` :
                `<button class="reserve-btn" disabled style="opacity:0.5">🔒 Sem Permissão</button>`
            }
            </div>
        `).join('');
    };

    // 3. ORDENAR no autocomplete tambem (se existir)
    if (window.DOCUMENT_TEMPLATES) {
        window.DOCUMENT_TEMPLATES.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    // Renderizar novamente
    if (typeof renderDocuments === 'function') renderDocuments();

    console.log('✅ Confirmação ao reservar número');
    console.log('✅ Documentos ordenados alfabeticamente');
    console.log('✅ Funciona na tela inicial e lista suspensa');
})();
