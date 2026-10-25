// Đồng bộ giao diện local sang thư mục mà dịch vụ Render đang triển khai.
// Chỉ sao chép asset công khai; giữ nguyên backend cloud và dữ liệu máy chủ.
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const names = ['index.html', 'app.js', 'style.css', 'icon.svg', 'manifest.webmanifest', 'sw.js', 'ui-state.js', 'bg.mp4', 'poster.jpg'];
const target = join(root, 'CODE_DEPLOY_RENDER', 'public');
if (!existsSync(target)) throw Error('Không tìm thấy CODE_DEPLOY_RENDER/public');
for (const name of names) {
  const source = join(root, 'public', name);
  const dest = join(target, name);
  copyFileSync(source, dest);
  const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
  if (hash(source) !== hash(dest)) throw Error(`Đồng bộ thất bại: ${name}`);
}
console.log(`Đã đồng bộ và kiểm tra ${names.length} tệp giao diện Render.`);
