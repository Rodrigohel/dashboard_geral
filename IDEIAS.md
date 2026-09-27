# Ideias para mais pra frente

Backlog de ideias discutidas mas não implementadas — não é compromisso de fazer, só pra não esquecer.

## Notificações push (PWA)
Já dá pra instalar o Portal como app (manifest + service worker já existem). Faltaria gerar
chaves VAPID, um handler de push no service worker, e o usuário aceitar a permissão do
navegador. Avisaria em tempo real: porteiro caiu, alerta crítico de rede, trava de força
bruta disparada. Limitação conhecida: no iPhone só funciona se o usuário instalou de verdade
("Adicionar à Tela de Início"), Safari não manda push de aba aberta no navegador.

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

## Feed de reconhecimento facial ao vivo
HIPÓTESE, não confirmada: se a API dos porteiros (XPE3200/SS3532MF) expuser evento de
reconhecimento facial (não só abrir porta), dava pra mostrar um feed tipo "Fulano passou pela
portaria às 14:32" ao vivo no Portal. Precisa descobrir primeiro se o equipamento realmente
expõe esse evento via API — não é garantido.
