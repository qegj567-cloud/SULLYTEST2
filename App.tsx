
import React from 'react';
import { OSProvider } from './context/OSContext';
import SunsetScreen from './components/SunsetScreen';

// 停服救援模式：不再渲染 PhoneShell，整站只保留「停止维护公告 + 数据导出」。
// OSProvider 仍需保留，导出逻辑（exportSystem）依赖它读取本地 IndexedDB 数据。
// 注意：不要在外层加带 transform 的包裹层（会破坏 SunsetScreen 的 position:fixed）。
const App: React.FC = () => {
  return (
    <OSProvider>
      <SunsetScreen />
    </OSProvider>
  );
};

export default App;
