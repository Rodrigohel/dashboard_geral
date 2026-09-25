import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import MultiDeviceUserFormModal from './MultiDeviceUserFormModal.jsx';
import { api } from '../../api/client.js';
import { useToast } from '../../hooks/useToast.jsx';

// Agrupa os resultados (um por equipamento) pelo nome da pessoa — não existe
// "usuário compartilhado" entre porteiros de verdade, cada equipamento tem
// seu próprio cadastro independente; agrupar por nome é só pra mostrar "essa
// pessoa está nesses equipamentos aqui" numa lista só.
function groupByName(results) {
  const groups = new Map();
  for (const r of results) {
    const key = (r.user.name || '').trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: r.user.name, entries: [] });
    groups.get(key).entries.push(r);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export default function UserSearch({ devices, onOpenDevice }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null); // { results, errors } | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null); // { device, user } | null
  const [addingFor, setAddingFor] = useState(null); // group | null
  const toast = useToast();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setData(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(() => {
      api.accessDevices
        .searchUsers(q)
        .then((res) => !cancelled && setData(res))
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  async function handleRemoveConfirm() {
    const { device, user } = removing;
    try {
      await api.accessDevices.users.remove(device.id, user.id);
      toast(`"${user.name}" removido de "${device.name}".`);
      setRemoving(null);
      setData((d) => (d ? { ...d, results: d.results.filter((r) => !(r.device.id === device.id && r.user.id === user.id)) } : d));
    } catch (err) {
      toast(`Falha ao remover: ${err.message}`, 'error');
      setRemoving(null);
    }
  }

  const groups = data ? groupByName(data.results) : [];

  return (
    <div className="surface" style={{ padding: 24 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Buscar pessoa em todos os equipamentos</div>
      <p className="field-hint" style={{ marginBottom: 12 }}>
        Digite um nome pra ver em quais porteiros essa pessoa está cadastrada — sem precisar abrir equipamento por equipamento.
      </p>

      <div className="toolbar-search input-with-icon" style={{ maxWidth: 360 }}>
        <Icon name="search" size={16} />
        <input className="input" placeholder="Nome da pessoa..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Digite pelo menos 2 letras.
        </p>
      )}

      {loading && <div className="skeleton" style={{ height: 80, borderRadius: 12, marginTop: 16 }} />}

      {error && (
        <div className="login-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {!loading && data && data.errors.length > 0 && (
        <p className="field-hint" style={{ marginTop: 16, color: 'var(--warning-500)' }}>
          {data.errors.length} equipamento(s) não responderam à busca: {data.errors.map((e) => e.device.name).join(', ')}.
        </p>
      )}

      {!loading && data && query.trim().length >= 2 && groups.length === 0 && (
        <p className="field-hint" style={{ marginTop: 16 }}>
          Nenhuma pessoa encontrada com esse nome.
        </p>
      )}

      {!loading && groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {groups.map((group) => {
            const registeredIds = new Set(group.entries.map((e) => e.device.id));
            const remainingDevices = devices.filter((d) => !registeredIds.has(d.id));
            return (
              <div key={group.name} className="surface" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{group.name}</div>
                  {remainingDevices.length > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setAddingFor(group)}>
                      <Icon name="plus" size={14} /> Liberar em outro equipamento
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.entries.map(({ device, user }) => (
                    <div
                      key={device.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface-hover)',
                      }}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontWeight: 600 }}
                        onClick={() => onOpenDevice?.(device)}
                        title="Abrir esse equipamento"
                      >
                        <Icon name="shieldFace" size={14} /> {device.name}
                        {device.location && <span className="field-hint">({device.location})</span>}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Remover desse equipamento"
                        onClick={() => setRemoving({ device, user })}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Remover usuário"
          message={`Remover "${removing.user.name}" de "${removing.device.name}"? A pessoa perde o acesso por facial/cartão/senha nesse equipamento imediatamente.`}
          confirmLabel="Remover"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={handleRemoveConfirm}
        />
      )}

      {addingFor && (
        <MultiDeviceUserFormModal
          devices={devices.filter((d) => !new Set(addingFor.entries.map((e) => e.device.id)).has(d.id))}
          initialName={addingFor.name}
          onClose={() => setAddingFor(null)}
          onDone={() => {
            toast('Usuário cadastrado.');
            setAddingFor(null);
            setLoading(true);
            api.accessDevices
              .searchUsers(query.trim())
              .then(setData)
              .finally(() => setLoading(false));
          }}
        />
      )}
    </div>
  );
}
