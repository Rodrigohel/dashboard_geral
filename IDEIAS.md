# Ideias para mais pra frente

Backlog de ideias discutidas mas não implementadas — não é compromisso de fazer, só pra não esquecer.

## Problemas conhecidos (pendências a revisitar)

Bugs relatados que ainda não foram fechados de verdade — perguntar ao Rodrigo de vez em
quando se quer atacar algum destes.

- **Exclusão de morador continua dando erro 502**, mesmo equipamento por equipamento, mesmo
  depois de corrigir a instabilidade do túnel Cloudflare (QUIC → HTTP/2, ver histórico do git)
  e a corrida de nonce Digest da Academia. Testado direto no servidor via `localhost:3000`
  (sem passar pela Cloudflare) e funcionou limpo — o relato é de uso real, pela Cloudflare. Pra
  avançar da próxima vez: pedir o print/texto exato do erro na hora que acontecer (não só "deu
  502") e em qual equipamento especificamente, pra comparar com os logs do `cloudflared` e do
  `portal-backend` daquele instante exato.
- **Porteiro da Academia (SS 3532 MF) não salva a foto**, mesmo depois da correção da corrida
  de nonce Digest (#136 — resolveu outros sintomas da Academia, mas não esse). Suspeita ainda
  não confirmada: um teste anterior (com uma imagem de 1 pixel, só pra validar o fluxo) recebeu
  `"Batch Process Error"` do equipamento — pode ser que o formato/tamanho que o Portal manda
  pra `AccessFace.cgi` (ver `biotSetUserPhoto` em `accessControlClient.js`) não seja o que esse
  modelo espera de verdade (essa implementação nunca foi validada contra hardware real antes
  desta sessão). Precisa testar com uma foto de rosto real (não a de 1 pixel) pra confirmar se
  o erro é de formato ou outra coisa.
- **Busca de morador não acha por nome parcial/apelido** — ex.: buscar "Rodri" não encontrou
  um morador cadastrado como "Rodrigo H". Ponto técnico pra quando for investigar: o código
  atual (`GET /search-users` em `accessDevices.js`) já faz `.includes(q)` (substring, não exige
  o nome inteiro) — em teoria "rodri" já deveria bater dentro de "rodrigo h". Não reproduzido
  ainda; primeiro passo da próxima vez é confirmar o termo exato digitado e o nome exato salvo
  no equipamento (podem não ser bem o que parecem — maiúsculo/acento/espaço a mais etc.).

## ~~Notificações push (PWA)~~ — feito (parcial)
Implementado: liga/desliga em Configurações (dono), cada administrador ativa depois no
próprio navegador em "Minha conta". Avisa: porteiro ficou offline (transição, não repete
enquanto continuar caído) e trava de força bruta disparada (com cooldown de 15min por
usuário+IP pra não virar spam). Só manda pra quem tem papel "owner" — mesmo público de
Auditoria/Saúde do servidor. NÃO incluído ainda: "alerta crítico de rede" (viria do painel
de Rede original via gateway, exigiria um poller novo do lado do servidor só pra isso — fica
pra depois se fizer falta). Limitação conhecida: no iPhone só funciona se o usuário instalou
de verdade ("Adicionar à Tela de Início"), Safari não manda push de aba aberta no navegador.

## Modo TV / painel de portaria
Tela cheia, sem menu, rotacionando sozinha entre status de rede/interfone/porteiros — pensada
pra ficar num monitor fixo na guarita/portaria. Mais rápido de fazer que o push, mas é mais
estético que funcional (não abre nenhuma informação nova).

## ~~Detecção de anomalia nos dados já coletados~~ — feito
Implementado: latência de rede fora do padrão (compara contra média + desvio-padrão das
últimas 24h), perdidas do Interfone muito acima da média dos últimos dias, e abertura de
porteiro em horário que aquele equipamento nunca tinha registrado antes (com no mínimo 15
aberturas de histórico pra não acusar anomalia à toa nos primeiros usos).

## Multi-tenant de verdade (SaaS)
Hoje cada instalação do Portal é fechada pra UM cliente (um banco SQLite, uma linha de marca).
Pra virar uma plataforma hospedando vários clientes ao mesmo tempo (um servidor só, N
condomínios/prédios) precisaria de isolamento de dados por cliente em todo canto (tenant_id
nas tabelas, roteamento por subdomínio) — reforma grande, não é "adicionar uma tela".

## ~~XPE 3200 — abrir porta às vezes volta HTML em vez de JSON~~ — feito e confirmado em hardware real
Causa raiz confirmada lendo o manual oficial (Manual_XPE_3200_IP_FACE_01-22_site.pdf, seção
"Controle de Acesso > Relé > Acionar Relé por HTTP", com URL de exemplo real): abrir a porta
nunca fez parte da API JSON (`/api/{target}/{action}`) — é uma URL GET separada, estilo CGI
antigo: `http://IP/fcgi/do?action=OpenDoor&UserName=U&Password=S&DoorNum=1`. A tentativa
anterior ("accessControl"/"openDoor" na API JSON) era só um chute nunca confirmado — por isso
vinha HTML de volta (a API JSON nunca teve esse endpoint). Trocado para a URL confirmada.

Testado com um XPE 3200 real (porteiro "Torre X") — funciona. Pegadinha real encontrada nesse
teste: o usuário/senha do "Acionar Relé por HTTP" é um campo **separado** dentro do
equipamento (Controle de Acesso > Relé), independente do login principal usado pelo resto da
API — se estiverem diferentes, o equipamento responde HTTP 200 normalmente (o Portal mostra
"aberto com sucesso") mas o relé não é acionado de verdade, sem erro nenhum visível. Precisa
que o usuário/senha cadastrados no Portal para aquele equipamento batam com o que está
configurado nesse campo específico do relé (não necessariamente o login de admin do
equipamento). Se algum porteiro tiver uma senha de relé diferente da senha principal, dá pra
adicionar um campo separado no cadastro do Portal pra isso — não implementado ainda por não
ter sido necessário até agora.

## ~~Segplace/Axiom Wifi — integração de portão~~ — feito
Implementado como novo modelo "segplace" em Controle de acesso. A API foi confirmada lendo o
código-fonte real do APK oficial do Segplace (decompilado) — não por captura de tráfego (o
certificate pinning do app bloqueou isso): login via `POST /api/entrar` (Basic auth com a
conta Segplace, devolve cookie de sessão), lista de portões via `GET /api/dispositivos/get`,
abrir via `POST /api/portas/abrir` com `{"id": <id>}`. Não existe IP local — tudo passa pela
nuvem deles (segplace.seekat.com.br), por isso o cadastro pede usuário/senha da conta em vez
de host/porta, com um botão "Buscar portões" pra escolher qual portão da conta cada linha do
Portal representa (uma conta pode ter mais de um). NÃO suporta cadastro de moradores (a API
deles não expõe isso, só abrir/ver status). Testado de ponta a ponta contra um servidor fake
replicando o contrato real — nunca contra a nuvem de verdade (a rede daqui não alcança hosts
de terceiros), então o primeiro teste real acontece no servidor do cliente.

## Feed de reconhecimento facial ao vivo
HIPÓTESE, não confirmada: se a API dos porteiros (XPE3200/SS3532MF) expuser evento de
reconhecimento facial (não só abrir porta), dava pra mostrar um feed tipo "Fulano passou pela
portaria às 14:32" ao vivo no Portal. Precisa descobrir primeiro se o equipamento realmente
expõe esse evento via API — não é garantido.
