import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, WorkForm, forms;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  WorkForm = (await server.ssrLoadModule('/src/pages/departments/WorkForm.tsx')).default;
  forms = await server.ssrLoadModule('../shared/departmentForms.ts');
});
after(async () => {
  await server?.close();
});

function render(fields, options, initial = {}) {
  return renderToStaticMarkup(
    createElement(WorkForm, {
      fields,
      options,
      initial,
      id: 'fixture',
      module: 'workspace',
      label: 'Create',
      onSave: async () => {},
    }),
  );
}

test('Service request starts with the delivered register and hides manual equipment fields', () => {
  const html = render(forms.serviceCreate, { assets: [{ id: 'unit1', productName: 'Freezer' }] });
  assert.match(html, /<select[^>]*id="edit-workspace-assetId"[^>]*required/);
  assert.doesNotMatch(html, /id="edit-workspace-(serial|productName|customerName|phone)"/);
});

test('Large equipment lists retain searchable labels and disambiguate duplicate names', () => {
  const assets = Array.from({ length: 21 }, (_, n) => ({ id: 'unit' + n, productName: 'Freezer' }));
  const html = render(forms.serviceCreate, { assets });
  assert.match(html, /list="edit-workspace-assetId-list"/);
  assert.match(html, /Freezer \(unit20\)/);
});

test('R&D shows the selected product category and keeps optional scheduling choices collapsed', () => {
  const html = render(
    forms.projectCreate,
    { products: [{ id: 'p', name: 'Sensor' }] },
    { productId: 'p', productName: 'Sensor', category: 'Instrumentation' },
  );
  assert.doesNotMatch(html, /id="edit-workspace-productName"/);
  assert.match(html, /Instrumentation/);
  assert.match(html, /<details><summary[^>]*>Project type and priority/);
});
