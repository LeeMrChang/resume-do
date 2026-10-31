import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDefaultAppearance,
  createDefaultDocument,
} from '@resume-do/schema';
import { getTemplateSpec } from '@resume-do/templates';
import { api, ApiError, type ResumeResponse, type ResumeSummary, type User } from './api';
import OriginalImportButton from './OriginalImportButton';
import ThemeToggle from './ThemeToggle';

type Tab = 'active' | 'trash';

interface Props {
  user: User;
  onOpen: (resumeId: string) => void;
  onLogout: () => void;
}

const MAX_RESUMES = 5;

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return sameYear
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${time}`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function coverAccent(templateId: string): string {
  try {
    return getTemplateSpec(templateId).accent;
  } catch {
    return '#2c6fbb';
  }
}

function kindLabel(resume: ResumeSummary): string {
  if (resume.kind === 'original') return '原件';
  return resume.source ? '可编辑 · 含原件' : '可编辑';
}

export default function ResumeListPage({ user, onOpen, onLogout }: Props) {
  const [active, setActive] = useState<ResumeSummary[] | null>(null);
  const [trash, setTrash] = useState<ResumeSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [details, setDetails] = useState<Record<string, ResumeResponse>>({});
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const renameCancelled = useRef(false);

  async function refresh() {
    const [current, removed] = await Promise.all([api.listResumes(), api.listResumes(true)]);
    setActive(current);
    setTrash(removed);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [current, removed] = await Promise.all([api.listResumes(), api.listResumes(true)]);
        if (!alive) return;
        setActive(current);
        setTrash(removed);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(err instanceof ApiError ? err.message : '加载简历列表失败，请刷新重试');
        setActive([]);
        setTrash([]);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cards show the real name and role, so the list fetches its (at most five) resumes once.
  useEffect(() => {
    if (!active?.length) return;
    const missing = active.filter((item) => item.kind !== 'original' && !details[item.id]);
    if (!missing.length) return;
    let alive = true;
    void Promise.all(missing.map((item) => api.getResume(item.id).catch(() => null))).then((rows) => {
      if (!alive) return;
      setDetails((previous) => {
        const next = { ...previous };
        rows.forEach((row) => {
          if (row) next[row.id] = row;
        });
        return next;
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const limitReached = (active?.length ?? 0) >= MAX_RESUMES;

  async function createResume() {
    if (creating || limitReached) return;
    setCreating(true);
    setError('');
    try {
      const created = await api.createResume({
        title: '我的简历',
        document: createDefaultDocument(),
        appearance: createDefaultAppearance(),
      });
      onOpen(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '新建失败，请重试');
    } finally {
      setCreating(false);
    }
  }

  async function removeResume(resume: ResumeSummary) {
    if (busyId) return;
    const confirmed = window.confirm(
      `将“${resume.title}”移入回收站？简历内容与原件都会保留 ${30} 天，期间可以恢复。`,
    );
    if (!confirmed) return;
    setBusyId(resume.id);
    setError('');
    try {
      await api.deleteResume(resume.id);
      setDetails((previous) => {
        const next = { ...previous };
        delete next[resume.id];
        return next;
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '删除失败，请重试');
    } finally {
      setBusyId('');
    }
  }

  async function restoreResume(resume: ResumeSummary) {
    if (busyId) return;
    setBusyId(resume.id);
    setError('');
    try {
      await api.restoreResume(resume.id);
      await refresh();
      setTab('active');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '恢复失败，请重试');
    } finally {
      setBusyId('');
    }
  }

  async function purgeResume(resume: ResumeSummary) {
    if (busyId) return;
    const confirmed = window.confirm(
      `彻底删除“${resume.title}”？简历内容与原件将被永久移除，无法恢复。`,
    );
    if (!confirmed) return;
    setBusyId(resume.id);
    setError('');
    try {
      await api.purgeResume(resume.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '彻底删除失败，请重试');
    } finally {
      setBusyId('');
    }
  }

  function startRename(resume: ResumeSummary) {
    renameCancelled.current = false;
    setRenaming({ id: resume.id, value: resume.title });
  }

  async function commitRename(resume: ResumeSummary) {
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setRenaming(null);
      return;
    }
    const value = renaming?.value.trim() ?? '';
    setRenaming(null);
    if (!value || value === resume.title) return;
    setBusyId(resume.id);
    setError('');
    try {
      const saved = await api.renameResume(resume.id, resume.revision, value);
      setActive((previous) =>
        previous?.map((item) =>
          item.id === resume.id ? { ...item, title: saved.title, revision: saved.revision } : item,
        ) ?? previous,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重命名失败，请重试');
    } finally {
      setBusyId('');
    }
  }

  const currentList = tab === 'active' ? active : trash;
  const heading = useMemo(
    () => (tab === 'active' ? '我的简历' : '回收站'),
    [tab],
  );

  return (
    <div className="app-shell list-shell">
      <header className="topbar">
        <div className="logo">
          <span>简</span>Resume Do · 简历工作台
        </div>
        <nav className="list-tabs" aria-label="简历视图">
          <button
            type="button"
            className={tab === 'active' ? 'list-tab selected' : 'list-tab'}
            aria-current={tab === 'active'}
            onClick={() => setTab('active')}
          >
            我的简历{active ? ` ${active.length}` : ''}
          </button>
          <button
            type="button"
            className={tab === 'trash' ? 'list-tab selected' : 'list-tab'}
            aria-current={tab === 'trash'}
            onClick={() => setTab('trash')}
          >
            回收站{trash?.length ? ` ${trash.length}` : ''}
          </button>
        </nav>
        <span className="topbar-spacer" />
        <ThemeToggle />
        <span className="user-chip" title={user.email}>
          {user.displayName || user.email}
        </span>
        <button type="button" onClick={onLogout}>
          退出
        </button>
      </header>

      <main className="list-main">
        <div className="list-head">
          <div>
            <h1>{heading}</h1>
            <p className="list-sub">
              {tab === 'active'
                ? `最多保存 ${MAX_RESUMES} 份简历，编辑内容自动保存。`
                : '回收站保留 30 天，到期后自动彻底删除。'}
            </p>
          </div>
          {tab === 'active' && (
            <div className="list-actions">
              <OriginalImportButton
                beforeUpload={async () => true}
                onCreated={async (resume) => {
                  onOpen(resume.id);
                }}
              />
              <button
                type="button"
                className="primary"
                disabled={creating || limitReached}
                title={limitReached ? `已达 ${MAX_RESUMES} 份上限，请先删除不需要的简历` : '新建空白简历'}
                onClick={() => void createResume()}
              >
                {creating ? '正在创建…' : '＋ 新建简历'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="list-error" role="alert">
            {error}
          </div>
        )}

        {currentList === null ? (
          <div className="list-loading">正在加载…</div>
        ) : currentList.length === 0 ? (
          <div className="list-empty">
            <div className="empty-art" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>{tab === 'active' ? '还没有简历' : '回收站是空的'}</h2>
            <p>
              {tab === 'active'
                ? '新建一份空白简历，或导入 PDF / DOCX，解析后直接进入编辑器。'
                : '移入回收站的简历会显示在这里，30 天内都可以恢复。'}
            </p>
            {tab === 'active' && (
              <button type="button" className="primary" disabled={creating} onClick={() => void createResume()}>
                {creating ? '正在创建…' : '创建第一份简历'}
              </button>
            )}
          </div>
        ) : (
          <ul className="resume-grid">
            {currentList.map((resume) => {
              const detail = details[resume.id];
              const name = detail?.document.basic.name?.trim() || resume.title;
              const role = detail?.document.intent.role?.trim() || '';
              const accent = detail?.appearance.themeColor || coverAccent(resume.templateId);
              const isRenaming = renaming?.id === resume.id;
              return (
                <li className="resume-card" key={resume.id}>
                  <div
                    className={`card-open ${tab === 'trash' ? 'static' : ''}`}
                    role={tab === 'trash' ? undefined : 'button'}
                    tabIndex={tab === 'trash' ? -1 : 0}
                    aria-label={tab === 'trash' ? resume.title : `打开 ${resume.title}`}
                    onClick={() => {
                      if (tab === 'active' && !isRenaming) onOpen(resume.id);
                    }}
                    onKeyDown={(event) => {
                      if (tab !== 'active' || isRenaming) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpen(resume.id);
                      }
                    }}
                  >
                    <span className="card-cover" style={{ ['--cover-accent' as string]: accent }}>
                      <span className="cover-paper">
                        <span className="cover-bar" />
                        <span className="cover-name">{name}</span>
                        {role && <span className="cover-role">{role}</span>}
                        <span className="cover-line" />
                        <span className="cover-line" />
                        <span className="cover-line short" />
                      </span>
                      {resume.kind === 'original' && (
                        <span className="cover-original">PDF 原件</span>
                      )}
                    </span>
                    <span className="card-body">
                      <span className="card-head">
                        {isRenaming ? (
                          <input
                            className="card-rename"
                            value={renaming.value}
                            maxLength={100}
                            autoFocus
                            aria-label="简历名称"
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setRenaming({ id: resume.id, value: event.target.value })}
                            onBlur={() => void commitRename(resume)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void commitRename(resume);
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                renameCancelled.current = true;
                                setRenaming(null);
                              }
                            }}
                          />
                        ) : (
                          <span className="card-title">{resume.title}</span>
                        )}
                        <span className={`card-badge ${resume.kind === 'original' ? 'original' : ''}`}>
                          {kindLabel(resume)}
                        </span>
                      </span>
                      <span className="card-meta">
                        {tab === 'trash'
                          ? `已删除 · ${formatTime(resume.deletedAt ?? resume.updatedAt)}`
                          : `最近编辑 · ${formatTime(resume.updatedAt)}`}
                      </span>
                    </span>
                  </div>
                  <div className="card-actions">
                    {tab === 'active' ? (
                      <>
                        <button type="button" disabled={busyId === resume.id} onClick={() => startRename(resume)}>
                          重命名
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busyId === resume.id}
                          onClick={() => void removeResume(resume)}
                        >
                          删除
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busyId === resume.id}
                          onClick={() => void restoreResume(resume)}
                        >
                          {busyId === resume.id ? '处理中…' : '恢复'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busyId === resume.id}
                          onClick={() => void purgeResume(resume)}
                        >
                          彻底删除
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {tab === 'active' && !limitReached && (
              <li className="resume-card add-card">
                <button type="button" className="card-open" disabled={creating} onClick={() => void createResume()}>
                  <span className="add-art" aria-hidden="true">＋</span>
                  <span className="add-text">新建空白简历</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
