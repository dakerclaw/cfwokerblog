// ==================== 图片处理模块（基于 base64，无需外部存储）====================
//
// 关于体积限制：D1 单个字符串/BLOB 上限约 2,000,000 字节，base64 会膨胀约 4/3。
// 因此原始文件限制 1MB（编码后约 1.37MB），同时文章正文保存时会再做一次总长度校验，
// 避免「图片单独能存、和正文拼起来就超限」的隐蔽失败。

const MAX_UPLOAD_SIZE = 1 * 1024 * 1024;        // 原始文件 1MB
const MAX_DATA_URI_LENGTH = 1400000;            // data URI 长度上限（约 1.4MB）
const CHUNK_SIZE = 0x8000;                      // 每次转换 32KB，避免超长参数列表

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

/**
 * 分块 base64 编码。
 * 不能用 String.fromCharCode(...bytes)：参数个数受引擎限制（约 6-12 万），
 * 大图片会直接抛 RangeError: Maximum call stack size exceeded。
 */
export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
    const chunk = u8.subarray(i, Math.min(i + CHUNK_SIZE, u8.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

/**
 * 处理文件上传请求（返回 base64 data URI，无需 R2 / 外部存储）
 */
export async function handleUpload(request, env) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return { error: '没有文件', status: 400 };
    }

    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return { error: '不支持的文件类型', status: 400 };
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_SIZE) {
      return { error: '文件大小不能超过 1MB', status: 400 };
    }

    const mime = file.type || 'image/jpeg';
    const url = `data:${mime};base64,${bytesToBase64(arrayBuffer)}`;
    if (url.length > MAX_DATA_URI_LENGTH) {
      return { error: '图片过大，请压缩后再上传（编码后需小于 1.4MB）', status: 400 };
    }
    return { url };
  } catch (e) {
    console.error('[Image] 上传处理失败:', e.message || 'Error');
    return { error: '上传失败', status: 500 };
  }
}

/**
 * 上传图片（封面图等）：base64 直接返回，无需外部存储桶
 */
export async function uploadImage(env, data, prefix) {
  try {
    if (typeof data === 'string' && data.startsWith('data:')) {
      if (data.length > MAX_DATA_URI_LENGTH) return '';
      return data;
    }
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (u8.byteLength > MAX_UPLOAD_SIZE) return '';
      return 'data:application/octet-stream;base64,' + bytesToBase64(u8);
    }
    return data;
  } catch (e) {
    console.error('[Image] 上传失败:', e.message || 'Error');
    return typeof data === 'string' ? data : '';
  }
}

export { MAX_UPLOAD_SIZE, MAX_DATA_URI_LENGTH };
