import React, { useState, useEffect } from 'react';

const UPDATE_VERSION_KEY = 'sullyos_update_seen_version';
export const CURRENT_VERSION = 'v2.6.0';

const UPDATE_LOGS = [
    {
        title: '🃏 星镜 · 塔罗占卜',
        desc: '内置完整韦特塔罗 78 张牌库，支持多种经典牌阵（时间之流、凯尔特十字等）。选牌后由大祭司进行深度解读，可持续对话追问。'
    },
    {
        title: '🪐 星轨 · 星盘解读',
        desc: '输入出生信息即可生成个人本命星盘。支持角色星盘查看与双人合盘，命运之神为你解读行星相位与宫位意义。'
    },
    {
        title: '🌙 星历 · 天象仪表盘',
        desc: '实时宇宙天气：月相可视化、行星运行状态、当日天象事件一览。特殊天象（满月/新月/逆行等）自动触发专属塔罗牌阵。'
    },
    {
        title: '👁 阿卡西之影',
        desc: '旧神对话。通过灰烬文字的仪式进入，以角色或自身视角向天王星神谕问答，探索命运深渊。'
    },
    {
        title: '📜 星痕铭刻 & 天机焚卷',
        desc: '每次占卜结束可选择：铭刻记忆，或天机焚卷（天机不可泄露，阅后即焚不留痕迹）。'
    },
    {
        title: '✨ 系统体验升级',
        desc: '全新丝滑的 App 过渡动画与滑动解锁，触控震动反馈遍布全局。朋友圈支持自定义背景，大量界面交互细节与稳定性优化。'
    },
];

interface UpdatePopupProps {
    canShow: boolean; // Control whether it's allowed to show (e.g., after disclaimer)
}

const UpdatePopup: React.FC<UpdatePopupProps> = ({ canShow }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (canShow) {
            try {
                const seenVersion = localStorage.getItem(UPDATE_VERSION_KEY);
                if (seenVersion !== CURRENT_VERSION) {
                    // Delay a tiny bit for smooth transition if needed, avoid stacking animations
                    setTimeout(() => setIsVisible(true), 300);
                }
            } catch (e) {
                setIsVisible(true);
            }
        }
    }, [canShow]);

    const handleClose = () => {
        try {
            localStorage.setItem(UPDATE_VERSION_KEY, CURRENT_VERSION);
        } catch (e) { /* ignore */ }
        setIsVisible(false);
    };

    if (!isVisible || !canShow) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={handleClose} />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
                {/* Header */}
                <div className="pt-7 pb-4 px-6 text-center">
                    <div className="text-4xl mb-3 animate-bounce">🎊</div>
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">发现新版本 {CURRENT_VERSION}</h2>
                    </div>
                    <p className="text-[12px] text-slate-400 mt-1 font-medium">SullyOS 更新日志</p>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 max-h-[55vh] overflow-y-auto no-scrollbar space-y-4">
                    {UPDATE_LOGS.map((log, i) => (
                        <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-1.5">{log.title}</h3>
                            <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
                                {log.desc}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 pb-7 pt-2">
                    <button
                        onClick={handleClose}
                        className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-transform text-sm tracking-wide"
                    >
                        我知道了，不再提示
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdatePopup;
