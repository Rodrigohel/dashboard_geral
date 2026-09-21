# Publicar o Portal na internet (sem depender do Tailscale)

## O que isso resolve

Hoje você acessa o Portal pelo Tailscale — uma rede privada que só funciona
para quem tem o Tailscale instalado (você). Para dar acesso a um **cliente
externo**, sem precisar instalar nada na máquina dele, você expõe **só o
Portal** na internet através de um **Cloudflare Tunnel**, com um endereço
público do tipo:

```
https://portal.seudominio.com.br
```

O cliente abre esse link no navegador normal dele, cai direto na **tela de
login do Portal**, e enxerga só os módulos que você liberou para a conta
dele (Rede, Interfone, Controle de acesso — o que for).

**Importante:** só o Portal fica exposto assim. Os painéis de Rede e
Interfone continuam só na rede local — o Portal é quem fala com eles por
trás (gateway), o cliente nunca acessa esses dois diretamente.

---

## Pré-requisitos

- Um **domínio próprio** (comprado em qualquer registrador — Registro.br,
  GoDaddy, Namecheap, etc.). Pode ser um domínio que você já tenha, usando
  um subdomínio (ex.: `portal.suaempresa.com.br`).
- Uma conta **gratuita** na Cloudflare ([cloudflare.com](https://cloudflare.com)).
- O domínio **adicionado à Cloudflare** — ao criar a conta e adicionar o
  domínio, a própria Cloudflare mostra os *nameservers* que você precisa
  trocar no seu registrador (é o único passo fora do servidor).
- Acesso SSH ao servidor (`central-interfone`) com `sudo`.

---

## Passo 1 — Instalar o `cloudflared` no servidor

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

## Passo 2 — Autenticar com sua conta Cloudflare

```bash
cloudflared tunnel login
```

Isso mostra um link — abre no navegador, faz login na Cloudflare e escolhe
o domínio que você adicionou. Volta pro terminal quando terminar.

## Passo 3 — Criar o túnel

```bash
cloudflared tunnel create portal
```

Guarda o **ID do túnel** (um UUID) que aparece na saída — vai precisar dele
no próximo passo. Isso também cria um arquivo de credenciais em
`~/.cloudflared/<ID-DO-TUNEL>.json`.

## Passo 4 — Apontar o DNS para o túnel

```bash
cloudflared tunnel route dns portal portal.seudominio.com.br
```

(troca `portal.seudominio.com.br` pelo endereço que você quer usar de
verdade — pode ser qualquer subdomínio do seu domínio)

## Passo 5 — Configurar o que o túnel deve servir

Cria o arquivo `~/.cloudflared/config.yml`:

```yaml
tunnel: <ID-DO-TUNEL>
credentials-file: /root/.cloudflared/<ID-DO-TUNEL>.json

ingress:
  - hostname: portal.seudominio.com.br
    service: http://localhost:3000
  - service: http_status:404
```

A porta `3000` é a porta do Portal (a mesma escolhida ao rodar
`install.sh`) — ajusta se você usou outra. A última linha
(`http_status:404`) é obrigatória no formato do Cloudflare: qualquer
requisição que não bata com um hostname configurado cai nela.

## Passo 6 — Rodar o túnel como serviço (fica no ar sempre, mesmo após reiniciar o servidor)

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

## Passo 7 — Testar

Abre `https://portal.seudominio.com.br` de qualquer lugar — celular com
dados móveis, computador de outra rede, etc. (sem Tailscale, sem VPN). Deve
aparecer a tela de login do Portal normalmente.

---

## Segurança — pontos importantes

- **Nunca** crie um túnel/DNS apontando direto para o painel de Rede
  (porta 3002) ou Interfone (porta 3001) — eles devem continuar acessíveis
  só dentro da rede local. Só o Portal (porta do `install.sh`) deve ter
  hostname público.
- Considere ativar o **Cloudflare Access** (gratuito até um certo número de
  usuários) na frente do hostname do Portal — uma camada extra de
  verificação (ex.: login por e-mail com código) antes até de chegar na
  tela de login do Portal. Opcional: o Portal já tem login e permissões
  próprios.
- Cada cliente/morador que for acessar deve ter **seu próprio usuário** no
  Portal (tela **Usuários**), com só os módulos e equipamentos que ele deve
  enxergar — nunca compartilhe o login de administrador.

## Comandos úteis para o dia a dia

```bash
sudo systemctl status cloudflared     # o túnel está rodando?
journalctl -u cloudflared -f          # acompanhar logs do túnel em tempo real
cloudflared tunnel list               # listar túneis já criados
cloudflared tunnel info portal        # detalhes do túnel "portal"
```

## Se algo der errado

- **Página não carrega / erro 502 na Cloudflare**: o Portal não está
  rodando ou está numa porta diferente da configurada no `config.yml`.
  Confira com `systemctl status portal-backend` e a porta em
  `/opt/portal/backend/.env` (`PORT=`).
- **DNS não resolve**: pode levar alguns minutos para propagar depois do
  Passo 4. Confira em [dnschecker.org](https://dnschecker.org) se o
  registro CNAME já apareceu.
- **`cloudflared` não inicia**: rode `journalctl -u cloudflared -n 50` para
  ver o erro exato e confira se o `config.yml` está com o ID do túnel e o
  caminho do arquivo de credenciais corretos.
