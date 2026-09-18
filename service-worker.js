// Endereço do servidor (Cloudflare Worker) que processa o comprovante
const WORKER_URL = 'https://comprovantes-worker.williamamorim126.workers.dev/';

// Instala o service worker imediatamente, sem esperar
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Assume o controle da página assim que ativado
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Aqui é onde a mágica acontece: o Android manda o arquivo compartilhado
// para essa URL (algo terminando em /share-target), e é o service worker
// que intercepta essa chamada antes mesmo dela chegar em qualquer servidor.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTargetRapido(event));
  }
});

async function handleShareTargetRapido(event) {
  try {
    const formData = await event.request.formData();
    const file = formData.get('comprovante');

    if (!file) {
      const chaves = Array.from(formData.keys()).join(',') || 'nenhuma';
      return Response.redirect('erro.html?motivo=' + encodeURIComponent('Arquivo não encontrado no campo "comprovante". Campos recebidos: ' + chaves), 303);
    }

    // Dispara o processamento pesado (IA + planilha) em segundo plano.
    // event.waitUntil mantém o service worker "vivo" até isso terminar,
    // mesmo depois da resposta já ter sido enviada pro Android.
    event.waitUntil(processarEmSegundoPlano(file));

    // Responde IMEDIATAMENTE, sem esperar IA nem planilha.
    return Response.redirect('sucesso.html', 303);
  } catch (err) {
    return Response.redirect('erro.html?motivo=' + encodeURIComponent(String(err && err.message || err)), 303);
  }
}

async function processarEmSegundoPlano(file) {
  try {
    const formParaEnviar = new FormData();
    formParaEnviar.append('comprovante', file, file.name);

    const resposta = await fetch(WORKER_URL, {
      method: 'POST',
      body: formParaEnviar,
    });
    const resultado = await resposta.json();

    if (resultado.success) {
      await self.registration.showNotification('Comprovante registrado ✅', {
        body: `${resultado.data.descricao} — R$ ${resultado.data.valor} (${resultado.data.data})`,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: 'comprovante-resultado',
      });
    } else {
      await self.registration.showNotification('⚠️ Erro ao processar comprovante', {
        body: 'Toque para tentar reenviar. Detalhe: ' + (resultado.error || 'desconhecido'),
        icon: 'icon-192.png',
        tag: 'comprovante-resultado',
      });
    }
  } catch (err) {
    await self.registration.showNotification('⚠️ Erro ao processar comprovante', {
      body: 'Falha de conexão: ' + String(err.message || err),
      icon: 'icon-192.png',
      tag: 'comprovante-resultado',
    });
  }
}
