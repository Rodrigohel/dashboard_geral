import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { useToast } from '../hooks/useToast.jsx';

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
          <strong style={{ color: 'var(--text-primary)' }}>O que cada campo faz hoje:</strong> o botão "Abrir painel"
          na tela Início usa só a <strong>URL pública</strong> — abre o painel original numa aba nova, com o login
          dele mesmo (login único ainda não está pronto pra Rede/Interfone). Já o <strong>endereço interno da API</strong> e
          a <strong>conta de serviço</strong> preparam a integração completa (uma tela só, sem login duplo) — clique em
          "Testar conexão" pra confirmar que essa conta de serviço realmente consegue logar naquele painel.
        </div>
      </div>
    </>
  );
}
