// ===================== 共享 GLTFLoader / DRACOLoader =====================
// vr.js 和 laser-level.js 共用同一实例，避免重复初始化
import { GLTFLoader } from '../jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from '../jsm/loaders/DRACOLoader.js';

// 使用本地 draco 解码器，离线可用
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./draco/');
dracoLoader.setDecoderConfig({ type: 'js' });

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

export { gltfLoader, dracoLoader };