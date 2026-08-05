// ==================== 图片处理模块（基于 base64，无需外部存储）====================

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

    // 文件大小限制（2MB）
    const MAX_SIZE = 2 * 1024 * 1024;
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_SIZE) {
      return { error: '文件大小不能超过 2MB', status: 400 };
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (file.type && !allowedTypes.includes(file.type)) {
      return { error: '不支持的文件类型', status: 400 };
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    return { url: `data:${file.type || 'image/jpeg'};base64,${base64}` };
  } catch (e) {
    console.error('[Image] 上传处理失败:', e);
    return { error: '上传失败', status: 500 };
  }
}

/**
 * 上传图片（封面图等）：base64 直接返回，无需外部存储桶
 */
export async function uploadImage(env, data, prefix) {
  try {
    if (typeof data === 'string' && data.startsWith('data:')) {
      // 已是 base64，原样返回
      return data;
    }
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const binaryStr = Array.from(new Uint8Array(data)).map(b => String.fromCharCode(b)).join('');
      return 'data:application/octet-stream;base64,' + btoa(binaryStr);
    }
    return data; // 无法处理，原样返回
  } catch (e) {
    console.error('[Image] 上传失败:', e);
    return typeof data === 'string' ? data : '';
  }
}
