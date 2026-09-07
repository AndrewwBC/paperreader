# Paper Vault

Biblioteca de pesquisa com estudos, PDFs, anotações e colaboração.

## Executar localmente

Use Node.js 22.9+ e `npm install`. Copie `.env.example` para `.env`, configure
o SMTP se desejar envio real e execute `npm run dev`. A interface abre em
http://localhost:5173 e a API na porta 3001.



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

## Conta, confirmação de e-mail, recuperação de senha e backup

Em **Gerenciar conta → Backup**, baixe um JSON versionado que inclui todos os
estudos próprios, PDFs e metadados (inclusive anotações) da conta autenticada.
Estudos recebidos por compartilhamento não entram no backup pessoal. Não inclui
senhas nem sessões. A restauração aceita arquivos de até 100 MB, verifica SHA-256
de cada PDF e adiciona novos estudos em uma transação, sem sobrescrever dados.
Importar o mesmo arquivo novamente cria cópias. O JSON guarda PDFs em base64;
o tamanho pode ser maior que a soma dos PDFs. Exportação e importação usam memória.

A tela **Esqueci minha senha** envia um link válido por uma hora. Cada solicitação
invalida o link anterior; a troca revoga todas as sessões e links da conta.
A API nunca retorna o token.

Ao criar uma conta, o usuário recebe um link de confirmação válido por 24 horas,
com uso único. Em **Gerenciar conta**, é possível conferir o estado de verificação
e reenviar a mensagem; o reenvio invalida o link anterior. Alterar o e-mail exige
a senha atual, remove a confirmação e envia um novo link ao endereço atualizado.
Links emitidos para o endereço anterior deixam de funcionar.

Confirmação e recuperação compartilham o mesmo serviço SMTP. Configure estas
variáveis em `.env`, carregado por `npm run dev` e `npm run server` (não publique
esse arquivo nem suas credenciais):

- `APP_URL`: URL pública da aplicação, por exemplo `https://papers.example.org`.
- `SMTP_HOST`, `SMTP_PORT` (587 com STARTTLS ou 465 com TLS).
- `SMTP_USER`, `SMTP_PASSWORD` (ou `SMTP_PASS`), `SMTP_FROM`: credenciais e remetente autorizado.

Sem envio configurado, a recuperação informa indisponibilidade. Erros de entrega
são registrados sem expor tokens. O envio SMTP real depende dessa configuração.

Para testar localmente sem enviar e-mails:

```bash
PAPER_VAULT_MAIL_DIR=/tmp/paper-vault-mail APP_URL=http://localhost:5173 npm run dev
```

Os e-mails ficam em arquivos `.txt` privados dentro de `/tmp/paper-vault-mail`.
Mensagens de confirmação usam `#verify=...`; as de recuperação usam `#reset=...`.
Abra o link do arquivo correspondente ao e-mail solicitado. Esse modo é desativado
em produção. Os arquivos contêm links de acesso e devem ser apagados após o teste.

`npm test` inclui isolamento do backup, restauração, integridade de PDFs, expiração
e uso único de links, revogação de sessões e confirmação de e-mail (incluindo
reenvio autenticado e mudança de endereço). O teste de e-mail usa a porta 3199
e dados temporários; não envia mensagens reais. `npm run test:pdf:browser` verifica
as telas de conta e recuperação no Chrome, além da regressão de PDFs.

## Navegação e tema

Links usam `?study=ID&paper=ID&annotation=ID`, com `tab` para a aba de leitura.
Atualizar a página e usar voltar/avançar preserva o contexto. Os títulos dos papers
e trechos são links que podem ser copiados ou abertos em outra aba. Links privados
continuam exigindo autenticação e acesso ao estudo.

O seletor de tema mantém a preferência no navegador. O tema escuro usa fundo
`#333333`, superfícies neutras e ações púrpura.

Teste a navegação real no Chrome com:

```bash
npm run build
NAVIGATION_BROWSER_TEST=1 node --test tests/navigation-browser.test.mjs
```
