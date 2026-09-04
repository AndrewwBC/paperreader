# Deploy na Oracle

O workflow `deploy.yml` publica a branch `main` em `paperr.online` usando SSH.
Configure estes secrets no GitHub em **Settings → Secrets and variables → Actions** (de preferência no environment `production`):

- `ORACLE_HOST`: `147.15.23.211`
- `ORACLE_USER`: usuário SSH da instância (por exemplo, `ubuntu` ou `opc`)
- `ORACLE_SSH_KEY`: conteúdo completo da chave privada usada para acessar a instância
- `ORACLE_PORT`: opcional; use `22` se omitido

O usuário precisa ter `sudo` sem senha para criar o serviço systemd e a configuração do nginx. A instância também precisa ter Node.js 22+, npm, nginx e rsync instalados. Abra as portas TCP 80/443 no security list da Oracle e no firewall do sistema.

No DNS, deixe os registros assim:

```text
@      A      147.15.23.211
www    CNAME  paperr.online.
```

Depois que o DNS propagar, o HTTPS pode ser habilitado com Certbot na instância:

```bash
sudo certbot --nginx -d paperr.online -d www.paperr.online
```
