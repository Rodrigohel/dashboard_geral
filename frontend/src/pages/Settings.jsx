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
// Numerinho redondo pra marcar cada passo do assistente — feito o passo,
// vira um check verde que FICA ali depois de recarregar a página (lê do
// que já está salvo no banco), em vez de só um toast que passa e não deixa
// rastro (reclamação de "não aparece nada quando clico").
function StepBadge({ done }) {
  return (
    <span
      className={`badge ${done ? 'badge-success' : 'badge-neutral'}`}
      style={{ width: 22, height: 22, borderRadius: '50%', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      {done ? <Icon name="check" size={13} /> : null}
    </span>
  );
}

function TelegramSettingsCard() {
  const [enabled, setEnabled] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [webhookRegisteredUrl, setWebhookRegisteredUrl] = useState('');
  const [resendIntervalSeconds, setResendIntervalSeconds] = useState(1800);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);
  const [maintenanceMinutes, setMaintenanceMinutes] = useState(60);
  const [resolveDebounceMinutes, setResolveDebounceMinutes] = useState(2);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [waitingChatId, setWaitingChatId] = useState(false);
  const toast = useToast();

  function load() {
    return api.settings.getTelegram().then((s) => {
      setEnabled(s.enabled);
      setHasToken(s.hasToken);
      setChatId(s.chatId);
      setWebhookRegisteredUrl(s.webhookRegisteredUrl);
      setResendIntervalSeconds(s.resendIntervalSeconds);
      setSnoozeMinutes(s.snoozeMinutes);
      setMaintenanceMinutes(s.maintenanceMinutes);
      setResolveDebounceMinutes(s.resolveDebounceMinutes);
      setLoaded(true);
      return s;
    });
  }
  useEffect(load, []);

  // Depois de configurar o webhook, se ainda não tiver chat ID, fica
  // perguntando pro backend de 3 em 3s — assim que a pessoa mandar QUALQUER
  // mensagem pro bot no Telegram, o chat ID aparece sozinho aqui (ver
  // captureChatIdIfMissing no backend), sem precisar copiar nada do
  // getUpdates na mão.
  useEffect(() => {
    if (!waitingChatId) return;
    const id = setInterval(async () => {
      const s = await load();
      if (s.chatId) {
        setWaitingChatId(false);
        toast('Chat ID detectado automaticamente!');
      }
    }, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingChatId]);

  async function handleSaveToken() {
    setSaving(true);
    try {
      await api.settings.saveTelegram({
        enabled,
        botToken: botToken || undefined,
        resendIntervalSeconds: Number(resendIntervalSeconds),
        snoozeMinutes: Number(snoozeMinutes),
        maintenanceMinutes: Number(maintenanceMinutes),
        resolveDebounceMinutes: Number(resolveDebounceMinutes),
      });
      setBotToken('');
      toast('Token salvo.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult('');
    try {
      const res = await api.settings.testTelegram({ botToken: botToken || undefined });
      setTestResult(`✅ Token válido — bot @${res.username}.`);
    } catch (err) {
      setTestResult(`❌ ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegisteringWebhook(true);
    try {
      await api.settings.registerTelegramWebhook(window.location.origin);
      toast('Webhook configurado no Telegram.');
      await load();
      setWaitingChatId(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRegisteringWebhook(false);
    }
  }

  async function handleTrocarChat() {
    setChatId('');
    await api.settings.saveTelegram({ chatId: '' });
    setWaitingChatId(true);
    toast('Mande uma mensagem pro bot no Telegram pra capturar o novo chat.');
  }

  async function handleSaveAtivacao() {
    setSaving(true);
    try {
      await api.settings.saveTelegram({
        enabled,
        resendIntervalSeconds: Number(resendIntervalSeconds),
        snoozeMinutes: Number(snoozeMinutes),
        maintenanceMinutes: Number(maintenanceMinutes),
        resolveDebounceMinutes: Number(resolveDebounceMinutes),
      });
      toast('Configuração salva.');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />;

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Alertas via Telegram</div>
        <div className="field-hint">
          Manda mensagem num chat do Telegram quando um alarme dispara. Siga os passos abaixo, na ordem — cada um
          vira um ✅ depois de feito (fica salvo, não desaparece ao recarregar a página).
        </div>
      </div>

      {/* Passo 1 — token do bot */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StepBadge done={hasToken} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>1. Criar o bot e salvar o token</div>
          <div className="field-hint">
            No Telegram, fale com <strong>@BotFather</strong>, mande <code>/newbot</code> e copie o token que ele der.
          </div>
          <div className="grid-2">
            <input
              className="input"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={hasToken ? 'já salvo — deixe em branco pra manter' : '123456:ABC-...'}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveToken} disabled={saving || (!botToken && hasToken)}>
                {saving ? <span className="spinner" /> : 'Salvar token'}
              </button>
              <button className="btn btn-secondary" onClick={handleTest} disabled={testing || (!botToken && !hasToken)}>
                {testing ? <span className="spinner spinner-dark" /> : 'Testar'}
              </button>
            </div>
          </div>
          {testResult && <span className="field-hint">{testResult}</span>}
        </div>
      </div>

      {/* Passo 2 — webhook */}
      <div style={{ display: 'flex', gap: 12, opacity: hasToken ? 1 : 0.5 }}>
        <StepBadge done={Boolean(webhookRegisteredUrl)} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>2. Ligar o bot ao Portal</div>
          <div className="field-hint">Deixa o Telegram avisar o Portal quando alguém responder uma mensagem.</div>
          <div>
            <button className="btn btn-secondary" onClick={handleRegisterWebhook} disabled={!hasToken || registeringWebhook}>
              {registeringWebhook ? <span className="spinner spinner-dark" /> : webhookRegisteredUrl ? 'Reconfigurar' : 'Configurar'}
            </button>
          </div>
          {webhookRegisteredUrl && <span className="field-hint">✅ Configurado em {webhookRegisteredUrl}</span>}
        </div>
      </div>

      {/* Passo 3 — chat ID (automático) */}
      <div style={{ display: 'flex', gap: 12, opacity: webhookRegisteredUrl ? 1 : 0.5 }}>
        <StepBadge done={Boolean(chatId)} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>3. Achar o chat pra onde mandar os alertas</div>
          {chatId ? (
            <>
              <span className="field-hint">✅ Chat configurado (ID: {chatId}).</span>
              <div>
                <button className="btn btn-ghost btn-sm" onClick={handleTrocarChat}>
                  Trocar de chat/grupo
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="field-hint">
                Abra uma conversa com o bot (ou adicione ele num grupo) e mande <strong>qualquer mensagem</strong> —
                o chat ID é detectado sozinho, sem precisar copiar nada.
              </div>
              {webhookRegisteredUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {waitingChatId ? (
                    <>
                      <span className="spinner spinner-dark" />
                      <span className="field-hint">Esperando sua mensagem no Telegram...</span>
                    </>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setWaitingChatId(true)}>
                      Já mandei, verificar agora
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Passo 4 — ativar */}
      <div style={{ display: 'flex', gap: 12, opacity: chatId ? 1 : 0.5, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
        <StepBadge done={enabled} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>4. Ativar</div>
          <label className="checkbox-row">
            <input type="checkbox" checked={enabled} disabled={!chatId} onChange={(e) => setEnabled(e.target.checked)} />
            Ativar alertas via Telegram
          </label>
          <div className="field">
            <label className="field-label">Insistir (alarmes de prioridade) a cada</label>
            <select className="select" style={{ maxWidth: 220 }} value={resendIntervalSeconds} onChange={(e) => setResendIntervalSeconds(e.target.value)}>
              <option value={300}>5 minutos</option>
              <option value={900}>15 minutos</option>
              <option value={1800}>30 minutos</option>
              <option value={3600}>1 hora</option>
              <option value={7200}>2 horas</option>
            </select>
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">Botão "🔧 Em manutenção" adia por</label>
              <select className="select" value={maintenanceMinutes} onChange={(e) => setMaintenanceMinutes(e.target.value)}>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
                <option value={120}>2 horas</option>
                <option value={240}>4 horas</option>
                <option value={1440}>24 horas</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Botão "🚗 Já estou indo" adia por</label>
              <select className="select" value={snoozeMinutes} onChange={(e) => setSnoozeMinutes(e.target.value)}>
                <option value={5}>5 minutos</option>
                <option value={10}>10 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Confirmar "resolveu sozinho" depois de ficar limpo por</label>
            <select className="select" style={{ maxWidth: 220 }} value={resolveDebounceMinutes} onChange={(e) => setResolveDebounceMinutes(e.target.value)}>
              <option value={1}>1 minuto</option>
              <option value={2}>2 minutos</option>
              <option value={3}>3 minutos</option>
              <option value={5}>5 minutos</option>
              <option value={10}>10 minutos</option>
            </select>
            <span className="field-hint">
              Independente de ter clicado em algum botão: quando o problema some de verdade por esse tempo sem
              voltar, manda uma mensagem avisando ("iniciado em... resolvido em..."). Evita confirmar resolvido numa
              oscilação rápida.
            </span>
          </div>
          <span className="field-hint">
            Cada mensagem de alarme de prioridade vem com três botões: <strong>✅ Resolvido</strong> reconhece de vez
            (só dispara de novo numa próxima falha real); <strong>🔧 Em manutenção</strong> e{' '}
            <strong>🚗 Já estou indo</strong> só adiam, cada um pelo tempo configurado acima — se não resolver até lá,
            a insistência volta sozinha.
          </span>
          <div>
            <button className="btn btn-primary" onClick={handleSaveAtivacao} disabled={saving || !chatId}>
              {saving ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mesmos textos usados no backend (ALARM_LABELS em telegramService.js) —
// só pra não inventar uma segunda redação diferente pro mesmo alarme.
const BOMBAS_ALARM_LABELS = {
  termico1: 'Térmico da bomba 1 desarmado',
  termico2: 'Térmico da bomba 2 desarmado',
  modoManual: 'Modo manual (não automático)',
  emergencia: 'Emergência acionada',
  faltaFase: 'Falta de fase na rede elétrica',
  painelDesligado: 'Painel de bombas desligado',
  falhaBoias: 'Falha nas boias de nível',
};

// Antes, marcar prioridade era espalhado em 4 lugares (Bombas →
// Configuração, Gerador → Configuração, Acesso → cada equipamento,
// Configurações → outra seção) — pedido do Rodrigo pra juntar tudo numa
// lista só, com checkbox direto, sem precisar abrir mais nada. Cada
// checkbox salva na hora (não tem botão "Salvar" geral) — assim um erro
// num módulo não perde a marcação que já deu certo nos outros.
function PrioritiesCard() {
  const [pumpConfig, setPumpConfig] = useState(null);
  const [generatorConfig, setGeneratorConfig] = useState(null);
  const [devices, setDevices] = useState(null);
  const [redeDevices, setRedeDevices] = useState(null); // { supported, devices }
  const [moduleFlags, setModuleFlags] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const toast = useToast();

  function load() {
    setError('');
    return Promise.all([
      api.pumpStation.getConfig(),
      api.generator.getConfig(),
      api.accessDevices.list(),
      api.settings.getTelegramPriorities(),
      api.settings.getExternalDevices('rede'),
    ])
      .then(([pump, gen, devs, flags, rede]) => {
        setPumpConfig(pump);
        setGeneratorConfig(gen);
        setDevices(devs);
        setModuleFlags(flags);
        setRedeDevices(rede);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err.message);
        setLoaded(true);
      });
  }
  useEffect(load, []);

  async function toggleBomba(key, value) {
    setSavingKey(`bomba-${key}`);
    const points = { ...pumpConfig.points, [key]: { ...pumpConfig.points[key], priority: value } };
    try {
      await api.pumpStation.saveConfig({ ...pumpConfig, points });
      setPumpConfig((c) => ({ ...c, points }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleGerador(value) {
    setSavingKey('gerador-falha');
    const points = { ...generatorConfig.points, falha: { ...generatorConfig.points.falha, priority: value } };
    try {
      await api.generator.saveConfig({ ...generatorConfig, points });
      setGeneratorConfig((c) => ({ ...c, points }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleDevice(device, value) {
    setSavingKey(`device-${device.id}`);
    try {
      await api.accessDevices.update(device.id, { telegramPriority: value });
      setDevices((list) => list.map((d) => (d.id === device.id ? { ...d, telegramPriority: value } : d)));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleModuleFlag(key, value) {
    setSavingKey(`modulo-${key}`);
    const next = { ...moduleFlags, [key]: value };
    try {
      await api.settings.saveTelegramPriorities(next);
      setModuleFlags(next);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  async function toggleRedeDevice(device, value) {
    setSavingKey(`rede-${device.id}`);
    try {
      await api.settings.saveExternalDevicePriority('rede', device.id, value);
      setRedeDevices((r) => ({ ...r, devices: r.devices.map((d) => (d.id === device.id ? { ...d, priority: value } : d)) }));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(null);
    }
  }

  if (!loaded) return <div className="skeleton" style={{ height: 360, borderRadius: 20 }} />;
  if (error) {
    return (
      <div className="surface" style={{ padding: 24, borderLeft: '3px solid var(--warning-500)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Prioridade dos alarmes</div>
        <p className="field-hint">Não consegui carregar: {error}</p>
      </div>
    );
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontWeight: 700 }}>Prioridade dos alarmes</div>
        <div className="field-hint">
          Marcado aqui, o alarme <strong>insiste via Telegram</strong> (e liga por telefone, se o Twilio estiver
          configurado) até alguém reconhecer — os demais mandam uma mensagem só. Tudo num lugar só.
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Bombas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(BOMBAS_ALARM_LABELS).map(([key, label]) => (
            <label key={key} className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(pumpConfig.points[key]?.priority)}
                disabled={savingKey === `bomba-${key}`}
                onChange={(e) => toggleBomba(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Gerador</div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(generatorConfig.points.falha?.priority)}
            disabled={savingKey === 'gerador-falha'}
            onChange={(e) => toggleGerador(e.target.checked)}
          />
          Falha ativa
        </label>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Acesso (porteiros/portões)</div>
        {devices.length === 0 ? (
          <span className="field-hint">Nenhum equipamento cadastrado ainda.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {devices.map((d) => (
              <label key={d.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(d.telegramPriority)}
                  disabled={savingKey === `device-${d.id}`}
                  onChange={(e) => toggleDevice(d, e.target.checked)}
                />
                {d.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Rede</div>
        {!redeDevices.supported ? (
          <span className="field-hint">Painel de Rede ainda não suporta marcar equipamento crítico.</span>
        ) : redeDevices.devices.length === 0 ? (
          <span className="field-hint">
            {redeDevices.totalDevices === 0
              ? 'Não consegui ler nenhum equipamento do painel de Rede agora (confira a conexão em Configurações → Integrações).'
              : `Nenhum dos ${redeDevices.totalDevices} equipamento(s) está marcado como crítico lá no painel de Rede — só esses aparecem aqui.`}
          </span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="field-hint" style={{ marginBottom: 2 }}>
              Só aparecem aqui os marcados como crítico no painel de Rede — marque quais desses também insistem via
              Telegram.
            </span>
            {redeDevices.devices.map((d) => (
              <label key={d.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(d.priority)}
                  disabled={savingKey === `rede-${d.id}`}
                  onChange={(e) => toggleRedeDevice(d, e.target.checked)}
                />
                {d.name}
                {d.offline && (
                  <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                    <span className="badge-dot" /> offline
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Interfone / Segurança</div>
        <div className="field-hint" style={{ marginBottom: 4 }}>
          Interfone não terá prioridade por equipamento — fica só o alarme pro módulo inteiro ("N ramal(is)
          offline"), por decisão do Rodrigo.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={moduleFlags.interfoneOffline}
              disabled={savingKey === 'modulo-interfoneOffline'}
              onChange={(e) => toggleModuleFlag('interfoneOffline', e.target.checked)}
            />
            Interfone — ramal(is) offline
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={moduleFlags.forcaBruta}
              disabled={savingKey === 'modulo-forcaBruta'}
              onChange={(e) => toggleModuleFlag('forcaBruta', e.target.checked)}
            />
            Trava de força bruta (login)
          </label>
        </div>
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

// Sonda de rede genérica — IP/porta QUALQUER, pedido do Rodrigo: "não sei se
// pode tirar ele daí, colocar em outro lugar para escanear o IP que eu
// quiser... só pra mim, o administrador". Nasceu presa ao gerador (porta 23
// do ComAp AMF-9) e foi movida pra aqui, generalizada — a tela toda de
// Configurações já é só-dono (ver App.jsx), então não precisa de trava
// extra nesse componente.
// Manuais estáticos (pedido do Rodrigo: "disponibilizar no menu do
// administrador pra download") — arquivos em frontend/public/manuals/,
// servidos direto pelo Portal (mesmo domínio), sem nada sensível neles
// (os links de voz em si são gerados por equipamento em Acesso → 🎙️, não
// aparecem aqui). HTML, não PDF — abre em qualquer navegador; quem quiser
// guardar como PDF pode usar "Imprimir → Salvar como PDF" do navegador.
const MANUALS = [
  { href: '/manuals/google-home.html', label: 'Abrir por voz — Google Home / "Ok Google"', file: 'Manual-Google-Home.html' },
  { href: '/manuals/siri.html', label: 'Abrir por voz — Siri / "Hey Siri"', file: 'Manual-Siri.html' },
];

function ManualsCard() {
  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Manuais</div>
      <div className="field-hint">
        Passo a passo pra configurar abertura por voz (gerar o link pra cada equipamento fica em Controle de acesso →
        ícone 🎙️). Baixa um arquivo HTML — abre em qualquer navegador, e dá pra "Salvar como PDF" na hora de imprimir
        se preferir guardar assim.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {MANUALS.map((m) => (
          <a key={m.href} className="btn btn-secondary btn-sm" href={m.href} download={m.file}>
            <Icon name="download" size={15} /> {m.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// Nome dos mais comuns, só pra tela ficar legível ("80 (HTTP)" em vez de só
// "80") — não é uma lista completa, é cosmético.
const PORT_NAMES = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP', 110: 'POP3', 123: 'NTP',
  143: 'IMAP', 443: 'HTTPS', 502: 'Modbus', 554: 'RTSP', 993: 'IMAPS', 995: 'POP3S', 3389: 'RDP',
  5900: 'VNC', 8080: 'HTTP-alt', 8443: 'HTTPS-alt', 8000: 'HTTP-alt', 9100: 'Impressora (JetDirect)',
};

function NetworkProbeCard() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState(23);
  const [send, setSend] = useState('');
  const [result, setResult] = useState(null);
  const [probing, setProbing] = useState(false);
  const [scanSpec, setScanSpec] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  async function handleProbe() {
    setProbing(true);
    setResult(null);
    try {
      const res = await api.settings.networkProbe({ host, port: Number(port), send });
      setResult(res);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setProbing(false);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await api.settings.portScan({ host, ports: scanSpec || undefined });
      setScanResult(res);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Sonda de rede (diagnóstico)</div>
      <div className="field-hint">
        Abre uma conexão TCP crua em qualquer IP/porta da sua rede, manda um texto opcional e mostra tudo que voltou
        (texto e hexadecimal — se vier binário, o texto fica ilegível, mas o hex sempre dá pra ler). Útil pra
        descobrir o protocolo de um equipamento sem documentação (ex.: porta 23/Telnet de um controlador) antes de
        implementar leitura de verdade.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: 2, minWidth: 160 }}>
          <label className="field-label">IP/host</label>
          <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="ex.: 192.168.1.253" />
        </div>
        <div className="field" style={{ width: 100 }}>
          <label className="field-label">Porta</label>
          <input className="input" type="number" value={port} onChange={(e) => setPort(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 160 }}>
          <label className="field-label">Texto pra mandar (opcional)</label>
          <input className="input" value={send} onChange={(e) => setSend(e.target.value)} placeholder="ex.: STATUS, ou deixe em branco" />
        </div>
        <button type="button" className="btn btn-secondary" onClick={handleProbe} disabled={probing || !host || !port} style={{ alignSelf: 'end' }}>
          {probing ? <span className="spinner spinner-dark" /> : 'Sondar'}
        </button>
      </div>
      {result && (
        <div>
          <div className="field-hint" style={{ marginBottom: 6 }}>{result.bytes} byte(s) recebido(s).</div>
          <label className="field-label">Como texto</label>
          <pre className="surface" style={{ padding: 10, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {result.text || '(nada)'}
          </pre>
          <label className="field-label">Em hexadecimal</label>
          <pre className="surface" style={{ padding: 10, fontSize: 12, overflowX: 'auto', wordBreak: 'break-all' }}>
            {result.hex || '(nada)'}
          </pre>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Varredura de portas</div>
        <div className="field-hint" style={{ marginBottom: 12 }}>
          Só o IP — testa uma lista de portas comuns (ou a que você der) e mostra quais estão abertas, sem precisar
          adivinhar a porta antes. Usa o IP preenchido acima.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label className="field-label">Portas (opcional)</label>
            <input
              className="input"
              value={scanSpec}
              onChange={(e) => setScanSpec(e.target.value)}
              placeholder="em branco = portas comuns (1-1024 + algumas outras); ex.: 1-65535, 8000-8100"
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setScanSpec('1-65535')}
            disabled={scanning}
            style={{ alignSelf: 'end' }}
            title="Preenche a faixa inteira — mais lento, mas não deixa passar nenhuma porta"
          >
            Tudo (1-65535)
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleScan} disabled={scanning || !host} style={{ alignSelf: 'end' }}>
            {scanning ? <span className="spinner spinner-dark" /> : 'Varrer portas'}
          </button>
        </div>
        {scanning && scanSpec === '1-65535' && (
          <span className="field-hint">Varrendo as 65.535 portas — pode levar alguns segundos a mais que o normal.</span>
        )}
        {scanResult && (
          <div style={{ marginTop: 12 }}>
            <div className="field-hint" style={{ marginBottom: 6 }}>
              {scanResult.open.length} porta(s) aberta(s), de {scanResult.scanned} testada(s), em {scanResult.host}.
            </div>
            {scanResult.open.length === 0 ? (
              <span className="field-hint">Nenhuma porta aberta nessa lista.</span>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {scanResult.open.map((p) => (
                  <span key={p} className="badge badge-success">
                    <span className="badge-dot" /> {p}
                    {PORT_NAMES[p] ? ` (${PORT_NAMES[p]})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Antes era um empilhado de 9 cards numa rolagem só — confuso de achar
// onde estava cada coisa. Agrupado em abas por assunto; cada aba só monta
// (e só busca dados) quando é a ativa, então abrir "Geral" não dispara as
// chamadas de Bombas/Gerador/Acesso usadas pela aba de Alertas.
const SETTINGS_TABS = {
  geral: { label: 'Geral' },
  seguranca: { label: 'Segurança' },
  alertas: { label: 'Alertas' },
  integracoes: { label: 'Integrações' },
};

export default function Settings() {
  const [tab, setTab] = useState('geral');
  const [gateways, setGateways] = useState(null);

  function reload() {
    api.settings.getGateways().then(setGateways);
  }
  useEffect(() => {
    if (tab === 'integracoes') reload();
  }, [tab]);

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

      <div className="tabs">
        {Object.entries(SETTINGS_TABS).map(([key, meta]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {meta.label}
          </button>
        ))}
      </div>

      {tab === 'geral' && (
        <>
          <BrandingCard />
          <ManualsCard />
        </>
      )}

      {tab === 'seguranca' && (
        <>
          <SecurityCard />
          <AnomalyCard />
          <RetentionCard />
        </>
      )}

      {tab === 'alertas' && (
        <>
          <PushSettingsCard />
          <TelegramSettingsCard />
          <PrioritiesCard />
          <TwilioSettingsCard />
        </>
      )}

      {tab === 'integracoes' && (
        <>
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

          <NetworkProbeCard />
        </>
      )}
    </>
  );
}
