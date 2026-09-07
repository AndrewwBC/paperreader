# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# paperreader

## Verificação de PDFs

Use Node.js 22+ e Ghostscript (`gs`) para executar `npm test` (upload, compactação
com fallback e respostas HTTP). `npm run test:pdf:browser` também compila a aplicação
e testa renderização, zoom, última página e upload pela interface no Chrome.
O Chrome deve estar instalado como `google-chrome`, ou indicado por `CHROME_BIN`.
Os testes usam banco e perfil de navegador temporários, na porta local 3197.
Se `pdfs_errors_producao/` existir, seus PDFs também entram na regressão;
os arquivos não são necessários para os testes sintéticos.

No servidor, Ghostscript é opcional: sem ele, os uploads mantêm os bytes originais.
PDFs acima de 3 MiB são candidatos à compactação, com limite de upload de 20 MiB.
A otimização só é aceita se terminar sem erro, produzir um PDF legível pelo
Ghostscript e reduzir ao menos 10%; caso contrário, mantém-se o original.
Fontes, CMaps e WASM do PDF.js são publicados junto com o build.
