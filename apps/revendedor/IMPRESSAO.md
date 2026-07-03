# Código de Impressão via APK (Android / Stone POS)

Este código utiliza *DeepLink* para enviar o conteúdo de impressão diretamente para um aplicativo de serviço de impressão (como o `printer-app` nas maquininhas Stone), ignorando o diálogo de impressão do navegador.

## Função de Impressão (DeepLink)

```typescript
/**
 * Dispara a impressão via DeepLink no Android (Stone POS).
 * Requer que o app esteja rodando via Capacitor.
 */
function triggerApkPrint(content: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
        console.log("Iniciando impressão via DeepLink (APK)...");

        try {
            // Configuração do URI Scheme para o app de impressão
            const scheme = "printer-app";
            const authority = "print";
            
            // Monta a URL com os parâmetros e o conteúdo codificado
            const uri = `${scheme}://${authority}?SHOW_FEEDBACK_SCREEN=true&PRINTABLE_CONTENT=${encodeURIComponent(content)}`;
            
            // Redireciona para o DeepLink, o que abre o app de impressão
            window.location.href = uri;
            
            // Como DeepLinks não retornam callback, assumimos sucesso após 1s
            setTimeout(() => resolve({ success: true }), 1000);
        } catch (err) {
            console.error("Erro ao tentar imprimir via DeepLink:", err);
            resolve({ success: false });
        }
    });
}
```

## Como Usar

Chame a função passando a string formatada do ticket:

```typescript
const ticketContent = `
--------------------------------
       LUCKYCLOVER       
--------------------------------
APOSTA: #12345
VALOR: R$ 10,00
--------------------------------
`;

await triggerApkPrint(ticketContent);
```
