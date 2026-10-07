'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

export default function LabsPage() {
  const [tab, setTab] = useState<'abtests' | 'content' | 'emails'>('content');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Content state
  const [contents, setContents] = useState<any[]>([]);
  const [genType, setGenType] = useState('AD_COPY');
  const [genPrompt, setGenPrompt] = useState('');
  const [genProduct, setGenProduct] = useState('');

  // AB tests
  const [tests, setTests] = useState<any[]>([]);

  // Emails
  const [emails, setEmails] = useState<any[]>([]);
  const [emailName, setEmailName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'content') {
        const r = await api.getContent();
        setContents(r.data.content);
      } else if (tab === 'abtests') {
        const r = await api.getABTests();
        setTests(r.data.tests);
      } else {
        const r = await api.getEmails();
        setEmails(r.data.emails);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]);

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setLoading(true);
    try {
      await api.generateContent({ type: genType, prompt: genPrompt, productName: genProduct || undefined });
      setGenPrompt('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmail = async () => {
    if (!emailName.trim() || !emailSubject.trim() || !emailBody.trim()) return;
    setLoading(true);
    try {
      await api.createEmail({ name: emailName, subject: emailSubject, body: emailBody });
      setEmailName(''); setEmailSubject(''); setEmailBody('');
      await load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Labs — A/B Tests, AI Content & Emails</h1>

      <div className="flex gap-2">
        {(['content', 'abtests', 'emails'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {t === 'content' ? 'AI Content' : t === 'abtests' ? 'A/B Tests' : 'Emails'}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {tab === 'content' && (
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold mb-3">Generate with AI</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <select value={genType} onChange={(e) => setGenType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                <option value="AD_COPY">Ad Copy</option>
                <option value="PRODUCT_DESCRIPTION">Product Description</option>
                <option value="EMAIL_SUBJECT">Email Subjects</option>
                <option value="EMAIL_BODY">Email Body</option>
                <option value="SOCIAL_POST">Social Post</option>
              </select>
              <input value={genProduct} onChange={(e) => setGenProduct(e.target.value)} placeholder="Product name (optional)" className="px-3 py-2 border rounded-lg text-sm" />
              <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="Brief / prompt..." className="px-3 py-2 border rounded-lg text-sm" />
            </div>
            <Button onClick={handleGenerate} isLoading={loading} disabled={!genPrompt.trim()}>Generate</Button>
          </Card>
          {contents.map((c) => (
            <Card key={c.id}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 rounded">{c.type}</span>
                <span className="text-xs text-gray-400">{c.model} · {new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-600 mb-1">Prompt: {c.prompt}</p>
              <pre className="text-sm bg-gray-50 p-3 rounded-lg whitespace-pre-wrap max-h-48 overflow-auto">{c.content}</pre>
            </Card>
          ))}
          {contents.length === 0 && !loading && <p className="text-gray-400 text-sm">No content yet — generate your first one above.</p>}
        </div>
      )}

      {tab === 'abtests' && (
        <div className="space-y-4">
          {tests.map((t) => (
            <Card key={t.id}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-gray-500">{t.status} · split {t.trafficSplit}% · {t.ads?.length || 0} ads</p>
                  {t.notes && <p className="text-sm text-green-700 mt-1">{t.notes}</p>}
                </div>
                {t.status === 'RUNNING' && (
                  <Button size="sm" onClick={async () => { await api.completeABTest(t.id); load(); }}>Complete</Button>
                )}
              </div>
            </Card>
          ))}
          {tests.length === 0 && !loading && <p className="text-gray-400 text-sm">No A/B tests yet. Create one via MCP or API.</p>}
        </div>
      )}

      {tab === 'emails' && (
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold mb-3">New Email Campaign</h2>
            <div className="space-y-3">
              <input value={emailName} onChange={(e) => setEmailName(e.target.value)} placeholder="Campaign name" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Subject" className="w-full px-3 py-2 border rounded-lg text-sm" />
              <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Body..." rows={3} className="w-full px-3 py-2 border rounded-lg text-sm" />
              <Button onClick={handleCreateEmail} isLoading={loading} disabled={!emailName.trim() || !emailSubject.trim() || !emailBody.trim()}>Create</Button>
            </div>
          </Card>
          {emails.map((e) => (
            <Card key={e.id}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{e.name}</h3>
                  <p className="text-sm text-gray-500">{e.subject} · {e.status}</p>
                </div>
                {e.status === 'DRAFT' && (
                  <Button size="sm" onClick={async () => { await api.sendEmail(e.id); load(); }}>Send</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
