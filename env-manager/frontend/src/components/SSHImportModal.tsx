import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { secretsApi } from '../api/client'
import { X, Terminal, ChevronRight, Upload } from 'lucide-react'

interface Props {
  projectId: string
  envId: string
  onClose: () => void
}

type Step = 'connect' | 'preview'

const DEFAULT_PORT = 22

export default function SSHImportModal({ projectId, envId, onClose }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('connect')
  const [form, setForm] = useState({
    host: '',
    port: DEFAULT_PORT,
    username: '',
    private_key: '',
    path: '',
  })
  const [fetchError, setFetchError] = useState('')
  const [content, setContent] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: field === 'port' ? Number(e.target.value) : e.target.value }))

  const fetchMutation = useMutation({
    mutationFn: () => secretsApi.sshFetch(projectId, envId, form),
    onSuccess: (res) => {
      setContent(res.data.content)
      setFetchError('')
      setStep('preview')
    },
    onError: (err: any) => {
      setFetchError(err.response?.data?.detail || 'Connection failed')
    },
  })

  const importMutation = useMutation({
    mutationFn: () => secretsApi.importDotenv(projectId, envId, content, overwrite),
    onSuccess: (res) => {
      setImportResult(res.data)
      qc.invalidateQueries({ queryKey: ['secrets', envId] })
    },
    onError: (err: any) => {
      setFetchError(err.response?.data?.detail || 'Import failed')
    },
  })

  const lineCount = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && l.includes('=')).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-brand-600" />
            <h2 className="font-semibold text-lg">Import from Server</h2>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-gray-50 text-sm flex-shrink-0">
          <span className={step === 'connect' ? 'font-semibold text-brand-700' : 'text-gray-400'}>
            1. Connect
          </span>
          <ChevronRight size={14} className="text-gray-300" />
          <span className={step === 'preview' ? 'font-semibold text-brand-700' : 'text-gray-400'}>
            2. Preview &amp; Import
          </span>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {importResult ? (
            <div className="text-center py-6">
              <div className="text-green-600 font-semibold text-lg mb-4">Import complete!</div>
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-6">
                {([['Created', importResult.created, 'text-green-600'], ['Updated', importResult.updated, 'text-blue-600'], ['Skipped', importResult.skipped, 'text-gray-500']] as const).map(([l, v, c]) => (
                  <div key={l} className="card p-3 text-center">
                    <div className={`text-2xl font-bold ${c}`}>{v}</div>
                    <div className="text-xs text-gray-500">{l}</div>
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          ) : step === 'connect' ? (
            <form
              onSubmit={e => { e.preventDefault(); fetchMutation.mutate() }}
              className="space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hostname / IP *</label>
                  <input className="input" required placeholder="10.10.10.50"
                    value={form.host} onChange={set('host')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input className="input" type="number" min={1} max={65535}
                    value={form.port} onChange={set('port')} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input className="input" required placeholder="ubuntu"
                  value={form.username} onChange={set('username')} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SSH Private Key *
                  <span className="font-normal text-gray-400 ml-1">(PEM — RSA, ECDSA or Ed25519)</span>
                </label>
                <textarea
                  className="input font-mono text-xs resize-none"
                  rows={7}
                  required
                  spellCheck={false}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                  value={form.private_key}
                  onChange={set('private_key')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remote file path *</label>
                <input className="input font-mono" required placeholder="/home/ubuntu/myapp/.env"
                  value={form.path} onChange={set('path')} />
              </div>

              {fetchError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{fetchError}</p>
              )}

              <p className="text-xs text-gray-400">
                Credentials are used only for this request and are never stored.
              </p>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={fetchMutation.isPending} className="btn-primary">
                  {fetchMutation.isPending ? 'Connecting…' : 'Fetch File'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Fetched from <code className="bg-gray-100 px-1 rounded text-xs">{form.host}:{form.path}</code>
                  {' — '}<strong>{lineCount}</strong> variable{lineCount !== 1 ? 's' : ''} detected
                </p>
                <button onClick={() => { setStep('connect'); setFetchError('') }}
                  className="text-xs text-brand-600 hover:underline">
                  Change connection
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">File content preview</label>
                <textarea
                  className="input font-mono text-xs resize-none bg-gray-50"
                  rows={12}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  spellCheck={false}
                />
                <p className="text-xs text-gray-400 mt-1">You can edit the content before importing.</p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={overwrite}
                  onChange={e => setOverwrite(e.target.checked)} />
                <span className="text-sm text-gray-700">Overwrite existing keys</span>
              </label>

              {fetchError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg">{fetchError}</p>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="btn-secondary">Cancel</button>
                <button
                  onClick={() => importMutation.mutate()}
                  disabled={!content.trim() || importMutation.isPending}
                  className="btn-primary"
                >
                  <Upload size={15} />
                  {importMutation.isPending ? 'Importing…' : 'Import Secrets'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
