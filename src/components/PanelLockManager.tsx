"use client";

// PanelLockManager.tsx
// Integrated and updated to use modern wagmi/ethers libraries.
import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import {
  createConfig,
  WagmiConfig,
  useAccount,
  useConnect,
  useDisconnect,
  readContract,
} from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { publicProvider } from 'wagmi/providers/public';
import { http } from 'viem';

// ----- CONFIG -----
const ELECTROGEM_CONTRACT = '0xcff0d88Ed5311bAB09178b6ec19A464100880984' as const;
const ERC721_MIN_BALANCE = 5;
const MAX_LOCK_DAYS = 30;

// wagmi config (modernized)
const config = createConfig({
  autoConnect: true,
  connectors: [new InjectedConnector()],
  publicClient: ({ chain }) => ({
    transport: http(chain.rpcUrls.default.http[0]),
  }),
});

// minimal ERC-721 ABI
const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
] as const;

// ----- TYPES -----
interface PanelLock {
  owner: string;
  contract: string;
  tokenId: string;
  expiresAt: string;
  previewImage: string | null;
  metadata: any | null;
  createdAt: string;
}

// ----- HELPERS -----
function normalizeURI(uri: string | null | undefined): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    return 'https://ipfs.io/ipfs/' + uri.slice(7);
  }
  return uri;
}

function storageKey(panelId: number) { return `panel_lock_${panelId}`; }

function readLock(panelId: number): PanelLock | null {
  try {
    const raw = localStorage.getItem(storageKey(panelId));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.expiresAt && new Date(obj.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(storageKey(panelId));
      return null;
    }
    return obj;
  } catch (e) {
    console.warn('readLock error', e);
    return null;
  }
}

function writeLock(panelId: number, lockObj: PanelLock) {
  localStorage.setItem(storageKey(panelId), JSON.stringify(lockObj));
}

function removeLock(panelId: number) {
  localStorage.removeItem(storageKey(panelId));
}

async function fetchTokenMetadata(contractAddress: string, tokenId: string) {
  try {
    const tokenURI = await readContract(config, {
      address: contractAddress as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });
    if (!tokenURI) return null;
    const url = normalizeURI(tokenURI);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('tokenURI fetch failed', resp.status, resp.statusText);
      return null;
    }
    const json = await resp.json();
    const image = json.image || json.image_url || json.animation_url || json.artwork || null;
    return { metadata: json, image: image ? normalizeURI(image) : null };
  } catch (e) {
    console.warn('fetchTokenMetadata error', e);
    return null;
  }
}

// ----- UI COMPONENTS -----
function Panel({ id, lock, onOpenCog }: { id: number; lock: PanelLock | null; onOpenCog: (id: number) => void; }) {
  return (
    <div style={{
      width: 220, height: 220, background: '#0b1220', borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      border: '1px solid #142133', overflow: 'hidden'
    }}>
      {lock && lock.previewImage ? (
        <img src={lock.previewImage} alt={`${lock.contract}#${lock.tokenId}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 12 }}>
          <div style={{ fontWeight: 700 }}>{lock ? `${lock.contract.slice(0,6)}...#${lock.tokenId}` : 'Empty Panel'}</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>{lock ? `locked until ${new Date(lock.expiresAt).toLocaleString()}` : 'Click cog to set (holders only)'}</div>
        </div>
      )}
      <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', gap: 8 }}>
        {lock && (
          <div style={{ background: 'rgba(2,6,23,0.6)', color: '#fff', padding: '4px 6px', borderRadius: 6, fontSize: 12 }}>
            {lock.owner ? (lock.owner.slice(0,6)+'...') : 'locked'}
          </div>
        )}
      </div>
      <button onClick={() => onOpenCog(id)} title="Configure panel"
        style={{
          position: 'absolute', left: 8, bottom: 8, background: 'rgba(255,255,255,0.04)', color: '#d1d5db',
          border: 'none', padding: '6px 8px', borderRadius: 6, cursor: 'pointer'
        }}>
        ⚙️
      </button>
    </div>
  );
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode; }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems:'center', justifyContent:'center',
      background: 'rgba(2,6,23,0.6)', zIndex: 1000
    }}>
      <div style={{ width: 560, background: '#041026', borderRadius: 8, padding: 16, border: '1px solid #0f1724' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, color: '#fff' }}>Configure Panel</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color:'#9ca3af', cursor:'pointer' }}>✖</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

// ----- MAIN COMPONENT -----
export default function PanelLockManagerWrapper() {
  return (
    <WagmiConfig config={config}>
      <PanelLockManager />
    </WagmiConfig>
  );
}

function PanelLockManager({ initialPanels = 6 }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [panelCount, setPanelCount] = useState(Math.max(1, Math.min(20, initialPanels)));
  const [locks, setLocks] = useState<(PanelLock | null)[]>(() => {
    const arr = [];
    for (let i = 0; i < 20; i++) {
      arr.push(readLock(i));
    }
    return arr;
  });

  const [checkingGate, setCheckingGate] = useState(false);
  const [hasGate, setHasGate] = useState(false);
  const [activePanel, setActivePanel] = useState<number | null>(null);
  const [form, setForm] = useState({ contract: '', tokenId: '', days: 1, previewImage: null as string | null, loadingPreview: false, previewError: null as string | null });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      setCheckingGate(true);
      setHasGate(false);
      try {
        if (!isConnected || !address) return;
        const balance = await readContract(config, {
          address: ELECTROGEM_CONTRACT,
          abi: ERC721_ABI,
          functionName: 'balanceOf',
          args: [address],
        });
        const n = Number(balance);
        if (mounted) setHasGate(n >= ERC721_MIN_BALANCE);
      } catch (e) {
        console.error('Gate check failed', e);
        if (mounted) setHasGate(false);
      } finally {
        if (mounted) setCheckingGate(false);
      }
    }
    check();
    return () => { mounted = false; };
  }, [address, isConnected]);

  function openPanelModal(panelId: number) {
    setActivePanel(panelId);
    const lock = readLock(panelId);
    if (lock) {
      setForm({
        contract: lock.contract || '',
        tokenId: lock.tokenId || '',
        days: Math.ceil((new Date(lock.expiresAt).getTime() - Date.now()) / (24*3600*1000)) || 1,
        previewImage: lock.previewImage || null,
        loadingPreview: false,
        previewError: null
      });
    } else {
      setForm({ contract: '', tokenId: '', days: 1, previewImage: null, loadingPreview: false, previewError: null });
    }
  }

  function closeModal() {
    setActivePanel(null);
    setStatusMsg(null);
  }

  async function onPreviewFetch() {
    setForm(prev => ({ ...prev, loadingPreview: true, previewError: null }));
    try {
      if (!ethers.isAddress(form.contract)) throw new Error('Invalid contract address');
      if (!form.tokenId) throw new Error('Enter token id');
      const meta = await fetchTokenMetadata(form.contract, form.tokenId);
      if (!meta) throw new Error('Metadata not found or CORS prevented fetch');
      setForm(prev => ({ ...prev, previewImage: meta.image || null, loadingPreview: false }));
    } catch (e: any) {
      console.warn('preview fetch failed', e);
      setForm(prev => ({ ...prev, loadingPreview: false, previewError: e.message || 'Preview failed' }));
    }
  }

  async function onSubmitLock(e?: React.FormEvent) {
    e?.preventDefault?.();
    setStatusMsg(null);
    if (!isConnected) { setStatusMsg('Connect your wallet to lock this panel'); return; }
    if (!hasGate) { setStatusMsg(`You must own ${ERC721_MIN_BALANCE}+ Electrogems to lock panels`); return; }
    if (!ethers.isAddress(form.contract)) { setStatusMsg('Invalid contract address'); return; }
    if (!form.tokenId) { setStatusMsg('Invalid token id'); return; }
    const days = Number(form.days) || 1;
    if (days < 1 || days > MAX_LOCK_DAYS) { setStatusMsg(`Days must be 1..${MAX_LOCK_DAYS}`); return; }

    setStatusMsg('Fetching metadata preview...');
    try {
      const meta = await fetchTokenMetadata(form.contract, form.tokenId);
      const previewImage = meta?.image || null;

      const expiresAt = new Date(Date.now() + days * 24*60*60*1000).toISOString();
      const lockObj: PanelLock = {
        owner: address!,
        contract: form.contract,
        tokenId: form.tokenId,
        expiresAt,
        previewImage,
        metadata: meta?.metadata || null,
        createdAt: new Date().toISOString()
      };
      writeLock(activePanel!, lockObj);

      setLocks(prev => {
        const copy = [...prev];
        copy[activePanel!] = lockObj;
        return copy;
      });

      setStatusMsg('Panel locked successfully');
    } catch (err: any) {
      console.error('lock failed', err);
      setStatusMsg('Failed to lock panel: ' + (err.message || err));
    }
  }

  function onRemoveLock(panelId: number) {
    const lock = readLock(panelId);
    if (!lock) return;
    if (lock.owner && lock.owner.toLowerCase() !== (address || '').toLowerCase()) {
      setStatusMsg('Only locker may remove this lock');
      return;
    }
    removeLock(panelId);
    setLocks(prev => {
      const copy = [...prev];
      copy[panelId] = null;
      return copy;
    });
    setStatusMsg('Lock removed');
  }

  useEffect(() => {
    const id = setInterval(() => {
      setLocks(prev => {
        const copy = [...prev];
        let changed = false;
        for (let i = 0; i < copy.length; i++) {
          const rl = readLock(i);
          if (JSON.stringify(copy[i]) !== JSON.stringify(rl)) {
            copy[i] = rl;
            changed = true;
          }
        }
        return changed ? copy : prev;
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const injectedConnector = connectors.find(c => c.id === 'injected');

  return (
    <div style={{ padding: 20, background: '#030617', minHeight: '100vh', color: '#e6eef8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Panel Lock Manager (Electrogem holders)</h2>
          <div style={{ fontSize: 13, color: '#9fb0c8' }}>You must own {ERC721_MIN_BALANCE}+ electrogems to lock a panel</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isConnected ? (
            <button onClick={() => injectedConnector && connect({ connector: injectedConnector })} style={btn}>Connect Wallet</button>
          ) : (
            <>
              <div style={{ fontFamily: 'monospace', background: '#02101a', padding: '6px 10px', borderRadius: 8 }}>{address?.slice(0,6)}...{address?.slice(-4)}</div>
              <button onClick={() => disconnect()} style={btn}>Disconnect</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ color: '#9fb0c8' }}>Panels:</label>
        <input type="number" min={1} max={20} value={panelCount} onChange={e => setPanelCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} style={{ width: 80, padding: 6, borderRadius: 6, background: '#041226', border: '1px solid #0b2540', color: '#cfe7ff' }} />
        <div style={{ color: '#9fb0c8' }}>{checkingGate ? 'Checking gate...' : (hasGate ? '✅ Gate OK' : '❌ Gate not met')}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
        {Array.from({ length: panelCount }).map((_, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Panel id={idx} lock={locks[idx]} onOpenCog={openPanelModal} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {locks[idx] && locks[idx]?.owner?.toLowerCase() === address?.toLowerCase() ? (
                <button onClick={() => onRemoveLock(idx)} style={{ ...btn, background: '#8b1d1d' }}>Remove Lock</button>
              ) : (
                <div style={{ color: '#9fb0c8', fontSize: 12, height: '33px', display: 'flex', alignItems: 'center' }}>{locks[idx] ? `Locked` : 'Unlocked'}</div>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9fb0c8' }}>Panel #{idx + 1}</div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={activePanel !== null} onClose={closeModal}>
        <div>
          <div style={{ marginBottom: 8, color: '#9fb0c8' }}>Panel #{(activePanel ?? -1) + 1}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <form onSubmit={onSubmitLock} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 13 }}>Contract address</label>
              <input placeholder="0x..." value={form.contract} onChange={e => setForm(prev => ({ ...prev, contract: e.target.value }))} style={input} />
              <label style={{ fontSize: 13 }}>Token ID</label>
              <input placeholder="123" value={form.tokenId} onChange={e => setForm(prev => ({ ...prev, tokenId: e.target.value }))} style={input} />
              <label style={{ fontSize: 13 }}>Duration (days, max {MAX_LOCK_DAYS})</label>
              <input type="number" min={1} max={MAX_LOCK_DAYS} value={form.days} onChange={e => setForm(prev => ({ ...prev, days: Number(e.target.value || 1) }))} style={input} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={onPreviewFetch} style={btn}>Preview</button>
                <button type="submit" style={{ ...btn, background: '#059669' }}>Lock Panel</button>
                <button type="button" onClick={closeModal} style={{ ...btn, background: '#0b1220' }}>Close</button>
              </div>
              {form.loadingPreview && <div style={{ color: '#9fb0c8' }}>Loading preview…</div>}
              {form.previewError && <div style={{ color: '#fb7185' }}>{form.previewError}</div>}
              {statusMsg && <div style={{ color: '#a7f3d0' }}>{statusMsg}</div>}
            </form>
            <div style={{ width: 220, minHeight: 220, background: '#06122a', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 13, color: '#9fb0c8', marginBottom: 8 }}>Preview</div>
              {form.previewImage ? (
                <img src={form.previewImage} alt="preview" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 6 }} />
              ) : (
                <div style={{ color: '#9fb0c8', fontSize: 13 }}>No preview yet.<br />Click Preview to fetch token metadata.</div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: '#0b5fff', color: '#fff', padding: '8px 12px',
  borderRadius: 8, border: 'none', cursor: 'pointer'
};
const input: React.CSSProperties = {
  padding: 8, borderRadius: 6, background: '#041226',
  border: '1px solid #0b2540', color: '#dff4ff'
};