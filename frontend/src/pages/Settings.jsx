import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';
import { useBranding } from '../hooks/useBranding.js';

const GATEWAYS = [
  {
    key: 'rede',
    title: 'Painel de Rede',
    hint: 'Backend do Debian_dashboard, acessível a partir deste servidor (ex.: http://127.0.0.1:3002).',
  },
  {
    key: 'interfone',
    title: 'Painel de Interfone',
    hint: 'Backend do FreePBX_Asterisk, acessível a partir deste servidor (ex.: http://127.0.0.1:3001).',
  },
];

function GatewayCard({ meta, value, onSave }) {
  const [baseUrl, setBaseUrl] = useState(value?.baseUrl || '');
  const [publicUrl, setPublicUrl] = useState(value?.publicUrl || '');
  const [serviceUsername, setServiceUsername] = useState(value?.serviceUsername || '');
  const [servicePassword, setServicePassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  async function doSave() {
    await onSave(meta.key, { baseUrl, publicUrl, serviceUsername, servicePassword: servicePassword || undefined });
    setServicePassword('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      await doSave();
      toast(`Gateway "${meta.title}" salvo.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Sempre salva antes de testar — testar contra o que já está salvo (e não
  // o que está digitado na tela) confundia: uma senha nova digitada mas
  // ainda não salva fazia o teste "passar" usando a senha antiga.
  async function handleTest() {
    setTesting(true);
    try {
      await doSave();
      await api.settings.testGateway(meta.key);
      toast(`Conexão com "${meta.title}" funcionando — login OK.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  const canTest = baseUrl && serviceUsername;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{meta.title}</div>
          <div className="field-hint">{meta.hint}</div>
        </div>
        {value?.configured ? (
          <span className="badge badge-success">
            <span className="badge-dot" /> configurado
          </span>
        ) : (
          <span className="badge badge-warning">
            <span className="badge-dot" /> pendente
          </span>
        )}
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Endereço interno da API</label>
          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://127.0.0.1:3002" />
        </div>
        <div className="field">
          <label className="field-label">URL pública (link do botão "Abrir painel")</label>
          <input className="input" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder={`https://${meta.key}.seudominio.com`} />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Usuário de serviço</label>
          <input className="input" value={serviceUsername} onChange={(e) => setServiceUsername(e.target.value)} placeholder="portal-service" />
        </div>
        <div className="field">
          <label className="field-label">Senha de serviço</label>
          <input
            className="input"
            type="password"
            value={servicePassword}
            onChange={(e) => setServicePassword(e.target.value)}
            placeholder={value?.configured ? 'deixe em branco para manter' : ''}
          />
        </div>
      </div>
      <span className="field-hint">
        Crie uma conta comum nesse painel (pela tela de Usuários dele) e informe aqui — usuário e senha
        de serviço, separados da sua conta pessoal nele.
      </span>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || saving || !canTest}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar conexão'}
        </button>
      </div>
      {!canTest && <span className="field-hint">Preencha o endereço e o usuário de serviço para poder testar.</span>}
      <span className="field-hint">"Testar conexão" salva os campos preenchidos e tenta logar de verdade — não precisa clicar em "Salvar" antes.</span>
    </div>
  );
}

function BrandingCard() {
  const current = useBranding();
  const [name, setName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [accentColor, setAccentColor] = useState('#8b5cf6');
  const [shortName, setShortName] = useState('');
  const [pwaIconFile, setPwaIconFile] = useState(null);
  const [pwaIconPreviewUrl, setPwaIconPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => setName(current.name), [current.name]);
  useEffect(() => setAccentColor(current.accentColor || '#8b5cf6'), [current.accentColor]);
  useEffect(() => setShortName(current.shortName || ''), [current.shortName]);

  function handleFile(e) {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handlePwaIconFile(e) {
    const file = e.target.files?.[0] || null;
    setPwaIconFile(file);
    setPwaIconPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.branding.save({ name, logoFile, accentColor, shortName, pwaIconFile });
      toast('Marca atualizada.');
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const shownLogo = previewUrl || current.logoUrl;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Marca</div>
        <div className="field-hint">Nome e logo mostrados na tela de login e na barra lateral — troque pela marca do seu cliente.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: shownLogo ? 'none' : 'linear-gradient(135deg, var(--accent-400), var(--accent-600))',
            border: '1px solid var(--border-subtle)',
            color: 'white',
            fontWeight: 800,
            fontSize: 20,
            fontFamily: 'var(--font-display)',
          }}
        >
          {shownLogo ? <img src={shownLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : name.charAt(0).toUpperCase()}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Logo (opcional)</label>
          <input className="input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleFile} />
          <span className="field-hint">PNG, JPG, SVG ou WEBP, até 2MB. Sem logo, mostra a inicial do nome.</span>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Nome do sistema</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal" />
      </div>

      <div className="field">
        <label className="field-label">Cor de destaque (botões, menu ativo)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            style={{ width: 44, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none' }}
          />
          <input className="input" style={{ maxWidth: 140 }} value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAccentColor('#8b5cf6')}>
            Padrão
          </button>
        </div>
        <span className="field-hint">Escolha uma cor que combine com sua logo.</span>
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PWA (Adicionar à tela inicial)</div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Como o Portal aparece quando instalado no celular/PC. O nome e a cor de destaque acima já valem
          pra isso — os dois campos abaixo são só pro ícone/rótulo da instalação.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              flexShrink: 0,
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-hover)',
            }}
          >
            <img
              src={pwaIconPreviewUrl || current.pwaIconUrl || '/icon-mark.svg'}
              alt="Ícone do PWA"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">Ícone do app (opcional)</label>
            <input className="input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handlePwaIconFile} />
            <span className="field-hint">
              Precisa ser QUADRADO (ex.: 512x512) — diferente do logo acima, que pode ter qualquer proporção.
              Sem um ícone próprio, usa o logo (pode ficar cortado/espremido se não for quadrado) e, sem
              nenhum dos dois, um ícone padrão.
            </span>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Nome curto (rótulo embaixo do ícone na tela inicial)</label>
          <input
            className="input"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder={name || 'Portal'}
            maxLength={30}
          />
          <span className="field-hint">Opcional — sem preencher, usa o nome do sistema (cortado se for muito longo).</span>
        </div>
      </div>

      <div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <span className="spinner" /> : 'Salvar marca'}
        </button>
      </div>
    </div>
  );
}

function SecurityCard() {
  const [maxLoginFailures, setMaxLoginFailures] = useState(10);
  const [loginWindowMinutes, setLoginWindowMinutes] = useState(15);
  const [sessionHours, setSessionHours] = useState(8);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getSecurity().then((s) => {
      setMaxLoginFailures(s.maxLoginFailures);
      setLoginWindowMinutes(s.loginWindowMinutes);
      setSessionHours(s.sessionHours);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveSecurity({
        maxLoginFailures: Number(maxLoginFailures),
        loginWindowMinutes: Number(loginWindowMinutes),
        sessionHours: Number(sessionHours),
      });
      toast('Segurança atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Segurança</div>
        <div className="field-hint">Regras de login válidas para todos os usuários do Portal.</div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
      ) : (
        <>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Tentativas de login antes de bloquear</label>
              <input
                className="input"
                type="number"
                min={3}
                max={50}
                value={maxLoginFailures}
                onChange={(e) => setMaxLoginFailures(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Janela de bloqueio (minutos)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={120}
                value={loginWindowMinutes}
                onChange={(e) => setLoginWindowMinutes(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Duração da sessão (horas)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={720}
              value={sessionHours}
              onChange={(e) => setSessionHours(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <span className="field-hint">
              Depois de logar, a sessão expira sozinha após esse tempo. Só vale pra quem logar de novo — quem já
              está logado continua com o prazo antigo até sair e entrar outra vez.
            </span>
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const SENSITIVITY_OPTIONS = [
  { value: 'baixa', label: 'Baixa — só acusa desvios bem grandes' },
  { value: 'media', label: 'Média (padrão)' },
  { value: 'alta', label: 'Alta — acusa desvios menores' },
];

function AnomalyCard() {
  const [redeSensitivity, setRedeSensitivity] = useState('media');
  const [interfoneSensitivity, setInterfoneSensitivity] = useState('media');
  const [acessoSensitivity, setAcessoSensitivity] = useState('media');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getAnomaly().then((s) => {
      setRedeSensitivity(s.redeSensitivity);
      setInterfoneSensitivity(s.interfoneSensitivity);
      setAcessoSensitivity(s.acessoSensitivity);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveAnomaly({ redeSensitivity, interfoneSensitivity, acessoSensitivity });
      toast('Sensibilidade de anomalia atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Sensibilidade de anomalia</div>
        <div className="field-hint">
          Controla quando os avisos de "fora do normal" aparecem em cada módulo (pico de latência na Rede, chamadas
          perdidas em excesso no Interfone, horário incomum de abertura no Acesso).
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 90, borderRadius: 12 }} />
      ) : (
        <>
          <div className="field">
            <label className="field-label">Rede — pico de latência</label>
            <select className="select" value={redeSensitivity} onChange={(e) => setRedeSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Interfone — chamadas perdidas</label>
            <select className="select" value={interfoneSensitivity} onChange={(e) => setInterfoneSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Acesso — horário incomum de abertura</label>
            <select className="select" value={acessoSensitivity} onChange={(e) => setAcessoSensitivity(e.target.value)}>
              {SENSITIVITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="field-hint">
              "Alta" exige menos aberturas registradas antes de começar a avaliar horário incomum — mais rápido pra
              avisar, mas com menos histórico pra confirmar o que é "normal".
            </span>
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RetentionCard() {
  const [auditRetentionDays, setAuditRetentionDays] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getRetention().then((s) => {
      setAuditRetentionDays(s.auditRetentionDays);
      setLoaded(true);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveRetention({ auditRetentionDays: Number(auditRetentionDays) });
      toast('Retenção de auditoria atualizada.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Retenção do log de auditoria</div>
        <div className="field-hint">
          Por quantos dias manter o histórico de logins, aberturas de porteiro (tela Auditoria) e ativações das
          bombas (tela Bombas) antes de apagar sozinho. Use 0 para nunca apagar automaticamente.
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
      ) : (
        <>
          <div className="field">
            <label className="field-label">Dias de retenção (0 = nunca apagar)</label>
            <input
              className="input"
              type="number"
              min={0}
              max={3650}
              value={auditRetentionDays}
              onChange={(e) => setAuditRetentionDays(e.target.value)}
              style={{ maxWidth: 140 }}
            />
          </div>
          <div>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PushSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.settings.getPush().then((s) => {
      setEnabled(s.enabled);
      setLoaded(true);
    });
  }, []);

  async function handleToggle() {
    setSaving(true);
    try {
      const s = await api.settings.savePush({ enabled: !enabled });
      setEnabled(s.enabled);
      toast(s.enabled ? 'Notificações push ativadas.' : 'Notificações push desativadas.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Notificações push</div>
        <div className="field-hint">
          Avisa os administradores (dono) no navegador quando um porteiro fica offline ou a trava de força bruta do
          login dispara. Desligada por padrão — cada administrador ainda precisa ativar em "Minha conta" no próprio
          navegador depois de ligar aqui. No iPhone só funciona se o Portal foi instalado como app (Adicionar à Tela
          de Início); o Safari não entrega push de aba aberta.
        </div>
      </div>

      {!loaded ? (
        <div className="skeleton" style={{ height: 40, borderRadius: 12 }} />
      ) : (
        <div>
          <button className="btn btn-primary" onClick={handleToggle} disabled={saving}>
            {saving ? <span className="spinner" /> : enabled ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      )}
    </div>
  );
}

// Alertas via Telegram (ver IDEIAS.md) — bot que manda mensagem quando um
// alarme da casa de bombas dispara, insistindo (reenviando) nos marcados
// como "prioridade" (ver checkbox em Bombas → Configuração) até alguém
// responder qualquer coisa no chat.
function TelegramSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [resendIntervalSeconds, setResendIntervalSeconds] = useState(1800);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const toast = useToast();

  function load() {
    api.settings.getTelegram().then((s) => {
      setEnabled(s.enabled);
      setHasToken(s.hasToken);
      setChatId(s.chatId);
      setResendIntervalSeconds(s.resendIntervalSeconds);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveTelegram({ enabled, botToken: botToken || undefined, chatId, resendIntervalSeconds: Number(resendIntervalSeconds) });
      setBotToken('');
      toast('Configuração do Telegram salva.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await api.settings.testTelegram({ botToken: botToken || undefined });
      toast(`Token válido — bot @${res.username}.`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegisteringWebhook(true);
    try {
      await api.settings.registerTelegramWebhook(window.location.origin);
      toast('Webhook configurado no Telegram.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRegisteringWebhook(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 200, borderRadius: 20 }} />;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Alertas via Telegram</div>
        <div className="field-hint">
          Manda mensagem num chat do Telegram quando um alarme da casa de bombas dispara. Pra criar o bot: fale com
          @BotFather no Telegram, "/newbot", e copie o token que ele te der. Pra achar o chat ID: mande qualquer
          mensagem pro bot e acesse{' '}
          <code>https://api.telegram.org/bot&lt;SEU_TOKEN&gt;/getUpdates</code> no navegador — o número em
          "chat":"id" é o chat ID.
        </div>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Ativar alertas via Telegram
      </label>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Token do bot</label>
          <input
            className="input"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={hasToken ? 'já salvo — deixe em branco pra manter' : '123456:ABC-...'}
          />
        </div>
        <div className="field">
          <label className="field-label">Chat ID</label>
          <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="ex.: 123456789" />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Insistir (alarmes de prioridade) a cada</label>
        <select className="select" style={{ maxWidth: 220 }} value={resendIntervalSeconds} onChange={(e) => setResendIntervalSeconds(e.target.value)}>
          <option value={300}>5 minutos</option>
          <option value={900}>15 minutos</option>
          <option value={1800}>30 minutos</option>
          <option value={3600}>1 hora</option>
          <option value={7200}>2 horas</option>
        </select>
        <span className="field-hint">Só os sinais marcados como "prioridade" em Bombas → Configuração insistem — os demais mandam uma vez só.</span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || (!botToken && !hasToken)}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar token'}
        </button>
        <button className="btn btn-secondary" onClick={handleRegisterWebhook} disabled={registeringWebhook || !hasToken}>
          {registeringWebhook ? <span className="spinner spinner-dark" /> : 'Configurar resposta no chat'}
        </button>
      </div>
      <span className="field-hint">
        "Configurar resposta no chat" registra no Telegram que respostas no chat (ex.: "já verifiquei") avisam o
        Portal pra parar de insistir — só funciona depois de salvar um token e o Portal estar acessível por HTTPS
        público (ex.: pelo túnel Cloudflare já configurado).
      </span>
    </div>
  );
}

// Prioridade dos alarmes que NÃO têm um checkbox próprio na tela do módulo:
// Bombas/Gerador marcam prioridade sinal por sinal (em Configuração), e
// porteiro marca por equipamento (em Acesso → Equipamentos). Rede/Interfone
// só dão uma contagem de offline (sem lista estável de equipamentos pra
// marcar um por um) e força bruta é um evento de segurança — por isso essas
// três ficam aqui, num lugar só.
function AlarmPrioritiesCard() {
  const [redeOffline, setRedeOffline] = useState(false);
  const [interfoneOffline, setInterfoneOffline] = useState(false);
  const [forcaBruta, setForcaBruta] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function load() {
    api.settings.getTelegramPriorities().then((p) => {
      setRedeOffline(p.redeOffline);
      setInterfoneOffline(p.interfoneOffline);
      setForcaBruta(p.forcaBruta);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveTelegramPriorities({ redeOffline, interfoneOffline, forcaBruta });
      toast('Prioridades salvas.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Prioridade de outros alarmes</div>
        <div className="field-hint">
          Rede/Interfone (contagem de equipamentos offline) e a trava de força bruta — os demais módulos marcam
          prioridade na própria tela (Bombas/Gerador → Configuração, Acesso → Equipamentos).
        </div>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={redeOffline} onChange={(e) => setRedeOffline(e.target.checked)} />
        Rede — insistir enquanto houver equipamento(s) offline
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={interfoneOffline} onChange={(e) => setInterfoneOffline(e.target.checked)} />
        Interfone — insistir enquanto houver ramal(is) offline
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={forcaBruta} onChange={(e) => setForcaBruta(e.target.checked)} />
        Segurança — também ligar por telefone quando a trava de força bruta disparar
      </label>
      <div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// Escalonamento por ligação telefônica (ver IDEIAS.md) — quando um alarme
// marcado como prioridade fica ativo e sem ninguém reconhecer no Telegram
// por tempo demais, liga pros números cadastrados além de insistir por
// mensagem. Preço/provedor ainda não decididos — os campos ficam prontos
// pra quando o Rodrigo criar a conta Twilio (ou escolher outra) e preencher;
// sem uma conta de verdade configurada aqui, nunca chega a ligar.
function TwilioSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [toNumbersText, setToNumbersText] = useState('');
  const [callAfterSeconds, setCallAfterSeconds] = useState(300);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  function load() {
    api.settings.getTwilio().then((s) => {
      setEnabled(s.enabled);
      setHasAuthToken(s.hasAuthToken);
      setAccountSid(s.accountSid);
      setFromNumber(s.fromNumber);
      setToNumbersText(s.toNumbers.join(', '));
      setCallAfterSeconds(s.callAfterSeconds);
      setPublicBaseUrl(s.publicBaseUrl);
      setConfigured(s.configured);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.settings.saveTwilio({
        enabled,
        accountSid,
        authToken: authToken || undefined,
        fromNumber,
        toNumbers: toNumbersText.split(',').map((n) => n.trim()).filter(Boolean),
        callAfterSeconds: Number(callAfterSeconds),
        publicBaseUrl,
      });
      setAuthToken('');
      toast('Configuração do Twilio salva.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await api.settings.testTwilio({ accountSid, authToken: authToken || undefined });
      toast(`Conta válida — ${res.friendlyName || accountSid} (${res.status}).`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Ligação telefônica (Twilio)</div>
        <div className="field-hint">
          Escalonamento de um alarme de prioridade que ninguém reconheceu no Telegram — liga pros números abaixo
          depois do tempo configurado. Precisa de uma conta Twilio (ou similar) de verdade: crie em{' '}
          <code>twilio.com</code>, compre um número e copie Account SID/Auth Token. Ainda não decidimos o provedor
          — cote preço antes (ver IDEIAS.md); sem isso preenchido, esta função fica pronta mas nunca chega a ligar.
        </div>
      </div>

      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Ativar ligação telefônica
      </label>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Account SID</label>
          <input className="input" value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="ACxxxxxxxx..." />
        </div>
        <div className="field">
          <label className="field-label">Auth Token</label>
          <input
            className="input"
            type="password"
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder={hasAuthToken ? 'já salvo — deixe em branco pra manter' : ''}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="field-label">Número de origem (Twilio)</label>
          <input className="input" value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+15550000000" />
        </div>
        <div className="field">
          <label className="field-label">Escalar pra ligação depois de</label>
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={callAfterSeconds}
            onChange={(e) => setCallAfterSeconds(e.target.value)}
          >
            <option value={120}>2 minutos sem reconhecer</option>
            <option value={300}>5 minutos sem reconhecer</option>
            <option value={600}>10 minutos sem reconhecer</option>
            <option value={1800}>30 minutos sem reconhecer</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field-label">Números pra ligar (separados por vírgula)</label>
        <input
          className="input"
          value={toNumbersText}
          onChange={(e) => setToNumbersText(e.target.value)}
          placeholder="+5511999990000, +5511888880000"
        />
        <span className="field-hint">Formato internacional, com +55 e DDD.</span>
      </div>

      <div className="field">
        <label className="field-label">URL pública do Portal</label>
        <input
          className="input"
          value={publicBaseUrl}
          onChange={(e) => setPublicBaseUrl(e.target.value)}
          placeholder="https://portal.seudominio.com.br"
        />
        <span className="field-hint">
          Preenchendo isso, <strong>atender a ligação já conta como reconhecimento</strong> do alarme (igual tocar
          "Visto" no Telegram) — sem precisar fazer mais nada por voz. Sem preencher, a ligação funciona do mesmo
          jeito (fala a mensagem duas vezes e desliga), só que atender não conta como reconhecido.
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Salvar'}
        </button>
        <button className="btn btn-secondary" onClick={handleTest} disabled={testing || (!accountSid && !hasAuthToken)}>
          {testing ? <span className="spinner spinner-dark" /> : 'Testar conta (sem ligar/sem custo)'}
        </button>
      </div>
      {!configured && (
        <span className="field-hint">
          Ainda falta preencher Account SID, Auth Token, número de origem e ao menos um número pra ligar.
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const [gateways, setGateways] = useState(null);

  function reload() {
    api.settings.getGateways().then(setGateways);
  }
  useEffect(reload, []);

  async function handleSaveGateway(key, payload) {
    await api.settings.saveGateway(key, payload);
    reload();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p>Conecte o Portal aos painéis existentes e ajuste as preferências gerais.</p>
        </div>
      </div>

      <BrandingCard />

      <SecurityCard />

      <AnomalyCard />

      <RetentionCard />

      <PushSettingsCard />

      <TelegramSettingsCard />

      <AlarmPrioritiesCard />

      <TwilioSettingsCard />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {gateways === null ? (
          <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
        ) : (
          GATEWAYS.map((g) => <GatewayCard key={g.key} meta={g} value={gateways[g.key]} onSave={handleSaveGateway} />)
        )}
      </div>

      <div className="surface" style={{ padding: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Icon name="key" size={20} style={{ color: 'var(--accent-400)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>O que cada campo faz hoje:</strong> o <strong>Rede</strong>{' '}
          já é nativo do Portal — assim que <strong>endereço interno da API</strong> e{' '}
          <strong>conta de serviço</strong> estiverem configurados e testados, o botão "Abrir painel" mostra as telas
          de monitoramento direto aqui dentro, com o visual do Portal (sem link público nem build separado). Já o{' '}
          <strong>Interfone</strong> ainda funciona como painel embutido: com o servidor tendo o build embutido
          configurado (<code>GATEWAY_*_FRONTEND_DIST</code> no <code>.env</code>) ele abre dentro do Portal; sem isso,
          abre o painel original numa aba nova usando a <strong>URL pública</strong>. Em ambos, "Testar conexão"
          confirma que a conta de serviço realmente consegue logar no painel.
        </div>
      </div>
    </>
  );
}
