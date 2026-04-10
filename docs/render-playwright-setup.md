# Setup do Playwright no Render (PDF Premium)

Este serviço usa **Playwright + Chromium** para gerar o PDF premium em:

- `GET /api/repertoire/pdf/:token`

Quando o browser não está presente no runtime, o erro típico é:

- `Executable doesn't exist ...`
- `Please run: npx playwright install`

## Build Command recomendado no Render

Use este comando no campo **Build Command** do serviço:

```bash
npm ci && npx playwright install chromium
```

> Se quiser reduzir dependências em distros Linux mais enxutas, pode usar:
>
> ```bash
> npm ci && npx playwright install --with-deps chromium
> ```

## Start Command

```bash
npm start
```

## O que o código já faz

- Usa `chromium` do Playwright.
- Faz `launch` com:
  - `headless: true`
  - `args: ['--no-sandbox', '--disable-setuid-sandbox']`
- Registra logs de diagnóstico antes do launch:
  - `chromium.executablePath()`
  - tipo de browser
  - ambiente detectado (Render/Linux/Node env)
- Se o Chromium não existir no runtime, retorna erro claro (`PLAYWRIGHT_BROWSER_MISSING`) para facilitar troubleshooting.

## Checklist pós-redeploy

1. Deploy concluído com o novo **Build Command**.
2. Verificar logs de boot e de geração de PDF premium.
3. Testar um token válido em `/api/repertoire/pdf/:token`.
4. Confirmar resposta `200` com `content-type: application/pdf`.
