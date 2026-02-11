
const fs = require('fs');
const path = require('path');

const filePath = path.join('G:', 'Meu Drive', 'Projetos IA', 'Apps', 'App Numeração de docs', 'app.js');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Define the block start and end to identify the region
    const startMarker = "    // Mover controles de zoom para dentro do header (UX/UI Best Practice)";
    const endMarker = "    }, 500); // Pequeno delay para garantir que elementos foram renderizados";

    const newCode = `    // Mover controles de zoom para dentro do header (UX/UI Best Practice)
    // Usar polling para garantir que elementos dinâmicos sejam encontrados
    let attempts = 0;
    const interval = setInterval(() => {
        const zoomControls = document.querySelector('.floating-zoom-controls');
        const headerActions = document.querySelector('.header-actions');
        
        if (zoomControls && headerActions) {
            clearInterval(interval);
            
            // Remover estilos de posicionamento fixo e aplicar estilos inline para o header
            zoomControls.style.position = 'static';
            zoomControls.style.top = 'auto';
            zoomControls.style.right = 'auto';
            zoomControls.style.boxShadow = 'none';
            zoomControls.style.border = 'none';
            zoomControls.style.background = 'transparent';
            zoomControls.style.padding = '0';
            zoomControls.style.marginRight = '1.5rem'; 
            zoomControls.classList.remove('floating-zoom-controls');
            zoomControls.classList.add('header-zoom-controls');

            // Inserir antes dos outros botões
            headerActions.insertBefore(zoomControls, headerActions.firstChild);
            console.log('Zoom controls integrated into header successfully');
        }

        attempts++;
        if (attempts > 50) clearInterval(interval); // Parar após 5 segundos
    }, 100);`;

    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
        const afterEndIdx = endIdx + endMarker.length;
        const newContent = content.substring(0, startIdx) + newCode + content.substring(afterEndIdx);

        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log("Successfully patched app.js");
    } else {
        console.log("Could not find the block to replace");
        console.log(`Start found: ${startIdx !== -1}`);
        console.log(`End found: ${endIdx !== -1}`);

        // Debug: print around the area if partial match
        if (startIdx !== -1) {
            console.log("Context around start:", content.substring(startIdx, startIdx + 200));
        }
    }

} catch (err) {
    console.error("Error patching file:", err);
}
