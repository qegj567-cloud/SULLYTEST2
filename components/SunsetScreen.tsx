
import React, { useState } from 'react';
import { useOS } from '../context/OSContext';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

type ExportMode = 'text_only' | 'media_only' | 'full';

const EXPORT_OPTIONS: { mode: ExportMode; title: string; desc: string; primary?: boolean }[] = [
    { mode: 'full', title: '完整备份（推荐）', desc: '文字 + 图片媒体，包含全部数据', primary: true },
    { mode: 'text_only', title: '仅导出文字数据', desc: '聊天记录、角色、日记等，不含图片，体积小' },
    { mode: 'media_only', title: '仅导出媒体文件', desc: '头像、背景、相册、表情包等图片资源' },
];

// 救援页样式全部内联，不依赖 Tailwind CDN —— 必须保证在任何网络环境下都能正常显示
const S: Record<string, React.CSSProperties> = {
    root: {
        position: 'fixed', inset: 0, zIndex: 9999, background: '#0f1115', color: '#fff',
        overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
        fontFamily: "'Quicksand', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
    wrap: { minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', boxSizing: 'border-box' },
    card: { width: '100%', maxWidth: 420, background: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 24, boxSizing: 'border-box', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' },
    icon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
    title: { fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 20px' },
    noticeWarn: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 16, padding: 16, fontSize: 13, color: '#fde68a', lineHeight: 1.7, marginBottom: 14 },
    noticeInfo: { background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 16, padding: 16, fontSize: 13, color: '#bae6fd', lineHeight: 1.7, marginBottom: 20 },
    btn: { display: 'block', width: '100%', textAlign: 'left', borderRadius: 16, padding: 16, marginBottom: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', boxSizing: 'border-box' },
    btnPrimary: { background: 'hsl(245, 45%, 60%)', border: '1px solid hsl(245, 45%, 60%)' },
    btnTitle: { fontWeight: 600, fontSize: 14 },
    btnDesc: { fontSize: 12, marginTop: 3, color: 'rgba(255,255,255,0.55)' },
    progressOuter: { height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginTop: 6 },
    progressInner: { height: '100%', background: 'hsl(245, 45%, 60%)', borderRadius: 999, transition: 'width 0.3s' },
    ok: { marginTop: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, padding: 16, fontSize: 13, color: '#a7f3d0', lineHeight: 1.7 },
    err: { marginTop: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 16, fontSize: 13, color: '#fca5a5', lineHeight: 1.7 },
    footer: { marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.8, textAlign: 'center' },
};

const SunsetScreen: React.FC = () => {
    const { exportSystem, sysOperation, isDataLoaded } = useOS();
    const [downloadUrl, setDownloadUrl] = useState('');
    const [downloadName, setDownloadName] = useState('');
    const [doneMsg, setDoneMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const isBusy = sysOperation.status === 'processing';

    const handleExport = async (mode: ExportMode) => {
        if (isBusy) return;
        setErrorMsg('');
        setDoneMsg('');
        try {
            const blob = await exportSystem(mode);
            const fileName = `Sully_Backup_${mode}_${new Date().toISOString().slice(0, 10)}.zip`;

            if (Capacitor.isNativePlatform()) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    try {
                        await Filesystem.writeFile({
                            path: fileName,
                            data: String(reader.result),
                            directory: Directory.Cache,
                        });
                        const uriResult = await Filesystem.getUri({ directory: Directory.Cache, path: fileName });
                        await Share.share({ title: 'Sully Backup', files: [uriResult.uri] });
                        setDoneMsg('备份文件已生成，请通过分享面板保存。');
                    } catch (e) {
                        console.error('Native write failed', e);
                        setErrorMsg('保存文件失败，请重试。');
                    }
                };
            } else {
                if (downloadUrl) URL.revokeObjectURL(downloadUrl);
                const url = URL.createObjectURL(blob);
                setDownloadUrl(url);
                setDownloadName(fileName);

                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setDoneMsg('备份文件已开始下载，请妥善保存。');
            }
        } catch (e: any) {
            console.error('Export failed', e);
            setErrorMsg(e?.message || '导出失败，请重试。');
        }
    };

    return (
        <div style={S.root}>
            <div style={S.wrap}>
                <div style={S.card}>
                    <div style={S.icon}>⚠️</div>
                    <h1 style={S.title}>本站已停止维护</h1>

                    <div style={S.noticeWarn}>
                        你正在访问的是<b>旧版本</b>，该版本已经落后很久并且<b>永久停止维护</b>。
                        为避免数据混乱，这里的所有功能均已停用，本页面<b>仅用于导出你的本地数据</b>。
                    </div>

                    <div style={S.noticeInfo}>
                        新版本已迁移至新链接，<b>新链接的获取地址请参考官方公告</b>。
                        请先在下方导出备份文件并妥善保存，然后前往新版本，在「设置 → 恢复备份」中导入即可无缝迁移。
                    </div>

                    {!isDataLoaded ? (
                        <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)', padding: '24px 0' }}>
                            正在读取本地数据...
                        </div>
                    ) : (
                        <div>
                            {EXPORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.mode}
                                    onClick={() => handleExport(opt.mode)}
                                    disabled={isBusy}
                                    style={{
                                        ...S.btn,
                                        ...(opt.primary ? S.btnPrimary : null),
                                        ...(isBusy ? { opacity: 0.4, pointerEvents: 'none' as const } : null),
                                    }}
                                >
                                    <div style={S.btnTitle}>{opt.title}</div>
                                    <div style={{ ...S.btnDesc, ...(opt.primary ? { color: 'rgba(255,255,255,0.8)' } : null) }}>{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                    )}

                    {isBusy && (
                        <div style={{ marginTop: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                <span>{sysOperation.message || '正在处理...'}</span>
                                <span>{Math.round(sysOperation.progress)}%</span>
                            </div>
                            <div style={S.progressOuter}>
                                <div style={{ ...S.progressInner, width: `${Math.max(sysOperation.progress, 4)}%` }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, textAlign: 'center' }}>
                                数据较多时打包需要一些时间，请不要关闭页面
                            </div>
                        </div>
                    )}

                    {doneMsg && !isBusy && (
                        <div style={S.ok}>
                            <div>✅ {doneMsg}</div>
                            {downloadUrl && (
                                <a href={downloadUrl} download={downloadName} style={{ color: '#6ee7b7', fontSize: 12, textDecoration: 'underline' }}>
                                    没有自动下载？点此手动下载
                                </a>
                            )}
                        </div>
                    )}

                    {errorMsg && !isBusy && (
                        <div style={S.err}>❌ {errorMsg}</div>
                    )}

                    <div style={S.footer}>
                        你的数据只保存在当前浏览器本地。请在清除浏览器数据或卸载浏览器之前完成导出，
                        否则数据将无法找回。可以多次导出不同类型的备份。
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SunsetScreen;
